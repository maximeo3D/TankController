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

export type RigAxis = "x" | "y" | "z";
export type RigSign = 1 | -1;

/** Bones animés propres à un aéronef : gouvernes et trains d'atterrissage. */
export interface FlightRigConfig {
  aileronLeftBone?: string;
  aileronRightBone?: string;
  /** Axe local de charnière des ailerons (typ. l'axe d'envergure). */
  aileronAxis?: RigAxis;
  aileronSign?: RigSign;
  elevatorLeftBone?: string;
  elevatorRightBone?: string;
  elevatorAxis?: RigAxis;
  elevatorSign?: RigSign;
  rudderBone?: string;
  rudderAxis?: RigAxis;
  rudderSign?: RigSign;
  /** Train avant : se replie dans l'axe longitudinal, donc autour de l'axe latéral. */
  gearFrontBone?: string;
  gearFrontAxis?: RigAxis;
  gearFrontSign?: RigSign;
  /** Trains principaux : se replient vers l'intérieur, donc autour de l'axe longitudinal. */
  gearLeftBone?: string;
  gearRightBone?: string;
  gearMainAxis?: RigAxis;
  /** Signe du train gauche ; le droit prend le signe opposé (repli symétrique). */
  gearMainSign?: RigSign;
  /** Bone de la turbine arrière (scale local selon la vitesse). */
  engineBone?: string;
  /**
   * Axe local du bone aligné sur la tuyère (typ. `y`, l'axe tête→queue de l'os).
   * Il est exclu du scale : seuls les deux axes perpendiculaires se pincent, ce
   * qui ouvre et ferme la buse sans l'allonger.
   */
  engineNozzleAxis?: RigAxis;
}

