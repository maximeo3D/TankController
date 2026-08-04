import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import type { Scene } from "@babylonjs/core/scene";
import type { RadarHud } from "./RadarHud";
import type { VehicleSelectorHud } from "./VehicleSelectorHud";

export interface SceneGameplayUiState {
  hudTexture: AdvancedDynamicTexture;
  hudLayoutReady: boolean;
  hudReticlesAttached: boolean;
  radarHud: RadarHud | null;
  vehicleSelectorHud: VehicleSelectorHud | null;
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
