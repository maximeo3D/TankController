import HavokPhysics from "@babylonjs/havok";
import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Physics/physicsEngineComponent";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Color4 } from "@babylonjs/core/Maths/math.color";
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
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TankControllerConfig } from "../config/tankController";
import { tankAssetUrl, terrainAssetUrl } from "../assets/assetUrls";
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

interface TankPhysicsResource {
  body: PhysicsBody;
  shape: PhysicsShape;
  grounding: TankGroundingInfo;
}

export async function createGameplayScene(
  engine: Engine,
  _level: LevelDefinition,
  config: TankControllerConfig,
  canvas: HTMLCanvasElement
): Promise<GameplaySceneBundle> {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.05, 0.06, 0.08, 1);
  
  // Hide the default cursor in Babylon.js
  scene.defaultCursor = "none";
  scene.hoverCursor = "none";

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

  new HemisphericLight("sun", new Vector3(0.2, 1, 0.1), scene).intensity = 1.1;

  const havok = await HavokPhysics();
  const havokPlugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);

  const terrainContainer = await SceneLoader.LoadAssetContainerAsync("", terrainAssetUrl, scene);
  terrainContainer.addAllToScene();
  hideColliderMeshes(terrainContainer);
  const worldPhysics = createWorldPhysics(terrainContainer, scene);

  const spawnNode = findTransformNode(terrainContainer, "SPAWN_tank");

  const tankContainer = await SceneLoader.LoadAssetContainerAsync("", tankAssetUrl, scene);
  tankContainer.addAllToScene();
  hideColliderMeshes(tankContainer);

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
  const groundingInfo = createTankGroundingInfo(
    tankContainer,
    tankAnchor,
    tankColliderMesh,
    config.rig.movementForwardAxis
  );
  const tankPhysics = createTankPhysics(tankAnchor, tankColliderMesh, groundingInfo, scene, config);

  const tankCamera = tankContainer.cameras.find((camera) => camera.name === "CAM_tank") ?? null;
  if (tankCamera) {
    tankCamera.fov = toRadians(config.camera.defaultFovDeg);
    tankCamera.minZ = 0.01;
    scene.activeCamera = tankCamera;
  }

  const reticleMesh = findMeshByName(tankContainer, "UI_tank_reticle");
  if (reticleMesh) {
    // Make sure it's rendered on top of everything
    reticleMesh.renderingGroupId = 1;
    // Unparent so we can move it freely in world space
    reticleMesh.setParent(null);
    // Always face the camera
    reticleMesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  }

  fallbackCamera.dispose();
  const controller = new TankGameplayController({
    scene,
    canvas,
    config,
    tankContainer,
    tankAnchor,
    tankVisualRoot,
    groundingInfo: groundingInfo,
    tankBody: tankPhysics.body,
    tankCamera,
    reticleMesh
  });

  return {
    scene,
    summary: {
      spawnFound: Boolean(spawnNode),
      tankCameraFound: Boolean(tankCamera),
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
  return (
    container.transformNodes.find((node) => node.name === name) ??
    container.meshes.find((mesh) => mesh.name === name) ??
    null
  );
}

function hideColliderMeshes(container: AssetContainer): void {
  for (const mesh of container.meshes) {
    if (!mesh.name.startsWith("COL_")) {
      continue;
    }

    mesh.isVisible = false;
    mesh.isPickable = false;
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
      const shape = new PhysicsShapeConvexHull(mesh, scene);
      body.shape = shape;
      body.setMassProperties({ mass: 5 });
      body.setLinearDamping(0.6);
      body.setAngularDamping(0.8);
      bodies.push(body);
      shapes.push(shape);
      continue;
    }

    if (mesh.name.startsWith("SM_") || mesh.name.startsWith("COL_")) {
      const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, scene);
      const shape = new PhysicsShapeMesh(mesh, scene);
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
  const body = new PhysicsBody(tankAnchor, PhysicsMotionType.ANIMATED, false, scene);
  const shape = tankColliderMesh
    ? PhysicsShapeBox.FromMesh(tankColliderMesh)
    : new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 0.5, 1.6), scene);

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
  body.setGravityFactor(0);

  return { body, shape, grounding };
}

function disposePhysicsGroup(group: PhysicsResourceGroup): void {
  for (const body of group.bodies) {
    body.dispose();
  }

  for (const shape of group.shapes) {
    shape.dispose();
  }
}

function findMeshByName(container: AssetContainer, name: string): Mesh | null {
  const mesh = container.meshes.find((candidate) => candidate.name === name);
  return mesh instanceof Mesh ? mesh : null;
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
    baseClearance: Math.max(-bottomFromAnchor, 0.02),
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