/** Modèle de vol arcade utilisé quand `movement.steeringMode` vaut `plane`. */
export interface FlightConfig {
  /** Variation de la manette des gaz par seconde (0–1 par s) sous Z / S. */
  throttleRatePerSecond: number;
  /** Manette des gaz au spawn (0–1). */
  idleThrottle: number;
  /** Poussée (N) à pleine manette. */
  maxThrustForce: number;
  /** Multiplicateur de poussée sous post-combustion (Maj). */
  afterburnerMultiplier: number;
  /** Portance (N) par (m/s)² de vitesse air, avant saturation. */
  liftPerSpeedSquared: number;
  maxLiftForce: number;
  /** Incidence (deg) au-delà de laquelle la portance s'effondre. */
  stallAngleDeg: number;
  /** Traînée dans l'axe (N par (m/s)²). */
  dragPerSpeedSquared: number;
  /** Traînée latérale (N par m/s) — limite le dérapage. */
  lateralDragPerSpeed: number;
  /** Traînée verticale (N par m/s). */
  verticalDragPerSpeed: number;
  pitchTorque: number;
  rollTorque: number;
  yawTorque: number;
  pitchSign: RigSign;
  rollSign: RigSign;
  yawSign: RigSign;
  /** Amortissement des vitesses angulaires en vol (1/s). */
  angularDamping: number;
  /** Vitesse air (m/s) donnant 100 % d'autorité aux gouvernes. */
  controlAuthorityRefSpeed: number;
  /** Autorité résiduelle (0–1) à vitesse nulle. */
  controlAuthorityMin: number;
  /** Sensibilité du manche souris (unités de manche par pixel). */
  stickPitchPerPixel: number;
  stickRollPerPixel: number;
  /**
   * Préférence joueur, distincte de la calibration `pitchSign` / `rollSign` du rig :
   * inverse le sens de l'axe souris avant qu'il n'atteigne le manche.
   */
  invertPitchAxis?: boolean;
  invertRollAxis?: boolean;
  /** Recentrage automatique du manche (unités/s ; 0 = manche libre). */
  stickReturnPerSecond: number;
  /** Couple de remise à plat quand le manche de roulis est au neutre (N·m par rad). */
  levelAssistTorque: number;
  /** Braquage max des gouvernes (deg). */
  aileronMaxDeg: number;
  elevatorMaxDeg: number;
  rudderMaxDeg: number;
  /** Lissage du braquage visuel des gouvernes (1/s). */
  surfaceSharpness: number;
  /** Braquage des roues du train avant au roulage (deg). */
  taxiSteerMaxDeg: number;
  /** Résistance au roulement au sol (N par m/s). */
  taxiDragPerSpeed: number;
  /** Freinage (N) obtenu en poussant S manette déjà au ralenti. */
  taxiBrakeForce: number;
  /** Gravité relative en vol (1 = physique, ~0.2 = chute légère). */
  gravityScale?: number;
  /** Vitesse air max (m/s) ; 0 ou absent = pas de plafond explicite. */
  maxAirspeed?: number;
  /** Fraction de `maxAirspeed` maintenue en croisière haute (ex. 0.2 = 20 %). */
  minAirspeedRatio?: number;
  /** Vitesse avant min (m/s) ; remplace le ratio si défini. */
  minAirspeed?: number;
  /** Couple de rattrapage (N) quand la vitesse avant descend sous le plancher. */
  minAirspeedHold?: number;
  /** Résistance (N par m/s) au-delà de `maxAirspeed`. */
  maxAirspeedDrag?: number;
  /** Portance (N) à pleine manette en vol, même à basse vitesse. */
  baselineLift?: number;
  /** Amortissement vertical arcade (N·s/kg) — stabilise le plan de vol. */
  arcadeVerticalDamping?: number;
  /** Amortissement angulaire au manche neutre (N·m·s). */
  arcadeAngularDamping?: number;
  /** Alignement vitesse → nez (1/s) pour un ressenti « vieux jeu ». */
  arcadeVelocityAlign?: number;
  /** Portance arcade (N par m/s) quand le nez cabre ou le manche est tiré. */
  arcadePitchLift?: number;
  /** Amortissement de dérapage latéral (1/s) — la trajectoire suit le nez. */
  arcadeSlipDrag?: number;
  /** Scale min de la turbine sur son axe local à vitesse max (1 = pas de variation). */
  engineScaleMin?: number;
  /** Intensité émissive turbine à l'arrêt (0–1). */
  engineEmissiveIdle?: number;
  /** Intensité émissive turbine à vitesse max sans turbo (0–1). */
  engineEmissiveMax?: number;
  /** Intensité émissive turbine sous post-combustion (0–1). */
  engineEmissiveTurbo?: number;
  /** Nom du material GLB de la turbine (ex. `engine`). */
  engineMaterialName?: string;
  /** Lissage visuel turbine ; reprend `surfaceSharpness` si absent. */
  engineVisualSharpness?: number;
  /** Lissage du scale buse ; reprend `engineVisualSharpness * 2.5` si absent. */
  engineScaleSharpness?: number;
  /** Manette des gaz allumant la flamme de tuyère (0–1 ; défaut 0.15). */
  postCombustionThrottleThreshold?: number;
  /** Facteur de débit de la flamme sous post-combustion (défaut 2). */
  postCombustionTurboEmitScale?: number;
  gear: {
    /** Vitesse sol max (m/s) autorisant la sortie du train. */
    deploySpeed: number;
    /** Vitesse air (m/s) au-delà de laquelle le train rentre. */
    retractSpeed: number;
    /** Hauteur sol max (m) autorisant la sortie du train. */
    deployHeight: number;
    /** Durée d'une manœuvre complète (s). */
    travelSeconds: number;
    /** Angle du train en position rentrée (deg). */
    retractedDeg: number;
    /** Sortie forcée au spawn. */
    deployedAtSpawn: boolean;
  };
}

/**
 * Vol stationnaire arcade utilisé quand `movement.steeringMode` vaut `helicopter`.
 * L'appareil tient son altitude tout seul : Z / S ne sont pas une manette des gaz
 * mais des commandes de montée / descente, et la souris incline l'appareil.
 */
