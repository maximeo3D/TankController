import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "assets/jet.glb";
const buf = readFileSync(path);
const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
const nodes = json.nodes ?? [];
const parentOf = new Map();
nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));

function chain(i) {
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
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      for (let k = 0; k < 3; k++) {
        o[r][c] += a[r][k] * b[k][c];
      }
    }
  }
  return o;
}

function worldRotation(i) {
  let m = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];
  for (const idx of chain(i)) {
    m = mul(m, quatToMat(nodes[idx].rotation ?? [0, 0, 0, 1]));
  }
  return m;
}

function worldPosition(i) {
  let p = [0, 0, 0];
  for (const idx of chain(i)) {
    const t = nodes[idx].translation ?? [0, 0, 0];
    p = [p[0] + t[0], p[1] + t[1], p[2] + t[2]];
  }
  return p;
}

for (const name of process.argv.slice(3)) {
  const idx = nodes.findIndex((n) => n.name === name);
  if (idx < 0) {
    console.log(`${name}: not found`);
    continue;
  }
  const m = worldRotation(idx);
  const p = worldPosition(idx);
  console.log(`\n${name}`);
  console.log(`  pos glTF: [${p.map((v) => v.toFixed(3)).join(", ")}]`);
  for (const [label, col] of [
    ["local +X", 0],
    ["local +Y", 1],
    ["local +Z", 2]
  ]) {
    const v = [m[0][col], m[1][col], m[2][col]];
    console.log(`  ${label} world: [${v.map((x) => x.toFixed(3)).join(", ")}]`);
  }
}
