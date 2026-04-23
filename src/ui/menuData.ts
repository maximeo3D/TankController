import { terrainAssetUrl } from "../assets/assetUrls";
import type { LevelDefinition } from "../app/levels";

export interface MenuMission {
  id: string;
  label: string;
}

export interface MenuMapEntry {
  id: string;
  label: string;
  /** Base terrain GLB for this map (loaded by gameplay scene). */
  level: LevelDefinition;
  missions: MenuMission[];
}

export const MENU_MAPS: readonly MenuMapEntry[] = [
  {
    id: "training",
    label: "Training",
    level: {
      id: "training-ground",
      name: "Training",
      description: "Terrain de test.",
      terrainUrl: terrainAssetUrl
    },
    missions: [{ id: "test", label: "test" }]
  },
  {
    id: "living_room",
    label: "Living Room",
    level: {
      id: "living-room",
      name: "Living Room",
      description: "Salon",
      terrainUrl: new URL("../../assets/livingroom.glb", import.meta.url).href
    },
    missions: [{ id: "destruction", label: "destruction" }]
  }
] as const;