export interface HelicopterConfig {
  /** Vitesse verticale (m/s) sous Z / S. */
  climbSpeed: number;
  /** Réactivité du maintien d'altitude (1/s) — plus haut = tenue plus ferme. */
  altitudeHoldSharpness: number;
  /** Amortissement vertical du stationnaire (1/s). */
  verticalDamping: number;
  /** Altitude sol (m) sous laquelle l'appareil se pose au lieu de tenir le stationnaire. */
  groundHoverHeight: number;
  /** Vitesse de lacet (deg/s) sous Q / D. */
  yawSpeedDeg: number;
  /** Réactivité du lacet (1/s). */
  yawSharpness: number;
  /** Inclinaison latérale max (deg) au manche plein. */
  maxBankDeg: number;
  /** Assiette longitudinale max (deg) au manche plein. */
  maxPitchDeg: number;
  /** Réactivité de mise en assiette (1/s). */
  attitudeSharpness: number;
  /** Sensibilité du manche souris (unités de manche par pixel). */
  stickRollPerPixel: number;
  stickPitchPerPixel: number;
  /** Recentrage automatique du manche (unités/s ; 0 = manche libre). */
  stickReturnPerSecond: number;
  /** Inverse l'axe souris avant qu'il n'atteigne le manche. */
  invertPitchAxis?: boolean;
  invertRollAxis?: boolean;
  /** Accélération horizontale (m/s²) à inclinaison pleine. */
  translationAccel: number;
  /** Vitesse horizontale max (m/s). */
  maxHorizontalSpeed: number;
  /** Traînée horizontale (1/s) — ramène l'appareil au stationnaire manche neutre. */
  horizontalDrag: number;
  /** Bone du rotor principal (rotation continue). */
  mainRotorBone?: string;
  mainRotorAxis?: RigAxis;
  /** Bone du rotor de queue. */
  tailRotorBone?: string;
  tailRotorAxis?: RigAxis;
  /** Vitesse de rotation des rotors (deg/s). */
  rotorSpeedDeg?: number;
  /** Vitesse des rotors au repos moteur coupé (deg/s). */
  rotorIdleSpeedDeg?: number;
}

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
    /** Probes suspension ; défaut 6 points tank, voiture : 4 roues, jet : 3 trains. */
    suspensionProbeNames?: string[];
    /** Bones de gouvernes et de trains (mode `plane`). */
    flight?: FlightRigConfig;
    /** Noms de nodes GLB (suffixe véhicule). */
    nodes?: {
      colliderMesh?: string;
      cameraPivot?: string;
      cameraStart?: string;
      /** Empty de vue zoom (ex. `CAM_jet_zoom`). */
      cameraZoom?: string;
      /** Bone skeleton parent du zoom (ex. `tourelle`) pour suivre la tourelle. */
      cameraZoomParentBone?: string;
      muzzleShell?: string;
      muzzleMissile?: string;
      /** Muzzle des roquettes non guidées (ex. `MUZZLE_rocket`). */
      muzzleRocket?: string;
      muzzleGun?: string;
      ammoShellMesh?: string;
      ammoShellColliderMesh?: string;
      ammoMissileMesh?: string;
      ammoMissileColliderMesh?: string;
      /** Templates roquette : `AMMO_rocket` + `COL_rocket`. */
      ammoRocketMesh?: string;
      ammoRocketColliderMesh?: string;
      /** Points de tir missiles utilisés en alternance (ex. `MUZZLE_missile_L`, `_R`). */
      missileMuzzles?: string[];
      /** Points de tir roquettes utilisés en alternance. */
      rocketMuzzles?: string[];
      /** Emplacements d'emport visuels (ex. `MUZZLE_missile_L`, `_R`). Ordre = ordre de tir. */
      missileHardpoints?: string[];
      /**
       * Rampes reparentées au bone de pitch (`pitchBone`). Défaut : la rampe de
       * l'arme principale et celle de la mitrailleuse. L'hélicoptère n'y met que
       * son canon, ses missiles et roquettes restant solidaires du fuselage.
       */
      pitchBoneMuzzles?: string[];
      playerTarget?: string;
      damageSmoke?: string[];
      /** Empty de la flamme de tuyère (ex. `jet_post_combustion`). */
      postCombustion?: string;
      /** Empty fumée / turbine sur le mesh missile guidé (ex. `missile_smoke_1`). */
      missileSmoke?: string;
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
    /**
     * `tank` = rotation sur place ; `car` = braquage lié à la vitesse avant/arrière ;
     * `plane` = modèle de vol (voir `flight`), le sol ne sert qu'au roulage ;
     * `helicopter` = vol stationnaire (voir `helicopter`).
     */
    steeringMode?: "tank" | "car" | "plane" | "helicopter";
    /** Vitesse linéaire min. (m/s) pour entamer un virage en mode `car`. */
    carMinSteerSpeed?: number;
    /** Vitesse de référence pour le facteur de braquage en mode `car` (défaut ≈ moveSpeed × 8). */
    carSteerReferenceSpeed?: number;
    /** Facteur min. (0–1) du taux de braquage en mode `car` à basse vitesse. */
    carSteerMinSpeedFactor?: number;
    /** Multiplicateur de friction latérale en mode `car` à braquage plein (réduit le dérapage). */
    carSteerGripMultiplier?: number;
    /**
     * Décalage vertical (m) du point d’application de la traction en mode `car`,
     * relatif au centre de masse. Négatif = couple de cabrage à l’accélération.
     */
    carTractionApplyOffsetY?: number;
    /** Coupe braquage / traction / grip quand aucune roue (`SUS_*`) ne touche le sol. */
    requireGroundContactForControl?: boolean;
  };
  physics: {
    tankMass: number;
    tankLinearDamping: number;
    tankAngularDamping: number;
    /** Amortissement linéaire sans contact au sol (défaut = `tankLinearDamping`). */
    airborneLinearDamping?: number;
    /** Amortissement angulaire sans contact au sol (défaut = `tankAngularDamping`). */
    airborneAngularDamping?: number;
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
    /** Sensibilité au taux de variation de `smoothedMoveAxis` (input lissé). Mode `tank`. */
    drivePitchInputRateScale?: number;
    /** Mode `car` : sensibilité à l’accélération longitudinale mesurée (rad par m/s²). */
    drivePitchAccelScale?: number;
    /** Mode `car` : lissage de l’accélération mesurée avant application du tangage. */
    drivePitchAccelSharpness?: number;
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
    /** Butée de lacet (deg, relative à l'axe du véhicule). Absent = rotation libre 360°. */
    minYawDeg?: number;
    maxYawDeg?: number;
    /**
     * La tourelle ne suit la visée qu'en vue zoom ; en vue normale elle garde
     * son orientation courante (hélicoptère : la souris pilote l'appareil).
     */
    aimOnlyInZoom?: boolean;
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
  /** Requis quand `movement.steeringMode` vaut `plane`. */
  flight?: FlightConfig;
  /** Requis quand `movement.steeringMode` vaut `helicopter`. */
  helicopter?: HelicopterConfig;
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
  /**
   * Sons propres au véhicule. Les champs de son attendent une clé du catalogue
   * `src/assets/soundLibrary.ts` ; omettre ou passer `null` désactive le son.
   */
  audio?: {
    /** Boucle moteur à l'arrêt. */
    engineIdle?: string | null;
    /** Boucle moteur en déplacement. */
    engineMove?: string | null;
    /** Boucle moteur pendant le boost ; remplace `engineMove`. */
    engineTurbo?: string | null;
    /** Klaxon (touche H). */
    horn?: string | null;
    /** Impact des suspensions à la réception d'un saut. */
    suspensionImpact?: string | null;
    engineIdleVolume?: number;
    /** Volume de `engineMove` à l'input minimal. */
    engineMoveVolumeMin?: number;
    /** Volume de `engineMove` à l'input plein. */
    engineMoveVolumeMax?: number;
    engineTurboVolume?: number;
    /** Volume de la boucle `helicopter_blades` en stationnaire. */
    helicopterBladesVolumeIdle?: number;
    /** Volume de la boucle `helicopter_blades` en montée (Z). */
    helicopterBladesVolumeClimb?: number;
    /** Volume de la boucle `helicopter_blades` en descente (S). */
    helicopterBladesVolumeDescend?: number;
    /** Volume de la boucle `helicopter_blades` en turbo. */
    helicopterBladesVolumeTurbo?: number;
    hornVolume?: number;
    /** Délai min. entre deux coups de klaxon (s). */
    hornCooldownSeconds?: number;
    /** Volume de `suspensionImpact` à `suspensionImpactMinSpeed`. */
    suspensionImpactVolumeMin?: number;
    /** Volume de `suspensionImpact` à `suspensionImpactMaxSpeed`. */
    suspensionImpactVolumeMax?: number;
    /** Vitesse de chute min. (m/s) déclenchant le son de suspension. */
    suspensionImpactMinSpeed?: number;
    /** Vitesse de chute (m/s) donnant le volume max. */
    suspensionImpactMaxSpeed?: number;
    /** Temps min. sans contact `SUS_*` avant de réarmer le son (s). */
    suspensionImpactMinAirSeconds?: number;
    /** Délai min. entre deux impacts de suspension (s). */
    suspensionImpactCooldownSeconds?: number;
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
    /** Seuil min. (0–1) pour activer le turbo ; en dessous, reactivation bloquée jusqu'à recharge. */
    overchargeMinActivateRatio?: number;
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
    /** Roquettes non guidées (voiture blindée, etc.). */
    rocket?: ProjectileWeaponConfig;
    /** Missiles guidés (jet, hélicoptère). */
    missile?: ProjectileWeaponConfig;
    bullet: {
      shotsPerSecond: number;
      damage: number;
      muzzleVelocity: number;
      gravityMultiplier: number;
    };
    /**
     * Hélicoptère : le canon n'est utilisable qu'en vue zoom, et les projectiles
     * (missiles / roquettes) uniquement en vue normale. Le changement de munition
     * est verrouillé tant que le zoom est actif.
     */
    zoomGunOnly?: boolean;
  };
}

