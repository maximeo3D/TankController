import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Axis, Space } from "@babylonjs/core/Maths/math.axis";
import "@babylonjs/core/Culling/ray";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeSphere, type PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
// (raycast query type removed; using inline object literals)
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Bone } from "@babylonjs/core/Bones/bone";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
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

import type { PhysicsViewer } from "@babylonjs/core/Debug/physicsViewer";

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
  suspensionInfo: {
    points: Vector3[];
  };
  tankBody: PhysicsBody;
  tankCamera: Camera | null;
  reticleCameraMesh: Mesh | null;
  reticleBarrelMesh: Mesh | null;
  muzzleNode: TransformNode | AbstractMesh | null;
  ammoShellMesh: Mesh | null;
  ammoBulletMesh: Mesh | null;
  physicsViewer?: PhysicsViewer;
}

export class TankGameplayController {
  private readonly scene: Scene;
  private readonly config: TankControllerConfig;
  private readonly tankAnchor: TransformNode;
  private readonly tankVisualRoot: TransformNode | null;
  // groundingInfo kept in options for backward compatibility, but unused in dynamic suspension mode.
  private readonly suspensionPointsLocal: Vector3[];
  private readonly tankBody: PhysicsBody;
  private readonly tankCamera: Camera | null;
  private readonly input: TankInput;
  private readonly turretControl: BoneControl;
  private readonly cannonControl: BoneControl;
  private readonly turretBaseLocalRotation: Quaternion;
  private readonly cannonBaseLocalRotation: Quaternion;
  private readonly reticleCameraMesh: Mesh | null;
  private readonly reticleBarrelMesh: Mesh | null;
  private readonly muzzleNode: TransformNode | AbstractMesh | null;
  private readonly ammoShellMesh: Mesh | null;
  private readonly ammoBulletMesh: Mesh | null;
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

  private shellReloadTimer = 0;
  private bulletCooldownTimer = 0;
  private activeProjectiles: { mesh: Mesh; body: PhysicsBody; shape: PhysicsShape; age: number; debugMesh?: AbstractMesh | null }[] = [];
  private physicsViewer?: PhysicsViewer;

  public constructor(options: TankGameplayControllerOptions) {
    this.scene = options.scene;
    this.config = options.config;
    this.tankAnchor = options.tankAnchor;
    this.tankVisualRoot = options.tankVisualRoot;
    void options.groundingInfo;
    this.suspensionPointsLocal = options.suspensionInfo.points.map((p) => p.clone());
    this.tankBody = options.tankBody;
    this.tankCamera = options.tankCamera;
    this.reticleCameraMesh = options.reticleCameraMesh;
    this.reticleBarrelMesh = options.reticleBarrelMesh;
    this.muzzleNode = options.muzzleNode;
    this.ammoShellMesh = options.ammoShellMesh;
    this.ammoBulletMesh = options.ammoBulletMesh;
    this.physicsViewer = options.physicsViewer;
    this.input = new TankInput(options.canvas);
    this.turretControl = resolveBoneControl(options.tankContainer, "tourelle");
    this.cannonControl = resolveBoneControl(options.tankContainer, "canon");
    this.turretBaseLocalRotation = getControlLocalRotation(this.turretControl, this.tankAnchor);
    this.cannonBaseLocalRotation = getControlLocalRotation(this.cannonControl, this.tankAnchor);
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

    for (const proj of this.activeProjectiles) {
      proj.body.dispose();
      proj.shape.dispose();
      proj.mesh.dispose();
    }
  }

  private readonly update = (): void => {
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    if (dt <= 0) {
      return;
    }

    const frame = this.input.consumeFrame();
    this.activeWeapon = frame.selectedWeapon;
    this.fireHeld = frame.fireHeld;

    this.applyTurretAndCannon(frame.pointerX, frame.pointerY, dt);
    this.applyMovement(frame.moveAxis, frame.turnAxis, frame.boostHeld, dt);
    this.applyVisualSmoothing(dt);
    this.applyCamera(frame.zoomHeld);
    this.updateWeapons(dt);
    this.updateProjectiles(dt);
  };

