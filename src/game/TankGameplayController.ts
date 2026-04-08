import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Axis, Space } from "@babylonjs/core/Maths/math.axis";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Bone } from "@babylonjs/core/Bones/bone";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { Scene } from "@babylonjs/core/scene";
import type { TankControllerConfig } from "../config/tankController";
import { TankInput, type WeaponType } from "./TankInput";

interface BoneControl {
  bone: Bone | null;
  transformNode: TransformNode | null;
}

export interface TankGameplayDebugState {
  battery: number;
  overcharge: number;
  boostActive: boolean;
  zoomActive: boolean;
  activeWeapon: WeaponType;
  shellReserveAmmo: number;
  shellChambered: boolean;
  fireHeld: boolean;
  position: Vector3;
}

export interface TankGameplayControllerOptions {
  scene: Scene;
  canvas: HTMLCanvasElement;
  config: TankControllerConfig;
  tankContainer: AssetContainer;
  tankAnchor: TransformNode;
  tankVisualRoot: TransformNode | null;
  groundingInfo: {
    baseClearance: number;
    frontLeft: Vector3;
    frontRight: Vector3;
    rearLeft: Vector3;
    rearRight: Vector3;
  };
  tankBody: PhysicsBody;
  tankCamera: Camera | null;
}

export class TankGameplayController {
  private readonly scene: Scene;
  private readonly config: TankControllerConfig;
  private readonly tankAnchor: TransformNode;
  private readonly tankVisualRoot: TransformNode | null;
  private readonly groundingInfo: TankGameplayControllerOptions["groundingInfo"];
  private readonly tankBody: PhysicsBody;
  private readonly tankCamera: Camera | null;
  private readonly input: TankInput;
  private readonly turretControl: BoneControl;
  private readonly cannonControl: BoneControl;
  private readonly movementForwardAxis: Vector3;
  private readonly movementInputSign: 1 | -1;
  private readonly turretYawAxis: Vector3;
  private readonly cannonPitchAxis: Vector3;

  private battery: number;
  private overcharge: number;
  private activeWeapon: WeaponType = "shell";
  private boostActive = false;
  private zoomActive = false;
  private fireHeld = false;
  private shellReserveAmmo: number;
  private shellChambered: boolean;

  private targetTurretYawDeg = 0;
  private currentTurretYawDeg = 0;
  private targetCannonPitchDeg = 0;
  private currentCannonPitchDeg = 0;
  private smoothedMoveAxis = 0;
  private hullYawRadians = 0;
  private verticalVelocity = 0;
  private readonly planarVelocity = Vector3.Zero();
  private readonly smoothedGroundNormal = Axis.Y.clone();

  public constructor(options: TankGameplayControllerOptions) {
    this.scene = options.scene;
    this.config = options.config;
    this.tankAnchor = options.tankAnchor;
    this.tankVisualRoot = options.tankVisualRoot;
    this.groundingInfo = options.groundingInfo;
    this.tankBody = options.tankBody;
    this.tankCamera = options.tankCamera;
    this.input = new TankInput(options.canvas);
    this.turretControl = resolveBoneControl(options.tankContainer, "tourelle");
    this.cannonControl = resolveBoneControl(options.tankContainer, "canon");
    this.movementForwardAxis = axisFromConfig(
      options.config.rig.movementForwardAxis,
      options.config.rig.movementForwardSign
    );
    this.movementInputSign = options.config.rig.movementInputSign;
    this.turretYawAxis = axisFromConfig(
      options.config.rig.turretYawAxis,
      options.config.rig.turretYawSign
    );
    this.cannonPitchAxis = axisFromConfig(
      options.config.rig.cannonPitchAxis,
      options.config.rig.cannonPitchSign
    );

    this.battery = options.config.energy.startingBattery;
    this.overcharge = options.config.energy.startingOvercharge;
    this.shellReserveAmmo = options.config.weapons.shell.startingReserveAmmo;
    this.shellChambered = options.config.weapons.shell.startsChambered;

    if (!this.tankAnchor.rotationQuaternion) {
      this.tankAnchor.rotationQuaternion = Quaternion.Identity();
    }

    if (this.tankVisualRoot && !this.tankVisualRoot.rotationQuaternion) {
      this.tankVisualRoot.rotationQuaternion = Quaternion.Identity();
    }

    const initialForward = this.tankAnchor.getDirection(this.movementForwardAxis);
    initialForward.y = 0;
    if (initialForward.lengthSquared() > 1e-6) {
      initialForward.normalize();
      this.hullYawRadians = Math.atan2(initialForward.x, initialForward.z);
    }

    this.scene.onBeforeRenderObservable.add(this.update);
  }

