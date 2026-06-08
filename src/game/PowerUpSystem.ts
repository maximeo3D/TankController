import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Layers/effectLayerSceneComponent";
import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import type { Scene } from "@babylonjs/core/scene";
import type {
  PowerUpTypeConfig,
  PowerUpTypeId,
  TankControllerConfig
} from "../config/tankController";

export type { PowerUpTypeId };

export interface PowerUpSystemOptions {
  scene: Scene;
  terrainContainer: AssetContainer;
  powerUpsContainer: AssetContainer;
  config: NonNullable<TankControllerConfig["powerUps"]>;
  tankColliderMesh: Mesh | null;
  showDebugBounds?: boolean;
  onAmmoShellPickup: (amount: number) => void;
  onFuelPickup: (batteryAmount: number) => void;
  onRepairPickup: (healthAmount: number) => void;
  onShieldPickup: (durationSeconds: number, damageReduction: number) => void;
  onPicked?: (typeId: PowerUpTypeId) => void;
}

interface MaterialAlphaState {
  material: Material;
  baseAlpha: number;
  baseTransparencyMode: number;
}

interface PowerUpInstance {
  typeId: PowerUpTypeId;
  typeConfig: PowerUpTypeConfig;
  anchor: TransformNode;
  root: AbstractMesh;
  highlightMeshes: Mesh[];
  materialStates: MaterialAlphaState[];
  debugMeshes: Mesh[];
  availableColor: Color3;
  cooldownColor: Color3;
  pickupRadius: number;
  respawnSeconds: number;
  pickedAlpha: number;
  available: boolean;
  cooldownRemaining: number;
  bobBaseY: number;
  bobPhase: number;
  spawnRotation: Quaternion;
  animTime: number;
}

const POWER_UP_TYPE_IDS: PowerUpTypeId[] = [
  "ammo_shell",
  "fuel",
  "boost",
  "repair",
  "shield",
  "weapon_boost"
];

function isPowerUpTypeId(typeId: string): typeId is PowerUpTypeId {
  return (POWER_UP_TYPE_IDS as string[]).includes(typeId);
}

function findNodeByName(
  container: AssetContainer,
  name: string
): TransformNode | AbstractMesh | null {
  const wanted = name.trim().toLowerCase();
  const match = (candidateName: string): boolean => {
    const n = candidateName.trim().toLowerCase();
    return n === wanted || n.startsWith(`${wanted}.`);
  };

  return (
    container.transformNodes.find((node) => match(node.name)) ??
    container.meshes.find((mesh) => match(mesh.name)) ??
    null
  );
}

function findMeshByName(container: AssetContainer, name: string): Mesh | null {
  const candidate = findNodeByName(container, name);
  return candidate instanceof Mesh ? candidate : null;
}

function collectDescendantMeshes(root: AbstractMesh): AbstractMesh[] {
  const meshes: AbstractMesh[] = [root];
  for (const child of root.getChildMeshes(false)) {
    meshes.push(child);
  }
  return meshes;
}

function collectHighlightMeshes(meshes: AbstractMesh[]): Mesh[] {
  return meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh);
}

function applySpawnTransform(source: TransformNode | AbstractMesh, target: TransformNode): void {
  source.computeWorldMatrix(true);
  target.setAbsolutePosition(source.getAbsolutePosition());
  if (source.rotationQuaternion) {
    target.rotationQuaternion = source.rotationQuaternion.clone();
  } else {
    target.rotation.copyFrom(source.rotation);
  }

  const scale = source.absoluteScaling;
  if (scale.x > 1e-4 && scale.y > 1e-4 && scale.z > 1e-4) {
    target.scaling.copyFrom(scale);
  } else {
    target.scaling.setAll(1);
  }
}

function colorFromRgb(rgb: [number, number, number]): Color3 {
  return new Color3(rgb[0], rgb[1], rgb[2]);
}

function createRedDebugMaterial(scene: Scene, name: string): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = new Color3(1, 0, 0);
  mat.emissiveColor = new Color3(1, 0, 0);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  return mat;
}

function createPickupZoneDebug(
  scene: Scene,
  anchor: TransformNode,
  root: AbstractMesh,
  pickupRadius: number,
  label: string
): Mesh[] {
  root.computeWorldMatrix(true);
  root.refreshBoundingInfo(true, true);
  const bb = root.getBoundingInfo().boundingBox;
  const centerY = (bb.minimum.y + bb.maximum.y) * 0.5;

  const mat = createRedDebugMaterial(scene, `pu_pickup_mat_${label}`);
  mat.alpha = 0.35;
  mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
  mat.wireframe = true;

  const diameter = Math.max(pickupRadius * 2, 0.1);
  const sphere = MeshBuilder.CreateSphere(
    `pu_pickup_zone_${label}`,
    { diameter, segments: 24 },
    scene
  );
  sphere.parent = anchor;
  sphere.position.set(0, centerY, 0);
  sphere.isPickable = false;
  sphere.material = mat;

  return [sphere];
}

