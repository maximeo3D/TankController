import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Node } from "@babylonjs/core/node";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

interface MissileJetSmokeGeneratorJson {
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
  /**
   * `false` = particules laissées dans le monde (traînée de fumée derrière le missile).
   */
  isLocal?: boolean;
  sizeGradients?: { gradient: number; factor1: number; factor2?: number }[];
}

interface MissileJetSmokeJson {
  name: string;
  generators: MissileJetSmokeGeneratorJson[];
}

export interface MissileJetSmokeInstance {
  dispose(): void;
}

export interface MissileJetSmokeFactory {
  attach(parent: TransformNode | AbstractMesh): MissileJetSmokeInstance | null;
  dispose(): void;
}

interface BuiltGenerator {
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

function stripJsonComments(source: string): string {
  return source.replace(/^\s*\/\/.*$/gm, "");
}

async function loadMissileJetSmokeJson(): Promise<MissileJetSmokeJson> {
  const url = new URL("../../../assets/effects/missile_jet_smoke.json", import.meta.url).href;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load missile_jet_smoke.json: ${res.status}`);
  }
  return JSON.parse(stripJsonComments(await res.text())) as MissileJetSmokeJson;
}

function buildGenerator(
  scene: Scene,
  def: MissileJetSmokeGeneratorJson,
  parent: TransformNode | AbstractMesh
): BuiltGenerator {
  const emitter = MeshBuilder.CreateBox(`emitter_missile_jet_${def.id}`, { size: 0.01 }, scene);
  emitter.isVisible = false;
  emitter.isPickable = false;
  emitter.parent = parent;
  emitter.position.copyFromFloats(def.emitter[0], def.emitter[1], def.emitter[2]);

  const ps = new ParticleSystem(`missile_jet_${def.id}_${parent.name}`, def.capacity, scene);
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
  ps.emitRate = def.emitRate;
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

  ps.start();
  return { emitter, system: ps };
}

function disposeBuiltGenerators(built: BuiltGenerator[]): void {
  for (const entry of built) {
    entry.system.stop();
    entry.system.dispose();
    entry.emitter.dispose();
  }
}

/**
 * Cherche un descendant par nom, en tolérant le suffixe Blender (`.001`) et le
 * préfixe que Babylon ajoute aux enfants clonés (`projectile_visual.<nom>`).
 */
export function findDescendantByName(
  root: Node,
  name: string
): TransformNode | AbstractMesh | null {
  const wanted = name.trim().toLowerCase().replace(/\.\d+$/, "");
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const nodeName = node.name.trim().toLowerCase().replace(/\.\d+$/, "");
    if (nodeName === wanted || nodeName.endsWith(`.${wanted}`)) {
      return node as TransformNode | AbstractMesh;
    }
    for (const child of node.getChildren()) {
      stack.push(child);
    }
  }
  return null;
}

/**
 * Fumée blanche touffue sur l'empty `jet_missile_smoke_*`, active pendant tout le vol.
 */
export async function createMissileJetSmokeFactory(scene: Scene): Promise<MissileJetSmokeFactory | null> {
  let def: MissileJetSmokeJson;
  try {
    def = await loadMissileJetSmokeJson();
  } catch (err) {
    console.warn("[TankController] Missile jet smoke could not be loaded:", err);
    return null;
  }

  if (def.generators.length === 0) {
    return null;
  }

  return {
    attach(parent: TransformNode | AbstractMesh): MissileJetSmokeInstance | null {
      const built = def.generators.map((generator) => buildGenerator(scene, generator, parent));
      return {
        dispose(): void {
          disposeBuiltGenerators(built);
        }
      };
    },
    dispose(): void {
      // Rien à garder en cache côté factory ; les instances vivent avec le projectile.
    }
  };
}
