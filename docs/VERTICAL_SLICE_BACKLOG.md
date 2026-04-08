# Vertical Slice Backlog

## Objective

Reach a first playable build where the player can navigate menus, load a level, control the tank, aim, shoot both weapons, and validate the core feel.

## Phase 1 - Bootstrap

- initialize the project with Babylon.js and Havok
- create the main application bootstrap
- load one scene and start the main loop
- add state management for `MainMenu`, `Controls`, `LevelSelect`, and `Gameplay`

## Phase 2 - Asset Loading

- load `assets/terrain.glb`
- load `assets/tank.glb`
- resolve required nodes by exact name
- hide all `COL_*` nodes
- resolve `SPAWN_tank` and spawn the tank there
- verify `MUZZLE_tank`, `CAM_tank`, and `COL_tank`

## Phase 3 - Menu Flow

- build `MainMenu`
- build `Controls`
- build `LevelSelect`
- implement back navigation
- connect one level entry to gameplay startup

## Phase 4 - Tank Locomotion

- implement `ZQSD` input
- implement chassis movement
- implement chassis rotation
- block movement when battery reaches `0`
- implement battery drain only while moving

## Phase 5 - Aim and Camera

- rotate turret from mouse X input
- pitch cannon from mouse Y input
- clamp cannon pitch to config values
- attach gameplay camera to `CAM_tank`
- implement zoom hold on right mouse button
- apply FOV boost effect while boosting

## Phase 6 - Boost and Resources

- implement overcharge system
- enable boost while `Shift` is held
- stop boost when overcharge is empty
- apply overcharge drain during boost

## Phase 7 - Weapons

- implement weapon selection with `1` and `2`
- implement shell weapon with chamber logic
- implement shell reserve and reload timing
- implement bullet weapon with continuous fire while held
- make both projectile types ballistic

## Phase 8 - Physics

- configure static physics for `SM_*`
- configure dynamic physics for `DM_*`
- configure collision from `COL_*`
- configure tank collider from `COL_tank`
- verify projectile interaction with world objects

## Phase 9 - Debug and Feel

- display temporary debug info for:
  - battery
  - overcharge
  - current weapon
  - shell ammo
  - reload/chamber state
- tune values from `TankController.json`
- validate spawn orientation, aim feel, and camera comfort

## Deferred After Vertical Slice

- battery pickups
- overcharge pickups
- shell crate pickups
- weapon upgrade pickups
- enemies
- health and damage feedback
- HUD polish
- audio
- VFX polish

## Acceptance Checklist

The vertical slice is successful when:

- menu navigation works from launch
- one level loads from `LevelSelect`
- tank spawns at `SPAWN_tank`
- tank moves and rotates correctly
- turret and cannon respond correctly to the mouse
- zoom hold works
- boost works and changes FOV
- shell firing respects ammo and chamber timing
- bullet firing works while left click is held
- `SM_*`, `DM_*`, and `COL_*` behave correctly
- tuning can be changed through `config/TankController.json`
