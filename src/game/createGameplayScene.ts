import HavokPhysics from "@babylonjs/havok";
import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Physics/physicsEngineComponent";
import "@babylonjs/core/Helpers/sceneHelpers";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import {
  PhysicsShapeBox,
  PhysicsShapeConvexHull,
  PhysicsShapeMesh,
  type PhysicsShape
} from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Scene } from "@babylonjs/core/scene";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TankControllerConfig } from "../config/tankController";
import { tankAssetUrl, skyboxAssetUrl } from "../assets/assetUrls";
import type { LevelDefinition } from "../app/levels";
import {
  TankGameplayController,
  type TankGameplayDebugState
} from "./TankGameplayController";

export interface GameplaySceneSummary {
  spawnFound: boolean;
  tankCameraFound: boolean;
  terrainStaticMeshes: number;
  terrainDynamicMeshes: number;
  terrainColliderMeshes: number;
  tankBones: string[];
}

export interface GameplaySceneBundle {
  scene: Scene;
  summary: GameplaySceneSummary;
  getDebugState: () => TankGameplayDebugState;
  dispose: () => void;
}

const REQUIRED_BONES = ["main", "caisse", "tourelle", "canon"] as const;

interface PhysicsResourceGroup {
  bodies: PhysicsBody[];
  shapes: PhysicsShape[];
}

interface TankGroundingInfo {
  baseClearance: number;
  frontLeft: Vector3;
  frontRight: Vector3;
  rearLeft: Vector3;
  rearRight: Vector3;
}

interface TankSuspensionInfo {
  points: Vector3[];
}

interface TankPhysicsResource {
  body: PhysicsBody;
  shape: PhysicsShape;
  grounding: TankGroundingInfo;
}

