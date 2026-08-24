import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import type { LevelEnvironmentConfig, LevelFogConfig } from "../app/levels";

function resolveFogMode(mode: LevelFogConfig["mode"]): number {
  switch (mode) {
    case "exp":
      return Scene.FOGMODE_EXP;
    case "exp2":
      return Scene.FOGMODE_EXP2;
    case "linear":
      return Scene.FOGMODE_LINEAR;
    default:
      return Scene.FOGMODE_NONE;
  }
}

function applyFog(scene: Scene, fog: LevelFogConfig): void {
  if (fog.enabled === false) {
    scene.fogMode = Scene.FOGMODE_NONE;
    return;
  }

  const mode = resolveFogMode(fog.mode ?? "exp2");
  scene.fogMode = mode;

  if (fog.color) {
    scene.fogColor = new Color3(fog.color[0], fog.color[1], fog.color[2]);
  }

  if (mode === Scene.FOGMODE_LINEAR) {
    scene.fogStart = fog.start ?? 20;
    scene.fogEnd = fog.end ?? 60;
    return;
  }

  scene.fogDensity = fog.density ?? 0.01;
}

/**
 * Ambiance par map : fond, IBL et brouillard (voir doc Babylon « Environment »).
 * @see https://doc.babylonjs.com/features/featuresDeepDive/environment/environment_introduction
 */
export function applyLevelEnvironment(scene: Scene, config: LevelEnvironmentConfig | undefined): void {
  if (!config) {
    return;
  }

  if (config.clearColor) {
    const [r, g, b, a = 1] = config.clearColor;
    scene.clearColor = new Color4(r, g, b, a);
  }

  if (config.environmentIntensity !== undefined) {
    scene.environmentIntensity = config.environmentIntensity;
  }

  if (config.fog) {
    applyFog(scene, config.fog);
  }
}

export function resolveSunIntensity(config: LevelEnvironmentConfig | undefined, fallback: number): number {
  return config?.sunIntensity ?? fallback;
}

export function resolveSunDirectionalIntensity(
  config: LevelEnvironmentConfig | undefined,
  fallback: number
): number {
  return config?.sunDirectionalIntensity ?? fallback;
}

export function resolveSunDirection(
  config: LevelEnvironmentConfig | undefined,
  fallback: readonly [number, number, number]
): [number, number, number] {
  return config?.sunDirection ?? [fallback[0], fallback[1], fallback[2]];
}
