import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

const POOL_SIZE = 16;
const LIFE_S = 0.1;
export const GUN_MUZZLE_FLASH_MESH_NAME = "FX_muzzle_flash";

let flashCloneSeq = 0;

export interface GunMuzzleFlashFx {
  spawnAtMuzzle(muzzleNode: TransformNode | AbstractMesh): void;
  update(dt: number): void;
  dispose(): void;
}

interface ActiveFlash {
  root: TransformNode;
  age: number;
}

function normalizeNodeName(name: string): string {
  return name.trim().toLowerCase().replace(/\.\d+$/, "");
}

function meshMatchesFlashName(mesh: AbstractMesh, meshName: string): boolean {
  const wanted = normalizeNodeName(meshName);
  const normalized = normalizeNodeName(mesh.name);
  return (
    normalized === wanted ||
    normalized.startsWith(`${wanted}.`) ||
    normalized.startsWith(`${wanted}_`)
  );
}

function collectSourceMeshes(meshes: AbstractMesh[], meshName: string): Mesh[] {
  const matched = meshes.filter(
    (mesh): mesh is Mesh => mesh instanceof Mesh && meshMatchesFlashName(mesh, meshName)
  );
  const collected = new Set<Mesh>(matched);
  for (const mesh of matched) {
    for (const child of mesh.getChildMeshes(false)) {
      if (child instanceof Mesh) {
        collected.add(child);
      }
    }
  }
  return [...collected].filter((mesh) => mesh.getTotalVertices() > 0);
}

function hideOriginalMeshes(meshes: Mesh[]): void {
  for (const mesh of meshes) {
    mesh.skeleton = null;
    mesh.isPickable = false;
    mesh.isVisible = false;
    mesh.visibility = 0;
    mesh.setEnabled(false);
    mesh.setParent(null);
  }
}

function cloneFlashMaterial(source: Material, suffix: string): Material {
  const material = source.clone(`${source.name}_${suffix}`) ?? source;
  if (material instanceof PBRMaterial) {
    material.unlit = true;
    material.backFaceCulling = false;
    material.disableDepthWrite = false;
    if (material.emissiveTexture) {
      material.emissiveColor = Color3.White();
    }
    material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 1, 5);
    return material;
  }
  if (material instanceof StandardMaterial) {
    material.disableLighting = true;
    material.disableDepthWrite = false;
    material.backFaceCulling = false;
    material.emissiveColor = Color3.White();
    return material;
  }
  const generic = material as Material & {
    disableLighting?: boolean;
    disableDepthWrite?: boolean;
    unlit?: boolean;
    backFaceCulling?: boolean;
  };
  generic.disableLighting = true;
  generic.disableDepthWrite = false;
  generic.unlit = true;
  generic.backFaceCulling = false;
  return material;
}

function bakeStandaloneMesh(source: Mesh, scene: Scene, name: string): Mesh {
  const vertexData = VertexData.ExtractFromMesh(source, true, true);
  const baked = new Mesh(name, scene);
  vertexData.applyToMesh(baked, true);
  baked.skeleton = null;
  baked.isPickable = false;
  baked.position.setAll(0);
  baked.rotationQuaternion = Quaternion.Identity();
  baked.scaling.copyFrom(source.scaling);
  if (source.material) {
    baked.material = cloneFlashMaterial(source.material, name);
  }
  return baked;
}

function buildBakedRoot(scene: Scene, sources: Mesh[]): TransformNode | null {
  const root = new TransformNode("fx_gun_muzzle_flash_template", scene);
  root.setEnabled(false);
  let pieceIndex = 0;
  for (const source of sources) {
    const piece = bakeStandaloneMesh(source, scene, `fx_gun_muzzle_flash_geo_${pieceIndex++}`);
    piece.setParent(root);
    piece.isVisible = true;
    piece.setEnabled(true);
  }
  if (pieceIndex === 0) {
    root.dispose();
    return null;
  }
  return root;
}

function randomQuarterTurnRollRad(): number {
  return Math.floor(Math.random() * 4) * (Math.PI / 2);
}

function localRollAroundForward(
  movementForwardAxis: Vector3,
  movementForwardSign: number
): Quaternion {
  const forward = movementForwardAxis.scale(-movementForwardSign);
  if (forward.lengthSquared() > 1e-6) {
    forward.normalize();
  } else {
    forward.set(0, 0, 1);
  }
  return Quaternion.RotationAxis(forward, randomQuarterTurnRollRad());
}

function setFlashEnabled(root: TransformNode, enabled: boolean): void {
  root.setEnabled(enabled);
  for (const mesh of root.getChildMeshes()) {
    mesh.isVisible = enabled;
    mesh.setEnabled(enabled);
    mesh.visibility = enabled ? 1 : 0;
  }
}

export function createGunMuzzleFlashFx(
  scene: Scene,
  meshes: AbstractMesh[],
  meshName: string = GUN_MUZZLE_FLASH_MESH_NAME,
  movementForwardAxis: Vector3 = new Vector3(0, 0, 1),
  movementForwardSign: number = 1
): GunMuzzleFlashFx | null {
  const sources = collectSourceMeshes(meshes, meshName);
  if (sources.length === 0) {
    return null;
  }

  const template = buildBakedRoot(scene, sources);
  hideOriginalMeshes(sources);
  if (!template) {
    return null;
  }

  const pool: TransformNode[] = [];
  const cloneId = flashCloneSeq++;
  for (let i = 0; i < POOL_SIZE; i++) {
    const clone = template.clone(`fx_gun_muzzle_flash_${cloneId}_${i}`, null);
    if (!clone) {
      continue;
    }
    clone.setParent(null);
    clone.rotationQuaternion ??= Quaternion.Identity();
    setFlashEnabled(clone, false);
    pool.push(clone);
  }

  if (pool.length === 0) {
    template.dispose();
    return null;
  }

  const active: ActiveFlash[] = [];

  return {
    spawnAtMuzzle(muzzleNode: TransformNode | AbstractMesh): void {
      const root = pool.pop();
      if (!root) {
        return;
      }

      muzzleNode.computeWorldMatrix(true);
      root.parent = muzzleNode;
      root.position.setAll(0);
      root.rotationQuaternion = localRollAroundForward(movementForwardAxis, movementForwardSign);
      root.scaling.setAll(0.75 + Math.random() * 0.25);
      setFlashEnabled(root, true);
      root.computeWorldMatrix(true);
      for (const mesh of root.getChildMeshes()) {
        mesh.computeWorldMatrix(true);
        mesh.refreshBoundingInfo(true, false);
      }
      active.push({ root, age: 0 });
    },

    update(dt: number): void {
      if (dt <= 0 || active.length === 0) {
        return;
      }

      for (let i = active.length - 1; i >= 0; i--) {
        const flash = active[i];
        flash.age += dt;
        const t = flash.age / LIFE_S;
        if (t >= 1) {
          flash.root.parent = null;
          flash.root.position.setAll(0);
          setFlashEnabled(flash.root, false);
          pool.push(flash.root);
          active.splice(i, 1);
          continue;
        }
        for (const mesh of flash.root.getChildMeshes()) {
          mesh.visibility = 1 - t;
        }
      }
    },

    dispose(): void {
      for (const flash of active) {
        flash.root.parent = null;
        flash.root.dispose();
      }
      active.length = 0;
      for (const root of pool) {
        root.dispose();
      }
      pool.length = 0;
      template.dispose();
    }
  };
}
