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
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
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

export async function createGameplayScene(
  engine: Engine,
  _level: LevelDefinition,
  config: TankControllerConfig,
  canvas: HTMLCanvasElement
): Promise<GameplaySceneBundle> {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.05, 0.06, 0.08, 1);

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

  const spawnNode = findTransformNode(terrainContainer, "SPAWN_tank");

  const tankContainer = await SceneLoader.LoadAssetContainerAsync("", tankAssetUrl, scene);
  tankContainer.addAllToScene();
  hideColliderMeshes(tankContainer);

  const tankAnchor = new TransformNode("tank_anchor", scene);
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

  parentTopLevelNodesToAnchor(tankContainer, tankAnchor);

  const tankCamera = tankContainer.cameras.find((camera) => camera.name === "CAM_tank") ?? null;
  if (tankCamera) {
    tankCamera.fov = toRadians(config.camera.defaultFovDeg);
    tankCamera.minZ = 0.01;
    scene.activeCamera = tankCamera;
  }

  fallbackCamera.dispose();
  const controller = new TankGameplayController({
    scene,
    canvas,
    config,
    tankContainer,
    tankAnchor,
    tankCamera
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
    dispose: () => controller.dispose()
  };
}

function parentTopLevelNodesToAnchor(container: AssetContainer, anchor: TransformNode): void {
  const topLevelNodes = [
    ...container.meshes.filter((mesh) => !mesh.parent),
    ...container.transformNodes.filter((node) => !node.parent),
    ...container.cameras.filter((camera) => !camera.parent)
  ];

  for (const node of topLevelNodes) {
    if (node === anchor) {
      continue;
    }

    node.parent = anchor;
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
    mesh.setEnabled(false);
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