  public getDebugState(): TankGameplayDebugState {
    return {
      battery: this.battery,
      overcharge: this.overcharge,
      boostActive: this.boostActive,
      zoomActive: this.zoomActive,
      activeWeapon: this.activeWeapon,
      shellReserveAmmo: this.shellReserveAmmo,
      shellChambered: this.shellChambered,
      fireHeld: this.fireHeld,
      position: this.tankBody.getObjectCenterWorld()
    };
  }

  public dispose(): void {
    this.scene.onBeforeRenderObservable.removeCallback(this.update);
    this.input.dispose();
  }

  private readonly update = (): void => {
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    if (dt <= 0) {
      return;
    }

    const frame = this.input.consumeFrame();
    this.activeWeapon = frame.selectedWeapon;
    this.fireHeld = frame.fireHeld;

    this.applyTurretAndCannon(frame.lookDeltaX, frame.lookDeltaY, dt);
    this.applyMovement(frame.moveAxis, frame.turnAxis, frame.boostHeld, dt);
    this.applyVisualSmoothing(dt);
    this.applyCamera(frame.zoomHeld);
  };

  private applyTurretAndCannon(lookDeltaX: number, lookDeltaY: number, dt: number): void {
    this.targetTurretYawDeg += lookDeltaX * this.config.turret.mouseSensitivityDegPerPixel;
    this.targetCannonPitchDeg = clamp(
      this.targetCannonPitchDeg - lookDeltaY * this.config.cannon.mouseSensitivityDegPerPixel,
      this.config.cannon.minPitchDeg,
      this.config.cannon.maxPitchDeg
    );

    const turretNextYawDeg = moveTowardsAngle(
      this.currentTurretYawDeg,
      this.targetTurretYawDeg,
      this.config.turret.yawSpeedDeg * dt
    );
    const turretStepRad = toRadians(turretNextYawDeg - this.currentTurretYawDeg);
    this.currentTurretYawDeg = turretNextYawDeg;

    if (Math.abs(turretStepRad) > 0) {
      rotateControl(this.turretControl, this.turretYawAxis, turretStepRad, this.tankAnchor);
    }

    const cannonNextPitchDeg = moveTowards(
      this.currentCannonPitchDeg,
      this.targetCannonPitchDeg,
      this.config.cannon.pitchSpeedDeg * dt
    );
    const cannonStepRad = toRadians(cannonNextPitchDeg - this.currentCannonPitchDeg);
    this.currentCannonPitchDeg = cannonNextPitchDeg;

    if (Math.abs(cannonStepRad) > 0) {
      rotateControl(this.cannonControl, this.cannonPitchAxis, cannonStepRad, this.tankAnchor);
    }
  }

