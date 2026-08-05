import HavokPhysics from "@babylonjs/havok";
import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Physics/physicsEngineComponent";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import {
  PhysicsShapeBox,
  PhysicsShapeConvexHull,
  PhysicsShapeMesh,
  type PhysicsShape
} from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Scene } from "@babylonjs/core/scene";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TankControllerConfig } from "../config/tankController";
import { getSuspensionContactOffset } from "../config/tankController";
import { getVehicleConfig } from "../config/vehicleRegistry";
import { tankAssetUrl, armoredCarAssetUrl, fighterJetAssetUrl, skyboxAssetUrl, powerUpsAssetUrl, enemiesAssetUrl, vehicleTankIconUrl, vehicleArmoredCarIconUrl, vehicleFighterJetIconUrl } from "../assets/assetUrls";
import { enemiesConfig } from "../config/enemiesController";
import { EnemyTurretSystem } from "./EnemyTurretSystem";
import type { LevelDefinition } from "../app/levels";
import type { MenuMission, MissionVehicleSpawn } from "../ui/menuData";
import type { VehicleTypeId } from "./vehicle/VehicleController";
import { TankGameplayController } from "./TankGameplayController";
import { LevelManager } from "./level/LevelManager";
import { TankVehicleController } from "./vehicle/TankVehicleController";
import { PowerUpSystem } from "./PowerUpSystem";
import type { VehicleDebugState } from "./vehicle/VehicleController";
import { createTrackTreadParticleBundle } from "./trackTreadParticles";
import { getSceneGameplayUi } from "./sceneGameplayUi";
import { VehicleSelectorHud, type VehicleSelectorEntry } from "./VehicleSelectorHud";
import { TARGET_FRAME_SEC } from "./frameTiming";
import { StackPanel } from "@babylonjs/gui";
import { createTankDamageParticleBundle } from "./tankDamageParticles";
import { waitAnimationFrames } from "./frameTiming";
import type { RadarWorldBounds } from "./RadarHud";

export interface GameplaySceneSummary {
  spawnFound: boolean;
  tankCameraFound: boolean;
  terrainStaticMeshes: number;
  terrainDynamicMeshes: number;
  terrainColliderMeshes: number;
  tankBones: string[];
  enemyTurretsSpawned: number;
}

export interface GameplaySceneBundle {
  scene: Scene;
  levelManager: LevelManager;
  summary: GameplaySceneSummary;
  getDebugState: () => VehicleDebugState | null;
  setPaused: (paused: boolean) => void;
  dispose: () => void;
}

export type GameplayLoadingProgressCallback = (progress: number) => void;

interface SpawnedPlayerVehicle {
  controller: TankGameplayController;
  physics: TankPhysicsResource;
  container: AssetContainer;
  spawnFound: boolean;
  cameraFound: boolean;
}

function vehicleAssetUrl(type: VehicleTypeId): string {
  if (type === "armoredCar") {
    return armoredCarAssetUrl;
  }
  if (type === "fighterJet") {
    return fighterJetAssetUrl;
  }
  return tankAssetUrl;
}

function resolveVehicleSelectorIconUrl(type: VehicleTypeId): string | null {
  if (type === "tank") {
    return vehicleTankIconUrl;
  }
  if (type === "armoredCar") {
    return vehicleArmoredCarIconUrl;
  }
  if (type === "fighterJet") {
    return vehicleFighterJetIconUrl;
  }
  return null;
}

function buildVehicleSelectorEntries(vehicles: MissionVehicleSpawn[]): VehicleSelectorEntry[] {
  const entries: VehicleSelectorEntry[] = [];
  for (const vehicle of vehicles) {
    const iconUrl = resolveVehicleSelectorIconUrl(vehicle.type);
    if (!iconUrl) {
      continue;
    }
    entries.push({ id: vehicle.id, type: vehicle.type, iconUrl });
  }
  return entries;
}

interface PhysicsResourceGroup {
  bodies: PhysicsBody[];
  shapes: PhysicsShape[];
}

interface TankGroundingInfo {
  baseClearance: number;
  frontLeft: Vector3;
  frontRight: Vector3;
  rearLeft: Vector3;
  rearRight: Vector3;
}

interface TankSuspensionInfo {
  points: Vector3[];
}

interface TankPhysicsResource {
  body: PhysicsBody;
  shape: PhysicsShape;
  grounding: TankGroundingInfo;
}

