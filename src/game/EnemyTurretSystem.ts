import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { Material } from "@babylonjs/core/Materials/material";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsShapeMesh, type PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape";
import type { Scene } from "@babylonjs/core/scene";
import type { Node } from "@babylonjs/core/node";
import type { EnemyTurretConfig } from "../config/enemiesController";
import {
  createSingleDamageParticleBundle,
  type TankDamageParticleBundle
} from "./tankDamageParticles";
import {
  applyBoneLocalDirection,
  applyBoneLocalOffset,
  captureBoneLocalDirection,
  captureBoneLocalOffset,
  axisFromConfig,
  clamp,
  getBoneLocalInReference,
  getBoneWorldPosition,
  getControlLocalRotation,
  getBoneLocalRotation,
  moveTowards,
  moveTowardsAngle,
  refreshSkinnedMeshRig,
  resolveControlReference,
  setBoneAxisAngle,
  setControlAxisAngle,
  toRadians,
  worldToLocalInReference,
  type BoneControl
} from "./rigUtils";

export interface EnemyTurretSystemOptions {
  scene: Scene;
  terrainContainer: AssetContainer;
  enemiesContainer: AssetContainer;
  config: EnemyTurretConfig;
}

export interface EnemyTurretPlayerTarget {
  tankBody: PhysicsBody;
  tankColliderMesh: Mesh | null;
  onDamage: (amount: number) => void;
  /** Corps des autres véhicules joueur (inactifs) — ignorés par les raycasts ennemis. */
  ignoreBodies?: PhysicsBody[];
  /** Spark d'impact (même effet que le mitrailleur du tank). */
  onBulletImpact?: (worldPos: Vector3) => void;
  /** Explosion visuelle à la destruction (même FX qu'un obus). */
  onTurretDestroyed?: (worldPos: Vector3) => void;
}

export interface EnemyTurretRadarTarget {
  id: string;
  position: Vector3;
}

/** Cible verrouillable par le système de missiles du jet. */
export interface EnemyLockTarget {
  id: string;
  aimPoint: Vector3;
}

interface EnemyTurretInstance {
  spawnId: string;
  anchor: TransformNode;
  root: TransformNode;
  skinnedMesh: AbstractMesh | null;
  yawControl: BoneControl;
  pitchControl: BoneControl;
  pitchReference: TransformNode;
  muzzle1: TransformNode | AbstractMesh | null;
  muzzle2: TransformNode | AbstractMesh | null;
  damageSmoke: TransformNode | AbstractMesh | null;
  damageParticles: TankDamageParticleBundle | null;
  /** Offset du muzzle dans l'espace local du pitch bone (turret_head). */
  muzzle1LocalInPitchBone: Vector3 | null;
  muzzle2LocalInPitchBone: Vector3 | null;
  /** Axe des canons en local du pitch bone (depuis l'empty muzzle au spawn). */
  barrelForwardLocalInPitchBone: Vector3 | null;
  yawBaseLocalRotation: Quaternion;
  pitchBaseLocalRotation: Quaternion;
  /** Pivot du pitch bone en espace anchor (pose neutre au spawn). */
  pitchPivotLocalInAnchor: Vector3;
  currentYawDeg: number;
  currentPitchDeg: number;
  targetYawDeg: number;
  targetPitchDeg: number;
  tracking: boolean;
  debugAimLine: LinesMesh | null;
  debugBarrelLine: LinesMesh | null;
  debugTargetMarker: AbstractMesh | null;
  debugPivotMarker: AbstractMesh | null;
  nextBarrelIndex: number;
  fireCooldown: number;
  colliderMesh: Mesh | null;
  physicsBody: PhysicsBody | null;
  physicsShape: PhysicsShape | null;
  health: number;
  alive: boolean;
  flashMaterials: DamageFlashMaterialState[];
  damageFlashRemaining: number;
}

interface DamageFlashMaterialState {
  material: Material;
  baseEmissive: Color3;
  baseEmissiveIntensity: number | null;
}

const DEFAULT_DAMAGE_FLASH = {
  durationSeconds: 0.15,
  maxAlpha: 0.65,
  color: new Color3(1, 0.12, 0.08)
} as const;

const PEAK_EMISSIVE_INTENSITY = 2.4;

function collectTurretVisualMeshes(
  root: TransformNode,
  skinnedMesh: AbstractMesh | null,
  meshName: string
): AbstractMesh[] {
  if (skinnedMesh && skinnedMesh.getTotalVertices() > 0) {
    return [skinnedMesh];
  }

  const meshes = root.getChildMeshes(true).filter((mesh) => {
    if (mesh.getTotalVertices() <= 0) {
      return false;
    }
    if (matchNodeName(mesh.name, "COL_enemy_turret") || matchNodeName(mesh.name, "AMMO_turret")) {
      return false;
    }
    return matchNodeName(mesh.name, meshName);
  });

  if (meshes.length > 0) {
    return meshes;
  }

  return root.getChildMeshes(true).filter((mesh) => {
    if (mesh.getTotalVertices() <= 0) {
      return false;
    }
    return !matchNodeName(mesh.name, "COL_enemy_turret") && !matchNodeName(mesh.name, "AMMO_turret");
  });
}

function readMaterialEmissive(material: Material): { color: Color3; intensity: number | null } {
  const mat = material as Material & {
    emissiveColor?: Color3;
    emissiveIntensity?: number;
  };
  return {
    color: mat.emissiveColor?.clone() ?? Color3.Black(),
    intensity: typeof mat.emissiveIntensity === "number" ? mat.emissiveIntensity : null
  };
}

function setupTurretFlashMaterials(
  root: TransformNode,
  skinnedMesh: AbstractMesh | null,
  meshName: string,
  instanceLabel: string
): DamageFlashMaterialState[] {
  const targetMeshes = collectTurretVisualMeshes(root, skinnedMesh, meshName);
  const states: DamageFlashMaterialState[] = [];
  const clonedBySource = new Map<Material, Material>();

  for (const mesh of targetMeshes) {
    const source = mesh.material;
    if (!source) {
      continue;
    }

    let material = clonedBySource.get(source);
    if (!material) {
      const cloned = source.clone(`${source.name}_damage_flash_${instanceLabel}`);
      if (!cloned) {
        continue;
      }
      material = cloned;
      clonedBySource.set(source, material);
      const base = readMaterialEmissive(material);
      states.push({
        material,
        baseEmissive: base.color,
        baseEmissiveIntensity: base.intensity
      });
    }

    mesh.material = material;
  }

  return states;
}

function applyDamageFlashEmissive(
  states: DamageFlashMaterialState[],
  flashColor: Color3,
  mix: number
): void {
  const t = clamp(mix, 0, 1);
  for (const state of states) {
    const mat = state.material as Material & {
      emissiveColor?: Color3;
      emissiveIntensity?: number;
    };
    if (mat.emissiveColor) {
      mat.emissiveColor = Color3.Lerp(state.baseEmissive, flashColor, t);
    }
    if (typeof mat.emissiveIntensity === "number") {
      const baseIntensity = state.baseEmissiveIntensity ?? mat.emissiveIntensity;
      mat.emissiveIntensity = baseIntensity + (PEAK_EMISSIVE_INTENSITY - baseIntensity) * t;
    }
  }
}

function restoreDamageFlashEmissive(states: DamageFlashMaterialState[]): void {
  for (const state of states) {
    const mat = state.material as Material & {
      emissiveColor?: Color3;
      emissiveIntensity?: number;
    };
    if (mat.emissiveColor) {
      mat.emissiveColor = state.baseEmissive.clone();
    }
    if (typeof mat.emissiveIntensity === "number" && state.baseEmissiveIntensity !== null) {
      mat.emissiveIntensity = state.baseEmissiveIntensity;
    }
  }
}