function assignInstanceMaterials(meshes: AbstractMesh[], instanceLabel: string): MaterialAlphaState[] {
  const states: MaterialAlphaState[] = [];
  const clonedBySource = new Map<Material, Material>();

  for (const mesh of meshes) {
    const source = mesh.material;
    if (!source) {
      continue;
    }

    let material = clonedBySource.get(source);
    if (!material) {
      const cloned = source.clone(`${source.name}_${instanceLabel}`);
      if (!cloned) {
        continue;
      }
      material = cloned;
      clonedBySource.set(source, material);
      states.push({
        material,
        baseAlpha: material.alpha ?? 1,
        baseTransparencyMode: material.transparencyMode ?? Material.MATERIAL_OPAQUE
      });
    }

    mesh.material = material;
  }

  return states;
}

function parsePowerUpTypeId(spawnNodeName: string): string | null {
  const match = /^PU_(.+)$/i.exec(spawnNodeName.trim());
  if (!match) {
    return null;
  }
  return match[1].replace(/\.\d+$/, "");
}

function sanitizeNodeName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_]+/g, "_");
}

export class PowerUpSystem {
  private readonly scene: Scene;
  private readonly config: NonNullable<TankControllerConfig["powerUps"]>;
  private readonly tankColliderMesh: Mesh | null;
  private readonly showDebugBounds: boolean;
  private readonly onAmmoShellPickup: (amount: number) => void;
  private readonly onFuelPickup: (batteryAmount: number) => void;
  private readonly onRepairPickup: (healthAmount: number) => void;
  private readonly onShieldPickup: (durationSeconds: number, damageReduction: number) => void;
  private readonly onPicked?: (typeId: PowerUpTypeId) => void;
  private readonly highlightLayer: HighlightLayer | null;
  private readonly instances: PowerUpInstance[] = [];

  public constructor(options: PowerUpSystemOptions) {
    this.scene = options.scene;
    this.config = options.config;
    this.tankColliderMesh = options.tankColliderMesh;
    this.showDebugBounds = options.showDebugBounds ?? false;
    this.onAmmoShellPickup = options.onAmmoShellPickup;
    this.onFuelPickup = options.onFuelPickup;
    this.onRepairPickup = options.onRepairPickup;
    this.onShieldPickup = options.onShieldPickup;
    this.onPicked = options.onPicked;
    this.highlightLayer = this.createHighlightLayer();

    if (!this.config.enabled || !this.config.types) {
      return;
    }

    this.spawnPowerUps(options.terrainContainer, options.powerUpsContainer);
  }

  private createHighlightLayer(): HighlightLayer | null {
    try {
      const highlightOpts = this.config.highlight;
      return new HighlightLayer("powerup_highlight", this.scene, {
        generateStencilBuffer: true,
        blurHorizontalSize: highlightOpts?.blurHorizontalSize ?? 0.225,
        blurVerticalSize: highlightOpts?.blurVerticalSize ?? 0.225
      });
    } catch (error) {
      console.error("[PowerUpSystem] HighlightLayer init failed:", error);
      return null;
    }
  }

  public update(dt: number): void {
    if (!this.config.enabled || this.instances.length === 0 || dt <= 0) {
      return;
    }

    const tankCenter = this.tankColliderMesh?.getAbsolutePosition() ?? null;
    const tankRadius = this.getTankPickupRadius();

    for (const instance of this.instances) {
      this.updateInstanceAnimation(instance, dt);

      if (!instance.available) {
        if (!instance.typeConfig.singleUse) {
          instance.cooldownRemaining -= dt;
          if (instance.cooldownRemaining <= 0) {
            this.setAvailable(instance);
          }
        }
        continue;
      }

      if (!tankCenter) {
        continue;
      }

      instance.anchor.computeWorldMatrix(true);
      const distance = Vector3.Distance(tankCenter, instance.anchor.getAbsolutePosition());
      if (distance <= instance.pickupRadius + tankRadius) {
        this.pickup(instance);
      }
    }
  }

