import { terrainAssetUrl } from "../assets/assetUrls";
import type { LevelDefinition } from "../app/levels";

export type VehicleTypeId = "tank" | "armoredCar" | "fighterJet" | "helicopter";

export interface MissionVehicleSpawn {
  id: string;
  type: VehicleTypeId;
  spawnNode: string;
}

export interface MenuMission {
  id: string;
  label: string;
  description: string;
  imageUrl: string;
  radarMapUrl?: string;
  radar?: {
    centerX: number;
    centerZ: number;
    width: number;
    height: number;
    rotationDeg?: 0 | 90 | 180 | 270;
    flipX?: boolean;
    flipY?: boolean;
    /** 1 = zoom par défaut, >1 = plus proche, <1 = plus éloigné. */
    zoom?: number;
  };
  /** Véhicules disponibles dans ce niveau / mission. */
  vehicles?: MissionVehicleSpawn[];
  /** Instance active au démarrage (doit correspondre à un `vehicles[].id`). */
  startVehicleId?: string;
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
      terrainUrl: terrainAssetUrl,
      environment: {
        fog: {
          mode: "exp2",
          color: [0.72, 0.78, 0.88],
          density: 0.002
        }
      }
    },
    missions: [
      {
        id: "test",
        label: "test",
        description: "Une zone d'entrainement courte pour tester les commandes du tank et valider les systemes de mission.",
        imageUrl: new URL("../../assets/ui/level-training-test.png", import.meta.url).href,
        radarMapUrl: new URL("../../assets/maps/map-training-test.png", import.meta.url).href,
        radar: {
          centerX: 0,
          centerZ: 0,
          width: 60,
          height: 60,
          zoom: 0.35,
          rotationDeg: 90,
          flipX: true,
          flipY: false
        },
        vehicles: [
          { id: "player_tank", type: "tank", spawnNode: "SPAWN_tank" },
          { id: "player_armoredcar", type: "armoredCar", spawnNode: "SPAWN_armoredcar" },
          { id: "player_jet", type: "fighterJet", spawnNode: "SPAWN_jet" },
          { id: "player_helicopter", type: "helicopter", spawnNode: "SPAWN_helicopter" }
        ],
        startVehicleId: "player_armoredcar"
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
      terrainUrl: new URL("../../assets/livingroom.glb", import.meta.url).href,
      environment: {
        clearColor: [0.06, 0.05, 0.045, 1],
        environmentIntensity: 0.35,
        sunIntensity: 0.35,
        fog: {
          mode: "exp2",
          color: [0.85, 0.85, 0.9],
          density: 0.002
        }
      }
    },
    missions: [
      {
        id: "destruction",
        label: "destruction",
        description: "Un salon transforme en champ de bataille. Avance entre les obstacles et detruis les cibles prioritaires.",
        imageUrl: new URL("../../assets/ui/level-livingroom-destruction.png", import.meta.url).href,
        vehicles: [
          { id: "player_tank", type: "tank", spawnNode: "SPAWN_tank" },
          { id: "player_helicopter", type: "helicopter", spawnNode: "SPAWN_helicopter" },
          { id: "player_jet", type: "fighterJet", spawnNode: "SPAWN_jet" },
          { id: "player_armoredcar", type: "armoredCar", spawnNode: "SPAWN_armoredcar" }
        ],
        startVehicleId: "player_tank"
      }
    ]
  }
] as const;