export async function createGameplayScene(
  engine: Engine,
  level: LevelDefinition,
  mission: MenuMission | null,
  config: TankControllerConfig,
  canvas: HTMLCanvasElement,
  onProgress: GameplayLoadingProgressCallback = () => {},
  onPlayerDeath: () => void = () => {},
  radarMapUrl: string | null = null,
  radarWorldBoundsOverride: RadarWorldBounds | null = null
): Promise<GameplaySceneBundle> {
  onProgress(0.02);
  const levelManager = new LevelManager(level, mission);
  const missionContext = levelManager.missionContext;
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.05, 0.06, 0.08, 1);

  // Hide the default cursor in Babylon.js
  scene.defaultCursor = "none";
  scene.hoverCursor = "none";

  const envTex = CubeTexture.CreateFromPrefilteredData(skyboxAssetUrl, scene);
  await waitForCubeTextureReady(envTex);
  scene.environmentTexture = envTex;
  scene.environmentIntensity = 0.5;
  onProgress(0.1);

  const skyboxReflection = envTex.clone();
  await waitForCubeTextureReady(skyboxReflection);
  skyboxReflection.coordinatesMode = Texture.SKYBOX_MODE;
  attachEnvironmentSkybox(scene, skyboxReflection);

  const fallbackCamera = new ArcRotateCamera(
    "fallback_camera",
    -Math.PI / 2,
    Math.PI / 3,
    12,
    Vector3.Zero(),
    scene
  );
  fallbackCamera.minZ = 0.01;
  fallbackCamera.fov = toRadians(config.camera.defaultFovDeg);
  scene.activeCamera = fallbackCamera;

  new HemisphericLight("sun", new Vector3(0.2, 1, 0.1), scene).intensity = 0.5;

  const havok = await HavokPhysics();
  const havokPlugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);
  onProgress(0.2);
  await waitAnimationFrames(1);

  const terrainContainer = await SceneLoader.LoadAssetContainerAsync("", level.terrainUrl, scene);
  terrainContainer.addAllToScene();
  hideColliderMeshes(terrainContainer, scene);
  const worldPhysics = createWorldPhysics(terrainContainer, scene);
  const radarWorldBounds = radarWorldBoundsOverride ?? computeRadarWorldBounds(terrainContainer);
  onProgress(0.38);
  await waitAnimationFrames(1);

  const powerUpsContainer = await SceneLoader.LoadAssetContainerAsync("", powerUpsAssetUrl, scene);
  onProgress(0.45);
  const enemiesContainer = await SceneLoader.LoadAssetContainerAsync("", enemiesAssetUrl, scene);
  onProgress(0.52);

  let enemyTurretSystem: EnemyTurretSystem | null = null;
  if (enemiesConfig.turret.enabled) {
    try {
      enemyTurretSystem = new EnemyTurretSystem({
        scene,
        terrainContainer,
        enemiesContainer,
        config: enemiesConfig.turret
      });
    } catch (err) {
      console.warn("[TankController] Enemy turret system could not be created:", err);
    }
  }
  onProgress(0.58);

  let sharedPowerUpSystem: PowerUpSystem | null = null;
  let powerUpTargetController: TankGameplayController | null = null;
  const primaryVehicleType = missionContext.vehicles[0]?.type ?? "tank";
  const primaryPowerUpConfig = getVehicleConfig(primaryVehicleType).powerUps;
  if (primaryPowerUpConfig?.enabled && primaryPowerUpConfig.types) {
    try {
      sharedPowerUpSystem = new PowerUpSystem({
        scene,
        terrainContainer,
        powerUpsContainer,
        config: primaryPowerUpConfig,
        tankColliderMesh: null,
        showDebugBounds: false,
        onAmmoShellPickup: (amount) => powerUpTargetController?.applyPowerUpAmmoShell(amount),
        onFuelPickup: (amount) => powerUpTargetController?.applyPowerUpFuel(amount),
        onRepairPickup: (amount) => powerUpTargetController?.applyPowerUpRepair(amount),
        onShieldPickup: (durationSeconds, damageReduction) =>
          powerUpTargetController?.applyPowerUpShield(durationSeconds, damageReduction),
        onPicked: (typeId) => powerUpTargetController?.notifyPowerUpPicked(typeId)
      });
    } catch (err) {
      console.warn("[TankController] Shared PowerUpSystem init failed:", err);
    }
  }

  const bindSharedSystemsToVehicle = (vehicle: TankVehicleController): void => {
    powerUpTargetController = vehicle.gameplayController;
    sharedPowerUpSystem?.bindActivePlayer(
      vehicle.gameplayController.getPlayerColliderMesh(),
      vehicle.gameplayController.getPowerUpPickupHandlers()
    );
  };

  const bindEnemyTurretsToActiveVehicle = (): void => {
    if (!enemyTurretSystem) {
      return;
    }

    const active = levelManager.getActiveVehicle();
    if (!active) {
      return;
    }

    const target = active.getEnemyPlayerTarget();
    if (!target) {
      return;
    }

    const ignoreBodies: PhysicsBody[] = [];
    for (const vehicle of levelManager.getVehicles()) {
      if (vehicle === active) {
        continue;
      }
      const otherTarget = vehicle.getEnemyPlayerTarget();
      if (otherTarget) {
        ignoreBodies.push(otherTarget.tankBody);
      }
    }

    enemyTurretSystem.bindPlayerTarget({
      ...target,
      ignoreBodies
    });
  };

  const spawnedVehicles: SpawnedPlayerVehicle[] = [];
  const vehicleProgressStep = 0.38 / Math.max(missionContext.vehicles.length, 1);
  let progressCursor = 0.6;

  for (const vehicleSpawn of missionContext.vehicles) {
    const vehicleConfig = getVehicleConfig(vehicleSpawn.type);
    try {
      const spawned = await spawnPlayerVehicle({
        scene,
        canvas,
        terrainContainer,
        powerUpsContainer,
        enemyTurretSystem,
        vehicleSpawn,
        vehicleConfig,
        assetUrl: vehicleAssetUrl(vehicleSpawn.type),
        fallbackCamera,
        radarMapUrl,
        radarWorldBounds,
        onPlayerDeath,
        sharedPowerUpSystem
      });
      spawnedVehicles.push(spawned);
      levelManager.registerVehicle(
        new TankVehicleController({
          id: vehicleSpawn.id,
          type: vehicleSpawn.type,
          controller: spawned.controller
        })
      );
    } catch (err) {
      console.error(`[createGameplayScene] Failed to spawn vehicle "${vehicleSpawn.id}":`, err);
    }
    progressCursor += vehicleProgressStep;
    onProgress(progressCursor);
  }

  levelManager.setOnActiveVehicleChanged((vehicle) => {
    vehicle.focusCamera();
    bindEnemyTurretsToActiveVehicle();
    if (vehicle instanceof TankVehicleController) {
      bindSharedSystemsToVehicle(vehicle);
    }
    const ui = getSceneGameplayUi(scene);
    ui?.vehicleSelectorHud?.setActiveVehicle(vehicle.id);
  });

  const vehicleSelectorEntries = buildVehicleSelectorEntries(missionContext.vehicles);
  let vehicleSelectorInitDone = false;
  const ensureVehicleSelectorHud = (): void => {
    if (vehicleSelectorInitDone || vehicleSelectorEntries.length <= 1) {
      return;
    }

    const ui = getSceneGameplayUi(scene);
    if (!ui?.hudLayoutReady || !ui.hudTexture) {
      return;
    }

    const panel = ui.hudTexture.getControlByName("hud_panel_vehicles") as StackPanel | null;
    if (!panel) {
      return;
    }

    const initialActiveId = levelManager.getActiveVehicleId() ?? vehicleSelectorEntries[0].id;
    ui.vehicleSelectorHud = new VehicleSelectorHud(
      ui.hudTexture,
      panel,
      vehicleSelectorEntries,
      initialActiveId
    );
    vehicleSelectorInitDone = true;
  };

  const updateVehicleSelectorHud = (): void => {
    ensureVehicleSelectorHud();
    getSceneGameplayUi(scene)?.vehicleSelectorHud?.update(TARGET_FRAME_SEC);
  };
  scene.onBeforeRenderObservable.add(updateVehicleSelectorHud);

  bindEnemyTurretsToActiveVehicle();

  const initialActive = levelManager.getActiveVehicle();
  if (initialActive instanceof TankVehicleController) {
    bindSharedSystemsToVehicle(initialActive);
  }

  if (scene.activeCamera !== fallbackCamera) {
    fallbackCamera.dispose();
  }

  const primarySpawn = spawnedVehicles[0];
  onProgress(1);

  return {
    scene,
    levelManager,
    summary: {
      spawnFound: primarySpawn?.spawnFound ?? false,
      tankCameraFound: primarySpawn?.cameraFound ?? false,
      terrainStaticMeshes: countNamedMeshes(terrainContainer, "SM_"),
      terrainDynamicMeshes: countNamedMeshes(terrainContainer, "DM_"),
      terrainColliderMeshes: countNamedMeshes(terrainContainer, "COL_"),
      tankBones: primarySpawn ? collectBoneMatches(primarySpawn.container) : [],
      enemyTurretsSpawned: enemyTurretSystem?.instanceCount ?? 0
    },
    getDebugState: () => levelManager.getDebugState(),
    setPaused: (paused) => levelManager.setPaused(paused),
    dispose: () => {
      scene.onBeforeRenderObservable.removeCallback(updateVehicleSelectorHud);
      const ui = getSceneGameplayUi(scene);
      ui?.vehicleSelectorHud?.dispose();
      if (ui) {
        ui.vehicleSelectorHud = null;
      }
      levelManager.dispose();
      disposePhysicsGroup(worldPhysics);
      sharedPowerUpSystem?.dispose();
      for (const spawned of spawnedVehicles) {
        spawned.physics.body.dispose();
        spawned.physics.shape.dispose();
      }
    }
  };
}