  private updateWeapons(dt: number): void {
    // Bullet cooldown
    if (this.bulletCooldownTimer > 0) {
      this.bulletCooldownTimer -= dt;
    }

    // Shell reload
    if (!this.shellChambered && this.shellReserveAmmo > 0) {
      this.shellReloadTimer -= dt;
      if (this.shellReloadTimer <= 0) {
        this.shellChambered = true;
        this.shellReserveAmmo--;
      }
    }

    // Firing
    if (this.fireHeld && this.battery > 0) {
      if (this.activeWeapon === "shell" && this.shellChambered) {
        this.fireShell();
      } else if (this.activeWeapon === "bullet" && this.bulletCooldownTimer <= 0) {
        this.fireBullet();
      }
    }
  }

  private fireShell(): void {
    this.shellChambered = false;
    this.shellReloadTimer = this.config.weapons.shell.reloadSeconds;
    this.spawnProjectile(this.ammoShellMesh, this.config.weapons.shell, 0.4);
  }

  private fireBullet(): void {
    this.bulletCooldownTimer = 1.0 / this.config.weapons.bullet.shotsPerSecond;
    this.spawnProjectile(this.ammoBulletMesh, this.config.weapons.bullet, 0.1);
  }

  private spawnProjectile(
    baseMesh: Mesh | null,
    weaponConfig: { muzzleVelocity: number; gravityMultiplier: number },
    radius: number
  ): void {
    if (!baseMesh || !this.muzzleNode) {
      return;
    }

    const mesh = baseMesh.clone("projectile", null);
    if (!mesh) return;

    mesh.isVisible = true;
    mesh.position.copyFrom(this.muzzleNode.getAbsolutePosition());

    // Calculate forward direction towards the reticle
    let forward = Vector3.Zero();
    if (this.reticleBarrelMesh) {
      forward = this.reticleBarrelMesh.position.subtract(mesh.position);
    }
    
    // Fallback if reticle is too close or missing
    if (forward.lengthSquared() < 1e-6) {
      forward = this.muzzleNode.getDirection(this.movementForwardAxis).scale(-this.config.rig.movementForwardSign);
    } else {
      forward.normalize();
    }

    // Rotate the projectile to face its flight direction
    mesh.rotationQuaternion = Quaternion.FromLookDirectionRH(forward, Axis.Y);

    const velocity = forward.scale(weaponConfig.muzzleVelocity);

    const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, this.scene);
    
    // Adjust radius based on the mesh's scaling (in case the GLB is scaled x10)
    const scale = mesh.absoluteScaling.x || 1;
    const shape = new PhysicsShapeSphere(Vector3.Zero(), radius / scale, this.scene);
    
    // Projectiles belong to group 4, and collide with everything EXCEPT the tank (group 2) and other projectiles (group 4)
    shape.filterMembershipMask = 4;
    shape.filterCollideMask = ~(2 | 4);

    body.shape = shape;
    body.setMassProperties({ mass: 1 });
    body.setGravityFactor(weaponConfig.gravityMultiplier);
    body.setLinearVelocity(velocity);

    let debugMesh: AbstractMesh | null | undefined = null;
    if (this.physicsViewer) {
      debugMesh = this.physicsViewer.showBody(body);
    }

    this.activeProjectiles.push({ mesh, body, shape, age: 0, debugMesh });
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const proj = this.activeProjectiles[i];
      proj.age += dt;

