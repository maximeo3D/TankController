/**
 * Liste, pour chaque os d'un skin glTF, le nombre de vertices qui lui sont
 * réellement affectés (poids > 0), afin de valider qu'un os peut déformer la
 * géométrie avant de piloter son scale depuis le code.
 *
 *   node tools/inspectBoneWeights.mjs assets/jet.glb engine
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
const focusBone = process.argv[3];
if (!path) {
  console.error("usage: node tools/inspectBoneWeights.mjs <fichier.glb> [os]");
  process.exit(1);
}

const buf = readFileSync(path);
const jsonLength = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
const binStart = 20 + jsonLength + 8;
const bin = buf.subarray(binStart);

const COMPONENT = {
  5120: { size: 1, read: (b, o) => b.readInt8(o) },
  5121: { size: 1, read: (b, o) => b.readUInt8(o) },
  5122: { size: 2, read: (b, o) => b.readInt16LE(o) },
  5123: { size: 2, read: (b, o) => b.readUInt16LE(o) },
  5125: { size: 4, read: (b, o) => b.readUInt32LE(o) },
  5126: { size: 4, read: (b, o) => b.readFloatLE(o) }
};
const COMPONENT_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(index) {
  const acc = json.accessors[index];
  const comp = COMPONENT[acc.componentType];
  const numComp = COMPONENT_COUNT[acc.type];
  const view = json.bufferViews[acc.bufferView];
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = view.byteStride ?? comp.size * numComp;
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const row = [];
    for (let c = 0; c < numComp; c++) {
      row.push(comp.read(bin, base + i * stride + c * comp.size));
    }
    out.push(row);
  }
  return out;
}

const nodes = json.nodes ?? [];
for (const [skinIndex, skin] of (json.skins ?? []).entries()) {
  const joints = skin.joints ?? [];
  console.log(`\n=== skin ${skinIndex} (${joints.length} os)`);

  const counts = new Map();
  const meshNames = [];

  nodes.forEach((node) => {
    if (node.skin !== skinIndex || node.mesh === undefined) {
      return;
    }
    meshNames.push(node.name ?? "?");
    for (const [primIndex, prim] of json.meshes[node.mesh].primitives.entries()) {
      const jointsAttr = prim.attributes.JOINTS_0;
      const weightsAttr = prim.attributes.WEIGHTS_0;
      if (jointsAttr === undefined || weightsAttr === undefined) {
        continue;
      }
      const jointData = readAccessor(jointsAttr);
      const weightData = readAccessor(weightsAttr);
      const materialName =
        prim.material !== undefined ? json.materials[prim.material].name : `prim_${primIndex}`;

      for (let v = 0; v < jointData.length; v++) {
        for (let k = 0; k < 4; k++) {
          if (weightData[v][k] <= 0) {
            continue;
          }
          const boneName = nodes[joints[jointData[v][k]]].name ?? "?";
          const key = `${boneName}`;
          const entry = counts.get(key) ?? { verts: 0, byMaterial: new Map() };
          entry.verts++;
          entry.byMaterial.set(materialName, (entry.byMaterial.get(materialName) ?? 0) + 1);
          counts.set(key, entry);
        }
      }
    }
  });

  console.log(`meshes: ${meshNames.join(", ")}`);
  for (const joint of joints) {
    const name = nodes[joint].name ?? "?";
    const entry = counts.get(name);
    const detail = entry
      ? [...entry.byMaterial].map(([m, n]) => `${m}=${n}`).join(" ")
      : "aucun vertex";
    console.log(`  ${name.padEnd(16)} ${String(entry?.verts ?? 0).padStart(5)} verts   ${detail}`);
  }

  if (focusBone) {
    const entry = counts.get(focusBone);
    console.log(
      `\n--> "${focusBone}": ${entry?.verts ?? 0} vertices pondérés` +
        (entry ? ` (${[...entry.byMaterial].map(([m, n]) => `${m}=${n}`).join(", ")})` : "")
    );
  }
}