interface SpawnPlayerVehicleOptions {
  scene: Scene;
  canvas: HTMLCanvasElement;
  terrainContainer: AssetContainer;
  powerUpsContainer: AssetContainer;
  enemyTurretSystem: EnemyTurretSystem | null;
  vehicleSpawn: MissionVehicleSpawn;
  vehicleConfig: TankControllerConfig;
  assetUrl: string;
  fallbackCamera: ArcRotateCamera;
  radarMapUrl: string | null;
  radarWorldBounds: RadarWorldBounds | null;
  onPlayerDeath: () => void;
  sharedPowerUpSystem?: PowerUpSystem | null;
}

function resolveVehicleNodeNames(config: TankControllerConfig) {
  const nodes = config.rig.nodes ?? {};
  return {
    colliderMesh: nodes.colliderMesh ?? "COL_tank",
    cameraPivot: nodes.cameraPivot ?? "CAM_pivot",
    cameraStart: nodes.cameraStart ?? "CAM_tank",
    muzzleShell: nodes.muzzleMissile ?? nodes.muzzleShell ?? "MUZZLE_canon_tank",
    muzzleGun: nodes.muzzleGun ?? "MUZZLE_gun_tank",
    ammoShellMesh: nodes.ammoMissileMesh ?? nodes.ammoShellMesh ?? "AMMO_obus",
    ammoShellColliderMesh:
      nodes.ammoMissileColliderMesh ?? nodes.ammoShellColliderMesh ?? "COL_obus",
    missileHardpoints: nodes.missileHardpoints ?? [],
    playerTarget: nodes.playerTarget ?? "TARGET_player_tank",
    pitchBone: config.rig.pitchBone ?? "canon",
    damageSmokes: nodes.damageSmoke ?? [
      "tank_damage_smoke_1",
      "tank_damage_smoke_2",
      "tank_damage_smoke_3",
      "tank_damage_smoke_4"
    ]
  };
}

