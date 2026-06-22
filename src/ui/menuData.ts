import { terrainAssetUrl } from "../assets/assetUrls";
import type { LevelDefinition } from "../app/levels";

export interface MenuMission {
  id: string;
  label: string;
  description: string;
  imageUrl: string;
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
    missions: [
      {
        id: "test",
        label: "test",
        description: "Une zone d'entrainement courte pour tester les commandes du tank et valider les systemes de mission.",
        imageUrl: new URL("../../assets/ui/level-training-test.png", import.meta.url).href
      }
    ]
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
    missions: [
      {
        id: "destruction",
        label: "destruction",
        description: "Un salon transforme en champ de bataille. Avance entre les obstacles et detruis les cibles prioritaires.",
        imageUrl: new URL("../../assets/ui/level-livingroom-destruction.png", import.meta.url).href
      }
    ]
  }
] as const;

