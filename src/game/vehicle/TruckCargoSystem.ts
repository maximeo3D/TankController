import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { Scene } from "@babylonjs/core/scene";
import { soldierRifleIconUrl } from "../../assets/assetUrls";
import type { TankControllerConfig } from "../../config/tankController";
import type { CargoPickable, EnemyCombatSystem } from "../EnemyTurretSystem";
import { axisFromConfig } from "../rigUtils";

export interface TruckCargoSlot {
  id: string;
  kind: string;
  iconUrl: string;
}

const CARGO_ICON_BY_KIND: Record<string, string> = {
  ally_soldier_rifle: soldierRifleIconUrl
};

export function resolveCargoIconUrl(kind: string): string {
  return CARGO_ICON_BY_KIND[kind] ?? soldierRifleIconUrl;
}

export interface TruckCargoSystemOptions {
  scene: Scene;
  config: NonNullable<TankControllerConfig["cargo"]>;
  vehicleContainer: AssetContainer;
  tankAnchor: TransformNode;
  tankBody: PhysicsBody;
  movementForwardAxis: "x" | "y" | "z";
  movementForwardSign: 1 | -1;
  enemyCombat: EnemyCombatSystem | null;
}

export class TruckCargoSystem {
  private readonly scene: Scene;
  private readonly config: NonNullable<TankControllerConfig["cargo"]>;
  private readonly tankAnchor: TransformNode;
  private readonly tankBody: PhysicsBody;
  private readonly pickupOrigin: TransformNode | AbstractMesh | null;
  private readonly dropNode: TransformNode | AbstractMesh | null;
  private readonly forwardLocal: Vector3;
  private readonly enemyCombat: EnemyCombatSystem | null;
  private readonly slots: Array<TruckCargoSlot | null>;
  private selectedIndex = 0;
  private dropSerial = 0;
  private highlightedId: string | null = null;
  private actionCooldown = 0;

  public constructor(options: TruckCargoSystemOptions) {
    this.scene = options.scene;
    this.config = options.config;
    this.tankAnchor = options.tankAnchor;
    this.tankBody = options.tankBody;
    this.enemyCombat = options.enemyCombat;
    this.forwardLocal = axisFromConfig(options.movementForwardAxis, options.movementForwardSign);
    this.pickupOrigin = findNamedNode(options.vehicleContainer, options.config.pickupOrigin);
    this.dropNode = findNamedNode(options.vehicleContainer, options.config.dropNode);
    this.slots = Array.from({ length: Math.max(1, options.config.slotCount) }, () => null);
    if (!this.pickupOrigin) {
      console.warn(`[TruckCargo] Missing pickup origin "${options.config.pickupOrigin}".`);
    }
    if (!this.dropNode) {
      console.warn(
        `[TruckCargo] Missing drop node "${options.config.dropNode}"; falling back to truck rear.`
      );
    }
  }

  public getSelectedIndex(): number {
    return this.selectedIndex;
  }

  public getSlots(): Array<TruckCargoSlot | null> {
    return [...this.slots];
  }

  public setSelectedIndex(index: number): void {
    if (index < 0 || index >= this.slots.length) {
      return;
    }
    this.selectedIndex = index;
  }

  public update(dt: number): string | null {
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    const candidate = this.findClosestPickable();
    const nextId = candidate?.id ?? null;
    if (nextId !== this.highlightedId) {
      this.highlightedId = nextId;
      this.enemyCombat?.setCargoPickupHighlight(nextId);
    }
    return nextId;
  }

  public tryPickup(): TruckCargoSlot | null {
    if (this.actionCooldown > 0) {
      return null;
    }
    const emptyIndex = this.slots.findIndex((slot) => slot == null);
    if (emptyIndex < 0) {
      return null;
    }
    const candidate = this.findClosestPickable();
    if (!candidate) {
      return null;
    }
    const stowed = this.enemyCombat?.stowCargoPassenger(candidate.id);
    if (!stowed) {
      return null;
    }
    const slot: TruckCargoSlot = {
      id: stowed.id,
      kind: stowed.kind,
      iconUrl: resolveCargoIconUrl(stowed.kind)
    };
    this.slots[emptyIndex] = slot;
    this.selectedIndex = emptyIndex;
    this.highlightedId = null;
    this.enemyCombat?.setCargoPickupHighlight(null);
    this.actionCooldown = 0.35;
    return slot;
  }