async function spawnPlayerVehicle(options: SpawnPlayerVehicleOptions): Promise<SpawnedPlayerVehicle> {
  const {
    scene,
    canvas,
    terrainContainer,
    powerUpsContainer,
    enemyTurretSystem,
    vehicleSpawn,
    vehicleConfig,
    assetUrl,
    fallbackCamera,
    radarMapUrl,
    radarWorldBounds,
    onPlayerDeath
  } = options;
  const sharedPowerUpSystem = options.sharedPowerUpSystem;
  const nodeNames = resolveVehicleNodeNames(vehicleConfig);
  const spawnNode = findTransformNode(terrainContainer, vehicleSpawn.spawnNode);
  if (!spawnNode) {
    console.warn(
      `[LevelManager] Spawn node "${vehicleSpawn.spawnNode}" not found for vehicle "${vehicleSpawn.id}".`
    );
  }

  const vehicleContainer = await SceneLoader.LoadAssetContainerAsync("", assetUrl, scene);
  vehicleContainer.addAllToScene();
  hideColliderMeshes(vehicleContainer, scene);
  await waitAnimationFrames(1);

  const vehicleAnchor = new TransformNode(`${vehicleSpawn.id}_anchor`, scene);
  const vehicleVisualRoot = new TransformNode(`${vehicleSpawn.id}_visual_root`, scene);
  vehicleVisualRoot.parent = vehicleAnchor;
  if (spawnNode) {
    vehicleAnchor.position.copyFrom(spawnNode.getAbsolutePosition());
    vehicleAnchor.rotationQuaternion = extractHorizontalSpawnRotation(
      spawnNode,
      vehicleConfig.rig.movementForwardAxis,
      vehicleConfig.rig.movementForwardSign
    );
  } else {
    vehicleAnchor.rotationQuaternion = Quaternion.Identity();
  }
  vehicleAnchor.rotate(Axis.Y, toRadians(vehicleConfig.rig.spawnYawOffsetDeg));

  parentVehicleNodes(vehicleContainer, vehicleAnchor, vehicleVisualRoot, nodeNames.colliderMesh);
  const colliderMesh = findMeshByName(vehicleContainer, nodeNames.colliderMesh);
  refreshTankRigWorldMatrices(vehicleAnchor, vehicleContainer);
  const groundingInfo = createTankGroundingInfo(
    vehicleContainer,
    vehicleAnchor,
    colliderMesh,
    vehicleConfig.rig.movementForwardAxis
  );
  const suspensionInfo = createTankSuspensionInfo(vehicleContainer, vehicleAnchor, vehicleConfig);
  const vehiclePhysics = createTankPhysics(
    vehicleAnchor,
    colliderMesh,
    groundingInfo,
    scene,
    vehicleConfig
  );
  snapTankAnchorYToTerrain(
    scene,
    vehicleAnchor,
    vehiclePhysics.body,
    suspensionInfo.points,
    vehicleConfig
  );

  const camPivotNode = findTransformNode(vehicleContainer, nodeNames.cameraPivot);
  const camStartNode = findTransformNode(vehicleContainer, nodeNames.cameraStart);

  let vehicleCamera: UniversalCamera | null = null;
  let vehicleZoomCamera: UniversalCamera | null = null;
  let initialOrbit: { yawRad: number; pitchRad: number; radius: number } | null = null;
  if (camPivotNode) {
    const pivotWorld = camPivotNode.getAbsolutePosition();
    let startWorld: Vector3 | null = camStartNode ? camStartNode.getAbsolutePosition() : null;

    if (!startWorld) {
      const radius = vehicleConfig.camera.orbitDefaultRadius;
      const height = Math.max(radius * 0.35, 1);
      const sourceAxis =
        vehicleConfig.rig.movementForwardAxis === "x"
          ? Axis.X
          : vehicleConfig.rig.movementForwardAxis === "y"
            ? Axis.Y
            : Axis.Z;
      const forward = vehicleAnchor.getDirection(sourceAxis).scale(vehicleConfig.rig.movementForwardSign);
      forward.y = 0;
      if (forward.lengthSquared() > 1e-6) {
        forward.normalize();
      } else {
        forward.copyFrom(Axis.Z);
      }
      startWorld = pivotWorld.subtract(forward.scale(radius)).add(Axis.Y.scale(height));
    }

    vehicleCamera = new UniversalCamera(`${vehicleSpawn.id}_orbit_camera`, startWorld.clone(), scene);
    vehicleCamera.fov = toRadians(vehicleConfig.camera.defaultFovDeg);
    vehicleCamera.minZ = 0.01;
    vehicleCamera.inputs.clear();
    vehicleCamera.attachControl(canvas, true);
    vehicleCamera.setTarget(pivotWorld);

    if (scene.activeCamera === fallbackCamera) {
      scene.activeCamera = vehicleCamera;
    }

    vehicleZoomCamera = new UniversalCamera(`${vehicleSpawn.id}_zoom_camera`, Vector3.Zero(), scene);
    vehicleZoomCamera.fov = toRadians(vehicleConfig.camera.zoomViewFovDeg);
    vehicleZoomCamera.minZ = 0.01;
    vehicleZoomCamera.inputs.clear();
    vehicleZoomCamera.rotationQuaternion = Quaternion.Identity();

    const offset = startWorld.subtract(pivotWorld);
    const horizLen = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
    const radius = Math.max(offset.length(), 0.001);
    initialOrbit = {
      yawRad: Math.atan2(offset.x, offset.z),
      pitchRad: Math.atan2(offset.y, Math.max(horizLen, 0.001)),
      radius
    };
  } else {
    const allNames = [...vehicleContainer.transformNodes, ...vehicleContainer.meshes]
      .map((n) => n.name)
      .filter((n) => n.toLowerCase().includes("cam_"))
      .slice(0, 30);
    console.warn(
      `[TankController] ${nodeNames.cameraPivot} not found in "${vehicleSpawn.id}" GLB. CAM_* candidates:`,
      allNames
    );
  }

  const reticleCameraMesh: AbstractMesh | null = null;
  const reticleBarrelMesh = findAbstractMeshByName(vehicleContainer, "UI_reticle_barrel");
  const tracksSourceMesh = findAbstractMeshByName(vehicleContainer, "TEX_tracks");
  if (tracksSourceMesh) {
    tracksSourceMesh.isVisible = false;
    tracksSourceMesh.isPickable = false;
    tracksSourceMesh.setEnabled(false);
  }
  if (reticleBarrelMesh) {
    reticleBarrelMesh.isVisible = false;
    reticleBarrelMesh.isPickable = false;
    reticleBarrelMesh.setEnabled(false);
    reticleBarrelMesh.alwaysSelectAsActiveMesh = true;
    if (reticleBarrelMesh.material) {
      reticleBarrelMesh.material.backFaceCulling = false;
    }
  }

  const ammoShellMesh = findMeshByName(vehicleContainer, nodeNames.ammoShellMesh);
  if (ammoShellMesh) {
    ammoShellMesh.isVisible = false;
    ammoShellMesh.setParent(null);
  }
  const ammoShellColliderMesh = findMeshByName(vehicleContainer, nodeNames.ammoShellColliderMesh);
  if (ammoShellColliderMesh) {
    ammoShellColliderMesh.isVisible = false;
    ammoShellColliderMesh.isPickable = false;
    ammoShellColliderMesh.setParent(null);
  }
  const ammoBulletMesh = findMeshByName(vehicleContainer, "AMMO_balle");
  if (ammoBulletMesh) {
    ammoBulletMesh.isVisible = false;
    ammoBulletMesh.setParent(null);
  }

  const muzzleShellNode = findTransformNode(vehicleContainer, nodeNames.muzzleShell);
  const muzzleGunNode = findTransformNode(vehicleContainer, nodeNames.muzzleGun);
  parentMuzzleNodesToPitchBone(vehicleContainer, nodeNames.pitchBone, muzzleShellNode, muzzleGunNode);
  const missileHardpoints = createMissileHardpointVisuals(
    vehicleContainer,
    nodeNames.missileHardpoints,
    ammoShellMesh
  );
  refreshTankRigWorldMatrices(vehicleAnchor, vehicleContainer);

  const suspensionNodes = {
    fl: findTransformNode(vehicleContainer, "SUS_FL"),
    fr: findTransformNode(vehicleContainer, "SUS_FR"),
    ml: findTransformNode(vehicleContainer, "SUS_ML"),
    mr: findTransformNode(vehicleContainer, "SUS_MR"),
    rl: findTransformNode(vehicleContainer, "SUS_RL"),
    rr: findTransformNode(vehicleContainer, "SUS_RR")
  };

  const tracksEnabled = vehicleConfig.tracks?.enabled === true;
  const susBackLeft =
    findTransformNode(vehicleContainer, "SUS_BL") ?? findTransformNode(vehicleContainer, "SUS_RL");
  const susBackRight =
    findTransformNode(vehicleContainer, "SUS_BR") ?? findTransformNode(vehicleContainer, "SUS_RR");
  const susFrontLeft = findTransformNode(vehicleContainer, "SUS_FL");
  const susFrontRight = findTransformNode(vehicleContainer, "SUS_FR");

  let trackTreadParticles = null;
  let trackTreadParticlesReverse = null;
  if (tracksEnabled) {
    try {
      trackTreadParticles = await createTrackTreadParticleBundle(scene, susBackLeft, susBackRight);
    } catch (err) {
      console.warn("[TankController] Track tread particles could not be created:", err);
    }
    try {
      trackTreadParticlesReverse = await createTrackTreadParticleBundle(scene, susFrontLeft, susFrontRight);
    } catch (err) {
      console.warn("[TankController] Track tread particles (reverse) could not be created:", err);
    }
  }

  const [smoke1Name, smoke2Name, smoke3Name, smoke4Name] = nodeNames.damageSmokes;
  const damageSmoke1 = findTransformNode(vehicleContainer, smoke1Name);
  const damageSmoke2 = findTransformNode(vehicleContainer, smoke2Name);
  const damageSmoke3 = findTransformNode(vehicleContainer, smoke3Name);
  const damageSmoke4 = findTransformNode(vehicleContainer, smoke4Name);
  const playerTargetNode = findTransformNode(vehicleContainer, nodeNames.playerTarget);
  if (!playerTargetNode) {
    console.warn(
      `[TankController] ${nodeNames.playerTarget} not found in "${vehicleSpawn.id}" GLB; enemies aim at anchor.`
    );
  }

  let tankDamageParticles = null;
  try {
    tankDamageParticles = await createTankDamageParticleBundle(scene, {
      smoke1: damageSmoke1,
      smoke2: damageSmoke2,
      smoke3: damageSmoke3,
      smoke4: damageSmoke4
    });
  } catch (err) {
    console.warn("[TankController] Vehicle damage particles could not be created:", err);
  }

  const controller = new TankGameplayController({
    scene,
    canvas,
    config: vehicleConfig,
    tankContainer: vehicleContainer,
    tankAnchor: vehicleAnchor,
    tankVisualRoot: vehicleVisualRoot,
    terrainContainer,
    powerUpsContainer,
    tankColliderMesh: colliderMesh,
    groundingInfo,
    suspensionInfo,
    suspensionNodes,
    tankBody: vehiclePhysics.body,
    tankCamera: vehicleCamera,
    tankZoomCamera: vehicleZoomCamera,
    cameraPivotNode: camPivotNode,
    initialOrbit,
    reticleCameraMesh,
    reticleBarrelMesh,
    muzzleCannonNode: muzzleShellNode,
    muzzleGunNode,
    tracksSourceMesh,
    ammoShellMesh,
    ammoShellColliderMesh,
    ammoBulletMesh,
    missileHardpoints,
    trackTreadParticles,
    trackTreadParticlesReverse,
    tankDamageParticles,
    playerTargetNode,
    enemyTurretSystem,
    sharedPowerUpSystem,
    radarMapUrl,
    radarWorldBounds,
    onPlayerDeath
  });

  return {
    controller,
    physics: vehiclePhysics,
    container: vehicleContainer,
    spawnFound: Boolean(spawnNode),
    cameraFound: Boolean(camStartNode) || Boolean(camPivotNode)
  };
}

