import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

/** Même format JSON que track_smoke.json / track_rocks.json */
interface DamageSmokeJson {
  name: string;
  capacity: number;
  emitter: [number, number, number];
  particleTexture: string;
  minEmitBox: [number, number, number];
  maxEmitBox: [number, number, number];
  color1: [number, number, number, number];
  color2: [number, number, number, number];
  colorDead: [number, number, number, number];
  minSize: number;
  maxSize: number;
  minLifeTime: number;
  maxLifeTime: number;
  emitRate: number;
  gravity: [number, number, number];
  direction1: [number, number, number];
  direction2: [number, number, number];
  minEmitPower: number;
  maxEmitPower: number;
  updateSpeed: number;
  minAngularSpeed?: number;
  maxAngularSpeed?: number;
  blendMode: number;
  isBillboardBased: boolean;
  billboardMode: number;
  sizeGradients?: { gradient: number; factor1: number; factor2?: number }[];
}

export interface TankDamageParticleNodes {
  smoke1: TransformNode | AbstractMesh | null;
  smoke2: TransformNode | AbstractMesh | null;
  smoke3: TransformNode | AbstractMesh | null;
  smoke4: TransformNode | AbstractMesh | null;
}

export interface TankDamageParticleBundle {
  syncHealthPercent(healthPercent: number): void;
  dispose(): void;
}

type DamageSlotId = "smoke_1" | "smoke_2" | "smoke_3" | "smoke_4";

interface DamageSlot {
  id: DamageSlotId;
  emitter: Mesh;
  system: ParticleSystem;
  baseEmitRate: number;
  active: boolean;
}

function v3(t: [number, number, number]): Vector3 {
  return new Vector3(t[0], t[1], t[2]);
}

function c4(t: [number, number, number, number]): Color4 {
  return new Color4(t[0], t[1], t[2], t[3]);
}

function resolveParticleTextureUrl(ref: string): string {
  if (/^https?:\/\//i.test(ref)) {
    return ref;
  }
  const fileName = ref.replace(/^.*[/\\]/, "").trim();
  return new URL(`../../assets/effects/${fileName}`, import.meta.url).href;
}

async function loadDamageSmokeJson(): Promise<DamageSmokeJson> {
  const url = new URL("../../assets/effects/damage_smoke.json", import.meta.url).href;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load damage_smoke.json: ${res.status}`);
  }
  return res.json() as Promise<DamageSmokeJson>;
}

function buildSmokeSystem(
  scene: Scene,
  def: DamageSmokeJson,
  emitterMesh: Mesh,
  slotId: DamageSlotId
): { system: ParticleSystem; baseEmitRate: number } {
  const ps = new ParticleSystem(`damage_smoke_${slotId}_${emitterMesh.name}`, def.capacity, scene);
  ps.particleTexture = new Texture(resolveParticleTextureUrl(def.particleTexture), scene, true, false);
  ps.emitter = emitterMesh;
  ps.minEmitBox = v3(def.minEmitBox);
  ps.maxEmitBox = v3(def.maxEmitBox);
  ps.color1 = c4(def.color1);
  ps.color2 = c4(def.color2);
  ps.colorDead = c4(def.colorDead);
  ps.minSize = def.minSize;
  ps.maxSize = def.maxSize;
  ps.minLifeTime = def.minLifeTime;
  ps.maxLifeTime = def.maxLifeTime;
  ps.emitRate = 0;
  ps.gravity = v3(def.gravity);
  ps.direction1 = v3(def.direction1);
  ps.direction2 = v3(def.direction2);
  ps.minEmitPower = def.minEmitPower;
  ps.maxEmitPower = def.maxEmitPower;
  ps.updateSpeed = def.updateSpeed;
  if (def.minAngularSpeed !== undefined) {
    ps.minAngularSpeed = def.minAngularSpeed;
  }
  if (def.maxAngularSpeed !== undefined) {
    ps.maxAngularSpeed = def.maxAngularSpeed;
  }
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.isBillboardBased = def.isBillboardBased;
  ps.billboardMode = def.billboardMode;
  ps.renderingGroupId = 0;
  ps.particleTexture.hasAlpha = true;

  if (def.sizeGradients?.length) {
    for (const g of def.sizeGradients) {
      ps.addSizeGradient(g.gradient, g.factor1, g.factor2 ?? g.factor1);
    }
  }

  ps.start();
  return { system: ps, baseEmitRate: def.emitRate };
}

function createEmitterMesh(
  scene: Scene,
  parent: TransformNode | AbstractMesh,
  def: DamageSmokeJson,
  label: string
): Mesh {
  const emitter = MeshBuilder.CreateBox(`emitter_tank_damage_${label}`, { size: 0.02 }, scene);
  emitter.isVisible = false;
  emitter.isPickable = false;
  emitter.parent = parent;
  emitter.position.copyFromFloats(def.emitter[0], def.emitter[1], def.emitter[2]);
  return emitter;
}

function isSlotActive(slotId: DamageSlotId, healthPercent: number): boolean {
  if (healthPercent <= 0) {
    return false;
  }
  switch (slotId) {
    case "smoke_1":
      return healthPercent <= 75;
    case "smoke_2":
    case "smoke_3":
      return healthPercent <= 50;
    case "smoke_4":
      return healthPercent <= 25;
  }
}

function setSlotActive(slot: DamageSlot, active: boolean): void {
  if (slot.active === active) {
    return;
  }
  slot.active = active;
  slot.system.emitRate = active ? slot.baseEmitRate : 0;
}

/**
 * Fumée de dégâts sur les empties `tank_damage_smoke_*` (format JSON classique, comme les chenilles).
 */
export async function createTankDamageParticleBundle(
  scene: Scene,
  nodes: TankDamageParticleNodes
): Promise<TankDamageParticleBundle | null> {
  const slotDefs: Array<{ id: DamageSlotId; parent: TransformNode | AbstractMesh | null }> = [
    { id: "smoke_1", parent: nodes.smoke1 },
    { id: "smoke_2", parent: nodes.smoke2 },
    { id: "smoke_3", parent: nodes.smoke3 },
    { id: "smoke_4", parent: nodes.smoke4 }
  ];

  const present = slotDefs.filter((def) => def.parent != null);
  if (present.length === 0) {
    console.warn("[TankController] No tank_damage_smoke_* emitter nodes found; damage particles disabled.");
    return null;
  }

  let smokeDef: DamageSmokeJson;
  try {
    smokeDef = await loadDamageSmokeJson();
  } catch (err) {
    console.warn("[TankController] Tank damage smoke could not be loaded:", err);
    return null;
  }

  const slots: DamageSlot[] = [];
  for (const def of present) {
    if (!def.parent) {
      continue;
    }
    const emitter = createEmitterMesh(scene, def.parent, smokeDef, def.id);
    const built = buildSmokeSystem(scene, smokeDef, emitter, def.id);
    slots.push({
      id: def.id,
      emitter,
      system: built.system,
      baseEmitRate: built.baseEmitRate,
      active: false
    });
  }

  for (const def of slotDefs) {
    if (def.parent == null) {
      console.warn(`[TankController] Missing tank damage emitter node for slot "${def.id}".`);
    }
  }

  return {
    syncHealthPercent(healthPercent: number): void {
      const hp = Math.max(0, Math.min(100, healthPercent));
      for (const slot of slots) {
        setSlotActive(slot, isSlotActive(slot.id, hp));
      }
    },
    dispose(): void {
      for (const slot of slots) {
        setSlotActive(slot, false);
        slot.system.stop();
        slot.system.dispose();
        slot.emitter.dispose();
      }
    }
  };
}
