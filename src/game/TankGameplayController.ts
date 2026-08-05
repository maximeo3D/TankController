import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Axis, Space } from "@babylonjs/core/Maths/math.axis";
import "@babylonjs/core/Culling/ray";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Material, type Material as BabylonMaterial } from "@babylonjs/core/Materials/material";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh as BabylonMesh } from "@babylonjs/core/Meshes/mesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { SpriteManager, Sprite } from "@babylonjs/core/Sprites";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeMesh, PhysicsShapeSphere, type PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
// (raycast query type removed; using inline object literals)
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Bone } from "@babylonjs/core/Bones/bone";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type {
  TankControllerConfig,
  ProjectileWeaponConfig,
  PrimaryWeaponKind,
  FlightRigConfig
} from "../config/tankController";
import { getPrimaryWeaponKind, getPrimaryWeaponConfig, getSuspensionContactOffset } from "../config/tankController";
import { TankInput, type WeaponType } from "./TankInput";
import {
  AdvancedDynamicTexture,
  Rectangle,
  Control,
  Image,
  TextBlock,
  Grid,
  StackPanel
} from "@babylonjs/gui";
import {
  hudLayoutJsonUrl,
  shellWeaponIconUrl,
  missileWeaponIconUrl,
  machinegunWeaponIconUrl,
  healthStatusIconUrl,
  fuelStatusIconUrl,
  boostStatusIconUrl,
  reticleCameraAssetUrl,
  reticleBarrelAssetUrl,
  reticleGunAssetUrl,
  reticleMissileJetAssetUrl,
  reticleMissileJetLockedAssetUrl,
  sparkImpactAssetUrl,
  explosionFlashJsonUrl,
  explosionShockwaveJsonUrl,
  explosionFlareTextureUrl,
  tankCannonSoundAssetUrl,
  tankGunSoundAssetUrl,
  missile1SoundAssetUrl,
  missile2SoundAssetUrl,
  missile3SoundAssetUrl,
  missile4SoundAssetUrl,
  shellInsertSoundAssetUrl,
  powerUpAmmoSoundAssetUrl,
  powerUpFuelSoundAssetUrl,
  powerUpRepairSoundAssetUrl,
  powerUpShieldSoundAssetUrl,
  turretStartSoundAssetUrl,
  turretLoopSoundAssetUrl,
  turretStopSoundAssetUrl
} from "../assets/assetUrls";
import { resolveVehicleSoundUrl } from "../assets/soundLibrary";
import { FlightModel, type FlightState } from "./vehicle/FlightModel";
import { JetMissileLockController } from "./vehicle/JetMissileLockController";
import { applyUiFontToTexture, TIMER_FONT_FAMILY } from "../ui/applyUiFont";
import { TARGET_FRAME_SEC } from "./frameTiming";
import { Sound } from "@babylonjs/core/Audio/sound";
import { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import "@babylonjs/core/Layers/effectLayerSceneComponent";
import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import type { TrackTreadParticleBundle } from "./trackTreadParticles";
import type { TankDamageParticleBundle } from "./tankDamageParticles";
import { PowerUpSystem, type PowerUpTypeId } from "./PowerUpSystem";
import { EnemyTurretSystem, type EnemyTurretPlayerTarget } from "./EnemyTurretSystem";
import { RadarHud, type RadarWorldBounds } from "./RadarHud";
import {
  clearSceneGameplayUi,
  getSceneGameplayUi,
  setSceneGameplayUi
} from "./sceneGameplayUi";
import { addHudCornerBrackets } from "./hudChrome";

const WEAPON_SHELL_AMMO_FONT_SIZE = 26;
const WEAPON_INFINITY_FONT_SIZE = 40;
const WEAPON_SHELL_RELOAD_FILL_COLOR = "rgba(168, 168, 168, 0.5)";
const WEAPON_SHELL_RELOAD_LINE_COLOR = "rgba(216, 216, 216, 0.5)";
const WEAPON_SHELL_RELOAD_LINE_HEIGHT_PX = 2;
const WEAPON_SWITCH_MOVE_PX = 10;
const WEAPON_SWITCH_EXIT_SEC = 0.14;
const WEAPON_SWITCH_ENTER_SEC = 0.14;
const WEAPON_SWITCH_BLINK_SEC = 0.24;
const WEAPON_SLOT_SECONDARY_ALPHA = 0.9;
const UPRIGHT_RESET_COOLDOWN_SEC = 3;
const UPRIGHT_RESET_LIFT_M = 2.5;
const VEHICLE_STATUS_BAR_FILL = "#d9d9d9";
const VEHICLE_STATUS_BAR_EMPTY = "#3a3a3a";
const VEHICLE_STATUS_BAR_SHIELD = "#42a5f5";
const VEHICLE_STATUS_BAR_LOW = "#f44336";
const HEALTH_BAR_WIDTH_PX = 294;
const HEALTH_BAR_SEGMENT_COUNT = 4;
const HEALTH_BAR_SEGMENT_GAP_PX = 2;
const FUEL_BAR_LOW_SEGMENT_RATIO = 0.2;
const FUEL_BAR_LOW_THRESHOLD_PCT = 20;
const FUEL_BAR_LOW_BLINK_HZ = 2.5;
const VEHICLE_STATUS_ROW_HEIGHT = 36;
const VEHICLE_STATUS_ROW_GAP = 20;
const VEHICLE_STATUS_STACK_PADDING_V = 12;

function formatSessionTimer(elapsedSeconds: number): string {
  const totalMs = Math.floor(Math.max(0, elapsedSeconds) * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const centiseconds = Math.floor((totalMs % 1000) / 10);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}:${pad(centiseconds)}`;
}

type WeaponHudAnimPhase = "idle" | "exit" | "enter" | "blink";

interface BoneControl {
  bone: Bone | null;
  transformNode: TransformNode | null;
}

/** Bone animé autour d'un axe unique : gouverne ou jambe de train. */
interface HingeControl {
  control: BoneControl;
  baseRotation: Quaternion;
  axis: Vector3;
}

interface FlightRigControls {
  aileronLeft: HingeControl | null;
  aileronRight: HingeControl | null;
  elevatorLeft: HingeControl | null;
  elevatorRight: HingeControl | null;
  rudder: HingeControl | null;
  gearFront: HingeControl | null;
  gearLeft: HingeControl | null;
  gearRight: HingeControl | null;
}

export interface TankGameplayDebugState {
  health: number;
  healthMax: number;
  healthPercent: number;
  shieldTimeRemaining: number;
  battery: number;
  overcharge: number;
  boostActive: boolean;
  zoomActive: boolean;
  activeWeapon: WeaponType;
  shellReserveAmmo: number;
  shellChambered: boolean;
  fireHeld: boolean;
  position: Vector3;
}

interface TrackUvScroller {
  mesh: AbstractMesh;
  textures: ScrollableTexture[];
}

interface ScrollableTexture {
  vOffset: number;
  clone?: () => unknown;
}

/** Emport missile visible sur un point de tir dédié (ex. aile gauche / droite). */
interface MissileHardpoint {
  muzzleNode: TransformNode | AbstractMesh;
  visualMesh: Mesh | null;
}

const TRACK_UV_TEXTURE_PROPERTIES = [
  "albedoTexture",
  "diffuseTexture",
  "bumpTexture",
  "normalTexture",
  "ambientTexture",
  "opacityTexture",
  "emissiveTexture",
  "specularTexture",
  "metallicTexture",
  "reflectivityTexture",
  "microSurfaceTexture",
  "lightmapTexture"
] as const;

import type { PhysicsViewer } from "@babylonjs/core/Debug/physicsViewer";

export interface TankGameplayControllerOptions {
  scene: Scene;
  canvas: HTMLCanvasElement;
  config: TankControllerConfig;
  tankContainer: AssetContainer;
  tankAnchor: TransformNode;
  tankVisualRoot: TransformNode | null;
  terrainContainer: AssetContainer;
  powerUpsContainer: AssetContainer;
  tankColliderMesh: Mesh | null;
  groundingInfo: {
    baseClearance: number;
    frontLeft: Vector3;
    frontRight: Vector3;
    rearLeft: Vector3;
    rearRight: Vector3;
  };
  suspensionInfo: {
    points: Vector3[];
  };
  suspensionNodes?: {
    fl: TransformNode | AbstractMesh | null;
    fr: TransformNode | AbstractMesh | null;
    ml: TransformNode | AbstractMesh | null;
    mr: TransformNode | AbstractMesh | null;
    rl: TransformNode | AbstractMesh | null;
    rr: TransformNode | AbstractMesh | null;
  };
  tankBody: PhysicsBody;
  tankCamera: TargetCamera | null;
  tankZoomCamera?: TargetCamera | null;
  cameraPivotNode?: TransformNode | AbstractMesh | null;
  initialOrbit?: { yawRad: number; pitchRad: number; radius: number } | null;
  reticleCameraMesh: AbstractMesh | null;
  reticleBarrelMesh: AbstractMesh | null;
  muzzleCannonNode: TransformNode | AbstractMesh | null;
  muzzleGunNode: TransformNode | AbstractMesh | null;
  tracksSourceMesh?: AbstractMesh | null;
  ammoShellMesh: Mesh | null;
  /** Optional collider template mesh from GLB (ex: `COL_obus`) */
  ammoShellColliderMesh?: Mesh | null;
  ammoBulletMesh: Mesh | null;
  /** Emports missiles visuels ; l'ordre du tableau fixe l'ordre de tir. */
  missileHardpoints?: MissileHardpoint[];
  physicsViewer?: PhysicsViewer;
  /** Chenilles : fumée + gravillons sur SUS_BL / SUS_BR (si chargés). */
  trackTreadParticles?: TrackTreadParticleBundle | null;
  /** Chenilles (recul) : fumée + gravillons sur SUS_FL / SUS_FR (si chargés). */
  trackTreadParticlesReverse?: TrackTreadParticleBundle | null;
  /** Fumée / étincelles de dégâts sur les empties `tank_damage_*` (si chargés). */
  tankDamageParticles?: TankDamageParticleBundle | null;
  /** Empty `TARGET_player_tank` — world aim point for enemy turrets. Falls back to `tankAnchor`. */
  playerTargetNode?: TransformNode | AbstractMesh | null;
  enemyTurretSystem?: EnemyTurretSystem | null;
  /** Power-ups partagés au niveau scène (évite les doublons multi-véhicules). */
  sharedPowerUpSystem?: PowerUpSystem | null;
  /** Ne disposer le système ennemi que si ce contrôleur en est propriétaire. */
  ownsEnemyTurretSystem?: boolean;
  radarMapUrl?: string | null;
  radarWorldBounds?: RadarWorldBounds | null;
  onPlayerDeath?: () => void;
}

export class TankGameplayController {
  private static readonly DEBUG_AIM_VECTORS = false;

  private readonly scene: Scene;
  private readonly config: TankControllerConfig;
  private readonly tracksConfig: NonNullable<TankControllerConfig["tracks"]>;
  private readonly tankAnchor: TransformNode;
  private readonly tankVisualRoot: TransformNode | null;
  // groundingInfo kept in options for backward compatibility, but unused in dynamic suspension mode.
  private readonly suspensionPointsLocal: Vector3[];
  private readonly suspensionNodes: NonNullable<TankGameplayControllerOptions["suspensionNodes"]>;
  private readonly tankBody: PhysicsBody;
  private readonly tankColliderMesh: Mesh | null;
  private readonly tankCamera: TargetCamera | null;
  private readonly tankZoomCamera: TargetCamera | null;
  private readonly cameraPivotNode: TransformNode | AbstractMesh | null;
  private readonly input: TankInput;
  private readonly turretControl: BoneControl;
  private readonly cannonControl: BoneControl;
  private readonly caisseControl: BoneControl;
  private readonly trackLeftControl: BoneControl;
  private readonly trackRightControl: BoneControl;
  private readonly minigunControl: BoneControl;
  private readonly minigunBaseLocalRotation: Quaternion;
  private minigunSpinRad = 0;
  private readonly wheelControls: BoneControl[] = [];
  private readonly wheelBaseLocalRotations: Quaternion[] = [];
  private readonly wheelBaseLocalPositions: Vector3[] = [];
  /** Index du probe `SUS_*` associé à chaque roue (-1 si aucune correspondance). */
  private readonly wheelProbeIndices: number[] = [];
  private readonly wheelTravelSmoothed: number[] = [];
  private readonly frontWheelIndices = new Set<number>();
  private wheelSpinRad = 0;
  private wheelSteerRad = 0;
  /** Compression courante de chaque probe `SUS_*` (m), alignée sur `suspensionPointsLocal`. */
  private readonly suspensionCompressions: number[] = [];
  private readonly caisseBaseLocalRotation: Quaternion;
  private readonly trackLeftBaseLocalPosition: Vector3;
  private readonly trackRightBaseLocalPosition: Vector3;
  private readonly trackLeftBaseLocalRotation: Quaternion;
  private readonly trackRightBaseLocalRotation: Quaternion;
  private readonly wheelAnchorLocal = new Map<TrackNodeKey, Vector3>();
  private readonly trackLeftDropSpring: SpringScalarState = { value: 0, velocity: 0 };
  private readonly trackRightDropSpring: SpringScalarState = { value: 0, velocity: 0 };
  private readonly trackLeftPitchSpring: SpringScalarState = { value: 0, velocity: 0 };
  private readonly trackRightPitchSpring: SpringScalarState = { value: 0, velocity: 0 };
  private readonly hullSuspensionPitchSpring: SpringScalarState = { value: 0, velocity: 0 };
  private readonly hullSuspensionRollSpring: SpringScalarState = { value: 0, velocity: 0 };
  private readonly bodyBobSpring: SpringScalarState = { value: 0, velocity: 0 };
  private hullDrivePitchTarget = 0;
  private hullDrivePitchSmoothed = 0;
  private prevSmoothedMoveAxis = 0;
  /** Vitesse longitudinale de la frame précédente, pour dériver l'accélération. */
  private prevForwardSpeed = 0;
  private forwardAccelSmoothed = 0;
  /** Nombre de probes `SUS_*` en contact au dernier calcul de suspension. */
  private suspensionContactCount = 0;
  private airborneSeconds = 0;
  /** Non nul uniquement en mode `plane` : remplace toute la conduite au sol. */
  private readonly flightModel: FlightModel | null;
  private readonly flightRig: FlightRigControls | null;
  private flightAileronSmoothed = 0;
  private flightElevatorSmoothed = 0;
  private flightRudderSmoothed = 0;
  private lastLookDeltaX = 0;
  private lastLookDeltaY = 0;
  private readonly turretBaseLocalRotation: Quaternion;
  private readonly cannonBaseLocalRotation: Quaternion;
  private readonly cannonBaseLocalPosition: Vector3;
  private readonly muzzleCannonNode: TransformNode | AbstractMesh | null;
  private readonly muzzleGunNode: TransformNode | AbstractMesh | null;
  private readonly trackMaterial: BabylonMaterial | null;
  private trackSystem: TrackSegmentSystem | null = null;
  private readonly trackUvScrollers: TrackUvScroller[] = [];
  private readonly tankMeshIdsToIgnore = new Set<number>();
  private readonly tankDeathVisualMeshes: AbstractMesh[];
  private readonly ammoShellMesh: Mesh | null;
  private readonly ammoShellColliderMesh: Mesh | null;
  private readonly ammoBulletMesh: Mesh | null;
  private readonly missileHardpoints: readonly MissileHardpoint[];
  /** État chargé de chaque emport ; réinitialisé à la recharge. */
  private missileHardpointLoaded: boolean[] = [];
  private jetMissileLock: JetMissileLockController | null = null;
  private readonly movementForwardAxis: Vector3;
  private readonly movementInputSign: 1 | -1;
  private readonly turretYawAxis: Vector3;
  private readonly cannonPitchAxis: Vector3;

  private health: number;
  private readonly healthMax: number;
  private shieldTimeRemaining = 0;
  private shieldDamageReduction = 0;
  private readonly shieldHighlightMeshes: Mesh[] = [];
  private shieldHighlightLayer: HighlightLayer | null = null;
  private shieldHighlightVisualActive = false;
  private static readonly SHIELD_GLOW_COLOR = new Color3(0.26, 0.65, 0.96);
  private battery: number;
  private overcharge: number;
  private readonly primaryWeaponKind: PrimaryWeaponKind;
  private readonly primaryWeaponConfig: ProjectileWeaponConfig;
  private activeWeapon: WeaponType;
  private boostActive = false;
  private zoomActive = false;
  private fireHeld = false;
  private boostInputHeld = false;
  private shellReserveAmmo: number;
  private shellChambered: boolean;
  private readonly shellMagazineSize: number;
  private shellLoadedAmmo: number;
  private shellFireWasHeld = false;

  private targetTurretYawDeg = 0;
  private currentTurretYawDeg = 0;
  private targetCannonPitchDeg = 0;
  private currentCannonPitchDeg = 0;
  private smoothedMoveAxis = 0;
  private smoothedTurnAxis = 0;

  private shellReloadTimer = 0;
  private bulletCooldownTimer = 0;
  private activeProjectiles: {
    mesh: Mesh;
    body: PhysicsBody;
    shape: PhysicsShape;
    age: number;
    lastPos: Vector3;
    impactHandled: boolean;
    debugMesh?: AbstractMesh | null;
    guided?: {
      targetId: string;
      speed: number;
      turnRateDeg: number;
      launchBlendSeconds: number;
    };
  }[] = [];
  private physicsViewer?: PhysicsViewer;
  private readonly trackTreadParticles: TrackTreadParticleBundle | null;
  private readonly trackTreadParticlesReverse: TrackTreadParticleBundle | null;
  private readonly tankDamageParticles: TankDamageParticleBundle | null;
  private readonly powerUpSystem: PowerUpSystem | null;
  private readonly playerTargetNode: TransformNode | AbstractMesh | null;
  private readonly enemyTurretSystem: EnemyTurretSystem | null;
  private readonly ownsEnemyTurretSystem: boolean;
  private ownsSceneHud = false;
  private readonly radarMapUrl: string | null;
  private readonly radarWorldBounds: RadarWorldBounds | null;
  private radarHud: RadarHud | null = null;
  private deathBlackMaterial: StandardMaterial | null = null;

  /** Décalage courant sur l’axe local Y du bone canon (recul). */
  private cannonRecoilOffsetY = 0;
  /** Coup de recul à fusionner dans `applyTurretAndCannon` (après `updateWeapons`). */
  private pendingCannonRecoilKickY = 0;

  /** Inclinaison du hull (rad) : pitch autour X, roll autour Z — côté opposé au tir qui s’enfonce. */
  private hullRecoilPitch = 0;
  private hullRecoilRoll = 0;
  private pendingHullRecoilPitch = 0;
  private pendingHullRecoilRoll = 0;

  private orbitYawRad = 0;
  private orbitPitchRad = 0;
  private orbitRadius = 0;
  private cameraShakeTimeRemaining = 0;
  private cameraShakeDuration = 0;
  private cameraShakeSeed = 0;

  // We distinguish between:
  // - control camera: used for aiming/turret/cannon logic (always the orbit camera)
  // - render camera: the scene.activeCamera (orbit or zoom view)
  private lastAimTargetPoint: Vector3 | null = null;

  private debugCameraRayLine: LinesMesh | null = null;
  private debugBarrelForwardLine: LinesMesh | null = null;
  private debugTargetMarker: Mesh | null = null;
  private debugCameraOriginMarker: Mesh | null = null;

  private susDebugSpheres: Mesh[] = [];
  private muzzleDebugVisuals: {
    cannonPivot: Mesh;
    cannonMuzzle: Mesh;
    gunMuzzle: Mesh;
    cannonForwardLine: LinesMesh;
    gunForwardLine: LinesMesh;
    cannonLinkLine: LinesMesh;
    gunLinkLine: LinesMesh;
  } | null = null;
  private hudTexture: AdvancedDynamicTexture | null = null;
  /** True once `UI_hud.json` parsed; HUD text/bars update only then. */
  private hudJsonLoaded = false;
  private hudPanelStatus: Rectangle | null = null;
  private hudHealthBarBg: Rectangle | null = null;
  private hudHealthSegmentFills: Rectangle[] = [];
  private hudHealthIcon: Image | null = null;
  private healthBarSegmentsReady = false;
  private hudFuelBarBg: Rectangle | null = null;
  private hudFuelSegmentFills: Rectangle[] = [];
  private hudFuelIcon: Image | null = null;
  private fuelBarSegmentsReady = false;
  private fuelLowBlinkPhase = 0;
  private hudPanelTimer: Rectangle | null = null;
  private hudTimerLabel: TextBlock | null = null;
  private timerHudChromeReady = false;
  private sessionElapsedSeconds = 0;
  private hudBoostFill: Rectangle | null = null;
  private hudBoostIcon: Image | null = null;
  private statusHudChromeReady = false;
  private statusHudSpacingReady = false;
  private hudWeaponPrimary: Rectangle | null = null;
  private hudWeaponSecondary: Rectangle | null = null;
  private hudWeaponPrimaryIcon: Image | null = null;
  private hudWeaponSecondaryIcon: Image | null = null;
  private hudWeaponPrimaryAmmo: TextBlock | null = null;
  private hudWeaponSecondaryAmmo: TextBlock | null = null;
  private hudWeaponPrimaryReloadFill: Rectangle | null = null;
  private hudWeaponSecondaryReloadFill: Rectangle | null = null;
  private weaponHudChromeReady = false;
  private weaponHudLayoutReady = false;
  private weaponHudReloadGaugesReady = false;
  private weaponHudDisplayedWeapon: WeaponType;
  private weaponHudAnimPhase: WeaponHudAnimPhase = "idle";
  private weaponHudAnimTime = 0;
  private weaponHudAnimTargetWeapon: WeaponType;
  private hudBoostIndicator: TextBlock | null = null;
  private hudZoomIndicator: TextBlock | null = null;
  private hudReticlesAttached = false;
  private barrelShellReticle2D: Rectangle | null = null;
  private barrelGunReticle2D: Rectangle | null = null;
  private activeGunTracers: {
    mesh: Mesh;
    from: Vector3;
    dir: Vector3;
    hitPoint: Vector3;
    hitDistance: number;
    traveled: number;
    speed: number;
    rotation: Quaternion;
    turretSpawnId: string | null;
  }[] = [];

  private sparkSpriteManager: SpriteManager | null = null;
  private sparkSpritePool: Sprite[] = [];
  private activeSparkSprites: {
    sprite: Sprite;
    age: number;
    life: number;
    grow: number;
    maxSize: number;
  }[] = [];

  // Coax (hitscan) spread: grows while firing, shrinks when not firing.
  private gunSpreadDeg = 0;
  private static readonly GUN_SPREAD_GROW_DEG_PER_SEC = 0.2;
  private static readonly GUN_SPREAD_SHRINK_DEG_PER_SEC = 5.0;
  private static readonly GUN_SPREAD_MAX_DEG = 1.0;
  private static readonly GUN_RETICLE_SCALE_MIN = 1.0;
  private static readonly GUN_RETICLE_SCALE_MAX = 2;
  /** Réactivité de la caméra de poursuite du mode avion (1/s). */
  private static readonly CHASE_CAMERA_SHARPNESS = 9.0;

  // Per-shot reticle "kick" (recoil bounce) for the coax reticle.
  private gunReticleKickTime = 999;
  private static readonly GUN_RETICLE_KICK_OVERSHOOT = 0.15; // +15%
  private static readonly GUN_RETICLE_KICK_SETTLE = 0.10; // +10%
  private static readonly GUN_RETICLE_KICK_UP_SECONDS = 0.05;
  private static readonly GUN_RETICLE_KICK_FADE_SECONDS = 0.07;

  private static readonly GUN_MUZZLE_FLASH_POOL_SIZE = 6;
  private static readonly GUN_MUZZLE_FLASH_LIFE_S = 0.05;
  private static readonly GUN_MUZZLE_FLASH_PEAK_INTENSITY = 5;
  private static readonly GUN_MUZZLE_FLASH_RANGE = 0.1;
  private static readonly CANNON_MUZZLE_FLASH_POOL_SIZE = 2;
  private static readonly CANNON_MUZZLE_FLASH_LIFE_S = 0.08;
  private static readonly CANNON_MUZZLE_FLASH_PEAK_INTENSITY = 10;
  private static readonly CANNON_MUZZLE_FLASH_RANGE = 5;
  private gunMuzzleFlashPool: PointLight[] = [];
  private cannonMuzzleFlashPool: PointLight[] = [];
  private activeMuzzleFlashes: { light: PointLight; age: number; life: number; peak: number }[] = [];

  // Shell explosion shockwave FX (pooled clones)
  private shockwaveTemplate: BabylonMesh | null = null;
  private shockwavePool: BabylonMesh[] = [];
  private activeShockwaves: { mesh: BabylonMesh; age: number }[] = [];
  private static readonly SHOCKWAVE_POOL_SIZE = 24;
  // 8 "frames" worth of animation at 60fps, expressed in seconds.
  private static readonly SHOCKWAVE_SCALE_END_S = 5 / 60;
  private static readonly SHOCKWAVE_FADE_START_S = 0 / 60;
  private static readonly SHOCKWAVE_FADE_END_S = 7 / 60;
  private static readonly SHOCKWAVE_SCALE_MAX = 4.0; // 400%
  private static readonly SHELL_TURRET_DAMAGE_RADIUS = 3.0;

  // Audio
  private cannonShotSound: Sound | null = null;
  private missileShotSounds: Sound[] = [];
  private shellInsertSound: Sound | null = null;
  private shellInsertSoundPlayed = false;
  private static readonly SHELL_INSERT_SOUND_BEFORE_END_S = 2.5;
  private gunShotSoundPool: Sound[] = [];
  private gunShotSoundPoolCursor = 0;
  private audioUnlocked = false;
  private gunShotAudioBuffer: AudioBuffer | null = null;
  private readonly powerUpSounds = new Map<PowerUpTypeId, Sound>();
  private tankIdleSound: Sound | null = null;
  private tankMoveSound: Sound | null = null;
  private tankTurboSound: Sound | null = null;
  private tankMovementSoundMode: "idle" | "move" | "turbo" | "stopped" = "stopped";
  private hornSound: Sound | null = null;
  private hornCooldown = 0;
  private suspensionImpactSound: Sound | null = null;
  private suspensionImpactCooldown = 0;
  private turretStartSound: Sound | null = null;
  private turretLoopSound: Sound | null = null;
  private turretStopSound: Sound | null = null;
  private turretSoundState: "stopped" | "starting" | "looping" | "stopping" = "stopped";
  private articulationIsRotating = false;
  private paused = false;
  private playerActive = false;
  private deathTriggered = false;
  private deathScreenDelaySeconds = 0;
  private deathNotified = false;
  private uprightResetCooldown = 0;
  private pendingUprightReset = false;
  private uprightResetPrestepFrames = 0;
  private readonly onPlayerDeath: (() => void) | null;

  private explosionDefsPromise: Promise<unknown[]> | null = null;

  // Debug: log zoom camera vs cannon bone/muzzle on next shell shot.
  private debugLogZoomCamOnNextShellShot = false;
  private zoomCamFreezeSeconds = 0;

  public constructor(options: TankGameplayControllerOptions) {
    this.scene = options.scene;
    // Babylon `Sound.play()` is gated by `scene.audioEnabled`.
    this.scene.audioEnabled = true;
    this.config = options.config;
    this.primaryWeaponKind = getPrimaryWeaponKind(options.config);
    this.primaryWeaponConfig = getPrimaryWeaponConfig(options.config);
    this.activeWeapon = this.primaryWeaponKind;
    this.weaponHudDisplayedWeapon = this.primaryWeaponKind;
    this.weaponHudAnimTargetWeapon = this.primaryWeaponKind;
    this.onPlayerDeath = options.onPlayerDeath ?? null;
    this.tracksConfig = options.config.tracks ?? {
      enabled: false,
      spacing: 0.25,
      maxPointsPerRibbon: 120,
      segmentLength: 0.35,
      segmentWidth: 0.22,
      uvRepeatU: 1,
      uvRepeatV: 1,
      yOffset: 0.015,
      raycastStartHeight: 0.35,
      raycastLength: 2.5,
      opacityMultiplier: 1.0
    };
    this.tankAnchor = options.tankAnchor;
    this.tankVisualRoot = options.tankVisualRoot;
    void options.groundingInfo;
    this.suspensionPointsLocal = options.suspensionInfo.points.map((p) => p.clone());
    this.suspensionNodes = options.suspensionNodes ?? {
      fl: null,
      fr: null,
      ml: null,
      mr: null,
      rl: null,
      rr: null
    };
    this.tankBody = options.tankBody;
    this.tankColliderMesh = options.tankColliderMesh ?? null;
    this.tankCamera = options.tankCamera;
    this.tankZoomCamera = options.tankZoomCamera ?? null;
    this.cameraPivotNode = options.cameraPivotNode ?? null;
    this.muzzleCannonNode = options.muzzleCannonNode;
    this.muzzleGunNode = options.muzzleGunNode;
    this.trackMaterial = (options.tracksSourceMesh?.material as Material | null | undefined) ?? null;
    for (const m of options.tankContainer.meshes) {
      this.tankMeshIdsToIgnore.add(m.uniqueId);
    }
    this.initTrackUvScrollers(options.tankContainer);
    this.tankDeathVisualMeshes = options.tankContainer.meshes.filter((mesh) =>
      this.isTankVisualDeathMesh(mesh)
    );
    this.shieldHighlightMeshes.push(...collectTankHighlightMeshes(options.tankContainer));
    this.shieldHighlightLayer = this.createShieldHighlightLayer();
    this.ammoShellMesh = options.ammoShellMesh;
    this.ammoShellColliderMesh = options.ammoShellColliderMesh ?? null;
    this.ammoBulletMesh = options.ammoBulletMesh;
    this.missileHardpoints = options.missileHardpoints ?? [];
    this.physicsViewer = options.physicsViewer;
    this.trackTreadParticles = options.trackTreadParticles ?? null;
    this.trackTreadParticlesReverse = options.trackTreadParticlesReverse ?? null;
    this.tankDamageParticles = options.tankDamageParticles ?? null;
    this.powerUpSystem = this.createPowerUpSystem(options);
    this.enemyTurretSystem = options.enemyTurretSystem ?? null;
    this.ownsEnemyTurretSystem = options.ownsEnemyTurretSystem === true;
    this.playerTargetNode = options.playerTargetNode ?? null;
    this.radarMapUrl = options.radarMapUrl ?? null;
    this.radarWorldBounds = options.radarWorldBounds ?? null;
    this.input = new TankInput(options.canvas, () => !this.paused, this.primaryWeaponKind);
    this.turretControl = resolveBoneControl(options.tankContainer, "tourelle");
    const pitchBoneName = options.config.rig.pitchBone ?? "canon";
    this.cannonControl = resolveBoneControl(options.tankContainer, pitchBoneName);
    this.caisseControl = resolveBoneControl(options.tankContainer, "caisse");
    this.trackLeftControl = resolveBoneControl(options.tankContainer, "track_L");
    this.trackRightControl = resolveBoneControl(options.tankContainer, "track_R");
    const minigunBoneName = options.config.rig.minigunBone;
    this.minigunControl = minigunBoneName
      ? resolveBoneControl(options.tankContainer, minigunBoneName)
      : { bone: null, transformNode: null };
    this.minigunBaseLocalRotation = getControlLocalRotation(this.minigunControl, this.tankAnchor);
    this.minigunSpinRad = 0;
    this.wheelControls.length = 0;
    this.wheelBaseLocalRotations.length = 0;
    const wheelBoneNames = options.config.rig.wheelBones ?? [];
    const frontWheelNames = new Set(options.config.rig.frontWheelBones ?? []);
    const probeNames = options.config.rig.suspensionProbeNames ?? [];
    // Wheel travel needs probe indices to line up with `suspensionPointsLocal`, which drops missing nodes.
    const probesAlignedWithConfig = probeNames.length === this.suspensionPointsLocal.length;
    for (let wheelIndex = 0; wheelIndex < wheelBoneNames.length; wheelIndex++) {
      const wheelBoneName = wheelBoneNames[wheelIndex];
      const wheelControl = resolveBoneControl(options.tankContainer, wheelBoneName);
      this.wheelControls.push(wheelControl);
      this.wheelBaseLocalRotations.push(getControlLocalRotation(wheelControl, this.tankAnchor));
      this.wheelBaseLocalPositions.push(getControlLocalPosition(wheelControl));
      this.wheelTravelSmoothed.push(0);
      this.wheelProbeIndices.push(
        probesAlignedWithConfig ? findMatchingProbeIndex(wheelBoneName, probeNames) : -1
      );
      if (frontWheelNames.has(wheelBoneName)) {
        this.frontWheelIndices.add(wheelIndex);
      }
    }
    this.wheelSpinRad = 0;
    this.wheelSteerRad = 0;
    this.suspensionCompressions.length = this.suspensionPointsLocal.length;
    this.suspensionCompressions.fill(0);
    this.initWheelAnchorLocalPositions();
    if (this.tracksConfig.suspensionVisual?.enabled) {
      if (!this.trackLeftControl.bone && !this.trackLeftControl.transformNode) {
        console.warn("[TankController] track_L bone missing; track suspension visual disabled.");
      }
      if (!this.trackRightControl.bone && !this.trackRightControl.transformNode) {
        console.warn("[TankController] track_R bone missing; track suspension visual disabled.");
      }
    }
    this.turretBaseLocalRotation = getControlLocalRotation(this.turretControl, this.tankAnchor);
    this.cannonBaseLocalRotation = getControlLocalRotation(this.cannonControl, this.tankAnchor);
    this.cannonBaseLocalPosition = getControlLocalPosition(this.cannonControl);
    this.caisseBaseLocalRotation = getControlLocalRotation(this.caisseControl, this.tankAnchor);
    this.trackLeftBaseLocalPosition = getControlLocalPosition(this.trackLeftControl);
    this.trackRightBaseLocalPosition = getControlLocalPosition(this.trackRightControl);
    this.trackLeftBaseLocalRotation = getControlLocalRotation(this.trackLeftControl, this.tankAnchor);
    this.trackRightBaseLocalRotation = getControlLocalRotation(this.trackRightControl, this.tankAnchor);
    this.movementForwardAxis = axisFromConfig(
      options.config.rig.movementForwardAxis,
      options.config.rig.movementForwardSign
    );
    this.movementInputSign = options.config.rig.movementInputSign;
    if ((options.config.movement.steeringMode ?? "tank") === "plane" && options.config.flight) {
      // Même combinaison de signes que la traction au sol : c'est le référentiel
      // dans lequel les rigs sont calibrés, donc le nez y est garanti correct.
      const noseLocal = this.movementForwardAxis.scale(
        this.movementInputSign * options.config.rig.movementForwardSign
      );
      this.flightModel = new FlightModel({
        scene: options.scene,
        body: this.tankBody,
        anchor: this.tankAnchor,
        config: options.config.flight,
        noseLocal
      });
      this.flightRig = this.resolveFlightRig(options.tankContainer, options.config.rig.flight);
    } else {
      this.flightModel = null;
      this.flightRig = null;
      if ((options.config.movement.steeringMode ?? "tank") === "plane") {
        console.warn("[TankController] steeringMode `plane` requires a `flight` config block.");
      }
    }
    this.turretYawAxis = axisFromConfig(
      options.config.rig.turretYawAxis,
      options.config.rig.turretYawSign
    );
    this.cannonPitchAxis = axisFromConfig(
      options.config.rig.cannonPitchAxis,
      options.config.rig.cannonPitchSign
    );

    const vehicle = options.config.vehicle;
    this.healthMax = Math.max(1, vehicle.healthMax);
    this.health = clamp(vehicle.startingHealth, 0, this.healthMax);

    this.battery = options.config.energy.startingBattery;
    this.overcharge = options.config.energy.startingOvercharge;
    this.shellReserveAmmo = this.primaryWeaponConfig.startingReserveAmmo;
    this.shellMagazineSize = Math.max(1, Math.floor(this.primaryWeaponConfig.magazineSize ?? 1));
    this.shellLoadedAmmo = this.primaryWeaponConfig.startsChambered ? this.shellMagazineSize : 0;
    this.shellChambered = this.shellLoadedAmmo > 0;
    this.resetMissileHardpointLoadedState();

    if (!this.tankAnchor.rotationQuaternion) {
      this.tankAnchor.rotationQuaternion = Quaternion.Identity();
    }

    if (this.tankVisualRoot && !this.tankVisualRoot.rotationQuaternion) {
      this.tankVisualRoot.rotationQuaternion = Quaternion.Identity();
    }

    const initialForward = this.tankAnchor.getDirection(this.movementForwardAxis);
    initialForward.y = 0;
    if (initialForward.lengthSquared() > 1e-6) {
      initialForward.normalize();
    }

    if (options.initialOrbit) {
      this.orbitYawRad = options.initialOrbit.yawRad;
      this.orbitPitchRad = options.initialOrbit.pitchRad;
      this.orbitRadius = options.initialOrbit.radius;
      this.applyOrbitCamera(0, 0);
    } else {
      this.initOrbitCameraState();
    }

    this.initAimDebugMeshes();
    this.initTrackSystem();
    if (this.config.debug?.showSuspensionSpheres) {
      this.initSuspensionDebugSpheres();
    }
    if (this.config.debug?.showMuzzleEmpties) {
      this.initMuzzleDebugVisuals();
    }
    this.initHud();
    this.initShockwaveFx(options);
    this.initWeaponSounds();
    this.initMuzzleFlashLights();
    this.initPowerUpSounds();
    this.initTankMovementSounds();
    this.initTurretSounds();

    // Browsers require a user gesture to start audio.
    options.canvas.addEventListener(
      "pointerdown",
      () => {
        if (this.audioUnlocked) return;
        this.audioUnlocked = true;
        try {
          // Babylon audio engine unlock (if available)
          const ae = (AbstractEngine as any).audioEngine;
          if (!ae) {
            console.warn("[TankController][audio] AbstractEngine.audioEngine is missing (no WebAudio).");
            return;
          }
          ae.unlock?.();
          ae.audioContext?.resume?.();
          // Warm-up: some browsers need a play after resume.
          const warm = this.cannonShotSound;
          if (warm) {
            const prev = warm.getVolume();
            warm.setVolume(0);
            warm.play();
            warm.stop();
            warm.setVolume(prev);
          }
        } catch {
          // ignore
        }
        if (this.playerActive) {
          this.syncTankMovementSounds();
        }
      },
      { passive: true }
    );
    this.scene.onBeforeRenderObservable.add(this.update);
    this.scene.onBeforePhysicsObservable.add(this.syncUprightResetBeforePhysics);
    this.scene.onAfterPhysicsObservable.add(this.finishUprightResetPrestep);
  }

  private createPowerUpSystem(options: TankGameplayControllerOptions): PowerUpSystem | null {
    if (options.sharedPowerUpSystem !== undefined) {
      return options.sharedPowerUpSystem;
    }

    const powerUps = options.config.powerUps;
    if (powerUps?.enabled !== true || !powerUps.types) {
      return null;
    }

    try {
      return new PowerUpSystem({
        scene: options.scene,
        terrainContainer: options.terrainContainer,
        powerUpsContainer: options.powerUpsContainer,
        config: powerUps,
        tankColliderMesh: options.tankColliderMesh,
        showDebugBounds: options.config.debug?.showPowerUpBounds === true,
        onAmmoShellPickup: (amount) => this.addShellReserveAmmo(amount),
        onFuelPickup: (amount) => this.addBattery(amount),
        onRepairPickup: (amount) => this.repairHealth(amount),
        onShieldPickup: (durationSeconds, damageReduction) =>
          this.applyShield(durationSeconds, damageReduction),
        onPicked: (typeId) => this.playPowerUpSound(typeId)
      });
    } catch (error) {
      console.error("[TankController] PowerUpSystem init failed:", error);
      return null;
    }
  }

  private addShellReserveAmmo(amount: number): void {
    if (amount <= 0) {
      return;
    }
    this.shellReserveAmmo += amount;
  }

  private addBattery(amount: number): void {
    if (amount <= 0) {
      return;
    }
    this.battery = Math.min(this.battery + amount, this.config.energy.batteryMax);
  }

  /** Dégâts (projectiles, etc.). Les collisions tank↔murs n’appellent pas cette méthode. */
  public takeDamage(amount: number): void {
    if (amount <= 0 || this.health <= 0) {
      return;
    }
    if (this.shieldTimeRemaining > 0) {
      amount *= 1 - clamp(this.shieldDamageReduction, 0, 1);
      if (amount <= 1e-6) {
        return;
      }
    }
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.triggerPlayerDeath();
    }
  }

  private triggerPlayerDeath(): void {
    if (this.deathTriggered) {
      return;
    }

    this.deathTriggered = true;
    this.deathScreenDelaySeconds = 1;
    this.input.resetState();
    this.health = 0;

    const deathPos = this.playerTargetNode?.getAbsolutePosition().clone() ?? this.tankAnchor.getAbsolutePosition().clone();
    void this.spawnExplosionAt(deathPos);

    this.tankBody.setLinearVelocity(Vector3.Zero());
    this.tankBody.setAngularVelocity(Vector3.Zero());

    this.applyPlayerDeathMaterial();

    this.hudTexture?.dispose();
    this.hudTexture = null;
    this.tankDamageParticles?.syncHealthPercent(0);
    this.stopEngineSounds();
    this.turretStartSound?.stop();
    this.turretLoopSound?.stop();
    this.turretStopSound?.stop();
    this.turretSoundState = "stopped";
  }

  private getPlayerDeathMaterial(): StandardMaterial {
    if (this.deathBlackMaterial) {
      return this.deathBlackMaterial;
    }

    const mat = new StandardMaterial("tank_death_black_mat", this.scene);
    mat.diffuseColor = new Color3(0.006, 0.005, 0.004);
    mat.specularColor = new Color3(0.18, 0.16, 0.13);
    mat.emissiveColor = Color3.Black();
    mat.specularPower = 18;
    mat.disableLighting = false;
    mat.backFaceCulling = false;
    this.deathBlackMaterial = mat;
    return mat;
  }

  private applyPlayerDeathMaterial(): void {
    const mat = this.getPlayerDeathMaterial();
    const seen = new Set<number>();

    for (const mesh of this.tankDeathVisualMeshes) {
      if (seen.has(mesh.uniqueId)) {
        continue;
      }
      seen.add(mesh.uniqueId);
      mesh.material = mat;
      mesh.isPickable = false;
    }
  }

  private isTankVisualDeathMesh(mesh: AbstractMesh): boolean {
    const name = mesh.name.trim().toLowerCase();
    return (
      mesh.getTotalVertices() > 0 &&
      !name.startsWith("col_") &&
      !name.startsWith("ammo_") &&
      !name.startsWith("ui_") &&
      !name.startsWith("tex_tracks")
    );
  }

  private initTrackUvScrollers(tankContainer: AssetContainer): void {
    const names = ["tank_tracks_L", "tank_tracks_R"];
    for (const meshName of names) {
      const mesh = tankContainer.meshes.find((candidate) => candidate.name === meshName) ?? null;
      if (!mesh) {
        console.warn(`[TankController][tracks] ${meshName} mesh missing; tread UV animation disabled for this side.`);
        continue;
      }

      const textures = this.prepareIndependentTrackTextures(mesh);
      if (textures.length === 0) {
        console.warn(`[TankController][tracks] ${meshName} has no scrollable texture slots.`);
        continue;
      }

      this.trackUvScrollers.push({ mesh, textures });
    }
  }

  private prepareIndependentTrackTextures(mesh: AbstractMesh): ScrollableTexture[] {
    const sourceMaterial = mesh.material;
    if (!sourceMaterial) {
      return [];
    }

    const materialClone = sourceMaterial.clone(`${sourceMaterial.name}_${mesh.name}_uv_scroll`);
    mesh.material = materialClone ?? sourceMaterial;
    const material = mesh.material as unknown as Record<string, unknown>;
    const textures: ScrollableTexture[] = [];
    const seen = new Set<ScrollableTexture>();

    for (const textureProperty of TRACK_UV_TEXTURE_PROPERTIES) {
      const sourceTexture = material[textureProperty];
      if (!isScrollableTexture(sourceTexture)) {
        continue;
      }

      const textureClone = sourceTexture.clone?.();
      if (isScrollableTexture(textureClone)) {
        material[textureProperty] = textureClone;
        if (!seen.has(textureClone)) {
          seen.add(textureClone);
          textures.push(textureClone);
        }
        continue;
      }

      if (!seen.has(sourceTexture)) {
        seen.add(sourceTexture);
        textures.push(sourceTexture);
      }
    }

    return textures;
  }

  private repairHealth(amount: number): void {
    if (amount <= 0) {
      return;
    }
    this.health = Math.min(this.health + amount, this.healthMax);
  }

  private applyShield(durationSeconds: number, damageReduction: number): void {
    if (durationSeconds <= 0) {
      return;
    }
    this.shieldTimeRemaining = durationSeconds;
    this.shieldDamageReduction = clamp(damageReduction, 0, 1);
    this.syncShieldHighlight();
  }

  private createShieldHighlightLayer(): HighlightLayer | null {
    try {
      const highlightOpts = this.config.powerUps?.highlight;
      return new HighlightLayer("tank_shield_highlight", this.scene, {
        generateStencilBuffer: true,
        blurHorizontalSize: highlightOpts?.blurHorizontalSize ?? 0.1,
        blurVerticalSize: highlightOpts?.blurVerticalSize ?? 0.1
      });
    } catch (error) {
      console.error("[TankController] Shield HighlightLayer init failed:", error);
      return null;
    }
  }

  private syncShieldHighlight(): void {
    const active = this.playerActive && this.shieldTimeRemaining > 0;
    if (active === this.shieldHighlightVisualActive) {
      return;
    }
    this.shieldHighlightVisualActive = active;

    const layer = this.shieldHighlightLayer;
    if (!layer) {
      return;
    }

    for (const mesh of this.shieldHighlightMeshes) {
      if (active) {
        if (!layer.hasMesh(mesh)) {
          layer.addMesh(mesh, TankGameplayController.SHIELD_GLOW_COLOR);
        }
      } else if (layer.hasMesh(mesh)) {
        layer.removeMesh(mesh);
      }
    }
  }

  private initPowerUpSounds(): void {
    const entries: Array<[PowerUpTypeId, string]> = [
      ["ammo_shell", powerUpAmmoSoundAssetUrl],
      ["fuel", powerUpFuelSoundAssetUrl],
      ["repair", powerUpRepairSoundAssetUrl],
      ["shield", powerUpShieldSoundAssetUrl]
    ];

    for (const [typeId, url] of entries) {
      try {
        const sound = new Sound(
          `pu_${typeId}`,
          url,
          this.scene,
          null,
          { autoplay: false, loop: false, volume: 0.85 }
        );
        (sound as any).onErrorObservable?.add((err: unknown) =>
          console.warn(`[TankController][audio] power-up sound "${typeId}" load failed:`, err)
        );
        this.powerUpSounds.set(typeId, sound);
      } catch {
        // Audio is optional.
      }
    }
  }

  /** Charge un son optionnel décrit par une clé de config (`audio.*`). */
  private createConfigSound(
    name: string,
    key: string | null | undefined,
    options: { loop: boolean; volume: number }
  ): Sound | null {
    const url = resolveVehicleSoundUrl(key);
    if (!url) {
      return null;
    }

    try {
      const sound = new Sound(name, url, this.scene, null, {
        autoplay: false,
        loop: options.loop,
        volume: options.volume
      });
      (sound as any).onErrorObservable?.add((err: unknown) =>
        console.warn(`[TankController][audio] "${key}" load failed:`, err)
      );
      return sound;
    } catch {
      // Audio is optional.
      return null;
    }
  }

  private initTankMovementSounds(): void {
    const audio = this.config.audio;
    // Un bloc `audio` déclaré fait autorité : une clé absente ou nulle coupe le son,
    // sans quoi un véhicule sans banque dédiée hériterait de celle du tank.
    const idleKey = audio ? audio.engineIdle : "tank_idle";
    const moveKey = audio ? audio.engineMove : "tank_move";
    const impactKey = audio ? audio.suspensionImpact : "suspension";
    this.tankIdleSound = this.createConfigSound("engine_idle", idleKey, {
      loop: true,
      volume: audio?.engineIdleVolume ?? 0.42
    });
    this.tankMoveSound = this.createConfigSound("engine_move", moveKey, {
      loop: true,
      volume: audio?.engineMoveVolumeMax ?? 0.7
    });
    this.tankTurboSound = this.createConfigSound("engine_turbo", audio?.engineTurbo, {
      loop: true,
      volume: audio?.engineTurboVolume ?? 0.62
    });
    this.hornSound = this.createConfigSound("horn", audio?.horn, {
      loop: false,
      volume: audio?.hornVolume ?? 0.8
    });
    this.suspensionImpactSound = this.createConfigSound("suspension_impact", impactKey, {
      loop: false,
      volume: audio?.suspensionImpactVolumeMax ?? 0.7
    });
  }

  /**
   * Sollicitation moteur pour le mixage audio. En mode `tank` le braquage passe
   * par les chenilles, donc il monte le moteur ; sur une voiture le braquage
   * n'est qu'une orientation de roues et laisse le moteur au ralenti.
   */
  private getEngineLoadForAudio(): number {
    if (this.flightModel) {
      return this.flightModel.getState().throttle;
    }
    const throttle = Math.abs(this.smoothedMoveAxis);
    if ((this.config.movement.steeringMode ?? "tank") === "car") {
      return throttle;
    }
    return Math.max(throttle, Math.abs(this.smoothedTurnAxis));
  }

  private syncTankMovementSounds(): void {
    const isMoving = this.battery > 0 && this.getEngineLoadForAudio() > 0.001;
    this.updateTankMovementSounds(isMoving);
  }

  private updateTankMovementSounds(isMoving: boolean): void {
    if (!this.audioUnlocked) {
      return;
    }
    if (!this.playerActive) {
      this.stopEngineSounds();
      return;
    }

    const audio = this.config.audio;
    let target: "idle" | "move" | "turbo" = isMoving ? "move" : "idle";
    if (target === "move" && this.boostActive && this.tankTurboSound) {
      target = "turbo";
    }

    if (this.tankMovementSoundMode !== target) {
      this.tankMovementSoundMode = target;
      this.tankIdleSound?.stop();
      this.tankMoveSound?.stop();
      this.tankTurboSound?.stop();
      if (target === "turbo") {
        this.tankTurboSound?.play();
      } else if (target === "move") {
        this.tankMoveSound?.play();
      } else {
        this.tankIdleSound?.play();
      }
    }

    if (target === "turbo") {
      this.tankTurboSound?.setVolume(audio?.engineTurboVolume ?? 0.62);
    } else if (target === "move" && this.tankMoveSound) {
      const speed = clamp(this.getEngineLoadForAudio(), 0, 1);
      const minVolume = audio?.engineMoveVolumeMin ?? 0.28;
      const maxVolume = audio?.engineMoveVolumeMax ?? 0.7;
      this.tankMoveSound.setVolume(minVolume + (maxVolume - minVolume) * speed);
    } else if (this.tankIdleSound) {
      this.tankIdleSound.setVolume(audio?.engineIdleVolume ?? 0.42);
    }
  }

  private stopEngineSounds(): void {
    this.tankIdleSound?.stop();
    this.tankMoveSound?.stop();
    this.tankTurboSound?.stop();
    this.tankMovementSoundMode = "stopped";
  }

  private tryPlayHorn(): void {
    if (!this.audioUnlocked || !this.hornSound || this.hornCooldown > 0) {
      return;
    }

    this.hornCooldown = this.config.audio?.hornCooldownSeconds ?? 0.2;
    try {
      this.hornSound.stop();
      this.hornSound.play();
    } catch {
      // Audio is optional.
    }
  }

  /**
   * Impact des suspensions à la réception : volume proportionnel à la vitesse de
   * chute, avec garde anti-répétition pour les rebonds sur terrain accidenté.
   */
  private playSuspensionImpactSound(fallSpeed: number, airborneSeconds: number): void {
    const sound = this.suspensionImpactSound;
    if (!this.audioUnlocked || !sound || this.suspensionImpactCooldown > 0) {
      return;
    }

    const audio = this.config.audio;
    if (airborneSeconds < (audio?.suspensionImpactMinAirSeconds ?? 0.1)) {
      return;
    }

    const minSpeed = audio?.suspensionImpactMinSpeed ?? 1.2;
    if (fallSpeed < minSpeed) {
      return;
    }

    const maxSpeed = Math.max(audio?.suspensionImpactMaxSpeed ?? 9, minSpeed + 1e-3);
    const strength = clamp((fallSpeed - minSpeed) / (maxSpeed - minSpeed), 0, 1);
    const minVolume = audio?.suspensionImpactVolumeMin ?? 0.3;
    const maxVolume = audio?.suspensionImpactVolumeMax ?? 0.7;

    this.suspensionImpactCooldown = audio?.suspensionImpactCooldownSeconds ?? 0.18;
    try {
      sound.setVolume(minVolume + (maxVolume - minVolume) * strength);
      sound.stop();
      sound.play();
    } catch {
      // Audio is optional.
    }
  }

  private initTurretSounds(): void {
    try {
      this.turretStartSound = new Sound(
        "turret_start",
        turretStartSoundAssetUrl,
        this.scene,
        null,
        { autoplay: false, loop: false, volume: 0.5 }
      );
      (this.turretStartSound as any).onErrorObservable?.add((err: unknown) =>
        console.warn("[TankController][audio] turret_start load failed:", err)
      );
      this.turretStartSound.onended = () => {
        if (this.turretSoundState === "starting" && this.articulationIsRotating) {
          this.turretLoopSound?.play();
          this.turretSoundState = "looping";
        }
      };

      this.turretLoopSound = new Sound(
        "turret_loop",
        turretLoopSoundAssetUrl,
        this.scene,
        null,
        { autoplay: false, loop: true, volume: 0.45 }
      );
      (this.turretLoopSound as any).onErrorObservable?.add((err: unknown) =>
        console.warn("[TankController][audio] turret_loop load failed:", err)
      );

      this.turretStopSound = new Sound(
        "turret_stop",
        turretStopSoundAssetUrl,
        this.scene,
        null,
        { autoplay: false, loop: false, volume: 0.5 }
      );
      (this.turretStopSound as any).onErrorObservable?.add((err: unknown) =>
        console.warn("[TankController][audio] turret_stop load failed:", err)
      );
      this.turretStopSound.onended = () => {
        if (this.turretSoundState === "stopping") {
          this.turretSoundState = "stopped";
        }
      };
    } catch {
      // Audio is optional.
    }
  }

  private beginTurretSoundStarting(): void {
    this.turretLoopSound?.stop();
    this.turretStopSound?.stop();
    this.turretStartSound?.stop();
    this.turretSoundState = "starting";
    this.turretStartSound?.play();
  }

  private beginTurretSoundStopping(): void {
    // State must change before stopping `turret_start`, otherwise its `onended`
    // can fire while still "starting" and leave the loop playing.
    this.turretSoundState = "stopping";
    this.turretStartSound?.stop();
    this.turretLoopSound?.stop();
    this.turretStopSound?.stop();
    this.turretStopSound?.play();
  }

  private syncArticulationSounds(turretStepDeg: number, cannonStepDeg: number): void {
    if (!this.audioUnlocked) {
      return;
    }

    const yawRemainingDeg = Math.abs(shortestAngleDeltaDeg(this.currentTurretYawDeg, this.targetTurretYawDeg));
    const pitchRemainingDeg = Math.abs(this.targetCannonPitchDeg - this.currentCannonPitchDeg);
    const turretRotating = turretStepDeg > 0.01 && yawRemainingDeg > 0.05;
    const cannonRotating = cannonStepDeg > 0.01 && pitchRemainingDeg > 0.05;
    const rotating = turretRotating || cannonRotating;
    this.articulationIsRotating = rotating;

    switch (this.turretSoundState) {
      case "stopped":
        if (rotating) {
          this.beginTurretSoundStarting();
        }
        break;

      case "starting":
        if (!rotating) {
          this.beginTurretSoundStopping();
        }
        break;

      case "looping":
        if (!rotating) {
          this.beginTurretSoundStopping();
        } else if (this.turretLoopSound) {
          const turretSpeed = clamp(
            turretStepDeg / Math.max(this.config.turret.yawSpeedDeg / 60, 0.001),
            0,
            1
          );
          const cannonSpeed = clamp(
            cannonStepDeg / Math.max(this.config.cannon.pitchSpeedDeg / 60, 0.001),
            0,
            1
          );
          const speed = Math.max(turretSpeed, cannonSpeed);
          this.turretLoopSound.setVolume(0.28 + 0.28 * speed);
        }
        break;

      case "stopping":
        if (rotating) {
          this.beginTurretSoundStarting();
        } else {
          this.turretLoopSound?.stop();
          if (!this.turretStopSound?.isPlaying) {
            this.turretSoundState = "stopped";
          }
        }
        break;
    }
  }

  private playShellInsertSound(): void {
    if (!this.audioUnlocked || !this.shellInsertSound) {
      return;
    }

    try {
      this.shellInsertSound.stop();
      this.shellInsertSound.play();
    } catch {
      // Ignore playback errors (autoplay restrictions, etc.).
    }
  }

  private playPowerUpSound(typeId: PowerUpTypeId): void {
    const sound = this.powerUpSounds.get(typeId);
    if (!sound) {
      return;
    }

    try {
      sound.stop();
      sound.play();
    } catch {
      // Ignore playback errors (autoplay restrictions, etc.).
    }
  }

  private initWeaponSounds(): void {
    // Sounds are 2D (non-spatial) for now. Pool gun shots to allow overlap at high ROF.
    try {
      this.cannonShotSound = new Sound(
        "tank_cannon_shot",
        tankCannonSoundAssetUrl,
        this.scene,
        () => {
          // no-op; audio unlock happens on first click
        },
        { autoplay: false, loop: false, volume: 1.0 }
      );
      (this.cannonShotSound as any).onErrorObservable?.add((err: unknown) =>
        console.warn("[TankController][audio] cannon sound load failed:", err)
      );

      const missileSoundUrls = [
        missile1SoundAssetUrl,
        missile2SoundAssetUrl,
        missile3SoundAssetUrl,
        missile4SoundAssetUrl
      ];
      this.missileShotSounds = missileSoundUrls.map(
        (url, index) =>
          new Sound(
            `missile_shot_${index + 1}`,
            url,
            this.scene,
            null,
            { autoplay: false, loop: false, volume: 1.0 }
          )
      );
      for (const [index, sound] of this.missileShotSounds.entries()) {
        (sound as any).onErrorObservable?.add((err: unknown) =>
          console.warn(`[TankController][audio] missile_${index + 1} sound load failed:`, err)
        );
      }

      this.shellInsertSound = new Sound(
        "shell_insert",
        shellInsertSoundAssetUrl,
        this.scene,
        null,
        { autoplay: false, loop: false, volume: 0.65 }
      );
      (this.shellInsertSound as any).onErrorObservable?.add((err: unknown) =>
        console.warn("[TankController][audio] shell_insert load failed:", err)
      );

      const baseGun = new Sound(
        "tank_gun_shot_base",
        tankGunSoundAssetUrl,
        this.scene,
        () => {
          // Build pool from decoded AudioBuffer (reliable replay at high ROF).
          this.gunShotAudioBuffer = baseGun.getAudioBuffer();
          this.gunShotSoundPool = [];
          const poolSize = 10;
          for (let i = 0; i < poolSize; i++) {
            const s =
              i === 0
                ? baseGun
                : new Sound(
                    `tank_gun_shot_${i}`,
                    this.gunShotAudioBuffer,
                    this.scene,
                    null,
                    { autoplay: false, loop: false, volume: 0.7 }
                  );
            this.gunShotSoundPool.push(s);
          }
        },
        { autoplay: false, loop: false, volume: 0.7 }
      );
      (baseGun as any).onErrorObservable?.add((err: unknown) =>
        console.warn("[TankController][audio] gun sound load failed:", err)
      );
      // If audio buffer isn't ready yet, keep at least the base sound to allow early play.
      this.gunShotSoundPool = [baseGun];
    } catch {
      // Audio is optional; ignore initialization failures (e.g., autoplay restrictions).
    }
  }

  private initShockwaveFx(options: TankGameplayControllerOptions): void {
    const candidates = options.tankContainer.meshes;
    const tpl =
      candidates.find((m) => m.name.trim().toLowerCase() === "fx_shockwave") ??
      candidates.find((m) => m.name.trim().toLowerCase().startsWith("fx_shockwave."));
    if (!tpl) {
      return;
    }

    this.shockwaveTemplate = tpl as unknown as BabylonMesh;
    // Hide template, keep as instancing source.
    tpl.isPickable = false;
    tpl.setEnabled(false);
    tpl.isVisible = false;

    // Make shockwave unlit + 50% opacity (without depending on scene lights).
    // Works for both StandardMaterial-like and PBR-like materials.
    if (tpl.material) {
      const m = tpl.material.clone(`${tpl.material.name}_shockwave_unlit`);
      // StandardMaterial
      if ("disableLighting" in (m as any)) {
        (m as any).disableLighting = true;
      }
      // PBRMaterial
      if ("unlit" in (m as any)) {
        (m as any).unlit = true;
      }
      if ("alpha" in (m as any)) {
        (m as any).alpha = 0.5;
      }
      tpl.material = m;
    }

    // Use pooled clones (not instances) so per-shockwave `visibility` fade works.
    for (let i = 0; i < TankGameplayController.SHOCKWAVE_POOL_SIZE; i++) {
      const clone = (tpl as unknown as BabylonMesh).clone(`fx_shockwave_clone_${i}`, null) as
        | BabylonMesh
        | null;
      if (!clone) continue;
      clone.isPickable = false;
      clone.setParent(null);
      clone.setEnabled(false);
      clone.isVisible = true;
      clone.rotationQuaternion ??= Quaternion.Identity();
      clone.scaling.setAll(0);
      clone.visibility = 0;
      this.shockwavePool.push(clone);
    }
  }

  private initHud(): void {
    const sharedUi = getSceneGameplayUi(this.scene);
    if (sharedUi) {
      this.hudTexture = sharedUi.hudTexture;
      this.ownsSceneHud = false;
      this.initRadarHud();
      return;
    }

    this.hudTexture = AdvancedDynamicTexture.CreateFullscreenUI("hud_ui", true, this.scene);
    this.hudTexture.useSmallestIdeal = true;
    this.ownsSceneHud = true;
    setSceneGameplayUi(this.scene, {
      hudTexture: this.hudTexture,
      hudLayoutReady: false,
      hudReticlesAttached: false,
      radarHud: null,
      vehicleSelectorHud: null
    });

    void AdvancedDynamicTexture.ParseFromFileAsync(hudLayoutJsonUrl, true, this.hudTexture)
      .then(() => {
        this.bindHudLayoutFromJson(false);
        const ui = getSceneGameplayUi(this.scene);
        if (ui) {
          ui.hudLayoutReady = true;
        }
        this.attachHudReticlesIfNeeded();
        const uiAfterReticles = getSceneGameplayUi(this.scene);
        if (uiAfterReticles) {
          uiAfterReticles.hudReticlesAttached = this.hudReticlesAttached;
        }
        this.initRadarHud();
        this.onSharedHudLayoutReady();
      })
      .catch((err: unknown) => {
        console.warn("[TankController] UI_hud.json parse failed:", err);
        this.attachHudReticlesIfNeeded();
        this.initRadarHud();
      });

    this.initSparkImpactSprites();
  }

  /** HUD partagé : lier les contrôles et afficher si ce véhicule est actif. */
  private attachToSharedHud(): void {
    const sharedUi = getSceneGameplayUi(this.scene);
    if (!sharedUi?.hudTexture) {
      return;
    }

    this.hudTexture = sharedUi.hudTexture;
    if (sharedUi.hudLayoutReady && !this.hudJsonLoaded) {
      this.bindHudLayoutFromJson(true);
      if (sharedUi.hudReticlesAttached) {
        this.rebindHudReticleRefs();
      }
    }

    if (this.playerActive && this.hudTexture.rootContainer) {
      this.hudTexture.rootContainer.isVisible = true;
    }
  }

  /** Propriétaire du HUD : layout JSON prêt. */
  private onSharedHudLayoutReady(): void {
    if (!this.playerActive) {
      return;
    }

    this.attachToSharedHud();
    this.refreshWeaponHudContent();
    this.refreshStatusHudContent();
  }

  private rebindHudReticleRefs(): void {
    if (!this.hudTexture) {
      return;
    }

    this.hudReticlesAttached = true;
    this.barrelShellReticle2D = this.hudTexture.getControlByName(
      "reticle_barrel_shell_img"
    ) as Rectangle | null;
    this.barrelGunReticle2D = this.hudTexture.getControlByName(
      "reticle_barrel_gun_img"
    ) as Rectangle | null;
    this.syncPrimaryWeaponReticleAsset();
    this.ensureJetMissileLockController();
  }

  private showSharedHud(): void {
    this.attachToSharedHud();
    if (this.hudTexture?.rootContainer) {
      this.hudTexture.rootContainer.isVisible = true;
    }
  }

  private hideSharedHud(): void {
    if (this.hudTexture?.rootContainer) {
      this.hudTexture.rootContainer.isVisible = false;
    }
  }

  private initRadarHud(): void {
    const sharedUi = getSceneGameplayUi(this.scene);
    if (sharedUi?.radarHud) {
      this.radarHud = sharedUi.radarHud;
      return;
    }

    if (this.radarHud || !this.hudTexture || !this.radarMapUrl || !this.radarWorldBounds) {
      return;
    }

    this.radarHud = new RadarHud(this.hudTexture, this.radarMapUrl, this.radarWorldBounds);
    if (sharedUi) {
      sharedUi.radarHud = this.radarHud;
    }
  }

  private bindHudLayoutFromJson(skipLayoutSetup = false): void {
    if (!this.hudTexture) {
      return;
    }
    const t = this.hudTexture;
    this.hudPanelStatus = t.getControlByName("hud_panel_status") as Rectangle | null;
    this.hudHealthBarBg = t.getControlByName("hud_health_bar_bg") as Rectangle | null;
    this.hudHealthIcon = t.getControlByName("hud_health_icon") as Image | null;
    if (!skipLayoutSetup) {
      this.setupHealthBarSegments();
    } else {
      this.rebindStatusBarSegmentRefs();
    }
    this.hudFuelBarBg = t.getControlByName("hud_fuel_bar_bg") as Rectangle | null;
    this.hudFuelIcon = t.getControlByName("hud_fuel_icon") as Image | null;
    this.hudBoostFill = t.getControlByName("hud_boost_bar_fill") as Rectangle | null;
    this.hudBoostIcon = t.getControlByName("hud_boost_icon") as Image | null;
    if (!skipLayoutSetup) {
      this.setupFuelBarSegments();
      this.setupStatusHudLayout();
      this.setupStatusHudSpacing();
      this.setupStatusHudIcons();
      this.initStatusHudChrome();
    }

    this.hudPanelTimer = t.getControlByName("hud_panel_timer") as Rectangle | null;
    this.hudTimerLabel = t.getControlByName("hud_timer_label") as TextBlock | null;
    if (!skipLayoutSetup) {
      this.setupTimerHudLayout();
      this.initTimerHudChrome();
    }

    this.hudWeaponPrimary = t.getControlByName("hud_weapon_primary") as Rectangle | null;
    this.hudWeaponSecondary = t.getControlByName("hud_weapon_secondary") as Rectangle | null;
    this.hudWeaponPrimaryIcon = t.getControlByName("hud_weapon_primary_icon") as Image | null;
    this.hudWeaponSecondaryIcon = t.getControlByName("hud_weapon_secondary_icon") as Image | null;
    this.hudWeaponPrimaryAmmo = t.getControlByName("hud_weapon_primary_ammo") as TextBlock | null;
    this.hudWeaponSecondaryAmmo = t.getControlByName("hud_weapon_secondary_ammo") as TextBlock | null;
    if (!skipLayoutSetup) {
      this.setupWeaponHudImages();
      this.setupWeaponHudLayout();
      this.initWeaponHudReloadGauges();
      this.initWeaponHudChrome();
      applyUiFontToTexture(t);
    } else {
      this.rebindWeaponHudReloadGaugeRefs();
    }

    this.hudBoostIndicator = t.getControlByName("hud_boost_indicator") as TextBlock | null;
    this.hudZoomIndicator = t.getControlByName("hud_zoom_indicator") as TextBlock | null;
    this.weaponHudDisplayedWeapon = this.activeWeapon;
    if (!skipLayoutSetup) {
      this.sessionElapsedSeconds = 0;
    }
    this.hudJsonLoaded = true;
    this.refreshWeaponHudContent();
    this.refreshStatusHudContent();
    this.resetWeaponSlotTransforms();
  }

  /** HUD partagé : retrouver les segments déjà créés par le premier véhicule. */
  private rebindStatusBarSegmentRefs(): void {
    if (!this.hudTexture) {
      return;
    }

    this.hudHealthSegmentFills = [];
    for (let i = 0; i < HEALTH_BAR_SEGMENT_COUNT; i++) {
      const fill = this.hudTexture.getControlByName(
        `hud_health_seg_fill_${i}`
      ) as Rectangle | null;
      if (fill) {
        this.hudHealthSegmentFills.push(fill);
      }
    }
    this.healthBarSegmentsReady =
      this.hudHealthSegmentFills.length === HEALTH_BAR_SEGMENT_COUNT;

    this.hudFuelSegmentFills = [];
    for (let i = 0; i < 2; i++) {
      const fill = this.hudTexture.getControlByName(`hud_fuel_seg_fill_${i}`) as Rectangle | null;
      if (fill) {
        this.hudFuelSegmentFills.push(fill);
      }
    }
    this.fuelBarSegmentsReady = this.hudFuelSegmentFills.length === 2;
  }

  /** HUD partagé : retrouver les jauges de rechargement créées par le premier véhicule. */
  private rebindWeaponHudReloadGaugeRefs(): void {
    if (!this.hudTexture) {
      return;
    }

    this.hudWeaponPrimaryReloadFill = this.hudTexture.getControlByName(
      "hud_weapon_primary_reload"
    ) as Rectangle | null;
    this.hudWeaponSecondaryReloadFill = this.hudTexture.getControlByName(
      "hud_weapon_secondary_reload"
    ) as Rectangle | null;
    this.weaponHudReloadGaugesReady =
      this.hudWeaponPrimaryReloadFill !== null || this.hudWeaponSecondaryReloadFill !== null;
  }

  /** Met à jour santé / carburant / boost pour le véhicule actif (switch immédiat). */
  private refreshStatusHudContent(): void {
    if (!this.hudJsonLoaded || !this.hudTexture) {
      return;
    }

    const shieldActive = this.shieldTimeRemaining > 0;
    const hpPct = clamp((this.health / this.healthMax) * 100, 0, 100);
    this.updateHealthBarSegments(hpPct, shieldActive);

    const batteryMax = this.config.energy.batteryMax;
    const overchargeMax = this.config.energy.overchargeMax;
    const batPct = clamp((this.battery / batteryMax) * 100, 0, 100);
    const ocPct = clamp((this.overcharge / overchargeMax) * 100, 0, 100);
    const ocHud = this.boostInputHeld ? Math.floor(ocPct) : Math.round(ocPct);
    this.fuelLowBlinkPhase = 0;
    this.updateFuelBarSegments(batPct, 0);
    if (this.hudBoostFill) {
      this.hudBoostFill.width = `${ocHud}%`;
      this.hudBoostFill.background = VEHICLE_STATUS_BAR_FILL;
    }

    this.tankDamageParticles?.syncHealthPercent(hpPct);
  }

  /** Reticles above HUD layout (`zIndex`). Idempotent. */
  private attachHudReticlesIfNeeded(): void {
    const sharedUi = getSceneGameplayUi(this.scene);
    if (sharedUi?.hudReticlesAttached) {
      this.rebindHudReticleRefs();
      return;
    }

    if (!this.hudTexture || this.hudReticlesAttached) {
      return;
    }
    this.hudReticlesAttached = true;
    const z = 50;

    const cam = new Image("reticle_camera_img", reticleCameraAssetUrl);
    cam.widthInPixels = 150;
    cam.heightInPixels = 150;
    cam.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    cam.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    cam.isPointerBlocker = false;
    cam.zIndex = z;
    this.hudTexture.addControl(cam);

    const barrelShell = new Image("reticle_barrel_shell_img", reticleBarrelAssetUrl);
    barrelShell.widthInPixels = 150;
    barrelShell.heightInPixels = 150;
    barrelShell.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    barrelShell.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    barrelShell.isVisible = false;
    barrelShell.isPointerBlocker = false;
    barrelShell.zIndex = z;
    this.hudTexture.addControl(barrelShell);
    this.barrelShellReticle2D = barrelShell as unknown as Rectangle;

    const barrelGun = new Image("reticle_barrel_gun_img", reticleGunAssetUrl);
    barrelGun.widthInPixels = 150;
    barrelGun.heightInPixels = 150;
    barrelGun.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    barrelGun.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    barrelGun.isVisible = false;
    barrelGun.isPointerBlocker = false;
    barrelGun.zIndex = z;
    this.hudTexture.addControl(barrelGun);
    this.barrelGunReticle2D = barrelGun as unknown as Rectangle;

    this.syncPrimaryWeaponReticleAsset();
    this.ensureJetMissileLockController();

    if (sharedUi) {
      sharedUi.hudReticlesAttached = true;
    }
  }

  private initSparkImpactSprites(): void {
    const poolSize = 64;
    this.sparkSpriteManager = new SpriteManager(
      "spark_impact_sprite_mgr",
      sparkImpactAssetUrl,
      poolSize,
      { width: 350, height: 350 },
      this.scene
    );
    this.sparkSpriteManager.isPickable = false;
    this.sparkSpriteManager.disableDepthWrite = false;

    for (let i = 0; i < poolSize; i++) {
      const s = new Sprite(`spark_sprite_${i}`, this.sparkSpriteManager);
      s.isVisible = false;
      s.size = 0;
      s.angle = 0;
      s.color.a = 1;
      this.sparkSpritePool.push(s);
    }
  }

  private updateGameplayHud(dt: number): void {
    if (!this.hudJsonLoaded || !this.hudTexture) {
      return;
    }

    const shieldActive = this.shieldTimeRemaining > 0;
    const hpPct = clamp((this.health / this.healthMax) * 100, 0, 100);
    this.updateHealthBarSegments(hpPct, shieldActive);

    const batteryMax = this.config.energy.batteryMax;
    const overchargeMax = this.config.energy.overchargeMax;
    const batPct = clamp((this.battery / batteryMax) * 100, 0, 100);
    const ocPct = clamp((this.overcharge / overchargeMax) * 100, 0, 100);
    const ocHud = this.boostInputHeld ? Math.floor(ocPct) : Math.round(ocPct);
    this.updateFuelBarSegments(batPct, dt);
    if (this.hudBoostFill) {
      this.hudBoostFill.width = `${ocHud}%`;
      this.hudBoostFill.background = VEHICLE_STATUS_BAR_FILL;
    }

    this.updateWeaponHud(dt);
    this.sessionElapsedSeconds += dt;
    if (this.hudTimerLabel) {
      this.hudTimerLabel.text = formatSessionTimer(this.sessionElapsedSeconds);
    }

    if (this.hudBoostIndicator) {
      this.hudBoostIndicator.text = this.boostActive ? "BOOST : ON" : "BOOST : OFF";
      this.hudBoostIndicator.color = this.boostActive ? "#ff9800" : "#ffffff";
    }
    if (this.hudZoomIndicator) {
      this.hudZoomIndicator.text = this.zoomActive ? "ZOOM : ON" : "ZOOM : OFF";
      this.hudZoomIndicator.color = this.zoomActive ? "#90caf9" : "#ffffff";
    }
  }

  private setupHealthBarSegments(): void {
    if (this.healthBarSegmentsReady || !this.hudHealthBarBg) {
      return;
    }
    this.healthBarSegmentsReady = true;

    const legacyFill = this.hudHealthBarBg.getChildByName("hud_health_bar_fill");
    if (legacyFill) {
      this.hudHealthBarBg.removeControl(legacyFill);
    }

    this.hudHealthBarBg.background = "transparent";
    this.hudHealthBarBg.thickness = 0;

    const gapPx = HEALTH_BAR_SEGMENT_GAP_PX;
    const count = HEALTH_BAR_SEGMENT_COUNT;
    const segmentWidth = (HEALTH_BAR_WIDTH_PX - gapPx * (count - 1)) / count;
    this.hudHealthSegmentFills = [];

    for (let i = 0; i < count; i++) {
      const slot = new Rectangle(`hud_health_seg_slot_${i}`);
      slot.width = `${segmentWidth}px`;
      slot.height = "100%";
      slot.thickness = 0;
      slot.background = "transparent";
      slot.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      slot.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      slot.left = `${i * (segmentWidth + gapPx)}px`;
      slot.clipChildren = true;
      slot.isPointerBlocker = false;

      const bg = new Rectangle(`hud_health_seg_bg_${i}`);
      bg.width = "100%";
      bg.height = "100%";
      bg.thickness = 0;
      bg.background = VEHICLE_STATUS_BAR_EMPTY;
      bg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      bg.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      bg.isPointerBlocker = false;
      bg.zIndex = 0;

      const fill = new Rectangle(`hud_health_seg_fill_${i}`);
      fill.width = "0%";
      fill.height = "100%";
      fill.thickness = 0;
      fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      fill.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      fill.isPointerBlocker = false;
      fill.zIndex = 1;

      slot.addControl(bg);
      slot.addControl(fill);
      this.hudHealthBarBg.addControl(slot);
      this.hudHealthSegmentFills.push(fill);
    }
  }

  private setupFuelBarSegments(): void {
    if (this.fuelBarSegmentsReady || !this.hudFuelBarBg) {
      return;
    }
    this.fuelBarSegmentsReady = true;

    const legacyFill = this.hudFuelBarBg.getChildByName("hud_fuel_bar_fill");
    if (legacyFill) {
      this.hudFuelBarBg.removeControl(legacyFill);
    }

    this.hudFuelBarBg.background = "transparent";
    this.hudFuelBarBg.thickness = 0;

    const gapPx = HEALTH_BAR_SEGMENT_GAP_PX;
    const innerWidth = HEALTH_BAR_WIDTH_PX - gapPx;
    const lowWidth = innerWidth * FUEL_BAR_LOW_SEGMENT_RATIO;
    const highWidth = innerWidth - lowWidth;
    const segmentWidths = [lowWidth, highWidth];
    const segmentLefts = [0, lowWidth + gapPx];
    this.hudFuelSegmentFills = [];

    for (let i = 0; i < 2; i++) {
      const slot = new Rectangle(`hud_fuel_seg_slot_${i}`);
      slot.width = `${segmentWidths[i]}px`;
      slot.height = "100%";
      slot.thickness = 0;
      slot.background = "transparent";
      slot.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      slot.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      slot.left = `${segmentLefts[i]}px`;
      slot.clipChildren = true;
      slot.isPointerBlocker = false;

      const bg = new Rectangle(`hud_fuel_seg_bg_${i}`);
      bg.width = "100%";
      bg.height = "100%";
      bg.thickness = 0;
      bg.background = VEHICLE_STATUS_BAR_EMPTY;
      bg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      bg.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      bg.isPointerBlocker = false;
      bg.zIndex = 0;

      const fill = new Rectangle(`hud_fuel_seg_fill_${i}`);
      fill.width = "0%";
      fill.height = "100%";
      fill.thickness = 0;
      fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      fill.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      fill.isPointerBlocker = false;
      fill.zIndex = 1;

      slot.addControl(bg);
      slot.addControl(fill);
      this.hudFuelBarBg.addControl(slot);
      this.hudFuelSegmentFills.push(fill);
    }
  }

  private updateFuelBarSegments(batPct: number, dt: number): void {
    if (this.hudFuelSegmentFills.length !== 2) {
      return;
    }

    const lowThreshold = FUEL_BAR_LOW_THRESHOLD_PCT;
    const lowFuel = batPct <= lowThreshold;
    const fillPcts = [0, 0];

    if (batPct >= lowThreshold) {
      fillPcts[0] = 100;
      fillPcts[1] = clamp(((batPct - lowThreshold) / (100 - lowThreshold)) * 100, 0, 100);
    } else if (batPct > 0) {
      fillPcts[0] = (batPct / lowThreshold) * 100;
    }

    if (lowFuel) {
      this.fuelLowBlinkPhase += dt;
    } else {
      this.fuelLowBlinkPhase = 0;
    }

    const blinkAlpha =
      0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.fuelLowBlinkPhase * Math.PI * 2 * FUEL_BAR_LOW_BLINK_HZ));

    for (let i = 0; i < 2; i++) {
      const segment = this.hudFuelSegmentFills[i];
      const fillPct = fillPcts[i];
      segment.width = `${Math.round(fillPct)}%`;
      segment.isVisible = fillPct > 0;

      if (i === 0 && lowFuel && fillPct > 0) {
        segment.background = VEHICLE_STATUS_BAR_LOW;
        segment.alpha = blinkAlpha;
      } else {
        segment.background = VEHICLE_STATUS_BAR_FILL;
        segment.alpha = 1;
      }
    }
  }

  private updateHealthBarSegments(hpPct: number, shieldActive: boolean): void {
    if (this.hudHealthSegmentFills.length === 0) {
      return;
    }

    const lowHealth = hpPct < 25;
    const fillColor = shieldActive
      ? VEHICLE_STATUS_BAR_SHIELD
      : lowHealth
        ? VEHICLE_STATUS_BAR_LOW
        : VEHICLE_STATUS_BAR_FILL;

    for (let i = 0; i < HEALTH_BAR_SEGMENT_COUNT; i++) {
      const segment = this.hudHealthSegmentFills[i];
      const quarterStart = i * 25;
      const quarterEnd = (i + 1) * 25;
      let fillPct = 0;

      if (shieldActive) {
        fillPct = 100;
      } else if (hpPct >= quarterEnd) {
        fillPct = 100;
      } else if (hpPct > quarterStart) {
        fillPct = ((hpPct - quarterStart) / 25) * 100;
      }

      segment.width = `${Math.round(fillPct)}%`;
      segment.background = fillColor;
      segment.isVisible = fillPct > 0;
    }
  }

  private setupStatusHudLayout(): void {
    const hudRoot = this.hudTexture?.getControlByName("hud_root");
    if (hudRoot) {
      hudRoot.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      hudRoot.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    }
    if (!this.hudPanelStatus) {
      return;
    }
    this.hudPanelStatus.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.hudPanelStatus.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.hudPanelStatus.top = "-16px";
    this.hudPanelStatus.left = "0px";
    const panelHeight =
      VEHICLE_STATUS_STACK_PADDING_V * 2 +
      VEHICLE_STATUS_ROW_HEIGHT * 3 +
      VEHICLE_STATUS_ROW_GAP * 2;
    this.hudPanelStatus.height = `${panelHeight}px`;
  }

  private setupStatusHudSpacing(): void {
    if (this.statusHudSpacingReady || !this.hudTexture) {
      return;
    }

    const stack = this.hudTexture.getControlByName("hud_status_stack") as StackPanel | null;
    const fuelRow = this.hudTexture.getControlByName("hud_fuel_row");
    const boostRow = this.hudTexture.getControlByName("hud_boost_row");
    if (!stack || !fuelRow || !boostRow) {
      return;
    }

    this.statusHudSpacingReady = true;
    stack.paddingTop = VEHICLE_STATUS_STACK_PADDING_V;
    stack.paddingBottom = VEHICLE_STATUS_STACK_PADDING_V;
    fuelRow.paddingTop = 0;
    boostRow.paddingTop = 0;

    if (stack.getChildByName("hud_status_gap_health_fuel")) {
      return;
    }

    stack.removeControl(fuelRow);
    stack.removeControl(boostRow);
    stack.addControl(this.createStatusRowGap("hud_status_gap_health_fuel"));
    stack.addControl(fuelRow);
    stack.addControl(this.createStatusRowGap("hud_status_gap_fuel_boost"));
    stack.addControl(boostRow);
  }

  private createStatusRowGap(name: string): Rectangle {
    const gap = new Rectangle(name);
    gap.width = "100%";
    gap.height = `${VEHICLE_STATUS_ROW_GAP}px`;
    gap.thickness = 0;
    gap.background = "transparent";
    gap.isPointerBlocker = false;
    return gap;
  }

  private setupStatusHudIcons(): void {
    const icons: Array<{ control: Image | null; source: string }> = [
      { control: this.hudHealthIcon, source: healthStatusIconUrl },
      { control: this.hudFuelIcon, source: fuelStatusIconUrl },
      { control: this.hudBoostIcon, source: boostStatusIconUrl }
    ];

    for (const { control, source } of icons) {
      if (!control) {
        continue;
      }
      control.source = source;
      control.stretch = Image.STRETCH_UNIFORM;
      control.clipContent = false;
      control.isPointerBlocker = false;
    }
  }

  private initStatusHudChrome(): void {
    if (this.statusHudChromeReady || !this.hudPanelStatus) {
      return;
    }
    this.statusHudChromeReady = true;
    addHudCornerBrackets(this.hudPanelStatus, "hud_panel_status", 1);
  }

  private setupTimerHudLayout(): void {
    if (!this.hudPanelTimer) {
      return;
    }
    this.hudPanelTimer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.hudPanelTimer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.hudPanelTimer.left = "-16px";
    this.hudPanelTimer.top = "16px";
    if (this.hudTimerLabel) {
      this.hudTimerLabel.fontFamily = TIMER_FONT_FAMILY;
      this.hudTimerLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      this.hudTimerLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      this.hudTimerLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      this.hudTimerLabel.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      this.hudTimerLabel.isPointerBlocker = false;
    }
  }

  private initTimerHudChrome(): void {
    if (this.timerHudChromeReady || !this.hudPanelTimer) {
      return;
    }
    this.timerHudChromeReady = true;
    addHudCornerBrackets(this.hudPanelTimer, "hud_panel_timer", 1);
  }

  private setupWeaponHudImages(): void {
    for (const icon of [this.hudWeaponPrimaryIcon, this.hudWeaponSecondaryIcon]) {
      if (!icon) {
        continue;
      }
      icon.stretch = Image.STRETCH_UNIFORM;
      icon.isPointerBlocker = false;
    }
  }

  private setupWeaponHudLayout(): void {
    if (this.weaponHudLayoutReady) {
      return;
    }
    this.weaponHudLayoutReady = true;

    if (this.hudWeaponPrimary) {
      this.hudWeaponPrimary.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      this.hudWeaponPrimary.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      this.hudWeaponPrimary.clipChildren = false;
      this.hudWeaponPrimary.clipContent = false;
    }
    if (this.hudWeaponSecondary) {
      this.hudWeaponSecondary.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      this.hudWeaponSecondary.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      this.hudWeaponSecondary.clipChildren = false;
      this.hudWeaponSecondary.clipContent = false;
    }

    this.buildWeaponHudGrid(this.hudWeaponPrimary, this.hudWeaponPrimaryIcon, this.hudWeaponPrimaryAmmo, {
      paddingLeft: 16,
      paddingRight: 26,
      iconWidth: 120,
      iconHeight: 48,
      ammoWidth: 88
    });
    this.buildWeaponHudGrid(this.hudWeaponSecondary, this.hudWeaponSecondaryIcon, this.hudWeaponSecondaryAmmo, {
      paddingLeft: 12,
      paddingRight: 20,
      iconWidth: 88,
      iconHeight: 36,
      ammoWidth: 52
    });
  }

  private buildWeaponHudGrid(
    frame: Rectangle | null,
    icon: Image | null,
    ammo: TextBlock | null,
    layout: {
      paddingLeft: number;
      paddingRight: number;
      iconWidth: number;
      iconHeight: number;
      ammoWidth: number;
    }
  ): void {
    if (!frame || !icon || !ammo) {
      return;
    }

    const gridName = `${frame.name ?? "weapon"}_grid`;
    if (frame.getChildByName(gridName)) {
      return;
    }

    frame.removeControl(icon);
    frame.removeControl(ammo);

    const grid = new Grid(gridName);
    grid.width = "100%";
    grid.height = "100%";
    grid.paddingLeft = layout.paddingLeft;
    grid.paddingRight = layout.paddingRight;
    grid.clipChildren = false;
    grid.clipContent = false;
    grid.isPointerBlocker = false;
    grid.zIndex = 2;
    grid.addRowDefinition(1, false);
    grid.addColumnDefinition(layout.iconWidth, true);
    grid.addColumnDefinition(1, false);
    grid.addColumnDefinition(layout.ammoWidth, true);

    icon.width = `${layout.iconWidth}px`;
    icon.height = `${layout.iconHeight}px`;
    icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    icon.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    icon.left = 0;

    ammo.width = `${layout.ammoWidth}px`;
    ammo.height = "100%";
    ammo.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    ammo.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    ammo.left = 0;
    ammo.resizeToFit = false;
    ammo.fontStyle = "";
    ammo.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    ammo.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

    grid.addControl(icon, 0, 0);
    grid.addControl(ammo, 0, 2);
    frame.addControl(grid);
  }

  private initWeaponHudReloadGauges(): void {
    if (this.weaponHudReloadGaugesReady) {
      return;
    }
    this.weaponHudReloadGaugesReady = true;

    this.hudWeaponPrimaryReloadFill = this.createWeaponReloadFill(
      this.hudWeaponPrimary,
      "hud_weapon_primary_reload"
    );
    this.hudWeaponSecondaryReloadFill = this.createWeaponReloadFill(
      this.hudWeaponSecondary,
      "hud_weapon_secondary_reload"
    );
  }

  private createWeaponReloadFill(frame: Rectangle | null, name: string): Rectangle | null {
    if (!frame) {
      return null;
    }

    const fill = new Rectangle(name);
    fill.width = "100%";
    fill.height = "0%";
    fill.thickness = 0;
    fill.background = WEAPON_SHELL_RELOAD_FILL_COLOR;
    fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    fill.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    fill.isPointerBlocker = false;
    fill.isVisible = false;
    fill.zIndex = 1;
    frame.addControl(fill);

    const line = new Rectangle(`${name}_line`);
    line.width = "100%";
    line.height = `${WEAPON_SHELL_RELOAD_LINE_HEIGHT_PX}px`;
    line.thickness = 0;
    line.background = WEAPON_SHELL_RELOAD_LINE_COLOR;
    line.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    line.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    line.top = 0;
    line.isPointerBlocker = false;
    line.zIndex = 2;
    fill.addControl(line);

    return fill;
  }

  private updateShellReloadGauge(): void {
    const reloadTotal = this.primaryWeaponConfig.reloadSeconds;
    const isReloading =
      this.shellLoadedAmmo <= 0 && this.shellReserveAmmo > 0 && this.shellReloadTimer > 0;
    const progress = isReloading
      ? clamp(1 - this.shellReloadTimer / reloadTotal, 0, 1)
      : 0;
    const primaryIsDisplayed = this.isPrimaryWeapon(this.weaponHudDisplayedWeapon);

    this.applyReloadGauge(this.hudWeaponPrimaryReloadFill, primaryIsDisplayed && isReloading, progress);
    this.applyReloadGauge(
      this.hudWeaponSecondaryReloadFill,
      !primaryIsDisplayed && isReloading,
      progress
    );
  }

  private applyReloadGauge(fill: Rectangle | null, visible: boolean, progress: number): void {
    if (!fill) {
      return;
    }

    fill.isVisible = visible;
    if (!visible) {
      fill.height = "0%";
      return;
    }

    fill.height = `${Math.round(progress * 100)}%`;
  }

  private initWeaponHudChrome(): void {
    if (this.weaponHudChromeReady || !this.hudTexture) {
      return;
    }
    this.weaponHudChromeReady = true;

    if (this.hudWeaponPrimary) {
      addHudCornerBrackets(this.hudWeaponPrimary, "hud_weapon_primary", 1);
    }
    if (this.hudWeaponSecondary) {
      addHudCornerBrackets(this.hudWeaponSecondary, "hud_weapon_secondary", 0.55);
    }
  }

  private updateWeaponHud(dt: number): void {
    if (
      this.weaponHudAnimPhase === "idle" &&
      this.activeWeapon !== this.weaponHudDisplayedWeapon
    ) {
      this.weaponHudAnimPhase = "exit";
      this.weaponHudAnimTime = 0;
      this.weaponHudAnimTargetWeapon = this.activeWeapon;
    }

    if (this.weaponHudAnimPhase === "idle") {
      this.refreshWeaponHudContent();
      this.resetWeaponSlotTransforms();
      this.updateShellReloadGauge();
      return;
    }

    this.weaponHudAnimTime += dt;

    if (this.weaponHudAnimPhase === "exit") {
      const t = clamp(this.weaponHudAnimTime / WEAPON_SWITCH_EXIT_SEC, 0, 1);
      const eased = easeInOutQuad(t);
      this.applyWeaponSlotVisual(
        this.hudWeaponPrimaryIcon,
        this.hudWeaponPrimaryAmmo,
        WEAPON_SWITCH_MOVE_PX * eased,
        1 - eased,
        1
      );
      this.applyWeaponSlotVisual(
        this.hudWeaponSecondaryIcon,
        this.hudWeaponSecondaryAmmo,
        -WEAPON_SWITCH_MOVE_PX * eased,
        WEAPON_SLOT_SECONDARY_ALPHA * (1 - eased),
        WEAPON_SLOT_SECONDARY_ALPHA
      );

      if (t >= 1) {
        this.weaponHudDisplayedWeapon = this.weaponHudAnimTargetWeapon;
        this.refreshWeaponHudContent();
        this.applyWeaponSlotVisual(
          this.hudWeaponPrimaryIcon,
          this.hudWeaponPrimaryAmmo,
          -WEAPON_SWITCH_MOVE_PX,
          0,
          1
        );
        this.applyWeaponSlotVisual(
          this.hudWeaponSecondaryIcon,
          this.hudWeaponSecondaryAmmo,
          WEAPON_SWITCH_MOVE_PX,
          0,
          WEAPON_SLOT_SECONDARY_ALPHA
        );
        this.weaponHudAnimPhase = "enter";
        this.weaponHudAnimTime = 0;
      }
    } else if (this.weaponHudAnimPhase === "enter") {
      const t = clamp(this.weaponHudAnimTime / WEAPON_SWITCH_ENTER_SEC, 0, 1);
      const eased = easeInOutQuad(t);
      this.applyWeaponSlotVisual(
        this.hudWeaponPrimaryIcon,
        this.hudWeaponPrimaryAmmo,
        -WEAPON_SWITCH_MOVE_PX * (1 - eased),
        eased,
        1
      );
      this.applyWeaponSlotVisual(
        this.hudWeaponSecondaryIcon,
        this.hudWeaponSecondaryAmmo,
        WEAPON_SWITCH_MOVE_PX * (1 - eased),
        WEAPON_SLOT_SECONDARY_ALPHA * eased,
        WEAPON_SLOT_SECONDARY_ALPHA
      );

      if (t >= 1) {
        this.weaponHudAnimPhase = "blink";
        this.weaponHudAnimTime = 0;
      }
    } else if (this.weaponHudAnimPhase === "blink") {
      const t = clamp(this.weaponHudAnimTime / WEAPON_SWITCH_BLINK_SEC, 0, 1);
      const flicker = 0.68 + 0.32 * Math.abs(Math.sin(t * Math.PI * 3));
      this.applyWeaponSlotVisual(
        this.hudWeaponPrimaryIcon,
        this.hudWeaponPrimaryAmmo,
        0,
        flicker,
        1
      );
      this.applyWeaponSlotVisual(
        this.hudWeaponSecondaryIcon,
        this.hudWeaponSecondaryAmmo,
        0,
        WEAPON_SLOT_SECONDARY_ALPHA * flicker,
        WEAPON_SLOT_SECONDARY_ALPHA
      );

      if (t >= 1) {
        this.weaponHudAnimPhase = "idle";
        this.weaponHudAnimTime = 0;
        this.resetWeaponSlotTransforms();
      }
    }

    this.updateShellReloadGauge();
  }

  private refreshWeaponHudContent(): void {
    const shellAmmoText = `${this.shellLoadedAmmo}/${this.shellReserveAmmo}`;
    const primaryIsDisplayed = this.isPrimaryWeapon(this.weaponHudDisplayedWeapon);
    const primaryProjectileIconUrl =
      this.primaryWeaponKind === "missile" ? missileWeaponIconUrl : shellWeaponIconUrl;

    if (primaryIsDisplayed) {
      if (this.hudWeaponPrimaryIcon) {
        this.hudWeaponPrimaryIcon.source = primaryProjectileIconUrl;
      }
      this.setWeaponAmmoText(this.hudWeaponPrimaryAmmo, shellAmmoText, "white");
      if (this.hudWeaponSecondaryIcon) {
        this.hudWeaponSecondaryIcon.source = machinegunWeaponIconUrl;
      }
      this.setWeaponAmmoText(this.hudWeaponSecondaryAmmo, "∞", "#d8d8d8");
    } else {
      if (this.hudWeaponPrimaryIcon) {
        this.hudWeaponPrimaryIcon.source = machinegunWeaponIconUrl;
      }
      this.setWeaponAmmoText(this.hudWeaponPrimaryAmmo, "∞", "white");
      if (this.hudWeaponSecondaryIcon) {
        this.hudWeaponSecondaryIcon.source = primaryProjectileIconUrl;
      }
      this.setWeaponAmmoText(this.hudWeaponSecondaryAmmo, shellAmmoText, "#d8d8d8");
    }
  }

  private resetWeaponSlotTransforms(): void {
    this.applyWeaponSlotVisual(
      this.hudWeaponPrimaryIcon,
      this.hudWeaponPrimaryAmmo,
      0,
      1,
      1
    );
    this.applyWeaponSlotVisual(
      this.hudWeaponSecondaryIcon,
      this.hudWeaponSecondaryAmmo,
      0,
      WEAPON_SLOT_SECONDARY_ALPHA,
      WEAPON_SLOT_SECONDARY_ALPHA
    );
  }

  private applyWeaponSlotVisual(
    icon: Image | null,
    ammo: TextBlock | null,
    offsetY: number,
    alpha: number,
    baseAlpha: number
  ): void {
    const clampedAlpha = clamp(alpha, 0, baseAlpha);
    if (icon) {
      icon.top = offsetY;
      icon.alpha = clampedAlpha;
    }
    if (ammo) {
      ammo.top = offsetY;
      ammo.alpha = clampedAlpha;
    }
  }

  private setWeaponAmmoText(ammo: TextBlock | null, text: string, color: string): void {
    if (!ammo) {
      return;
    }
    ammo.text = text;
    ammo.color = color;
    ammo.fontStyle = "";
    ammo.fontSize = text === "∞" ? WEAPON_INFINITY_FONT_SIZE : WEAPON_SHELL_AMMO_FONT_SIZE;
  }

  private initMuzzleDebugVisuals(): void {
    const makeMarker = (name: string, diameter: number, color: Color3): Mesh => {
      const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 10 }, this.scene);
      const mat = new StandardMaterial(`${name}_mat`, this.scene);
      mat.diffuseColor = color;
      mat.emissiveColor = color;
      mat.disableLighting = true;
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.renderingGroupId = 2;
      return mesh;
    };

    const makeLine = (name: string, color: Color3): LinesMesh => {
      const line = MeshBuilder.CreateLines(
        name,
        { points: [Vector3.Zero(), Vector3.Zero()], updatable: true },
        this.scene
      );
      line.color = color;
      line.renderingGroupId = 2;
      line.isPickable = false;
      return line;
    };

    this.muzzleDebugVisuals = {
      cannonPivot: makeMarker("dbg_muzzle_cannon_pivot", 0.22, new Color3(1, 0.85, 0.1)),
      cannonMuzzle: makeMarker("dbg_muzzle_canon_tank", 0.18, new Color3(0.1, 0.85, 1)),
      gunMuzzle: makeMarker("dbg_muzzle_gun_tank", 0.18, new Color3(0.2, 1, 0.35)),
      cannonForwardLine: makeLine("dbg_muzzle_canon_forward", new Color3(0.1, 0.85, 1)),
      gunForwardLine: makeLine("dbg_muzzle_gun_forward", new Color3(0.2, 1, 0.35)),
      cannonLinkLine: makeLine("dbg_muzzle_canon_link", new Color3(1, 1, 1)),
      gunLinkLine: makeLine("dbg_muzzle_gun_link", new Color3(0.85, 0.85, 0.85))
    };
  }

  private syncMuzzleNodeWorldMatrix(node: TransformNode | AbstractMesh): void {
    node.computeWorldMatrix(true);
  }

  private getMuzzleNodeWorldForward(node: TransformNode | AbstractMesh): Vector3 {
    this.syncMuzzleNodeWorldMatrix(node);
    const forward = node
      .getDirection(this.movementForwardAxis)
      .scale(-this.config.rig.movementForwardSign);
    if (forward.lengthSquared() > 1e-6) {
      forward.normalize();
    } else {
      forward.copyFrom(Axis.Z);
    }
    return forward;
  }

  private getMuzzleNodeWorldRotation(node: TransformNode | AbstractMesh): Quaternion {
    this.syncMuzzleNodeWorldMatrix(node);
    return node.absoluteRotationQuaternion?.clone() ?? Quaternion.Identity();
  }

  /** Base droite / haut du muzzle pour le cone de dispersion (repère du empty, pas le monde). */
  private getMuzzleSpreadBasis(
    node: TransformNode | AbstractMesh,
    forward: Vector3
  ): { right: Vector3; up: Vector3 } {
    this.syncMuzzleNodeWorldMatrix(node);
    let right = node.getDirection(Axis.X);
    if (right.lengthSquared() > 1e-6) {
      right.normalize();
    } else {
      right = Vector3.Cross(forward, Axis.Y);
      if (right.lengthSquared() > 1e-6) {
        right.normalize();
      } else {
        right = Axis.X.clone();
      }
    }
    let up = Vector3.Cross(right, forward);
    if (up.lengthSquared() > 1e-6) {
      up.normalize();
    } else {
      up = node.getDirection(Axis.Y);
      if (up.lengthSquared() > 1e-6) {
        up.normalize();
      } else {
        up = Axis.Y.clone();
      }
    }
    return { right, up };
  }

  private getCannonPivotWorldPosition(): Vector3 | null {
    if (this.cannonControl.transformNode) {
      this.cannonControl.transformNode.computeWorldMatrix(true);
      return this.cannonControl.transformNode.getAbsolutePosition().clone();
    }
    if (this.cannonControl.bone) {
      return this.cannonControl.bone.getAbsolutePosition(this.tankAnchor).clone();
    }
    return null;
  }

  private updateMuzzleDebugVisuals(): void {
    const dbg = this.muzzleDebugVisuals;
    if (!dbg) {
      return;
    }

    const pivot = this.getCannonPivotWorldPosition();
    if (pivot) {
      dbg.cannonPivot.setEnabled(true);
      dbg.cannonPivot.position.copyFrom(pivot);
    } else {
      dbg.cannonPivot.setEnabled(false);
    }

    const forwardLen = 3;

    if (this.muzzleCannonNode) {
      this.muzzleCannonNode.computeWorldMatrix(true);
      const pos = this.muzzleCannonNode.getAbsolutePosition();
      const forward = this.getMuzzleNodeWorldForward(this.muzzleCannonNode);
      dbg.cannonMuzzle.setEnabled(true);
      dbg.cannonMuzzle.position.copyFrom(pos);
      MeshBuilder.CreateLines(
        dbg.cannonForwardLine.name,
        { points: [pos, pos.add(forward.scale(forwardLen))], instance: dbg.cannonForwardLine },
        this.scene
      );
      dbg.cannonForwardLine.isVisible = true;
      if (pivot) {
        MeshBuilder.CreateLines(
          dbg.cannonLinkLine.name,
          { points: [pivot, pos], instance: dbg.cannonLinkLine },
          this.scene
        );
        dbg.cannonLinkLine.isVisible = true;
      } else {
        dbg.cannonLinkLine.isVisible = false;
      }
    } else {
      dbg.cannonMuzzle.setEnabled(false);
      dbg.cannonForwardLine.isVisible = false;
      dbg.cannonLinkLine.isVisible = false;
    }

    if (this.muzzleGunNode) {
      this.muzzleGunNode.computeWorldMatrix(true);
      const pos = this.muzzleGunNode.getAbsolutePosition();
      const forward = this.getMuzzleNodeWorldForward(this.muzzleGunNode);
      dbg.gunMuzzle.setEnabled(true);
      dbg.gunMuzzle.position.copyFrom(pos);
      MeshBuilder.CreateLines(
        dbg.gunForwardLine.name,
        { points: [pos, pos.add(forward.scale(forwardLen))], instance: dbg.gunForwardLine },
        this.scene
      );
      dbg.gunForwardLine.isVisible = true;
      if (pivot) {
        MeshBuilder.CreateLines(
          dbg.gunLinkLine.name,
          { points: [pivot, pos], instance: dbg.gunLinkLine },
          this.scene
        );
        dbg.gunLinkLine.isVisible = true;
      } else {
        dbg.gunLinkLine.isVisible = false;
      }
    } else {
      dbg.gunMuzzle.setEnabled(false);
      dbg.gunForwardLine.isVisible = false;
      dbg.gunLinkLine.isVisible = false;
    }
  }

  private initSuspensionDebugSpheres(): void {
    // Une sphère par sonde réellement utilisée par la physique, quel que soit le
    // nombre et le nommage déclarés dans `rig.suspensionProbeNames`.
    const probeCount = this.suspensionPointsLocal.length;
    if (probeCount === 0) {
      return;
    }

    const mat = new StandardMaterial("sus_debug_red", this.scene);
    mat.diffuseColor = new Color3(1, 0, 0);
    mat.emissiveColor = new Color3(1, 0, 0);

    const radius = 0.04;
    for (let i = 0; i < probeCount; i++) {
      const s = MeshBuilder.CreateSphere(`sus_dbg_${i}`, { diameter: radius * 2 }, this.scene);
      s.material = mat;
      s.isPickable = false;
      s.alwaysSelectAsActiveMesh = false;
      s.renderingGroupId = 1;
      this.susDebugSpheres.push(s);
    }
  }

  private initTrackSystem(): void {
    if (!this.tracksConfig.enabled) {
      console.warn("[TankController][tracks] tracks.enabled is false (or missing); track ribbons disabled.");
      return;
    }

    const material =
      this.trackMaterial ??
      (() => {
        console.warn(
          "[TankController][tracks] TEX_tracks has no material. Using fallback material."
        );
        const m = new StandardMaterial("tracks_fallback_mat", this.scene);
        m.diffuseColor = new Color3(0.05, 0.05, 0.05);
        m.emissiveColor = new Color3(0.02, 0.02, 0.02);
        m.alpha = clamp(this.tracksConfig.opacityMultiplier, 0, 1);
        m.backFaceCulling = false;
        return m;
      })();

    const anyNode =
      this.suspensionNodes.fl ||
      this.suspensionNodes.fr ||
      this.suspensionNodes.ml ||
      this.suspensionNodes.mr ||
      this.suspensionNodes.rl ||
      this.suspensionNodes.rr;
    if (!anyNode) {
      console.warn("[TankController][tracks] No SUS_* nodes found; cannot spawn track segments.");
      return;
    }

    this.trackSystem = new TrackSegmentSystem({
      scene: this.scene,
      material,
      tracksConfig: this.tracksConfig,
      tankBody: this.tankBody,
      nodes: this.suspensionNodes,
      ignoreMeshIds: this.tankMeshIdsToIgnore
    });
  }

  public getDebugState(): TankGameplayDebugState {
    return {
      health: this.health,
      healthMax: this.healthMax,
      healthPercent: clamp((this.health / this.healthMax) * 100, 0, 100),
      shieldTimeRemaining: this.shieldTimeRemaining,
      battery: this.battery,
      overcharge: this.overcharge,
      boostActive: this.boostActive,
      zoomActive: this.zoomActive,
      activeWeapon: this.activeWeapon,
      shellReserveAmmo: this.shellReserveAmmo,
      shellChambered: this.shellChambered,
      fireHeld: this.fireHeld,
      position: this.tankBody.getObjectCenterWorld()
    };
  }

  public dispose(): void {
    this.scene.onBeforeRenderObservable.removeCallback(this.update);
    this.scene.onBeforePhysicsObservable.removeCallback(this.syncUprightResetBeforePhysics);
    this.scene.onAfterPhysicsObservable.removeCallback(this.finishUprightResetPrestep);
    this.input.dispose();

    this.debugCameraRayLine?.dispose();
    this.debugBarrelForwardLine?.dispose();
    this.debugTargetMarker?.dispose();
    this.debugCameraOriginMarker?.dispose();
    for (const s of this.susDebugSpheres) {
      s.dispose();
    }
    this.susDebugSpheres = [];
    this.muzzleDebugVisuals?.cannonPivot.dispose();
    this.muzzleDebugVisuals?.cannonMuzzle.dispose();
    this.muzzleDebugVisuals?.gunMuzzle.dispose();
    this.muzzleDebugVisuals?.cannonForwardLine.dispose();
    this.muzzleDebugVisuals?.gunForwardLine.dispose();
    this.muzzleDebugVisuals?.cannonLinkLine.dispose();
    this.muzzleDebugVisuals?.gunLinkLine.dispose();
    this.muzzleDebugVisuals = null;
    for (const hardpoint of this.missileHardpoints) {
      hardpoint.visualMesh?.dispose();
    }
    this.jetMissileLock?.dispose();
    this.jetMissileLock = null;

    if (this.ownsSceneHud) {
      this.hudTexture?.dispose();
      this.radarHud?.dispose();
      clearSceneGameplayUi(this.scene);
    }
    this.hudTexture = null;
    this.radarHud = null;
    this.hudJsonLoaded = false;
    this.hudReticlesAttached = false;
    this.hudPanelStatus = null;
    this.hudHealthBarBg = null;
    this.hudHealthSegmentFills = [];
    this.healthBarSegmentsReady = false;
    this.hudHealthIcon = null;
    this.hudFuelBarBg = null;
    this.hudFuelSegmentFills = [];
    this.fuelBarSegmentsReady = false;
    this.fuelLowBlinkPhase = 0;
    this.hudFuelIcon = null;
    this.hudBoostFill = null;
    this.hudBoostIcon = null;
    this.statusHudChromeReady = false;
    this.statusHudSpacingReady = false;
    this.hudWeaponPrimary = null;
    this.hudWeaponSecondary = null;
    this.hudWeaponPrimaryIcon = null;
    this.hudWeaponSecondaryIcon = null;
    this.hudWeaponPrimaryAmmo = null;
    this.hudWeaponSecondaryAmmo = null;
    this.hudWeaponPrimaryReloadFill = null;
    this.hudWeaponSecondaryReloadFill = null;
    this.weaponHudChromeReady = false;
    this.weaponHudLayoutReady = false;
    this.weaponHudReloadGaugesReady = false;
    this.weaponHudDisplayedWeapon = this.primaryWeaponKind;
    this.weaponHudAnimPhase = "idle";
    this.weaponHudAnimTime = 0;
    this.hudBoostIndicator = null;
    this.hudZoomIndicator = null;
    this.hudPanelTimer = null;
    this.hudTimerLabel = null;
    this.timerHudChromeReady = false;
    this.sessionElapsedSeconds = 0;
    this.barrelShellReticle2D = null;
    this.barrelGunReticle2D = null;

    this.cannonShotSound?.dispose();
    this.cannonShotSound = null;
    for (const sound of this.missileShotSounds) {
      sound.dispose();
    }
    this.missileShotSounds = [];
    this.shellInsertSound?.dispose();
    this.shellInsertSound = null;
    this.shellInsertSoundPlayed = false;
    for (const s of this.gunShotSoundPool) {
      s.dispose();
    }
    this.gunShotSoundPool = [];
    for (const light of this.gunMuzzleFlashPool) {
      light.dispose();
    }
    this.gunMuzzleFlashPool = [];
    for (const light of this.cannonMuzzleFlashPool) {
      light.dispose();
    }
    this.cannonMuzzleFlashPool = [];
    this.activeMuzzleFlashes = [];
    for (const sound of this.powerUpSounds.values()) {
      sound.dispose();
    }
    this.powerUpSounds.clear();
    this.tankIdleSound?.stop();
    this.tankIdleSound?.dispose();
    this.tankIdleSound = null;
    this.tankMoveSound?.stop();
    this.tankMoveSound?.dispose();
    this.tankMoveSound = null;
    this.tankTurboSound?.stop();
    this.tankTurboSound?.dispose();
    this.tankTurboSound = null;
    this.hornSound?.stop();
    this.hornSound?.dispose();
    this.hornSound = null;
    this.suspensionImpactSound?.stop();
    this.suspensionImpactSound?.dispose();
    this.suspensionImpactSound = null;
    this.turretStartSound?.stop();
    this.turretStartSound?.dispose();
    this.turretStartSound = null;
    this.turretLoopSound?.stop();
    this.turretLoopSound?.dispose();
    this.turretLoopSound = null;
    this.turretStopSound?.stop();
    this.turretStopSound?.dispose();
    this.turretStopSound = null;
    this.turretSoundState = "stopped";
    this.articulationIsRotating = false;
    this.tankMovementSoundMode = "stopped";

    for (const proj of this.activeProjectiles) {
      proj.body.dispose();
      proj.shape.dispose();
      proj.mesh.dispose();
    }

    this.trackTreadParticles?.dispose();
    this.trackTreadParticlesReverse?.dispose();
    this.tankDamageParticles?.dispose();
    this.deathBlackMaterial?.dispose();
    this.deathBlackMaterial = null;
    this.shieldHighlightLayer?.removeAllMeshes();
    this.shieldHighlightLayer?.dispose();
    this.shieldHighlightLayer = null;
    this.shieldHighlightVisualActive = false;

    if (this.ownsEnemyTurretSystem) {
      this.enemyTurretSystem?.dispose();
    }
  }

  public setPaused(paused: boolean): void {
    if (this.paused === paused) {
      return;
    }

    this.paused = paused;
    this.input.resetState();

    if (!paused) {
      return;
    }

    this.applyPauseSideEffects();
  }

  /** Remet le véhicule à plat au même XZ, légèrement au-dessus du sol, puis le laisse retomber. Touche Y. */
  private tryResetVehicleUpright(): void {
    if (
      this.uprightResetCooldown > 0 ||
      this.deathTriggered ||
      this.pendingUprightReset ||
      this.suspensionPointsLocal.length === 0
    ) {
      return;
    }

    if (!this.scene.getPhysicsEngine()) {
      return;
    }

    const pos = this.tankAnchor.position;
    const forward = this.tankAnchor.getDirection(this.movementForwardAxis);
    forward.y = 0;
    if (forward.lengthSquared() < 1e-6) {
      forward.copyFrom(Axis.Z);
    } else {
      forward.normalize();
    }

    const uprightRotation = Quaternion.FromLookDirectionRH(forward, Axis.Y);
    const restAnchorY = this.computeRestAnchorY(pos.x, pos.z, pos.y, uprightRotation);
    const spawnY = (restAnchorY ?? pos.y) + UPRIGHT_RESET_LIFT_M;

    this.tankAnchor.rotationQuaternion = uprightRotation;
    this.tankAnchor.position.set(pos.x, spawnY, pos.z);
    this.tankAnchor.computeWorldMatrix(true);

    if (this.tankVisualRoot) {
      this.tankVisualRoot.rotationQuaternion ??= Quaternion.Identity();
      this.tankVisualRoot.rotationQuaternion.copyFrom(Quaternion.Identity());
      this.tankVisualRoot.position.copyFromFloats(0, 0, 0);
    }

    this.resetVehicleUprightSideEffects();
    this.pendingUprightReset = true;
    this.uprightResetCooldown = UPRIGHT_RESET_COOLDOWN_SEC;
  }

  /** Appliqué avant la physique : téléporte le rigidbody sur la pose de l'ancre (prestep Havok). */
  private readonly syncUprightResetBeforePhysics = (): void => {
    if (!this.pendingUprightReset) {
      return;
    }

    this.pendingUprightReset = false;
    this.tankAnchor.computeWorldMatrix(true);
    this.tankBody.disablePreStep = false;
    this.tankBody.setLinearVelocity(Vector3.Zero());
    this.tankBody.setAngularVelocity(Vector3.Zero());
    this.uprightResetPrestepFrames = 2;
  };

  private readonly finishUprightResetPrestep = (): void => {
    if (this.uprightResetPrestepFrames <= 0) {
      return;
    }

    this.uprightResetPrestepFrames--;
    if (this.uprightResetPrestepFrames === 0) {
      this.tankBody.disablePreStep = true;
    }
  };

  private computeRestAnchorY(
    x: number,
    z: number,
    referenceY: number,
    uprightRotation: Quaternion
  ): number | null {
    const effectiveRest =
      this.config.suspension.restLength + getSuspensionContactOffset(this.config);

    let maxAnchorY: number | null = null;
    for (const local of this.suspensionPointsLocal) {
      const worldOffset = local.clone().applyRotationQuaternion(uprightRotation);
      const probeGroundY = this.findLowestGroundYAt(
        x + worldOffset.x,
        z + worldOffset.z,
        referenceY
      );
      if (probeGroundY === null) {
        continue;
      }

      const neededAnchorY = probeGroundY + effectiveRest - worldOffset.y;
      maxAnchorY = maxAnchorY === null ? neededAnchorY : Math.max(maxAnchorY, neededAnchorY);
    }

    return maxAnchorY;
  }

  private findLowestGroundYAt(x: number, z: number, referenceY: number): number | null {
    const engine = this.scene.getPhysicsEngine();
    if (!engine) {
      return null;
    }

    let origin = new Vector3(x, Math.max(referenceY + 80, 80), z);
    let lowestY: number | null = null;

    for (let i = 0; i < 8; i++) {
      const from = origin;
      const to = from.add(Axis.Y.scale(-400));
      const hit = engine.raycast(from, to, {
        ignoreBody: this.tankBody,
        shouldHitTriggers: false,
        collideWith: 0xffffffff
      });
      if (!hit.hasHit) {
        break;
      }

      hit.calculateHitDistance();
      const hitY = hit.hitPointWorld.y;
      lowestY = lowestY === null ? hitY : Math.min(lowestY, hitY);
      origin = hit.hitPointWorld.add(Axis.Y.scale(-0.4));
    }

    return lowestY;
  }

  private resetVehicleUprightSideEffects(): void {
    this.smoothedMoveAxis = 0;
    this.smoothedTurnAxis = 0;
    this.prevSmoothedMoveAxis = 0;
    this.prevForwardSpeed = 0;
    this.forwardAccelSmoothed = 0;
    this.boostActive = false;
    this.airborneSeconds = 0;
    this.suspensionContactCount = 0;
    this.suspensionCompressions.fill(0);
    this.wheelSteerRad = 0;
    this.wheelSpinRad = 0;
    this.wheelTravelSmoothed.fill(0);
    this.hullDrivePitchTarget = 0;
    this.hullDrivePitchSmoothed = 0;
    this.hullRecoilPitch = 0;
    this.hullRecoilRoll = 0;
    this.pendingHullRecoilPitch = 0;
    this.pendingHullRecoilRoll = 0;
    this.resetVisualSprings();
  }

  private resetVisualSprings(): void {
    for (const spring of [
      this.trackLeftDropSpring,
      this.trackRightDropSpring,
      this.trackLeftPitchSpring,
      this.trackRightPitchSpring,
      this.hullSuspensionPitchSpring,
      this.hullSuspensionRollSpring,
      this.bodyBobSpring
    ]) {
      spring.value = 0;
      spring.velocity = 0;
    }
  }

  /** Véhicule sélectionné par le joueur (LevelManager). Distinct de la pause menu. */
  public setPlayerActive(active: boolean): void {
    if (this.playerActive === active) {
      return;
    }

    this.playerActive = active;
    this.input.resetState();

    if (active) {
      this.showSharedHud();
      this.refreshWeaponHudContent();
      this.refreshStatusHudContent();
      this.syncShieldHighlight();
      if (this.audioUnlocked) {
        this.syncTankMovementSounds();
      }
      return;
    }

    this.hideSharedHud();
    this.syncShieldHighlight();
    this.applyPauseSideEffects();
  }

  public getPlayerColliderMesh(): Mesh | null {
    return this.tankColliderMesh;
  }

  public applyPowerUpAmmoShell(amount: number): void {
    this.addShellReserveAmmo(amount);
  }

  public applyPowerUpFuel(amount: number): void {
    this.addBattery(amount);
  }

  public applyPowerUpRepair(amount: number): void {
    this.repairHealth(amount);
  }

  public applyPowerUpShield(durationSeconds: number, damageReduction: number): void {
    this.applyShield(durationSeconds, damageReduction);
  }

  public notifyPowerUpPicked(typeId: PowerUpTypeId): void {
    this.playPowerUpSound(typeId);
  }

  public getPowerUpPickupHandlers() {
    return {
      onAmmoShellPickup: (amount: number) => this.applyPowerUpAmmoShell(amount),
      onFuelPickup: (amount: number) => this.applyPowerUpFuel(amount),
      onRepairPickup: (amount: number) => this.applyPowerUpRepair(amount),
      onShieldPickup: (durationSeconds: number, damageReduction: number) =>
        this.applyPowerUpShield(durationSeconds, damageReduction),
      onPicked: (typeId: PowerUpTypeId) => this.notifyPowerUpPicked(typeId)
    };
  }

  /** Active la caméra orbit du tank (switch véhicule). */
  public focusCamera(): void {
    if (this.tankCamera) {
      this.scene.activeCamera = this.tankCamera;
    }
  }

  public getEnemyPlayerTarget(): EnemyTurretPlayerTarget {
    return {
      tankBody: this.tankBody,
      tankColliderMesh: this.tankColliderMesh,
      onDamage: (amount) => this.takeDamage(amount),
      onBulletImpact: (worldPos) => this.spawnSparkImpact(worldPos),
      onTurretDestroyed: (worldPos) => {
        void this.spawnExplosionAt(worldPos);
      }
    };
  }

  public getAimTargetNode(): TransformNode | AbstractMesh {
    return this.playerTargetNode ?? this.tankAnchor;
  }

  private applyPauseSideEffects(): void {
    this.fireHeld = false;
    this.shellFireWasHeld = false;
    this.boostInputHeld = false;
    this.smoothedMoveAxis = 0;
    this.smoothedTurnAxis = 0;
    this.prevSmoothedMoveAxis = 0;
    this.prevForwardSpeed = 0;
    this.forwardAccelSmoothed = 0;
    this.boostActive = false;
    this.articulationIsRotating = false;

    this.tankBody.setLinearVelocity(Vector3.Zero());
    this.tankBody.setAngularVelocity(Vector3.Zero());

    this.stopEngineSounds();
    this.hornSound?.stop();
    this.turretStartSound?.stop();
    this.turretLoopSound?.stop();
    this.turretStopSound?.stop();
    this.turretSoundState = "stopped";
  }

  private readonly update = (): void => {
    if (!this.playerActive) {
      this.input.consumeFrame();
      return;
    }

    if (this.paused) {
      this.input.consumeFrame();
      return;
    }

    // Fixed step: engine.maxFPS caps frames; getDeltaTime() is unreliable if render is skipped manually.
    const dt = TARGET_FRAME_SEC;

    if (this.deathTriggered) {
      this.input.consumeFrame();
      this.tankBody.setLinearVelocity(Vector3.Zero());
      this.tankBody.setAngularVelocity(Vector3.Zero());
      this.updateProjectiles(dt);
      this.updateGunTracers(dt);
      this.updateMuzzleFlashes(dt);
      this.updateSparks(dt);
      this.updateShockwaves(dt);
      if (!this.deathNotified) {
        this.deathScreenDelaySeconds = Math.max(0, this.deathScreenDelaySeconds - dt);
        if (this.deathScreenDelaySeconds <= 0) {
          this.deathNotified = true;
          this.onPlayerDeath?.();
        }
      }
      return;
    }

    if (this.zoomCamFreezeSeconds > 0) {
      this.zoomCamFreezeSeconds = Math.max(this.zoomCamFreezeSeconds - dt, 0);
    }

    const frame = this.input.consumeFrame();
    this.activeWeapon = frame.selectedWeapon;
    this.fireHeld = frame.fireHeld;
    this.boostInputHeld = frame.boostHeld;

    if (this.uprightResetCooldown > 0) {
      this.uprightResetCooldown = Math.max(0, this.uprightResetCooldown - dt);
    }
    if (frame.uprightResetRequested) {
      this.tryResetVehicleUpright();
    }

    if (this.hornCooldown > 0) {
      this.hornCooldown = Math.max(0, this.hornCooldown - dt);
    }
    if (this.suspensionImpactCooldown > 0) {
      this.suspensionImpactCooldown = Math.max(0, this.suspensionImpactCooldown - dt);
    }
    if (frame.hornRequested) {
      this.tryPlayHorn();
    }

    // In zoom view, limit camera rotation so the turret/cannon can keep up.
    // This prevents the barrel reticle from "catching up" to the camera reticle.
    let lookX = frame.lookDeltaX;
    let lookY = frame.lookDeltaY;
    if (frame.zoomHeld) {
      const yawDegPerPixel = Math.abs(this.config.camera.orbitYawDegPerPixel) || 0;
      const pitchDegPerPixel = Math.abs(this.config.camera.orbitPitchDegPerPixel) || 0;
      const maxYawDeg = Math.max(this.config.turret.yawSpeedDeg * dt, 0);
      const maxPitchDeg = Math.max(this.config.cannon.pitchSpeedDeg * dt, 0);

      if (yawDegPerPixel > 1e-6) {
        const maxYawPixels = maxYawDeg / yawDegPerPixel;
        lookX = clamp(lookX, -maxYawPixels, maxYawPixels);
      }
      if (pitchDegPerPixel > 1e-6) {
        const maxPitchPixels = maxPitchDeg / pitchDegPerPixel;
        lookY = clamp(lookY, -maxPitchPixels, maxPitchPixels);
      }
    }

    if (this.flightModel) {
      // En avion la souris est le manche : la caméra suit l'appareil au lieu d'orbiter.
      this.lastLookDeltaX = frame.lookDeltaX;
      this.lastLookDeltaY = frame.lookDeltaY;
      this.applyChaseCamera(dt);
    } else {
      this.applyOrbitCamera(lookX, lookY);
    }
    if (this.shieldTimeRemaining > 0) {
      this.shieldTimeRemaining = Math.max(0, this.shieldTimeRemaining - dt);
    }
    this.syncShieldHighlight();
    this.applyTurretAndCannon(frame.pointerX, frame.pointerY, dt);
    this.updateJetMissileLock(dt);
    this.applyMinigunSpin(dt);
    this.updateWeapons(dt);
    this.applyMovement(frame.moveAxis, frame.turnAxis, frame.boostHeld, dt);
    this.applyVisualSmoothing(dt);
    this.applyCamera(frame.zoomHeld, dt);
    this.trackSystem?.update(dt);
    this.powerUpSystem?.update(dt);
    this.enemyTurretSystem?.update(
      dt,
      this.playerTargetNode ?? this.tankAnchor
    );
    this.updateSuspensionDebugSpheres();
    this.updateMuzzleDebugVisuals();
    this.updateProjectiles(dt);
    this.updateGunTracers(dt);
    this.updateMuzzleFlashes(dt);
    this.updateSparks(dt);
    this.updateShockwaves(dt);
    this.updateGameplayHud(dt);
    const tankForward = this.tankAnchor.getDirection(this.movementForwardAxis);
    this.radarHud?.update(
      dt,
      this.tankAnchor.getAbsolutePosition(),
      tankForward,
      this.enemyTurretSystem?.getRadarTargets() ?? []
    );
    this.tankDamageParticles?.syncHealthPercent(
      clamp((this.health / this.healthMax) * 100, 0, 100)
    );
  };

  private updateSuspensionDebugSpheres(): void {
    if (this.susDebugSpheres.length === 0) return;

    const anchorPosition = this.tankAnchor.getAbsolutePosition();
    const anchorRotation =
      this.tankAnchor.absoluteRotationQuaternion ??
      this.tankAnchor.rotationQuaternion ??
      Quaternion.Identity();

    for (let i = 0; i < this.susDebugSpheres.length; i++) {
      const localPoint = this.suspensionPointsLocal[i];
      const sphere = this.susDebugSpheres[i];
      if (!localPoint) {
        sphere.setEnabled(false);
        continue;
      }
      sphere.setEnabled(true);
      sphere.position.copyFrom(
        anchorPosition.add(localPoint.clone().applyRotationQuaternion(anchorRotation))
      );
    }
  }

  private updateWeapons(dt: number): void {
    // Bullet cooldown
    if (this.bulletCooldownTimer > 0) {
      this.bulletCooldownTimer -= dt;
    }
    this.gunReticleKickTime += dt;

    // Shell / missile magazine reload.
    if (this.shellLoadedAmmo <= 0 && this.shellReserveAmmo > 0) {
      if (this.shellReloadTimer <= 0) {
        this.shellReloadTimer = this.primaryWeaponConfig.reloadSeconds;
        this.shellInsertSoundPlayed = false;
      }
      if (
        this.shellMagazineSize === 1 &&
        !this.shellInsertSoundPlayed &&
        this.shellReloadTimer <= TankGameplayController.SHELL_INSERT_SOUND_BEFORE_END_S
      ) {
        this.playShellInsertSound();
        this.shellInsertSoundPlayed = true;
      }
      this.shellReloadTimer -= dt;
      if (this.shellReloadTimer <= 0) {
        const reloadAmount = Math.min(this.shellMagazineSize, this.shellReserveAmmo);
        this.shellLoadedAmmo = reloadAmount;
        this.shellReserveAmmo -= reloadAmount;
        this.shellChambered = this.shellLoadedAmmo > 0;
        this.resetMissileHardpointLoadedState();
      }
    }

    // Firing
    const shellFirePressed = this.fireHeld && !this.shellFireWasHeld;
    if (this.fireHeld && this.battery > 0) {
      const canFirePrimary =
        this.isPrimaryWeapon(this.activeWeapon) &&
        this.shellLoadedAmmo > 0 &&
        (this.shellMagazineSize === 1 || shellFirePressed);
      if (canFirePrimary) {
        this.firePrimaryProjectile();
      } else if (this.activeWeapon === "bullet" && this.bulletCooldownTimer <= 0) {
        this.fireBullet();
      }
    }
    this.shellFireWasHeld = this.fireHeld;

    // Coax spread model (0 -> max while firing; relax back when not firing).
    const isGunTriggerHeld = this.fireHeld && this.battery > 0 && this.activeWeapon === "bullet";
    if (isGunTriggerHeld) {
      this.gunSpreadDeg = clamp(
        this.gunSpreadDeg + TankGameplayController.GUN_SPREAD_GROW_DEG_PER_SEC * dt,
        0,
        TankGameplayController.GUN_SPREAD_MAX_DEG
      );
    } else {
      this.gunSpreadDeg = clamp(
        this.gunSpreadDeg - TankGameplayController.GUN_SPREAD_SHRINK_DEG_PER_SEC * dt,
        0,
        TankGameplayController.GUN_SPREAD_MAX_DEG
      );
    }
  }

  private firePrimaryProjectile(): void {
    const loadedBeforeShot = this.shellLoadedAmmo;
    const fireMuzzle = this.resolvePrimaryProjectileMuzzle();
    if (!fireMuzzle) {
      return;
    }

    this.shellLoadedAmmo = Math.max(0, this.shellLoadedAmmo - 1);
    this.shellChambered = this.shellLoadedAmmo > 0;
    if (this.shellLoadedAmmo <= 0 && this.shellReserveAmmo > 0) {
      this.shellReloadTimer = this.primaryWeaponConfig.reloadSeconds;
    }
    this.shellInsertSoundPlayed = false;
    this.playPrimaryProjectileSound(loadedBeforeShot);
    this.debugLogZoomCamOnNextShellShot = this.zoomActive;
    // Freeze zoom camera position briefly after firing to avoid visible "snap".
    if (this.zoomActive) {
      this.zoomCamFreezeSeconds = Math.max(this.zoomCamFreezeSeconds, 0.12);
    }
    this.syncMuzzleNodeWorldMatrix(fireMuzzle);
    this.spawnMuzzleFlash(
      this.cannonMuzzleFlashPool,
      fireMuzzle.getAbsolutePosition(),
      TankGameplayController.CANNON_MUZZLE_FLASH_PEAK_INTENSITY,
      TankGameplayController.CANNON_MUZZLE_FLASH_LIFE_S
    );
    this.spawnProjectile(
      this.ammoShellMesh,
      this.ammoShellColliderMesh,
      this.primaryWeaponConfig,
      0.4,
      fireMuzzle,
      this.jetMissileLock?.getLockedTargetId() ?? null
    );
    this.syncMissileHardpointVisuals();
  }

  /** Premier emport encore chargé, ou le canon unique des autres véhicules. */
  private resolvePrimaryProjectileMuzzle(): TransformNode | AbstractMesh | null {
    if (this.missileHardpoints.length === 0) {
      return this.muzzleCannonNode;
    }

    for (let index = 0; index < this.missileHardpoints.length; index++) {
      if (!this.missileHardpointLoaded[index]) {
        continue;
      }
      this.missileHardpointLoaded[index] = false;
      return this.missileHardpoints[index]?.muzzleNode ?? null;
    }

    return null;
  }

  /** Réaligne les modèles d'emport sur l'état du chargeur interne. */
  private resetMissileHardpointLoadedState(): void {
    if (this.missileHardpoints.length === 0) {
      return;
    }

    this.missileHardpointLoaded = this.missileHardpoints.map(
      (_, index) => index < this.shellLoadedAmmo
    );
    this.syncMissileHardpointVisuals();
  }

  private syncMissileHardpointVisuals(): void {
    for (let index = 0; index < this.missileHardpoints.length; index++) {
      const visual = this.missileHardpoints[index]?.visualMesh;
      if (visual) {
        visual.isVisible = this.missileHardpointLoaded[index] === true;
      }
    }
  }

  private usesJetMissileReticle(): boolean {
    return (
      (this.config.movement.steeringMode ?? "tank") === "plane" &&
      this.primaryWeaponKind === "missile" &&
      Boolean(this.primaryWeaponConfig.missileLock)
    );
  }

  private ensureJetMissileLockController(): void {
    if (this.jetMissileLock || !this.usesJetMissileReticle() || !this.hudTexture) {
      return;
    }

    const lockConfig = this.primaryWeaponConfig.missileLock;
    if (!lockConfig) {
      return;
    }

    this.jetMissileLock = new JetMissileLockController({
      scene: this.scene,
      hudTexture: this.hudTexture,
      config: lockConfig,
      getLockOrigin: () => this.resolveJetMissileLockOrigin(),
      getTargets: () => this.enemyTurretSystem?.getLockTargets() ?? [],
      isAudioUnlocked: () => this.audioUnlocked
    });
    this.jetMissileLock.setLockedReticleSource(reticleMissileJetLockedAssetUrl);
  }

  private resolveJetMissileLockOrigin(): { position: Vector3; forward: Vector3 } | null {
    if (!this.muzzleGunNode) {
      return null;
    }

    this.syncMuzzleNodeWorldMatrix(this.muzzleGunNode);
    const forward = this.muzzleGunNode
      .getDirection(this.movementForwardAxis)
      .scale(-this.config.rig.movementForwardSign);
    if (forward.lengthSquared() < 1e-8) {
      return null;
    }
    forward.normalize();
    return {
      position: this.muzzleGunNode.getAbsolutePosition().clone(),
      forward
    };
  }

  private syncPrimaryWeaponReticleAsset(): void {
    if (!this.barrelShellReticle2D) {
      return;
    }

    const image = this.barrelShellReticle2D as unknown as Image;
    image.source = this.usesJetMissileReticle()
      ? reticleMissileJetAssetUrl
      : reticleBarrelAssetUrl;
  }

  private resolvePrimaryReticleMuzzle(): TransformNode | AbstractMesh | null {
    if (this.usesJetMissileReticle()) {
      return this.muzzleGunNode;
    }
    return this.muzzleCannonNode;
  }

  private updateJetMissileLock(dt: number): void {
    if (!this.usesJetMissileReticle()) {
      return;
    }

    this.ensureJetMissileLockController();
    const camera = this.scene.activeCamera as Camera | null;
    this.jetMissileLock?.update(dt, this.isPrimaryWeapon(this.activeWeapon), camera);
  }

  private isPrimaryWeapon(weapon: WeaponType): boolean {
    return weapon === this.primaryWeaponKind;
  }

  private playPrimaryProjectileSound(loadedBeforeShot: number): void {
    if (this.primaryWeaponKind !== "missile") {
      this.cannonShotSound?.play();
      return;
    }

    const shotIndex = clamp(this.shellMagazineSize - loadedBeforeShot, 0, this.shellMagazineSize - 1);
    const sound = this.missileShotSounds[Math.min(shotIndex, this.missileShotSounds.length - 1)] ?? null;
    if (!sound) {
      this.cannonShotSound?.play();
      return;
    }

    try {
      if (sound.isPlaying) {
        sound.stop();
      }
      sound.play();
    } catch {
      // Ignore playback errors (autoplay restrictions, etc.).
    }
  }

  private initMuzzleFlashLights(): void {
    const flashColor = new Color3(1, 0.94, 0.72);
    const flashSpecular = new Color3(1, 0.88, 0.55);

    for (let i = 0; i < TankGameplayController.GUN_MUZZLE_FLASH_POOL_SIZE; i++) {
      const light = new PointLight(`gun_muzzle_flash_${i}`, Vector3.Zero(), this.scene);
      light.diffuse = flashColor;
      light.specular = flashSpecular;
      light.intensity = 0;
      light.range = TankGameplayController.GUN_MUZZLE_FLASH_RANGE;
      light.setEnabled(false);
      this.gunMuzzleFlashPool.push(light);
    }

    for (let i = 0; i < TankGameplayController.CANNON_MUZZLE_FLASH_POOL_SIZE; i++) {
      const light = new PointLight(`cannon_muzzle_flash_${i}`, Vector3.Zero(), this.scene);
      light.diffuse = flashColor;
      light.specular = flashSpecular;
      light.intensity = 0;
      light.range = TankGameplayController.CANNON_MUZZLE_FLASH_RANGE;
      light.setEnabled(false);
      this.cannonMuzzleFlashPool.push(light);
    }
  }

  private spawnMuzzleFlash(
    pool: PointLight[],
    position: Vector3,
    peakIntensity: number,
    lifeS: number
  ): void {
    if (pool.length === 0) {
      return;
    }

    const activeLights = new Set(this.activeMuzzleFlashes.map((f) => f.light));
    let light = pool.find((candidate) => !activeLights.has(candidate)) ?? null;
    if (!light) {
      const recycledIdx = this.activeMuzzleFlashes.findIndex((f) => pool.includes(f.light));
      if (recycledIdx >= 0) {
        const recycled = this.activeMuzzleFlashes.splice(recycledIdx, 1)[0];
        recycled.light.intensity = 0;
        recycled.light.setEnabled(false);
        light = recycled.light;
      } else {
        light = pool[0];
      }
    }

    light.position.copyFrom(position);
    light.intensity = peakIntensity;
    light.setEnabled(true);
    this.activeMuzzleFlashes.push({
      light,
      age: 0,
      life: lifeS,
      peak: peakIntensity
    });
  }

  private updateMuzzleFlashes(dt: number): void {
    if (this.activeMuzzleFlashes.length === 0) {
      return;
    }

    for (let i = this.activeMuzzleFlashes.length - 1; i >= 0; i--) {
      const flash = this.activeMuzzleFlashes[i];
      flash.age += dt;
      const t = flash.age / flash.life;
      if (t >= 1) {
        flash.light.intensity = 0;
        flash.light.setEnabled(false);
        this.activeMuzzleFlashes.splice(i, 1);
        continue;
      }
      const fade = (1 - t) * (1 - t);
      flash.light.intensity = flash.peak * fade;
    }
  }

  private fireBullet(): void {
    this.bulletCooldownTimer = 1.0 / this.config.weapons.bullet.shotsPerSecond;
    this.gunReticleKickTime = 0;
    if (this.gunShotSoundPool.length > 0) {
      // Prefer a free sound so ROF stays perfectly in sync.
      // If all are busy, reuse the next one (stop it first).
      let s: Sound | null = null;
      for (let i = 0; i < this.gunShotSoundPool.length; i++) {
        const candidate = this.gunShotSoundPool[(this.gunShotSoundPoolCursor + i) % this.gunShotSoundPool.length];
        if (!candidate.isPlaying) {
          s = candidate;
          this.gunShotSoundPoolCursor = (this.gunShotSoundPoolCursor + i + 1) % this.gunShotSoundPool.length;
          break;
        }
      }
      if (!s) {
        s = this.gunShotSoundPool[this.gunShotSoundPoolCursor % this.gunShotSoundPool.length];
        this.gunShotSoundPoolCursor++;
        if (s.isPlaying) {
          s.stop();
        }
      }
      if (s.isReady()) {
        s.play();
      }
    }

    if (!this.muzzleGunNode || !this.ammoBulletMesh) {
      return;
    }

    this.syncMuzzleNodeWorldMatrix(this.muzzleGunNode);
    const origin = this.muzzleGunNode.getAbsolutePosition().clone();
    this.spawnMuzzleFlash(
      this.gunMuzzleFlashPool,
      origin,
      TankGameplayController.GUN_MUZZLE_FLASH_PEAK_INTENSITY,
      TankGameplayController.GUN_MUZZLE_FLASH_LIFE_S
    );
    const baseForward = this.getMuzzleNodeWorldForward(this.muzzleGunNode);
    const muzzleRotation = this.getMuzzleNodeWorldRotation(this.muzzleGunNode);

    // Dynamic bloom cone: grows with sustained firing (0° -> 9°).
    const maxAngleRad = (Math.PI / 180) * this.gunSpreadDeg;
    const spreadBasis = this.getMuzzleSpreadBasis(this.muzzleGunNode, baseForward);
    const right = spreadBasis.right;
    const up = spreadBasis.up;
    const r = Math.random();
    const theta = Math.random() * Math.PI * 2;
    const radius = Math.tan(maxAngleRad) * Math.sqrt(r);
    const offset = right.scale(Math.cos(theta) * radius).add(up.scale(Math.sin(theta) * radius));
    const dir = baseForward.add(offset).normalize();

    const maxDistance = this.config.aim.cameraMaxTargetDistance;
    const to = origin.add(dir.scale(maxDistance));

    let hitPoint = to;
    let turretSpawnId: string | null = null;
    const physics = this.scene.getPhysicsEngine();
    if (physics) {
      const hit = physics.raycast(origin, to, {
        ignoreBody: this.tankBody,
        shouldHitTriggers: false,
        collideWith: 0xffffffff
      });
      if (hit.hasHit) {
        hitPoint = hit.hitPointWorld.clone();
        if (this.enemyTurretSystem) {
          turretSpawnId = this.enemyTurretSystem.resolveTurretIdFromWeaponHit(hit);
        }
      }
    }

    // Visual tracer (non-physical)
    const mesh = this.ammoBulletMesh.clone("bullet_tracer", null);
    if (!mesh) {
      return;
    }
    mesh.isVisible = true;
    mesh.position.copyFrom(origin);
    mesh.rotationQuaternion = muzzleRotation.clone();
    const hitDistance = Math.max(Vector3.Distance(origin, hitPoint), 0.001);
    this.activeGunTracers.push({
      mesh,
      from: origin,
      dir: dir.clone(),
      hitPoint: hitPoint.clone(),
      hitDistance,
      traveled: 0,
      speed: this.config.weapons.bullet.muzzleVelocity,
      rotation: muzzleRotation,
      turretSpawnId
    });

    // Gun damage is applied when the tracer reaches its hit point.
  }

  private spawnProjectile(
    baseMesh: Mesh | null,
    colliderTemplate: Mesh | null,
    weaponConfig: { muzzleVelocity: number; gravityMultiplier: number; missileLock?: import("../config/tankController").MissileLockConfig },
    radius: number,
    muzzleNode: TransformNode | AbstractMesh | null = this.muzzleCannonNode,
    guidedTargetId: string | null = null
  ): void {
    if (!baseMesh || !muzzleNode) {
      return;
    }

    // If a template collider is provided (ex: `COL_obus`), use it for physics and parent the visual mesh under it.
    const mesh = colliderTemplate?.clone("projectile_collider", null) ?? baseMesh.clone("projectile", null);
    if (!mesh) return;
    mesh.isPickable = false;
    mesh.isVisible = !colliderTemplate;
    this.syncMuzzleNodeWorldMatrix(muzzleNode);
    mesh.position.copyFrom(muzzleNode.getAbsolutePosition());

    if (colliderTemplate) {
      const visual = baseMesh.clone("projectile_visual", null);
      if (!visual) {
        mesh.dispose();
        return;
      }
      visual.isVisible = true;
      visual.isPickable = false;
      visual.setParent(mesh);
      visual.position.setAll(0);
      visual.rotationQuaternion ??= Quaternion.Identity();
    }

    const forward = this.getMuzzleNodeWorldForward(muzzleNode);
    mesh.rotationQuaternion = this.getMuzzleNodeWorldRotation(muzzleNode);

    const velocity = forward.scale(weaponConfig.muzzleVelocity);

    const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, this.scene);
    
    const shape = colliderTemplate
      ? new PhysicsShapeMesh(mesh, this.scene)
      : (() => {
          // Adjust radius based on the mesh's scaling (in case the GLB is scaled x10)
          const scale = mesh.absoluteScaling.x || 1;
          return new PhysicsShapeSphere(Vector3.Zero(), radius / scale, this.scene);
        })();
    
    // Projectiles belong to group 4, and collide with everything EXCEPT the tank (group 2) and other projectiles (group 4)
    shape.filterMembershipMask = 4;
    shape.filterCollideMask = ~(2 | 4);

    body.shape = shape;
    body.setMassProperties({ mass: 1 });
    body.setGravityFactor(weaponConfig.gravityMultiplier);
    body.setLinearVelocity(velocity);

    let debugMesh: AbstractMesh | null | undefined = null;
    if (this.physicsViewer) {
      debugMesh = this.physicsViewer.showBody(body);
    }

    const proj = {
      mesh,
      body,
      shape,
      age: 0,
      lastPos: mesh.getAbsolutePosition().clone(),
      impactHandled: false,
      debugMesh,
      guided:
        guidedTargetId && weaponConfig.missileLock
          ? {
              targetId: guidedTargetId,
              speed: weaponConfig.muzzleVelocity,
              turnRateDeg: weaponConfig.missileLock.guidanceTurnRateDeg,
              launchBlendSeconds: weaponConfig.missileLock.launchBlendSeconds
            }
          : undefined
    };
    this.activeProjectiles.push(proj);

    // Collision events (reliable, independent of render framerate)
    body.setCollisionCallbackEnabled(true);
    body.getCollisionObservable().add((ev: unknown) => {
      if (proj.impactHandled) return;
      const type = String((ev as any)?.type ?? "");
      if (type && !type.includes("COLLISION_STARTED") && !type.includes("COLLISION_CONTINUED")) {
        return;
      }

      proj.impactHandled = true;
      const p =
        ((ev as any)?.point as Vector3 | undefined) ??
        ((ev as any)?.contactPoint as Vector3 | undefined) ??
        ((ev as any)?.collisionPoint as Vector3 | undefined) ??
        proj.mesh.getAbsolutePosition().clone();

      void this.spawnExplosionAt(p.clone());
      this.applyShellDamageAt(p.clone());

      const idx = this.activeProjectiles.indexOf(proj);
      if (idx >= 0) {
        this.activeProjectiles.splice(idx, 1);
      }
      proj.body.dispose();
      proj.shape.dispose();
      proj.mesh.dispose();
    });
    if (this.primaryWeaponKind === "shell") {
      this.pendingCannonRecoilKickY += this.config.cannon.recoilKickY;
      this.applyHullRecoilImpulseFromWorldForward(forward);
    }
    this.triggerShellShotCameraShake();
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const proj = this.activeProjectiles[i];
      proj.age += dt;

      if (proj.guided && !proj.impactHandled) {
        this.updateGuidedProjectile(proj, dt);
      }

      if (proj.impactHandled) {
        this.activeProjectiles.splice(i, 1);
        continue;
      }

      // Fallback: raycast between last and current position to avoid tunneling.
      const curPos = proj.mesh.getAbsolutePosition();
      const delta = curPos.subtract(proj.lastPos);
      const dist = delta.length();
      if (dist > 1e-5) {
        const dir = delta.scale(1 / dist);
        const ray = new Ray(proj.lastPos.clone(), dir, dist);
        const hit = this.scene.pickWithRay(ray, (mesh) => {
          if (!mesh) return false;
          if (mesh.uniqueId === proj.mesh.uniqueId) return false;
          if (this.tankMeshIdsToIgnore.has(mesh.uniqueId)) return false;
          if (this.enemyTurretSystem?.isTurretColliderMesh(mesh)) return true;
          const n = mesh.name.toLowerCase();
          return n.startsWith("sm_") || n.startsWith("dm_") || n.startsWith("col_") || n.includes("ground");
        });
        if (hit?.hit && hit.pickedPoint) {
          proj.impactHandled = true;
          void this.spawnExplosionAt(hit.pickedPoint.clone());
          this.applyShellDamageAt(hit.pickedPoint.clone());
          proj.body.dispose();
          proj.shape.dispose();
          proj.mesh.dispose();
          this.activeProjectiles.splice(i, 1);
          continue;
        }
      }
      proj.lastPos.copyFrom(curPos);

      // Despawn after 5 seconds
      if (proj.age > 5.0) {
        if (this.physicsViewer && proj.debugMesh) {
          // PhysicsViewer automatically cleans up debug meshes when the body is disposed,
          // but we can also hide it explicitly if needed.
        }
        proj.body.dispose();
        proj.shape.dispose();
        proj.mesh.dispose();
        this.activeProjectiles.splice(i, 1);
      }
    }
  }

  /**
   * Missile guidé : phase de lancement le long de l'axe de l'emport, puis braquage
   * progressif vers la cible verrouillée (trajectoire courbe, pas un tir rectiligne).
   */
  private updateGuidedProjectile(
    proj: (typeof this.activeProjectiles)[number],
    dt: number
  ): void {
    const guided = proj.guided;
    if (!guided || !this.enemyTurretSystem) {
      return;
    }

    const targetPos = this.enemyTurretSystem.getLockTargetAimPoint(guided.targetId);
    if (!targetPos) {
      return;
    }

    const missilePos = proj.mesh.getAbsolutePosition();
    const toTarget = targetPos.subtract(missilePos);
    if (toTarget.lengthSquared() < 1e-6) {
      return;
    }

    const desiredDir = toTarget.normalize();
    const velocity = proj.body.getLinearVelocity();
    let speed = velocity.length();
    if (speed < 1e-3) {
      speed = guided.speed;
    }

    let currentDir = velocity.lengthSquared() > 1e-6 ? velocity.normalize() : desiredDir.clone();
    const launchBlend = clamp(proj.age / Math.max(guided.launchBlendSeconds, 1e-3), 0, 1);
    const turnRateRad = toRadians(guided.turnRateDeg) * launchBlend * dt;
    const dot = clamp(Vector3.Dot(currentDir, desiredDir), -1, 1);
    const angle = Math.acos(dot);
    if (angle > 1e-5) {
      const turnAmount = Math.min(turnRateRad, angle);
      const turnT = turnAmount / angle;
      currentDir = Vector3.Lerp(currentDir, desiredDir, turnT);
      if (currentDir.lengthSquared() > 1e-8) {
        currentDir.normalize();
      }
    }

    const nextVelocity = currentDir.scale(speed);
    proj.body.setLinearVelocity(nextVelocity);
    if (nextVelocity.lengthSquared() > 1e-8) {
      proj.mesh.rotationQuaternion = Quaternion.FromLookDirectionRH(nextVelocity.normalize(), Axis.Y);
    }
  }

  /**
   * Serialized particle JSON often uses `texture.url: "foo.png"` or `particleTexture` / `textureName`.
   * Babylon resolves those relative to the page root, so they 404 unless we point at `assets/effects/`.
   */
  private rewriteExplosionParticleTextureUrls(def: unknown): void {
    const toAbsolute = (rel: string): string => {
      const trimmed = rel.trim().replace(/^\.?\//, "");
      if (/^(https?:|data:|blob:)/i.test(trimmed)) {
        return trimmed;
      }

      const filename = trimmed.split(/[\\/]/).pop()?.toLowerCase() ?? trimmed.toLowerCase();
      if (filename === "flare.png") {
        return explosionFlareTextureUrl;
      }

      console.warn(`[TankController] Unknown explosion texture reference "${rel}".`);
      return trimmed;
    };

    const walk = (node: unknown): void => {
      if (node == null) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (typeof node !== "object") return;
      const o = node as Record<string, unknown>;
      for (const [k, v] of Object.entries(o)) {
        const isAssetFileName =
          typeof v === "string" &&
          v.length > 0 &&
          /\.(png|jpe?g|webp|dds|ktx2?|basis)$/i.test(v) &&
          !/^(https?:|data:|blob:)/i.test(v);
        if (
          (k === "particleTexture" || k === "textureName" || k === "url" || (k === "name" && isAssetFileName)) &&
          typeof v === "string" &&
          v.length > 0
        ) {
          o[k] = toAbsolute(v);
        } else {
          walk(v);
        }
      }
    };

    walk(def);
  }

  private async ensureExplosionDefs(): Promise<unknown[]> {
    if (this.explosionDefsPromise) {
      return this.explosionDefsPromise;
    }

    const load = async (url: string): Promise<unknown> => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load explosion effect ${url}: ${res.status}`);
      }
      const data = (await res.json()) as unknown;
      this.rewriteExplosionParticleTextureUrls(data);
      return data;
    };

    this.explosionDefsPromise = Promise.all([
      load(explosionFlashJsonUrl),
      load(explosionShockwaveJsonUrl)
    ]);
    return this.explosionDefsPromise;
  }

  private async spawnExplosionAt(worldPos: Vector3): Promise<void> {
    this.spawnShockwaveAt(worldPos);
    const defs = await this.ensureExplosionDefs();
    for (const def of defs) {
      const ps = (ParticleSystem as unknown as { Parse: (data: unknown, scene: Scene) => ParticleSystem }).Parse(
        def,
        this.scene
      );

      ps.emitter = worldPos.clone();
      ps.disposeOnStop = true;
      ps.emitRate = 0;
      ps.manualEmitCount = ps.getCapacity();
      ps.start();
    }
  }

  private spawnShockwaveAt(worldPos: Vector3): void {
    if (!this.shockwaveTemplate) return;
    const m = this.shockwavePool.pop() ?? null;
    if (!m) return;
    m.setEnabled(true);
    m.isVisible = true;
    m.position.copyFrom(worldPos);
    m.scaling.setAll(0);
    m.visibility = 1;
    this.activeShockwaves.push({ mesh: m, age: 0 });
  }

  private updateShockwaves(dt: number): void {
    if (this.activeShockwaves.length === 0) return;
    const scaleEnd = TankGameplayController.SHOCKWAVE_SCALE_END_S;
    const fadeStart = TankGameplayController.SHOCKWAVE_FADE_START_S;
    const fadeEnd = TankGameplayController.SHOCKWAVE_FADE_END_S;
    const maxScale = TankGameplayController.SHOCKWAVE_SCALE_MAX;

    for (let i = this.activeShockwaves.length - 1; i >= 0; i--) {
      const s = this.activeShockwaves[i];
      s.age += dt;

      // Scale 0 -> maxScale by scaleEnd
      const st = scaleEnd > 0 ? clamp(s.age / scaleEnd, 0, 1) : 1;
      const sc = st * maxScale;
      s.mesh.scaling.setAll(sc);

      // Fade 1 -> 0 between fadeStart and fadeEnd
      let alpha = 1;
      if (s.age >= fadeStart) {
        const ft = fadeEnd > fadeStart ? clamp((s.age - fadeStart) / (fadeEnd - fadeStart), 0, 1) : 1;
        alpha = 1 - ft;
      }
      s.mesh.visibility = alpha;

      if (s.age >= fadeEnd) {
        s.mesh.setEnabled(false);
        s.mesh.scaling.setAll(0);
        s.mesh.visibility = 0;
        this.shockwavePool.push(s.mesh);
        this.activeShockwaves.splice(i, 1);
      }
    }
  }

  private updateGunTracers(dt: number): void {
    if (this.activeGunTracers.length === 0) return;
    for (let i = this.activeGunTracers.length - 1; i >= 0; i--) {
      const tracer = this.activeGunTracers[i];
      tracer.traveled += tracer.speed * dt;
      if (tracer.traveled >= tracer.hitDistance) {
        this.spawnSparkImpact(tracer.hitPoint);
        if (tracer.turretSpawnId) {
          this.enemyTurretSystem?.applyDamageToTurret(
            tracer.turretSpawnId,
            this.config.weapons.bullet.damage
          );
        }
        tracer.mesh.dispose();
        this.activeGunTracers.splice(i, 1);
        continue;
      }
      tracer.mesh.position.copyFrom(tracer.from.add(tracer.dir.scale(tracer.traveled)));
      tracer.mesh.rotationQuaternion = tracer.rotation.clone();
    }
  }

  private applyShellDamageAt(worldPos: Vector3): void {
    const damage = this.primaryWeaponConfig.damage;
    if (damage <= 0 || !this.enemyTurretSystem) {
      return;
    }
    this.enemyTurretSystem.applyExplosionDamageAt(
      worldPos,
      damage,
      TankGameplayController.SHELL_TURRET_DAMAGE_RADIUS
    );
  }

  private spawnSparkImpact(worldPos: Vector3): void {
    // "Volumetric" look: spawn a few sprites with slight offsets + different angles.
    // Keeping everything pooled to avoid allocations/drawcall growth.
    const count = 6;
    const radius = 0.06;

    // Small random offsets in world XY plane (good enough visually for now).
    for (let i = 0; i < count; i++) {
      const sprite = this.sparkSpritePool.pop() ?? null;
      if (!sprite) return;

      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const offset = new Vector3(Math.cos(a) * r, (Math.random() - 0.5) * radius, Math.sin(a) * r);

      sprite.isVisible = true;
      sprite.position.copyFrom(worldPos.add(offset));
      sprite.size = 0;
      sprite.color.a = 1;
      sprite.angle = Math.random() * Math.PI * 2;

      // Speed up x2.
      this.activeSparkSprites.push({ sprite, age: 0, life: 0.14, grow: 0.14, maxSize: 0.5 });
    }
  }

  private updateSparks(dt: number): void {
    if (this.activeSparkSprites.length === 0) return;
    for (let i = this.activeSparkSprites.length - 1; i >= 0; i--) {
      const s = this.activeSparkSprites[i];
      s.age += dt;
      const t = s.life > 0 ? s.age / s.life : 1;
      if (t >= 1) {
        s.sprite.isVisible = false;
        s.sprite.size = 0;
        s.sprite.color.a = 0;
        this.sparkSpritePool.push(s.sprite);
        this.activeSparkSprites.splice(i, 1);
        continue;
      }
      const growT = s.grow > 0 ? clamp(s.age / s.grow, 0, 1) : 1;
      const size = growT * s.maxSize;
      s.sprite.size = size;
      s.sprite.color.a = 1 - t;
    }
  }

  private applyTurretAndCannon(_pointerX: number, _pointerY: number, dt: number): void {
    // IMPORTANT: gameplay aiming must not change when switching to the alternative zoom view.
    // So we always use the orbit camera (tankCamera) as the control camera for raycasts/aim.
    const controlCamera = this.tankCamera ?? (this.scene.activeCamera as TargetCamera | null);
    if (!controlCamera) {
      return;
    }

    // Ensure the camera world matrix/globalPosition is up to date before we use it for debug + raycasting.
    controlCamera.computeWorldMatrix();

    // In zoom view, the render camera is different from the control camera.
    // Reticle projection must use the render camera, while aiming uses control camera.
    const renderCamera =
      (this.scene.activeCamera as Camera | null | undefined) ?? (controlCamera as unknown as Camera);

    // "Camera reticle" is a fixed crosshair: raycast from screen center (not pointer position).
    const cx = this.scene.getEngine().getRenderWidth() * 0.5;
    const cy = this.scene.getEngine().getRenderHeight() * 0.5;
    const ray = this.scene.createPickingRay(cx, cy, Matrix.Identity(), controlCamera);
    let targetPoint: Vector3 | null = null;

    const pickResult = this.scene.pickWithRay(ray, (mesh) => {
      // Only hit terrain meshes or ground
      return mesh.name.startsWith("SM_") || mesh.name.startsWith("DM_") || mesh.name.toLowerCase().includes("ground");
    });

    if (pickResult?.hit && pickResult.pickedPoint) {
      targetPoint = pickResult.pickedPoint;
    } else {
      // Intersect with horizontal plane at tank's height
      const plane = Plane.FromPositionAndNormal(this.tankAnchor.position, Axis.Y);
      const distance = ray.intersectsPlane(plane);
      if (distance !== null && distance > 0) {
        targetPoint = ray.origin.add(ray.direction.scale(distance));
      } else {
        // Looking at the sky or parallel to the ground
        targetPoint = ray.origin.add(ray.direction.scale(1000));
      }
    }

    if (targetPoint) {
      this.lastAimTargetPoint = targetPoint.clone();

      // Limit the distance of the target point from the tank to 1 meter
      // (Note: The game uses a x10 scale, you can increase this value if 1.0 feels too short)
      const tankPos = this.tankAnchor.getAbsolutePosition();
      const offset = targetPoint.subtract(tankPos);
      const maxDistance = this.config.aim.cameraMaxTargetDistance;
      if (offset.length() > maxDistance) {
        offset.normalize().scaleInPlace(maxDistance);
        targetPoint = tankPos.add(offset);
        this.lastAimTargetPoint.copyFrom(targetPoint);
      }

      // For debug visualization, use the actual camera position as ray origin.
      // Babylon's picking ray origin can be at the near-plane, which is confusing visually.
      this.updateAimDebug(controlCamera.globalPosition.clone(), ray.direction, targetPoint);
      // Camera reticle is now screen-space GUI; no world-space update needed.
      this.updateBarrelReticles(renderCamera);

      // Transform target point to tank's local space
      const invHullMatrix = this.tankAnchor.getWorldMatrix().clone().invert();
      const localTarget = Vector3.TransformCoordinates(targetPoint, invHullMatrix);

      // Calculate desired yaw in tank space (XZ plane)
      // Math.atan2(x, z) means 0 is forward (+z), PI/2 is right (+x)
      // Negating x and z to flip the turret 180 degrees
      let desiredYawRad = Math.atan2(-localTarget.x, -localTarget.z);
      this.targetTurretYawDeg = (desiredYawRad * 180) / Math.PI * this.config.rig.turretYawSign;

      // For pitch, calculate distance from cannon pivot to target
      let cannonLocalPos = Vector3.Zero();
      if (this.cannonControl.transformNode) {
        const cannonWorldPos = this.cannonControl.transformNode.getAbsolutePosition();
        cannonLocalPos = Vector3.TransformCoordinates(cannonWorldPos, invHullMatrix);
      } else if (this.cannonControl.bone) {
        const cannonWorldPos = this.cannonControl.bone.getAbsolutePosition(this.tankAnchor);
        cannonLocalPos = Vector3.TransformCoordinates(cannonWorldPos, invHullMatrix);
      }

      const dx = localTarget.x - cannonLocalPos.x;
      const dz = localTarget.z - cannonLocalPos.z;
      const distHorizFromCannon = Math.sqrt(dx * dx + dz * dz);
      const heightFromCannon = localTarget.y - cannonLocalPos.y;

      let desiredPitchRad = Math.atan2(heightFromCannon, distHorizFromCannon);
      
      // Apply sign and clamp
      this.targetCannonPitchDeg = clamp(
        ((desiredPitchRad * 180) / Math.PI) * this.config.rig.cannonPitchSign,
        this.config.cannon.minPitchDeg,
        this.config.cannon.maxPitchDeg
      );
    }

    const turretPrevYawDeg = this.currentTurretYawDeg;
    const turretNextYawDeg = moveTowardsAngle(
      this.currentTurretYawDeg,
      this.targetTurretYawDeg,
      this.config.turret.yawSpeedDeg * dt
    );
    const turretStepDeg = Math.abs(turretNextYawDeg - turretPrevYawDeg);
    const turretStepRad = toRadians(turretNextYawDeg - turretPrevYawDeg);
    this.currentTurretYawDeg = turretNextYawDeg;

    void turretStepRad;
    setControlAxisAngle(
      this.turretControl,
      this.turretBaseLocalRotation,
      this.turretYawAxis,
      toRadians(this.currentTurretYawDeg),
      this.tankAnchor
    );

    const cannonPrevPitchDeg = this.currentCannonPitchDeg;
    const cannonNextPitchDeg = moveTowards(
      this.currentCannonPitchDeg,
      this.targetCannonPitchDeg,
      this.config.cannon.pitchSpeedDeg * dt
    );
    const cannonStepDeg = Math.abs(cannonNextPitchDeg - cannonPrevPitchDeg);
    const cannonStepRad = toRadians(cannonNextPitchDeg - cannonPrevPitchDeg);
    this.currentCannonPitchDeg = cannonNextPitchDeg;

    this.syncArticulationSounds(turretStepDeg, cannonStepDeg);
    void cannonStepRad;

    this.cannonRecoilOffsetY = moveTowards(
      this.cannonRecoilOffsetY,
      0,
      this.config.cannon.recoilReturnSpeed * dt
    );
    this.cannonRecoilOffsetY += this.pendingCannonRecoilKickY;
    this.pendingCannonRecoilKickY = 0;

    setControlAxisAngle(
      this.cannonControl,
      this.cannonBaseLocalRotation,
      this.cannonPitchAxis,
      toRadians(this.currentCannonPitchDeg),
      this.tankAnchor
    );

    const cannonPos = this.cannonBaseLocalPosition.clone();
    cannonPos.y += this.cannonRecoilOffsetY;
    setControlLocalPosition(this.cannonControl, cannonPos);
  }

  /** Rotation visuelle du minigun (axe Y local) pendant le tir mitrailleuse. */
  private applyMinigunSpin(dt: number): void {
    if (!this.minigunControl.bone && !this.minigunControl.transformNode) {
      return;
    }

    const isMinigunFiring =
      this.fireHeld && this.battery > 0 && this.activeWeapon === "bullet" && !this.paused && this.playerActive;
    if (isMinigunFiring) {
      const spinDegPerSec = this.config.rig.minigunSpinDegPerSec ?? 720;
      this.minigunSpinRad += toRadians(spinDegPerSec) * dt;
    }

    setControlAxisAngle(
      this.minigunControl,
      this.minigunBaseLocalRotation,
      Axis.Y,
      this.minigunSpinRad,
      this.tankAnchor
    );
  }

  private applyWheelVisualSpin(forwardWorld: Vector3, turnAxis: number, dt: number): void {
    if (this.wheelControls.length === 0) {
      return;
    }

    const v = this.tankBody.getLinearVelocity();
    const forwardSpeed = Vector3.Dot(v, forwardWorld);
    const wheelRadius = this.config.rig.wheelRadius ?? 0.35;
    const spinSign = this.config.rig.wheelSpinSign ?? 1;
    this.wheelSpinRad += (forwardSpeed / Math.max(wheelRadius, 0.05)) * dt * spinSign;

    const steerSign = this.config.rig.wheelSteerSign ?? 1;
    const steerMaxDeg = this.config.rig.wheelSteerMaxDeg ?? 0;
    const targetSteerRad = toRadians(turnAxis * steerMaxDeg * steerSign);
    const steerSharpness = this.config.rig.wheelSteerSharpness ?? 12;
    this.wheelSteerRad = moveTowards(this.wheelSteerRad, targetSteerRad, steerSharpness * dt);

    const spinAxis = axisFromConfig(this.config.rig.wheelSpinAxis ?? "x", 1);
    const steerAxis = axisFromConfig(this.config.rig.wheelSteerAxis ?? "y", 1);
    for (let i = 0; i < this.wheelControls.length; i++) {
      let rotation = this.wheelBaseLocalRotations[i].clone();
      if (this.frontWheelIndices.has(i) && steerMaxDeg > 0) {
        rotation = rotation.multiply(Quaternion.RotationAxis(steerAxis, this.wheelSteerRad));
      }
      rotation = rotation.multiply(Quaternion.RotationAxis(spinAxis, this.wheelSpinRad));
      setControlLocalRotation(this.wheelControls[i], rotation, this.tankAnchor);
    }

    this.applyWheelVisualTravel(dt);
  }

  /**
   * Remonte chaque roue dans le repère du châssis d’autant que sa suspension est comprimée,
   * pour que le pneu reste posé au sol malgré l’enfoncement de la caisse.
   */
  private applyWheelVisualTravel(dt: number): void {
    if (this.config.rig.wheelTravelEnabled !== true) {
      return;
    }

    const travelAxis = axisFromConfig(this.config.rig.wheelTravelAxis ?? "y", 1);
    const travelSign = this.config.rig.wheelTravelSign ?? 1;
    const sharpness = this.config.rig.wheelTravelSharpness ?? 25;
    const smoothing = 1 - Math.exp(-Math.max(sharpness, 0.01) * dt);

    for (let i = 0; i < this.wheelControls.length; i++) {
      const probeIndex = this.wheelProbeIndices[i];
      const target = probeIndex >= 0 ? this.suspensionCompressions[probeIndex] ?? 0 : 0;
      this.wheelTravelSmoothed[i] += (target - this.wheelTravelSmoothed[i]) * smoothing;

      const position = this.wheelBaseLocalPositions[i].add(
        travelAxis.scale(this.wheelTravelSmoothed[i] * travelSign)
      );
      setControlLocalPosition(this.wheelControls[i], position);
    }
  }

  private initAimDebugMeshes(): void {
    if (!TankGameplayController.DEBUG_AIM_VECTORS) {
      return;
    }
    // Always-on debug for now: visible vectors to quickly diagnose missing/incorrect reticles.
    this.debugCameraRayLine = MeshBuilder.CreateLines(
      "debug_camera_ray",
      { points: [Vector3.Zero(), Vector3.Zero()], updatable: true },
      this.scene
    );
    this.debugCameraRayLine.color = new Color3(1, 1, 0);
    this.debugCameraRayLine.renderingGroupId = 2;

    this.debugBarrelForwardLine = MeshBuilder.CreateLines(
      "debug_barrel_forward",
      { points: [Vector3.Zero(), Vector3.Zero()], updatable: true },
      this.scene
    );
    this.debugBarrelForwardLine.color = new Color3(0.2, 0.6, 1);
    this.debugBarrelForwardLine.renderingGroupId = 2;

    this.debugTargetMarker = MeshBuilder.CreateSphere(
      "debug_aim_target",
      { diameter: 0.25, segments: 8 },
      this.scene
    );
    this.debugTargetMarker.isPickable = false;
    this.debugTargetMarker.renderingGroupId = 2;

    this.debugCameraOriginMarker = MeshBuilder.CreateSphere(
      "debug_camera_origin",
      { diameter: 0.18, segments: 8 },
      this.scene
    );
    this.debugCameraOriginMarker.isPickable = false;
    this.debugCameraOriginMarker.renderingGroupId = 2;
  }

  private updateAimDebug(rayOrigin: Vector3, _rayDir: Vector3, targetPoint: Vector3): void {
    if (!TankGameplayController.DEBUG_AIM_VECTORS) {
      return;
    }
    if (this.debugCameraOriginMarker) {
      this.debugCameraOriginMarker.position.copyFrom(rayOrigin);
      this.debugCameraOriginMarker.isVisible = true;
    }
    // Camera ray to target point
    if (this.debugCameraRayLine) {
      MeshBuilder.CreateLines(
        this.debugCameraRayLine.name,
        { points: [rayOrigin, targetPoint], instance: this.debugCameraRayLine },
        this.scene
      );
      this.debugCameraRayLine.isVisible = true;
    }

    if (this.debugTargetMarker) {
      this.debugTargetMarker.position.copyFrom(targetPoint);
      this.debugTargetMarker.isVisible = true;
    }

    // Barrel forward vector (from MUZZLE_tank)
    if (this.debugBarrelForwardLine && this.muzzleCannonNode) {
      const from = this.muzzleCannonNode.getAbsolutePosition();
      const forward = this.muzzleCannonNode
        .getDirection(this.movementForwardAxis)
        .scale(-this.config.rig.movementForwardSign);
      if (forward.lengthSquared() > 1e-6) {
        forward.normalize();
      } else {
        forward.copyFrom(Axis.Z);
      }
      const to = from.add(forward.scale(5));

      MeshBuilder.CreateLines(
        this.debugBarrelForwardLine.name,
        { points: [from, to], instance: this.debugBarrelForwardLine },
        this.scene
      );
      this.debugBarrelForwardLine.isVisible = true;
    }
  }

  private updateBarrelReticles(camera: Camera): void {
    if (!this.muzzleCannonNode || !this.muzzleGunNode) {
      return;
    }

    const computeGunReticleScale = (): number => {
      const t = clamp(this.gunSpreadDeg / TankGameplayController.GUN_SPREAD_MAX_DEG, 0, 1);
      const base = lerp(
        TankGameplayController.GUN_RETICLE_SCALE_MIN,
        TankGameplayController.GUN_RETICLE_SCALE_MAX,
        t
      );

      const kickT = this.gunReticleKickTime;
      const kick =
        kickT <= TankGameplayController.GUN_RETICLE_KICK_UP_SECONDS
          ? lerp(
              TankGameplayController.GUN_RETICLE_KICK_OVERSHOOT,
              TankGameplayController.GUN_RETICLE_KICK_SETTLE,
              clamp(kickT / TankGameplayController.GUN_RETICLE_KICK_UP_SECONDS, 0, 1)
            )
          : kickT <=
              TankGameplayController.GUN_RETICLE_KICK_UP_SECONDS +
                TankGameplayController.GUN_RETICLE_KICK_FADE_SECONDS
            ? lerp(
                TankGameplayController.GUN_RETICLE_KICK_SETTLE,
                0,
                clamp(
                  (kickT - TankGameplayController.GUN_RETICLE_KICK_UP_SECONDS) /
                    TankGameplayController.GUN_RETICLE_KICK_FADE_SECONDS,
                  0,
                  1
                )
              )
            : 0;

      return base * (1 + kick);
    };

    // In zoom view, keep barrel reticles locked to screen center (avoid parallax between camera ray and muzzle ray).
    // Also keep shell aim point aligned with the camera aim target so the projectile uses the same target.
    if (this.zoomActive) {
      if (this.barrelShellReticle2D) {
        this.barrelShellReticle2D.isVisible = this.isPrimaryWeapon(this.activeWeapon);
        this.barrelShellReticle2D.leftInPixels = 0;
        this.barrelShellReticle2D.topInPixels = 0;
      }
      if (this.barrelGunReticle2D) {
        this.barrelGunReticle2D.isVisible = this.activeWeapon === "bullet";
        this.barrelGunReticle2D.leftInPixels = 0;
        this.barrelGunReticle2D.topInPixels = 0;
        if (this.activeWeapon === "bullet") {
          const s = computeGunReticleScale();
          (this.barrelGunReticle2D as unknown as Control).scaleX = s;
          (this.barrelGunReticle2D as unknown as Control).scaleY = s;
        } else {
          (this.barrelGunReticle2D as unknown as Control).scaleX =
            TankGameplayController.GUN_RETICLE_SCALE_MIN;
          (this.barrelGunReticle2D as unknown as Control).scaleY =
            TankGameplayController.GUN_RETICLE_SCALE_MIN;
        }
      }
      return;
    }

    const engine = this.scene.getEngine();
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const viewport = camera.viewport.toGlobal(w, h);

    const updateUiFromHit = (hitPoint: Vector3, ui: Rectangle | null): void => {
      if (!ui) return;

      const projected = Vector3.Project(
        hitPoint,
        Matrix.Identity(),
        this.scene.getTransformMatrix(),
        viewport
      );

      const onScreen =
        Number.isFinite(projected.x) &&
        Number.isFinite(projected.y) &&
        projected.z >= 0 &&
        projected.z <= 1 &&
        projected.x >= viewport.x &&
        projected.x <= viewport.x + viewport.width &&
        projected.y >= viewport.y &&
        projected.y <= viewport.y + viewport.height;

      if (!onScreen) {
        ui.isVisible = false;
        return;
      }

      ui.isVisible = true;
      ui.leftInPixels = projected.x - (viewport.x + viewport.width / 2);
      ui.topInPixels = projected.y - (viewport.y + viewport.height / 2);
    };

    const physics = this.scene.getPhysicsEngine();

    // Shell / cannon reticle (only visible when shell is active)
    {
      const primaryMuzzle = this.resolvePrimaryReticleMuzzle();
      if (!primaryMuzzle) {
        if (this.barrelShellReticle2D) {
          this.barrelShellReticle2D.isVisible = false;
        }
      } else {
        const from = primaryMuzzle.getAbsolutePosition();
        const forward = primaryMuzzle
          .getDirection(this.movementForwardAxis)
          .scale(-this.config.rig.movementForwardSign);
        if (forward.lengthSquared() > 1e-6) {
          forward.normalize();
          const maxDist = this.config.aim.barrelRayMaxDistance;
          const to = from.add(forward.scale(maxDist));

          let hitPoint: Vector3 | null = null;
          if (physics) {
            const hit = physics.raycast(from, to, {
              ignoreBody: this.tankBody,
              shouldHitTriggers: false,
              collideWith: 0xffffffff
            });
            if (hit.hasHit) {
              hitPoint = hit.hitPointWorld.clone();
            }
          }
          if (!hitPoint) {
            hitPoint = to;
          }

          if (this.isPrimaryWeapon(this.activeWeapon)) {
            updateUiFromHit(hitPoint, this.barrelShellReticle2D);
          } else if (this.barrelShellReticle2D) {
            this.barrelShellReticle2D.isVisible = false;
          }
        }
      }
    }

    // Gun / coaxial reticle (only visible when bullet weapon is active)
    {
      const from = this.muzzleGunNode.getAbsolutePosition();
      const baseForward = this.muzzleGunNode
        .getDirection(this.movementForwardAxis)
        .scale(-this.config.rig.movementForwardSign);
      if (baseForward.lengthSquared() > 1e-6) {
        baseForward.normalize();
        const maxDist = this.config.aim.barrelRayMaxDistance;
        const to = from.add(baseForward.scale(maxDist));

        let hitPoint: Vector3 | null = null;
        if (physics) {
          const hit = physics.raycast(from, to, {
            ignoreBody: this.tankBody,
            shouldHitTriggers: false,
            collideWith: 0xffffffff
          });
          if (hit.hasHit) {
            hitPoint = hit.hitPointWorld.clone();
          }
        }
        if (!hitPoint) {
          hitPoint = to;
        }

        // (Gun impacts/damage can be implemented later if needed.)
        const ui = this.barrelGunReticle2D;
        if (this.activeWeapon === "bullet") {
          // Reticle scales with spread: 1.0 -> 1.5 as spread goes 0° -> 9°.
          if (ui) {
            const t = clamp(this.gunSpreadDeg / TankGameplayController.GUN_SPREAD_MAX_DEG, 0, 1);
            const s = lerp(
              TankGameplayController.GUN_RETICLE_SCALE_MIN,
              TankGameplayController.GUN_RETICLE_SCALE_MAX,
              t
            );

            // Per-shot kick: 15% -> 10% quickly, then fades out.
            const kickT = this.gunReticleKickTime;
            const kick =
              kickT <= TankGameplayController.GUN_RETICLE_KICK_UP_SECONDS
                ? lerp(
                    TankGameplayController.GUN_RETICLE_KICK_OVERSHOOT,
                    TankGameplayController.GUN_RETICLE_KICK_SETTLE,
                    clamp(kickT / TankGameplayController.GUN_RETICLE_KICK_UP_SECONDS, 0, 1)
                  )
                : kickT <=
                    TankGameplayController.GUN_RETICLE_KICK_UP_SECONDS +
                      TankGameplayController.GUN_RETICLE_KICK_FADE_SECONDS
                  ? lerp(
                      TankGameplayController.GUN_RETICLE_KICK_SETTLE,
                      0,
                      clamp(
                        (kickT - TankGameplayController.GUN_RETICLE_KICK_UP_SECONDS) /
                          TankGameplayController.GUN_RETICLE_KICK_FADE_SECONDS,
                        0,
                        1
                      )
                    )
                  : 0;

            const finalScale = s * (1 + kick);
            (ui as unknown as Control).scaleX = finalScale;
            (ui as unknown as Control).scaleY = finalScale;
          }
          updateUiFromHit(hitPoint, ui);
        } else if (ui) {
          ui.isVisible = false;
          (ui as unknown as Control).scaleX = TankGameplayController.GUN_RETICLE_SCALE_MIN;
          (ui as unknown as Control).scaleY = TankGameplayController.GUN_RETICLE_SCALE_MIN;
        }
      }
    }
  }

  private resolveFlightRig(
    container: AssetContainer,
    rig: FlightRigConfig | undefined
  ): FlightRigControls | null {
    if (!rig) {
      console.warn("[TankController] steeringMode `plane` without `rig.flight`: no animated surfaces.");
      return null;
    }

    const hinge = (
      boneName: string | undefined,
      axisName: "x" | "y" | "z" | undefined,
      sign: 1 | -1
    ): HingeControl | null => {
      if (!boneName) {
        return null;
      }
      const control = resolveBoneControl(container, boneName);
      if (!control.bone && !control.transformNode) {
        console.warn(`[TankController] flight bone "${boneName}" not found.`);
        return null;
      }
      return {
        control,
        baseRotation: getControlLocalRotation(control, this.tankAnchor),
        axis: axisFromConfig(axisName ?? "x", sign)
      };
    };

    const aileronSign = rig.aileronSign ?? 1;
    const elevatorSign = rig.elevatorSign ?? 1;
    const gearMainSign = rig.gearMainSign ?? 1;
    return {
      aileronLeft: hinge(rig.aileronLeftBone, rig.aileronAxis, aileronSign),
      // Les deux ailerons partagent le même axe local : le braquage antisymétrique
      // vient donc du signe, pas du rig.
      aileronRight: hinge(rig.aileronRightBone, rig.aileronAxis, aileronSign === 1 ? -1 : 1),
      elevatorLeft: hinge(rig.elevatorLeftBone, rig.elevatorAxis, elevatorSign),
      elevatorRight: hinge(rig.elevatorRightBone, rig.elevatorAxis, elevatorSign),
      rudder: hinge(rig.rudderBone, rig.rudderAxis, rig.rudderSign ?? 1),
      gearFront: hinge(rig.gearFrontBone, rig.gearFrontAxis, rig.gearFrontSign ?? 1),
      gearLeft: hinge(rig.gearLeftBone, rig.gearMainAxis, gearMainSign),
      gearRight: hinge(rig.gearRightBone, rig.gearMainAxis, gearMainSign === 1 ? -1 : 1)
    };
  }

  /**
   * Mode avion : le modèle de vol pilote entièrement forces et couples. La
   * suspension reste active pour le roulage, mais aucune logique de conduite au
   * sol (braquage, traction, grip latéral) ne s'applique.
   */
  private updateFlight(
    turnAxis: number,
    boostHeld: boolean,
    canMove: boolean,
    grounded: boolean,
    dt: number
  ): void {
    const flight = this.flightModel;
    if (!flight) {
      return;
    }

    const state = flight.update(
      {
        throttleAxis: canMove ? this.smoothedMoveAxis * this.movementInputSign : 0,
        yawAxis: canMove ? turnAxis : 0,
        lookDeltaX: this.lastLookDeltaX,
        lookDeltaY: this.lastLookDeltaY,
        boostHeld: boostHeld && this.overcharge > 0
      },
      grounded,
      canMove,
      dt
    );

    this.boostActive = state.afterburner;
    const overchargeMax = this.config.energy.overchargeMax;
    if (state.afterburner) {
      this.overcharge = Math.max(
        0,
        this.overcharge - this.config.energy.overchargeDrainBoostPerSecond * dt
      );
    } else if (this.overcharge < overchargeMax) {
      this.overcharge = Math.min(
        overchargeMax,
        this.overcharge + this.config.energy.overchargeRechargePerSecond * dt
      );
    }

    if (state.throttle > 0.01) {
      this.battery = clamp(
        this.battery - this.config.energy.batteryDrainMovingPerSecond * state.throttle * dt,
        0,
        this.config.energy.batteryMax
      );
    }

    this.applyFlightRigVisuals(state, dt);
  }

  /** Gouvernes braquées d'après le manche, trains déployés d'après l'état de vol. */
  private applyFlightRigVisuals(state: FlightState, dt: number): void {
    const rig = this.flightRig;
    const cfg = this.config.flight;
    if (!rig || !cfg) {
      return;
    }

    const smooth = 1 - Math.exp(-Math.max(cfg.surfaceSharpness, 0.01) * dt);
    this.flightAileronSmoothed += (state.stickRoll - this.flightAileronSmoothed) * smooth;
    this.flightElevatorSmoothed += (state.stickPitch - this.flightElevatorSmoothed) * smooth;
    this.flightRudderSmoothed += (state.yawInput - this.flightRudderSmoothed) * smooth;

    const aileron = toRadians(this.flightAileronSmoothed * cfg.aileronMaxDeg);
    const elevator = toRadians(this.flightElevatorSmoothed * cfg.elevatorMaxDeg);
    const rudder = toRadians(this.flightRudderSmoothed * cfg.rudderMaxDeg);
    this.setHingeAngle(rig.aileronLeft, aileron);
    this.setHingeAngle(rig.aileronRight, aileron);
    this.setHingeAngle(rig.elevatorLeft, elevator);
    this.setHingeAngle(rig.elevatorRight, elevator);
    this.setHingeAngle(rig.rudder, rudder);

    const stowed = toRadians((1 - state.gearExtension) * cfg.gear.retractedDeg);
    this.setHingeAngle(rig.gearFront, stowed);
    this.setHingeAngle(rig.gearLeft, stowed);
    this.setHingeAngle(rig.gearRight, stowed);
  }

  private setHingeAngle(hinge: HingeControl | null, angleRad: number): void {
    if (!hinge) {
      return;
    }
    setControlAxisAngle(hinge.control, hinge.baseRotation, hinge.axis, angleRad, this.tankAnchor);
  }

  /**
   * Caméra de poursuite : elle suit le cap et l'assiette de l'appareil mais pas
   * son roulis, sans quoi l'horizon tournerait avec l'avion à chaque tonneau.
   */
  private applyChaseCamera(dt: number): void {
    if (!this.tankCamera || !this.cameraPivotNode) {
      return;
    }

    const nose = this.tankAnchor
      .getDirection(this.movementForwardAxis)
      .scale(this.movementInputSign * this.config.rig.movementForwardSign);
    if (nose.lengthSquared() < 1e-8) {
      return;
    }
    nose.normalize();

    let right = Vector3.Cross(Axis.Y, nose);
    if (right.lengthSquared() < 1e-4) {
      right = this.tankAnchor.getDirection(Axis.X);
    }
    right.normalize();
    const vertical = Vector3.Cross(nose, right).normalize();

    const pivot = this.cameraPivotNode.getAbsolutePosition();
    const offset = nose
      .scale(-Math.cos(this.orbitPitchRad) * this.orbitRadius)
      .add(vertical.scale(Math.sin(this.orbitPitchRad) * this.orbitRadius));
    const desired = pivot.add(offset);

    const lerp = 1 - Math.exp(-TankGameplayController.CHASE_CAMERA_SHARPNESS * dt);
    this.tankCamera.position.copyFrom(Vector3.Lerp(this.tankCamera.position, desired, lerp));
    this.tankCamera.setTarget(pivot);
  }

  private applyMovement(moveAxis: number, turnAxis: number, boostHeld: boolean, dt: number): void {
    const canMove = this.battery > 0;
    const desiredMoveAxis = canMove ? moveAxis * this.movementInputSign : 0;
    const inputRate =
      Math.abs(desiredMoveAxis) > Math.abs(this.smoothedMoveAxis)
        ? this.config.movement.inputRiseRate
        : this.config.movement.inputFallRate;
    this.smoothedMoveAxis = moveTowards(this.smoothedMoveAxis, desiredMoveAxis, inputRate * dt);
    const desiredTurnAxis = canMove ? turnAxis : 0;
    const turnInputRate =
      Math.abs(desiredTurnAxis) > Math.abs(this.smoothedTurnAxis)
        ? this.config.movement.inputRiseRate
        : this.config.movement.inputFallRate;
    this.smoothedTurnAxis = moveTowards(this.smoothedTurnAxis, desiredTurnAxis, turnInputRate * dt);
    const isMoving = canMove && Math.abs(this.smoothedMoveAxis) > 0.001;

    if (!canMove) {
      this.smoothedTurnAxis = 0;
    }

    this.boostActive = false;

    const forwardWorld = this.tankAnchor.getDirection(this.movementForwardAxis);
    forwardWorld.y = 0;
    if (forwardWorld.lengthSquared() > 1e-6) {
      forwardWorld.normalize();
    } else {
      forwardWorld.copyFrom(Axis.Z);
    }
    const rightWorld = Vector3.Cross(Axis.Y, forwardWorld).normalize();

    // Suspension forces (raycast down from SUS_* points) — also refreshes ground contact state.
    const fallSpeedBeforeSuspension = -this.tankBody.getLinearVelocity().y;
    this.applySuspension();
    const grounded = this.suspensionContactCount > 0;
    if (grounded) {
      this.applyLandingBounce(fallSpeedBeforeSuspension);
      this.playSuspensionImpactSound(fallSpeedBeforeSuspension, this.airborneSeconds);
      this.airborneSeconds = 0;
    } else {
      this.airborneSeconds += dt;
    }
    this.syncPhysicsDamping(grounded);

    if (this.flightModel) {
      this.updateFlight(turnAxis, boostHeld, canMove, grounded, dt);
      this.hullDrivePitchTarget = 0;
      this.syncTankMovementSounds();
      return;
    }

    // Wheels off the ground: no steering torque, no traction, no lateral grip.
    const hasGroundControl = grounded || this.config.movement.requireGroundContactForControl !== true;

    this.updateDrivePitchTarget(dt, canMove, grounded, forwardWorld);

    // Steering: drive the rigidbody (not the node transform).
    if (canMove && hasGroundControl) {
      const angVel = this.tankBody.getAngularVelocity();
      const steeringMode = this.config.movement.steeringMode ?? "tank";
      if (steeringMode === "car") {
        const linearVelocity = this.tankBody.getLinearVelocity();
        const driveForward = forwardWorld.scale(
          this.movementInputSign * this.config.rig.movementForwardSign
        );
        const forwardSpeed = Vector3.Dot(linearVelocity, driveForward);
        const minSteerSpeed = this.config.movement.carMinSteerSpeed ?? 0.35;
        if (Math.abs(forwardSpeed) >= minSteerSpeed) {
          const refSpeed =
            this.config.movement.carSteerReferenceSpeed ??
            this.config.movement.moveSpeed * 8;
          const minSpeedFactor = this.config.movement.carSteerMinSpeedFactor ?? 0.7;
          const speedFactor = clamp(
            Math.abs(forwardSpeed) / Math.max(refSpeed, 0.1),
            minSpeedFactor,
            1
          );
          const reverseSign = forwardSpeed >= 0 ? 1 : -1;
          angVel.y = toRadians(
            this.smoothedTurnAxis *
              this.config.movement.hullTurnSpeedDeg *
              speedFactor *
              reverseSign
          );
        } else {
          angVel.y = 0;
        }
      } else {
        angVel.y = toRadians(turnAxis * this.config.movement.hullTurnSpeedDeg);
      }
      this.tankBody.setAngularVelocity(angVel);
    }

    const overchargeMax = this.config.energy.overchargeMax;
    if (boostHeld) {
      this.overcharge = Math.max(
        0,
        this.overcharge - this.config.energy.overchargeDrainBoostPerSecond * dt
      );
    } else if (this.overcharge < overchargeMax) {
      this.overcharge = Math.min(
        overchargeMax,
        this.overcharge + this.config.energy.overchargeRechargePerSecond * dt
      );
    }

    let tractionMultiplier = 1;
    if (isMoving) {
      const canBoost = boostHeld && this.overcharge > 0;
      if (canBoost) {
        tractionMultiplier *= this.config.movement.boostMultiplier;
        this.boostActive = true;
      }

      this.battery = clamp(
        this.battery - this.config.energy.batteryDrainMovingPerSecond * dt,
        0,
        this.config.energy.batteryMax
      );
    }

    const center = this.tankBody.getObjectCenterWorld();
    const v = this.tankBody.getLinearVelocity();
    const lateralSpeed = Vector3.Dot(v, rightWorld);
    const steeringMode = this.config.movement.steeringMode ?? "tank";
    let lateralGrip = this.config.suspension.lateralFriction;
    if (steeringMode === "car") {
      const steerGripMultiplier = this.config.movement.carSteerGripMultiplier ?? 1;
      if (steerGripMultiplier > 1 && Math.abs(this.smoothedTurnAxis) > 0.05) {
        const steerAmount = clamp(Math.abs(this.smoothedTurnAxis), 0, 1);
        lateralGrip *= 1 + (steerGripMultiplier - 1) * steerAmount;
      }
    }
    if (hasGroundControl) {
      const lateralForce = rightWorld.scale(-lateralSpeed * lateralGrip);
      this.tankBody.applyForce(lateralForce, center);
    }

    if (isMoving && hasGroundControl) {
      const tractionForce = forwardWorld.scale(
        this.smoothedMoveAxis * this.config.suspension.tractionForce * tractionMultiplier
      );
      this.tankBody.applyForce(tractionForce, this.resolveTractionApplyPoint(center, steeringMode));
    }

    this.applyWheelVisualSpin(forwardWorld, this.smoothedTurnAxis, dt);
    this.updateTrackTreadDust(forwardWorld);
    this.updateTrackUvScroll(dt);
    this.syncTankMovementSounds();
  }

  /** Fumée / gravillons : arrière en avance, avant en recul (vitesse selon l'axe marche). */
  private updateTrackTreadDust(forwardWorld: Vector3): void {
    if (!this.trackTreadParticles && !this.trackTreadParticlesReverse) {
      return;
    }
    const v = this.tankBody.getLinearVelocity();
    const vForward = Vector3.Dot(v, forwardWorld);
    const minSpeed = 0.12;
    // Traction avant = vitesse négative selon +forwardWorld (repère châssis / input inversé).
    const movingForward = this.battery > 0 && vForward < -minSpeed;
    const movingReverse = this.battery > 0 && vForward > minSpeed;
    this.trackTreadParticles?.setAdvancing(movingForward);
    this.trackTreadParticlesReverse?.setAdvancing(movingReverse);
  }

  private updateTrackUvScroll(dt: number): void {
    if (this.trackUvScrollers.length === 0 || dt <= 0) {
      return;
    }

    const speed = Math.max(this.tracksConfig.treadUvScrollSpeed ?? 2, 0);
    if (speed <= 0) {
      return;
    }

    const forwardUvAxis = -this.smoothedMoveAxis * this.movementInputSign;
    const turnUvAxis = this.smoothedTurnAxis;
    const leftDelta = (forwardUvAxis + turnUvAxis) * speed * dt;
    const rightDelta = (forwardUvAxis - turnUvAxis) * speed * dt;

    for (const scroller of this.trackUvScrollers) {
      const name = scroller.mesh.name.toLowerCase();
      const delta = name.endsWith("_l") ? leftDelta : rightDelta;
      for (const texture of scroller.textures) {
        texture.vOffset = wrapUnit(texture.vOffset + delta);
      }
    }
  }

  private triggerShellShotCameraShake(): void {
    const duration = Math.max(this.config.camera.shellShotShakeDurationSeconds ?? 0.12, 0);
    const amplitude = Math.max(this.config.camera.shellShotShakeAmplitude ?? 0.06, 0);
    if (duration <= 0 || amplitude <= 0) {
      return;
    }

    this.cameraShakeDuration = duration;
    this.cameraShakeTimeRemaining = duration;
    this.cameraShakeSeed = Math.random() * Math.PI * 2;
  }

  private getCameraShakeOffset(camera: TargetCamera): Vector3 | null {
    if (this.cameraShakeTimeRemaining <= 0 || this.cameraShakeDuration <= 0) {
      return null;
    }

    const amplitude = Math.max(this.config.camera.shellShotShakeAmplitude ?? 0.06, 0);
    if (amplitude <= 0) {
      return null;
    }

    const remainingRatio = clamp(this.cameraShakeTimeRemaining / this.cameraShakeDuration, 0, 1);
    const strength = remainingRatio * remainingRatio;
    const progress = 1 - remainingRatio;
    const forward = camera.getForwardRay(1).direction;
    let right = Vector3.Cross(Axis.Y, forward);
    if (right.lengthSquared() > 1e-6) {
      right.normalize();
    } else {
      right = Axis.X.clone();
    }

    const horizontal = Math.sin(this.cameraShakeSeed + progress * 78) * amplitude * strength;
    const vertical = Math.sin(this.cameraShakeSeed * 1.37 + progress * 113) * amplitude * 0.65 * strength;
    return right.scale(horizontal).add(Axis.Y.scale(vertical));
  }

  private applyCameraShake(camera: TargetCamera, target: Vector3): void {
    const offset = this.getCameraShakeOffset(camera);
    if (!offset) {
      return;
    }

    camera.position.addInPlace(offset);
    camera.setTarget(target);
  }

  /**
   * Tangage visuel de caisse : cabrage en accélération, assiette plate à vitesse
   * stabilisée, plongée au ralentissement. En mode voiture on se base sur
   * l'accélération longitudinale mesurée (et non sur la vitesse de variation de
   * l'input) pour que l'assiette redevienne plate dès que la vitesse se stabilise,
   * même manette à fond.
   */
  private updateDrivePitchTarget(
    dt: number,
    canMove: boolean,
    grounded: boolean,
    forwardWorld: Vector3
  ): void {
    const g = this.config.grounding;
    const maxRad = toRadians(g.drivePitchMaxDeg ?? 3.5);
    const driveForward = forwardWorld.scale(
      this.movementInputSign * this.config.rig.movementForwardSign
    );
    const forwardSpeed = Vector3.Dot(this.tankBody.getLinearVelocity(), driveForward);
    const rawAccel = (forwardSpeed - this.prevForwardSpeed) / Math.max(dt, 1e-6);
    this.prevForwardSpeed = forwardSpeed;

    const moveRate = (this.smoothedMoveAxis - this.prevSmoothedMoveAxis) / Math.max(dt, 1e-6);
    this.prevSmoothedMoveAxis = this.smoothedMoveAxis;

    if (!canMove) {
      this.forwardAccelSmoothed = 0;
      this.hullDrivePitchTarget = 0;
      return;
    }

    if ((this.config.movement.steeringMode ?? "tank") === "car") {
      if (!grounded) {
        // En vol l'assiette est pilotée par l'inclinaison de suspension seule.
        this.forwardAccelSmoothed = 0;
        this.hullDrivePitchTarget = 0;
        return;
      }
      const accelSmooth = 1 - Math.exp(-(g.drivePitchAccelSharpness ?? 9) * dt);
      this.forwardAccelSmoothed += (rawAccel - this.forwardAccelSmoothed) * accelSmooth;
      // `movementInputSign` ramène l'accélération dans l'espace de l'axe d'input,
      // référentiel dans lequel le signe du tangage du rig est calibré.
      const axisAccel = -this.movementInputSign * this.forwardAccelSmoothed;
      const accelScale = g.drivePitchAccelScale ?? 0.08;
      this.hullDrivePitchTarget = clamp(axisAccel * accelScale, -1, 1) * maxRad;
      return;
    }

    this.forwardAccelSmoothed = 0;
    const scale = g.drivePitchInputRateScale ?? 0.4;
    this.hullDrivePitchTarget = clamp(-moveRate * scale, -1, 1) * maxRad;
  }

  /**
   * L'origine du châssis est située au-dessus du centre de masse : y appliquer la
   * traction génère un couple qui fait plonger l'avant durant toute la phase
   * d'accélération. En mode voiture on repasse donc par le centre de masse.
   */
  private resolveTractionApplyPoint(
    objectCenterWorld: Vector3,
    steeringMode: "tank" | "car" | "plane"
  ): Vector3 {
    if (steeringMode !== "car") {
      return objectCenterWorld;
    }
    const offsetY =
      this.config.physics.tankCenterOfMassYOffset +
      (this.config.movement.carTractionApplyOffsetY ?? 0);
    if (Math.abs(offsetY) < 1e-6) {
      return objectCenterWorld;
    }
    return objectCenterWorld.add(this.tankAnchor.up.scale(offsetY));
  }

  private applySuspension(): void {
    const engine = this.scene.getPhysicsEngine();
    if (!engine) {
      return;
    }

    const center = this.tankBody.getObjectCenterWorld();
    const linearVel = this.tankBody.getLinearVelocity();
    const angularVel = this.tankBody.getAngularVelocity();

    const rayStartHeight = this.config.suspension.rayStartHeight;
    const rayLength = this.config.suspension.rayLength;
    const restLength = this.config.suspension.restLength;
    const contactOffset = getSuspensionContactOffset(this.config);
    const effectiveRestLength = restLength + contactOffset;
    const k = this.config.suspension.springStrength;
    const c = this.config.suspension.damperStrength;
    const maxForce = this.config.suspension.maxForce;
    const groundContactTolerance = this.config.suspension.groundContactTolerance ?? 0.12;
    const springForcesEnabled = this.config.suspension.springForcesEnabled === true;

    let contactCount = 0;
    this.suspensionCompressions.fill(0);
    for (let probeIndex = 0; probeIndex < this.suspensionPointsLocal.length; probeIndex++) {
      const localPoint = this.suspensionPointsLocal[probeIndex];
      const q = this.tankAnchor.absoluteRotationQuaternion ?? this.tankAnchor.rotationQuaternion ?? Quaternion.Identity();
      const worldPoint = this.tankAnchor.getAbsolutePosition().add(localPoint.clone().applyRotationQuaternion(q));

      const from = worldPoint.add(Axis.Y.scale(rayStartHeight));
      const to = from.add(Axis.Y.scale(-rayLength));
      const hit = engine.raycast(from, to, {
        ignoreBody: this.tankBody,
        shouldHitTriggers: false,
        collideWith: 0xffffffff
      });

      if (!hit.hasHit) {
        continue;
      }

      hit.calculateHitDistance();
      let distance = hit.hitDistance;
      // Defensive: some physics plugins can yield undefined/NaN hitDistance.
      // In that case, derive distance from the hit point.
      if (!Number.isFinite(distance)) {
        if (hit.hitPointWorld) {
          distance = Vector3.Distance(from, hit.hitPointWorld);
        } else {
          continue;
        }
      }
      // `distance` starts `rayStartHeight` above the probe, so remove it to get the probe's height.
      const probeHeightAboveGround = distance - rayStartHeight;
      if (probeHeightAboveGround <= effectiveRestLength + groundContactTolerance) {
        contactCount++;
      }

      const compression = clamp(effectiveRestLength - probeHeightAboveGround, 0, effectiveRestLength);
      this.suspensionCompressions[probeIndex] = compression;

      if (!springForcesEnabled || compression <= 0) {
        continue;
      }

      const r = hit.hitPointWorld.subtract(center);
      const pointVel = linearVel.add(Vector3.Cross(angularVel, r));
      const velAlongUp = Vector3.Dot(pointVel, Axis.Y);

      const reboundScale = clamp(this.config.suspension.reboundDampingScale ?? 1, 0.35, 1);
      const compressionScale = clamp(this.config.suspension.compressionDampingScale ?? 1, 0.2, 1);
      const damper = velAlongUp > 0 ? c * reboundScale : c * compressionScale;
      let forceMag = k * compression - damper * velAlongUp;
      forceMag = clamp(forceMag, 0, maxForce);

      if (forceMag <= 1e-4) {
        continue;
      }

      this.tankBody.applyForce(Axis.Y.scale(forceMag), hit.hitPointWorld);
    }

    this.suspensionContactCount = contactCount;
  }

  /** Réduit l'amortissement en vol pour conserver l'inertie après une rampe ou un saut. */
  private syncPhysicsDamping(grounded: boolean): void {
    const physics = this.config.physics;
    if (grounded) {
      this.tankBody.setLinearDamping(physics.tankLinearDamping);
      this.tankBody.setAngularDamping(physics.tankAngularDamping);
      return;
    }

    this.tankBody.setLinearDamping(physics.airborneLinearDamping ?? physics.tankLinearDamping);
    this.tankBody.setAngularDamping(physics.airborneAngularDamping ?? physics.tankAngularDamping);
  }

  /** Rebond vertical à la réception d’un saut : impulsion vers le haut selon la vitesse de chute. */
  private applyLandingBounce(fallSpeed: number): void {
    const restitution = this.config.suspension.landingBounceRestitution ?? 0;
    if (restitution <= 0) {
      return;
    }

    const minAirSeconds = this.config.suspension.landingBounceMinAirSeconds ?? 0.12;
    if (this.airborneSeconds < minAirSeconds) {
      return;
    }

    const minSpeed = this.config.suspension.landingBounceMinSpeed ?? 1.2;
    if (fallSpeed < minSpeed) {
      return;
    }

    const maxSpeed = this.config.suspension.landingBounceMaxSpeed ?? 9;
    const impactSpeed = Math.min(fallSpeed, maxSpeed);
    const impulse = this.config.physics.tankMass * impactSpeed * restitution;
    this.tankBody.applyImpulse(Axis.Y.scale(impulse), this.tankBody.getObjectCenterWorld());
  }

  private applyCamera(zoomHeld: boolean, dt: number): void {
    this.zoomActive = zoomHeld;
    const orbitCam = this.tankCamera ?? null;
    const zoomCam = this.tankZoomCamera ?? null;

    // Prefer camera switching if the zoom camera exists; otherwise fall back to FOV zoom.
    const nextActive =
      zoomHeld && zoomCam ? zoomCam : orbitCam ?? (this.scene.activeCamera as TargetCamera | null);
    if (nextActive && this.scene.activeCamera !== nextActive) {
      this.scene.activeCamera = nextActive;
    }

    // If we're in the alternative view, make it FOLLOW the orbit camera orientation.
    // This keeps the view consistent while preserving gameplay aiming based on orbit camera.
    if (zoomHeld && zoomCam && orbitCam) {
      orbitCam.computeWorldMatrix();

      // Position zoom camera near the muzzle, with a consistent "left + up + slight back" offset
      // in the cannon's forward frame (world-space). This avoids bone axis surprises.
      if (this.muzzleCannonNode) {
        // `MUZZLE_canon_tank` is parented under the cannon bone, so it inherits the recoil translation.
        // For the zoom camera, we want the cannon recoil to NOT pull the camera inside the tank.
        // Cancel the recoil by subtracting the recoil offset along the cannon's local recoil axis (local +Y here).
        const muzzlePosRaw = this.muzzleCannonNode.getAbsolutePosition();
        let muzzlePos = muzzlePosRaw.clone();
        if (this.cannonRecoilOffsetY !== 0 && this.cannonControl.transformNode) {
          const recoilWorldAxis = this.cannonControl.transformNode.getDirection(Axis.Y);
          if (recoilWorldAxis.lengthSquared() > 1e-8) {
            recoilWorldAxis.normalize();
            muzzlePos = muzzlePos.subtract(recoilWorldAxis.scale(this.cannonRecoilOffsetY));
          }
        }
        const forward = this.muzzleCannonNode
          .getDirection(this.movementForwardAxis)
          .scale(-this.config.rig.movementForwardSign);
        if (forward.lengthSquared() > 1e-6) {
          forward.normalize();
        } else {
          forward.copyFrom(Axis.Z);
        }

        const right = Vector3.Cross(Axis.Y, forward);
        if (right.lengthSquared() > 1e-6) {
          right.normalize();
        } else {
          right.copyFrom(Axis.X);
        }

        const leftOffset = 0.12;
        const upOffset = 0;
        const backOffset = -0.95;
        const desiredPos = muzzlePos
          .add(right.scale(leftOffset))
          .add(Axis.Y.scale(upOffset))
          .add(forward.scale(backOffset));

        if (this.debugLogZoomCamOnNextShellShot) {
          const cannonWorldPos = this.cannonControl.transformNode
            ? this.cannonControl.transformNode.getAbsolutePosition()
            : this.cannonControl.bone
              ? this.cannonControl.bone.getAbsolutePosition(this.tankAnchor)
              : null;
          console.log("[ZoomCam][before]", {
            zoomCamPos: zoomCam.position.asArray(),
            cannonWorldPos: cannonWorldPos?.asArray() ?? null,
            zoomMinusCannon: cannonWorldPos ? zoomCam.position.subtract(cannonWorldPos).asArray() : null,
            muzzlePosRaw: muzzlePosRaw.asArray(),
            muzzlePosNoRecoil: muzzlePos.asArray(),
            recoilOffsetY: this.cannonRecoilOffsetY,
            desiredPos: desiredPos.asArray()
          });
        }

        if (this.zoomCamFreezeSeconds <= 0) {
          zoomCam.position.copyFrom(desiredPos);
        }
        // Keep aiming consistent even if position is frozen.
        const from = zoomCam.globalPosition ?? zoomCam.position;
        const target = from.add(forward.scale(1000));
        zoomCam.setTarget(target);
        this.applyCameraShake(zoomCam, target);

        if (this.debugLogZoomCamOnNextShellShot) {
          const cannonWorldPos = this.cannonControl.transformNode
            ? this.cannonControl.transformNode.getAbsolutePosition()
            : this.cannonControl.bone
              ? this.cannonControl.bone.getAbsolutePosition(this.tankAnchor)
              : null;
          console.log("[ZoomCam][after]", {
            zoomCamPos: zoomCam.position.asArray(),
            cannonWorldPos: cannonWorldPos?.asArray() ?? null,
            zoomMinusCannon: cannonWorldPos ? zoomCam.position.subtract(cannonWorldPos).asArray() : null
          });
          this.debugLogZoomCamOnNextShellShot = false;
        }
      } else {
        // Fallback: keep using orbit forward vector.
        const forward = orbitCam.getForwardRay(1).direction;
        const from = zoomCam.globalPosition ?? zoomCam.position;
        const target = from.add(forward.scale(1000));
        zoomCam.setTarget(target);
        this.applyCameraShake(zoomCam, target);
      }
    } else if (orbitCam) {
      const target = this.cameraPivotNode?.getAbsolutePosition() ?? orbitCam.getTarget();
      this.applyCameraShake(orbitCam, target);
    }

    const boostMultiplier = this.boostActive ? this.config.camera.boostFovMultiplier : 1;
    const orbitFov = toRadians(this.config.camera.defaultFovDeg) * boostMultiplier;
    const zoomFov = toRadians(this.config.camera.zoomViewFovDeg) * boostMultiplier;

    if (orbitCam) {
      orbitCam.fov = orbitFov;
    }
    if (zoomCam) {
      zoomCam.fov = zoomFov;
    } else if (zoomHeld && orbitCam) {
      // No zoom camera: keep old behavior as fallback.
      orbitCam.fov = zoomFov;
    }

    if (this.cameraShakeTimeRemaining > 0) {
      this.cameraShakeTimeRemaining = Math.max(this.cameraShakeTimeRemaining - dt, 0);
    }
  }

  private initOrbitCameraState(): void {
    if (!this.tankCamera || !this.cameraPivotNode) {
      return;
    }

    const pivotWorld = this.cameraPivotNode.getAbsolutePosition();
    const camWorld = this.tankCamera.globalPosition ?? this.tankCamera.position;
    const offset = camWorld.subtract(pivotWorld);
    const horizLen = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
    const radius = Math.max(offset.length(), 0.001);

    this.orbitYawRad = Math.atan2(offset.x, offset.z);
    this.orbitPitchRad = Math.atan2(offset.y, Math.max(horizLen, 0.001));
    this.orbitRadius = radius;
  }

  private applyOrbitCamera(lookDeltaX: number, lookDeltaY: number): void {
    if (!this.tankCamera || !this.cameraPivotNode) {
      return;
    }

    // Mouse deltas are in pixels; config is degrees per pixel.
    this.orbitYawRad +=
      toRadians(
        lookDeltaX * this.config.camera.orbitYawDegPerPixel * this.config.camera.orbitYawSign
      );
    this.orbitPitchRad +=
      toRadians(
        lookDeltaY * this.config.camera.orbitPitchDegPerPixel * this.config.camera.orbitPitchSign
      );

    const minPitch = toRadians(this.config.camera.orbitMinPitchDeg);
    const maxPitch = toRadians(this.config.camera.orbitMaxPitchDeg);
    this.orbitPitchRad = clamp(this.orbitPitchRad, minPitch, maxPitch);

    if (this.config.camera.orbitClampRadius) {
      this.orbitRadius = clamp(
        this.orbitRadius,
        this.config.camera.orbitMinRadius,
        this.config.camera.orbitMaxRadius
      );
    }

    const pivotWorld = this.cameraPivotNode.getAbsolutePosition();
    const cosPitch = Math.cos(this.orbitPitchRad);
    const sinPitch = Math.sin(this.orbitPitchRad);
    const sinYaw = Math.sin(this.orbitYawRad);
    const cosYaw = Math.cos(this.orbitYawRad);

    const offset = new Vector3(
      sinYaw * cosPitch * this.orbitRadius,
      sinPitch * this.orbitRadius,
      cosYaw * cosPitch * this.orbitRadius
    );

    const desiredPos = pivotWorld.add(offset);
    let finalPos = desiredPos;

    if (this.config.camera.orbitCollisionEnabled) {
      const toDesired = desiredPos.subtract(pivotWorld);
      const dist = toDesired.length();
      if (dist > 1e-4) {
        const dir = toDesired.scale(1 / dist);
        const ray = new Ray(pivotWorld, dir, dist);
        const hit = this.scene.pickWithRay(ray, (mesh) => {
          const n = mesh.name;
          // Block camera against world geometry only (not tank/UI).
          return (
            n.startsWith("SM_") ||
            n.startsWith("DM_") ||
            n.toLowerCase().includes("ground") ||
            n.startsWith("COL_")
          );
        });

        if (hit?.hit && typeof hit.distance === "number") {
          const pad = Math.max(this.config.camera.orbitCollisionPadding, 0);
          const clampedDist = Math.max(hit.distance - pad, 0.05);
          finalPos = pivotWorld.add(dir.scale(clampedDist));
        }
      }
    }

    this.tankCamera.position.copyFrom(finalPos);
    this.tankCamera.setTarget(pivotWorld);
  }

  private initWheelAnchorLocalPositions(): void {
    const entries: Array<[TrackNodeKey, TransformNode | AbstractMesh | null]> = [
      ["fl", this.suspensionNodes.fl],
      ["fr", this.suspensionNodes.fr],
      ["ml", this.suspensionNodes.ml],
      ["mr", this.suspensionNodes.mr],
      ["rl", this.suspensionNodes.rl],
      ["rr", this.suspensionNodes.rr]
    ];
    for (const [key, node] of entries) {
      if (node) {
        this.wheelAnchorLocal.set(key, toAnchorLocalPosition(node, this.tankAnchor));
      }
    }
  }

  /** Compression normalisée 0–1 au point d’ancrage (même raycast que la suspension physique). */
  private sampleWheelCompression(anchorLocal: Vector3): number {
    const engine = this.scene.getPhysicsEngine();
    if (!engine) {
      return 0;
    }

    const restLength = this.config.suspension.restLength;
    const contactOffset = getSuspensionContactOffset(this.config);
    const effectiveRestLength = restLength + contactOffset;
    if (restLength <= 1e-6) {
      return 0;
    }

    const q =
      this.tankAnchor.absoluteRotationQuaternion ??
      this.tankAnchor.rotationQuaternion ??
      Quaternion.Identity();
    const worldPoint = this.tankAnchor
      .getAbsolutePosition()
      .add(anchorLocal.clone().applyRotationQuaternion(q));

    const rayStartHeight = this.config.suspension.rayStartHeight;
    const rayLength = this.config.suspension.rayLength;
    const from = worldPoint.add(Axis.Y.scale(rayStartHeight));
    const to = from.add(Axis.Y.scale(-rayLength));
    const hit = engine.raycast(from, to, {
      ignoreBody: this.tankBody,
      shouldHitTriggers: false,
      collideWith: 0xffffffff
    });

    if (!hit.hasHit) {
      return 0;
    }

    hit.calculateHitDistance();
    let distance = hit.hitDistance;
    if (!Number.isFinite(distance)) {
      if (!hit.hitPointWorld) {
        return 0;
      }
      distance = Vector3.Distance(from, hit.hitPointWorld);
    }

    const compression = clamp(effectiveRestLength - distance, 0, effectiveRestLength);
    return compression / effectiveRestLength;
  }

  private averageCompression(keys: TrackNodeKey[]): number {
    let sum = 0;
    let count = 0;
    for (const key of keys) {
      const local = this.wheelAnchorLocal.get(key);
      if (!local) {
        continue;
      }
      sum += this.sampleWheelCompression(local);
      count++;
    }
    return count > 0 ? sum / count : 0;
  }

  private applyTrackSuspensionVisual(dt: number): void {
    const vis = this.tracksConfig.suspensionVisual;
    if (!vis?.enabled || dt <= 0) {
      return;
    }

    const stiffness = vis.springStiffness ?? (vis.smoothness ?? 14) * 17;
    const bounceDamping =
      vis.springBounceDamping ?? vis.springDamping ?? (vis.smoothness ?? 14) * 0.68;
    const dropDamping =
      vis.springDropDamping ?? Math.max(bounceDamping * 1.6, 2 * Math.sqrt(stiffness));

    const compFl = this.wheelAnchorLocal.has("fl") ? this.sampleWheelCompression(this.wheelAnchorLocal.get("fl")!) : 0;
    const compFr = this.wheelAnchorLocal.has("fr") ? this.sampleWheelCompression(this.wheelAnchorLocal.get("fr")!) : 0;
    const compRl = this.wheelAnchorLocal.has("rl") ? this.sampleWheelCompression(this.wheelAnchorLocal.get("rl")!) : 0;
    const compRr = this.wheelAnchorLocal.has("rr") ? this.sampleWheelCompression(this.wheelAnchorLocal.get("rr")!) : 0;

    const leftAvg = this.averageCompression(["fl", "ml", "rl"]);
    const rightAvg = this.averageCompression(["fr", "mr", "rr"]);
    const frontAvg = (compFl + compFr) * 0.5;
    const rearAvg = (compRl + compRr) * 0.5;

    const targetLeftDrop = leftAvg * vis.maxDropMeters;
    const targetRightDrop = rightAvg * vis.maxDropMeters;
    const targetLeftPitch = toRadians((compFl - compRl) * vis.maxTrackPitchDeg);
    const targetRightPitch = toRadians((compFr - compRr) * vis.maxTrackPitchDeg);
    const targetHullPitch = toRadians((frontAvg - rearAvg) * vis.maxHullPitchDeg);
    const targetHullRoll = toRadians((leftAvg - rightAvg) * vis.maxHullRollDeg);

    stepSpringScalar(this.trackLeftDropSpring, targetLeftDrop, dt, stiffness, dropDamping);
    stepSpringScalar(this.trackRightDropSpring, targetRightDrop, dt, stiffness, dropDamping);
    clampSpringScalar(this.trackLeftDropSpring, 0, vis.maxDropMeters);
    clampSpringScalar(this.trackRightDropSpring, 0, vis.maxDropMeters);

    const maxTrackPitch = toRadians(vis.maxTrackPitchDeg);
    const maxHullPitch = toRadians(vis.maxHullPitchDeg);
    const maxHullRoll = toRadians(vis.maxHullRollDeg);

    stepSpringScalar(this.trackLeftPitchSpring, targetLeftPitch, dt, stiffness, bounceDamping);
    stepSpringScalar(this.trackRightPitchSpring, targetRightPitch, dt, stiffness, bounceDamping);
    stepSpringScalar(this.hullSuspensionPitchSpring, targetHullPitch, dt, stiffness, bounceDamping);
    stepSpringScalar(this.hullSuspensionRollSpring, targetHullRoll, dt, stiffness, bounceDamping);
    clampSpringScalar(this.trackLeftPitchSpring, -maxTrackPitch, maxTrackPitch);
    clampSpringScalar(this.trackRightPitchSpring, -maxTrackPitch, maxTrackPitch);
    clampSpringScalar(this.hullSuspensionPitchSpring, -maxHullPitch, maxHullPitch);
    clampSpringScalar(this.hullSuspensionRollSpring, -maxHullRoll, maxHullRoll);

    const bodyBobMax = vis.maxBodyBobMeters ?? 0;
    if (bodyBobMax > 1e-6) {
      const avgCompression = (leftAvg + rightAvg) * 0.5;
      stepSpringScalar(this.bodyBobSpring, -avgCompression * bodyBobMax, dt, stiffness, dropDamping);
      clampSpringScalar(this.bodyBobSpring, -bodyBobMax, bodyBobMax);
    } else {
      this.bodyBobSpring.value = 0;
      this.bodyBobSpring.velocity = 0;
    }

    if (this.trackLeftControl.bone || this.trackLeftControl.transformNode) {
      const pos = this.trackLeftBaseLocalPosition.clone();
      pos.y -= clamp(this.trackLeftDropSpring.value, 0, vis.maxDropMeters);
      setControlLocalPosition(this.trackLeftControl, pos);
      setControlAxisAngle(
        this.trackLeftControl,
        this.trackLeftBaseLocalRotation,
        this.cannonPitchAxis,
        this.trackLeftPitchSpring.value,
        this.tankAnchor
      );
    }

    if (this.trackRightControl.bone || this.trackRightControl.transformNode) {
      const pos = this.trackRightBaseLocalPosition.clone();
      pos.y -= clamp(this.trackRightDropSpring.value, 0, vis.maxDropMeters);
      setControlLocalPosition(this.trackRightControl, pos);
      setControlAxisAngle(
        this.trackRightControl,
        this.trackRightBaseLocalRotation,
        this.cannonPitchAxis,
        this.trackRightPitchSpring.value,
        this.tankAnchor
      );
    }
  }

  private applyVisualSmoothing(dt: number): void {
    if (!this.tankVisualRoot || !this.tankAnchor.absoluteRotationQuaternion) {
      return;
    }

    const hullRs = this.config.cannon.hullRecoilReturnSpeed;
    this.hullRecoilPitch = moveTowards(this.hullRecoilPitch, 0, hullRs * dt);
    this.hullRecoilRoll = moveTowards(this.hullRecoilRoll, 0, hullRs * dt);
    this.hullRecoilPitch += this.pendingHullRecoilPitch;
    this.hullRecoilRoll += this.pendingHullRecoilRoll;
    this.pendingHullRecoilPitch = 0;
    this.pendingHullRecoilRoll = 0;

    this.applyTrackSuspensionVisual(dt);

    const driveSharp = this.config.grounding.drivePitchSharpness ?? this.config.grounding.visualTiltSharpness;
    const driveSmooth = 1 - Math.exp(-driveSharp * dt);
    this.hullDrivePitchSmoothed += (this.hullDrivePitchTarget - this.hullDrivePitchSmoothed) * driveSmooth;

    const hullPitch =
      this.hullRecoilPitch + this.hullSuspensionPitchSpring.value + this.hullDrivePitchSmoothed;
    const hullRoll = this.hullRecoilRoll + this.hullSuspensionRollSpring.value;
    if (this.caisseControl.bone || this.caisseControl.transformNode) {
      const hullRot = this.caisseBaseLocalRotation.multiply(
        Quaternion.RotationYawPitchRoll(0, hullPitch, hullRoll)
      );
      setControlLocalRotation(this.caisseControl, hullRot, this.tankAnchor);
    } else {
      this.tankVisualRoot.rotationQuaternion ??= Quaternion.Identity();
      this.tankVisualRoot.rotationQuaternion.copyFrom(
        Quaternion.RotationYawPitchRoll(0, hullPitch, hullRoll)
      );
    }

    this.tankVisualRoot.rotationQuaternion ??= Quaternion.Identity();
    this.tankVisualRoot.rotationQuaternion.copyFrom(Quaternion.Identity());

    const positionLerp = 1 - Math.exp(-this.config.grounding.positionSharpness * dt);
    const nextLocalPosition = Vector3.Lerp(this.tankVisualRoot.position, Vector3.Zero(), positionLerp);
    nextLocalPosition.y += this.bodyBobSpring.value;
    this.tankVisualRoot.position.copyFrom(nextLocalPosition);
  }

  /**
   * Incline le visuel du hull : le côté opposé à la direction de tir (plan horizontal) s’enfonce.
   * `worldForward` = direction du tir (monde), même logique que le projectile.
   */
  private applyHullRecoilImpulseFromWorldForward(worldForward: Vector3): void {
    if (!this.tankVisualRoot && !this.caisseControl.bone && !this.caisseControl.transformNode) {
      return;
    }

    const horiz = worldForward.clone();
    horiz.y = 0;
    if (horiz.lengthSquared() < 1e-8) {
      return;
    }
    horiz.normalize();

    const inv = this.tankAnchor.getWorldMatrix().clone().invert();
    const dir = Vector3.TransformNormal(horiz, inv);
    dir.y = 0;
    if (dir.lengthSquared() < 1e-8) {
      return;
    }
    dir.normalize();

    const K = toRadians(this.config.cannon.hullRecoilKickDeg) * this.config.cannon.hullRecoilSign;
    // Espace local du hull (X droite, Y haut, Z avant typique) : pitch (X) / roll (Z) pondérés par la direction horizontale du tir.
    this.pendingHullRecoilPitch += -K * dir.z;
    this.pendingHullRecoilRoll += K * dir.x;
  }

}

