import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { Axis, Space } from "@babylonjs/core/Maths/math.axis";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { EnemyTurretConfig } from "../config/enemiesController";
import {
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
}

function matchNodeName(candidateName: string, wanted: string): boolean {
  const n = candidateName.trim().toLowerCase();
  return n === wanted || n.startsWith(`${wanted}.`);
}

function findArmatureRoot(container: AssetContainer): TransformNode | null {
  return (
    container.transformNodes.find((node) => matchNodeName(node.name, "turret_armature")) ?? null
  );
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

function parentNodesToPitchBone(
  nodes: Array<TransformNode | AbstractMesh | null>,
  pitchControl: BoneControl
): void {
  const pitchTransform = pitchControl.transformNode ?? pitchControl.bone?.getTransformNode() ?? null;
  if (!pitchTransform) {
    return;
  }

  for (const node of nodes) {
    if (!node || node.parent === pitchTransform) {
      continue;
    }
    node.setParent(pitchTransform, true);
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
  private readonly yawAxis: Vector3;
  private readonly pitchAxis: Vector3;
  private readonly instances: EnemyTurretInstance[] = [];

  public constructor(options: EnemyTurretSystemOptions) {
    this.scene = options.scene;
    this.config = options.config;
    this.showAimDebug = options.config.debug?.showAimVectors ?? false;
    this.yawAxis = axisFromConfig(options.config.rig.yawAxis, options.config.rig.yawSign);
    this.pitchAxis = axisFromConfig(options.config.rig.pitchAxis, options.config.rig.pitchSign);

    this.hideTemplateAssets(options.enemiesContainer);
    this.spawnTurrets(options.terrainContainer, options.enemiesContainer);
  }

  public get instanceCount(): number {
    return this.instances.length;
  }

  public update(dt: number, aimTarget: TransformNode | AbstractMesh): void {
    if (this.instances.length === 0) {
      return;
    }

    aimTarget.computeWorldMatrix(true);
    const targetWorldPos = aimTarget.getAbsolutePosition();
    const detectionRangeSq = this.config.detectionRange * this.config.detectionRange;

    for (const instance of this.instances) {
      const inRange =
        Vector3.DistanceSquared(targetWorldPos, instance.anchor.getAbsolutePosition()) <= detectionRangeSq;

      if (inRange) {
        instance.tracking = true;
        this.updateAimTargets(instance, targetWorldPos);
      } else {
        instance.tracking = false;
      }

      this.applyTracking(instance, dt);
      this.updateAimDebug(instance, targetWorldPos);
    }
  }

  public dispose(): void {
    for (const instance of this.instances) {
      instance.debugAimLine?.dispose();
      instance.debugBarrelLine?.dispose();
      instance.debugTargetMarker?.dispose();
      instance.debugPivotMarker?.dispose();
      instance.root.dispose(false, true);
      instance.anchor.dispose();
    }
    this.instances.length = 0;
  }

  private hideTemplateAssets(enemiesContainer: AssetContainer): void {
    for (const mesh of enemiesContainer.meshes) {
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

      const yawControl = resolveBoneControlOnRoot(root, this.config.rig.yawBone);
      const pitchControl = resolveBoneControlOnRoot(root, this.config.rig.pitchBone);
      const muzzle1 = findNodeOnRoot(root, "turret_muzzle_1");
      const muzzle2 = findNodeOnRoot(root, "turret_muzzle_2");

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

      parentNodesToPitchBone([muzzle1, muzzle2], pitchControl);
      refreshClonedRigMatrices(anchor, root, skinnedMesh);

      const pitchReference = resolveControlReference(yawControl, anchor);
      const yawBaseLocalRotation = getControlLocalRotation(yawControl, anchor);
      const pitchBaseLocalRotation =
        getBoneLocalRotation(pitchControl, pitchReference) ??
        getControlLocalRotation(pitchControl, pitchReference);

      anchor.computeWorldMatrix(true);
      const pitchPivotLocalInAnchor =
        getBoneLocalInReference(pitchControl, skinnedMesh, root, anchor) ??
        worldToLocalInReference(
          this.getMuzzleWorldPos(muzzle1, muzzle2, pitchControl, pitchReference, skinnedMesh, root),
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

      console.info(
        `[EnemyTurretSystem] ${instanceLabel}: spawn=${spawnNode.getAbsolutePosition().asArray()} anchor=${anchor.getAbsolutePosition().asArray()} root=${root.getAbsolutePosition().asArray()} yawBone=${Boolean(yawControl.bone)} pitchBone=${Boolean(pitchControl.bone)} muzzle1=${Boolean(muzzle1)} pitchPivotLocal=${pitchPivotLocalInAnchor.asArray()}`
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
        yawBaseLocalRotation,
        pitchBaseLocalRotation,
        pitchPivotLocalInAnchor,
        currentYawDeg: 0,
        currentPitchDeg: 0,
        targetYawDeg: 0,
        targetPitchDeg: 0,
        tracking: false,
        ...debugMeshes
      });
    }

    if (this.instances.length > 0) {
      console.info(`[EnemyTurretSystem] Spawned ${this.instances.length} turret(s).`);
    }
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
    const prevPitchDeg = instance.currentPitchDeg;

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

    if (instance.tracking && !this.showAimDebug && Math.abs(instance.currentPitchDeg - prevPitchDeg) > 1e-3) {
      this.logPitchMovement(instance, prevPitchDeg);
    }
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
      instance.root
    );
  }

  private getMuzzleWorldPos(
    muzzle1: TransformNode | AbstractMesh | null,
    muzzle2: TransformNode | AbstractMesh | null,
    pitchControl: BoneControl,
    pitchReference: TransformNode,
    skinnedMesh: AbstractMesh | null,
    root: TransformNode
  ): Vector3 {
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

    const muzzle = instance.muzzle1 ?? instance.muzzle2;
    if (instance.debugBarrelLine && muzzle) {
      if (instance.tracking) {
        muzzle.computeWorldMatrix(true);
        const from = muzzle.getAbsolutePosition();
        const forward = muzzle.getDirection(Axis.Z);
        if (forward.lengthSquared() > 1e-6) {
          forward.normalize();
        } else {
          forward.copyFrom(Axis.Z);
        }
        const to = from.add(forward.scale(8));
        MeshBuilder.CreateLines(
          instance.debugBarrelLine.name,
          { points: [from, to], instance: instance.debugBarrelLine },
          this.scene
        );
        instance.debugBarrelLine.isVisible = true;
      } else {
        instance.debugBarrelLine.isVisible = false;
      }
    }
  }

  private logPitchMovement(instance: EnemyTurretInstance, prevPitchDeg: number): void {
    const bone = instance.pitchControl.bone;
    const transformNode = instance.pitchControl.transformNode;
    const boneLocalQuat = bone
      ? bone.getRotationQuaternion(Space.LOCAL, instance.pitchReference).asArray()
      : null;
    const transformNodeQuat = transformNode?.rotationQuaternion?.asArray() ?? null;
    const transformNodeEuler = transformNode
      ? transformNode.rotation.asArray()
      : null;

    console.log(`[EnemyTurret][${instance.spawnId}] turret_head pitch`, {
      prevPitchDeg: Number(prevPitchDeg.toFixed(2)),
      currentPitchDeg: Number(instance.currentPitchDeg.toFixed(2)),
      targetPitchDeg: Number(instance.targetPitchDeg.toFixed(2)),
      pitchAxis: this.config.rig.pitchAxis,
      pitchSign: this.config.rig.pitchSign,
      boneLocalQuat,
      transformNodeQuat,
      transformNodeEuler
    });
  }
}