export async function createGameplayScene(
  engine: Engine,
  level: LevelDefinition,
  config: TankControllerConfig,
  canvas: HTMLCanvasElement
): Promise<GameplaySceneBundle> {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.05, 0.06, 0.08, 1);

  // Hide the default cursor in Babylon.js
  scene.defaultCursor = "none";
  scene.hoverCursor = "none";

  const envTex = CubeTexture.CreateFromPrefilteredData(skyboxAssetUrl, scene);
  scene.environmentTexture = envTex;
  scene.environmentIntensity = 0.5;
  scene.createDefaultSkybox(envTex, true, 1000, 0.1, true);

  const fallbackCamera = new ArcRotateCamera(
    "fallback_camera",
    -Math.PI / 2,
    Math.PI / 3,
    12,
    Vector3.Zero(),
    scene
  );
  fallbackCamera.minZ = 0.01;
  fallbackCamera.fov = toRadians(config.camera.defaultFovDeg);
  scene.activeCamera = fallbackCamera;

  new HemisphericLight("sun", new Vector3(0.2, 1, 0.1), scene).intensity = 0.5;

  const havok = await HavokPhysics();
  const havokPlugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);

  const terrainContainer = await SceneLoader.LoadAssetContainerAsync("", level.terrainUrl, scene);
  terrainContainer.addAllToScene();
  hideColliderMeshes(terrainContainer, scene);
  const worldPhysics = createWorldPhysics(terrainContainer, scene);

  const spawnNode = findTransformNode(terrainContainer, "SPAWN_tank");

  const tankContainer = await SceneLoader.LoadAssetContainerAsync("", tankAssetUrl, scene);
  tankContainer.addAllToScene();
  hideColliderMeshes(tankContainer, scene);

  const tankAnchor = new TransformNode("tank_anchor", scene);
  const tankVisualRoot = new TransformNode("tank_visual_root", scene);
  tankVisualRoot.parent = tankAnchor;
  if (spawnNode) {
    tankAnchor.position.copyFrom(spawnNode.getAbsolutePosition());
    tankAnchor.rotationQuaternion = extractHorizontalSpawnRotation(
      spawnNode,
      config.rig.movementForwardAxis,
      config.rig.movementForwardSign
    );
  } else {
    tankAnchor.rotationQuaternion = Quaternion.Identity();
  }
  tankAnchor.rotate(Axis.Y, toRadians(config.rig.spawnYawOffsetDeg));

  parentTankNodes(tankContainer, tankAnchor, tankVisualRoot);
  const tankColliderMesh = findMeshByName(tankContainer, "COL_tank");
  refreshTankRigWorldMatrices(tankAnchor, tankContainer);
  const groundingInfo = createTankGroundingInfo(
    tankContainer,
    tankAnchor,
    tankColliderMesh,
    config.rig.movementForwardAxis
  );
  const suspensionInfo = createTankSuspensionInfo(tankContainer, tankAnchor);
  const tankPhysics = createTankPhysics(tankAnchor, tankColliderMesh, groundingInfo, scene, config);
  snapTankAnchorYToTerrain(scene, tankAnchor, tankPhysics.body, suspensionInfo.points, config);

  const camPivotNode = findTransformNode(tankContainer, "CAM_pivot");
  const camStartNode = findTransformNode(tankContainer, "CAM_tank");

  let tankCamera: UniversalCamera | null = null;
  let tankZoomCamera: UniversalCamera | null = null;
  let initialOrbit: { yawRad: number; pitchRad: number; radius: number } | null = null;
  if (camPivotNode) {
    const pivotWorld = camPivotNode.getAbsolutePosition();
    let startWorld: Vector3 | null = null;

    if (camStartNode) {
      // If CAM_tank exists, always use it as the initial orbit seed (artist-authored pose).
      startWorld = camStartNode.getAbsolutePosition();
    }

    if (!startWorld) {
      const radius = config.camera.orbitDefaultRadius;
      const height = Math.max(radius * 0.35, 1);
      const sourceAxis =
        config.rig.movementForwardAxis === "x"
          ? Axis.X
          : config.rig.movementForwardAxis === "y"
            ? Axis.Y
            : Axis.Z;
      const forward = tankAnchor.getDirection(sourceAxis).scale(config.rig.movementForwardSign);
      forward.y = 0;
      if (forward.lengthSquared() > 1e-6) {
        forward.normalize();
      } else {
        forward.copyFrom(Axis.Z);
      }

      startWorld = pivotWorld.subtract(forward.scale(radius)).add(Axis.Y.scale(height));
    }

    tankCamera = new UniversalCamera("tank_orbit_camera", startWorld.clone(), scene);
    tankCamera.fov = toRadians(config.camera.defaultFovDeg);
    tankCamera.minZ = 0.01;
    tankCamera.inputs.clear();
    tankCamera.attachControl(canvas, true);
    tankCamera.setTarget(pivotWorld);
    scene.activeCamera = tankCamera;

    // Create zoom camera (actual placement handled by controller, based on muzzle forward).
    tankZoomCamera = new UniversalCamera("tank_zoom_camera", Vector3.Zero(), scene);
    tankZoomCamera.fov = toRadians(config.camera.zoomViewFovDeg);
    tankZoomCamera.minZ = 0.01;
    tankZoomCamera.inputs.clear();
    tankZoomCamera.rotationQuaternion = Quaternion.Identity();
    // Do not attach control: input is managed by our own TankInput + controller logic.

    // Seed orbit state from the chosen start pose so the first "orbit step"
    // keeps the camera exactly where the artist placed it in Blender.
    const offset = startWorld.subtract(pivotWorld);
    const horizLen = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
    const radius = Math.max(offset.length(), 0.001);
    initialOrbit = {
      yawRad: Math.atan2(offset.x, offset.z),
      pitchRad: Math.atan2(offset.y, Math.max(horizLen, 0.001)),
      radius
    };
  } else {
    // If we stay on fallbackCamera, the view will likely be "wrong" relative to the tank.
    // This warning helps diagnose GLB naming/hierarchy quickly.
    const allNames = [...tankContainer.transformNodes, ...tankContainer.meshes]
      .map((n) => n.name)
      .filter((n) => n.toLowerCase().includes("cam_"))
      .slice(0, 30);
    console.warn(
      "[TankController] CAM_pivot not found in tank GLB. Falling back to default camera. CAM_* candidates:",
      allNames
    );
  }

  const reticleCameraMesh = findAbstractMeshByName(tankContainer, "UI_reticle_camera");
  const reticleBarrelMesh = findAbstractMeshByName(tankContainer, "UI_reticle_barrel");

  // Camera reticle = world-space marker at the camera ray hit point (billboard).
  if (reticleCameraMesh) {
    const pivot = new TransformNode(reticleCameraMesh.name + "_pivot", scene);
    reticleCameraMesh.setParent(pivot);
    reticleCameraMesh.position.setAll(0);
    pivot.billboardMode = Mesh.BILLBOARDMODE_ALL;
    reticleCameraMesh.rotationQuaternion = Quaternion.FromEulerAngles(0, Math.PI, 0);
    reticleCameraMesh.renderingGroupId = 1;
    reticleCameraMesh.isVisible = false;
    reticleCameraMesh.isPickable = false;
    reticleCameraMesh.alwaysSelectAsActiveMesh = true;
    if (reticleCameraMesh.material) {
      reticleCameraMesh.material.backFaceCulling = false;
    }
  }

  // Barrel reticle = world element (billboard at hit point).
  if (reticleBarrelMesh) {
    const pivot = new TransformNode(reticleBarrelMesh.name + "_pivot", scene);
    reticleBarrelMesh.setParent(pivot);
    reticleBarrelMesh.position.setAll(0); // Center the mesh on the pivot
    pivot.billboardMode = Mesh.BILLBOARDMODE_ALL;
    reticleBarrelMesh.rotationQuaternion = Quaternion.FromEulerAngles(0, Math.PI, 0);
    reticleBarrelMesh.renderingGroupId = 1;
    reticleBarrelMesh.isVisible = false;
    reticleBarrelMesh.isPickable = false;
    reticleBarrelMesh.alwaysSelectAsActiveMesh = true;
    if (reticleBarrelMesh.material) {
      reticleBarrelMesh.material.backFaceCulling = false;
    }
  }

  const ammoShellMesh = findMeshByName(tankContainer, "AMMO_obus");
  if (ammoShellMesh) {
    ammoShellMesh.isVisible = false;
    ammoShellMesh.setParent(null);
  }

  const ammoBulletMesh = findMeshByName(tankContainer, "AMMO_balle");
  if (ammoBulletMesh) {
    ammoBulletMesh.isVisible = false;
    ammoBulletMesh.setParent(null);
  }

  const muzzleNode = findTransformNode(tankContainer, "MUZZLE_tank");

  // Only dispose the fallback camera if we successfully switched to another active camera.
  if (scene.activeCamera !== fallbackCamera) {
    fallbackCamera.dispose();
  }
  const controller = new TankGameplayController({
    scene,
    canvas,
    config,
    tankContainer,
    tankAnchor,
    tankVisualRoot,
    groundingInfo: groundingInfo,
    suspensionInfo,
    tankBody: tankPhysics.body,
    tankCamera,
    tankZoomCamera,
    cameraPivotNode: camPivotNode,
    initialOrbit,
    reticleCameraMesh,
    reticleBarrelMesh,
    muzzleNode,
    ammoShellMesh,
    ammoBulletMesh
  });


  return {
    scene,
    summary: {
      spawnFound: Boolean(spawnNode),
      tankCameraFound: Boolean(camStartNode) || Boolean(camPivotNode),
      terrainStaticMeshes: countNamedMeshes(terrainContainer, "SM_"),
      terrainDynamicMeshes: countNamedMeshes(terrainContainer, "DM_"),
      terrainColliderMeshes: countNamedMeshes(terrainContainer, "COL_"),
      tankBones: collectBoneMatches(tankContainer)
    },
    getDebugState: () => controller.getDebugState(),
    dispose: () => {
      controller.dispose();
      disposePhysicsGroup(worldPhysics);
      tankPhysics.body.dispose();
      tankPhysics.shape.dispose();
    }
  };
}

