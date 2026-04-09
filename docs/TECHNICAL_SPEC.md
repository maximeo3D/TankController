# TankController - Technical Specification

## Goal

Create a small-scale tank game using `Babylon.js 9.1.0` with `Havok Physics`.

The player controls a toy tank on a terrain loaded from `GLB` assets. The first milestone is a clean vertical slice with:

- front-end menu flow
- tank movement and aiming
- ballistic weapons
- camera orbit and zoom
- battery and overcharge resources
- asset loading conventions stable enough to support later content

## Engine and Runtime

- Rendering: `Babylon.js 9.1.0`
- Physics: `Havok Physics` plugin for Babylon.js
- Assets: `GLB`
- Parameters: external JSON config file (`config/TankController.json`)

## Scale

The project uses an intentionally enlarged scale compared to the original toy concept.

- Assets are exported from Blender with **`×10` scale** (or equivalent); gameplay and physics are tuned in that space.
- Reticle screen size is compensated in code (`baseScale` on `UI_tank_reticle`) so HUD stays readable at large world units.
- If physics become unstable, prefer tuning JSON values before changing the asset contract.

## Application States

The game is built as a single application with UI states, not as a multi-page website.

### States

- `MainMenu`
- `LevelSelect`
- `Controls`
- `Gameplay`
- later: `PauseMenu`, `GameOver`, `Victory`

### Initial Navigation Flow

`MainMenu`

- `Play` → `LevelSelect`
- `Controls` → `Controls`

`Controls`

- shows current shortcuts
- controls are not editable in v0
- includes a back action to `MainMenu`

`LevelSelect`

- lists available levels
- initial implementation can expose one level only
- selecting a level starts `Gameplay`

## Assets

### Current Files

- `assets/tank.glb`
- `assets/terrain.glb`

### Terrain

The terrain file contains:

- visible static meshes prefixed `SM_`
- visible dynamic meshes prefixed `DM_`
- invisible collider meshes prefixed `COL_`
- an empty `SPAWN_tank` used as the player spawn point

### Tank

The tank file contains:

- armature `tank_armature`
- bone hierarchy `main > caisse > tourelle > canon`
- empty `MUZZLE_tank` parented to `canon`
- camera `CAM_tank` (gameplay view; see **Camera** below)
- empty **`CAM_pivot`**: orbit center above the turret (used at runtime)
- six empties **`SUS_FL`**, **`SUS_FR`**, **`SUS_ML`**, **`SUS_MR`**, **`SUS_RL`**, **`SUS_RR`**: suspension raycast origins (wheel / contact probes)
- optional legacy **`GROUND_*`** four-corner names (fallback only if `SUS_*` are incomplete)
- mesh **`UI_tank_reticle`**: world-space reticle (unparented in code, billboard)
- meshes **`AMMO_obus`** / **`AMMO_balle`**: projectile templates (hidden, cloned on fire)
- invisible mesh **`COL_tank`**: convex hull physics collider for the tank

## Visibility Rules

- In normal gameplay, **`COL_*` are not rendered** (`hideColliderMeshes` in `createGameplayScene.ts`; debug wireframe can be toggled via `debugShowColliders` in that function).
- `COL_*` must not participate in gameplay picking (reticle uses `SM_*` / `DM_*` only).
- `SM_*` / `DM_*` stay visible as authored.

## Physics Rules

### Terrain and Decor

- `SM_*` receive static physics behavior (mesh colliders).
- `DM_*` receive dynamic physics behavior (convex hull, mass from volume heuristic).
- `COL_*` define blocking geometry where needed.

### Tank

- **`COL_tank`** is the collision shape for the tank (convex hull); it is parented to the physics anchor, not driven by suspension alone.
- The rigid body is attached to a **`tank_anchor`** transform node; visuals hang under **`tank_visual_root`** for optional smoothing.
- **Suspension**: each frame, Havok **raycasts** are cast downward from the six `SUS_*` points (positions in anchor space). Spring-damper forces are applied at hit points so the hull stays supported; parameters live under `suspension` in `TankController.json` (e.g. `rayLength`, `restLength`, `springStrength`).
- **Spawn snap**: once per scene load, the tank anchor may be lowered so probe rays match a nominal contact distance (`snapTankAnchorYToTerrain`), reducing float at spawn.
- **Grounding metadata** (`grounding` in JSON): used for legacy / helper data; primary behavior is the dynamic suspension + collider.

### Power-Ups

- power-ups are collected when `COL_tank` overlaps the power-up collider
- power-up implementation is postponed until tank control is validated

## Controls

### Movement

- `ZQSD`: chassis movement
- `Shift`: boost while held

If battery is `0%`:

