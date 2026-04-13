import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Axis, Space } from "@babylonjs/core/Maths/math.axis";
import "@babylonjs/core/Culling/ray";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeSphere, type PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
// (raycast query type removed; using inline object literals)
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Bone } from "@babylonjs/core/Bones/bone";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
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
  tankCamera: TargetCamera | null;
  tankZoomCamera?: TargetCamera | null;
  cameraPivotNode?: TransformNode | AbstractMesh | null;
  initialOrbit?: { yawRad: number; pitchRad: number; radius: number } | null;
  reticleCameraMesh: AbstractMesh | null;
  reticleBarrelMesh: AbstractMesh | null;
  muzzleNode: TransformNode | AbstractMesh | null;
  ammoShellMesh: Mesh | null;
  ammoBulletMesh: Mesh | null;
  physicsViewer?: PhysicsViewer;
}

export class TankGameplayController {
  private static readonly DEBUG_AIM_VECTORS = false;

  private readonly scene: Scene;
  private readonly config: TankControllerConfig;
  private readonly tankAnchor: TransformNode;
  private readonly tankVisualRoot: TransformNode | null;
  // groundingInfo kept in options for backward compatibility, but unused in dynamic suspension mode.
  private readonly suspensionPointsLocal: Vector3[];
  private readonly tankBody: PhysicsBody;
  private readonly tankCamera: TargetCamera | null;
  private readonly tankZoomCamera: TargetCamera | null;
  private readonly cameraPivotNode: TransformNode | AbstractMesh | null;
  private readonly input: TankInput;
  private readonly turretControl: BoneControl;
  private readonly cannonControl: BoneControl;
  private readonly turretBaseLocalRotation: Quaternion;
  private readonly cannonBaseLocalRotation: Quaternion;
  private readonly reticleCameraMesh: AbstractMesh | null;
  private readonly reticleBarrelMesh: AbstractMesh | null;
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

  private orbitYawRad = 0;
  private orbitPitchRad = 0;
  private orbitRadius = 0;

  // We distinguish between:
  // - control camera: used for aiming/turret/cannon logic (always the orbit camera)
  // - render camera: the scene.activeCamera (orbit or zoom view)
  private lastAimTargetPoint: Vector3 | null = null;

  private debugCameraRayLine: LinesMesh | null = null;
  private debugBarrelForwardLine: LinesMesh | null = null;
  private debugTargetMarker: Mesh | null = null;
  private debugCameraOriginMarker: Mesh | null = null;

