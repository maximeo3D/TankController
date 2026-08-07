import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

function materialMatchesName(material: Material | null | undefined, wanted: string): material is Material {
  if (!material) {
    return false;
  }
  const name = material.name.trim().toLowerCase();
  return name === wanted || name.startsWith(`${wanted}.`);
}

export function collectMeshMaterials(mesh: AbstractMesh): Material[] {
  const material = mesh.material;
  if (!material) {
    return [];
  }

  const multi = material as Material & { subMaterials?: Array<Material | null> };
  if (Array.isArray(multi.subMaterials) && multi.subMaterials.length > 0) {
    return multi.subMaterials.filter((candidate): candidate is Material => candidate !== null);
  }

  return [material];
}

/** Le material turbine peut vivre sur un submesh, donc hors de `container.materials`. */
export function findContainerMaterial(container: AssetContainer, name: string): Material | null {
  const wanted = name.trim().toLowerCase();
  for (const mesh of container.meshes) {
    for (const material of collectMeshMaterials(mesh)) {
      if (materialMatchesName(material, wanted)) {
        return material;
      }
    }
  }
  return container.materials.find((candidate) => materialMatchesName(candidate, wanted)) ?? null;
}

/**
 * Les materials PBR importés du glTF ont une `emissiveColor` noire : sans couleur
 * blanche, l'`emissiveIntensity` n'a aucun effet visible sur la texture émissive.
 */
export function prepareEngineMaterial(material: Material, initialIntensity: number): void {
  if (material instanceof PBRMaterial && material.emissiveTexture) {
    material.emissiveColor = Color3.White();
  }
  setMaterialEmissiveIntensity(material, initialIntensity);
}

export function setMaterialEmissiveIntensity(material: Material, intensity: number): void {
  if (material instanceof PBRMaterial) {
    material.emissiveIntensity = intensity;
    return;
  }

  const emissiveColor = (material as Material & { emissiveColor?: Color3 }).emissiveColor;
  if (emissiveColor) {
    emissiveColor.set(intensity, intensity, intensity);
  }
}
