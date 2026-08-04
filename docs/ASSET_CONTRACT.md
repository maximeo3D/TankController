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

- `SPAWN_*`: spawn points — one per playable vehicle (`SPAWN_tank`, `SPAWN_armoredcar`, …)
- `MUZZLE_*`: projectile spawn points (per vehicle + weapon, e.g. `MUZZLE_canon_tank`, `MUZZLE_rocket_armoredcar`, `MUZZLE_mg_armoredcar`)
- `CAM_*`: gameplay camera and camera-related helpers (per vehicle, e.g. `CAM_tank`, `CAM_armoredcar`, plus `CAM_pivot`)
- `TARGET_player_*`: node tracked by enemy turrets for that vehicle (e.g. `TARGET_player_armoredcar`)
- `PU_<typeId>`: power-up spawn points on terrain (e.g. `PU_fuel`, `PU_shield`; Blender duplicates `PU_fuel.001` are accepted)

> **Per-vehicle naming:** node names are not hardcoded. Each vehicle config declares its own node/bone names under `rig.nodes` and `rig.*Bone` (`config/vehicles/<type>.json`), with the tank names as defaults. Keep the in-asset names in sync with the config.

### Suspension

- Tank: `SUS_FL`, `SUS_FR`, `SUS_ML`, `SUS_MR`, `SUS_RL`, `SUS_RR` (six wheels / contact points).
- Armored car: `SUS_FL`, `SUS_FR`, `SUS_RL`, `SUS_RR` (four wheels).
- The probe set is declared per vehicle via `rig.suspensionProbeNames`.  
  Code also accepts Blender-style duplicates such as `SUS_FL.001` (prefix match).

### Legacy / Optional

- `GROUND_FL`, `GROUND_FR`, `GROUND_RL`, `GROUND_RR`: optional four-corner grounding helpers; if present and `SUS_*` are incomplete, code may derive six suspension samples from corners + midpoints.

### UI / Weapons

- `UI_reticle_camera`: camera reticle mesh (billboard; constant screen size in code)
- `UI_reticle_barrel`: barrel reticle mesh (billboard; constant screen size in code)
- `AMMO_obus`, `AMMO_balle`: tank projectile templates (hidden; cloned when firing)
- `AMMO_missile` + `COL_missile`: armored-car missile templates (visual + physics collider; hidden, cloned when firing)
- `TEX_tracks`: hidden mesh used to supply the material for track marks (tank)

Projectile template names are resolved per vehicle via `rig.nodes.ammoShellMesh` / `ammoShellColliderMesh` (tank) and `ammoMissileMesh` / `ammoMissileColliderMesh` (armored car).

## Terrain Contract

### Required Nodes

- one `SPAWN_*` per vehicle declared in the mission (e.g. `SPAWN_tank`, `SPAWN_armoredcar`)

### Supported Mesh Types

- `SM_*` for decor and static world pieces
- `DM_*` for physically simulated world objects
- `COL_*` for blocking shapes such as walls, obstacles, and simplified collision volumes

### Terrain Integration Rules

- `SPAWN_tank` defines the player spawn transform
- `SM_*` are loaded as visible static environment meshes
- `DM_*` are loaded as visible dynamic environment meshes
- `COL_*` are hidden and used as collision sources only
- `PU_*` empties define where the game spawns pickup visuals (see **Power-ups GLB** below)

### Power-ups GLB (`assets/power-ups.glb`)

Templates are **not** placed in the terrain file. Terrain only holds `PU_*` transforms.

| Terrain node | GLB mesh template | Config type id |
|--------------|-------------------|----------------|
| `PU_ammo_shell` | `mesh_ammo_shell` | `ammo_shell` |
| `PU_fuel` | `mesh_fuel` | `fuel` |
| `PU_repair` | `mesh_repair` | `repair` |
| `PU_shield` | `mesh_shield` | `shield` |
| `PU_boost` | `mesh_boost` | `boost` (optional, disabled in config today) |
| `PU_weapon_boost` | `mesh_weapon_boost` | `weapon_boost` (optional) |

**Authoring notes (current art direction):**

