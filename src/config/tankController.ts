import tankControllerConfig from "../../config/TankController.json";

/** Réglages communs par type de power-up (`PU_<id>` → `mesh_<id>`). */
export interface PowerUpTypeConfig {
  enabled: boolean;
  respawnSeconds: number;
  pickedAlpha: number;
  singleUse: boolean;
  /** RGB 0–1 — highlight dispo ([HighlightLayer](https://doc.babylonjs.com/features/featuresDeepDive/mesh/highlightLayer/)). */
  highlightAvailable: [number, number, number];
  /** RGB 0–1 — highlight en recharge. */
  highlightCooldown: [number, number, number];
}

export type PowerUpTypeId =
  | "ammo_shell"
  | "fuel"
  | "boost"
  | "repair"
  | "shield"
  | "weapon_boost";

export interface TankControllerConfig {
  debug?: {
    showSuspensionSpheres?: boolean;
    showPowerUpBounds?: boolean;
    showMuzzleEmpties?: boolean;
  };
  rig: {
    spawnYawOffsetDeg: number;
    movementForwardAxis: "x" | "y" | "z";
    movementForwardSign: 1 | -1;
    movementInputSign: 1 | -1;
    turretYawAxis: "x" | "y" | "z";
    turretYawSign: 1 | -1;
    cannonPitchAxis: "x" | "y" | "z";
    cannonPitchSign: 1 | -1;
    /** Bone de pitch des armes (défaut `canon`, voiture blindée : `armes`). */
    pitchBone?: string;
    /** Bone minigun enfant du pitch — rotation Y pendant les tirs. */
    minigunBone?: string;
    /** Vitesse de rotation du minigun (deg/s) pendant le tir. */
    minigunSpinDegPerSec?: number;
    /** Bones de roues (`wheel_FL`, …) — rotation visuelle au roulement. */
    wheelBones?: string[];
    wheelSpinAxis?: "x" | "y" | "z";
    wheelSpinSign?: 1 | -1;
    /** Probes suspension ; défaut 6 points tank, voiture : 4 roues. */
    suspensionProbeNames?: string[];
    /** Noms de nodes GLB (suffixe véhicule). */
    nodes?: {
      colliderMesh?: string;
      cameraPivot?: string;
      cameraStart?: string;
      muzzleShell?: string;
      muzzleGun?: string;
      playerTarget?: string;
      damageSmoke?: string[];
    };
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
    /** Tangage visuel au changement d’input (accélération / freinage), degrés max. */
    drivePitchMaxDeg?: number;
    /** Sensibilité au taux de variation de `smoothedMoveAxis` (input lissé). */
    drivePitchInputRateScale?: number;
    /** Lissage du tangage conduite ; défaut = `visualTiltSharpness`. */
    drivePitchSharpness?: number;
  };
  suspension: {
    rayStartHeight: number;
    rayLength: number;
    restLength: number;
    springStrength: number;
    damperStrength: number;
    maxForce: number;
    /** Amortissement réduit à la détente (rebond). 0–1, typ. 0.45–0.65. */
    reboundDampingScale?: number;
    /** Rigidité ressort en extension (fraction de `springStrength`). */
    extensionSpringScale?: number;
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
    /** Vitesse de retour du recul du canon (décalage Y du bone, m/s). */
    recoilReturnSpeed: number;
    /** Vitesse de retour de l’inclinaison du hull après un tir (rad/s pour pitch/roll). */
    hullRecoilReturnSpeed: number;
    /** Amplitude d’inclinaison du châssis (visuel) par tir, en degrés ; le côté opposé à la direction de tir s’enfonce. */
    hullRecoilKickDeg: number;
    /** Inverse l’inclinaison du hull si le sens avant/arrière ou gauche/droite est inversé. */
    hullRecoilSign: 1 | -1;
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
    shellShotShakeDurationSeconds?: number;
    shellShotShakeAmplitude?: number;
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
    /** Vitesse de défilement V des meshes `tank_tracks_L/R` (cycles UV/s à input max). */
    treadUvScrollSpeed?: number;
    yOffset: number;
    raycastStartHeight: number;
    raycastLength: number;
    opacityMultiplier: number;
    /** Bones `track_L` / `track_R` : affaissement et twist visuel depuis les `SUS_*`. */
    suspensionVisual?: {
      enabled: boolean;
      /** Déplacement local Y max des bones chenille (m). */
      maxDropMeters: number;
      /** Pitch max d’un train (degrés, avant/arrière selon FL↔RL ou FR↔RR). */
      maxTrackPitchDeg: number;
      /** Pitch max du bone `caisse` (degrés). */
      maxHullPitchDeg: number;
      /** Roll max du bone `caisse` (degrés). */
      maxHullRollDeg: number;
      /** @deprecated Préférer `springStiffness` / `springDamping`. */
      smoothness?: number;
      /** Ressort visuel (réactivité). */
      springStiffness?: number;
      /** Amortissement visuel des inclinaisons (plus bas = plus de rebond). */
      springDamping?: number;
      /** Amortissement des affaissements chenille (plus haut = pas d’enfoncement). */
      springDropDamping?: number;
      /** Amortissement rebond pitch/roll ; défaut = `springBounceDamping` ou `springDamping`. */
      springBounceDamping?: number;
      /** Oscillation verticale du `tank_visual_root` (m) ; 0 = désactivé. */
      maxBodyBobMeters?: number;
    };
  };
  vehicle: {
    healthMax: number;
    startingHealth: number;
  };
  energy: {
    batteryMax: number;
    overchargeMax: number;
    startingBattery: number;
    startingOvercharge: number;
    batteryDrainMovingPerSecond: number;
    overchargeDrainBoostPerSecond: number;
    /** Recharge de la jauge boost (%) par seconde quand Maj n'est pas maintenue. */
    overchargeRechargePerSecond: number;
  };
  powerUps?: {
    enabled: boolean;
    /** Rayon de pickup commun à tous les power-ups (m). */
    pickupRadius: number;
    highlight?: {
      blurHorizontalSize?: number;
      blurVerticalSize?: number;
    };
    animation?: {
      /** Amplitude du mouvement haut/bas (m). */
      bobAmplitude: number;
      /** Durée d'un cycle complet haut/bas (s). */
      bobPeriodSeconds: number;
      /** Durée d'une rotation complète sur l'axe Y (s). */
      rotationPeriodSeconds: number;
    };
    types: {
      ammo_shell: PowerUpTypeConfig & { shellAmmoAmount: number };
      fuel: PowerUpTypeConfig & { batteryAmount: number };
      boost: PowerUpTypeConfig & { boostDurationSeconds: number };
      repair: PowerUpTypeConfig & { repairAmount: number };
      shield: PowerUpTypeConfig & {
        shieldDurationSeconds: number;
        /** 0–1 : 1 = aucun dégât (bouclier 100 %). */
        damageReduction: number;
      };
      weapon_boost: PowerUpTypeConfig & { damageMultiplier: number };
    };
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
