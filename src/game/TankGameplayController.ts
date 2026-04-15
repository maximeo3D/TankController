import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Axis, Space } from "@babylonjs/core/Maths/math.axis";
import "@babylonjs/core/Culling/ray";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh as BabylonMesh } from "@babylonjs/core/Meshes/mesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
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
import { AdvancedDynamicTexture, Rectangle, Control, Image } from "@babylonjs/gui";
import { reticleCameraAssetUrl, reticleBarrelAssetUrl } from "../assets/assetUrls";
import type { TrackTreadParticleBundle } from "./trackTreadParticles";

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
  suspensionNodes?: {
    fl: TransformNode | AbstractMesh | null;
    fr: TransformNode | AbstractMesh | null;
    ml: TransformNode | AbstractMesh | null;
    mr: TransformNode | AbstractMesh | null;
    rl: TransformNode | AbstractMesh | null;
    rr: TransformNode | AbstractMesh | null;
  };
  tankBody: PhysicsBody;
  tankCamera: TargetCamera | null;
  tankZoomCamera?: TargetCamera | null;
  cameraPivotNode?: TransformNode | AbstractMesh | null;
  initialOrbit?: { yawRad: number; pitchRad: number; radius: number } | null;
  reticleCameraMesh: AbstractMesh | null;
  reticleBarrelMesh: AbstractMesh | null;
  muzzleNode: TransformNode | AbstractMesh | null;
  tracksSourceMesh?: AbstractMesh | null;
  ammoShellMesh: Mesh | null;
  ammoBulletMesh: Mesh | null;
  physicsViewer?: PhysicsViewer;
  /** Chenilles : fumée + gravillons sur SUS_BL / SUS_BR (si chargés). */
  trackTreadParticles?: TrackTreadParticleBundle | null;
}

export class TankGameplayController {
  private static readonly DEBUG_AIM_VECTORS = false;

  private readonly scene: Scene;
  private readonly config: TankControllerConfig;
  private readonly tracksConfig: NonNullable<TankControllerConfig["tracks"]>;
  private readonly tankAnchor: TransformNode;
  private readonly tankVisualRoot: TransformNode | null;
  // groundingInfo kept in options for backward compatibility, but unused in dynamic suspension mode.
  private readonly suspensionPointsLocal: Vector3[];
  private readonly suspensionNodes: NonNullable<TankGameplayControllerOptions["suspensionNodes"]>;
  private readonly tankBody: PhysicsBody;
  private readonly tankCamera: TargetCamera | null;
  private readonly tankZoomCamera: TargetCamera | null;
  private readonly cameraPivotNode: TransformNode | AbstractMesh | null;
  private readonly input: TankInput;
  private readonly turretControl: BoneControl;
  private readonly cannonControl: BoneControl;
  private readonly turretBaseLocalRotation: Quaternion;
  private readonly cannonBaseLocalRotation: Quaternion;
  private readonly cannonBaseLocalPosition: Vector3;
  private readonly muzzleNode: TransformNode | AbstractMesh | null;
  private readonly trackMaterial: Material | null;
  private trackSystem: TrackSegmentSystem | null = null;
  private readonly tankMeshIdsToIgnore = new Set<number>();
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
  private readonly trackTreadParticles: TrackTreadParticleBundle | null;

  /** Décalage courant sur l’axe local Y du bone canon (recul). */
  private cannonRecoilOffsetY = 0;
  /** Coup de recul à fusionner dans `applyTurretAndCannon` (après `updateWeapons`). */
  private pendingCannonRecoilKickY = 0;

  /** Inclinaison du hull (rad) : pitch autour X, roll autour Z — côté opposé au tir qui s’enfonce. */
  private hullRecoilPitch = 0;
  private hullRecoilRoll = 0;
  private pendingHullRecoilPitch = 0;
  private pendingHullRecoilRoll = 0;

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

  private susDebugSpheres: Mesh[] = [];
  private hudTexture: AdvancedDynamicTexture | null = null;
  private barrelReticle2D: Rectangle | null = null;
  private lastBarrelAimPoint: Vector3 | null = null;

