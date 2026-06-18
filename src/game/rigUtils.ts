import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Bone } from "@babylonjs/core/Bones/bone";
import { Space } from "@babylonjs/core/Maths/math.axis";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

export interface BoneControl {
  bone: Bone | null;
  transformNode: TransformNode | null;
}

export function resolveBoneControl(container: AssetContainer, boneName: string): BoneControl {
  const bone =
    container.skeletons.flatMap((skeleton) => skeleton.bones).find((candidate) => candidate.name === boneName) ??
    null;

  return {
    bone,
    transformNode: bone?.getTransformNode() ?? null
  };
}

export function resolveBoneControlOnMesh(root: AbstractMesh, boneName: string): BoneControl {
  const meshes = [root, ...root.getChildMeshes(true)];
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

export function resolveControlReference(control: BoneControl, fallback: TransformNode): TransformNode {
  return control.transformNode ?? fallback;
}

export function refreshSkinnedMeshRig(root: AbstractMesh, anchor: TransformNode): void {
  anchor.computeWorldMatrix(true);
  const meshes = [root, ...root.getChildMeshes(true)];
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const skeleton = mesh.skeleton;
    if (!skeleton) {
      continue;
    }
    for (const bone of skeleton.bones) {
      bone.getTransformNode()?.computeWorldMatrix(true);
    }
  }
}

export function getBoneLocalRotation(control: BoneControl, reference: TransformNode): Quaternion | null {
  if (!control.bone) {
    return null;
  }
  return control.bone.getRotationQuaternion(Space.LOCAL, reference).clone();
}

export function setBoneAxisAngle(
  control: BoneControl,
  baseLocalRotation: Quaternion,
  axis: Vector3,
  angleRad: number,
  reference: TransformNode
): void {
  const normAxis = axis.clone();
  if (normAxis.lengthSquared() > 1e-6) {
    normAxis.normalize();
  } else {
    normAxis.copyFrom(Axis.Y);
  }

  const local = baseLocalRotation.multiply(Quaternion.RotationAxis(normAxis, angleRad));

  if (control.bone) {
    control.bone.setRotationQuaternion(local, Space.LOCAL, reference);
    const transformNode = control.bone.getTransformNode();
    if (transformNode) {
      transformNode.rotationQuaternion ??= Quaternion.Identity();
      transformNode.rotationQuaternion.copyFrom(local);
    }
    return;
  }

  if (control.transformNode) {
    control.transformNode.rotationQuaternion ??= Quaternion.Identity();
    control.transformNode.rotationQuaternion.copyFrom(local);
  }
}

export function getControlLocalRotation(control: BoneControl, reference: TransformNode): Quaternion {
  if (control.transformNode) {
    control.transformNode.rotationQuaternion ??= Quaternion.Identity();
    return control.transformNode.rotationQuaternion.clone();
  }

  if (control.bone) {
    return control.bone.getRotationQuaternion(Space.LOCAL, reference).clone();
  }

  return Quaternion.Identity();
}

export function setControlAxisAngle(
  control: BoneControl,
  baseLocalRotation: Quaternion,
  axis: Vector3,
  angleRad: number,
  reference: TransformNode
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
    control.bone.setRotationQuaternion(local, Space.LOCAL, reference);
  }
}

export function shortestAngleDeltaDeg(current: number, target: number): number {
  return repeat(target - current + 180, 360) - 180;
}

export function moveTowardsAngle(current: number, target: number, maxDelta: number): number {
  const delta = shortestAngleDeltaDeg(current, target);
  if (Math.abs(delta) <= maxDelta) {
    return current + delta;
  }

  return current + Math.sign(delta) * maxDelta;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maxDelta;
}

export function toRadians(valueInDegrees: number): number {
  return (valueInDegrees * Math.PI) / 180;
}

export function axisFromConfig(axisName: "x" | "y" | "z", sign: 1 | -1): Vector3 {
  const axis =
    axisName === "x" ? Axis.X.clone() : axisName === "y" ? Axis.Y.clone() : Axis.Z.clone();

  return axis.scale(sign);
}

function repeat(value: number, length: number): number {
  return value - Math.floor(value / length) * length;
}