interface EnemyBulletTracer {
  mesh: Mesh;
  from: Vector3;
  muzzlePos: Vector3;
  dir: Vector3;
  hitPoint: Vector3;
  hitDistance: number;
  traveled: number;
  speed: number;
  rotation: Quaternion;
  hitsTank: boolean;
  /** Callback figé au tir — évite qu'un switch de véhicule redirige les dégâts en vol. */
  onHitPlayerDamage: ((amount: number) => void) | null;
  debugVisual: BulletDebugVisual | null;
}

interface BulletDebugVisual {
  originMarker: AbstractMesh;
  muzzleMarker: AbstractMesh;
  hitMarker: AbstractMesh;
  pathLine: LinesMesh;
  offsetLine: LinesMesh;
  travelLine: LinesMesh;
  persistSeconds: number;
}

function findMeshInContainer(container: AssetContainer, name: string): Mesh | null {
  const mesh = container.meshes.find((candidate) => matchNodeName(candidate.name, name));
  return mesh instanceof Mesh ? mesh : null;
}

function matchNodeName(candidateName: string, wanted: string): boolean {
  const n = candidateName.trim().toLowerCase();
  const w = wanted.trim().toLowerCase();
  if (n === w || n.startsWith(`${w}.`)) {
    return true;
  }
  // Babylon clone() prefixes descendant node names (e.g. "clone.turret_head.turret_muzzle_1").
  if (n.endsWith(`.${w}`)) {
    return true;
  }
  return n.split(".").pop() === w;
}

function findArmatureRoot(container: AssetContainer): TransformNode | null {
  return (
    container.transformNodes.find((node) => matchNodeName(node.name, "turret_armature")) ?? null
  );
}

function findColliderMeshOnRoot(root: TransformNode, scene: Scene): Mesh | null {
  const fromTree = findNodeOnRoot(root, "COL_enemy_turret");
  if (fromTree instanceof Mesh) {
    return fromTree;
  }
  if (fromTree instanceof AbstractMesh && fromTree.getTotalVertices() > 0) {
    return fromTree as Mesh;
  }

  for (const mesh of scene.meshes) {
    if (!matchNodeName(mesh.name, "COL_enemy_turret")) {
      continue;
    }
    let parent: Node | null = mesh;
    while (parent) {
      if (parent === root) {
        if (mesh instanceof Mesh) {
          return mesh;
        }
        if (mesh.getTotalVertices() > 0) {
          return mesh as Mesh;
        }
        break;
      }
      parent = parent.parent;
    }
  }

  return null;
}

function findNodeOnRoot(root: TransformNode, name: string): TransformNode | AbstractMesh | null {
  const stack: TransformNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    if (matchNodeName(node.name, name)) {
      return node;
    }
    for (const child of node.getChildren()) {
      if (child instanceof TransformNode || child instanceof AbstractMesh) {
        stack.push(child);
      }
    }
  }
  return null;
}

function resolveBoneControlOnRoot(root: TransformNode, boneName: string): BoneControl {
  const meshes: AbstractMesh[] = [];
  if (root instanceof AbstractMesh) {
    meshes.push(root);
  }
  meshes.push(...root.getChildMeshes(true));
  for (const mesh of meshes) {
    const skeleton = mesh.skeleton;
    if (!skeleton) {
      continue;
    }
    const bone = skeleton.bones.find((candidate) => candidate.name === boneName) ?? null;
    if (bone) {
      return {
        bone,
        transformNode: bone.getTransformNode() ?? null
      };
    }
  }
  return { bone: null, transformNode: null };
}

function applySpawnTransform(source: TransformNode | AbstractMesh, target: TransformNode): void {
  source.computeWorldMatrix(true);
  target.position.copyFrom(source.getAbsolutePosition());
  if (source.rotationQuaternion) {
    target.rotationQuaternion = source.rotationQuaternion.clone();
  } else {
    target.rotationQuaternion = Quaternion.FromEulerAngles(source.rotation.x, source.rotation.y, source.rotation.z);
    target.rotation.set(0, 0, 0);
  }

  const scale = source.absoluteScaling;
  if (scale.x > 1e-4 && scale.y > 1e-4 && scale.z > 1e-4) {
    target.scaling.copyFrom(scale);
  } else {
    target.scaling.setAll(1);
  }
  target.computeWorldMatrix(true);
}

function sanitizeNodeName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_]+/g, "_");
}

function parseSpawnId(spawnNodeName: string, prefix: string): string | null {
  const normalizedName = spawnNodeName.trim().toUpperCase();
  if (!normalizedName.startsWith(prefix.trim().toUpperCase())) {
    return null;
  }
  const suffix = spawnNodeName.trim().slice(prefix.trim().length);
  return suffix.length > 0 ? suffix : null;
}

function findLinkedNodeClone(
  root: TransformNode,
  sourceNode: TransformNode
): TransformNode | null {
  const stack: TransformNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    if (node !== sourceNode && matchNodeName(node.name, sourceNode.name)) {
      return node;
    }
    for (const child of node.getChildren()) {
      if (child instanceof TransformNode || child instanceof AbstractMesh) {
        stack.push(child as TransformNode);
      }
    }
  }
  return null;
}

/** Babylon partage le skeleton entre clones — chaque tourelle doit avoir le sien, relié à ses nodes clonés. */
function isolateInstanceSkeletons(root: TransformNode, instanceLabel: string): void {
  const clonedBySource = new Map<object, NonNullable<AbstractMesh["skeleton"]>>();

  for (const mesh of root.getChildMeshes(true)) {
    const skeleton = mesh.skeleton;
    if (!skeleton) {
      continue;
    }

    let instanceSkeleton = clonedBySource.get(skeleton);
    if (!instanceSkeleton) {
      instanceSkeleton = skeleton.clone(`${skeleton.name}_${instanceLabel}`, mesh.id);
      for (const bone of instanceSkeleton.bones) {
        const sourceLinkedNode = bone.getTransformNode();
        if (!sourceLinkedNode) {
          continue;
        }
        const clonedLinkedNode = findLinkedNodeClone(root, sourceLinkedNode);
        if (clonedLinkedNode) {
          bone.linkTransformNode(clonedLinkedNode);
        }
      }
      clonedBySource.set(skeleton, instanceSkeleton);
    }

    mesh.skeleton = instanceSkeleton;
  }
}

function refreshClonedRigMatrices(
  anchor: TransformNode,
  root: TransformNode,
  skinnedMesh: AbstractMesh | null
): void {
  anchor.computeWorldMatrix(true);

  const stack: TransformNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    node.computeWorldMatrix(true);
    for (const child of node.getChildren()) {
      if (child instanceof TransformNode || child instanceof AbstractMesh) {
        stack.push(child);
      }
    }
  }

  if (!skinnedMesh?.skeleton) {
    return;
  }

  skinnedMesh.computeWorldMatrix(true);
  const skeleton = skinnedMesh.skeleton;
  skeleton.prepare();
  for (const bone of skeleton.bones) {
    bone.getTransformNode()?.computeWorldMatrix(true);
  }
}