  public constructor(options: TankGameplayControllerOptions) {
    this.scene = options.scene;
    this.config = options.config;
    this.tracksConfig = options.config.tracks ?? {
      enabled: false,
      spacing: 0.25,
      maxPointsPerRibbon: 120,
      segmentLength: 0.35,
      segmentWidth: 0.22,
      uvRepeatU: 1,
      uvRepeatV: 1,
      yOffset: 0.015,
      raycastStartHeight: 0.35,
      raycastLength: 2.5,
      opacityMultiplier: 1.0
    };
    this.tankAnchor = options.tankAnchor;
    this.tankVisualRoot = options.tankVisualRoot;
    void options.groundingInfo;
    this.suspensionPointsLocal = options.suspensionInfo.points.map((p) => p.clone());
    this.suspensionNodes = options.suspensionNodes ?? {
      fl: null,
      fr: null,
      ml: null,
      mr: null,
      rl: null,
      rr: null
    };
    this.tankBody = options.tankBody;
    this.tankCamera = options.tankCamera;
    this.tankZoomCamera = options.tankZoomCamera ?? null;
    this.cameraPivotNode = options.cameraPivotNode ?? null;
    this.muzzleNode = options.muzzleNode;
    this.trackMaterial = (options.tracksSourceMesh?.material as Material | null | undefined) ?? null;
    for (const m of options.tankContainer.meshes) {
      this.tankMeshIdsToIgnore.add(m.uniqueId);
    }
    this.ammoShellMesh = options.ammoShellMesh;
    this.ammoBulletMesh = options.ammoBulletMesh;
    this.physicsViewer = options.physicsViewer;
    this.trackTreadParticles = options.trackTreadParticles ?? null;
    this.input = new TankInput(options.canvas);
    this.turretControl = resolveBoneControl(options.tankContainer, "tourelle");
    this.cannonControl = resolveBoneControl(options.tankContainer, "canon");
    this.turretBaseLocalRotation = getControlLocalRotation(this.turretControl, this.tankAnchor);
    this.cannonBaseLocalRotation = getControlLocalRotation(this.cannonControl, this.tankAnchor);
    this.cannonBaseLocalPosition = getControlLocalPosition(this.cannonControl);
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
    this.initTrackSystem();
    if (this.config.debug?.showSuspensionSpheres) {
      this.initSuspensionDebugSpheres();
    }
    this.initHud();
    this.scene.onBeforeRenderObservable.add(this.update);
  }

  private initHud(): void {
    // Full-screen Babylon GUI for crosshair + future HUD.
    this.hudTexture = AdvancedDynamicTexture.CreateFullscreenUI("hud_ui", true, this.scene);

    // Camera reticle (2D PNG) fixed at screen center.
    const cam = new Image("reticle_camera_img", reticleCameraAssetUrl);
    cam.widthInPixels = 150;
    cam.heightInPixels = 150;
    cam.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    cam.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    cam.isPointerBlocker = false;
    this.hudTexture.addControl(cam);

    // Barrel reticle (2D) – moved each frame by projecting the barrel ray hit point.
    const barrel = new Image("reticle_barrel_img", reticleBarrelAssetUrl);
    barrel.widthInPixels = 150;
    barrel.heightInPixels = 150;
    barrel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    barrel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    barrel.isVisible = false;
    barrel.isPointerBlocker = false;
    this.hudTexture.addControl(barrel);
    this.barrelReticle2D = barrel as unknown as Rectangle;
  }

  private initSuspensionDebugSpheres(): void {
    // Always-on for now (requested for debugging).
    const nodes = this.suspensionNodes;
    const ordered: Array<TransformNode | AbstractMesh | null> = [
      nodes.fl,
      nodes.fr,
      nodes.ml,
      nodes.mr,
      nodes.rl,
      nodes.rr
    ];
    if (ordered.every((n) => !n)) {
      return;
    }

    const mat = new StandardMaterial("sus_debug_red", this.scene);
    mat.diffuseColor = new Color3(1, 0, 0);
    mat.emissiveColor = new Color3(1, 0, 0);

    const radius = 0.04;
    for (let i = 0; i < ordered.length; i++) {
      const s = MeshBuilder.CreateSphere(`sus_dbg_${i}`, { diameter: radius * 2 }, this.scene);
      s.material = mat;
      s.isPickable = false;
      s.alwaysSelectAsActiveMesh = false;
      s.renderingGroupId = 1;
      this.susDebugSpheres.push(s);
    }
  }

