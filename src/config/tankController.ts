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
    /** Sous-ensemble de `wheelBones` — braquage visuel (typ. roues avant). */
    frontWheelBones?: string[];
    wheelSpinAxis?: "x" | "y" | "z";
    wheelSpinSign?: 1 | -1;
    /** Axe local de braquage des roues avant (typ. `y`). */
    wheelSteerAxis?: "x" | "y" | "z";
    wheelSteerSign?: 1 | -1;
    /** Angle max de braquage visuel (degrés). */
    wheelSteerMaxDeg?: number;
    /** Vitesse de convergence du braquage visuel (rad/s). */
    wheelSteerSharpness?: number;
    /** Rayon roue (m) — cadence de rotation visuelle au roulement (défaut 0.35). */
    wheelRadius?: number;
    /** Déplace verticalement les bones de roues selon la compression de suspension. */
    wheelTravelEnabled?: boolean;
    /** Axe (espace parent du bone) du débattement vertical des roues ; défaut `y`. */
    wheelTravelAxis?: "x" | "y" | "z";
    /** Inverse le débattement si les roues s’enfoncent au lieu de remonter. */
    wheelTravelSign?: 1 | -1;
    /** Lissage du débattement visuel des roues (rad/s ; défaut 25). */
    wheelTravelSharpness?: number;
    /** Probes suspension ; défaut 6 points tank, voiture : 4 roues. */
    suspensionProbeNames?: string[];
    /** Noms de nodes GLB (suffixe véhicule). */
    nodes?: {
      colliderMesh?: string;
      cameraPivot?: string;
      cameraStart?: string;
      muzzleShell?: string;
      muzzleMissile?: string;
      muzzleGun?: string;
      ammoShellMesh?: string;
      ammoShellColliderMesh?: string;
      ammoMissileMesh?: string;
      ammoMissileColliderMesh?: string;
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
    /** `tank` = rotation sur place ; `car` = braquage lié à la vitesse avant/arrière. */
    steeringMode?: "tank" | "car";
    /** Vitesse linéaire min. (m/s) pour entamer un virage en mode `car`. */
    carMinSteerSpeed?: number;
    /** Vitesse de référence pour le facteur de braquage en mode `car` (défaut ≈ moveSpeed × 8). */
    carSteerReferenceSpeed?: number;
    /** Facteur min. (0–1) du taux de braquage en mode `car` à basse vitesse. */
    carSteerMinSpeedFactor?: number;
    /** Multiplicateur de friction latérale en mode `car` à braquage plein (réduit le dérapage). */
    carSteerGripMultiplier?: number;
    /** Coupe braquage / traction / grip quand aucune roue (`SUS_*`) ne touche le sol. */
    requireGroundContactForControl?: boolean;
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
    /**
     * Distance verticale du node `SUS_*` au point de contact sol (m).
     * 0 (défaut) quand les probes sont déjà placés au contact du pneu.
     */
    contactOffsetY?: number;
    springStrength: number;
    damperStrength: number;
    maxForce: number;
    /**
     * Applique réellement les forces ressort/amortisseur aux points de contact.
     * `false` (défaut historique) : le châssis repose sur son collider, les probes ne servent
     * qu’à détecter le contact au sol.
     */
    springForcesEnabled?: boolean;
    /** Marge (m) au-delà de `restLength` pour considérer une roue en contact avec le sol. */
    groundContactTolerance?: number;
    /** Amortissement réduit à la détente (rebond). 0–1, typ. 0.45–0.65. */
    reboundDampingScale?: number;
    /** Amortissement réduit à la compression : plus bas = atterrissage plus rebondissant. 0–1. */
    compressionDampingScale?: number;
    /** Rigidité ressort en extension (fraction de `springStrength`). */
    extensionSpringScale?: number;
    /** Restitution verticale à l’atterrissage (0 = aucun rebond, 0.5 = rebond marqué). */
    landingBounceRestitution?: number;
    /** Vitesse de chute min. (m/s) pour déclencher le rebond d’atterrissage. */
    landingBounceMinSpeed?: number;
    /** Vitesse de chute max. prise en compte pour le rebond (m/s). */
    landingBounceMaxSpeed?: number;
    /** Temps min. sans contact (s) avant qu’un contact compte comme atterrissage. */
    landingBounceMinAirSeconds?: number;
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
    /** Obus (tank). */
    shell?: ProjectileWeaponConfig;
    /** Missiles (voiture blindée, etc.). */
    missile?: ProjectileWeaponConfig;
    bullet: {
      shotsPerSecond: number;
      damage: number;
      muzzleVelocity: number;
      gravityMultiplier: number;
    };
  };
}

/** Arme principale à projectile unique (obus ou missile). */
export interface ProjectileWeaponConfig {
  startingReserveAmmo: number;
  startsChambered: boolean;
  /** Chargeur interne. 1 = obus classique ; >1 = salve rechargée ensemble. */
  magazineSize?: number;
  reloadSeconds: number;
  damage: number;
  muzzleVelocity: number;
  gravityMultiplier: number;
}

export type PrimaryWeaponKind = "shell" | "missile";

export function getPrimaryWeaponKind(config: TankControllerConfig): PrimaryWeaponKind {
  if (config.weapons.missile) {
    return "missile";
  }
  if (config.weapons.shell) {
    return "shell";
  }
  throw new Error("Vehicle config must define weapons.shell or weapons.missile");
}

export function getPrimaryWeaponConfig(config: TankControllerConfig): ProjectileWeaponConfig {
  const kind = getPrimaryWeaponKind(config);
  const weapon = config.weapons[kind];
  if (!weapon) {
    throw new Error(`Missing weapons.${kind} in vehicle config`);
  }
  return weapon;
}

/** Distance SUS → contact sol : compenser un probe placé au centre de roue (hub) au lieu du sol. */
export function getSuspensionContactOffset(config: TankControllerConfig): number {
  return config.suspension.contactOffsetY ?? 0;
}

export const tankConfig = tankControllerConfig as TankControllerConfig;