interface SpringScalarState {
  value: number;
  velocity: number;
}

type TrackNodeKey = "fl" | "fr" | "ml" | "mr" | "rl" | "rr";

interface TrackSegment {
  mesh: BabylonMesh;
  age: number;
}

class TrackSegmentSystem {
  private readonly scene: Scene;
  private readonly tracksConfig: NonNullable<TankControllerConfig["tracks"]>;
  private readonly tankBody: PhysicsBody;
  private readonly material: Material;
  private readonly nodes: NonNullable<TankGameplayControllerOptions["suspensionNodes"]>;
  private readonly ignoreMeshIds: ReadonlySet<number>;

  private readonly segmentsByNode = new Map<TrackNodeKey, TrackSegment[]>();
  private readonly lastSpawnByNode = new Map<TrackNodeKey, Vector3>();
  private readonly baseSegmentMesh: BabylonMesh;

  public constructor(args: {
    scene: Scene;
    material: Material;
    tracksConfig: NonNullable<TankControllerConfig["tracks"]>;
    tankBody: PhysicsBody;
    nodes: NonNullable<TankGameplayControllerOptions["suspensionNodes"]>;
    ignoreMeshIds: ReadonlySet<number>;
  }) {
    this.scene = args.scene;
    this.material = args.material;
    this.tracksConfig = args.tracksConfig;
    this.tankBody = args.tankBody;
    this.nodes = args.nodes;
    this.ignoreMeshIds = args.ignoreMeshIds;

    const keys: TrackNodeKey[] = ["fl", "fr", "ml", "mr", "rl", "rr"];
    for (const k of keys) {
      this.segmentsByNode.set(k, []);
    }

    // Apply optional opacity multiplier if the material supports it,
    // without overwriting materials that don't use `alpha`.
    const opacityMul = clamp(this.tracksConfig.opacityMultiplier, 0, 1);
    if (Math.abs(opacityMul - 1) > 1e-6) {
      const anyMat = this.material as unknown as { alpha?: number };
      if (typeof anyMat.alpha === "number") {
        anyMat.alpha = clamp(anyMat.alpha * opacityMul, 0, 1);
      }
    }

    // Texture tiling for the track segments material (diffuse/albedo).
    const u = Math.max(this.tracksConfig.uvRepeatU ?? 1, 0.001);
    const v = Math.max(this.tracksConfig.uvRepeatV ?? 1, 0.001);
    const any = this.material as unknown as {
      diffuseTexture?: unknown;
      albedoTexture?: unknown;
      baseTexture?: unknown;
    };
    const tex =
      (any.diffuseTexture as unknown) ||
      (any.albedoTexture as unknown) ||
      (any.baseTexture as unknown) ||
      null;
    if (tex && tex instanceof Texture) {
      tex.wrapU = Texture.WRAP_ADDRESSMODE;
      tex.wrapV = Texture.WRAP_ADDRESSMODE;
      tex.uScale = u;
      tex.vScale = v;
    } else if (tex && typeof tex === "object") {
      // Fallback for texture-like objects.
      const t = tex as { uScale?: number; vScale?: number; wrapU?: number; wrapV?: number };
      if (typeof t.uScale === "number") t.uScale = u;
      if (typeof t.vScale === "number") t.vScale = v;
      if (typeof t.wrapU === "number") t.wrapU = Texture.WRAP_ADDRESSMODE;
      if (typeof t.wrapV === "number") t.wrapV = Texture.WRAP_ADDRESSMODE;
    }

    // Base mesh for instances
    this.baseSegmentMesh = MeshBuilder.CreatePlane(
      "tracks_segment_base",
      { width: 1, height: 1, sideOrientation: BabylonMesh.DOUBLESIDE },
      this.scene
    );
    this.baseSegmentMesh.isVisible = false;
    this.baseSegmentMesh.isPickable = false;
    this.baseSegmentMesh.material = this.material;
  }