function waitForCubeTextureReady(texture: CubeTexture): Promise<void> {
  if (texture.isReady()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    texture.onLoadObservable.addOnce(() => resolve());
  });
}

function attachEnvironmentSkybox(scene: Scene, reflectionTexture: CubeTexture): void {
  const skybox = MeshBuilder.CreateBox("hdrSkyBox", { size: 1000 }, scene);
  const material = new StandardMaterial("skyBox", scene);
  material.backFaceCulling = false;
  material.disableLighting = true;
  material.reflectionTexture = reflectionTexture;
  skybox.material = material;
  skybox.isPickable = false;
  skybox.infiniteDistance = true;
  skybox.ignoreCameraMaxZ = true;
}

function parentVehicleNodes(
  container: AssetContainer,
  physicsAnchor: TransformNode,
  visualRoot: TransformNode,
  colliderMeshName: string
): void {
  for (const mesh of container.meshes.filter((candidate) => !candidate.parent)) {
    mesh.parent = mesh.name === colliderMeshName ? physicsAnchor : visualRoot;
  }

  for (const node of container.transformNodes.filter((candidate) => !candidate.parent)) {
    if (node === physicsAnchor || node === visualRoot) {
      continue;
    }

    node.parent = visualRoot;
  }

  for (const camera of container.cameras.filter((candidate) => !candidate.parent)) {
    camera.parent = visualRoot;
  }
}

