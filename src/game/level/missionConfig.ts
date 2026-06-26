import type { LevelDefinition } from "../../app/levels";
import type { MenuMission, MissionVehicleSpawn } from "../../ui/menuData";
import type { VehicleInstanceId, VehicleTypeId } from "../vehicle/VehicleController";

export type { MissionVehicleSpawn };

export interface LevelMissionContext {
  level: LevelDefinition;
  mission: MenuMission | null;
  vehicles: MissionVehicleSpawn[];
  startVehicleId: VehicleInstanceId;
}

const DEFAULT_TANK_SPAWN: MissionVehicleSpawn = {
  id: "player_tank",
  type: "tank",
  spawnNode: "SPAWN_tank"
};

export function resolveLevelMissionContext(
  level: LevelDefinition,
  mission: MenuMission | null
): LevelMissionContext {
  const vehicles = mission?.vehicles?.length ? [...mission.vehicles] : [DEFAULT_TANK_SPAWN];
  const startVehicleId = mission?.startVehicleId ?? vehicles[0]?.id ?? DEFAULT_TANK_SPAWN.id;

  if (!vehicles.some((vehicle) => vehicle.id === startVehicleId)) {
    console.warn(
      `[LevelManager] startVehicleId "${startVehicleId}" not found in mission vehicles; using "${vehicles[0].id}".`
    );
  }

  return {
    level,
    mission,
    vehicles,
    startVehicleId: vehicles.some((vehicle) => vehicle.id === startVehicleId)
      ? startVehicleId
      : vehicles[0].id
  };
}

export function getMissionVehicleSpawn(
  context: LevelMissionContext,
  type: VehicleTypeId
): MissionVehicleSpawn | null {
  return context.vehicles.find((vehicle) => vehicle.type === type) ?? null;
}