  private initTrackSystem(): void {
    if (!this.tracksConfig.enabled) {
      console.warn("[TankController][tracks] tracks.enabled is false (or missing); track ribbons disabled.");
      return;
    }

    const material =
      this.trackMaterial ??
      (() => {
        console.warn(
          "[TankController][tracks] TEX_tracks has no material. Using fallback material."
        );
        const m = new StandardMaterial("tracks_fallback_mat", this.scene);
        m.diffuseColor = new Color3(0.05, 0.05, 0.05);
        m.emissiveColor = new Color3(0.02, 0.02, 0.02);
        m.alpha = clamp(this.tracksConfig.opacityMultiplier, 0, 1);
        m.backFaceCulling = false;
        return m;
      })();

    const anyNode =
      this.suspensionNodes.fl ||
      this.suspensionNodes.fr ||
      this.suspensionNodes.ml ||
      this.suspensionNodes.mr ||
      this.suspensionNodes.rl ||
      this.suspensionNodes.rr;
    if (!anyNode) {
      console.warn("[TankController][tracks] No SUS_* nodes found; cannot spawn track segments.");
      return;
    }

    this.trackSystem = new TrackSegmentSystem({
      scene: this.scene,
      material,
      tracksConfig: this.tracksConfig,
      tankBody: this.tankBody,
      nodes: this.suspensionNodes,
      ignoreMeshIds: this.tankMeshIdsToIgnore
    });
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
    for (const s of this.susDebugSpheres) {
      s.dispose();
    }
    this.susDebugSpheres = [];

    this.hudTexture?.dispose();
    this.hudTexture = null;
    this.barrelReticle2D = null;

    for (const proj of this.activeProjectiles) {
      proj.body.dispose();
      proj.shape.dispose();
      proj.mesh.dispose();
    }

    this.trackTreadParticles?.dispose();
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
    this.updateWeapons(dt);
    this.applyTurretAndCannon(frame.pointerX, frame.pointerY, dt);
    this.applyMovement(frame.moveAxis, frame.turnAxis, frame.boostHeld, dt);
    this.applyVisualSmoothing(dt);
    this.applyCamera(frame.zoomHeld);
    this.trackSystem?.update(dt);
    this.updateSuspensionDebugSpheres();
    this.updateProjectiles(dt);
  };

  private updateSuspensionDebugSpheres(): void {
    if (this.susDebugSpheres.length === 0) return;
    const nodes = this.suspensionNodes;
    const ordered: Array<TransformNode | AbstractMesh | null> = [
      nodes.fl,
      nodes.fr,
      nodes.ml,
      nodes.mr,
      nodes.rl,
      nodes.rr
    ];
    for (let i = 0; i < this.susDebugSpheres.length; i++) {
      const n = ordered[i] ?? null;
      const s = this.susDebugSpheres[i];
      if (!n) {
        s.setEnabled(false);
        continue;
      }
      s.setEnabled(true);
      n.computeWorldMatrix(true);
      s.position.copyFrom(n.getAbsolutePosition());
    }
  }

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
    if (this.lastBarrelAimPoint) {
      forward = this.lastBarrelAimPoint.subtract(mesh.position);
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
    this.pendingCannonRecoilKickY += this.config.cannon.recoilKickY;
    this.applyHullRecoilImpulseFromWorldForward(forward);
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
      // Camera reticle is now screen-space GUI; no world-space update needed.
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

    this.cannonRecoilOffsetY = moveTowards(
      this.cannonRecoilOffsetY,
      0,
      this.config.cannon.recoilReturnSpeed * dt
    );
    this.cannonRecoilOffsetY += this.pendingCannonRecoilKickY;
    this.pendingCannonRecoilKickY = 0;

    setControlAxisAngle(
      this.cannonControl,
      this.cannonBaseLocalRotation,
      this.cannonPitchAxis,
      toRadians(this.currentCannonPitchDeg),
      this.tankAnchor
    );

    const cannonPos = this.cannonBaseLocalPosition.clone();
    cannonPos.y += this.cannonRecoilOffsetY;
    setControlLocalPosition(this.cannonControl, cannonPos);
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

  private updateBarrelReticle(camera: Camera): void {
    if (!this.muzzleNode) {
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
      const hit = physics.raycast(from, to, {
        ignoreBody: this.tankBody,
        shouldHitTriggers: false,
        collideWith: 0xffffffff
      });
      if (hit.hasHit) {
        hitPoint = hit.hitPointWorld.clone();
      }
    }
    if (!hitPoint) {
      hitPoint = to;
    }

    this.lastBarrelAimPoint = hitPoint.clone();

    const ui = this.barrelReticle2D;
    if (!ui) return;

    // Project world point to screen pixels.
    const engine = this.scene.getEngine();
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const viewport = camera.viewport.toGlobal(w, h);
    const projected = Vector3.Project(
      hitPoint,
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      viewport
    );

    const onScreen =
      Number.isFinite(projected.x) &&
      Number.isFinite(projected.y) &&
      projected.z >= 0 &&
      projected.z <= 1 &&
      projected.x >= viewport.x &&
      projected.x <= viewport.x + viewport.width &&
      projected.y >= viewport.y &&
      projected.y <= viewport.y + viewport.height;

    if (!onScreen) {
      ui.isVisible = false;
      return;
    }

    ui.isVisible = true;
    // GUI center alignment: left/top are offsets from center.
    ui.leftInPixels = projected.x - (viewport.x + viewport.width / 2);
    ui.topInPixels = projected.y - (viewport.y + viewport.height / 2);
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

    this.updateTrackTreadDust(forwardWorld);
  }

  /** Fumée / gravillons : actifs seulement quand le tank se déplace vers l'avant (vitesse selon l'axe marche). */
  private updateTrackTreadDust(forwardWorld: Vector3): void {
    if (!this.trackTreadParticles) {
      return;
    }
    const v = this.tankBody.getLinearVelocity();
    const vForward = Vector3.Dot(v, forwardWorld);
    const minSpeed = 0.12;
    // Traction avant = vitesse négative selon +forwardWorld (repère châssis / input inversé).
    const advancing = this.battery > 0 && vForward < -minSpeed;
    this.trackTreadParticles.setAdvancing(advancing);
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
        collideWith: 0xffffffff
      });

