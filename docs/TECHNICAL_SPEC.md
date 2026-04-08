# TankController - Technical Specification v0

## Goal

Create a small-scale tank game using `Babylon.js 9.1.0` with `Havok Physics`.

The player controls a toy tank on a terrain loaded from `GLB` assets. The first milestone is a clean vertical slice with:

- front-end menu flow
- tank movement and aiming
- ballistic weapons
- camera and zoom
- battery and overcharge resources
- asset loading conventions stable enough to support later content

## Engine and Runtime

- Rendering: `Babylon.js 9.1.0`
- Physics: `Havok Physics` plugin for Babylon.js
- Assets: `GLB`
- Parameters: external JSON config file

## Scale

The project uses an intentionally enlarged scale compared to the original toy concept.

- Assets are exported from Blender with `x10` scale
- Terrain and gameplay values should be tuned in this enlarged space
- If physics become unstable, gameplay values should be adjusted before changing the asset contract

## Application States

The game should be built as a single application with UI states, not as a multi-page website.

### States

- `MainMenu`
- `LevelSelect`
- `Controls`
- `Gameplay`
- later: `PauseMenu`, `GameOver`, `Victory`

### Initial Navigation Flow

`MainMenu`

- `Play` -> `LevelSelect`
- `Controls` -> `Controls`

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
- camera `CAM_tank` parented to `caisse`
- invisible mesh `COL_tank` used as the tank collider

## Visibility Rules

- All meshes are visible by default except `COL_*`
- `COL_tank` must never be rendered in gameplay
- `COL_*` from terrain must never be rendered in gameplay

## Physics Rules

### Terrain and Decor

- `SM_*` receive static physics behavior
- `DM_*` receive dynamic physics behavior
- `COL_*` are used to define blocking geometry where needed

### Tank

- `COL_tank` is the collision source for the tank
- the visible tank mesh follows the physical controller
- the tank body uses simplified collision, not the visible mesh

### Power-Ups

- power-ups are collected when `COL_tank` overlaps the power-up collider
- power-up implementation is postponed until tank control is validated

## Controls

### Movement

- `ZQSD`: chassis movement
- `Shift`: boost while held

If battery is `0%`:

- tank movement is disabled
- turret aiming remains available
- firing remains available

If overcharge is `0%`:

- boost input has no effect

### Aiming

- mouse horizontal movement rotates the turret on yaw only
- mouse vertical movement rotates the cannon on pitch only
- turret roll and pitch are locked
- cannon yaw and roll are locked

### Weapons

- `1`: shell weapon
- `2`: machine gun weapon
- left mouse button held:
  - shells fire automatically when chambered and cooldown allows
  - bullets fire continuously while held

### Zoom

- right mouse button held
- zoom reduces camera FOV by `50%`
- while boost is active, camera FOV increases by `10%` to reinforce speed sensation

## Weapon Rules

### Shells

- finite reserve
- starting ammo: `14`
- one shell available in chamber at start
- chamber reload time: `4` seconds
- shell pickups refill ammo reserve
- ballistic projectile
- high damage
- lower velocity

### Bullets

- unlimited ammo in v0
- fire rate: `4` shots per second
- ballistic projectile
- lower damage
- higher velocity

## Turret and Cannon Constraints

### Turret

- yaw only
- free `360` degree rotation
- initial rotation speed: `30 deg/s`

### Cannon

- pitch only
- total pitch travel: `90` degrees
- exact min/max values are defined in `config/TankController.json`

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

- movement values
- turn rates
- pitch limits
- FOV values
- battery and overcharge values
- weapon values
- power-up multipliers

The game code should avoid hardcoding gameplay numbers except for temporary debug defaults.

## Recommended Initial Module Layout

When implementation starts, keep the project modular.

- `src/app/`
- `src/core/`
- `src/game/`
- `src/ui/`
- `src/assets/`
- `src/config/`

Suggested responsibilities:

- `app`: bootstrap, state transitions, lifecycle
- `core`: engine setup, scene, physics, update loop
- `game`: tank, weapons, pickups, level loading
- `ui`: menus and HUD
- `assets`: asset discovery and node lookup helpers
- `config`: JSON loading and runtime validation

## Vertical Slice Scope

The first playable slice should include:

- `MainMenu`
- `Controls`
- `LevelSelect`
- one playable level loaded from `terrain.glb`
- tank spawned from `SPAWN_tank`
- movement, boost, turret, cannon, zoom
- shell weapon
- bullet weapon
- battery and overcharge logic

The following can be delayed:

- enemy AI
- damageable enemies
- collectible pickups
- HUD polish
- sound design
- advanced VFX
- save system

## Main Risks

- physics instability due to small or inconsistent asset scales
- unexpected local axes on imported bones and empties
- mismatch between visible meshes and physical proxies
- ballistic tuning feeling weak at prototype stage
- camera feel if `CAM_tank` orientation is not clean in the asset

## Development Rule

Do not expand scope before the tank feels good to drive, aim, and fire in the first level.
