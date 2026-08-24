import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { LevelEnvironmentConfig } from "../app/levels";
import { resolveSunDirection, resolveSunDirectionalIntensity } from "./applyLevelEnvironment";

const DEFAULT_SUN_DIRECTION: [number, number, number] = [0.35, -1, 0.25];
/** Assez fort pour que l’ombre existe malgré IBL + hemi. */
const DEFAULT_SUN_DIRECTIONAL_INTENSITY = 0.9;
const SHADOW_MAP_SIZE = 1024;
const SHADOW_MAX_Z = 50;
/** Far plane des caméras gameplay — le CSM découpe camera.maxZ, 10000 casse les ombres. */
export const GAMEPLAY_CAMERA_MAX_Z = 80;

export interface DynamicShadows {
  addCaster(mesh: AbstractMesh): void;
  addCasterMeshes(meshes: readonly AbstractMesh[]): void;
  addCastersFromRoot(root: TransformNode): void;
  splitFrustum(): void;
  dispose(): void;
}

function isExcludedGameplayMesh(name: string): boolean {
  return (
    name.startsWith("COL_") ||
    name.startsWith("AMMO_") ||
    name.startsWith("FX_") ||
    name.startsWith("CAM_") ||
    name.startsWith("UI_") ||
    name.startsWith("TEX_") ||
    name.startsWith("SPAWN_") ||
    name.startsWith("PU_") ||
    name === "hdrSkyBox"
  );
}

function isGameplayShadowCaster(mesh: AbstractMesh): boolean {
  if (mesh.getTotalVertices() <= 0) {
    return false;
  }
  return !isExcludedGameplayMesh(mesh.name);
}

function isTerrainShadowReceiver(mesh: AbstractMesh): boolean {
  if (mesh.getTotalVertices() <= 0) {
    return false;
  }
  return !isExcludedGameplayMesh(mesh.name);
}

function prepareReceiverMaterial(mesh: AbstractMesh): void {
  const material = mesh.material as
    | { unlit?: boolean; disableLighting?: boolean }
    | null
    | undefined;
  if (!material) {
    return;
  }
  if (material.unlit) {
    material.unlit = false;
  }
  if (material.disableLighting) {
    material.disableLighting = false;
  }
}

/**
 * Soleil directionnel + CSM (PCF) : le terrain reçoit, véhicules et ennemis projettent.
 */
export function createDynamicShadows(
  scene: Scene,
  terrainContainer: AssetContainer,
  environment: LevelEnvironmentConfig | undefined
): DynamicShadows | null {
  try {
    scene.shadowsEnabled = true;

    const [dx, dy, dz] = resolveSunDirection(environment, DEFAULT_SUN_DIRECTION);
    const sun = new DirectionalLight("dir_sun", new Vector3(dx, dy, dz).normalize(), scene);
    sun.intensity = resolveSunDirectionalIntensity(environment, DEFAULT_SUN_DIRECTIONAL_INTENSITY);
    sun.shadowEnabled = true;

    const generator = new CascadedShadowGenerator(SHADOW_MAP_SIZE, sun);
    generator.numCascades = 2;
    generator.lambda = 0.85;
    generator.stabilizeCascades = true;
    generator.shadowMaxZ = SHADOW_MAX_Z;
    generator.frustumEdgeFalloff = 0.2;
    generator.usePercentageCloserFiltering = true;
    generator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    generator.bias = 0.0005;
    generator.normalBias = 0.01;
    generator.depthClamp = true;
    generator.autoCalcDepthBounds = false;
    generator.darkness = 0;

    let receiverCount = 0;
    for (const mesh of terrainContainer.meshes) {
      if (!isTerrainShadowReceiver(mesh)) {
        continue;
      }
      mesh.receiveShadows = true;
      prepareReceiverMaterial(mesh);
      receiverCount += 1;
    }

    if (receiverCount === 0) {
      console.warn("[TankController] No terrain meshes marked to receive shadows.");
    }

    const addCaster = (mesh: AbstractMesh): void => {
      if (!isGameplayShadowCaster(mesh)) {
        return;
      }
      generator.addShadowCaster(mesh, false);
      mesh.receiveShadows = true;
    };

    const splitFrustum = (): void => {
      generator.splitFrustum();
    };

    const cameraObserver: Observer<Scene> | null = scene.onActiveCameraChanged.add(() => {
      splitFrustum();
    });

    return {
      addCaster,
      addCasterMeshes(meshes: readonly AbstractMesh[]): void {
        for (const mesh of meshes) {
          addCaster(mesh);
        }
      },
      addCastersFromRoot(root: TransformNode): void {
        for (const mesh of root.getChildMeshes(false)) {
          addCaster(mesh);
        }
      },
      splitFrustum,
      dispose(): void {
        if (cameraObserver) {
          scene.onActiveCameraChanged.remove(cameraObserver);
        }
        generator.dispose();
        sun.dispose();
      }
    };
  } catch (err) {
    console.warn("[TankController] Cascaded shadows could not be created:", err);
    return null;
  }
}
