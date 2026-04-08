import tankControllerConfig from "../../config/TankController.json";

export interface TankControllerConfig {
  rig: {
    spawnYawOffsetDeg: number;
    movementForwardAxis: "x" | "y" | "z";
    movementForwardSign: 1 | -1;
    turretYawAxis: "x" | "y" | "z";
    turretYawSign: 1 | -1;
    cannonPitchAxis: "x" | "y" | "z";
    cannonPitchSign: 1 | -1;
  };
  movement: {
    moveSpeed: number;
    boostMultiplier: number;
    hullTurnSpeedDeg: number;
  };
  turret: {
    yawSpeedDeg: number;
    mouseSensitivityDegPerPixel: number;
  };
  cannon: {
    pitchSpeedDeg: number;
    mouseSensitivityDegPerPixel: number;
    minPitchDeg: number;
    maxPitchDeg: number;
  };
  camera: {
    defaultFovDeg: number;
    zoomFovMultiplier: number;
    boostFovMultiplier: number;
  };
  energy: {
    batteryMax: number;
    overchargeMax: number;
    startingBattery: number;
    startingOvercharge: number;
    batteryDrainMovingPerSecond: number;
    overchargeDrainBoostPerSecond: number;
  };
  weapons: {
    powerUpBonusPerStack: number;
    maxStacks: number;
    shell: {
      startingReserveAmmo: number;
      startsChambered: boolean;
      reloadSeconds: number;
      damage: number;
      muzzleVelocity: number;
      gravityMultiplier: number;
    };
    bullet: {
      shotsPerSecond: number;
      damage: number;
      muzzleVelocity: number;
      gravityMultiplier: number;
    };
  };
}

export const tankConfig = tankControllerConfig as TankControllerConfig;
