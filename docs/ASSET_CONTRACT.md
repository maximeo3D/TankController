# Asset Contract

## Purpose

This document defines the naming and structural rules for Blender and `GLB` assets used by the game.

The goal is to make asset integration deterministic in code.

## Global Rules

- Units should remain consistent across all exports (current production scale is **`×10`** vs. early concept).
- Transforms should be applied before export whenever possible.
- Visible meshes and collision helpers should be clearly separated.
- Naming must stay stable once code depends on it.
- Only `COL_*` helpers should be invisible at runtime (enforced in code; optional **debug** red wireframe for `COL_*` / terrain colliders can be toggled in `hideColliderMeshes` inside `createGameplayScene.ts`).

## Naming Conventions

### Visible Meshes

- `SM_*`: static visible meshes
- `DM_*`: dynamic visible meshes

### Collision Meshes

- `COL_*`: collision-only meshes, hidden in gameplay

### Spawn and Special Points

- `SPAWN_*`: spawn points
- `MUZZLE_*`: projectile spawn points
- `CAM_*`: gameplay camera and camera-related helpers

### Suspension (tank)

- `SUS_FL`, `SUS_FR`, `SUS_ML`, `SUS_MR`, `SUS_RL`, `SUS_RR`: raycast probe points for suspension (six wheels / contact points).  
  Code also accepts Blender-style duplicates such as `SUS_FL.001` (prefix match).

### Legacy / Optional

- `GROUND_FL`, `GROUND_FR`, `GROUND_RL`, `GROUND_RR`: optional four-corner grounding helpers; if present and `SUS_*` are incomplete, code may derive six suspension samples from corners + midpoints.

### UI / Weapons (tank)

- `UI_tank_reticle`: reticle mesh (world position updated each frame; billboard in code)
- `AMMO_obus`, `AMMO_balle`: template meshes for projectiles (hidden; cloned when firing)

## Terrain Contract

### Required Nodes

- `SPAWN_tank`

### Supported Mesh Types

- `SM_*` for decor and static world pieces
- `DM_*` for physically simulated world objects
- `COL_*` for blocking shapes such as walls, obstacles, and simplified collision volumes

### Terrain Integration Rules

- `SPAWN_tank` defines the player spawn transform
- `SM_*` are loaded as visible static environment meshes
- `DM_*` are loaded as visible dynamic environment meshes
- `COL_*` are hidden and used as collision sources only

### Recommended Terrain Authoring

- Keep collision shapes simpler than render meshes
- Use `COL_*` around walls and blockers rather than relying on visual mesh topology
- Avoid unnecessary small collision details

## Tank Contract

### Required Nodes

- armature: `tank_armature`
- bone chain: `main > caisse > tourelle > canon`
- muzzle socket: `MUZZLE_tank`
- gameplay camera: `CAM_tank`
- **orbit pivot (recommended):** `CAM_pivot` — empty placed above the turret (or at the intended orbit center); moves with the hull / rig
- collider mesh: `COL_tank`
- **suspension empties:** `SUS_FL`, `SUS_FR`, `SUS_ML`, `SUS_MR`, `SUS_RL`, `SUS_RR`

### Functional Meaning

- `main`: top-level rig root
- `caisse`: chassis reference for movement and hull orientation
- `tourelle`: yaw pivot
- `canon`: pitch pivot
- `MUZZLE_tank`: origin and forward reference for projectile spawning
- `CAM_tank`: gameplay camera (must be a **TargetCamera** family type in Babylon, e.g. Universal / Free, for `setTarget` + orbit)
- `CAM_pivot`: world anchor the camera **orbits** around (code updates camera position each frame)
- `SUS_*`: downward ray origins for suspension (converted to anchor-local offsets after load)
- `COL_tank`: simplified collision mesh for the tank (convex hull in physics)

### Transform Expectations

- `tourelle` must rotate only on yaw
- `canon` must rotate only on pitch
- `MUZZLE_tank` should face forward in the intended firing direction
- `CAM_pivot` should sit where the orbit should **feel** centered (often above turret hatch)
- `CAM_tank` should be authored at a reasonable distance and height; initial pose is used to seed orbit yaw/pitch/radius
- `COL_tank` should roughly cover the playable tank volume without tiny protrusions
- `SUS_*` should sit near wheel / ground contact height so suspension rays hit terrain reliably

### Runtime Rules (implementation)

- `COL_tank` is hidden at runtime and parented to the **physics anchor** (`tank_anchor`)
- Other tank visuals are parented under **`tank_visual_root`** for smoothing / separation
- `CAM_tank` is **unparented** at load when `CAM_pivot` is found; position is preserved in world space; default camera inputs are cleared so orbit is fully script-driven
- Aiming uses **screen picking** from the active camera, not raw bone deltas from mouse alone

## Cannon and Turret Constraints (authoring)

### Turret

- rotation axis: yaw only
- range: free `360` degrees
- pitch locked
- roll locked

### Cannon

- rotation axis: pitch only
- yaw locked
- roll locked
- pitch range enforced in JSON (`cannon.minPitchDeg` / `maxPitchDeg`)

## Export Expectations

- current production export is scaled **`×10`** from Blender
- keep this choice consistent across later exports
- if an asset export changes a node name or hierarchy, **update this contract** before integration

## Validation Checklist

Before an asset is considered valid:

- tank and terrain export successfully as `GLB`
- all required nodes are present with exact names (or documented Blender suffixes such as `.001`)
- `COL_*` helpers exist where needed
- `SPAWN_tank` is correctly placed
- `MUZZLE_tank` is positioned at the cannon muzzle
- `CAM_pivot` exists and sits at the intended orbit center
- `CAM_tank` exists and is a suitable Babylon camera type for third-person orbit
- six `SUS_*` empties exist and align with intended ground probes
- `tourelle` rotates correctly without unintended pitch or roll
- `canon` rotates correctly without unintended yaw or roll

## Non-Goals For v0

- destructible asset pipelines
- animation retargeting
- multiple unrelated camera rigs per tank (single `CAM_tank` + `CAM_pivot` is the standard)
- editable controls authored in assets