function findTransformNode(
  container: AssetContainer,
  name: string
): TransformNode | AbstractMesh | null {
  const candidates = [...container.transformNodes, ...container.meshes];
  const wanted = name.trim().toLowerCase();
  return (
    candidates.find((node) => {
      const n = node.name.trim().toLowerCase();
      return n === wanted || n.startsWith(`${wanted}.`);
    }) ?? null
  );
}

function findPitchBoneTransform(container: AssetContainer, pitchBoneName: string): TransformNode | null {
  const wanted = pitchBoneName.trim().toLowerCase();
  const bone =
    container.skeletons
      .flatMap((skeleton) => skeleton.bones)
      .find((candidate) => {
        const name = candidate.name.trim().toLowerCase();
        return name === wanted || name.startsWith(`${wanted}.`);
      }) ?? null;

  return bone?.getTransformNode() ?? null;
}

function createMissileHardpointVisuals(
  container: AssetContainer,
  hardpointNames: readonly string[],
  ammoTemplate: Mesh | null
): Array<{ muzzleNode: TransformNode | AbstractMesh; visualMesh: Mesh | null }> {
  if (!ammoTemplate || hardpointNames.length === 0) {
    return [];
  }

  const hardpoints: Array<{ muzzleNode: TransformNode | AbstractMesh; visualMesh: Mesh | null }> = [];
  for (const hardpointName of hardpointNames) {
    const muzzleNode = findTransformNode(container, hardpointName);
    if (!muzzleNode) {
      console.warn(`[TankController] missile hardpoint "${hardpointName}" not found.`);
      continue;
    }

    const visualMesh = ammoTemplate.clone(`${hardpointName}_store`, null);
    if (visualMesh) {
      visualMesh.isVisible = true;
      visualMesh.isPickable = false;
      visualMesh.setParent(muzzleNode);
      visualMesh.position.setAll(0);
      visualMesh.rotationQuaternion ??= Quaternion.Identity();
      visualMesh.rotationQuaternion.copyFrom(Quaternion.Identity());
    }

    hardpoints.push({ muzzleNode, visualMesh });
  }

  return hardpoints;
}

/** Les MUZZLE_* doivent suivre le pitch du bone armes/canon. */
function parentMuzzleNodesToPitchBone(
  container: AssetContainer,
  pitchBoneName: string,
  muzzleShellNode: TransformNode | AbstractMesh | null,
  muzzleGunNode: TransformNode | AbstractMesh | null
): void {
  const pitchTransform = findPitchBoneTransform(container, pitchBoneName);
  if (!pitchTransform) {
    console.warn(
      `[TankController] pitch bone "${pitchBoneName}" not found; MUZZLE_* nodes were not reparented.`
    );
    return;
  }

  for (const muzzle of [muzzleShellNode, muzzleGunNode]) {
    if (!muzzle) {
      continue;
    }
    if (muzzle.parent === pitchTransform) {
      continue;
    }
    muzzle.setParent(pitchTransform, true);
  }
}

function refreshTankRigWorldMatrices(tankAnchor: TransformNode, container: AssetContainer): void {
  tankAnchor.computeWorldMatrix(true);
  for (const node of container.transformNodes) {
    node.computeWorldMatrix(true);
  }
  for (const mesh of container.meshes) {
    mesh.computeWorldMatrix(true);
  }
}

function snapTankAnchorYToTerrain(
  scene: Scene,
  tankAnchor: TransformNode,
  tankBody: PhysicsBody,
  suspensionLocals: Vector3[],
  config: TankControllerConfig
): void {
  if (suspensionLocals.length === 0) {
    return;
  }

  const engine = scene.getPhysicsEngine();
  if (!engine) {
    return;
  }

  tankAnchor.computeWorldMatrix(true);
  const q = tankAnchor.absoluteRotationQuaternion ?? tankAnchor.rotationQuaternion ?? Quaternion.Identity();
  const rayStartHeight = config.suspension.rayStartHeight;
  const restLength = config.suspension.restLength;
  const targetDist = rayStartHeight + restLength + getSuspensionContactOffset(config);
  const longDown = 80;
  let maxDrop = 0;

  for (const local of suspensionLocals) {
    const worldPoint = tankAnchor.getAbsolutePosition().add(local.clone().applyRotationQuaternion(q));
    const from = worldPoint.add(Axis.Y.scale(rayStartHeight));
    const to = from.add(Axis.Y.scale(-longDown));
    const hit = engine.raycast(from, to, {
      ignoreBody: tankBody,
      shouldHitTriggers: false,
      collideWith: 0xffffffff
    });
    if (!hit.hasHit) {
      continue;
    }
    hit.calculateHitDistance();
    const drop = hit.hitDistance - targetDist;
    if (drop > maxDrop) {
      maxDrop = drop;
    }
  }

  if (maxDrop > 0.002) {
    tankAnchor.position.y -= maxDrop;
    tankAnchor.computeWorldMatrix(true);
    tankBody.setLinearVelocity(Vector3.Zero());
    tankBody.setAngularVelocity(Vector3.Zero());
  }
}