  private updateInstanceAnimation(instance: PowerUpInstance, dt: number): void {
    const anim = this.config.animation;
    if (!anim) {
      return;
    }

    instance.animTime += dt;

    const bobPeriod = Math.max(anim.bobPeriodSeconds, 0.001);
    const bobAmplitude = anim.bobAmplitude;
    const bobOmega = (Math.PI * 2) / bobPeriod;
    instance.anchor.position.y =
      instance.bobBaseY + Math.sin(instance.animTime * bobOmega + instance.bobPhase) * bobAmplitude;

    const rotPeriod = Math.max(anim.rotationPeriodSeconds, 0.001);
    const spinAngle = (instance.animTime / rotPeriod) * Math.PI * 2;
    const spinQuat = Quaternion.RotationAxis(Axis.Y, spinAngle);
    instance.anchor.rotationQuaternion = instance.spawnRotation.multiply(spinQuat);
  }

  public dispose(): void {
    if (this.highlightLayer) {
      this.highlightLayer.removeAllMeshes();
      this.highlightLayer.dispose();
    }

    for (const instance of this.instances) {
      for (const debugMesh of instance.debugMeshes) {
        debugMesh.material?.dispose();
        debugMesh.dispose();
      }
      for (const state of instance.materialStates) {
        state.material.dispose();
      }
      instance.anchor.dispose(false, true);
    }
    this.instances.length = 0;
  }

  private getTypeConfig(typeId: string): PowerUpTypeConfig | null {
    if (!isPowerUpTypeId(typeId)) {
      return null;
    }
    const typeConfig = this.config.types?.[typeId];
    if (!typeConfig?.enabled) {
      return null;
    }
    return typeConfig;
  }

  private spawnPowerUps(terrainContainer: AssetContainer, powerUpsContainer: AssetContainer): void {
    for (const mesh of powerUpsContainer.meshes) {
      mesh.setEnabled(false);
      mesh.isVisible = false;
    }

    const spawnNodes = [...terrainContainer.transformNodes, ...terrainContainer.meshes].filter((node) =>
      node.name.trim().toUpperCase().startsWith("PU_")
    );

    if (spawnNodes.length === 0) {
      console.warn("[PowerUpSystem] No PU_* spawn nodes found in terrain.");
    }

    for (const spawnNode of spawnNodes) {
      const typeId = parsePowerUpTypeId(spawnNode.name);
      if (!typeId) {
        continue;
      }

      const typeConfig = this.getTypeConfig(typeId);
      if (!typeConfig) {
        if (isPowerUpTypeId(typeId) && this.config.types?.[typeId]?.enabled === false) {
          continue;
        }
        console.warn(
          `[PowerUpSystem] Unknown power-up type "${typeId}" from spawn node "${spawnNode.name}".`
        );
        continue;
      }

      const meshName = `mesh_${typeId}`;
      const templateMesh = findMeshByName(powerUpsContainer, meshName);
      if (!templateMesh) {
        const availableMeshes = powerUpsContainer.meshes.map((mesh) => mesh.name);
        console.warn(
          `[PowerUpSystem] Missing mesh template "${meshName}" for spawn node "${spawnNode.name}".`,
          { availableMeshes }
        );
        continue;
      }

      const instanceLabel = sanitizeNodeName(spawnNode.name);
      const anchor = new TransformNode(`powerup_anchor_${instanceLabel}`, this.scene);
      applySpawnTransform(spawnNode, anchor);

      const root = templateMesh.clone(`powerup_mesh_${instanceLabel}`, anchor, true);
      if (!root) {
        console.warn(
          `[PowerUpSystem] Failed to clone mesh "${meshName}" for spawn node "${spawnNode.name}".`
        );
        anchor.dispose();
        continue;
      }

      root.setEnabled(true);
      root.isVisible = true;
      root.isPickable = false;

      const meshes = collectDescendantMeshes(root);
      for (const mesh of meshes) {
        mesh.isPickable = false;
        mesh.setEnabled(true);
        mesh.isVisible = true;
      }

      const highlightMeshes = collectHighlightMeshes(meshes);
      anchor.computeWorldMatrix(true);
      root.computeWorldMatrix(true);
      root.refreshBoundingInfo(true, true);

      const debugMeshes = this.showDebugBounds
        ? createPickupZoneDebug(this.scene, anchor, root, this.config.pickupRadius, instanceLabel)
        : [];

      const spawnRotation =
        anchor.rotationQuaternion?.clone() ??
        Quaternion.FromEulerAngles(anchor.rotation.x, anchor.rotation.y, anchor.rotation.z);

      const instance: PowerUpInstance = {
        typeId: typeId as PowerUpTypeId,
        typeConfig,
        anchor,
        root,
        highlightMeshes,
        materialStates: assignInstanceMaterials(meshes, instanceLabel),
        debugMeshes,
        availableColor: colorFromRgb(typeConfig.highlightAvailable),
        cooldownColor: colorFromRgb(typeConfig.highlightCooldown),
        pickupRadius: this.config.pickupRadius,
        respawnSeconds: typeConfig.respawnSeconds,
        pickedAlpha: typeConfig.pickedAlpha,
        available: true,
        cooldownRemaining: 0,
        bobBaseY: anchor.position.y,
        bobPhase: this.instances.length * 0.85,
        spawnRotation,
        animTime: 0
      };

      this.instances.push(instance);
      this.setHighlightState(instance, true);
    }

    if (this.instances.length > 0) {
      const byType = new Map<string, number>();
      for (const instance of this.instances) {
        byType.set(instance.typeId, (byType.get(instance.typeId) ?? 0) + 1);
      }
      console.info(
        `[PowerUpSystem] Spawned ${this.instances.length} power-up(s).`,
        Object.fromEntries(byType)
      );
    }
  }