  private applyMovement(moveAxis: number, turnAxis: number, boostHeld: boolean, dt: number): void {
    const canMove = this.battery > 0;
    const desiredMoveAxis = canMove ? moveAxis * this.movementInputSign : 0;
    const inputRate =
      Math.abs(desiredMoveAxis) > Math.abs(this.smoothedMoveAxis)
        ? this.config.movement.inputRiseRate
        : this.config.movement.inputFallRate;
    this.smoothedMoveAxis = moveTowards(this.smoothedMoveAxis, desiredMoveAxis, inputRate * dt);
    const isMoving = canMove && Math.abs(this.smoothedMoveAxis) > 0.001;

    this.boostActive = false;
    if (canMove) {
      this.hullYawRadians += toRadians(turnAxis * this.config.movement.hullTurnSpeedDeg) * dt;
    }

    const forward = forwardFromYaw(this.hullYawRadians);
    const yawRotation = Quaternion.FromLookDirectionRH(forward, Axis.Y);

    let desiredForwardSpeed = 0;

    if (isMoving) {
      const canBoost = boostHeld && this.overcharge > 0;
      const speedMultiplier = canBoost ? this.config.movement.boostMultiplier : 1;
      desiredForwardSpeed = this.smoothedMoveAxis * this.config.movement.moveSpeed * speedMultiplier;

      this.battery = clamp(
        this.battery - this.config.energy.batteryDrainMovingPerSecond * dt,
        0,
        this.config.energy.batteryMax
      );

      if (canBoost) {
        this.overcharge = clamp(
          this.overcharge - this.config.energy.overchargeDrainBoostPerSecond * dt,
          0,
          this.config.energy.overchargeMax
        );
        this.boostActive = this.overcharge > 0;
      }
    }

    const acceleration = isMoving
      ? this.config.movement.acceleration
      : this.config.movement.brakeDeceleration;
    const targetPlanarVelocity = forward.scale(desiredForwardSpeed);
    const nextPlanarVelocity = moveTowardsVector(
      this.planarVelocity,
      targetPlanarVelocity,
      acceleration * dt
    );
    this.planarVelocity.copyFrom(nextPlanarVelocity);
    if (!isMoving && this.planarVelocity.lengthSquared() < 1e-4) {
      this.planarVelocity.setAll(0);
    }

    const predictedPosition = this.tankAnchor.position.add(this.planarVelocity.scale(dt));
    const groundedState = this.sampleGround(predictedPosition, yawRotation);
    const targetPosition = predictedPosition.clone();
    let targetRotation = yawRotation;

    if (groundedState) {
      const normalLerp = 1 - Math.exp(-this.config.grounding.visualTiltSharpness * dt);
      this.smoothedGroundNormal.copyFrom(
        blendNormalizedDirections(this.smoothedGroundNormal, groundedState.normal, normalLerp)
      );

      const groundedForward = rejectOnNormal(forward, this.smoothedGroundNormal);
      if (groundedForward.lengthSquared() > 1e-6) {
        groundedForward.normalize();
        targetRotation = Quaternion.FromLookDirectionRH(groundedForward, this.smoothedGroundNormal);
      }

      const snapLerp = 1 - Math.exp(-this.config.grounding.groundSnapSpeed * dt);
      targetPosition.y = lerp(this.tankAnchor.position.y, groundedState.anchorY, snapLerp);
      this.verticalVelocity = 0;
    } else {
      this.verticalVelocity += -9.81 * dt;
      targetPosition.y = this.tankAnchor.position.y + this.verticalVelocity * dt;
    }

    this.tankBody.setTargetTransform(targetPosition, targetRotation);
  }

  private applyCamera(zoomHeld: boolean): void {
    if (!this.tankCamera) {
      return;
    }

    this.zoomActive = zoomHeld;
    let fovMultiplier = 1;

    if (zoomHeld) {
      fovMultiplier *= this.config.camera.zoomFovMultiplier;
    }

    if (this.boostActive) {
      fovMultiplier *= this.config.camera.boostFovMultiplier;
    }

    this.tankCamera.fov = toRadians(this.config.camera.defaultFovDeg) * fovMultiplier;
  }

