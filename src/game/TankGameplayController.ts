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
  tankBody: PhysicsBody;
  tankCamera: Camera | null;
}

export class TankGameplayController {
  private readonly scene: Scene;
  private readonly config: TankControllerConfig;
  private readonly tankAnchor: TransformNode;
  private readonly tankBody: PhysicsBody;
  private readonly tankCamera: Camera | null;
  private readonly input: TankInput;
  private readonly turretControl: BoneControl;
  private readonly cannonControl: BoneControl;
  private readonly movementForwardAxis: Vector3;
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

  public constructor(options: TankGameplayControllerOptions) {
    this.scene = options.scene;
    this.config = options.config;
    this.tankAnchor = options.tankAnchor;
    this.tankBody = options.tankBody;
    this.tankCamera = options.tankCamera;
    this.input = new TankInput(options.canvas);
    this.turretControl = resolveBoneControl(options.tankContainer, "tourelle");
    this.cannonControl = resolveBoneControl(options.tankContainer, "canon");
    this.movementForwardAxis = axisFromConfig(
      options.config.rig.movementForwardAxis,
      options.config.rig.movementForwardSign
    );
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
    const isMoving = canMove && moveAxis !== 0;
    const currentLinearVelocity = this.tankBody.getLinearVelocity();
    const targetAngularVelocity = canMove
      ? new Vector3(0, toRadians(turnAxis * this.config.movement.hullTurnSpeedDeg), 0)
      : Vector3.Zero();
    this.tankBody.setAngularVelocity(targetAngularVelocity);

    this.boostActive = false;
    let horizontalVelocity = Vector3.Zero();
    if (isMoving) {
      const canBoost = boostHeld && this.overcharge > 0;
      const speedMultiplier = canBoost ? this.config.movement.boostMultiplier : 1;
      const forward = this.tankAnchor.getDirection(this.movementForwardAxis);
      forward.y = 0;
      if (forward.lengthSquared() > 1e-6) {
        forward.normalize();
      }
      horizontalVelocity = forward.scale(moveAxis * this.config.movement.moveSpeed * speedMultiplier);

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

    this.tankBody.setLinearVelocity(
      new Vector3(horizontalVelocity.x, currentLinearVelocity.y, horizontalVelocity.z)
    );
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

function toRadians(valueInDegrees: number): number {
  return (valueInDegrees * Math.PI) / 180;
}

function axisFromConfig(axisName: "x" | "y" | "z", sign: 1 | -1): Vector3 {
  const axis =
    axisName === "x" ? Axis.X.clone() : axisName === "y" ? Axis.Y.clone() : Axis.Z.clone();

  return axis.scale(sign);
}