export class EnemyTurretSystem {
  private readonly scene: Scene;
  private readonly config: EnemyTurretConfig;
  private readonly showAimDebug: boolean;
  private readonly showBulletDebug: boolean;
  private readonly yawAxis: Vector3;
  private readonly pitchAxis: Vector3;
  private readonly ammoTemplateMesh: Mesh | null;
  private readonly colliderTemplateMesh: Mesh | null;
  private readonly instances: EnemyTurretInstance[] = [];
  private readonly activeBulletTracers: EnemyBulletTracer[] = [];
  private readonly persistedBulletDebug: BulletDebugVisual[] = [];
  private bulletCloneSerial = 0;
  private tankBody: PhysicsBody | null = null;
  private tankColliderMesh: Mesh | null = null;
  private ignoredPlayerBodies: PhysicsBody[] = [];
  private playerAimWorldPos: Vector3 | null = null;
  private onPlayerDamage: ((amount: number) => void) | null = null;
  private onBulletImpact: ((worldPos: Vector3) => void) | null = null;
  private onTurretDestroyed: ((worldPos: Vector3) => void) | null = null;
  private readonly turretColliderMeshIds = new Set<number>();
  private readonly damageFlashColor: Color3;
  private readonly damageFlashDuration: number;
  private readonly damageFlashMaxAlpha: number;
  private disposed = false;
  private readonly syncColliderMatricesBeforePhysics = (): void => {
    for (const instance of this.instances) {
      if (instance.alive && instance.colliderMesh) {
        instance.colliderMesh.computeWorldMatrix(true);
      }
    }
  };

  public constructor(options: EnemyTurretSystemOptions) {
    this.scene = options.scene;
    this.config = options.config;
    this.showAimDebug = options.config.debug?.showAimVectors ?? false;
    this.showBulletDebug = options.config.debug?.showBulletVectors ?? false;
    this.yawAxis = axisFromConfig(options.config.rig.yawAxis, options.config.rig.yawSign);
    this.pitchAxis = axisFromConfig(options.config.rig.pitchAxis, options.config.rig.pitchSign);
    this.ammoTemplateMesh = findMeshInContainer(options.enemiesContainer, "AMMO_turret");
    this.colliderTemplateMesh = findMeshInContainer(options.enemiesContainer, "COL_enemy_turret");
    const flashConfig = options.config.damageFlash;
    const flashRgb = flashConfig?.color ?? [
      DEFAULT_DAMAGE_FLASH.color.r,
      DEFAULT_DAMAGE_FLASH.color.g,
      DEFAULT_DAMAGE_FLASH.color.b
    ];
    this.damageFlashColor = new Color3(flashRgb[0], flashRgb[1], flashRgb[2]);
    this.damageFlashDuration = Math.max(0.01, flashConfig?.durationSeconds ?? DEFAULT_DAMAGE_FLASH.durationSeconds);
    this.damageFlashMaxAlpha = clamp(flashConfig?.maxAlpha ?? DEFAULT_DAMAGE_FLASH.maxAlpha, 0, 1);
    if (!this.ammoTemplateMesh) {
      console.warn("[EnemyTurretSystem] Missing AMMO_turret template mesh in enemies.glb.");
    } else {
      this.prepareAmmoTemplateMesh(this.ammoTemplateMesh);
    }
    if (!this.colliderTemplateMesh) {
      console.warn("[EnemyTurretSystem] Missing COL_enemy_turret template mesh in enemies.glb.");
    }

    this.hideTemplateAssets(options.enemiesContainer);
    this.spawnTurrets(options.terrainContainer, options.enemiesContainer);
    void this.initializeDamageParticles();
    this.scene.onBeforePhysicsObservable.add(this.syncColliderMatricesBeforePhysics);
  }

  /** Identifie une tourelle touchée par un raycast / collision physique du joueur. */
  public resolveTurretIdFromWeaponHit(hit: unknown): string | null {
    return this.resolveInstanceFromWeaponHit(hit)?.spawnId ?? null;
  }

  public isTurretColliderMesh(mesh: AbstractMesh | null | undefined): boolean {
    return mesh != null && this.turretColliderMeshIds.has(mesh.uniqueId);
  }

  public applyDamageToTurret(spawnId: string, amount: number): boolean {
    const instance = this.instances.find((candidate) => candidate.spawnId === spawnId);
    if (!instance) {
      return false;
    }
    this.applyDamageToInstance(instance, amount);
    return true;
  }

  public applyExplosionDamageAt(worldPos: Vector3, amount: number, radius: number): void {
    if (amount <= 0 || radius <= 0) {
      return;
    }
    const radiusSq = radius * radius;
    for (const instance of this.instances) {
      if (!instance.alive) {
        continue;
      }
      const center =
        instance.colliderMesh?.getAbsolutePosition() ?? instance.anchor.getAbsolutePosition();
      if (Vector3.DistanceSquared(worldPos, center) <= radiusSq) {
        this.applyDamageToInstance(instance, amount);
      }
    }
  }

  public bindPlayerTarget(target: EnemyTurretPlayerTarget): void {
    this.tankBody = target.tankBody;
    this.tankColliderMesh = target.tankColliderMesh;
    this.ignoredPlayerBodies = target.ignoreBodies ?? [];
    this.onPlayerDamage = target.onDamage;
    this.onBulletImpact = target.onBulletImpact ?? null;
    this.onTurretDestroyed = target.onTurretDestroyed ?? null;
  }

  public get instanceCount(): number {
    return this.instances.length;
  }

  public getRadarTargets(): EnemyTurretRadarTarget[] {
    return this.instances
      .filter((instance) => instance.alive)
      .map((instance) => ({
        id: instance.spawnId,
        position: instance.anchor.getAbsolutePosition().clone()
      }));
  }

  /** Points de visée des tourelles vivantes pour le lock-on missiles. */
  public getLockTargets(): EnemyLockTarget[] {
    return this.instances
      .filter((instance) => instance.alive)
      .map((instance) => ({
        id: instance.spawnId,
        aimPoint: (
          instance.colliderMesh?.getAbsolutePosition() ?? instance.anchor.getAbsolutePosition()
        ).clone()
      }));
  }

  public getLockTargetAimPoint(spawnId: string): Vector3 | null {
    const instance = this.instances.find((candidate) => candidate.alive && candidate.spawnId === spawnId);
    if (!instance) {
      return null;
    }
    return (
      instance.colliderMesh?.getAbsolutePosition() ?? instance.anchor.getAbsolutePosition()
    ).clone();
  }

  public update(dt: number, aimTarget: TransformNode | AbstractMesh): void {
    if (this.instances.length === 0) {
      return;
    }

    aimTarget.computeWorldMatrix(true);
    const targetWorldPos = aimTarget.getAbsolutePosition();
    this.playerAimWorldPos = targetWorldPos.clone();
    const detectionRangeSq = this.config.detectionRange * this.config.detectionRange;

    for (const instance of this.instances) {
      if (!instance.alive) {
        continue;
      }

      const inRange =
        Vector3.DistanceSquared(targetWorldPos, instance.anchor.getAbsolutePosition()) <= detectionRangeSq;

      if (inRange) {
        instance.tracking = true;
        this.updateAimTargets(instance, targetWorldPos);
      } else {
        instance.tracking = false;
      }

      this.applyTracking(instance, dt);
      this.updateFiring(instance, dt);
      this.updateDamageFlash(instance, dt);
      this.updateAimDebug(instance, targetWorldPos);
    }

    this.updateBulletTracers(dt);
    this.updatePersistedBulletDebug(dt);
  }

  public dispose(): void {
    this.disposed = true;
    this.scene.onBeforePhysicsObservable.removeCallback(this.syncColliderMatricesBeforePhysics);

    for (const tracer of this.activeBulletTracers) {
      tracer.mesh.material?.dispose();
      tracer.mesh.dispose();
    }
    this.activeBulletTracers.length = 0;
    this.disposeAllBulletDebugVisuals();

    for (const instance of this.instances) {
      instance.debugAimLine?.dispose();
      instance.debugBarrelLine?.dispose();
      instance.debugTargetMarker?.dispose();
      instance.debugPivotMarker?.dispose();
      instance.damageParticles?.dispose();
      instance.damageParticles = null;
      instance.physicsShape?.dispose();
      instance.physicsBody?.dispose();
      instance.root.dispose(false, true);
      instance.anchor.dispose();
    }
    this.instances.length = 0;
    this.turretColliderMeshIds.clear();
  }

