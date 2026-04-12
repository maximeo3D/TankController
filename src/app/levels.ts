import { terrainAssetUrl } from "../assets/assetUrls";

export interface LevelDefinition {
  id: string;
  name: string;
  description: string;
  /** URL du GLB terrain (même contrat que `terrain.glb` : SM_/DM_/COL_/SPAWN_tank, etc.). */
  terrainUrl: string;
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
