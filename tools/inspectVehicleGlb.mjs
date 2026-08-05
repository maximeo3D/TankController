/**
 * Inspecte un GLB de véhicule et vérifie qu'il respecte le contrat attendu par
 * le moteur : noms des empties, hiérarchie d'os, axes locaux et échelle.
 *
 *   node tools/inspectVehicleGlb.mjs assets/jet.glb
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node tools/inspectVehicleGlb.mjs <fichier.glb>");
  process.exit(1);
}

const buf = readFileSync(path);
const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
const nodes = json.nodes ?? [];

const parentOf = new Map();
nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));

const joints = new Set();
for (const skin of json.skins ?? []) for (const j of skin.joints ?? []) joints.add(j);

function chainTo(i) {
  const out = [];
  let cur = i;
  let guard = 0;
  while (cur !== undefined && guard++ < 64) {
    out.unshift(cur);
    cur = parentOf.get(cur);
  }
  return out;
}

function quatToMat([x, y, z, w]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
  ];
}

function mul(a, b) {
  const o = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r][c] += a[r][k] * b[k][c];
  return o;
}

/** Direction monde (glTF) -> repère Blender, plus lisible pour l'auteur du modèle. */
const AXIS_LABELS = [
  [[1, 0, 0], "+X blender (droite)"],
  [[-1, 0, 0], "-X blender (gauche)"],
  [[0, 1, 0], "+Z blender (haut)"],
  [[0, -1, 0], "-Z blender (bas)"],
  [[0, 0, 1], "-Y blender (arriere)"],
  [[0, 0, -1], "+Y blender (avant)"]
];

function labelDirection(v) {
  let best = "";
  let bestDot = -2;
  for (const [ref, name] of AXIS_LABELS) {
    const d = v[0] * ref[0] + v[1] * ref[1] + v[2] * ref[2];
    if (d > bestDot) {
      bestDot = d;
      best = name;
    }
  }
  return bestDot > 0.99 ? best : `${best} (approx, dot ${bestDot.toFixed(2)})`;
}

function worldRotation(i) {
  let m = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];
  for (const idx of chainTo(i)) m = mul(m, quatToMat(nodes[idx].rotation ?? [0, 0, 0, 1]));
  return m;
}

console.log(`=== ${path}`);
console.log(`nodes=${nodes.length} meshes=${(json.meshes ?? []).length} skins=${(json.skins ?? []).length}`);

console.log("\n--- OS (hierarchie + axes locaux au repos) ---");
nodes.forEach((n, i) => {
  if (!joints.has(i)) return;
  const m = worldRotation(i);
  const col = (c) => [m[0][c], m[1][c], m[2][c]];
  console.log(`\n${chainTo(i).map((k) => nodes[k].name).join(" / ")}`);
  console.log(`  local X -> ${labelDirection(col(0))}`);
  console.log(`  local Y -> ${labelDirection(col(1))}   <- direction tete->queue`);
  console.log(`  local Z -> ${labelDirection(col(2))}`);
});

console.log("\n--- EMPTIES ET MAILLAGES ---");
nodes.forEach((n, i) => {
  if (joints.has(i)) return;
  const t = n.translation ?? [0, 0, 0];
  const kind = n.mesh !== undefined ? "MESH " : "EMPTY";
  console.log(
    `${kind} ${(n.name ?? "?").padEnd(28)} pos glTF=[${t.map((v) => v.toFixed(3)).join(", ")}]   ` +
      `parent=${parentOf.has(i) ? nodes[parentOf.get(i)].name : "(racine)"}`
  );
});

console.log("\n--- EMPRISE DES MAILLAGES (metres) ---");
nodes.forEach((n) => {
  if (n.mesh === undefined) return;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const prim of json.meshes[n.mesh].primitives ?? []) {
    const acc = json.accessors[prim.attributes.POSITION];
    if (!acc?.min || !acc?.max) continue;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], acc.min[k]);
      max[k] = Math.max(max[k], acc.max[k]);
    }
  }
  if (!Number.isFinite(min[0])) return;
  console.log(
    `${(n.name ?? "?").padEnd(28)} largeur=${(max[0] - min[0]).toFixed(3)} ` +
      `hauteur=${(max[1] - min[1]).toFixed(3)} longueur=${(max[2] - min[2]).toFixed(3)} ` +
      `bas=${min[1].toFixed(3)}`
  );
});
