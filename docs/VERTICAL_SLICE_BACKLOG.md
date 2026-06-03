# Vertical Slice Backlog

## Objective

Reach a first playable build where the player can navigate menus, load a level, control the tank, aim, shoot both weapons, and validate the core feel.

Status notes below reflect the **current codebase** as of the latest documentation pass.

## Phase 1 - Bootstrap

- initialize the project with Babylon.js and Havok
- create the main application bootstrap
- load one scene and start the main loop
- add state management for `MainMenu`, `Controls`, `LevelSelect`, and `Gameplay`

**Status:** done (baseline app structure).

## Phase 2 - Asset Loading

- load `assets/terrain.glb`
- load `assets/tank.glb`
- load `assets/power-ups.glb`
- resolve required nodes by exact name (with limited Blender suffix tolerance where implemented)
- hide all `COL_*` nodes in gameplay (optional debug wireframe path exists in `hideColliderMeshes`)
- resolve `SPAWN_tank` and spawn the tank there
- verify `MUZZLE_tank`, `CAM_tank`, `COL_tank`, **`CAM_pivot`**, **`SUS_*`**
- resolve `PU_*` spawn empties on terrain

**Status:** done; tank uses physics anchor + visual root; `CAM_pivot` + orbit when present; power-up templates cloned from `power-ups.glb`.

## Phase 3 - Menu Flow

- build `MainMenu`
- build `Controls`
- build `LevelSelect`
- implement back navigation
- connect one level entry to gameplay startup

**Status:** per app implementation (unchanged from project plan). See `docs/GUI_MENU_SYSTEM.md`.

## Phase 4 - Tank Locomotion

- implement `ZQSD` input
- implement chassis movement (physics-driven: traction / lateral damping / suspension)
- implement chassis rotation
- block movement when fuel (battery) reaches `0`
- implement fuel drain only while moving

**Status:** done; suspension uses Havok raycasts from `SUS_*` points; values in `suspension` + `movement` JSON.

## Phase 5 - Aim and Camera

- **Aiming:** screen-space ray from gameplay camera through pointer → terrain / plane → reticle position → turret yaw + cannon pitch toward target (not independent mouse-axes-only mode).
- **Camera:** with `CAM_pivot` + `CAM_tank`, detach camera, clear default inputs, apply **orbit** each frame from mouse deltas (`lookDeltaX` / `lookDeltaY`), then `setTarget(pivot)`.
- clamp orbit pitch and radius via `camera.*` orbit keys in JSON
- implement zoom **toggle** on right mouse button using an alternative render camera (FOV via `camera.zoomViewFovDeg`)
- apply FOV boost effect while boosting

**Status:** done for orbit + center-screen ray aim + zoom view toggle + boost FOV + orbit collision.

Notes:

- Orbit collision prevents the camera from clipping through world geometry (ray + padding).
- Aiming is driven by the orbit camera (control camera) even while the zoom view is active (render-only).

## Phase 6 - Boost and Resources

- implement boost gauge (overcharge) with auto-recharge
- enable boost traction + FOV while moving with `Shift` held and gauge > 0
- drain boost at `overchargeDrainBoostPerSecond` **while `Shift` is held**
- recharge boost at `overchargeRechargePerSecond` when `Shift` is released

**Status:** done (see `TankGameplayController.applyMovement` + `energy` in JSON). No boost refill power-up — gauge is self-managed.

## Phase 7 - Weapons

- implement weapon selection with `1` and `2`
- implement shell weapon with chamber logic
- implement shell reserve and reload timing
- implement bullet weapon with continuous fire while held
- make both projectile types ballistic (Havok bodies; filters exclude tank + projectiles)

**Status:** done.

## Phase 8 - Physics

- configure static physics for `SM_*`
- configure dynamic physics for `DM_*`
- configure collision from `COL_*`
- configure tank collider from `COL_tank` (convex hull on physics body)
- verify projectile interaction with world objects
- **tank–ground:** suspension raycasts + optional initial Y snap to terrain

**Status:** done for world + tank + projectiles; ongoing tuning via JSON.

## Phase 9 - Health, Power-Ups, and HUD

- vehicle health (`vehicle.healthMax`, `startingHealth`)
- `takeDamage` with shield damage reduction (no wall collision damage)
- power-up system: spawn, pickup, highlight, respawn / singleUse hide
- types: `ammo_shell`, `fuel`, `repair`, `shield` (enabled in config)
- gameplay HUD from `UI_hud.json`: health, fuel, boost bars
- shield UX: blue full health bar + blue tank glow while active

**Status:** done for listed types; enemy damage sources and death state not implemented yet.

## Phase 10 - Debug and Feel

- display temporary debug info for:
  - health / shield timer
  - fuel and boost gauges
  - current weapon
  - shell ammo
  - reload/chamber state
- tune values from `TankController.json` (including **camera orbit**, **suspension**, **grounding**, **powerUps**)
- validate spawn orientation, aim feel, camera comfort, reticle scale (`baseScale` in code for world scale)

**Status:** ongoing tuning; collider wireframe debug is **off** by default in `hideColliderMeshes`.

## Phase 11 - Tracks (visual)

- spawn track marks while tank moves, using material from `TEX_tracks`
- implementation uses spawned segment planes (not a single mesh decal)
- currently spawned from `SUS_ML` and `SUS_MR` to reduce noise; tuning via `tracks.*` config

**Status:** implemented; tuning ongoing.

## Deferred After Vertical Slice

- `boost` and `weapon_boost` power-up pickups (logic / art direction TBD)
- enemies and AI
- damage from enemy weapons hitting the player tank
- death / game over when health reaches 0
- HUD polish (shield timer text, fuel low warning, etc.)
- audio polish beyond baseline weapon sounds
- VFX polish beyond impacts / shockwaves / sparks
- pointer lock / RMB-only orbit (if desired)

## Acceptance Checklist

The vertical slice is successful when:

- menu navigation works from launch
- one level loads from `LevelSelect`
- tank spawns at `SPAWN_tank`
- tank moves and rotates correctly with suspension supporting the hull
- turret and cannon track the **aiming ray** / reticle target correctly
- camera orbits around **`CAM_pivot`** when configured, without fighting default camera inputs
- zoom hold works
- boost drains on `Shift`, refills when released, and affects traction/FOV while moving
- shell firing respects ammo and chamber timing
- bullet firing works while left click is held
- power-ups spawn at `PU_*` and apply configured effects
- health bar and shield feedback behave as documented
- `SM_*`, `DM_*`, and `COL_*` behave correctly
- tuning can be changed through `config/TankController.json` (including orbit, suspension, vehicle, energy, powerUps)