  public update(dt: number): void {
    if (!this.tracksConfig.enabled) {
      return;
    }

    // Spawn segments only from the middle suspension points (less noisy visually).
    const keys: TrackNodeKey[] = ["ml", "mr"];
    for (const k of keys) {
      const node = this.nodes[k];
      if (!node) continue;
      this.sampleAndSpawnSegment(k, node);
    }

    // Age and prune segments (simple TTL via max count; dt aging kept if later needed)
    for (const k of keys) {
      const segs = this.segmentsByNode.get(k);
      if (!segs) continue;
      for (const s of segs) {
        s.age += dt;
      }
      const maxSegs = Math.max(1, Math.floor(this.tracksConfig.maxPointsPerRibbon));
      while (segs.length > maxSegs) {
        const old = segs.shift();
        old?.mesh.dispose();
      }
    }
  }

  private sampleAndSpawnSegment(key: TrackNodeKey, node: TransformNode | AbstractMesh): void {
    const from = node.getAbsolutePosition().add(Axis.Y.scale(this.tracksConfig.raycastStartHeight));
    const to = from.add(Axis.Y.scale(-this.tracksConfig.raycastLength));
    const dir = to.subtract(from);
    const len = dir.length();
    if (len <= 1e-4) {
      return;
    }
    dir.scaleInPlace(1 / len);

    // Prefer physics raycast (doesn't depend on mesh.isPickable / render picking).
    let hitPoint: Vector3 | null = null;
    const engine = this.scene.getPhysicsEngine();
    if (engine) {
      const physicsHit = engine.raycast(from, to, {
        ignoreBody: this.tankBody,
        shouldHitTriggers: false,
        collideWith: 0xffffffff
      });
      if (physicsHit.hasHit) {
        // Some engines/plugins require this to populate distance fields reliably.
        physicsHit.calculateHitDistance();
        if (physicsHit.hitPointWorld) {
          hitPoint = physicsHit.hitPointWorld.clone();
        } else if (typeof physicsHit.hitDistance === "number") {
          hitPoint = from.add(dir.scale(physicsHit.hitDistance));
        }
      }
    } else {
      const ray = new Ray(from, dir, len);
      const pickHit = this.scene.pickWithRay(ray, (mesh) => {
        // Accept any world mesh, but never hit the tank itself.
        if (this.ignoreMeshIds.has(mesh.uniqueId)) {
          return false;
        }
        if (!mesh.isEnabled() || !mesh.isVisible) {
          return false;
        }
        return true;
      });
      if (pickHit?.hit && pickHit.pickedPoint) {
        hitPoint = pickHit.pickedPoint.clone();
      }
    }

    if (!hitPoint) {
      return;
    }

    const center = hitPoint.add(Axis.Y.scale(this.tracksConfig.yOffset));
    const last = this.lastSpawnByNode.get(key) ?? null;
    const spacing = Math.max(this.tracksConfig.spacing, 0.01);
    if (last && Vector3.DistanceSquared(last, center) < spacing * spacing) {
      return;
    }

    // Orientation: use the SUS_ node forward projected on ground plane.
    // Convention: use local +Z as forward for the empty.
    const forward = node.getDirection(Axis.Z);
    forward.y = 0;
    if (forward.lengthSquared() > 1e-6) {
      forward.normalize();
    } else {
      forward.copyFrom(Axis.Z);
    }

    // Spawn a segment plane centered at hit point.
    const inst = this.baseSegmentMesh.createInstance(`tracks_seg_${key}_${Date.now()}`);
    inst.isPickable = false;
    inst.alwaysSelectAsActiveMesh = false;
    inst.position.copyFrom(center);
    // Plane is created in XY; after `toGround` rotation, local Y maps to world Z (length).
    inst.scaling.set(this.tracksConfig.segmentWidth, this.tracksConfig.segmentLength, 1);
    // `CreatePlane` is vertical (XY). Rotate -90° around X to lay it on ground (XZ),
    // then apply yaw so the segment points in the SUS_ forward direction.
    const toGround = Quaternion.RotationAxis(Axis.X, -Math.PI / 2);
    const yaw = Quaternion.FromLookDirectionLH(forward, Axis.Y);
    inst.rotationQuaternion = yaw.multiply(toGround);

    const segs = this.segmentsByNode.get(key);
    segs?.push({ mesh: inst as unknown as BabylonMesh, age: 0 });
    this.lastSpawnByNode.set(key, center.clone());
  }
}