function parentTankNodes(
  container: AssetContainer,
  physicsAnchor: TransformNode,
  visualRoot: TransformNode
): void {
  for (const mesh of container.meshes.filter((candidate) => !candidate.parent)) {
    mesh.parent = mesh.name === "COL_tank" ? physicsAnchor : visualRoot;
  }

  for (const node of container.transformNodes.filter((candidate) => !candidate.parent)) {
    if (node === physicsAnchor || node === visualRoot) {
      continue;
    }

    node.parent = visualRoot;
  }

  for (const camera of container.cameras.filter((candidate) => !candidate.parent)) {
    camera.parent = visualRoot;
  }
}

function findTransformNode(
  container: AssetContainer,
  name: string
): TransformNode | AbstractMesh | null {
  const candidates = [...container.transformNodes, ...container.meshes];
  const wanted = name.trim().toLowerCase();
  return (
    candidates.find((node) => {
      const n = node.name.trim().toLowerCase();
      return n === wanted || n.startsWith(`${wanted}.`);
    }) ?? null
  );
}

function refreshTankRigWorldMatrices(tankAnchor: TransformNode, container: AssetContainer): void {
  tankAnchor.computeWorldMatrix(true);
  for (const node of container.transformNodes) {
    node.computeWorldMatrix(true);
  }
  for (const mesh of container.meshes) {
    mesh.computeWorldMatrix(true);
  }
}