  private async initializeDamageParticles(): Promise<void> {
    const healthMax = Math.max(1, this.config.combat.healthMax);
    await Promise.all(
      this.instances.map(async (instance) => {
        const bundle = await createSingleDamageParticleBundle(
          this.scene,
          instance.damageSmoke,
          `enemy_turret_${instance.spawnId}`,
          `[EnemyTurretSystem] Missing turret_damage_smoke emitter for spawn "${instance.spawnId}".`
        );
        if (!bundle) {
          return;
        }
        if (this.disposed || !instance.alive) {
          bundle.dispose();
          return;
        }
        instance.damageParticles = bundle;
        instance.damageParticles.syncHealthPercent(clamp((instance.health / healthMax) * 100, 0, 100));
      })
    );
  }

  private hideTemplateAssets(enemiesContainer: AssetContainer): void {
    for (const mesh of enemiesContainer.meshes) {
      if (matchNodeName(mesh.name, "AMMO_turret")) {
        continue;
      }
      mesh.setEnabled(false);
      mesh.isVisible = false;
    }
    for (const node of enemiesContainer.transformNodes) {
      node.setEnabled(false);
    }
  }

  private spawnTurrets(terrainContainer: AssetContainer, enemiesContainer: AssetContainer): void {
    const prefix = this.config.spawnNodePrefix;
    const spawnNodes = [...terrainContainer.transformNodes, ...terrainContainer.meshes].filter((node) =>
      node.name.trim().toUpperCase().startsWith(prefix.trim().toUpperCase())
    );

    if (spawnNodes.length === 0) {
      console.warn(`[EnemyTurretSystem] No ${prefix}* spawn nodes found in terrain.`);
      return;
    }

    const armatureRoot = findArmatureRoot(enemiesContainer);
    if (!armatureRoot) {
      console.warn("[EnemyTurretSystem] Missing turret_armature template in enemies.glb.");
      return;
    }

    for (const spawnNode of spawnNodes) {
      const spawnId = parseSpawnId(spawnNode.name, prefix);
      if (!spawnId) {
        continue;
      }

      const instanceLabel = sanitizeNodeName(`${prefix}${spawnId}`);
      const anchor = new TransformNode(`enemy_turret_anchor_${instanceLabel}`, this.scene);
      applySpawnTransform(spawnNode, anchor);

      anchor.computeWorldMatrix(true);
      const root = armatureRoot.clone(`enemy_turret_armature_${instanceLabel}`, anchor, false);
      if (!root) {
        console.warn(
          `[EnemyTurretSystem] Failed to clone turret_armature for spawn "${spawnNode.name}".`
        );
        anchor.dispose();
        continue;
      }

      root.setEnabled(true);
      for (const mesh of root.getChildMeshes(true)) {
        mesh.isPickable = false;
        mesh.setEnabled(true);
        mesh.isVisible = true;
      }

      isolateInstanceSkeletons(root, instanceLabel);

      const yawControl = resolveBoneControlOnRoot(root, this.config.rig.yawBone);
      const pitchControl = resolveBoneControlOnRoot(root, this.config.rig.pitchBone);
      const muzzle1 = findNodeOnRoot(root, "turret_muzzle_1");
      const muzzle2 = findNodeOnRoot(root, "turret_muzzle_2");
      const damageSmoke = findNodeOnRoot(root, "turret_damage_smoke");

      const skinnedMesh = root.getChildMeshes(true).find((mesh) => mesh.skeleton) ?? null;
      if (skinnedMesh) {
        refreshSkinnedMeshRig(skinnedMesh, anchor);
      }

      if (!yawControl.bone && !yawControl.transformNode) {
        console.warn(
          `[EnemyTurretSystem] Missing yaw bone "${this.config.rig.yawBone}" for spawn "${spawnNode.name}".`
        );
      }
      if (!pitchControl.bone && !pitchControl.transformNode) {
        console.warn(
          `[EnemyTurretSystem] Missing pitch bone "${this.config.rig.pitchBone}" for spawn "${spawnNode.name}".`
        );
      }

      refreshClonedRigMatrices(anchor, root, skinnedMesh);

      const muzzle1LocalInPitchBone =
        muzzle1 && pitchControl.bone
          ? (() => {
              muzzle1.computeWorldMatrix(true);
              return captureBoneLocalOffset(
                muzzle1.getAbsolutePosition(),
                pitchControl,
                skinnedMesh,
                root
              );
            })()
          : null;
      const muzzle2LocalInPitchBone =
        muzzle2 && pitchControl.bone
          ? (() => {
              muzzle2.computeWorldMatrix(true);
              return captureBoneLocalOffset(
                muzzle2.getAbsolutePosition(),
                pitchControl,
                skinnedMesh,
                root
              );
            })()
          : null;

      const barrelForwardLocalInPitchBone =
        muzzle1 && pitchControl.bone
          ? (() => {
              muzzle1.computeWorldMatrix(true);
              const forward = muzzle1.getDirection(Axis.Z);
              if (forward.lengthSquared() > 1e-6) {
                forward.normalize();
              } else {
                forward.copyFrom(Axis.Z);
              }
              return captureBoneLocalDirection(forward, pitchControl, skinnedMesh, root);
            })()
          : null;

      const pitchReference = resolveControlReference(yawControl, anchor);
      const yawBaseLocalRotation = getControlLocalRotation(yawControl, anchor);
      const pitchBaseLocalRotation =
        getBoneLocalRotation(pitchControl, pitchReference) ??
        getControlLocalRotation(pitchControl, pitchReference);

      anchor.computeWorldMatrix(true);
      const pitchPivotLocalInAnchor =
        getBoneLocalInReference(pitchControl, skinnedMesh, root, anchor) ??
        worldToLocalInReference(
          this.getMuzzleWorldPos(
            muzzle1,
            muzzle2,
            pitchControl,
            pitchReference,
            skinnedMesh,
            root,
            muzzle1LocalInPitchBone,
            muzzle2LocalInPitchBone
          ),
          anchor
        );

      const debugMeshes = this.showAimDebug
        ? this.createAimDebugMeshes(instanceLabel)
        : {
            debugAimLine: null,
            debugBarrelLine: null,
            debugTargetMarker: null,
            debugPivotMarker: null
          };

      const colliderMesh =
        this.resolveInstanceColliderMesh(
          root,
          instanceLabel,
          yawControl,
          pitchReference
        );
      let physicsBody: PhysicsBody | null = null;
      let physicsShape: PhysicsShape | null = null;
      if (colliderMesh) {
        const physics = this.setupTurretColliderPhysics(colliderMesh);
        physicsBody = physics.body;
        physicsShape = physics.shape;
        this.turretColliderMeshIds.add(colliderMesh.uniqueId);
      } else {
        console.warn(
          `[EnemyTurretSystem] Missing COL_enemy_turret collider for spawn "${spawnNode.name}".`
        );
      }

      console.info(
        `[EnemyTurretSystem] ${instanceLabel}: spawn=${spawnNode.getAbsolutePosition().asArray()} anchor=${anchor.getAbsolutePosition().asArray()} root=${root.getAbsolutePosition().asArray()} yawBone=${Boolean(yawControl.bone)} pitchBone=${Boolean(pitchControl.bone)} muzzle1=${Boolean(muzzle1)} muzzle2=${Boolean(muzzle2)} pitchPivotLocal=${pitchPivotLocalInAnchor.asArray()}`
      );

      this.instances.push({
        spawnId,
        anchor,
        root,
        skinnedMesh,
        yawControl,
        pitchControl,
        pitchReference,
        muzzle1,
        muzzle2,
        damageSmoke,
        damageParticles: null,
        muzzle1LocalInPitchBone,
        muzzle2LocalInPitchBone,
        barrelForwardLocalInPitchBone,
        yawBaseLocalRotation,
        pitchBaseLocalRotation,
        pitchPivotLocalInAnchor,
        currentYawDeg: 0,
        currentPitchDeg: 0,
        targetYawDeg: 0,
        targetPitchDeg: 0,
        tracking: false,
        nextBarrelIndex: 0,
        fireCooldown: 0,
        colliderMesh,
        physicsBody,
        physicsShape,
        health: Math.max(1, this.config.combat.healthMax),
        alive: true,
        flashMaterials: setupTurretFlashMaterials(
          root,
          skinnedMesh,
          this.config.meshName,
          instanceLabel
        ),
        damageFlashRemaining: 0,
        ...debugMeshes
      });
    }

    if (this.instances.length > 0) {
      console.info(`[EnemyTurretSystem] Spawned ${this.instances.length} turret(s).`);
      for (const instance of this.instances) {
        if (instance.flashMaterials.length === 0) {
          console.warn(
            `[EnemyTurretSystem] No visual damage-flash material for turret "${instance.spawnId}" (expected ${this.config.meshName}).`
          );
        }
      }
    }
  }