/** Associe `wheel_FL` à `SUS_FL` par suffixe de position (FL / FR / ML / MR / RL / RR). */
function findMatchingProbeIndex(wheelBoneName: string, probeNames: readonly string[]): number {
  const suffix = /_(FL|FR|ML|MR|RL|RR)$/i.exec(wheelBoneName)?.[1]?.toUpperCase();
  if (!suffix) {
    return -1;
  }

  return probeNames.findIndex((name) => name.toUpperCase().endsWith(`_${suffix}`));
}

function resolveBoneControl(container: AssetContainer, boneName: string): BoneControl {
  const bone =
    container.skeletons.flatMap((skeleton) => skeleton.bones).find((candidate) => candidate.name === boneName) ??
    null;

  return {
    bone,
    transformNode: bone?.getTransformNode() ?? null
  };
}

function getControlLocalRotation(control: BoneControl, tankAnchor: TransformNode): Quaternion {
  if (control.transformNode) {
    control.transformNode.rotationQuaternion ??= Quaternion.Identity();
    return control.transformNode.rotationQuaternion.clone();
  }

  if (control.bone) {
    return control.bone.getRotationQuaternion(Space.LOCAL, tankAnchor).clone();
  }

  return Quaternion.Identity();
}

function getControlLocalPosition(control: BoneControl): Vector3 {
  if (control.transformNode) {
    return control.transformNode.position.clone();
  }

  if (control.bone) {
    return control.bone.position.clone();
  }

  return Vector3.Zero();
}