  private getTankPickupRadius(): number {
    if (!this.tankColliderMesh) {
      return 1.2;
    }

    this.tankColliderMesh.computeWorldMatrix(true);
    const bounds = this.tankColliderMesh.getBoundingInfo().boundingSphere;
    const scale = Math.max(
      this.tankColliderMesh.absoluteScaling.x,
      this.tankColliderMesh.absoluteScaling.y,
      this.tankColliderMesh.absoluteScaling.z,
      1
    );
    return Math.max(bounds.radiusWorld * scale, 0.5);
  }

  private pickup(instance: PowerUpInstance): void {
    this.onPicked?.(instance.typeId);
    this.applyPickupEffect(instance);

    instance.available = false;
    instance.cooldownRemaining = instance.respawnSeconds;

    if (instance.typeConfig.singleUse) {
      this.setInstanceVisible(instance, false);
      this.removeHighlight(instance);
    } else {
      this.setPickedVisual(instance);
      this.setHighlightState(instance, false);
    }
  }

  private applyPickupEffect(instance: PowerUpInstance): void {
    switch (instance.typeId) {
      case "ammo_shell": {
        const cfg = this.config.types.ammo_shell;
        this.onAmmoShellPickup(cfg.shellAmmoAmount);
        break;
      }
      case "fuel": {
        const cfg = this.config.types.fuel;
        this.onFuelPickup(cfg.batteryAmount);
        break;
      }
      case "repair": {
        const cfg = this.config.types.repair;
        this.onRepairPickup(cfg.repairAmount);
        break;
      }
      case "shield": {
        const cfg = this.config.types.shield;
        this.onShieldPickup(cfg.shieldDurationSeconds, cfg.damageReduction);
        break;
      }
      default:
        console.warn(`[PowerUpSystem] Pickup not implemented for type "${instance.typeId}".`);
    }
  }

  private setHighlightState(instance: PowerUpInstance, available: boolean): void {
    if (!this.highlightLayer) {
      return;
    }

    const color = available ? instance.availableColor : instance.cooldownColor;
    for (const mesh of instance.highlightMeshes) {
      if (this.highlightLayer.hasMesh(mesh)) {
        this.highlightLayer.removeMesh(mesh);
      }
      this.highlightLayer.addMesh(mesh, color);
    }
  }

  private removeHighlight(instance: PowerUpInstance): void {
    if (!this.highlightLayer) {
      return;
    }

    for (const mesh of instance.highlightMeshes) {
      if (this.highlightLayer.hasMesh(mesh)) {
        this.highlightLayer.removeMesh(mesh);
      }
    }
  }

  private setInstanceVisible(instance: PowerUpInstance, visible: boolean): void {
    instance.root.setEnabled(visible);
    instance.root.isVisible = visible;
    for (const mesh of instance.root.getChildMeshes(false)) {
      mesh.setEnabled(visible);
      mesh.isVisible = visible;
    }
    for (const debugMesh of instance.debugMeshes) {
      debugMesh.setEnabled(visible);
      debugMesh.isVisible = visible;
    }
  }

  private setPickedVisual(instance: PowerUpInstance): void {
    for (const state of instance.materialStates) {
      state.material.alpha = instance.pickedAlpha;
      if (instance.pickedAlpha < 0.999) {
        state.material.transparencyMode = Material.MATERIAL_ALPHABLEND;
      }
    }
  }

  private setAvailable(instance: PowerUpInstance): void {
    instance.available = true;
    instance.cooldownRemaining = 0;

    this.setInstanceVisible(instance, true);

    for (const state of instance.materialStates) {
      state.material.alpha = state.baseAlpha;
      state.material.transparencyMode = state.baseTransparencyMode;
    }

    this.setHighlightState(instance, true);
  }
}
