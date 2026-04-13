import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** JSON export (Babylon-ish) for track dust / gravel particle systems */
interface TrackParticleJson {
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

export interface TrackTreadParticleBundle {
  setAdvancing(advancing: boolean): void;
  dispose(): void;
}

function v3(t: [number, number, number]): Vector3 {
  return new Vector3(t[0], t[1], t[2]);
}

function c4(t: [number, number, number, number]): Color4 {
  return new Color4(t[0], t[1], t[2], t[3]);
}

async function loadJson(url: string): Promise<TrackParticleJson> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status}`);
  }
  return res.json() as Promise<TrackParticleJson>;
}

/** Fichiers dans `assets/effects/` (ex. smoke.png) ou URL absolue http(s). */
function resolveParticleTextureUrl(ref: string): string {
  if (/^https?:\/\//i.test(ref)) {
    return ref;
  }
  const fileName = ref.replace(/^.*[/\\]/, "").trim();
  return new URL(`../../assets/effects/${fileName}`, import.meta.url).href;
}

function buildSystem(
  scene: Scene,
  def: TrackParticleJson,
  emitterMesh: Mesh
): { system: ParticleSystem; baseEmitRate: number } {
  const ps = new ParticleSystem(`track_${def.name}_${emitterMesh.name}`, def.capacity, scene);
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
  // JSON peut exporter ADD (2) / ONE_ONE (0) : rendu très clair et peu compatible avec la profondeur.
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.isBillboardBased = def.isBillboardBased;
  ps.billboardMode = def.billboardMode;
  // Même groupe que le sol / le char : évite de dessiner les sprites après toute la géométrie (effet « x-ray »).
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

/**
 * Spawns smoke + gravel particle systems on two suspension points (rear tread area).
 */
export async function createTrackTreadParticleBundle(
  scene: Scene,
  susLeft: TransformNode | AbstractMesh | null,
  susRight: TransformNode | AbstractMesh | null
): Promise<TrackTreadParticleBundle | null> {
  if (!susLeft || !susRight) {
    return null;
  }

  const smokeUrl = new URL("../../assets/effects/track_smoke.json", import.meta.url).href;
  const rocksUrl = new URL("../../assets/effects/track_rocks.json", import.meta.url).href;

  const [smokeDef, rocksDef] = await Promise.all([loadJson(smokeUrl), loadJson(rocksUrl)]);

  const entries: { system: ParticleSystem; baseEmitRate: number; emitter: Mesh }[] = [];

  const attach = (parent: TransformNode | AbstractMesh, side: string): void => {
    const offSmoke = MeshBuilder.CreateBox(`emitter_track_smoke_${side}`, { size: 0.02 }, scene);
    offSmoke.isVisible = false;
    offSmoke.isPickable = false;
    offSmoke.parent = parent;
    offSmoke.position.copyFromFloats(
      smokeDef.emitter[0],
      smokeDef.emitter[1],
      smokeDef.emitter[2]
    );

    const offRocks = MeshBuilder.CreateBox(`emitter_track_rocks_${side}`, { size: 0.02 }, scene);
    offRocks.isVisible = false;
    offRocks.isPickable = false;
    offRocks.parent = parent;
    offRocks.position.copyFromFloats(
      rocksDef.emitter[0],
      rocksDef.emitter[1],
      rocksDef.emitter[2]
    );

    const s1 = buildSystem(scene, smokeDef, offSmoke);
    const s2 = buildSystem(scene, rocksDef, offRocks);
    entries.push(
      { system: s1.system, baseEmitRate: s1.baseEmitRate, emitter: offSmoke },
      { system: s2.system, baseEmitRate: s2.baseEmitRate, emitter: offRocks }
    );
  };

  attach(susLeft, "L");
  attach(susRight, "R");

  return {
    setAdvancing(advancing: boolean): void {
      for (const e of entries) {
        e.system.emitRate = advancing ? e.baseEmitRate : 0;
      }
    },
    dispose(): void {
      for (const e of entries) {
        e.system.stop();
        e.system.dispose();
        e.emitter.dispose();
      }
    }
  };
}