- `repair` — flat tool key (gear + screwdriver)
- `ammo_shell` — crate with shells
- `fuel` — jerrican
- `shield` — geodesic energy dome

Meshes in `power-ups.glb` are disabled at load; clones appear only at `PU_*` positions.

### Recommended Terrain Authoring

- Keep collision shapes simpler than render meshes
- Use `COL_*` around walls and blockers rather than relying on visual mesh topology
- Avoid unnecessary small collision details

## Tank Contract

### Required Nodes

- armature: `tank_armature`
- bone chain: `main > caisse > tourelle > canon`
- **track bones (recommended):** `track_L`, `track_R` — children of `main`, placed at mid-track (`SUS_ML` / `SUS_MR`); chenille meshes weighted/parented to these bones
- muzzle socket: `MUZZLE_tank`
- gameplay camera: `CAM_tank`
- **orbit pivot (recommended):** `CAM_pivot` — empty placed above the turret (or at the intended orbit center); moves with the hull / rig
- collider mesh: `COL_tank`
- **suspension empties:** `SUS_FL`, `SUS_FR`, `SUS_ML`, `SUS_MR`, `SUS_RL`, `SUS_RR`
- (optional) `TEX_tracks` mesh for track material

### Functional Meaning

- `main`: top-level rig root
- `caisse`: chassis reference for movement and hull orientation (visual pitch/roll suspension + recoil au tir)
- `track_L` / `track_R`: left/right track banks — driven in code from `SUS_*` compression (`tracks.suspensionVisual` in JSON)
- `tourelle`: yaw pivot
- `canon`: pitch pivot
- `MUZZLE_tank`: origin and forward reference for projectile spawning
- `CAM_tank`: gameplay orbit camera (must be a **TargetCamera** family type in Babylon, e.g. Universal / Free, for `setTarget` + orbit)
- `CAM_pivot`: world anchor the camera **orbits** around (code updates camera position each frame)
- `SUS_*`: downward ray origins for suspension (converted to anchor-local offsets after load)
- `COL_tank`: simplified collision mesh for the tank (convex hull in physics)
- `TEX_tracks`: source mesh used to provide the track material (mesh hidden at runtime)

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
- Zoom view is an **alternative render camera** created/managed in code; it does not require an authored `CAM_tank_zoom` node in the GLB

## Armored Car Contract

`assets/armoredcar.glb`, driven by `config/vehicles/armoredCar.json`. It reuses the generic vehicle pipeline; only names/axes differ from the tank.

### Required Nodes (as declared in config)

| Role | Node / bone | Config key |
|------|-------------|------------|
| Collider mesh | `COL_armoredcar` | `rig.nodes.colliderMesh` |
| Orbit pivot | `CAM_pivot` | `rig.nodes.cameraPivot` |
| Gameplay camera | `CAM_armoredcar` | `rig.nodes.cameraStart` |
| Pitch bone (weapons) | `armes` | `rig.pitchBone` |
| Minigun bone | `minigun` (child of `armes`) | `rig.minigunBone` |
| Wheel bones | `wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR` | `rig.wheelBones` |
| Suspension probes | `SUS_FL`, `SUS_FR`, `SUS_RL`, `SUS_RR` | `rig.suspensionProbeNames` |
| Missile muzzle | `MUZZLE_rocket_armoredcar` | `rig.nodes.muzzleMissile` |
| Minigun muzzle | `MUZZLE_mg_armoredcar` | `rig.nodes.muzzleGun` |
| Missile template (visual) | `AMMO_missile` | `rig.nodes.ammoMissileMesh` |
| Missile template (collider) | `COL_missile` | `rig.nodes.ammoMissileColliderMesh` |
| Enemy aim target | `TARGET_player_armoredcar` | `rig.nodes.playerTarget` |
| Damage smoke emitters | `armoredcar_damage_smoke_1..4` | `rig.nodes.damageSmoke` |

### Functional Meaning / Authoring