  private setupTurretColliderPhysics(colliderMesh: Mesh): { body: PhysicsBody; shape: PhysicsShape } {
    colliderMesh.isPickable = true;
    colliderMesh.isVisible = false;
    colliderMesh.setEnabled(true);
    colliderMesh.computeWorldMatrix(true);

    const body = new PhysicsBody(colliderMesh, PhysicsMotionType.ANIMATED, false, this.scene);
    body.disablePreStep = false;
    const shape = new PhysicsShapeMesh(colliderMesh, this.scene);
    shape.filterMembershipMask = 8;
    shape.filterCollideMask = 0xffffffff;
    body.shape = shape;

    return { body, shape };
  }

  private resolveInstanceColliderMesh(
    root: TransformNode,
    instanceLabel: string,
    yawControl: BoneControl,
    pitchReference: TransformNode
  ): Mesh | null {
    const existing = findColliderMeshOnRoot(root, this.scene);
    if (existing) {
      return existing;
    }

    if (!this.colliderTemplateMesh) {
      return null;
    }

    const parentNode =
      yawControl.transformNode ??
      yawControl.bone?.getTransformNode() ??
      pitchReference;
    const cloned = this.colliderTemplateMesh.clone(
      `COL_enemy_turret_${instanceLabel}`,
      parentNode,
      false
    );
    if (!cloned) {
      return null;
    }
    if (cloned instanceof Mesh && cloned.getTotalVertices() > 0) {
      return cloned;
    }
    if (cloned instanceof AbstractMesh && cloned.getTotalVertices() > 0) {
      return cloned as Mesh;
    }

    cloned.dispose();
    return null;
  }

  private resolveInstanceFromWeaponHit(hit: unknown): EnemyTurretInstance | null {
    const collidedAgainst = (hit as { collidedAgainst?: PhysicsBody }).collidedAgainst;
    if (collidedAgainst) {
      for (const instance of this.instances) {
        if (instance.alive && instance.physicsBody === collidedAgainst) {
          return instance;
        }
      }
    }

    const body = (hit as { body?: PhysicsBody }).body;
    if (body) {
      for (const instance of this.instances) {
        if (instance.alive && instance.physicsBody === body) {
          return instance;
        }
      }
    }

    const mesh = (hit as { collidedAgainstMesh?: AbstractMesh }).collidedAgainstMesh;
    if (mesh) {
      for (const instance of this.instances) {
        if (instance.alive && instance.colliderMesh?.uniqueId === mesh.uniqueId) {
          return instance;
        }
      }
    }

    return null;
  }

  private applyDamageToInstance(instance: EnemyTurretInstance, amount: number): void {
    if (!instance.alive || amount <= 0) {
      return;
    }
    instance.health = Math.max(0, instance.health - amount);
    instance.damageParticles?.syncHealthPercent(
      clamp((instance.health / Math.max(1, this.config.combat.healthMax)) * 100, 0, 100)
    );
    this.triggerDamageFlash(instance);
    if (instance.health <= 0) {
      this.destroyInstance(instance);
    }
  }

  private triggerDamageFlash(instance: EnemyTurretInstance): void {
    if (instance.flashMaterials.length === 0 || this.damageFlashMaxAlpha <= 0) {
      return;
    }
    instance.damageFlashRemaining = this.damageFlashDuration;
    applyDamageFlashEmissive(
      instance.flashMaterials,
      this.damageFlashColor,
      this.damageFlashMaxAlpha
    );
  }

  private updateDamageFlash(instance: EnemyTurretInstance, dt: number): void {
    if (instance.damageFlashRemaining <= 0) {
      return;
    }

    instance.damageFlashRemaining = Math.max(0, instance.damageFlashRemaining - dt);
    if (instance.damageFlashRemaining <= 0) {
      restoreDamageFlashEmissive(instance.flashMaterials);
      return;
    }

    const t = instance.damageFlashRemaining / this.damageFlashDuration;
    applyDamageFlashEmissive(
      instance.flashMaterials,
      this.damageFlashColor,
      this.damageFlashMaxAlpha * t
    );
  }

  private getTurretDeathExplosionPosition(instance: EnemyTurretInstance): Vector3 {
    if (instance.damageSmoke) {
      instance.damageSmoke.computeWorldMatrix(true);
      return instance.damageSmoke.getAbsolutePosition().clone();
    }
    return instance.anchor.getAbsolutePosition().clone();
  }

  private destroyInstance(instance: EnemyTurretInstance): void {
    instance.alive = false;
    instance.tracking = false;

    this.onTurretDestroyed?.(this.getTurretDeathExplosionPosition(instance));

    if (instance.colliderMesh) {
      this.turretColliderMeshIds.delete(instance.colliderMesh.uniqueId);
      instance.colliderMesh.setEnabled(false);
      instance.colliderMesh.isPickable = false;
    }

    if (instance.physicsShape) {
      instance.physicsShape.dispose();
      instance.physicsShape = null;
    }
    if (instance.physicsBody) {
      instance.physicsBody.dispose();
      instance.physicsBody = null;
    }

    for (const mesh of instance.root.getChildMeshes(true)) {
      mesh.setEnabled(false);
      mesh.isVisible = false;
    }

    instance.debugAimLine?.dispose();
    instance.debugAimLine = null;
    instance.debugBarrelLine?.dispose();
    instance.debugBarrelLine = null;
    instance.debugTargetMarker?.dispose();
    instance.debugTargetMarker = null;
    instance.debugPivotMarker?.dispose();
    instance.debugPivotMarker = null;
    instance.damageParticles?.dispose();
    instance.damageParticles = null;
    restoreDamageFlashEmissive(instance.flashMaterials);
    instance.damageFlashRemaining = 0;
  }

  private updateAimTargets(instance: EnemyTurretInstance, tankWorldPos: Vector3): void {
    const invAnchorMatrix = instance.anchor.getWorldMatrix().clone().invert();
    const localTarget = Vector3.TransformCoordinates(tankWorldPos, invAnchorMatrix);

    const aimX = localTarget.x * this.config.rig.yawAimXSign;
    const aimZ = localTarget.z * this.config.rig.yawAimZSign;
    const desiredYawRad = Math.atan2(aimX, aimZ);
    instance.targetYawDeg = (desiredYawRad * 180) / Math.PI * this.config.rig.yawSign;

    // Pitch en espace anchor (indépendant du yaw courant du turret_body) — sinon l'élévation
    // dépend de l'azimut du tank autour de la tourelle.
    const targetInAnchor = localTarget;

    const dx = targetInAnchor.x - instance.pitchPivotLocalInAnchor.x;
    const dz = targetInAnchor.z - instance.pitchPivotLocalInAnchor.z;
    const distHoriz = Math.sqrt(dx * dx + dz * dz);
    const heightDelta = targetInAnchor.y - instance.pitchPivotLocalInAnchor.y;
    const desiredPitchRad = Math.atan2(heightDelta, distHoriz);

    instance.targetPitchDeg = clamp(
      ((desiredPitchRad * 180) / Math.PI) * this.config.rig.pitchAimSign,
      this.config.tracking.minPitchDeg,
      this.config.tracking.maxPitchDeg
    );
  }