function snapTankAnchorYToTerrain(
  scene: Scene,
  tankAnchor: TransformNode,
  tankBody: PhysicsBody,
  suspensionLocals: Vector3[],
  config: TankControllerConfig
): void {
  if (suspensionLocals.length === 0) {
    return;
  }

  const engine = scene.getPhysicsEngine();
  if (!engine) {
    return;
  }

  tankAnchor.computeWorldMatrix(true);
  const q = tankAnchor.absoluteRotationQuaternion ?? tankAnchor.rotationQuaternion ?? Quaternion.Identity();
  const rayStartHeight = config.suspension.rayStartHeight;
  const restLength = config.suspension.restLength;
  const targetDist = rayStartHeight + restLength;
  const longDown = 80;
  let maxDrop = 0;

  for (const local of suspensionLocals) {
    const worldPoint = tankAnchor.getAbsolutePosition().add(local.clone().applyRotationQuaternion(q));
    const from = worldPoint.add(Axis.Y.scale(rayStartHeight));
    const to = from.add(Axis.Y.scale(-longDown));
    const hit = engine.raycast(from, to, {
      ignoreBody: tankBody,
      shouldHitTriggers: false,
      collideWith: ~4
    });
    if (!hit.hasHit) {
      continue;
    }
    hit.calculateHitDistance();
    const drop = hit.hitDistance - targetDist;
    if (drop > maxDrop) {
      maxDrop = drop;
    }
  }

  if (maxDrop > 0.002) {
    tankAnchor.position.y -= maxDrop;
    tankAnchor.computeWorldMatrix(true);
    tankBody.setLinearVelocity(Vector3.Zero());
    tankBody.setAngularVelocity(Vector3.Zero());
  }
}

function hideColliderMeshes(container: AssetContainer, scene: Scene): void {
  const debugShowColliders = false;

  let redWireframeMat = scene.getMaterialByName("debug_red_wireframe") as StandardMaterial | null;
  if (!redWireframeMat) {
    redWireframeMat = new StandardMaterial("debug_red_wireframe", scene);
    redWireframeMat.emissiveColor = new Color3(1, 0, 0);
    redWireframeMat.wireframe = true;
    redWireframeMat.disableLighting = true;
    redWireframeMat.backFaceCulling = false;
  }

  for (const mesh of container.meshes) {
    const isCollider = mesh.name.startsWith("COL_") || mesh.name === "COL_tank";
    const isTerrainStatic = mesh.name.startsWith("SM_");
    const isTerrainDynamic = mesh.name.startsWith("DM_");

    if (!isCollider && !isTerrainStatic && !isTerrainDynamic) {
      continue;
    }
    // Keep gameplay picking for SM_/DM_ (reticle raycast), but never pick colliders.
    if (isCollider) {
      mesh.isPickable = false;
    }

    if (isCollider) {
      mesh.isVisible = debugShowColliders;
    } else if (debugShowColliders) {
      mesh.isVisible = true;
    }

    if (debugShowColliders && mesh instanceof Mesh) {
      mesh.material = redWireframeMat;
    }
  }
}

function countNamedMeshes(container: AssetContainer, prefix: string): number {
  return container.meshes.filter((mesh) => mesh.name.startsWith(prefix)).length;
}

function collectBoneMatches(container: AssetContainer): string[] {
  return REQUIRED_BONES.filter((boneName) =>
    container.skeletons.some((skeleton) => skeleton.bones.some((bone) => bone.name === boneName))
  );
}

function toRadians(valueInDegrees: number): number {
  return (valueInDegrees * Math.PI) / 180;
}

