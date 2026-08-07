import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

/** Même format JSON que damage_smoke.json / track_smoke.json. */
interface PostCombustionJson {
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

export interface PostCombustionTuning {
  /** Manette des gaz en dessous de laquelle la tuyère ne crache rien (0–1). */
  throttleThreshold: number;
  /** Facteur de débit appliqué au débit plein gaz sous post-combustion. */
  turboEmitScale: number;
}

export interface PostCombustionParticleBundle {
  syncFlight(throttle: number, afterburner: boolean): void;
  dispose(): void;
}

/** Valeurs de référence du JSON, servant de base aux modulations en vol. */
interface PostCombustionBase {
  color1: Color4;
  color2: Color4;
  emitRate: number;
  minSize: number;
  maxSize: number;
  minEmitPower: number;
  maxEmitPower: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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
  return new URL(`../../../assets/effects/${fileName}`, import.meta.url).href;
}

function stripJsonComments(source: string): string {
  return source.replace(/^\s*\/\/.*$/gm, "");
}

async function loadPostCombustionJson(): Promise<PostCombustionJson> {
  const url = new URL("../../../assets/effects/post_combustion.json", import.meta.url).href;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load post_combustion.json: ${res.status}`);
  }
  const text = stripJsonComments(await res.text());
  return JSON.parse(text) as PostCombustionJson;
}

/**
 * Les valeurs `blendMode` du JSON reprennent les constantes Babylon
 * (0 = ONEONE additif, 1 = STANDARD, 2 = ADD, 3 = MULTIPLY).
 */
function resolveBlendMode(value: number): number {
  switch (value) {
    case 1:
      return ParticleSystem.BLENDMODE_STANDARD;
    case 2:
      return ParticleSystem.BLENDMODE_ADD;
    case 3:
      return ParticleSystem.BLENDMODE_MULTIPLY;
    default:
      return ParticleSystem.BLENDMODE_ONEONE;
  }
}

function buildSystem(scene: Scene, def: PostCombustionJson, emitterMesh: Mesh): ParticleSystem {
  const ps = new ParticleSystem(`post_combustion_${emitterMesh.name}`, def.capacity, scene);
  ps.particleTexture = new Texture(resolveParticleTextureUrl(def.particleTexture), scene, true, false);
  ps.particleTexture.hasAlpha = true;
  ps.emitter = emitterMesh;
  ps.isLocal = true;
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
  ps.blendMode = resolveBlendMode(def.blendMode);
  ps.isBillboardBased = def.isBillboardBased;
  ps.billboardMode = def.billboardMode;
  ps.renderingGroupId = 0;

  for (const gradient of def.sizeGradients ?? []) {
    ps.addSizeGradient(gradient.gradient, gradient.factor1, gradient.factor2 ?? gradient.factor1);
  }

  ps.start();
  return ps;
}

function buildBase(def: PostCombustionJson): PostCombustionBase {
  return {
    color1: c4(def.color1),
    color2: c4(def.color2),
    emitRate: def.emitRate,
    minSize: def.minSize,
    maxSize: def.maxSize,
    minEmitPower: def.minEmitPower,
    maxEmitPower: def.maxEmitPower
  };
}

/** Vers le blanc chaud quand la post-combustion s'allume. */
function ignitedColor(base: Color4, turbo: number): Color4 {
  return new Color4(
    lerp(base.r, 0.85, turbo * 0.45),
    lerp(base.g, 0.75, turbo * 0.45),
    lerp(base.b, 0.95, turbo * 0.25),
    lerp(base.a, Math.min(1, base.a * 1.4), turbo)
  );
}

function applyThrust(
  system: ParticleSystem,
  base: PostCombustionBase,
  throttleAbove: number,
  turbo: number,
  turboEmitScale: number
): void {
  if (throttleAbove <= 0) {
    system.emitRate = 0;
    return;
  }

  const throttleGain = lerp(0.4, 1, throttleAbove);
  system.emitRate = base.emitRate * throttleGain * lerp(1, turboEmitScale, turbo);
  system.minEmitPower = base.minEmitPower * lerp(0.55, 1, throttleAbove) * lerp(1, 1.15, turbo);
  system.maxEmitPower = base.maxEmitPower * lerp(0.55, 1, throttleAbove) * lerp(1, 1.15, turbo);
  system.minSize = base.minSize * lerp(0.75, 1, throttleAbove) * lerp(1, 1.08, turbo);
  system.maxSize = base.maxSize * lerp(0.75, 1, throttleAbove) * lerp(1, 1.08, turbo);
  system.color1 = ignitedColor(base.color1, turbo);
  system.color2 = ignitedColor(base.color2, turbo);
}

/**
 * Flamme de tuyère sur l'empty `jet_post_combustion` : le débit suit la manette
 * des gaz et s'emballe sous post-combustion.
 */
export async function createPostCombustionParticleBundle(
  scene: Scene,
  node: TransformNode | AbstractMesh | null,
  tuning: PostCombustionTuning
): Promise<PostCombustionParticleBundle | null> {
  if (!node) {
    console.warn("[TankController] jet_post_combustion node missing; afterburner flame disabled.");
    return null;
  }

  let def: PostCombustionJson;
  try {
    def = await loadPostCombustionJson();
  } catch (err) {
    console.warn("[TankController] Post-combustion particles could not be loaded:", err);
    return null;
  }

  const emitter = MeshBuilder.CreateBox("emitter_post_combustion", { size: 0.02 }, scene);
  emitter.isVisible = false;
  emitter.isPickable = false;
  emitter.parent = node;
  emitter.position.copyFromFloats(def.emitter[0], def.emitter[1], def.emitter[2]);

  const base = buildBase(def);
  const system = buildSystem(scene, def, emitter);
  const threshold = clamp01(tuning.throttleThreshold);

  return {
    syncFlight(throttle: number, afterburner: boolean): void {
      const above = threshold >= 1 ? 0 : clamp01((clamp01(throttle) - threshold) / (1 - threshold));
      applyThrust(system, base, above, afterburner ? 1 : 0, Math.max(1, tuning.turboEmitScale));
    },
    dispose(): void {
      system.stop();
      system.dispose();
      emitter.dispose();
    }
  };
}