  private applyTracking(instance: EnemyTurretInstance, dt: number): void {
    instance.currentYawDeg = moveTowardsAngle(
      instance.currentYawDeg,
      instance.targetYawDeg,
      this.config.tracking.yawSpeedDeg * dt
    );
    instance.currentPitchDeg = moveTowards(
      instance.currentPitchDeg,
      instance.targetPitchDeg,
      this.config.tracking.pitchSpeedDeg * dt
    );

    setControlAxisAngle(
      instance.yawControl,
      instance.yawBaseLocalRotation,
      this.yawAxis,
      toRadians(instance.currentYawDeg),
      instance.anchor
    );

    instance.pitchReference.computeWorldMatrix(true);

    setBoneAxisAngle(
      instance.pitchControl,
      instance.pitchBaseLocalRotation,
      this.pitchAxis,
      toRadians(instance.currentPitchDeg),
      instance.pitchReference
    );

    refreshClonedRigMatrices(instance.anchor, instance.root, instance.skinnedMesh);
  }

  private updateFiring(instance: EnemyTurretInstance, dt: number): void {
    if (!instance.tracking || !this.ammoTemplateMesh) {
      return;
    }

    const rate = this.config.combat.shotsPerSecondPerBarrel;
    if (rate <= 0) {
      return;
    }

    instance.fireCooldown -= dt;
    if (instance.fireCooldown > 0) {
      return;
    }

    refreshClonedRigMatrices(instance.anchor, instance.root, instance.skinnedMesh);

    const muzzles = this.getActiveMuzzles(instance);
    if (muzzles.length === 0) {
      return;
    }

    const barrelIndex = instance.nextBarrelIndex % muzzles.length;
    const aimPoint =
      this.playerAimWorldPos?.clone() ??
      this.getAimPointWorldPos(instance.anchor.getAbsolutePosition());
    if (!this.isReadyToFire(instance, aimPoint, barrelIndex)) {
      return;
    }

    this.fireFromMuzzle(instance, barrelIndex);
    instance.nextBarrelIndex = (barrelIndex + 1) % muzzles.length;
    instance.fireCooldown = this.getFireIntervalSeconds(muzzles.length);
  }

  private getActiveMuzzles(instance: EnemyTurretInstance): Array<TransformNode | AbstractMesh> {
    this.resolveMuzzles(instance);
    const muzzles: Array<TransformNode | AbstractMesh> = [];
    if (instance.muzzle1) {
      muzzles.push(instance.muzzle1);
    }
    if (instance.muzzle2) {
      muzzles.push(instance.muzzle2);
    }
    return muzzles;
  }

  private resolveMuzzles(instance: EnemyTurretInstance): void {
    if (!instance.muzzle1) {
      instance.muzzle1 = findNodeOnRoot(instance.root, "turret_muzzle_1");
    }
    if (!instance.muzzle2) {
      instance.muzzle2 = findNodeOnRoot(instance.root, "turret_muzzle_2");
    }
  }

  private prepareAmmoTemplateMesh(mesh: Mesh): void {
    if (!mesh.getScene()) {
      this.scene.addMesh(mesh);
    }
    mesh.setParent(null);
    mesh.isVisible = false;
    mesh.isPickable = false;
    // Garder le mesh actif (comme AMMO_balle du tank) pour éviter clones désactivés / shaders invalides.
  }

  private prepareTracerMesh(mesh: Mesh): void {
    if (!mesh.getScene()) {
      this.scene.addMesh(mesh);
    }
    mesh.isPickable = false;
    mesh.isVisible = true;
    mesh.setEnabled(true);
    mesh.scaling.y = Math.abs(mesh.scaling.y);
    if (mesh.material) {
      mesh.material = mesh.material.clone(`${mesh.material.name}_enemy_bullet`);
    }
  }