  public tryDrop(preferredIndex?: number): boolean {
    if (this.actionCooldown > 0) {
      return false;
    }
    const index = this.resolveDropIndex(preferredIndex);
    if (index < 0) {
      return false;
    }
    const slot = this.slots[index];
    if (!slot) {
      return false;
    }
    const pose = this.computeDropPose();
    const restored = this.enemyCombat?.restoreCargoPassenger(slot.id, pose.position, pose.rotation) === true;
    if (!restored) {
      return false;
    }
    this.slots[index] = null;
    this.dropSerial += 1;
    this.actionCooldown = 0.35;
    return true;
  }

  public clearHighlight(): void {
    if (this.highlightedId == null) {
      return;
    }
    this.highlightedId = null;
    this.enemyCombat?.setCargoPickupHighlight(null);
  }

  public dispose(): void {
    this.clearHighlight();
  }

  private resolveDropIndex(preferredIndex?: number): number {
    const preferred = preferredIndex ?? this.selectedIndex;
    if (preferred >= 0 && preferred < this.slots.length && this.slots[preferred]) {
      return preferred;
    }
    for (let i = this.slots.length - 1; i >= 0; i--) {
      if (this.slots[i]) {
        return i;
      }
    }
    return -1;
  }

  private findClosestPickable(): CargoPickable | null {
    const originNode = this.pickupOrigin ?? this.tankAnchor;
    originNode.computeWorldMatrix(true);
    const origin = originNode.getAbsolutePosition();
    const forward = this.getWorldForward(originNode);
    const halfConeRad = ((this.config.pickupConeDeg * 0.5) * Math.PI) / 180;
    const range = this.config.pickupRange;
    const rangeSq = range * range;

    let nearest: CargoPickable | null = null;
    let nearestDistSq = rangeSq;
    for (const pickable of this.enemyCombat?.getCargoPickables() ?? []) {
      const delta = pickable.position.subtract(origin);
      delta.y = 0;
      const distSq = delta.lengthSquared();
      if (distSq <= 1e-6 || distSq > nearestDistSq) {
        continue;
      }
      const dist = Math.sqrt(distSq);
      const dir = delta.scale(1 / dist);
      const angle = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(forward, dir))));
      if (angle > halfConeRad) {
        continue;
      }
      nearestDistSq = distSq;
      nearest = pickable;
    }
    return nearest;
  }

  private computeDropPose(): { position: Vector3; rotation: Quaternion } {
    this.tankAnchor.computeWorldMatrix(true);
    const forward = this.getWorldForward(this.tankAnchor);
    const right = Vector3.Cross(Axis.Y, forward);
    if (right.lengthSquared() > 1e-6) {
      right.normalize();
    } else {
      right.copyFrom(Axis.X);
    }

    const originNode = this.dropNode ?? this.tankAnchor;
    originNode.computeWorldMatrix(true);
    const origin = originNode.getAbsolutePosition();
    const backward = this.config.dropBackwardOffset ?? 0.22;
    const side = this.config.dropSideSpacing ?? 0.22;
    const row = this.config.dropRowSpacing ?? 0.28;
    const col = this.dropSerial % 3;
    const lane = Math.floor(this.dropSerial / 3) % 2;

    let drop = origin.add(forward.scale(-backward - lane * row));
    drop.addInPlace(right.scale((col - 1) * side));
    if (!this.dropNode) {
      drop.addInPlace(forward.scale(-0.55));
    }

    drop = this.snapToGround(drop);
    const rotation =
      this.tankAnchor.rotationQuaternion?.clone() ??
      Quaternion.FromEulerAngles(this.tankAnchor.rotation.x, this.tankAnchor.rotation.y, this.tankAnchor.rotation.z);
    return { position: drop, rotation };
  }

  private snapToGround(position: Vector3): Vector3 {
    const engine = this.scene.getPhysicsEngine();
    if (!engine) {
      return position;
    }
    const from = position.add(new Vector3(0, 1.4, 0));
    const to = position.add(new Vector3(0, -2.2, 0));
    const hit = engine.raycast(from, to, {
      ignoreBody: this.tankBody,
      shouldHitTriggers: false,
      collideWith: 0xffffffff
    });
    if (hit?.hasHit) {
      return new Vector3(position.x, hit.hitPointWorld.y, position.z);
    }
    return position;
  }

  private getWorldForward(node: TransformNode | AbstractMesh): Vector3 {
    const forward = node.getDirection(this.forwardLocal);
    forward.y = 0;
    if (forward.lengthSquared() > 1e-6) {
      forward.normalize();
      return forward;
    }
    return Axis.Z.clone();
  }
}

function findNamedNode(
  container: AssetContainer,
  name: string
): TransformNode | AbstractMesh | null {
  const wanted = name.trim().toLowerCase();
  return (
    container.transformNodes.find((node) => node.name.trim().toLowerCase() === wanted) ??
    container.meshes.find((mesh) => mesh.name.trim().toLowerCase() === wanted) ??
    null
  );
}