      // Despawn after 5 seconds
      if (proj.age > 5.0) {
        if (this.physicsViewer && proj.debugMesh) {
          // PhysicsViewer automatically cleans up debug meshes when the body is disposed,
          // but we can also hide it explicitly if needed.
        }
        proj.body.dispose();
        proj.shape.dispose();
        proj.mesh.dispose();
        this.activeProjectiles.splice(i, 1);
      }
    }
  }

  private applyTurretAndCannon(pointerX: number, pointerY: number, dt: number): void {
    const camera = this.tankCamera ?? this.scene.activeCamera;
    if (!camera) {
      return;
    }

    const ray = this.scene.createPickingRay(pointerX, pointerY, Matrix.Identity(), camera);
    let targetPoint: Vector3 | null = null;

    const pickResult = this.scene.pickWithRay(ray, (mesh) => {
      // Only hit terrain meshes or ground
      return mesh.name.startsWith("SM_") || mesh.name.startsWith("DM_") || mesh.name.toLowerCase().includes("ground");
    });

    if (pickResult?.hit && pickResult.pickedPoint) {
      targetPoint = pickResult.pickedPoint;
    } else {
      // Intersect with horizontal plane at tank's height
      const plane = Plane.FromPositionAndNormal(this.tankAnchor.position, Axis.Y);
      const distance = ray.intersectsPlane(plane);
      if (distance !== null && distance > 0) {
        targetPoint = ray.origin.add(ray.direction.scale(distance));
      } else {
        // Looking at the sky or parallel to the ground
        targetPoint = ray.origin.add(ray.direction.scale(1000));
      }
    }

    if (targetPoint) {
      // Limit the distance of the target point from the tank to 1 meter
      // (Note: The game uses a x10 scale, you can increase this value if 1.0 feels too short)
      const tankPos = this.tankAnchor.getAbsolutePosition();
      const offset = targetPoint.subtract(tankPos);
      const maxDistance = 10.0;
      if (offset.length() > maxDistance) {
        offset.normalize().scaleInPlace(maxDistance);
        targetPoint = tankPos.add(offset);
      }

      this.updateReticle(this.reticleCameraMesh, camera, targetPoint, 0.01);
      this.updateBarrelReticle(camera, 0.01);

      // Transform target point to tank's local space
      const invHullMatrix = this.tankAnchor.getWorldMatrix().clone().invert();
      const localTarget = Vector3.TransformCoordinates(targetPoint, invHullMatrix);

      // Calculate desired yaw in tank space (XZ plane)
      // Math.atan2(x, z) means 0 is forward (+z), PI/2 is right (+x)
      // Negating x and z to flip the turret 180 degrees
      let desiredYawRad = Math.atan2(-localTarget.x, -localTarget.z);
      this.targetTurretYawDeg = (desiredYawRad * 180) / Math.PI * this.config.rig.turretYawSign;

      // For pitch, calculate distance from cannon pivot to target
      let cannonLocalPos = Vector3.Zero();
      if (this.cannonControl.transformNode) {
        const cannonWorldPos = this.cannonControl.transformNode.getAbsolutePosition();
        cannonLocalPos = Vector3.TransformCoordinates(cannonWorldPos, invHullMatrix);
      } else if (this.cannonControl.bone) {
        const cannonWorldPos = this.cannonControl.bone.getAbsolutePosition(this.tankAnchor);
        cannonLocalPos = Vector3.TransformCoordinates(cannonWorldPos, invHullMatrix);
      }

      const dx = localTarget.x - cannonLocalPos.x;
      const dz = localTarget.z - cannonLocalPos.z;
      const distHorizFromCannon = Math.sqrt(dx * dx + dz * dz);
      const heightFromCannon = localTarget.y - cannonLocalPos.y;

      let desiredPitchRad = Math.atan2(heightFromCannon, distHorizFromCannon);
      
      // Apply sign and clamp
      this.targetCannonPitchDeg = clamp(
        ((desiredPitchRad * 180) / Math.PI) * this.config.rig.cannonPitchSign,
        this.config.cannon.minPitchDeg,
        this.config.cannon.maxPitchDeg
      );
    }

    const turretNextYawDeg = moveTowardsAngle(
      this.currentTurretYawDeg,
      this.targetTurretYawDeg,
      this.config.turret.yawSpeedDeg * dt
    );
    const turretStepRad = toRadians(turretNextYawDeg - this.currentTurretYawDeg);
    this.currentTurretYawDeg = turretNextYawDeg;

    void turretStepRad;
    setControlAxisAngle(
      this.turretControl,
      this.turretBaseLocalRotation,
      this.turretYawAxis,
      toRadians(this.currentTurretYawDeg),
      this.tankAnchor
    );

    const cannonNextPitchDeg = moveTowards(
      this.currentCannonPitchDeg,
      this.targetCannonPitchDeg,
      this.config.cannon.pitchSpeedDeg * dt
    );
    const cannonStepRad = toRadians(cannonNextPitchDeg - this.currentCannonPitchDeg);
    this.currentCannonPitchDeg = cannonNextPitchDeg;

    void cannonStepRad;
    setControlAxisAngle(
      this.cannonControl,
      this.cannonBaseLocalRotation,
      this.cannonPitchAxis,
      toRadians(this.currentCannonPitchDeg),
      this.tankAnchor
    );
  }

  private updateReticle(mesh: Mesh | null, camera: Camera, worldPoint: Vector3, baseScale: number): void {
    if (!mesh) {
      return;
    }
    mesh.position.copyFrom(worldPoint);
    mesh.isVisible = true;
    const distToCamera = Vector3.Distance(camera.globalPosition, worldPoint);
    const newScale = distToCamera * baseScale;
    mesh.scaling.set(newScale, newScale, newScale);
  }

  private updateBarrelReticle(camera: Camera, baseScale: number): void {
    const mesh = this.reticleBarrelMesh;
    if (!mesh || !this.muzzleNode) {
      return;
    }

    const from = this.muzzleNode.getAbsolutePosition();
    const forward = this.muzzleNode
      .getDirection(this.movementForwardAxis)
      .scale(-this.config.rig.movementForwardSign);
    if (forward.lengthSquared() <= 1e-6) {
      return;
    }
    forward.normalize();

    const maxDist = 200;
    const to = from.add(forward.scale(maxDist));

    const physics = this.scene.getPhysicsEngine();
    let hitPoint: Vector3 | null = null;
    if (physics) {
      const hit = physics.raycast(from, to, { ignoreBody: this.tankBody, shouldHitTriggers: false, collideWith: ~4 });
      if (hit.hasHit) {
        hitPoint = hit.hitPointWorld.clone();
      }
    }
    if (!hitPoint) {
      hitPoint = to;
    }

    this.updateReticle(mesh, camera, hitPoint, baseScale);
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

    // Steering: drive the rigidbody (not the node transform).
    if (canMove) {
      const angVel = this.tankBody.getAngularVelocity();
      angVel.y = toRadians(turnAxis * this.config.movement.hullTurnSpeedDeg);
      this.tankBody.setAngularVelocity(angVel);
    }

    // Suspension forces (raycast down from SUS_* points).
    this.applySuspension();

    // Traction + lateral friction at COM.
    const forwardWorld = this.tankAnchor.getDirection(this.movementForwardAxis);
    forwardWorld.y = 0;
    if (forwardWorld.lengthSquared() > 1e-6) {
      forwardWorld.normalize();
    } else {
      forwardWorld.copyFrom(Axis.Z);
    }
    const rightWorld = Vector3.Cross(Axis.Y, forwardWorld).normalize();

    let tractionMultiplier = 1;
    if (isMoving) {
      const canBoost = boostHeld && this.overcharge > 0;
      if (canBoost) {
        tractionMultiplier *= this.config.movement.boostMultiplier;
        this.overcharge = clamp(
          this.overcharge - this.config.energy.overchargeDrainBoostPerSecond * dt,
          0,
          this.config.energy.overchargeMax
        );
        this.boostActive = this.overcharge > 0;
      }

      this.battery = clamp(
        this.battery - this.config.energy.batteryDrainMovingPerSecond * dt,
        0,
        this.config.energy.batteryMax
      );
    }

    const center = this.tankBody.getObjectCenterWorld();
    const v = this.tankBody.getLinearVelocity();
    const lateralSpeed = Vector3.Dot(v, rightWorld);
    const lateralForce = rightWorld.scale(-lateralSpeed * this.config.suspension.lateralFriction);
    this.tankBody.applyForce(lateralForce, center);

    if (isMoving) {
      const tractionForce = forwardWorld.scale(
        this.smoothedMoveAxis * this.config.suspension.tractionForce * tractionMultiplier
      );
      this.tankBody.applyForce(tractionForce, center);
    }
  }

  private applySuspension(): void {
    const engine = this.scene.getPhysicsEngine();
    if (!engine) {
      return;
    }

    const center = this.tankBody.getObjectCenterWorld();
    const linearVel = this.tankBody.getLinearVelocity();
    const angularVel = this.tankBody.getAngularVelocity();

    const rayStartHeight = this.config.suspension.rayStartHeight;
    const rayLength = this.config.suspension.rayLength;
    const restLength = this.config.suspension.restLength;
    const k = this.config.suspension.springStrength;
    const c = this.config.suspension.damperStrength;
    const maxForce = this.config.suspension.maxForce;

    for (const localPoint of this.suspensionPointsLocal) {
      const q = this.tankAnchor.absoluteRotationQuaternion ?? this.tankAnchor.rotationQuaternion ?? Quaternion.Identity();
      const worldPoint = this.tankAnchor.getAbsolutePosition().add(localPoint.clone().applyRotationQuaternion(q));

      const from = worldPoint.add(Axis.Y.scale(rayStartHeight));
      const to = from.add(Axis.Y.scale(-rayLength));
      const hit = engine.raycast(from, to, {
        ignoreBody: this.tankBody,
        shouldHitTriggers: false,
        collideWith: ~4
      });

      if (!hit.hasHit) {
        continue;
      }

      hit.calculateHitDistance();
      const distance = hit.hitDistance;
      const compression = clamp(restLength - distance, 0, restLength);
      if (compression <= 0) {
        continue;
      }

      // Point velocity along suspension axis (up).
      const r = hit.hitPointWorld.subtract(center);
      const pointVel = linearVel.add(Vector3.Cross(angularVel, r));
      const velAlongUp = Vector3.Dot(pointVel, Axis.Y);

      let forceMag = k * compression - c * velAlongUp;
      forceMag = clamp(forceMag, 0, maxForce);

      const force = Axis.Y.scale(forceMag);
      this.tankBody.applyForce(force, hit.hitPointWorld);
    }
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

function getControlLocalRotation(control: BoneControl, tankAnchor: TransformNode): Quaternion {
  if (control.transformNode) {
    control.transformNode.rotationQuaternion ??= Quaternion.Identity();
    return control.transformNode.rotationQuaternion.clone();
  }

  if (control.bone) {
    return control.bone.getRotationQuaternion(Space.LOCAL, tankAnchor).clone();
  }

  return Quaternion.Identity();
}

function setControlAxisAngle(
  control: BoneControl,
  baseLocalRotation: Quaternion,
  axis: Vector3,
  angleRad: number,
  tankAnchor: TransformNode
): void {
  const normAxis = axis.clone();
  if (normAxis.lengthSquared() > 1e-6) {
    normAxis.normalize();
  } else {
    normAxis.copyFrom(Axis.Y);
  }

  const q = Quaternion.RotationAxis(normAxis, angleRad);
  const local = baseLocalRotation.multiply(q);

  if (control.transformNode) {
    control.transformNode.rotationQuaternion ??= Quaternion.Identity();
    control.transformNode.rotationQuaternion.copyFrom(local);
    return;
  }

  if (control.bone) {
    control.bone.setRotationQuaternion(local, Space.LOCAL, tankAnchor);
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
