# Asset Contract

## Purpose

This document defines the naming and structural rules for Blender and `GLB` assets used by the game.

The goal is to make asset integration deterministic in code.

## Global Rules

- Units should remain consistent across all exports
- Transforms should be applied before export whenever possible
- Visible meshes and collision helpers should be clearly separated
- Naming must stay stable once code depends on it
- Only `COL_*` helpers should be invisible at runtime

## Naming Conventions

### Visible Meshes

- `SM_*`: static visible meshes
- `DM_*`: dynamic visible meshes

### Collision Meshes

- `COL_*`: collision-only meshes, hidden in gameplay

### Spawn and Special Points

- `SPAWN_*`: spawn points
- `MUZZLE_*`: projectile spawn points
- `CAM_*`: gameplay camera nodes

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
- collider mesh: `COL_tank`

### Functional Meaning

- `main`: top-level rig root
- `caisse`: chassis reference for movement and hull orientation
- `tourelle`: yaw pivot
- `canon`: pitch pivot
- `MUZZLE_tank`: origin and forward reference for projectile spawning
- `CAM_tank`: gameplay camera anchor
- `COL_tank`: simplified collision mesh for the tank

### Transform Expectations

- `tourelle` must rotate only on yaw
- `canon` must rotate only on pitch
- `MUZZLE_tank` should face forward in the intended firing direction
- `CAM_tank` should be authored with a gameplay-friendly orientation
- `COL_tank` should roughly cover the playable tank volume without tiny protrusions

### Runtime Rules

- `COL_tank` is hidden at runtime
- visible tank meshes are rendered normally
- code should bind aiming logic to the named bones and sockets, not to arbitrary child order

## Cannon and Turret Constraints

### Turret

- rotation axis: yaw only
- range: free `360` degrees
- pitch locked
- roll locked

### Cannon

- rotation axis: pitch only
- yaw locked
- roll locked
- total pitch range: `90` degrees

## Export Expectations

- current production export is scaled `x10` from Blender
- keep this choice consistent across later exports
- if an asset export changes a node name or hierarchy, the contract must be updated before integration

## Validation Checklist

Before an asset is considered valid:

- tank and terrain export successfully as `GLB`
- all required nodes are present with exact names
- `COL_*` helpers exist where needed
- `SPAWN_tank` is correctly placed
- `MUZZLE_tank` is positioned at the cannon muzzle
- `CAM_tank` is parented to `caisse`
- `tourelle` rotates correctly without unintended pitch or roll
- `canon` rotates correctly without unintended yaw or roll

## Non-Goals For v0

- destructible asset pipelines
- animation retargeting
- multiple camera rigs
- editable controls authored in assets