function hideColliderMeshes(container: AssetContainer, scene: Scene): void {
  const debugShowColliders = false;

  let redWireframeMat = scene.getMaterialByName("debug_red_wireframe") as StandardMaterial | null;
  if (!redWireframeMat) {
    redWireframeMat = new StandardMaterial("debug_red_wireframe", scene);
    redWireframeMat.emissiveColor = new Color3(1, 0, 0);
    redWireframeMat.wireframe = true;
    redWireframeMat.disableLighting = true;
    redWireframeMat.backFaceCulling = false;
  }

  for (const mesh of container.meshes) {
    const isCollider = mesh.name.startsWith("COL_") || mesh.name === "COL_tank";
    const isTerrainStatic = mesh.name.startsWith("SM_");
    const isTerrainDynamic = mesh.name.startsWith("DM_");

    if (!isCollider && !isTerrainStatic && !isTerrainDynamic) {
      continue;
    }
    // Keep gameplay picking for SM_/DM_ (reticle raycast), but never pick colliders.
    if (isCollider) {
      mesh.isPickable = false;
    }

    if (isCollider) {
      mesh.isVisible = debugShowColliders;
    } else if (debugShowColliders) {
      mesh.isVisible = true;
    }

    if (debugShowColliders && mesh instanceof Mesh) {
      mesh.material = redWireframeMat;
    }
  }
}

function countNamedMeshes(container: AssetContainer, prefix: string): number {
  return container.meshes.filter((mesh) => mesh.name.startsWith(prefix)).length;
}

function computeRadarWorldBounds(container: AssetContainer): RadarWorldBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const mesh of container.meshes) {
    if (mesh.getTotalVertices() <= 0) {
      continue;
    }

    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(true, true);
    const box = mesh.getBoundingInfo().boundingBox;
    minX = Math.min(minX, box.minimumWorld.x);
    maxX = Math.max(maxX, box.maximumWorld.x);
    minZ = Math.min(minZ, box.minimumWorld.z);
    maxZ = Math.max(maxZ, box.maximumWorld.z);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }

  const paddingX = Math.max((maxX - minX) * 0.03, 0.5);
  const paddingZ = Math.max((maxZ - minZ) * 0.03, 0.5);
  return {
    minX: minX - paddingX,
    maxX: maxX + paddingX,
    minZ: minZ - paddingZ,
    maxZ: maxZ + paddingZ
  };
}

function collectBoneMatches(container: AssetContainer): string[] {
  const names = ["main", "caisse", "tourelle", "canon", "armes", "minigun", "track_L", "track_R"] as const;
  return names.filter((boneName) =>
    container.skeletons.some((skeleton) => skeleton.bones.some((bone) => bone.name === boneName))
  );
}

function toRadians(valueInDegrees: number): number {
  return (valueInDegrees * Math.PI) / 180;
}

function extractHorizontalSpawnRotation(
  spawnNode: TransformNode | AbstractMesh,
  forwardAxisName: "x" | "y" | "z",
  forwardSign: 1 | -1
): Quaternion {
  const sourceAxis =
    forwardAxisName === "x" ? Axis.X : forwardAxisName === "y" ? Axis.Y : Axis.Z;
  const forward = spawnNode.getDirection(sourceAxis).scale(forwardSign);
  forward.y = 0;

  if (forward.lengthSquared() < 1e-6) {
    return Quaternion.Identity();
  }

  forward.normalize();
  return Quaternion.FromLookDirectionRH(forward, Axis.Y);
}

function createWorldPhysics(container: AssetContainer, scene: Scene): PhysicsResourceGroup {
  const bodies: PhysicsBody[] = [];
  const shapes: PhysicsShape[] = [];

  for (const mesh of container.meshes) {
    if (!(mesh instanceof Mesh) || mesh.getTotalVertices() === 0) {
      continue;
    }

    if (mesh.name.startsWith("DM_")) {
      const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, scene);

      // Use a ConvexHull shape for dynamic meshes as it wraps the mesh geometry tightly
      const shape = new PhysicsShapeConvexHull(mesh, scene);
      shape.filterMembershipMask = 1;
      shape.filterCollideMask = 0xffffffff;

      body.shape = shape;

      // Calculate mass properties based on the mesh bounding box to ensure stable physics
      // even if the mesh origin is not perfectly centered
      const boundingInfo = mesh.getBoundingInfo();
      const extents = boundingInfo.boundingBox.extendSizeWorld;
      const volume = extents.x * extents.y * extents.z * 8; // 2*x * 2*y * 2*z

      // Use the center of the bounding box as the center of mass
      const centerOfMass = boundingInfo.boundingBox.centerWorld.subtract(mesh.getAbsolutePosition());

      body.setMassProperties({
        mass: Math.max(volume * 5, 1), // Base mass on volume, minimum 1kg
        centerOfMass: centerOfMass
      });

      body.setLinearDamping(0.6);
      body.setAngularDamping(0.8);
      bodies.push(body);
      shapes.push(shape);
      continue;
    }

    if (mesh.name.startsWith("SM_") || mesh.name.startsWith("COL_")) {
      const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, scene);
      const shape = new PhysicsShapeMesh(mesh, scene);
      shape.filterMembershipMask = 1;
      shape.filterCollideMask = 0xffffffff;
      body.shape = shape;
      bodies.push(body);
      shapes.push(shape);
    }
  }

  return { bodies, shapes };
}

function createTankPhysics(
  tankAnchor: TransformNode,
  tankColliderMesh: Mesh | null,
  grounding: TankGroundingInfo,
  scene: Scene,
  config: TankControllerConfig
): TankPhysicsResource {
  const body = new PhysicsBody(tankAnchor, PhysicsMotionType.DYNAMIC, false, scene);
  const shape = tankColliderMesh
    ? new PhysicsShapeConvexHull(tankColliderMesh, scene)
    : new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 0.5, 1.6), scene);

  // Assign the tank to collision group 2 so projectiles can ignore it
  shape.filterMembershipMask = 2;
  shape.filterCollideMask = 0xffffffff;

  body.shape = shape;
  shape.material = {
    friction: config.physics.tankFriction,
    staticFriction: config.physics.tankFriction,
    restitution: config.physics.tankRestitution
  };
  body.setMassProperties({
    mass: config.physics.tankMass,
    centerOfMass: new Vector3(0, config.physics.tankCenterOfMassYOffset, 0)
  });
  body.setLinearDamping(config.physics.tankLinearDamping);
  body.setAngularDamping(config.physics.tankAngularDamping);
  body.setGravityFactor(1);

  return { body, shape, grounding };
}