  public constructor(options: TankGameplayControllerOptions) {
    this.scene = options.scene;
    this.config = options.config;
    this.tankAnchor = options.tankAnchor;
    this.tankVisualRoot = options.tankVisualRoot;
    void options.groundingInfo;
    this.suspensionPointsLocal = options.suspensionInfo.points.map((p) => p.clone());
    this.tankBody = options.tankBody;
    this.tankCamera = options.tankCamera;
    this.tankZoomCamera = options.tankZoomCamera ?? null;
    this.cameraPivotNode = options.cameraPivotNode ?? null;
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

    if (options.initialOrbit) {
      this.orbitYawRad = options.initialOrbit.yawRad;
      this.orbitPitchRad = options.initialOrbit.pitchRad;
      this.orbitRadius = options.initialOrbit.radius;
      this.applyOrbitCamera(0, 0);
    } else {
      this.initOrbitCameraState();
    }

    this.initAimDebugMeshes();
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

    this.debugCameraRayLine?.dispose();
    this.debugBarrelForwardLine?.dispose();
    this.debugTargetMarker?.dispose();
    this.debugCameraOriginMarker?.dispose();

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

    this.applyOrbitCamera(frame.lookDeltaX, frame.lookDeltaY);
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
      forward = this.reticleBarrelMesh.getAbsolutePosition().subtract(mesh.position);
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

  private applyTurretAndCannon(_pointerX: number, _pointerY: number, dt: number): void {
    // IMPORTANT: gameplay aiming must not change when switching to the alternative zoom view.
    // So we always use the orbit camera (tankCamera) as the control camera for raycasts/aim.
    const camera = this.tankCamera ?? (this.scene.activeCamera as TargetCamera | null);
    if (!camera) {
      return;
    }

    // Ensure the camera world matrix/globalPosition is up to date before we use it for debug + raycasting.
    camera.computeWorldMatrix();

    // "Camera reticle" is a fixed crosshair: raycast from screen center (not pointer position).
    const cx = this.scene.getEngine().getRenderWidth() * 0.5;
    const cy = this.scene.getEngine().getRenderHeight() * 0.5;
    const ray = this.scene.createPickingRay(cx, cy, Matrix.Identity(), camera);
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
      this.lastAimTargetPoint = targetPoint.clone();

      // Limit the distance of the target point from the tank to 1 meter
      // (Note: The game uses a x10 scale, you can increase this value if 1.0 feels too short)
      const tankPos = this.tankAnchor.getAbsolutePosition();
      const offset = targetPoint.subtract(tankPos);
      const maxDistance = this.config.aim.cameraMaxTargetDistance;
      if (offset.length() > maxDistance) {
        offset.normalize().scaleInPlace(maxDistance);
        targetPoint = tankPos.add(offset);
        this.lastAimTargetPoint.copyFrom(targetPoint);
      }

      // For debug visualization, use the actual camera position as ray origin.
      // Babylon's picking ray origin can be at the near-plane, which is confusing visually.
      this.updateAimDebug(camera.globalPosition.clone(), ray.direction, targetPoint);
      this.updateReticle(this.reticleCameraMesh, camera, targetPoint, 1);
      this.updateBarrelReticle(camera);

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

  private initAimDebugMeshes(): void {
    if (!TankGameplayController.DEBUG_AIM_VECTORS) {
      return;
    }
    // Always-on debug for now: visible vectors to quickly diagnose missing/incorrect reticles.
    this.debugCameraRayLine = MeshBuilder.CreateLines(
      "debug_camera_ray",
      { points: [Vector3.Zero(), Vector3.Zero()], updatable: true },
      this.scene
    );
    this.debugCameraRayLine.color = new Color3(1, 1, 0);
    this.debugCameraRayLine.renderingGroupId = 2;

    this.debugBarrelForwardLine = MeshBuilder.CreateLines(
      "debug_barrel_forward",
      { points: [Vector3.Zero(), Vector3.Zero()], updatable: true },
      this.scene
    );
    this.debugBarrelForwardLine.color = new Color3(0.2, 0.6, 1);
    this.debugBarrelForwardLine.renderingGroupId = 2;

    this.debugTargetMarker = MeshBuilder.CreateSphere(
      "debug_aim_target",
      { diameter: 0.25, segments: 8 },
      this.scene
    );
    this.debugTargetMarker.isPickable = false;
    this.debugTargetMarker.renderingGroupId = 2;

    this.debugCameraOriginMarker = MeshBuilder.CreateSphere(
      "debug_camera_origin",
      { diameter: 0.18, segments: 8 },
      this.scene
    );
    this.debugCameraOriginMarker.isPickable = false;
    this.debugCameraOriginMarker.renderingGroupId = 2;
  }

  private updateAimDebug(rayOrigin: Vector3, _rayDir: Vector3, targetPoint: Vector3): void {
    if (!TankGameplayController.DEBUG_AIM_VECTORS) {
      return;
    }
    if (this.debugCameraOriginMarker) {
      this.debugCameraOriginMarker.position.copyFrom(rayOrigin);
      this.debugCameraOriginMarker.isVisible = true;
    }
    // Camera ray to target point
    if (this.debugCameraRayLine) {
      MeshBuilder.CreateLines(
        this.debugCameraRayLine.name,
        { points: [rayOrigin, targetPoint], instance: this.debugCameraRayLine },
        this.scene
      );
      this.debugCameraRayLine.isVisible = true;
    }

    if (this.debugTargetMarker) {
      this.debugTargetMarker.position.copyFrom(targetPoint);
      this.debugTargetMarker.isVisible = true;
    }

    // Barrel forward vector (from MUZZLE_tank)
    if (this.debugBarrelForwardLine && this.muzzleNode) {
      const from = this.muzzleNode.getAbsolutePosition();
      const forward = this.muzzleNode.getDirection(this.movementForwardAxis).scale(-this.config.rig.movementForwardSign);
      if (forward.lengthSquared() > 1e-6) {
        forward.normalize();
      } else {
        forward.copyFrom(Axis.Z);
      }
      const to = from.add(forward.scale(5));

      MeshBuilder.CreateLines(
        this.debugBarrelForwardLine.name,
        { points: [from, to], instance: this.debugBarrelForwardLine },
        this.scene
      );
      this.debugBarrelForwardLine.isVisible = true;
    }
  }

  /** Multiplicateur de taille écran pour le réticule canon vs celui de la caméra (même `desiredPixels` de base). */
  private static readonly BARREL_RETICLE_SCREEN_SCALE = 3;

  private updateReticle(
    mesh: AbstractMesh | null,
    camera: Camera,
    worldPoint: Vector3,
    screenSizeMultiplier = 1
  ): void {
    if (!mesh) {
      return;
    }
    
    // Update the position of the billboard pivot (parent) or the mesh itself if no parent
    const target = (mesh.parent instanceof TransformNode) ? mesh.parent : mesh;
    target.position.copyFrom(worldPoint);
    
    // Reticles may come from GLB as disabled/invisible; force-enable at runtime.
    if (mesh.parent instanceof TransformNode) {
      mesh.parent.setEnabled(true);
    }
    mesh.setEnabled(true);
    mesh.isVisible = true;
    mesh.visibility = 1;
    // Make it visible even if its own material is culled / depth-tested poorly.
    // (Only Mesh has overlay support; InstancedMesh inherits from AbstractMesh but not Mesh.)
    const asAny = mesh as unknown as { renderOverlay?: boolean; overlayColor?: Color3; overlayAlpha?: number };
    if (typeof asAny.renderOverlay === "boolean" || asAny.renderOverlay === undefined) {
      asAny.renderOverlay = true;
      asAny.overlayColor = new Color3(1, 1, 1);
      asAny.overlayAlpha = 0.9;
    }

    const distToCamera = Vector3.Distance(camera.globalPosition, worldPoint);

    // Keep a constant on-screen size (in pixels).
    // Convert desired pixel size to world size at this distance and camera FOV.
    const desiredPixels = 32;
    const renderH = Math.max(this.scene.getEngine().getRenderHeight(), 1);
    const worldScreenHeightAtDist = 2 * distToCamera * Math.tan(camera.fov / 2);
    const worldUnitsPerPixel = worldScreenHeightAtDist / renderH;
    const desiredWorldSize = desiredPixels * worldUnitsPerPixel * screenSizeMultiplier;

    // Normalize by the mesh's authored size so artists don't have to match a strict unit scale.
    const bi = mesh.getBoundingInfo();
    const ext = bi.boundingBox.extendSize; // local-space half-extents
    const authoredSize = Math.max(ext.x, ext.y, ext.z) * 2;
    const uniformScale = authoredSize > 1e-6 ? desiredWorldSize / authoredSize : desiredWorldSize;
    mesh.scaling.set(uniformScale, uniformScale, uniformScale);
  }

  private updateBarrelReticle(camera: Camera): void {
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

    const maxDist = this.config.aim.barrelRayMaxDistance;
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

    this.updateReticle(mesh, camera, hitPoint, TankGameplayController.BARREL_RETICLE_SCREEN_SCALE);
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
    this.zoomActive = zoomHeld;
    const orbitCam = this.tankCamera ?? null;
    const zoomCam = this.tankZoomCamera ?? null;

    // Prefer camera switching if the zoom camera exists; otherwise fall back to FOV zoom.
    const nextActive =
      zoomHeld && zoomCam ? zoomCam : orbitCam ?? (this.scene.activeCamera as TargetCamera | null);
    if (nextActive && this.scene.activeCamera !== nextActive) {
      this.scene.activeCamera = nextActive;
    }

    // If we're in the alternative view, make it FOLLOW the orbit camera orientation.
    // This keeps the view consistent while preserving gameplay aiming based on orbit camera.
    if (zoomHeld && zoomCam && orbitCam) {
      orbitCam.computeWorldMatrix();

      // Position zoom camera near the muzzle, with a consistent "left + up + slight back" offset
      // in the cannon's forward frame (world-space). This avoids bone axis surprises.
      if (this.muzzleNode) {
        const muzzlePos = this.muzzleNode.getAbsolutePosition();
        const forward = this.muzzleNode
          .getDirection(this.movementForwardAxis)
          .scale(-this.config.rig.movementForwardSign);
        if (forward.lengthSquared() > 1e-6) {
          forward.normalize();
        } else {
          forward.copyFrom(Axis.Z);
        }

        const right = Vector3.Cross(Axis.Y, forward);
        if (right.lengthSquared() > 1e-6) {
          right.normalize();
        } else {
          right.copyFrom(Axis.X);
        }

        const leftOffset = 0.12;
        const upOffset = 0;
        const backOffset = -0.95;
        const desiredPos = muzzlePos
          .add(right.scale(leftOffset))
          .add(Axis.Y.scale(upOffset))
          .add(forward.scale(backOffset));

        zoomCam.position.copyFrom(desiredPos);
        zoomCam.setTarget(desiredPos.add(forward.scale(1000)));
      } else {
        // Fallback: keep using orbit forward vector.
        const forward = orbitCam.getForwardRay(1).direction;
        const from = zoomCam.globalPosition ?? zoomCam.position;
        zoomCam.setTarget(from.add(forward.scale(1000)));
      }
    }

    const boostMultiplier = this.boostActive ? this.config.camera.boostFovMultiplier : 1;
    const orbitFov = toRadians(this.config.camera.defaultFovDeg) * boostMultiplier;
    const zoomFov = toRadians(this.config.camera.zoomViewFovDeg) * boostMultiplier;

    if (orbitCam) {
      orbitCam.fov = orbitFov;
    }
    if (zoomCam) {
      zoomCam.fov = zoomFov;
    } else if (zoomHeld && orbitCam) {
      // No zoom camera: keep old behavior as fallback.
      orbitCam.fov = zoomFov;
    }
  }

  private initOrbitCameraState(): void {
    if (!this.tankCamera || !this.cameraPivotNode) {
      return;
    }

    const pivotWorld = this.cameraPivotNode.getAbsolutePosition();
    const camWorld = this.tankCamera.globalPosition ?? this.tankCamera.position;
    const offset = camWorld.subtract(pivotWorld);
    const horizLen = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
    const radius = Math.max(offset.length(), 0.001);

    this.orbitYawRad = Math.atan2(offset.x, offset.z);
    this.orbitPitchRad = Math.atan2(offset.y, Math.max(horizLen, 0.001));
    this.orbitRadius = radius;
  }

  private applyOrbitCamera(lookDeltaX: number, lookDeltaY: number): void {
    if (!this.tankCamera || !this.cameraPivotNode) {
      return;
    }

    // Mouse deltas are in pixels; config is degrees per pixel.
    this.orbitYawRad +=
      toRadians(
        lookDeltaX * this.config.camera.orbitYawDegPerPixel * this.config.camera.orbitYawSign
      );
    this.orbitPitchRad +=
      toRadians(
        lookDeltaY * this.config.camera.orbitPitchDegPerPixel * this.config.camera.orbitPitchSign
      );

    const minPitch = toRadians(this.config.camera.orbitMinPitchDeg);
    const maxPitch = toRadians(this.config.camera.orbitMaxPitchDeg);
    this.orbitPitchRad = clamp(this.orbitPitchRad, minPitch, maxPitch);

    if (this.config.camera.orbitClampRadius) {
      this.orbitRadius = clamp(
        this.orbitRadius,
        this.config.camera.orbitMinRadius,
        this.config.camera.orbitMaxRadius
      );
    }

    const pivotWorld = this.cameraPivotNode.getAbsolutePosition();
    const cosPitch = Math.cos(this.orbitPitchRad);
    const sinPitch = Math.sin(this.orbitPitchRad);
    const sinYaw = Math.sin(this.orbitYawRad);
    const cosYaw = Math.cos(this.orbitYawRad);

    const offset = new Vector3(
      sinYaw * cosPitch * this.orbitRadius,
      sinPitch * this.orbitRadius,
      cosYaw * cosPitch * this.orbitRadius
    );

    const desiredPos = pivotWorld.add(offset);
    let finalPos = desiredPos;

    if (this.config.camera.orbitCollisionEnabled) {
      const toDesired = desiredPos.subtract(pivotWorld);
      const dist = toDesired.length();
      if (dist > 1e-4) {
        const dir = toDesired.scale(1 / dist);
        const ray = new Ray(pivotWorld, dir, dist);
        const hit = this.scene.pickWithRay(ray, (mesh) => {
          const n = mesh.name;
          // Block camera against world geometry only (not tank/UI).
          return (
            n.startsWith("SM_") ||
            n.startsWith("DM_") ||
            n.toLowerCase().includes("ground") ||
            n.startsWith("COL_")
          );
        });

        if (hit?.hit && typeof hit.distance === "number") {
          const pad = Math.max(this.config.camera.orbitCollisionPadding, 0);
          const clampedDist = Math.max(hit.distance - pad, 0.05);
          finalPos = pivotWorld.add(dir.scale(clampedDist));
        }
      }
    }

    this.tankCamera.position.copyFrom(finalPos);
    this.tankCamera.setTarget(pivotWorld);
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
