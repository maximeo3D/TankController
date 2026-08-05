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
- Fighter jet: `SUS_F`, `SUS_RL`, `SUS_RR` (tricycle landing gear).
- The probe set is declared per vehicle via `rig.suspensionProbeNames`. Any count is accepted
  as long as **every** declared name resolves.  
  Code also accepts Blender-style duplicates such as `SUS_FL.001` (prefix match).

### Legacy / Optional

- `GROUND_FL`, `GROUND_FR`, `GROUND_RL`, `GROUND_RR`: optional four-corner grounding helpers. Used as a fallback when the declared `SUS_*` list is only partially resolved and fewer than four probes are found. Also used to derive `baseClearance` when all four are present.

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
- `wheel_*`: bone origins at the **axle / hub** (not at tire contact). Code applies:
  - **roll** on `rig.wheelSpinAxis` at a rate of `groundSpeed / rig.wheelRadius`
  - **steer** on front wheels (`rig.frontWheelBones`) on `rig.wheelSteerAxis` up to `rig.wheelSteerMaxDeg`
  - **vertical travel** when `rig.wheelTravelEnabled: true` — bone offset by matching probe compression so tires stay on ground while body moves
- `SUS_*`: empties at **tire contact** height (bottom of wheel). Downward ray origins for suspension and ground-contact detection. Must align horizontally with their wheel but sit lower on Y (hub-to-contact distance ≈ `rig.wheelRadius`, ~9 cm on current asset).
- Missiles are **gravity-immune** and fire as salvos (magazine of 4); see `docs/TECHNICAL_SPEC.md` → **Missiles**.
- No track system — omit `tracks` from armored car JSON.
- `ammo_shell` power-up disabled in armored car config (vehicle uses missiles, not shells).

### Wheel / suspension authoring checklist (armored car)

| Check | Expected |
|-------|----------|
| `SUS_FL` … `SUS_RR` at tire contact | Y at ground patch, not at hub |
| `wheel_*` bones at hub | ~`wheelRadius` above matching `SUS_*` |
| `COL_armoredcar` bottom clearance | Must exceed static spring sag + margin (see TECHNICAL_SPEC tuning rule) |
| Front wheels in `frontWheelBones` | Match `wheel_FL`, `wheel_FR` |
| `wheelTravelSign` | If tires sink when body compresses, flip to `-1` |

Enable `debug.showSuspensionSpheres: true` in config to visualize probe positions at runtime.

## Fighter Jet Contract

`assets/jet.glb`, driven by `config/vehicles/fighterJet.json`. Reuses the generic vehicle
pipeline for loading, collider, camera, muzzles and projectile templates. The flight model,
missile lock-on, landing-gear logic and visible wing stores are new code.

### Orientation and scale (measured on `tank.glb` / `armoredcar.glb`)

In Blender: **nose along +Y, up +Z, starboard +X**. Model origin on the ground plane,
laterally centred, longitudinally near the centre of gravity (wing root).

Exported GLB sizes for reference — width × height × length in metres:

| Asset | Size |
|-------|------|
| `tank` | 0.90 × 0.69 × 2.07 |
| `armoredcar` | 0.46 × 0.51 × 1.00 |
| `AMMO_missile` (armored car) | 0.043 × 0.043 × 0.234 |

Author the jet in the same range (roughly 1.1–1.4 m long, 1.0–1.2 m wingspan) so it reads
as part of the same toy-scale fleet.

### Bone axis rule

Exported bones keep Blender's convention: **local Y is the head→tail direction**. With zero
bone roll:

| Bone points towards | local X | local Y | local Z |
|---------------------|---------|---------|---------|
| +Z (up) | +X starboard | +Z up | −Y aft |
| +Y (nose) | +X starboard | +Y nose | +Z up |

Authoring consequence: give every animated bone a head→tail direction **along its hinge
axis**. The rotation axis is then always the bone's local Y, and bone roll becomes
irrelevant. A bone's shape does not have to follow the geometry it drives — only its head
position (the pivot) and its direction (the axis) matter.

Verify after export with `node tools/inspectVehicleGlb.mjs assets/jet.glb`.

### Required nodes

| Role | Node / bone | Config key |
|------|-------------|------------|
| Armature | `jet_armature` | — |
| Airframe bone | `main > fuselage` | — |
| Collider mesh | `COL_jet` | `rig.nodes.colliderMesh` |
| Orbit pivot | `CAM_pivot` | `rig.nodes.cameraPivot` |
| Gameplay camera | `CAM_jet` | `rig.nodes.cameraStart` |
| Gun muzzle | `MUZZLE_mg_jet` | `rig.nodes.muzzleGun` |
| Missile hardpoints | `MUZZLE_missile_jet_L`, `MUZZLE_missile_jet_R` | `rig.nodes.muzzleMissile` + hardpoint list |
| Missile template (visual) | `AMMO_missile_jet` | `rig.nodes.ammoMissileMesh` |
| Missile template (collider) | `COL_missile_jet` | `rig.nodes.ammoMissileColliderMesh` |
| Tracer template | `AMMO_balle` | hardcoded |
| Enemy aim target | `TARGET_player_jet` | `rig.nodes.playerTarget` |
| Ground probes | `SUS_F`, `SUS_RL`, `SUS_RR` | `rig.suspensionProbeNames` |
| Damage smoke | `jet_damage_smoke_1..4` | `rig.nodes.damageSmoke` |

Terrain must also gain a `SPAWN_jet` empty for the mission that includes the jet.

