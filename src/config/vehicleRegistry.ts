import tankControllerConfig from "../../config/TankController.json";
import armoredCarConfig from "../../config/vehicles/armoredCar.json";
import fighterJetConfig from "../../config/vehicles/fighterJet.json";
import type { TankControllerConfig } from "./tankController";
import type { VehicleTypeId } from "../game/vehicle/VehicleController";

export type VehicleConfigByType = {
  tank: TankControllerConfig;
  armoredCar: TankControllerConfig;
  fighterJet: TankControllerConfig;
};

export const vehicleConfigs: VehicleConfigByType = {
  tank: tankControllerConfig as TankControllerConfig,
  armoredCar: armoredCarConfig as TankControllerConfig,
  fighterJet: fighterJetConfig as unknown as TankControllerConfig
};

export function getVehicleConfig<T extends VehicleTypeId>(type: T): VehicleConfigByType[T] {
  return vehicleConfigs[type];
}