function extractHorizontalSpawnRotation(
  spawnNode: TransformNode | AbstractMesh,
  forwardAxisName: "x" | "y" | "z",
  forwardSign: 1 | -1
): Quaternion {
  const sourceAxis =
    forwardAxisName === "x" ? Axis.X : forwardAxisName === "y" ? Axis.Y : Axis.Z;
  const forward = spawnNode.getDirection(sourceAxis).scale(forwardSign);
  forward.y = 0;

  if (forward.lengthSquared() < 1e-6) {
    return Quaternion.Identity();
  }

  forward.normalize();
  return Quaternion.FromLookDirectionRH(forward, Axis.Y);
}

function createWorldPhysics(container: AssetContainer, scene: Scene): PhysicsResourceGroup {
  const bodies: PhysicsBody[] = [];
  const shapes: PhysicsShape[] = [];

  for (const mesh of container.meshes) {
    if (!(mesh instanceof Mesh) || mesh.getTotalVertices() === 0) {
      continue;
    }

    if (mesh.name.startsWith("DM_")) {
      const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, scene);

      // Use a ConvexHull shape for dynamic meshes as it wraps the mesh geometry tightly
      const shape = new PhysicsShapeConvexHull(mesh, scene);
      shape.filterMembershipMask = 1;
      shape.filterCollideMask = 0xffffffff;

      body.shape = shape;

      // Calculate mass properties based on the mesh bounding box to ensure stable physics
      // even if the mesh origin is not perfectly centered
      const boundingInfo = mesh.getBoundingInfo();
      const extents = boundingInfo.boundingBox.extendSizeWorld;
      const volume = extents.x * extents.y * extents.z * 8; // 2*x * 2*y * 2*z

      // Use the center of the bounding box as the center of mass
      const centerOfMass = boundingInfo.boundingBox.centerWorld.subtract(mesh.getAbsolutePosition());

      body.setMassProperties({
        mass: Math.max(volume * 5, 1), // Base mass on volume, minimum 1kg
        centerOfMass: centerOfMass
      });

      body.setLinearDamping(0.6);
      body.setAngularDamping(0.8);
      bodies.push(body);
      shapes.push(shape);
      continue;
    }

    if (mesh.name.startsWith("SM_") || mesh.name.startsWith("COL_")) {
      const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, scene);
      const shape = new PhysicsShapeMesh(mesh, scene);
      shape.filterMembershipMask = 1;
      shape.filterCollideMask = 0xffffffff;
      body.shape = shape;
      bodies.push(body);
      shapes.push(shape);
    }
  }

  return { bodies, shapes };
}

function createTankPhysics(
  tankAnchor: TransformNode,
  tankColliderMesh: Mesh | null,
  grounding: TankGroundingInfo,
  scene: Scene,
  config: TankControllerConfig
): TankPhysicsResource {
  const body = new PhysicsBody(tankAnchor, PhysicsMotionType.DYNAMIC, false, scene);
  const shape = tankColliderMesh
    ? new PhysicsShapeConvexHull(tankColliderMesh, scene)
    : new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 0.5, 1.6), scene);

  // Assign the tank to collision group 2 so projectiles can ignore it
  shape.filterMembershipMask = 2;
  shape.filterCollideMask = 0xffffffff;

  body.shape = shape;
  shape.material = {
    friction: config.physics.tankFriction,
    staticFriction: config.physics.tankFriction,
    restitution: config.physics.tankRestitution
  };
  body.setMassProperties({
    mass: config.physics.tankMass,
    centerOfMass: new Vector3(0, config.physics.tankCenterOfMassYOffset, 0)
  });
  body.setLinearDamping(config.physics.tankLinearDamping);
  body.setAngularDamping(config.physics.tankAngularDamping);
  body.setGravityFactor(1);

  return { body, shape, grounding };
}

function createTankSuspensionInfo(container: AssetContainer, tankAnchor: TransformNode): TankSuspensionInfo {
  const names = ["SUS_FL", "SUS_FR", "SUS_ML", "SUS_MR", "SUS_RL", "SUS_RR"] as const;
  const nodes = names
    .map((name) => findTransformNode(container, name))
    .filter((n): n is TransformNode | AbstractMesh => n !== null);

  if (nodes.length === 6) {
    return { points: nodes.map((n) => toAnchorLocalPosition(n, tankAnchor)) };
  }

  const fallbackNames = ["GROUND_FL", "GROUND_FR", "GROUND_RL", "GROUND_RR"] as const;
  const fallbackNodes = fallbackNames
    .map((name) => findTransformNode(container, name))
    .filter((n): n is TransformNode | AbstractMesh => n !== null);

  return { points: fallbackNodes.map((n) => toAnchorLocalPosition(n, tankAnchor)) };
}