### Bone hierarchy

```
jet_armature
├── main                            root bone, at the model origin
│   └── fuselage                    airframe; parent of every moving part
│       ├── aileron_L, aileron_R    roll
│       ├── elevator_L, elevator_R  pitch
│       ├── rudder                  yaw
│       ├── flap_L, flap_R          optional, deployed with the gear
│       ├── airbrake                optional
│       ├── gear_F, gear_L, gear_R  retractable struts, no separate doors
│       └── wheel_F, wheel_L, wheel_R   optional, children of their strut
└── jet                             single skinned mesh
```

### Reserved bone names — must not be used

`caisse`, `tourelle`, `canon`, `track_L` and `track_R` are resolved by **hardcoded** lookups
in `TankGameplayController` and are driven by hull tilt, turret yaw, cannon pitch and track
droop code that does not apply to an aircraft. Using them would make the airframe fight the
flight model. Hence `fuselage` for the airframe bone.

For the same reason `rig.pitchBone` stays unset in the jet config: the muzzle empties must
**not** be reparented to a pitch bone, they stay under the vehicle visual root and follow the
airframe. This logs one harmless warning at load.

### Control surfaces

Intended mapping, which fixes what each surface bone must drive:

| Input | Axis | Surfaces |
|-------|------|----------|
| Mouse horizontal | roll (bank) | `aileron_L` / `aileron_R` |
| Mouse vertical | pitch, inverted (mouse up = nose down) | `elevator_L` / `elevator_R` |
| `Q` / `D` | yaw | `rudder` |
| `Z` / `S` | throttle up / down | — |

- Rest pose = neutral surface. Deflection is applied on top of the rest rotation.
- Bone head exactly on the hinge line, head→tail along it. For a swept wing the hinge is not
  parallel to `X`; follow the actual hinge, not the axis.
- `aileron_L` and `aileron_R` point outboard in opposite directions, so the same signed angle
  deflects them oppositely — which is what an aileron pair does.

### Landing gear

- Bone head exactly at the retraction hinge, head→tail along the hinge axis (lateral for a
  nose gear that swings fore/aft, longitudinal for main gear folding inboard).
- **Rest pose = gear fully extended.** The retracted angle is a config value per strut, so
  any geometry works; model the wells to match the intended retracted pose.
- No separate door bones: the struts and their fairings are one moving part.
- Optional `wheel_*` children spin on their own local Y during rollout.

### Ground probes

Tricycle gear, so **three** probes: `SUS_F` on the centreline at the nose wheel, `SUS_RL` and
`SUS_RR` at the main wheels. Place them at **tire contact height with the gear extended**, as
on the armored car (probe at the contact patch, not at the hub).

`createTankSuspensionInfo` previously required at least four resolved probes before honouring
`rig.suspensionProbeNames`, and fell back to the legacy `GROUND_*` corners otherwise. It now
accepts a fully resolved declared list of any size, so a three-point stance works; the
four-probe rule only remains as a safety net for a *partially* resolved list. Roll stability
comes from the two main-gear probes, which is how a real tricycle gear behaves.

### Hardpoints and visible stores

- `AMMO_missile_jet` is modelled once, nose along **+Y**, origin at its geometric centre.
  `COL_missile_jet` is a low-poly convex version with the same origin and orientation.
- `MUZZLE_missile_jet_L` / `_R` are empties with **zero rotation**, placed where each missile
  centre should sit under the wing (`L` at −X, `R` at +X). Each serves both as the launch
  transform and as the anchor for the visible missile: the engine clones `AMMO_missile_jet`
  under each hardpoint with an identity local transform and hides the clone once that missile
  is fired.
- Muzzle forward is the empty's local −Z in glTF, i.e. **+Y in Blender**, so an unrotated
  empty fires straight ahead.

### Optional nodes

- `FX_shockwave`: 2 m sphere used as the impact shockwave template (searched case-insensitively
  in the vehicle container). Present in `tank.glb`, absent from `armoredcar.glb` — copy it over
  if the jet should show shockwaves.
- `jet_damage_smoke_1..4`: slot 1 triggers at ≤ 75 % health, slots 2 and 3 at ≤ 50 %, slot 4 at
  ≤ 25 %. Engine nozzle and wing roots are the natural spots.
- No `CAM_jet_zoom` is needed; the zoom camera is created in code.
- No `TEX_tracks` and no `tracks` block in the config.
- No `wheelBones` in the config: the car wheel spin/steer/travel path does not apply.

### Validation checklist

- `node tools/inspectVehicleGlb.mjs assets/jet.glb` lists every node in the table above
- no bone named `caisse`, `tourelle`, `canon`, `track_L`, `track_R`
- every animated bone reports `local Y -> …` along its intended hinge axis
- `COL_jet` bottom sits at the tire contact plane, gear extended
- `SUS_F`, `SUS_RL`, `SUS_RR` at tire contact height, `SUS_F` on the centreline
- muzzle and hardpoint empties have zero rotation
- `AMMO_missile_jet`, `COL_missile_jet` and `AMMO_balle` present at the scene root
- overall length in the 1.1–1.4 m range

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

### Armored car validation (additional)

- four `SUS_*` empties at tire contact height (not hub height)
- four `wheel_*` bones at hub, ~`wheelRadius` above matching `SUS_*`
- `COL_armoredcar` covers hull without extending far below tire contact
- `armoredcar_damage_smoke_1..4` present if damage VFX desired (optional; warnings if missing)
- no `track_L` / `track_R` required (track system disabled)

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
