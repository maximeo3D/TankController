import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import type { Scene } from "@babylonjs/core/scene";
import type { Sprite } from "@babylonjs/core/Sprites/sprite";
import type { SpriteManager } from "@babylonjs/core/Sprites/spriteManager";
import type { RadarHud } from "./RadarHud";
import type { VehicleSelectorHud } from "./VehicleSelectorHud";

export interface SceneSparkImpactState {
  manager: SpriteManager;
  pool: Sprite[];
  active: {
    sprite: Sprite;
    age: number;
    life: number;
    grow: number;
    maxSize: number;
  }[];
}

export interface SceneGameplayUiState {
  hudTexture: AdvancedDynamicTexture;
  hudLayoutReady: boolean;
  hudReticlesAttached: boolean;
  radarHud: RadarHud | null;
  vehicleSelectorHud: VehicleSelectorHud | null;
  sparkImpact: SceneSparkImpactState | null;
}

const SCENE_UI_METADATA_KEY = "gameplayUi";

export function getSceneGameplayUi(scene: Scene): SceneGameplayUiState | null {
  const metadata = scene.metadata as Record<string, unknown> | undefined;
  const state = metadata?.[SCENE_UI_METADATA_KEY];
  return state && typeof state === "object" ? (state as SceneGameplayUiState) : null;
}

export function setSceneGameplayUi(scene: Scene, state: SceneGameplayUiState): void {
  scene.metadata = {
    ...(scene.metadata as Record<string, unknown> | undefined),
    [SCENE_UI_METADATA_KEY]: state
  };
}

export function clearSceneGameplayUi(scene: Scene): void {
  const metadata = { ...(scene.metadata as Record<string, unknown> | undefined) };
  delete metadata[SCENE_UI_METADATA_KEY];
  scene.metadata = metadata;
}

export function getSceneSparkImpact(scene: Scene): SceneSparkImpactState | null {
  return getSceneGameplayUi(scene)?.sparkImpact ?? null;
}

export function setSceneSparkImpact(scene: Scene, sparkImpact: SceneSparkImpactState): void {
  const sharedUi = getSceneGameplayUi(scene);
  if (!sharedUi) {
    return;
  }
  setSceneGameplayUi(scene, { ...sharedUi, sparkImpact });
}

export function disposeSceneSparkImpact(scene: Scene): void {
  const spark = getSceneSparkImpact(scene);
  if (!spark) {
    return;
  }

  for (const entry of spark.active) {
    entry.sprite.dispose();
  }
  for (const sprite of spark.pool) {
    sprite.dispose();
  }
  spark.manager.dispose();

  const sharedUi = getSceneGameplayUi(scene);
  if (sharedUi) {
    setSceneGameplayUi(scene, { ...sharedUi, sparkImpact: null });
  }
}