      if (!hit.hasHit) {
        continue;
      }

      hit.calculateHitDistance();
      let distance = hit.hitDistance;
      // Defensive: some physics plugins can yield undefined/NaN hitDistance.
      // In that case, derive distance from the hit point.
      if (!Number.isFinite(distance)) {
        if (hit.hitPointWorld) {
          distance = Vector3.Distance(from, hit.hitPointWorld);
        } else {
          continue;
        }
      }
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

    const hullRs = this.config.cannon.hullRecoilReturnSpeed;
    this.hullRecoilPitch = moveTowards(this.hullRecoilPitch, 0, hullRs * dt);
    this.hullRecoilRoll = moveTowards(this.hullRecoilRoll, 0, hullRs * dt);
    this.hullRecoilPitch += this.pendingHullRecoilPitch;
    this.hullRecoilRoll += this.pendingHullRecoilRoll;
    this.pendingHullRecoilPitch = 0;
    this.pendingHullRecoilRoll = 0;

    this.tankVisualRoot.rotationQuaternion ??= Quaternion.Identity();
    this.tankVisualRoot.rotationQuaternion.copyFrom(
      Quaternion.RotationYawPitchRoll(0, this.hullRecoilPitch, this.hullRecoilRoll)
    );

    const positionLerp = 1 - Math.exp(-this.config.grounding.positionSharpness * dt);
    const nextLocalPosition = Vector3.Lerp(this.tankVisualRoot.position, Vector3.Zero(), positionLerp);
    this.tankVisualRoot.position.copyFrom(nextLocalPosition);
  }

  /**
   * Incline le visuel du hull : le côté opposé à la direction de tir (plan horizontal) s’enfonce.
   * `worldForward` = direction du tir (monde), même logique que le projectile.
   */
  private applyHullRecoilImpulseFromWorldForward(worldForward: Vector3): void {
    if (!this.tankVisualRoot) {
      return;
    }

    const horiz = worldForward.clone();
    horiz.y = 0;
    if (horiz.lengthSquared() < 1e-8) {
      return;
    }
    horiz.normalize();

    const inv = this.tankAnchor.getWorldMatrix().clone().invert();
    const dir = Vector3.TransformNormal(horiz, inv);
    dir.y = 0;
    if (dir.lengthSquared() < 1e-8) {
      return;
    }
    dir.normalize();

    const K = toRadians(this.config.cannon.hullRecoilKickDeg) * this.config.cannon.hullRecoilSign;
    // Espace local du hull (X droite, Y haut, Z avant typique) : pitch (X) / roll (Z) pondérés par la direction horizontale du tir.
    this.pendingHullRecoilPitch += -K * dir.z;
    this.pendingHullRecoilRoll += K * dir.x;
  }

}

