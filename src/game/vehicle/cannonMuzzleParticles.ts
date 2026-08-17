import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

interface CannonMuzzleGeneratorJson {
  id: string;
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
  minInitialRotation?: number;
  maxInitialRotation?: number;
  minScaleX?: number;
  maxScaleX?: number;
  minScaleY?: number;
  maxScaleY?: number;
  blendMode: number;
  isBillboardBased: boolean;
  billboardMode: number;
  isLocal?: boolean;
  sizeGradients?: { gradient: number; factor1: number; factor2?: number }[];
  colorGradients?: { gradient: number; color: [number, number, number, number] }[];
}

interface CannonMuzzleShotJson {
  name: string;
  timing: {
    flashLifeSeconds: number;
    smokeDelayAfterFlashSeconds: number;
    smokeDurationSeconds: number;
    flashBurstCount: number;
  };
  generators: CannonMuzzleGeneratorJson[];
}

export interface CannonMuzzleParticleBundle {
  playShot(): void;
  update(dt: number): void;
  dispose(): void;
}

interface BuiltGenerator {
  def: CannonMuzzleGeneratorJson;
  emitter: Mesh;
  system: ParticleSystem;
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

async function loadCannonMuzzleShotJson(): Promise<CannonMuzzleShotJson> {
  const url = new URL("../../../assets/effects/cannon_muzzle_shot.json", import.meta.url).href;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load cannon_muzzle_shot.json: ${res.status}`);
  }
  return res.json() as Promise<CannonMuzzleShotJson>;
}

function buildGenerator(
  scene: Scene,
  def: CannonMuzzleGeneratorJson,
  parent: TransformNode | AbstractMesh
): BuiltGenerator {
  const emitter = MeshBuilder.CreateBox(`emitter_cannon_muzzle_${def.id}`, { size: 0.01 }, scene);
  emitter.isVisible = false;
  emitter.isPickable = false;
  emitter.parent = parent;
  emitter.position.copyFromFloats(def.emitter[0], def.emitter[1], def.emitter[2]);

  const ps = new ParticleSystem(`cannon_muzzle_${def.id}`, def.capacity, scene);
  ps.particleTexture = new Texture(resolveParticleTextureUrl(def.particleTexture), scene, true, false);
  ps.particleTexture.hasAlpha = true;
  ps.emitter = emitter;
  ps.isLocal = def.isLocal ?? true;
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
  if (def.minInitialRotation !== undefined) {
    ps.minInitialRotation = def.minInitialRotation;
  }
  if (def.maxInitialRotation !== undefined) {
    ps.maxInitialRotation = def.maxInitialRotation;
  }
  if (def.minScaleX !== undefined) {
    ps.minScaleX = def.minScaleX;
  }
  if (def.maxScaleX !== undefined) {
    ps.maxScaleX = def.maxScaleX;
  }
  if (def.minScaleY !== undefined) {
    ps.minScaleY = def.minScaleY;
  }
  if (def.maxScaleY !== undefined) {
    ps.maxScaleY = def.maxScaleY;
  }
  ps.blendMode = resolveBlendMode(def.blendMode);
  ps.isBillboardBased = def.isBillboardBased;
  ps.billboardMode = def.billboardMode;
  ps.renderingGroupId = 0;

  for (const gradient of def.sizeGradients ?? []) {
    ps.addSizeGradient(gradient.gradient, gradient.factor1, gradient.factor2 ?? gradient.factor1);
  }

  for (const gradient of def.colorGradients ?? []) {
    ps.addColorGradient(gradient.gradient, c4(gradient.color));
  }

  ps.start();
  return { def, emitter, system: ps };
}

/**
 * Flash (~100 ms) puis traînée de fumée (~1 s) sur le canon du tank.
 */
export async function createCannonMuzzleParticleBundle(
  scene: Scene,
  muzzleNode: TransformNode | AbstractMesh | null
): Promise<CannonMuzzleParticleBundle | null> {
  if (!muzzleNode) {
    return null;
  }

  let shotDef: CannonMuzzleShotJson;
  try {
    shotDef = await loadCannonMuzzleShotJson();
  } catch (err) {
    console.warn("[TankController] Cannon muzzle particles could not be loaded:", err);
    return null;
  }

  const flashDef = shotDef.generators.find((entry) => entry.id === "flash") ?? null;
  const smokeDef = shotDef.generators.find((entry) => entry.id === "smoke") ?? null;
  if (!flashDef || !smokeDef) {
    console.warn("[TankController] cannon_muzzle_shot.json must define flash and smoke generators.");
    return null;
  }

  const flash = buildGenerator(scene, flashDef, muzzleNode);
  const smoke = buildGenerator(scene, smokeDef, muzzleNode);

  let smokeDelayTimer = 0;
  let smokeActiveTimer = 0;

  return {
    playShot(): void {
      flash.system.emitRate = 0;
      flash.system.manualEmitCount = shotDef.timing.flashBurstCount;
      smoke.system.emitRate = 0;

      smokeDelayTimer =
        shotDef.timing.flashLifeSeconds + shotDef.timing.smokeDelayAfterFlashSeconds;
      smokeActiveTimer = 0;
    },

    update(dt: number): void {
      if (dt <= 0) {
        return;
      }

      if (smokeDelayTimer > 0) {
        smokeDelayTimer = Math.max(0, smokeDelayTimer - dt);
        if (smokeDelayTimer <= 0) {
          smoke.system.emitRate = smoke.def.emitRate;
          smokeActiveTimer = shotDef.timing.smokeDurationSeconds;
        }
      }

      if (smokeActiveTimer > 0) {
        smokeActiveTimer = Math.max(0, smokeActiveTimer - dt);
        if (smokeActiveTimer <= 0) {
          smoke.system.emitRate = 0;
        }
      }
    },

    dispose(): void {
      for (const entry of [flash, smoke]) {
        entry.system.emitRate = 0;
        entry.system.stop();
        entry.system.dispose();
        entry.emitter.dispose();
      }
    }
  };
}
