import tankControllerConfig from "../../config/TankController.json";

export interface TankControllerConfig {
  rig: {
    spawnYawOffsetDeg: number;
    movementForwardAxis: "x" | "y" | "z";
    movementForwardSign: 1 | -1;
    movementInputSign: 1 | -1;
    turretYawAxis: "x" | "y" | "z";
    turretYawSign: 1 | -1;
    cannonPitchAxis: "x" | "y" | "z";
    cannonPitchSign: 1 | -1;
  };
  movement: {
    moveSpeed: number;
    boostMultiplier: number;
    hullTurnSpeedDeg: number;
    acceleration: number;
    brakeDeceleration: number;
    inputRiseRate: number;
    inputFallRate: number;
    lateralGrip: number;
  };
  physics: {
    tankMass: number;
    tankLinearDamping: number;
    tankAngularDamping: number;
    tankCenterOfMassYOffset: number;
    tankFriction: number;
    tankRestitution: number;
  };
  grounding: {
    probeStartHeight: number;
    maxHitAboveProbeBaseY: number;
    probeLength: number;
    groundClearance: number;
    groundSnapSpeed: number;
    maxGroundSlopeDeg: number;
    visualTiltSharpness: number;
    positionSharpness: number;
  };
  suspension: {
    rayStartHeight: number;
    rayLength: number;
    restLength: number;
    springStrength: number;
    damperStrength: number;
    maxForce: number;
    tractionForce: number;
    lateralFriction: number;
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
    /** Décalage local Y ajouté au bone `canon` à chaque tir (m ; ajuster le signe selon l’orientation du bone dans Blender). */
    recoilKickY: number;
    /** Vitesse de retour du recul vers la position de repos (unités Z par seconde). */
    recoilReturnSpeed: number;
  };
  camera: {
    defaultFovDeg: number;
    zoomFovMultiplier: number;
    zoomViewFovDeg: number;
    boostFovMultiplier: number;
    orbitCollisionEnabled: boolean;
    orbitCollisionPadding: number;
    orbitYawDegPerPixel: number;
    orbitPitchDegPerPixel: number;
    orbitYawSign: 1 | -1;
    orbitPitchSign: 1 | -1;
    orbitClampRadius: boolean;
    orbitMinPitchDeg: number;
    orbitMaxPitchDeg: number;
    orbitMinRadius: number;
    orbitMaxRadius: number;
    orbitDefaultRadius: number;
  };
  aim: {
    cameraMaxTargetDistance: number;
    barrelRayMaxDistance: number;
  };
  // Optional for backward compatibility with older configs.
  tracks?: {
    enabled: boolean;
    spacing: number;
    maxPointsPerRibbon: number;
    segmentLength: number;
    segmentWidth: number;
    uvRepeatU: number;
    uvRepeatV: number;
    yOffset: number;
    raycastStartHeight: number;
    raycastLength: number;
    opacityMultiplier: number;
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