function setControlLocalPosition(control: BoneControl, position: Vector3): void {
  if (control.transformNode) {
    control.transformNode.position.copyFrom(position);
    return;
  }

  if (control.bone) {
    control.bone.position.copyFrom(position);
  }
}

function setControlLocalRotation(
  control: BoneControl,
  rotation: Quaternion,
  tankAnchor: TransformNode
): void {
  if (control.transformNode) {
    control.transformNode.rotationQuaternion ??= Quaternion.Identity();
    control.transformNode.rotationQuaternion.copyFrom(rotation);
    return;
  }

  if (control.bone) {
    control.bone.setRotationQuaternion(rotation, Space.LOCAL, tankAnchor);
  }
}

function toAnchorLocalPosition(
  node: TransformNode | AbstractMesh,
  anchor: TransformNode
): Vector3 {
  node.computeWorldMatrix(true);
  const inv = anchor.getWorldMatrix().clone().invert();
  return Vector3.TransformCoordinates(node.getAbsolutePosition(), inv);
}

function setControlAxisAngle(
  control: BoneControl,
  baseLocalRotation: Quaternion,
  axis: Vector3,
  angleRad: number,
  tankAnchor: TransformNode
): void {
  const normAxis = axis.clone();
  if (normAxis.lengthSquared() > 1e-6) {
    normAxis.normalize();
  } else {
    normAxis.copyFrom(Axis.Y);
  }

  const q = Quaternion.RotationAxis(normAxis, angleRad);
  const local = baseLocalRotation.multiply(q);

  if (control.transformNode) {
    control.transformNode.rotationQuaternion ??= Quaternion.Identity();
    control.transformNode.rotationQuaternion.copyFrom(local);
    return;
  }

  if (control.bone) {
    control.bone.setRotationQuaternion(local, Space.LOCAL, tankAnchor);
  }
}