function disposePhysicsGroup(group: PhysicsResourceGroup): void {
  for (const body of group.bodies) {
    body.dispose();
  }

  for (const shape of group.shapes) {
    shape.dispose();
  }
}

function findAbstractMeshByName(container: AssetContainer, name: string): AbstractMesh | null {
  const wanted = name.trim().toLowerCase();
  return (
    container.meshes.find((candidate) => {
      const n = candidate.name.trim().toLowerCase();
      return n === wanted || n.startsWith(`${wanted}.`);
    }) ?? null
  );
}

function findMeshByName(container: AssetContainer, name: string): Mesh | null {
  const candidate = findAbstractMeshByName(container, name);
  return candidate instanceof Mesh ? candidate : null;
}

function createTankGroundingInfo(
  tankContainer: AssetContainer,
  tankAnchor: TransformNode,
  tankColliderMesh: Mesh | null,
  movementForwardAxis: "x" | "y" | "z"
): TankGroundingInfo {
  const probeNames = ["GROUND_FL", "GROUND_FR", "GROUND_RL", "GROUND_RR"] as const;
  const probeNodes = probeNames.map((name) => findTransformNode(tankContainer, name));
  if (probeNodes.every((node) => node)) {
    const [frontLeft, frontRight, rearLeft, rearRight] = probeNodes as Array<TransformNode | AbstractMesh>;
    const frontLeftLocal = toAnchorLocalPosition(frontLeft, tankAnchor);
    const frontRightLocal = toAnchorLocalPosition(frontRight, tankAnchor);
    const rearLeftLocal = toAnchorLocalPosition(rearLeft, tankAnchor);
    const rearRightLocal = toAnchorLocalPosition(rearRight, tankAnchor);
    return {
      baseClearance: Math.max(
        -((frontLeftLocal.y + frontRightLocal.y + rearLeftLocal.y + rearRightLocal.y) / 4),
        0.02
      ),
      frontLeft: frontLeftLocal,
      frontRight: frontRightLocal,
      rearLeft: rearLeftLocal,
      rearRight: rearRightLocal
    };
  }

  if (!tankColliderMesh) {
    return {
      baseClearance: 0.5,
      frontLeft: new Vector3(-0.45, 0, 0.75),
      frontRight: new Vector3(0.45, 0, 0.75),
      rearLeft: new Vector3(-0.45, 0, -0.75),
      rearRight: new Vector3(0.45, 0, -0.75)
    };
  }

  const bounds = tankColliderMesh.getBoundingInfo().boundingBox;
  const bottomFromAnchor = tankColliderMesh.position.y + bounds.minimum.y;
  const forwardExtent =
    movementForwardAxis === "x"
      ? bounds.extendSize.x
      : movementForwardAxis === "y"
        ? bounds.extendSize.y
        : bounds.extendSize.z;
  const sideExtent =
    movementForwardAxis === "x"
      ? bounds.extendSize.z
      : movementForwardAxis === "z"
        ? bounds.extendSize.x
        : bounds.extendSize.x;

  return {
    baseClearance: Math.max(-bottomFromAnchor, 0.01),
    frontLeft: new Vector3(-sideExtent * 0.7, 0, forwardExtent * 0.7),
    frontRight: new Vector3(sideExtent * 0.7, 0, forwardExtent * 0.7),
    rearLeft: new Vector3(-sideExtent * 0.7, 0, -forwardExtent * 0.7),
    rearRight: new Vector3(sideExtent * 0.7, 0, -forwardExtent * 0.7)
  };
}

function toAnchorLocalPosition(
  node: TransformNode | AbstractMesh,
  anchor: TransformNode
): Vector3 {
  const anchorRotation = anchor.absoluteRotationQuaternion ?? Quaternion.Identity();
  const anchorPosition = anchor.getAbsolutePosition();
  const worldPosition = node.getAbsolutePosition();
  const localOffset = worldPosition.subtract(anchorPosition);
  return localOffset.applyRotationQuaternion(Quaternion.Inverse(anchorRotation));
}
