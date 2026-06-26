import tankControllerConfig from "../../config/TankController.json";
import armoredCarConfig from "../../config/vehicles/armoredCar.json";
import type { TankControllerConfig } from "./tankController";
import type { VehicleTypeId } from "../game/vehicle/VehicleController";

export interface ArmoredCarConfig {
  id: "armoredCar";
  label: string;
  assetFile: string;
  rig: {
    spawnYawOffsetDeg: number;
    movementForwardAxis: "x" | "y" | "z";
    movementForwardSign: 1 | -1;
    movementInputSign: 1 | -1;
    turretYawAxis: "x" | "y" | "z";
    turretYawSign: 1 | -1;
    weaponPitchAxis: "x" | "y" | "z";
    weaponPitchSign: 1 | -1;
  };
  movement: {
    moveSpeed: number;
    boostMultiplier: number;
    steerSpeedDeg: number;
    inputRiseRate: number;
    inputFallRate: number;
  };
  camera: {
    defaultFovDeg: number;
    zoomViewFovDeg: number;
    orbitDefaultRadius: number;
  };
  weapons: {
    machinegun: {
      fireRatePerSecond: number;
      spreadDeg: number;
    };
    rocketPod: {
      salvoSize: number;
      reloadSeconds: number;
    };
  };
}

export type VehicleConfigByType = {
  tank: TankControllerConfig;
  armoredCar: ArmoredCarConfig;
};

export const vehicleConfigs: VehicleConfigByType = {
  tank: tankControllerConfig as TankControllerConfig,
  armoredCar: armoredCarConfig as ArmoredCarConfig
};

export function getVehicleConfig<T extends VehicleTypeId>(type: T): VehicleConfigByType[T] {
  return vehicleConfigs[type];
}