type TrackNodeKey = "fl" | "fr" | "ml" | "mr" | "rl" | "rr";

interface TrackSegment {
  mesh: BabylonMesh;
  age: number;
}

class TrackSegmentSystem {
  private readonly scene: Scene;
  private readonly tracksConfig: NonNullable<TankControllerConfig["tracks"]>;
  private readonly tankBody: PhysicsBody;
  private readonly material: Material;
  private readonly nodes: NonNullable<TankGameplayControllerOptions["suspensionNodes"]>;
  private readonly ignoreMeshIds: ReadonlySet<number>;

  private readonly segmentsByNode = new Map<TrackNodeKey, TrackSegment[]>();
  private readonly lastSpawnByNode = new Map<TrackNodeKey, Vector3>();
  private readonly baseSegmentMesh: BabylonMesh;

  public constructor(args: {
    scene: Scene;
    material: Material;
    tracksConfig: NonNullable<TankControllerConfig["tracks"]>;
    tankBody: PhysicsBody;
    nodes: NonNullable<TankGameplayControllerOptions["suspensionNodes"]>;
    ignoreMeshIds: ReadonlySet<number>;
  }) {
    this.scene = args.scene;
    this.material = args.material;
    this.tracksConfig = args.tracksConfig;
    this.tankBody = args.tankBody;
    this.nodes = args.nodes;
    this.ignoreMeshIds = args.ignoreMeshIds;

    const keys: TrackNodeKey[] = ["fl", "fr", "ml", "mr", "rl", "rr"];
    for (const k of keys) {
      this.segmentsByNode.set(k, []);
    }

    // Apply optional opacity multiplier if the material supports it,
    // without overwriting materials that don't use `alpha`.
    const opacityMul = clamp(this.tracksConfig.opacityMultiplier, 0, 1);
    if (Math.abs(opacityMul - 1) > 1e-6) {
      const anyMat = this.material as unknown as { alpha?: number };
      if (typeof anyMat.alpha === "number") {
        anyMat.alpha = clamp(anyMat.alpha * opacityMul, 0, 1);
      }
    }

    // Texture tiling for the track segments material (diffuse/albedo).
    const u = Math.max(this.tracksConfig.uvRepeatU ?? 1, 0.001);
    const v = Math.max(this.tracksConfig.uvRepeatV ?? 1, 0.001);
    const any = this.material as unknown as {
      diffuseTexture?: unknown;
      albedoTexture?: unknown;
      baseTexture?: unknown;
    };
    const tex =
      (any.diffuseTexture as unknown) ||
      (any.albedoTexture as unknown) ||
      (any.baseTexture as unknown) ||
      null;
    if (tex && tex instanceof Texture) {
      tex.wrapU = Texture.WRAP_ADDRESSMODE;
      tex.wrapV = Texture.WRAP_ADDRESSMODE;
      tex.uScale = u;
      tex.vScale = v;
    } else if (tex && typeof tex === "object") {
      // Fallback for texture-like objects.
      const t = tex as { uScale?: number; vScale?: number; wrapU?: number; wrapV?: number };
      if (typeof t.uScale === "number") t.uScale = u;
      if (typeof t.vScale === "number") t.vScale = v;
      if (typeof t.wrapU === "number") t.wrapU = Texture.WRAP_ADDRESSMODE;
      if (typeof t.wrapV === "number") t.wrapV = Texture.WRAP_ADDRESSMODE;
    }

    // Base mesh for instances
    this.baseSegmentMesh = MeshBuilder.CreatePlane(
      "tracks_segment_base",
      { width: 1, height: 1, sideOrientation: BabylonMesh.DOUBLESIDE },
      this.scene
    );
    this.baseSegmentMesh.isVisible = false;
    this.baseSegmentMesh.isPickable = false;
    this.baseSegmentMesh.material = this.material;
  }

  public update(dt: number): void {
    if (!this.tracksConfig.enabled) {
      return;
    }

    // Spawn segments only from the middle suspension points (less noisy visually).
    const keys: TrackNodeKey[] = ["ml", "mr"];
    for (const k of keys) {
      const node = this.nodes[k];
      if (!node) continue;
      this.sampleAndSpawnSegment(k, node);
    }

    // Age and prune segments (simple TTL via max count; dt aging kept if later needed)
    for (const k of keys) {
      const segs = this.segmentsByNode.get(k);
      if (!segs) continue;
      for (const s of segs) {
        s.age += dt;
      }
      const maxSegs = Math.max(1, Math.floor(this.tracksConfig.maxPointsPerRibbon));
      while (segs.length > maxSegs) {
        const old = segs.shift();
        old?.mesh.dispose();
      }
    }
  }