  private applyVisualSmoothing(dt: number): void {
    if (!this.tankVisualRoot || !this.tankAnchor.absoluteRotationQuaternion) {
      return;
    }

    this.tankVisualRoot.rotationQuaternion ??= Quaternion.Identity();
    this.tankVisualRoot.rotationQuaternion.copyFromFloats(0, 0, 0, 1);
    const positionLerp = 1 - Math.exp(-this.config.grounding.positionSharpness * dt);
    const nextLocalPosition = Vector3.Lerp(this.tankVisualRoot.position, Vector3.Zero(), positionLerp);
    this.tankVisualRoot.position.copyFrom(nextLocalPosition);
  }

  private sampleGround(position: Vector3, yawRotation: Quaternion): {
    normal: Vector3;
    anchorY: number;
  } | null {
    const physicsEngine = this.scene.getPhysicsEngine();
    if (!physicsEngine) {
      return null;
    }

    const sampleOffsets = {
      frontLeft: this.groundingInfo.frontLeft.applyRotationQuaternion(yawRotation),
      frontRight: this.groundingInfo.frontRight.applyRotationQuaternion(yawRotation),
      rearLeft: this.groundingInfo.rearLeft.applyRotationQuaternion(yawRotation),
      rearRight: this.groundingInfo.rearRight.applyRotationQuaternion(yawRotation)
    };
    const minNormalY = Math.cos(toRadians(this.config.grounding.maxGroundSlopeDeg));
    const rayStartHeight = this.config.grounding.probeStartHeight;
    const rayLength = this.config.grounding.probeStartHeight + this.config.grounding.probeLength;
    const hits = {
      frontLeft: sampleGroundPoint(
        physicsEngine,
        this.tankBody,
        position,
        sampleOffsets.frontLeft,
        rayStartHeight,
        rayLength,
        minNormalY
      ),
      frontRight: sampleGroundPoint(
        physicsEngine,
        this.tankBody,
        position,
        sampleOffsets.frontRight,
        rayStartHeight,
        rayLength,
        minNormalY
      ),
      rearLeft: sampleGroundPoint(
        physicsEngine,
        this.tankBody,
        position,
        sampleOffsets.rearLeft,
        rayStartHeight,
        rayLength,
        minNormalY
      ),
      rearRight: sampleGroundPoint(
        physicsEngine,
        this.tankBody,
        position,
        sampleOffsets.rearRight,
        rayStartHeight,
        rayLength,
        minNormalY
      )
    };
    const hitEntries = Object.values(hits).filter((entry): entry is GroundHit => entry !== null);
    if (hitEntries.length < 3) {
      return null;
    }

    const anchorYCandidates: number[] = [];
    const groundClearance = this.config.grounding.groundClearance;
    if (hits.frontLeft) {
      anchorYCandidates.push(hits.frontLeft.point.y - sampleOffsets.frontLeft.y + groundClearance);
    }
    if (hits.frontRight) {
      anchorYCandidates.push(hits.frontRight.point.y - sampleOffsets.frontRight.y + groundClearance);
    }
    if (hits.rearLeft) {
      anchorYCandidates.push(hits.rearLeft.point.y - sampleOffsets.rearLeft.y + groundClearance);
    }
    if (hits.rearRight) {
      anchorYCandidates.push(hits.rearRight.point.y - sampleOffsets.rearRight.y + groundClearance);
    }

    let groundNormal = hitEntries
      .reduce((sum, entry) => sum.add(entry.normal), Vector3.Zero())
      .scale(1 / hitEntries.length);

    if (hits.frontLeft && hits.frontRight && hits.rearLeft && hits.rearRight) {
      const frontMid = hits.frontLeft.point.add(hits.frontRight.point).scale(0.5);
      const rearMid = hits.rearLeft.point.add(hits.rearRight.point).scale(0.5);
      const leftMid = hits.frontLeft.point.add(hits.rearLeft.point).scale(0.5);
      const rightMid = hits.frontRight.point.add(hits.rearRight.point).scale(0.5);
      groundNormal = Vector3.Cross(rightMid.subtract(leftMid), frontMid.subtract(rearMid));
      if (groundNormal.y < 0) {
        groundNormal.scaleInPlace(-1);
      }
    }

    if (groundNormal.lengthSquared() <= 1e-6) {
      return null;
    }

    groundNormal.normalize();
    return {
      normal: groundNormal,
      anchorY:
        anchorYCandidates.reduce((sum, value) => sum + value, 0) /
        Math.max(anchorYCandidates.length, 1)
    };
  }
}