/** Ressort amorti (sous-amorti si damping trop bas → rebond visuel). */
function stepSpringScalar(
  state: SpringScalarState,
  target: number,
  dt: number,
  stiffness: number,
  damping: number
): void {
  if (dt <= 0) {
    return;
  }
  const accel = stiffness * (target - state.value) - damping * state.velocity;
  state.velocity += accel * dt;
  state.value += state.velocity * dt;
}

function clampSpringScalar(state: SpringScalarState, min: number, max: number): void {
  if (state.value < min) {
    state.value = min;
    if (state.velocity < 0) {
      state.velocity = 0;
    }
  } else if (state.value > max) {
    state.value = max;
    if (state.velocity > 0) {
      state.velocity = 0;
    }
  }
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

function shortestAngleDeltaDeg(current: number, target: number): number {
  return repeat(target - current + 180, 360) - 180;
}

function moveTowardsAngle(current: number, target: number, maxDelta: number): number {
  const delta = shortestAngleDeltaDeg(current, target);
  if (Math.abs(delta) <= maxDelta) {
    return current + delta;
  }

  return current + Math.sign(delta) * maxDelta;
}

function collectTankHighlightMeshes(container: AssetContainer): Mesh[] {
  const meshes: Mesh[] = [];
  for (const mesh of container.meshes) {
    if (!(mesh instanceof BabylonMesh)) {
      continue;
    }
    const name = mesh.name.trim().toLowerCase();
    if (name.startsWith("col_")) {
      continue;
    }
    meshes.push(mesh);
  }
  return meshes;
}

function repeat(value: number, length: number): number {
  return value - Math.floor(value / length) * length;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

function isScrollableTexture(value: unknown): value is ScrollableTexture {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { vOffset?: unknown }).vOffset === "number"
  );
}

function toRadians(valueInDegrees: number): number {
  return (valueInDegrees * Math.PI) / 180;
}

function axisFromConfig(axisName: "x" | "y" | "z", sign: 1 | -1): Vector3 {
  const axis =
    axisName === "x" ? Axis.X.clone() : axisName === "y" ? Axis.Y.clone() : Axis.Z.clone();

  return axis.scale(sign);
}