- tank movement is disabled
- turret aiming remains available (subject to camera / reticle)
- firing remains available

If overcharge is `0%`:

- boost input has no effect

### Aiming (current implementation)

- **Not** raw “mouse X = turret only, mouse Y = cannon only” on its own.
- Each frame, a **picking ray** is built from the **active gameplay camera** through the pointer (`createPickingRay`); it intersects terrain (`SM_*` / `DM_*`) or a fallback horizontal plane.
- The **reticle** (`UI_tank_reticle`) is placed at the hit point (with a max distance from the tank).
- **Turret yaw** and **cannon pitch** targets are derived from that world target in hull space, then rotated toward limits at configured speeds (`turret` / `cannon` in JSON).
- With **`CAM_pivot`** present and a **`TargetCamera`**-compatible `CAM_tank`, **mouse movement applies an orbit** (yaw/pitch around the pivot in hull space, distance clamped) before the ray is cast, so the view rotates around the tank like a third-person tank game.

### Weapons

- `1`: shell weapon
- `2`: machine gun weapon
- left mouse button held:
  - shells fire automatically when chambered and cooldown allows
  - bullets fire continuously while held

### Zoom

- right mouse button held
- zoom reduces camera FOV using `camera.zoomFovMultiplier` in JSON
- while boost is active, camera FOV can increase using `camera.boostFovMultiplier`

## Camera configuration (`config/TankController.json`)

Under `camera`, besides FOV:

- **`orbitYawDegPerPixel`** / **`orbitPitchDegPerPixel`**: mouse orbit sensitivity when `CAM_pivot` + orbit path is active
- **`orbitMinPitchDeg`** / **`orbitMaxPitchDeg`**: vertical orbit limits
- **`orbitMinRadius`** / **`orbitMaxRadius`**: distance clamp
- **`orbitDefaultRadius`**: fallback if initial camera–pivot distance is too small to infer

At runtime, if `CAM_pivot` exists, **`CAM_tank` is detached** from the rig (world position preserved), default Babylon camera inputs on `FreeCamera` are cleared, and position/target are driven in code.

## Weapon Rules

### Shells

- finite reserve
- starting ammo: `14` (configurable)
- one shell available in chamber at start (configurable)
- chamber reload time: `4` seconds (configurable)
- shell pickups refill ammo reserve
- ballistic projectile
- high damage
- lower velocity (configurable)

### Bullets

- fire rate configurable (`shotsPerSecond`)
- ballistic projectile
- lower damage
- higher velocity (configurable)

## Turret and Cannon Constraints

### Turret

- yaw only (bone `tourelle`)
- free `360` degree rotation
- turn rate from `turret.yawSpeedDeg` in JSON

### Cannon

- pitch only (bone `canon`)
- min/max pitch from `cannon.minPitchDeg` / `cannon.maxPitchDeg` in JSON
- pitch speed from `cannon.pitchSpeedDeg`

## Energy System

### Battery

- maximum: `100`
- starts at `100`
- drains at `1%/s` while tank movement input is producing movement
- reaching `0` disables chassis movement only

### Overcharge

- maximum: `100`
- starts at `50`
- drains at `5%/s` while boost is active
- if empty, boost stops naturally

### Planned Pickups

- battery pickup: restores base battery
- overcharge pickup: restores overcharge
- weapon power-up: increases damage and projectile velocity
- shell crate: restores shell reserve

## Weapon Power-Ups

- up to `2` stacks
- each stack grants:
  - `+25%` damage
  - `+25%` projectile velocity

## Configuration Strategy

All tank gameplay tuning must be externalized in `config/TankController.json`.

This file is the source of truth for:

- movement, suspension, grounding
- turn rates, pitch limits
- camera FOV and **orbit** parameters
- battery and overcharge values
- weapon values
- power-up multipliers

The game code should avoid hardcoding gameplay numbers except for small glue constants (e.g. reticle `baseScale` in `TankGameplayController.ts` until moved to JSON).

## Recommended Module Layout (actual)

- `src/app/` — bootstrap, state transitions
- `src/game/` — `createGameplayScene`, `TankGameplayController`, `TankInput`
- `src/config/` — typed config + JSON import
- `src/assets/` — asset URLs

## Vertical Slice Scope

See `docs/VERTICAL_SLICE_BACKLOG.md`.

## Main Risks

- physics instability due to small or inconsistent asset scales
- unexpected local axes on imported bones and empties
- mismatch between visible meshes and `COL_tank`
- ballistic tuning at large world scale
- camera feel: orbit limits and `CAM_pivot` placement must match art intent

## Development Rule

Do not expand scope before the tank feels good to drive, aim, and fire in the first level.