- `armes`: pitch pivot for the weapon mount (equivalent of the tank's `canon`).
- `minigun`: child of `armes`, rotated on its **Y** axis in code while the machine-gun weapon fires (`rig.minigunSpinDegPerSec`). Author the geometry so a Y spin looks like rotating barrels.
- `wheel_*`: spun visually while rolling (`rig.wheelSpinAxis` / `rig.wheelSpinSign`). **In rest pose, each wheel bone origin should sit at the same height as its matching `SUS_*` empty** (tire contact). The physics raycasts use `SUS_*`; if wheel bones are offset, the mesh will appear to sink or float while suspension is correct.
- Missiles are **gravity-immune** and fire as salvos (magazine of 4); see `docs/TECHNICAL_SPEC.md` → **Missiles**.
- Suspension uses four probes instead of the tank's six.

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

## 2D UI assets (`assets/ui/`)

Raster and font files used by menus and gameplay HUD (URLs centralized in `src/assets/assetUrls.ts` where applicable).

| Asset | Role |
|-------|------|
| `UI_hud.json` | Gameplay HUD layout (see below) |
| `UI_mainmenu.json`, `UI_levels.json` | Menu ADTs (see `docs/GUI_MENU_SYSTEM.md`) |
| `Square.ttf` | Default GUI font (`UI_FONT_FAMILY`) |
| `digital.ttf` | Session timer font (`TIMER_FONT_FAMILY`); prefer tabular/monospace digits |
| `shell.png`, `missile.png`, `machinegun.png` | Weapon HUD icons (primary projectile icon picked from the vehicle's weapon kind) |
| `health.png`, `fuel.png`, `boost.png` | Vehicle status row icons |
| `reticle_camera.png`, `reticle_barrel.png`, `reticle_gun.png` | 2D aim reticles (also spawned in code) |

## Gameplay HUD JSON (`assets/ui/UI_hud.json`)

Separate from menu JSON files. Parsed on the **gameplay** scene HUD texture (`TankGameplayController.initHud()`). Reload the game after JSON edits.

### Stable control names

Code binds via `getControlByName` in `bindHudLayoutFromJson()`. Renaming without updating `TankGameplayController.ts` breaks the HUD.

**Root**

- `hud_root` — fullscreen container; code forces center alignment for bottom status panel

**Status panel (bottom center)**

- `hud_panel_status`, `hud_status_stack`
- `hud_health_row`, `hud_health_icon`, `hud_health_bar_bg`
- `hud_fuel_row`, `hud_fuel_icon`, `hud_fuel_bar_bg`
- `hud_boost_row`, `hud_boost_icon`, `hud_boost_bar_fill`

Segment fills for health/fuel are **spawned in code** (`hud_health_seg_*`, `hud_fuel_seg_*`). Legacy children `hud_health_bar_fill` / `hud_fuel_bar_fill` are stripped if present.

**Weapons (bottom right)**

- `hud_panel_bottom`
- `hud_weapon_primary`, `hud_weapon_primary_icon`, `hud_weapon_primary_ammo`
- `hud_weapon_secondary`, `hud_weapon_secondary_icon`, `hud_weapon_secondary_ammo`

Reload gauge rectangles are added in code on the primary slot (shell chamber reload or missile-salvo reload). The HUD is created **once per scene** and shared between vehicles (`src/game/sceneGameplayUi.ts`); only the active vehicle's HUD is shown.

**Session timer (top right)**

- `hud_panel_timer`, `hud_timer_label`

**Indicators (top center)**

- `hud_indicators_container`, `hud_boost_indicator`, `hud_zoom_indicator`

### Authoring notes

- Panel chrome (corner brackets, segment bars, weapon grids, reload gauges) is completed in code after parse.
- Timer `fontSize` / panel dimensions are safe to tune in JSON; font family for the timer is forced to `Digital` in code.
- Most other text blocks receive `Square` via `applyUiFontToTexture()` except `hud_timer_label`.

## Non-Goals For v0

- destructible asset pipelines
- animation retargeting
- multiple unrelated camera rigs per tank (single `CAM_tank` + `CAM_pivot` is the standard)
- editable controls authored in assets
- per-power-up collider meshes (pickup uses distance to `COL_tank` + configured radius)