/** Réglages du verrouillage / guidage des missiles (jet). */
export interface MissileLockConfig {
  /** Demi-angle du cône de lock devant l'origine (deg). */
  coneHalfAngleDeg: number;
  /** Distance max. (m) pour acquérir / conserver un verrouillage. */
  maxLockDistance: number;
  /** Durée d'apparition du réticule de lock (s). */
  acquireSeconds: number;
  /** Durée de disparition quand la cible sort du cône (s). */
  loseSeconds: number;
  /** Vitesse de braquage en vol du missile guidé (deg/s). */
  guidanceTurnRateDeg: number;
  /** Phase initiale où le missile garde surtout l'axe de lancement (s). */
  launchBlendSeconds: number;
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
  missileLock?: MissileLockConfig;
}

export type PrimaryWeaponKind = "shell" | "rocket" | "missile";

/** Ordre de sélection des armes à projectile déclarées par un véhicule. */
export const PROJECTILE_WEAPON_KINDS: readonly PrimaryWeaponKind[] = ["shell", "missile", "rocket"];

/** Toutes les armes à projectile du véhicule, dans l'ordre de cycle joueur. */
export function getProjectileWeaponKinds(config: TankControllerConfig): PrimaryWeaponKind[] {
  const kinds = PROJECTILE_WEAPON_KINDS.filter((kind) => Boolean(config.weapons[kind]));
  if (kinds.length === 0) {
    throw new Error("Vehicle config must define weapons.shell, weapons.rocket, or weapons.missile");
  }
  return kinds;
}

export function getPrimaryWeaponKind(config: TankControllerConfig): PrimaryWeaponKind {
  return getProjectileWeaponKinds(config)[0];
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