function createTankSuspensionInfo(
  container: AssetContainer,
  tankAnchor: TransformNode,
  config?: TankControllerConfig
): TankSuspensionInfo {
  const names =
    config?.rig.suspensionProbeNames ??
    (["SUS_FL", "SUS_FR", "SUS_ML", "SUS_MR", "SUS_RL", "SUS_RR"] as const);
  const nodes = names
    .map((name) => findTransformNode(container, name))
    .filter((n): n is TransformNode | AbstractMesh => n !== null);

  // Liste déclarée entièrement résolue : on la respecte quel que soit le nombre de
  // sondes. Un train tricycle n'en a légitimement que trois.
  if (nodes.length > 0 && nodes.length === names.length) {
    return { points: nodes.map((n) => toAnchorLocalPosition(n, tankAnchor)) };
  }

  // Liste incomplète : on ne garde les sondes trouvées que si elles suffisent à
  // définir une assiette, sinon on tente les anciens repères `GROUND_*`.
  if (nodes.length >= 4) {
    return { points: nodes.map((n) => toAnchorLocalPosition(n, tankAnchor)) };
  }

  const fallbackNames = ["GROUND_FL", "GROUND_FR", "GROUND_RL", "GROUND_RR"] as const;
  const fallbackNodes = fallbackNames
    .map((name) => findTransformNode(container, name))
    .filter((n): n is TransformNode | AbstractMesh => n !== null);

  return { points: fallbackNodes.map((n) => toAnchorLocalPosition(n, tankAnchor)) };
}

function disposePhysicsGroup(group: PhysicsResourceGroup): void {
  for (const body of group.bodies) {
    body.dispose();
  }

  for (const shape of group.shapes) {
    shape.dispose();
  }
}

function findAbstractMeshByName(container: AssetContainer, name: string): AbstractMesh | null {
  const wanted = name.trim().toLowerCase();
  return (
    container.meshes.find((candidate) => {
      const n = candidate.name.trim().toLowerCase();
      return n === wanted || n.startsWith(`${wanted}.`);
    }) ?? null
  );
}

function findMeshByName(container: AssetContainer, name: string): Mesh | null {
  const candidate = findAbstractMeshByName(container, name);
  return candidate instanceof Mesh ? candidate : null;
}

function createTankGroundingInfo(
  tankContainer: AssetContainer,
  tankAnchor: TransformNode,
  tankColliderMesh: Mesh | null,
  movementForwardAxis: "x" | "y" | "z"
): TankGroundingInfo {
  const probeNames = ["GROUND_FL", "GROUND_FR", "GROUND_RL", "GROUND_RR"] as const;
  const probeNodes = probeNames.map((name) => findTransformNode(tankContainer, name));
  if (probeNodes.every((node) => node)) {
    const [frontLeft, frontRight, rearLeft, rearRight] = probeNodes as Array<TransformNode | AbstractMesh>;
    const frontLeftLocal = toAnchorLocalPosition(frontLeft, tankAnchor);
    const frontRightLocal = toAnchorLocalPosition(frontRight, tankAnchor);
    const rearLeftLocal = toAnchorLocalPosition(rearLeft, tankAnchor);
    const rearRightLocal = toAnchorLocalPosition(rearRight, tankAnchor);
    return {
      baseClearance: Math.max(
        -((frontLeftLocal.y + frontRightLocal.y + rearLeftLocal.y + rearRightLocal.y) / 4),
        0.02
      ),
      frontLeft: frontLeftLocal,
      frontRight: frontRightLocal,
      rearLeft: rearLeftLocal,
      rearRight: rearRightLocal
    };
  }

  if (!tankColliderMesh) {
    return {
      baseClearance: 0.5,
      frontLeft: new Vector3(-0.45, 0, 0.75),
      frontRight: new Vector3(0.45, 0, 0.75),
      rearLeft: new Vector3(-0.45, 0, -0.75),
      rearRight: new Vector3(0.45, 0, -0.75)
    };
  }

  const bounds = tankColliderMesh.getBoundingInfo().boundingBox;
  const bottomFromAnchor = tankColliderMesh.position.y + bounds.minimum.y;
  const forwardExtent =
    movementForwardAxis === "x"
      ? bounds.extendSize.x
      : movementForwardAxis === "y"
        ? bounds.extendSize.y
        : bounds.extendSize.z;
  const sideExtent =
    movementForwardAxis === "x"
      ? bounds.extendSize.z
      : movementForwardAxis === "z"
        ? bounds.extendSize.x
        : bounds.extendSize.x;

  return {
    baseClearance: Math.max(-bottomFromAnchor, 0.01),
    frontLeft: new Vector3(-sideExtent * 0.7, 0, forwardExtent * 0.7),
    frontRight: new Vector3(sideExtent * 0.7, 0, forwardExtent * 0.7),
    rearLeft: new Vector3(-sideExtent * 0.7, 0, -forwardExtent * 0.7),
    rearRight: new Vector3(sideExtent * 0.7, 0, -forwardExtent * 0.7)
  };
}

function toAnchorLocalPosition(
  node: TransformNode | AbstractMesh,
  anchor: TransformNode
): Vector3 {
  // Important: when nodes are parented under an armature/bones, their world matrices may not be
  // evaluated yet at load time. Force an evaluation so `getAbsolutePosition()` is correct.
  anchor.computeWorldMatrix(true);
  node.computeWorldMatrix(true);

  // Compute local position robustly using the full world matrix (includes rotation + scale).
  const inv = anchor.getWorldMatrix().clone();
  inv.invert();
  const worldPosition = node.getAbsolutePosition();
  return Vector3.TransformCoordinates(worldPosition, inv);
}
