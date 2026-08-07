import { terrainAssetUrl } from "../assets/assetUrls";

/** Brouillard Babylon — voir Scene.FOGMODE_* dans la doc Environment. */
export interface LevelFogConfig {
  /** false pour désactiver explicitement le fog sur une map. */
  enabled?: boolean;
  /** exp / exp2 (distance) ou linear (start/end). Défaut : exp2. */
  mode?: "exp" | "exp2" | "linear";
  /** Couleur RGB du brouillard [0–1]. */
  color?: [number, number, number];
  /** Densité pour exp / exp2 (typ. 0.002–0.05). */
  density?: number;
  /** Distance de début (linear). */
  start?: number;
  /** Distance de fin (linear). */
  end?: number;
}

/** Ambiance globale d'une map (ciel, IBL, fog). */
export interface LevelEnvironmentConfig {
  /** Couleur de fond si le ciel / skybox ne couvre pas tout [r,g,b,a]. */
  clearColor?: [number, number, number, number];
  /** Intensité de la reflection probe (scene.environmentIntensity). */
  environmentIntensity?: number;
  /** Intensité de la HemisphericLight « sun ». */
  sunIntensity?: number;
  fog?: LevelFogConfig;
}

export interface LevelDefinition {
  id: string;
  name: string;
  description: string;
  /** URL du GLB terrain (même contrat que `terrain.glb` : SM_/DM_/COL_/SPAWN_tank, etc.). */
  terrainUrl: string;
  /** Ambiance (fog, fond, lumière) propre à cette map. */
  environment?: LevelEnvironmentConfig;
}

export const levels: LevelDefinition[] = [
  {
    id: "training-ground",
    name: "Training Ground",
    description: "Terrain de test.",
    terrainUrl: terrainAssetUrl
  },
  {
    id: "living-room",
    name: "Salon",
    description: "Salon",
    terrainUrl: new URL("../../assets/livingroom.glb", import.meta.url).href
  }
];