  private sampleAndSpawnSegment(key: TrackNodeKey, node: TransformNode | AbstractMesh): void {
    const from = node.getAbsolutePosition().add(Axis.Y.scale(this.tracksConfig.raycastStartHeight));
    const to = from.add(Axis.Y.scale(-this.tracksConfig.raycastLength));
    const dir = to.subtract(from);
    const len = dir.length();
    if (len <= 1e-4) {
      return;
    }
    dir.scaleInPlace(1 / len);

    // Prefer physics raycast (doesn't depend on mesh.isPickable / render picking).
    let hitPoint: Vector3 | null = null;
    const engine = this.scene.getPhysicsEngine();
    if (engine) {
      const physicsHit = engine.raycast(from, to, {
        ignoreBody: this.tankBody,
        shouldHitTriggers: false,
        collideWith: 0xffffffff
      });
      if (physicsHit.hasHit) {
        // Some engines/plugins require this to populate distance fields reliably.
        physicsHit.calculateHitDistance();
        if (physicsHit.hitPointWorld) {
          hitPoint = physicsHit.hitPointWorld.clone();
        } else if (typeof physicsHit.hitDistance === "number") {
          hitPoint = from.add(dir.scale(physicsHit.hitDistance));
        }
      }
    } else {
      const ray = new Ray(from, dir, len);
      const pickHit = this.scene.pickWithRay(ray, (mesh) => {
        // Accept any world mesh, but never hit the tank itself.
        if (this.ignoreMeshIds.has(mesh.uniqueId)) {
          return false;
        }
        if (!mesh.isEnabled() || !mesh.isVisible) {
          return false;
        }
        return true;
      });
      if (pickHit?.hit && pickHit.pickedPoint) {
        hitPoint = pickHit.pickedPoint.clone();
      }
    }

    if (!hitPoint) {
      return;
    }

    const center = hitPoint.add(Axis.Y.scale(this.tracksConfig.yOffset));
    const last = this.lastSpawnByNode.get(key) ?? null;
    const spacing = Math.max(this.tracksConfig.spacing, 0.01);
    if (last && Vector3.DistanceSquared(last, center) < spacing * spacing) {
      return;
    }

    // Orientation: use the SUS_ node forward projected on ground plane.
    // Convention: use local +Z as forward for the empty.
    const forward = node.getDirection(Axis.Z);
    forward.y = 0;
    if (forward.lengthSquared() > 1e-6) {
      forward.normalize();
    } else {
      forward.copyFrom(Axis.Z);
    }

    // Spawn a segment plane centered at hit point.
    const inst = this.baseSegmentMesh.createInstance(`tracks_seg_${key}_${Date.now()}`);
    inst.isPickable = false;
    inst.alwaysSelectAsActiveMesh = false;
    inst.position.copyFrom(center);
    // Plane is created in XY; after `toGround` rotation, local Y maps to world Z (length).
    inst.scaling.set(this.tracksConfig.segmentWidth, this.tracksConfig.segmentLength, 1);
    // `CreatePlane` is vertical (XY). Rotate -90° around X to lay it on ground (XZ),
    // then apply yaw so the segment points in the SUS_ forward direction.
    const toGround = Quaternion.RotationAxis(Axis.X, -Math.PI / 2);
    const yaw = Quaternion.FromLookDirectionLH(forward, Axis.Y);
    inst.rotationQuaternion = yaw.multiply(toGround);

    const segs = this.segmentsByNode.get(key);
    segs?.push({ mesh: inst as unknown as BabylonMesh, age: 0 });
    this.lastSpawnByNode.set(key, center.clone());
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

function getControlLocalPosition(control: BoneControl): Vector3 {
  if (control.transformNode) {
    return control.transformNode.position.clone();
  }

  if (control.bone) {
    return control.bone.position.clone();
  }

  return Vector3.Zero();
}

function setControlLocalPosition(control: BoneControl, position: Vector3): void {
  if (control.transformNode) {
    control.transformNode.position.copyFrom(position);
    return;
  }

  if (control.bone) {
    control.bone.position.copyFrom(position);
  }
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