interface GroundHit {
  point: Vector3;
  normal: Vector3;
}

function resolveBoneControl(container: AssetContainer, boneName: string): BoneControl {
  const bone =
    container.skeletons.flatMap((skeleton) => skeleton.bones).find((candidate) => candidate.name === boneName) ??
    null;

  return {
    bone,
    transformNode: bone?.getTransformNode() ?? null
  };
}

function rotateControl(
  control: BoneControl,
  axis: Vector3,
  amountRad: number,
  tankAnchor: TransformNode
): void {
  if (control.transformNode) {
    control.transformNode.rotate(axis, amountRad, Space.LOCAL);
    return;
  }

  if (control.bone) {
    control.bone.rotate(axis, amountRad, Space.LOCAL, tankAnchor);
  }
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

function moveTowardsVector(current: Vector3, target: Vector3, maxDelta: number): Vector3 {
  const delta = target.subtract(current);
  const distance = delta.length();
  if (distance <= maxDelta || distance <= 1e-6) {
    return target.clone();
  }

  return current.add(delta.scale(maxDelta / distance));
}

function sampleGroundPoint(
  physicsEngine: NonNullable<ReturnType<Scene["getPhysicsEngine"]>>,
  tankBody: PhysicsBody,
  position: Vector3,
  offset: Vector3,
  rayStartHeight: number,
  rayLength: number,
  minNormalY: number
): GroundHit | null {
  const rayFrom = position.add(offset).add(Axis.Y.scale(rayStartHeight));
  const rayTo = rayFrom.add(Axis.Y.scale(-rayLength));
  const hit = physicsEngine.raycast(rayFrom, rayTo, {
    ignoreBody: tankBody,
    shouldHitTriggers: false
  });
  if (!hit.hasHit || hit.hitNormalWorld.y < minNormalY) {
    return null;
  }

  return {
    point: hit.hitPointWorld.clone(),
    normal: hit.hitNormalWorld.clone()
  };
}

function forwardFromYaw(yawRadians: number): Vector3 {
  return new Vector3(Math.sin(yawRadians), 0, Math.cos(yawRadians));
}

function rejectOnNormal(vector: Vector3, normal: Vector3): Vector3 {
  return vector.subtract(normal.scale(Vector3.Dot(vector, normal)));
}

function blendNormalizedDirections(from: Vector3, to: Vector3, amount: number): Vector3 {
  const blended = Vector3.Lerp(from, to, amount);
  if (blended.lengthSquared() <= 1e-6) {
    return Axis.Y.clone();
  }

  blended.normalize();
  return blended;
}

function moveTowardsAngle(current: number, target: number, maxDelta: number): number {
  const delta = repeat(target - current + 180, 360) - 180;
  if (Math.abs(delta) <= maxDelta) {
    return current + delta;
  }

  return current + Math.sign(delta) * maxDelta;
}

function repeat(value: number, length: number): number {
  return value - Math.floor(value / length) * length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function toRadians(valueInDegrees: number): number {
  return (valueInDegrees * Math.PI) / 180;
}

function axisFromConfig(axisName: "x" | "y" | "z", sign: 1 | -1): Vector3 {
  const axis =
    axisName === "x" ? Axis.X.clone() : axisName === "y" ? Axis.Y.clone() : Axis.Z.clone();

  return axis.scale(sign);
}