  private getFireIntervalSeconds(barrelCount: number): number {
    const rate = this.config.combat.shotsPerSecondPerBarrel;
    if (rate <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    const count = Math.max(barrelCount, 1);
    return 1 / (rate * count);
  }

  private getBulletMaxDistance(): number {
    return (
      this.config.combat.muzzleVelocity * this.config.combat.projectileMaxLifeSeconds
    );
  }

  private fireFromMuzzle(instance: EnemyTurretInstance, barrelIndex: number): void {
    if (!this.ammoTemplateMesh) {
      return;
    }

    refreshClonedRigMatrices(instance.anchor, instance.root, instance.skinnedMesh);

    const muzzlePos = this.resolveMuzzleWorldPosition(instance, barrelIndex);
    if (!muzzlePos) {
      console.warn(
        `[EnemyTurretSystem] Fire skipped: could not resolve muzzle world position (spawn=${instance.spawnId}).`
      );
      return;
    }
    const dir = this.getBarrelAimDirection(instance);
    if (!dir) {
      return;
    }
    const spawnOffset = this.config.combat.muzzleSpawnOffset;
    const origin = muzzlePos.add(dir.scale(spawnOffset)).clone();
    const bulletRotation = Quaternion.FromLookDirectionRH(dir, Axis.Y);
    const maxDistance = this.getBulletMaxDistance();
    const { hitPoint, hitDistance, hitsTank } = this.raycastBulletHit(origin, dir, maxDistance);

    const mesh = this.ammoTemplateMesh.clone(
      `enemy_turret_bullet_${instance.spawnId}_${this.bulletCloneSerial++}`,
      null
    );
    if (!mesh) {
      console.warn(
        `[EnemyTurretSystem] Fire failed: bullet mesh clone returned null (spawn=${instance.spawnId}).`
      );
      return;
    }
    this.prepareTracerMesh(mesh);
    mesh.position.copyFrom(origin);
    mesh.rotationQuaternion = bulletRotation.clone();

    const debugVisual =
      this.showBulletDebug
        ? this.createBulletDebugVisual(
            origin,
            muzzlePos,
            hitPoint,
            `spawn${instance.spawnId}_b${barrelIndex}_${this.bulletCloneSerial}`
          )
        : null;

    this.activeBulletTracers.push({
      mesh,
      from: origin,
      muzzlePos,
      dir,
      hitPoint,
      hitDistance,
      traveled: 0,
      speed: this.config.combat.muzzleVelocity,
      rotation: bulletRotation,
      hitsTank,
      onHitPlayerDamage: hitsTank && this.onPlayerDamage ? this.onPlayerDamage : null,
      debugVisual
    });
  }

  private resolveMuzzleWorldPosition(instance: EnemyTurretInstance, barrelIndex: number): Vector3 | null {
    const localOffset =
      barrelIndex === 0 ? instance.muzzle1LocalInPitchBone : instance.muzzle2LocalInPitchBone;
    if (localOffset && instance.pitchControl.bone) {
      return applyBoneLocalOffset(
        localOffset,
        instance.pitchControl,
        instance.skinnedMesh,
        instance.root
      );
    }

    const muzzle = barrelIndex === 0 ? instance.muzzle1 : instance.muzzle2;
    if (!muzzle) {
      return null;
    }
    muzzle.computeWorldMatrix(true);
    return muzzle.getAbsolutePosition().clone();
  }

  private getAimPointWorldPos(fallbackTarget: Vector3): Vector3 {
    if (this.tankColliderMesh) {
      this.tankColliderMesh.computeWorldMatrix(true);
      return this.tankColliderMesh.getAbsolutePosition().clone();
    }
    return fallbackTarget.clone();
  }

  private getBarrelAimDirection(instance: EnemyTurretInstance): Vector3 | null {
    if (instance.barrelForwardLocalInPitchBone && instance.pitchControl.bone) {
      return applyBoneLocalDirection(
        instance.barrelForwardLocalInPitchBone,
        instance.pitchControl,
        instance.skinnedMesh,
        instance.root
      );
    }
    return null;
  }

  private isReadyToFire(
    instance: EnemyTurretInstance,
    aimPoint: Vector3,
    barrelIndex: number
  ): boolean {
    const barrelDir = this.getBarrelAimDirection(instance);
    if (!barrelDir) {
      return false;
    }

    const muzzlePos = this.resolveMuzzleWorldPosition(instance, barrelIndex);
    if (!muzzlePos) {
      return false;
    }

    const toTarget = aimPoint.subtract(muzzlePos);
    if (toTarget.lengthSquared() < 1e-6) {
      return false;
    }
    toTarget.normalize();

    const dot = Vector3.Dot(barrelDir, toTarget);
    const angleDeg =
      (Math.acos(clamp(dot, -1, 1)) * 180) / Math.PI;
    return angleDeg <= this.config.combat.fireAlignmentMaxAngleDeg;
  }

  private raycastBulletHit(
    origin: Vector3,
    dir: Vector3,
    maxDistance: number
  ): { hitPoint: Vector3; hitDistance: number; hitsTank: boolean } {
    const fallbackEnd = origin.add(dir.scale(maxDistance));
    const physics = this.scene.getPhysicsEngine();
    if (!physics) {
      return { hitPoint: fallbackEnd.clone(), hitDistance: maxDistance, hitsTank: false };
    }

    let segmentStart = origin.clone();
    let traveled = 0;
    const passthroughEpsilon = 0.05;
    const maxSegments = 1 + this.ignoredPlayerBodies.length;

    for (let segment = 0; segment < maxSegments; segment++) {
      const remaining = maxDistance - traveled;
      if (remaining <= 1e-6) {
        break;
      }

      const segmentEnd = segmentStart.add(dir.scale(remaining));
      const hit = physics.raycast(segmentStart, segmentEnd, {
        shouldHitTriggers: false,
        collideWith: 0xffffffff
      });

      if (!hit.hasHit) {
        return {
          hitPoint: segmentEnd.clone(),
          hitDistance: maxDistance,
          hitsTank: false
        };
      }

      hit.calculateHitDistance();
      let hitPoint = segmentEnd.clone();
      let segmentHitDistance = remaining;
      if (hit.hitPointWorld) {
        hitPoint = hit.hitPointWorld.clone();
        segmentHitDistance = Math.max(Vector3.Distance(segmentStart, hitPoint), 0.001);
      } else if (typeof hit.hitDistance === "number") {
        segmentHitDistance = Math.max(hit.hitDistance, 0.001);
        hitPoint = segmentStart.add(dir.scale(segmentHitDistance));
      }

      traveled += segmentHitDistance;

      if (this.isIgnoredPlayerBodyHit(hit)) {
        segmentStart = hitPoint.add(dir.scale(passthroughEpsilon));
        traveled = Math.min(traveled + passthroughEpsilon, maxDistance);
        continue;
      }

      return {
        hitPoint,
        hitDistance: Math.min(traveled, maxDistance),
        hitsTank: this.isTankRaycastHit(hit)
      };
    }

    return { hitPoint: fallbackEnd.clone(), hitDistance: maxDistance, hitsTank: false };
  }

  private isIgnoredPlayerBodyHit(hit: unknown): boolean {
    if (this.ignoredPlayerBodies.length === 0) {
      return false;
    }

    const collidedAgainst = (hit as { collidedAgainst?: PhysicsBody }).collidedAgainst;
    const body = (hit as { body?: PhysicsBody }).body;
    return this.ignoredPlayerBodies.some(
      (ignored) => ignored === collidedAgainst || ignored === body
    );
  }

  private isTankRaycastHit(hit: unknown): boolean {
    if (!this.tankBody) {
      return false;
    }
    const collidedAgainst = (hit as { collidedAgainst?: PhysicsBody }).collidedAgainst;
    if (collidedAgainst === this.tankBody) {
      return true;
    }
    const body = (hit as { body?: PhysicsBody }).body;
    if (body === this.tankBody) {
      return true;
    }
    const colliderId = this.tankColliderMesh?.uniqueId;
    if (colliderId == null) {
      return false;
    }
    const mesh = (hit as { collidedAgainstMesh?: AbstractMesh }).collidedAgainstMesh;
    return mesh?.uniqueId === colliderId;
  }

  private updateBulletTracers(dt: number): void {
    if (this.activeBulletTracers.length === 0) {
      return;
    }

    for (let i = this.activeBulletTracers.length - 1; i >= 0; i--) {
      const tracer = this.activeBulletTracers[i];
      tracer.traveled += tracer.speed * dt;
      if (tracer.traveled >= tracer.hitDistance) {
        this.onBulletImpact?.(tracer.hitPoint);
        if (tracer.onHitPlayerDamage) {
          const damage = this.config.combat.bulletDamage;
          if (damage > 0) {
            tracer.onHitPlayerDamage(damage);
          }
        }
        if (tracer.debugVisual) {
          this.releaseBulletDebugVisual(tracer.debugVisual);
        }
        tracer.mesh.material?.dispose();
        tracer.mesh.dispose();
        this.activeBulletTracers.splice(i, 1);
        continue;
      }
      tracer.mesh.position.copyFrom(tracer.from.add(tracer.dir.scale(tracer.traveled)));
      tracer.mesh.rotationQuaternion = tracer.rotation.clone();
      if (tracer.debugVisual) {
        this.updateBulletDebugTravelLine(tracer.debugVisual, tracer.from, tracer.mesh.position);
      }
    }
  }

  private createBulletDebugVisual(
    origin: Vector3,
    muzzlePos: Vector3,
    hitPoint: Vector3,
    suffix: string
  ): BulletDebugVisual {
    const originMarker = MeshBuilder.CreateSphere(
      `enemy_bullet_dbg_origin_${suffix}`,
      { diameter: 0.35, segments: 8 },
      this.scene
    );
    originMarker.isPickable = false;
    originMarker.renderingGroupId = 2;
    originMarker.setAbsolutePosition(origin);

    const muzzleMarker = MeshBuilder.CreateSphere(
      `enemy_bullet_dbg_muzzle_${suffix}`,
      { diameter: 0.28, segments: 8 },
      this.scene
    );
    muzzleMarker.isPickable = false;
    muzzleMarker.renderingGroupId = 2;
    muzzleMarker.setAbsolutePosition(muzzlePos);

    const hitMarker = MeshBuilder.CreateSphere(
      `enemy_bullet_dbg_hit_${suffix}`,
      { diameter: 0.22, segments: 8 },
      this.scene
    );
    hitMarker.isPickable = false;
    hitMarker.renderingGroupId = 2;
    hitMarker.setAbsolutePosition(hitPoint);

    const pathLine = MeshBuilder.CreateLines(
      `enemy_bullet_dbg_path_${suffix}`,
      { points: [origin, hitPoint], updatable: true },
      this.scene
    );
    pathLine.color = new Color3(0.2, 1, 0.35);
    pathLine.renderingGroupId = 2;
    pathLine.isPickable = false;

    const offsetLine = MeshBuilder.CreateLines(
      `enemy_bullet_dbg_offset_${suffix}`,
      { points: [muzzlePos, origin], updatable: true },
      this.scene
    );
    offsetLine.color = new Color3(1, 0.35, 0.85);
    offsetLine.renderingGroupId = 2;
    offsetLine.isPickable = false;

    const travelLine = MeshBuilder.CreateLines(
      `enemy_bullet_dbg_travel_${suffix}`,
      { points: [origin, origin], updatable: true },
      this.scene
    );
    travelLine.color = new Color3(0.35, 0.85, 1);
    travelLine.renderingGroupId = 2;
    travelLine.isPickable = false;

    return {
      originMarker,
      muzzleMarker,
      hitMarker,
      pathLine,
      offsetLine,
      travelLine,
      persistSeconds: 0
    };
  }

  private updateBulletDebugTravelLine(visual: BulletDebugVisual, from: Vector3, current: Vector3): void {
    MeshBuilder.CreateLines(
      visual.travelLine.name,
      { points: [from, current], instance: visual.travelLine },
      this.scene
    );
    visual.travelLine.isVisible = true;
  }

  private releaseBulletDebugVisual(visual: BulletDebugVisual, persistSeconds = 3): void {
    visual.persistSeconds = persistSeconds;
    this.persistedBulletDebug.push(visual);
  }

  private updatePersistedBulletDebug(dt: number): void {
    for (let i = this.persistedBulletDebug.length - 1; i >= 0; i--) {
      const visual = this.persistedBulletDebug[i];
      visual.persistSeconds -= dt;
      if (visual.persistSeconds <= 0) {
        this.disposeBulletDebugVisual(visual);
        this.persistedBulletDebug.splice(i, 1);
      }
    }
  }

  private disposeBulletDebugVisual(visual: BulletDebugVisual): void {
    visual.originMarker.dispose();
    visual.muzzleMarker.dispose();
    visual.hitMarker.dispose();
    visual.pathLine.dispose();
    visual.offsetLine.dispose();
    visual.travelLine.dispose();
  }

  private disposeAllBulletDebugVisuals(): void {
    for (const tracer of this.activeBulletTracers) {
      if (tracer.debugVisual) {
        this.disposeBulletDebugVisual(tracer.debugVisual);
      }
    }
    for (const visual of this.persistedBulletDebug) {
      this.disposeBulletDebugVisual(visual);
    }
    this.persistedBulletDebug.length = 0;
  }

  private getPitchPivotWorldPos(instance: EnemyTurretInstance): Vector3 {
    refreshClonedRigMatrices(instance.anchor, instance.root, instance.skinnedMesh);
    const fromBone = getBoneWorldPosition(
      instance.pitchControl,
      instance.skinnedMesh,
      instance.root
    );
    if (fromBone) {
      return fromBone;
    }
    return this.getMuzzleWorldPos(
      instance.muzzle1,
      instance.muzzle2,
      instance.pitchControl,
      instance.pitchReference,
      instance.skinnedMesh,
      instance.root,
      instance.muzzle1LocalInPitchBone,
      instance.muzzle2LocalInPitchBone
    );
  }

  private getMuzzleWorldPos(
    muzzle1: TransformNode | AbstractMesh | null,
    muzzle2: TransformNode | AbstractMesh | null,
    pitchControl: BoneControl,
    pitchReference: TransformNode,
    skinnedMesh: AbstractMesh | null,
    root: TransformNode,
    muzzle1LocalInPitchBone: Vector3 | null = null,
    muzzle2LocalInPitchBone: Vector3 | null = null
  ): Vector3 {
    if (muzzle1LocalInPitchBone && pitchControl.bone) {
      return applyBoneLocalOffset(muzzle1LocalInPitchBone, pitchControl, skinnedMesh, root);
    }
    if (muzzle2LocalInPitchBone && pitchControl.bone) {
      return applyBoneLocalOffset(muzzle2LocalInPitchBone, pitchControl, skinnedMesh, root);
    }
    const muzzle = muzzle1 ?? muzzle2;
    if (muzzle) {
      muzzle.computeWorldMatrix(true);
      return muzzle.getAbsolutePosition();
    }
    const fromBone = getBoneWorldPosition(pitchControl, skinnedMesh, root);
    if (fromBone) {
      return fromBone;
    }
    return pitchReference.getAbsolutePosition();
  }

  private createAimDebugMeshes(instanceLabel: string): {
    debugAimLine: LinesMesh;
    debugBarrelLine: LinesMesh;
    debugTargetMarker: AbstractMesh;
    debugPivotMarker: AbstractMesh;
  } {
    const suffix = instanceLabel;
    const debugAimLine = MeshBuilder.CreateLines(
      `enemy_turret_aim_${suffix}`,
      { points: [Vector3.Zero(), Vector3.Zero()], updatable: true },
      this.scene
    );
    debugAimLine.color = new Color3(1, 1, 0);
    debugAimLine.renderingGroupId = 2;
    debugAimLine.isPickable = false;

    const debugBarrelLine = MeshBuilder.CreateLines(
      `enemy_turret_barrel_${suffix}`,
      { points: [Vector3.Zero(), Vector3.Zero()], updatable: true },
      this.scene
    );
    debugBarrelLine.color = new Color3(0.2, 0.6, 1);
    debugBarrelLine.renderingGroupId = 2;
    debugBarrelLine.isPickable = false;

    const debugTargetMarker = MeshBuilder.CreateSphere(
      `enemy_turret_target_${suffix}`,
      { diameter: 0.35, segments: 8 },
      this.scene
    );
    debugTargetMarker.isPickable = false;
    debugTargetMarker.renderingGroupId = 2;

    const debugPivotMarker = MeshBuilder.CreateSphere(
      `enemy_turret_pivot_${suffix}`,
      { diameter: 0.22, segments: 8 },
      this.scene
    );
    debugPivotMarker.isPickable = false;
    debugPivotMarker.renderingGroupId = 2;

    return { debugAimLine, debugBarrelLine, debugTargetMarker, debugPivotMarker };
  }

  private updateAimDebug(instance: EnemyTurretInstance, targetWorldPos: Vector3): void {
    if (!this.showAimDebug) {
      return;
    }

    const pivotWorld = this.getPitchPivotWorldPos(instance);

    if (instance.debugPivotMarker) {
      instance.debugPivotMarker.setAbsolutePosition(pivotWorld);
      instance.debugPivotMarker.isVisible = instance.tracking;
    }

    if (instance.debugTargetMarker) {
      instance.debugTargetMarker.setAbsolutePosition(targetWorldPos);
      instance.debugTargetMarker.isVisible = instance.tracking;
    }

    if (instance.debugAimLine) {
      if (instance.tracking) {
        MeshBuilder.CreateLines(
          instance.debugAimLine.name,
          { points: [pivotWorld, targetWorldPos], instance: instance.debugAimLine },
          this.scene
        );
        instance.debugAimLine.isVisible = true;
      } else {
        instance.debugAimLine.isVisible = false;
      }
    }

    const muzzlePos = this.resolveMuzzleWorldPosition(instance, instance.muzzle1 ? 0 : 1);
    if (instance.debugBarrelLine && muzzlePos) {
      if (instance.tracking) {
        const forward =
          this.getBarrelAimDirection(instance) ??
          this.getAimPointWorldPos(targetWorldPos).subtract(muzzlePos).normalize();
        const to = muzzlePos.add(forward.scale(8));
        MeshBuilder.CreateLines(
          instance.debugBarrelLine.name,
          { points: [muzzlePos, to], instance: instance.debugBarrelLine },
          this.scene
        );
        instance.debugBarrelLine.isVisible = true;
      } else {
        instance.debugBarrelLine.isVisible = false;
      }
    }
  }
}
