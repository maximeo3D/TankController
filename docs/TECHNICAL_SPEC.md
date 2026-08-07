# TankController - Technical Specification

## Goal

Create a small-scale tank game using `Babylon.js 9.1.0` with `Havok Physics`.

The player controls one or more vehicles on a terrain loaded from `GLB` assets. The first milestone is a clean vertical slice with:

- front-end menu flow
- vehicle movement and aiming
- ballistic / guided weapons
- camera orbit and zoom
- fuel (battery) and boost (overcharge) resources
- vehicle health, power-ups, and HUD feedback
- **multiple playable vehicles** (tank, armored car, fighter jet) switchable in-mission
- asset loading conventions stable enough to support later content

## Engine and Runtime

- Rendering: `Babylon.js 9.1.0`
- Physics: `Havok Physics` plugin for Babylon.js
- Assets: `GLB`
- Parameters: external JSON config files, one per vehicle type:
  - `config/TankController.json` (tank — also the default/base schema)
  - `config/vehicles/armoredCar.json` (armored car)
  - `config/vehicles/fighterJet.json` (fighter jet)
  - resolved at runtime via `src/config/vehicleRegistry.ts` (`getVehicleConfig(type)`)

## Scale

The project uses an intentionally enlarged scale compared to the original toy concept.

- Assets are exported from Blender with **`×10` scale** (or equivalent); gameplay and physics are tuned in that space.
- Reticle screen size is compensated in code so HUD stays readable at large world units.
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
- `assets/armoredcar.glb`
- `assets/jet.glb`
- `assets/terrain.glb`
- `assets/livingroom.glb`
- `assets/power-ups.glb`
- `assets/effects/post_combustion.json` (jet afterburner particles; see **Post-combustion VFX**)
- `assets/textures/skybox.env` (global IBL / skybox for gameplay scenes)

### Terrain

The terrain file contains:

- visible static meshes prefixed `SM_`
- visible dynamic meshes prefixed `DM_`
- invisible collider meshes prefixed `COL_`
- one spawn empty per playable vehicle, e.g. `SPAWN_tank`, `SPAWN_armoredcar` (referenced by `MissionVehicleSpawn.spawnNode`)
- empties `PU_<typeId>` (and Blender duplicates such as `PU_ammo_shell.001`) defining power-up spawn locations

### Tank

The tank file contains:

- armature `tank_armature`
- bone hierarchy `main > caisse > tourelle > canon`
- empty `MUZZLE_tank` parented to `canon`
- camera `CAM_tank` (gameplay view; see **Camera** below)
- empty **`CAM_pivot`**: orbit center above the turret (used at runtime)
- six empties **`SUS_FL`**, **`SUS_FR`**, **`SUS_ML`**, **`SUS_MR`**, **`SUS_RL`**, **`SUS_RR`**: suspension raycast origins (wheel / contact probes)
- optional legacy **`GROUND_*`** four-corner names (fallback only if `SUS_*` are incomplete)
- meshes **`UI_reticle_camera`** and **`UI_reticle_barrel`**: world-space reticles (billboarded in code)
- mesh **`TEX_tracks`**: hidden source mesh used to provide the track material
- meshes **`AMMO_obus`** / **`AMMO_balle`**: projectile templates (hidden, cloned on fire)
- invisible mesh **`COL_tank`**: convex hull physics collider for the tank

### Armored car

`assets/armoredcar.glb` follows the same generic vehicle contract, with armored-car node names declared in `config/vehicles/armoredCar.json` (`rig.nodes` / `rig.*Bone`). See `docs/ASSET_CONTRACT.md` → **Armored Car Contract** for the full list. Highlights:

- pitch bone `armes` (instead of the tank's `canon`)
- **minigun** bone `minigun` (child of `armes`) spun on its Y axis while firing
- four wheel bones `wheel_FL/FR/RL/RR` with visual spin + front-wheel steering + vertical travel
- four suspension probes `SUS_FL/FR/RL/RR` at tire contact height
- muzzles `MUZZLE_rocket_armoredcar` (missiles) + `MUZZLE_mg_armoredcar` (minigun)
- projectile templates `AMMO_missile` / `COL_missile`
- no track system (`tracks` section absent from config)

Driving behavior diverges from the tank via JSON (`movement.steeringMode: "car"`, spring suspension, ground-contact gating). See **Armored car — driving and suspension** below.

### Fighter jet

`assets/jet.glb`, driven by `config/vehicles/fighterJet.json`. See `docs/ASSET_CONTRACT.md` → **Fighter Jet Contract** for the full GLB checklist. Highlights:

- `movement.steeringMode: "plane"` — arcade flight via `FlightModel` (`src/game/vehicle/FlightModel.ts`), not tank/car traction
- **Throttle:** `Z` / `S` raise / lower throttle (not instant forward/backward like ground vehicles)
- **Attitude:** mouse = pitch/roll stick; `Q` / `D` = yaw; `Shift` = afterburner when throttle > 60 % and boost gauge > 0
- **Landing gear:** bones `gear_F`, `gear_L`, `gear_R` retract above `flight.gear.retractSpeed` / altitude; extend when slow and low
- **Control surfaces:** ailerons, elevators, rudder driven from flight stick state (`rig.flight.*` bones)
- **Engine nozzle:** bone `engine` scales on X/Z (not `engineNozzleAxis`, default `y`) with throttle; emissive on material `engine`
- **Post-combustion:** particle system on empty `jet_post_combustion`, JSON `assets/effects/post_combustion.json`
- **Missiles:** lock-on + autoguidance (`JetMissileLockController`); visible stores on wing hardpoints; reticle icons `reticle_missile_jet*.png`
- **Camera:** chase-style orbit when `CAM_pivot` is present; optional authored zoom empty `CAM_jet_zoom`
- **Audio:** continuous `jet_move` (no idle loop); `jet_turbo` on afterburner
- Tricycle suspension probes `SUS_F`, `SUS_RL`, `SUS_RR`; no tracks, no wheel-travel car logic

## Per-map environment (fog, sky, light)

Each map can declare an optional `environment` block on its `LevelDefinition` (`src/app/levels.ts`), populated in `src/ui/menuData.ts` → `MENU_MAPS[].level.environment`.

Applied at gameplay scene creation by `applyLevelEnvironment()` (`src/game/applyLevelEnvironment.ts`) before terrain load. Based on Babylon [Environment / Fog](https://doc.babylonjs.com/features/featuresDeepDive/environment/environment_introduction).

| Field | Role |
|-------|------|
| `clearColor` | `[r,g,b,a]` background if skybox does not fill the view |
| `environmentIntensity` | IBL strength (`scene.environmentIntensity`) |
| `sunIntensity` | `HemisphericLight` intensity |
| `fog.mode` | `"exp"`, `"exp2"`, or `"linear"` |
| `fog.color` | RGB fog tint `[0–1]` |
| `fog.density` | Used by `exp` / `exp2` |
| `fog.start` / `fog.end` | Used by `linear` mode |
| `fog.enabled: false` | Explicitly disables fog on a map |

**Examples (current `menuData.ts`):**

- **Training** — outdoor `exp2` fog, bluish tint
- **Living room** — warmer fog, lower sun / IBL for indoor feel

Maps without `environment` keep the default clear color and no fog.

## Multi-Vehicle Architecture

A mission can declare several playable vehicles; the player cycles the active one in-game.

### Configuration

- `MenuMission.vehicles: MissionVehicleSpawn[]` (`src/ui/menuData.ts`) lists `{ id, type, spawnNode }` entries; `startVehicleId` selects the one active at load.
- `VehicleTypeId = "tank" | "armoredCar" | "fighterJet"` maps to a config via `vehicleRegistry.ts`.
- Each vehicle type owns its JSON config; shared schema is `TankControllerConfig` (`src/config/tankController.ts`).

### Runtime

- **`VehicleController`** (`src/game/vehicle/VehicleController.ts`) is the common contract: `activate`, `deactivate`, `setPaused`, `getDebugState`, `focusCamera`, `getEnemyPlayerTarget`, `getAimTargetNode`, `dispose`.
- **`TankVehicleController`** adapts `TankGameplayController` to that interface; the same gameplay controller drives both tank and armored car (behavior diverges only through config).
- **`LevelManager`** (`src/game/level/LevelManager.ts`) holds the vehicle roster and the active vehicle. Switching is done via `cycleActiveVehicle()` / `setActiveVehicle(id)`; `setOnActiveVehicleChanged()` lets the scene re-focus the camera, rebind enemy targeting, and rebind power-up handlers to the newly active vehicle.
- **Input:** the **`V`** key cycles the active vehicle (wired in `GameApp`, ignored while paused / loading / dead).

### Shared scene resources

Because multiple vehicles coexist in one scene, the following are created **once** and shared (not duplicated per vehicle):

- **HUD:** a single `AdvancedDynamicTexture` + radar, tracked in `scene.metadata` via `src/game/sceneGameplayUi.ts` (`getSceneGameplayUi` / `setSceneGameplayUi`). Only the active vehicle's HUD is shown.
- **Power-ups:** a single `PowerUpSystem`; `bindActivePlayer()` re-points its collider + pickup handlers to the active vehicle on switch.
- **Enemy turrets:** a single `EnemyTurretSystem`; `bindPlayerTarget()` is repointed on switch.

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
- **Suspension**: each frame, Havok **raycasts** are cast downward from the six `SUS_*` points (converted to anchor-local offsets at load). Spring-damper forces are applied at hit points so the hull stays supported; parameters live under `suspension` in `TankController.json`.
  - Practical note: the suspension tries to maintain a nominal contact distance \(`rayStartHeight + restLength`\). If this is too large relative to `SUS_*` placement, the tank will “hover” above the ground.
- **Spawn snap**: once per scene load, the tank anchor may be lowered so probe rays match a nominal contact distance (`snapTankAnchorYToTerrain`), reducing float at spawn.
- **Grounding metadata** (`grounding` in JSON): used for legacy / helper data; primary behavior is the dynamic suspension + collider.

### Ground Contact and Landing (per-vehicle)

Implemented in `TankGameplayController.applySuspension()` and `applyMovement()`.

#### Contact detection

Each frame, for every probe in `rig.suspensionProbeNames`:

1. A Havok raycast is cast downward from `SUS_* + rayStartHeight`.
2. The probe's height above ground is computed as `hitDistance - rayStartHeight` (not raw `hitDistance`, which includes the ray offset).
3. A probe counts as **in contact** when `probeHeightAboveGround ≤ restLength + groundContactTolerance`.

`suspensionContactCount` is the number of probes in contact. `grounded = (contactCount > 0)`.

#### Two suspension modes (`springForcesEnabled`)

| Mode | Config | Behavior |
|------|--------|----------|
| **Collider-only** (tank default) | `springForcesEnabled: false` or absent | Hull rests on `COL_*` convex hull. Probes feed contact detection and landing bounce only. No spring forces applied. |
| **Spring-supported** (armored car) | `springForcesEnabled: true` | Spring-damper forces are applied at raycast hit points. Hull height, sag, and rebound are physically simulated. Requires tuning so static sag stays below the gap between probes and the bottom of `COL_*`. |

Static sag approximation: \( \text{sag} = m g / (n \cdot k) \) where \(n\) = probe count, \(k\) = `springStrength`. Remaining travel = `restLength - sag`.

#### Airborne control gating

When `movement.requireGroundContactForControl: true` and `grounded === false`:

- steering angular velocity is **not** applied (no mid-air pivot)
- traction force is **not** applied
- lateral grip force is **not** applied

The vehicle follows a ballistic trajectory until at least one probe touches ground again. Both tank and armored car enable this flag in their configs.

#### Airborne damping

Each frame, `syncPhysicsDamping(grounded)` switches Havok body damping:

| State | Linear | Angular |
|-------|--------|---------|
| Grounded | `physics.tankLinearDamping` | `physics.tankAngularDamping` |
| Airborne | `physics.airborneLinearDamping` (fallback: ground value) | `physics.airborneAngularDamping` (fallback: ground value) |

Ground damping caps top speed on the ground; low airborne damping preserves launch momentum after ramps and jumps.

#### Landing bounce

On the first grounded frame after at least `landingBounceMinAirSeconds` of air time, if fall speed ≥ `landingBounceMinSpeed`, an upward impulse is applied:

```
impulse = mass × min(fallSpeed, landingBounceMaxSpeed) × landingBounceRestitution
```

Works independently of `springForcesEnabled`. With springs enabled, keep `landingBounceRestitution` moderate — the spring already stores impact energy.

#### Compression / rebound damping

Per-probe damper force uses direction-dependent scale:

- **Compression** (probe moving down): `damperStrength × compressionDampingScale`
- **Extension** (probe moving up): `damperStrength × reboundDampingScale`

Lower `compressionDampingScale` → springier landings. Lower `reboundDampingScale` → faster rebound after compression.

#### Visual wheel travel (armored car)

When `rig.wheelTravelEnabled: true`, each wheel bone is offset vertically in its parent bone space by the compression of its matching `SUS_*` probe (matched by suffix `_FL`, `_FR`, `_RL`, `_RR`). This keeps tire meshes on the ground while the body sags and rolls.

Tune with `rig.wheelTravelAxis`, `rig.wheelTravelSign` (flip if wheels move the wrong way), and `rig.wheelTravelSharpness`.

## Armored Car — Driving and Suspension

Config: `config/vehicles/armoredCar.json`. Code: `TankGameplayController.applyMovement()`.

### Car steering (`movement.steeringMode: "car"`)

Unlike the tank (`"tank"`, default), the armored car cannot pivot on the spot:

- Hull yaw rate is proportional to **forward speed** and **steering input** (`smoothedTurnAxis`).
- Below `carMinSteerSpeed`, yaw rate is zero — no rotation without movement.
- In reverse, steering direction inverts (`reverseSign`).
- Forward speed is measured along the **drive direction** (`forwardWorld × movementInputSign × movementForwardSign`), not raw mesh forward, so steering matches player input when `movementInputSign: -1`.

Key tuning keys:

| Key | Role |
|-----|------|
| `hullTurnSpeedDeg` | Max yaw rate (deg/s) at full speed and full steer |
| `carMinSteerSpeed` | Min linear speed (m/s) before steering kicks in |
| `carSteerReferenceSpeed` | Speed at which steering reaches 100% (`speedFactor`) |
| `carSteerMinSpeedFactor` | Floor on `speedFactor` at low speed (0–1) |
| `carSteerGripMultiplier` | Scales `lateralFriction` while steering to reduce understeer / drift |

### Front-wheel visual steering

Front wheels (`rig.frontWheelBones`, typically `wheel_FL` + `wheel_FR`) rotate visually on `rig.wheelSteerAxis` toward `± wheelSteerMaxDeg` according to `smoothedTurnAxis`. Convergence speed: `wheelSteerSharpness`. All wheels spin on `wheelSpinAxis` at a rate derived from ground speed / `wheelRadius`.

### Missile firing — no bone recoil

For `primaryWeaponKind === "missile"`, `spawnProjectile()` skips `recoilKickY` and hull recoil impulse. Only `triggerShellShotCameraShake()` runs (using `camera.shellShotShakeDurationSeconds` / `shellShotShakeAmplitude`). Set `cannon.recoilKickY` and `cannon.hullRecoilKickDeg` to `0` in armored car config.

### Current armored car tuning snapshot

Reference values in `config/vehicles/armoredCar.json` (subject to feel tuning):

| Area | Notable values |
|------|----------------|
| Mass / damping | 12 kg; ground linear 2.4 / angular 1.35; airborne linear **0.06** / angular **0.2** |
| Suspension | `springForcesEnabled: true`; k=2000; damper=54; restLength=0.042 m |
| Traction | 350 N (paired with ground linear damping for ~12 m/s top speed) |
| Grip | lateralFriction 10.5; carSteerGripMultiplier 2.8 |
| Wheels | radius 0.093 m; travel enabled; front steer max 32° |

## Fighter Jet — Flight, VFX, and Weapons

Config: `config/vehicles/fighterJet.json`. Code: `FlightModel`, `TankGameplayController` (flight branch), `JetMissileLockController`, `postCombustionParticles.ts`, `flightEngineVisual.ts`.

### Flight model (`movement.steeringMode: "plane"`)

Requires a top-level `flight` block in the vehicle JSON. `FlightModel` integrates thrust, lift, drag, and torques on the Havok body each frame.

| Input | Effect |
|-------|--------|
| `Z` / `S` | Raise / lower throttle (`flight.throttleRatePerSecond`) |
| Mouse | Pitch / roll stick (respects `invertPitchAxis` / `invertRollAxis`) |
| `Q` / `D` | Yaw |
| `Shift` | Afterburner when throttle > 60 % and overcharge > 0 (`afterburnerMultiplier` on thrust) |

Low-altitude blends (`resolveLowAltitudeFlightBlends`) soften full gravity near the ground at low speed so the jet can taxi / take off without “magnet” snap. Suspension springs disable at high forward speed in flight mode.

### Engine visuals

- Bone `rig.flight.engineBone` (`engine`): scales **perpendicular** to `rig.flight.engineNozzleAxis` (default `y`) based on **throttle** (`flight.engineScaleMin`, `flight.engineScaleSharpness`)
- PBR material `flight.engineMaterialName` (`engine`): emissive intensity follows airspeed; turbo uses `engineEmissiveTurbo`

Vertices at the nozzle rim must be weighted to the `engine` bone (not only `fuselage`) for the scale to deform geometry. Validate with `node tools/inspectBoneWeights.mjs assets/jet.glb engine`.

### Post-combustion VFX

- **Empty:** `rig.nodes.postCombustion` → `jet_post_combustion` (local **+Z** = aft / exhaust direction)
- **Definition:** `assets/effects/post_combustion.json` (supports `//` line comments; stripped at load)
- **Runtime:** `createPostCombustionParticleBundle()` parents an invisible emitter mesh to the empty; `syncFlight(throttle, afterburner)` each frame
- **Tuning in JSON:** emit rate, colors, sizes, `direction1`/`direction2`, `emitPower`, `billboardMode`, etc. — see comments in the file
- **Tuning in vehicle config:**
  - `flight.postCombustionThrottleThreshold` — no flame below this throttle (0–1)
  - `flight.postCombustionTurboEmitScale` — multiplier on `emitRate` when afterburner is active (code also bumps power/size/color slightly)

### Missiles (jet primary)

- Magazine + reserve like armored car; **lock-on** reticle (`reticle_missile_jet.png` / `_locked` variant)
- Guided flight after launch; visible missiles hidden on hardpoints when fired
- Camera shake on shell fire is **skipped** for missiles (jet uses missiles, not shells)

### Missile firing — no bone recoil

Same as armored car: no hull/cannon recoil on missile launch; camera shake only where applicable.

### Power-Ups

Implemented in `src/game/PowerUpSystem.ts` (wired from `TankGameplayController`).

- **Spawn:** for each `PU_<typeId>` node in the terrain container, clone `mesh_<typeId>` from `assets/power-ups.glb` at that transform (anchor in scene).
- **Pickup:** distance test between `COL_tank` center and pickup anchor, using global `powerUps.pickupRadius` plus tank bounding radius (not physics overlap events).
- **Visual:** bob + slow Y rotation; `HighlightLayer` (green = available, red = on cooldown). Materials are cloned per instance so fade/respawn are independent.
- **`singleUse: true`:** on pickup the instance is **fully hidden** (meshes disabled) until the level is reloaded — no respawn in-session.
- **`singleUse: false`:** mesh fades to `pickedAlpha`, then respawns after `respawnSeconds`.

**Enabled types (config-driven):**

| Type | Effect |
|------|--------|
| `ammo_shell` | +reserve shells (`shellAmmoAmount`) |
| `fuel` | +fuel / battery (`batteryAmount` on `energy.batteryMax`) |
| `repair` | +HP (`repairAmount`, capped at `vehicle.healthMax`) |
| `shield` | timed invulnerability (`shieldDurationSeconds`, `damageReduction` 0–1) |
| `boost` | not wired to pickup yet (`enabled: false` in JSON) |
| `weapon_boost` | not wired yet |

**Authoring metaphor (current art):** repair = tool key; ammo = shell crate; fuel = jerrican; shield = geodesic energy dome.

## Controls

### Movement

- **Ground vehicles (tank, armored car):** `ZQSD` — forward/back and turn / steer
- **Fighter jet:** `Z` / `S` — throttle up/down; mouse — pitch/roll; `Q` / `D` — yaw (see **Fighter Jet — Flight, VFX, and Weapons**)
- `Shift`: boost while held (drains the boost gauge; see **Boost** below)

If fuel (battery) is `0%`:

- tank movement is disabled
- turret aiming remains available (subject to camera / reticle)
- firing remains available

If boost gauge (overcharge) is `0%`:

- boost has no effect (no traction multiplier, no boost FOV)
- holding `Shift` still drains nothing further once empty

### Aiming (current implementation)

- **Not** raw “mouse X = turret only, mouse Y = cannon only” on its own.
- Each frame, a **picking ray** is built from the **orbit camera** through the **screen center** (`createPickingRay`); it intersects world geometry or a fallback plane.
- The **camera reticle** (`UI_reticle_camera`) is placed at the camera ray hit point (with a max distance clamp), billboarded and scaled to constant screen size.
- The **barrel reticle** (`UI_reticle_barrel`) is placed at the muzzle ray hit point, also billboarded and scaled to constant screen size.
- **Turret yaw** and **cannon pitch** targets are derived from that world target in hull space, then rotated toward limits at configured speeds (`turret` / `cannon` in JSON).
- With **`CAM_pivot`** present and a **`TargetCamera`**-compatible `CAM_tank`, **mouse movement applies an orbit** (yaw/pitch around the pivot in hull space, distance clamped) before the ray is cast, so the view rotates around the tank like a third-person tank game.

### Vehicle switching

- `V`: cycle the active vehicle when a mission declares several (`LevelManager.cycleActiveVehicle()`).

### Weapons

- `1`: primary projectile weapon (shell on the tank, **missile** on the armored car)
- `2`: machine gun / minigun weapon
- mouse wheel: toggle between the two weapons
- left mouse button:
  - **shell** (tank): fires automatically when chambered and cooldown allows while held
  - **missile** (armored car): one missile per click (not auto-repeat) — see **Missiles** below
  - **bullets / minigun**: fire continuously while held

### Zoom

- right mouse button toggles an **alternative zoom view camera** (render-only)
- aiming and turret/cannon control remain driven by the **orbit camera** (control camera); only the render viewpoint changes
- zoom view FOV uses `camera.zoomViewFovDeg` (and still respects `camera.boostFovMultiplier`)

## Camera configuration (`config/TankController.json`)

Under `camera`, besides FOV:

- **`orbitYawDegPerPixel`** / **`orbitPitchDegPerPixel`**: mouse orbit sensitivity when `CAM_pivot` + orbit path is active
- **`orbitYawSign`** / **`orbitPitchSign`**: axis inversion (`1` / `-1`)
- **`orbitMinPitchDeg`** / **`orbitMaxPitchDeg`**: vertical orbit limits
- **`orbitMinRadius`** / **`orbitMaxRadius`**: distance clamp
- **`orbitDefaultRadius`**: fallback if initial camera–pivot distance is too small to infer
- **`orbitCollisionEnabled`** / **`orbitCollisionPadding`**: ray-based camera collision to avoid clipping through world geometry

At runtime, if `CAM_pivot` exists, **`CAM_tank` is detached** from the rig (world position preserved), default Babylon camera inputs on `FreeCamera` are cleared, and position/target are driven in code.

## Tracks (visual)

The tank can leave temporary track marks using **spawned segment planes**:

- a small plane segment is spawned at fixed spacing while the tank moves
- segments use the material from `TEX_tracks` (the mesh itself is hidden/disabled)
- segments are currently spawned from the middle suspension points (`SUS_ML` and `SUS_MR`) to reduce visual noise

Key config values live under `tracks` in `TankController.json`:

- `enabled`, `spacing`, `maxPointsPerRibbon` (used as **max segments**)
- `segmentLength`, `segmentWidth`
- `uvRepeatU`, `uvRepeatV`
- `yOffset`, `raycastStartHeight`, `raycastLength`
- `opacityMultiplier`

## Weapon Rules

The primary projectile weapon is defined per vehicle under `weapons`. A vehicle declares **either** `weapons.shell` (tank, obus) **or** `weapons.missile` (armored car) — both share the `ProjectileWeaponConfig` schema. Code resolves the active one via `getPrimaryWeaponKind()` / `getPrimaryWeaponConfig()` (`src/config/tankController.ts`), so `WeaponType` is `"shell" | "missile" | "bullet"`.

### Shells (tank — `weapons.shell`)

- finite reserve
- starting ammo: `14` (configurable)
- `magazineSize: 1` (one shell chambered at a time)
- chamber reload time: `~4` seconds (configurable, `reloadSeconds`)
- shell pickups refill ammo reserve
- ballistic projectile (`gravityMultiplier` ≈ 1)
- high damage, lower velocity (configurable)
- sound: `tank_cannon` + `shell_insert` on reload

### Missiles (armored car — `weapons.missile`)

- finite reserve (`startingReserveAmmo: 16`)
- **magazine of `magazineSize: 4`**: HUD shows `4/16`, one missile per left-click
- when the magazine empties, a **`reloadSeconds: 4`** reload refills the next salvo from the reserve
- `damage: 50`
- **gravity-immune** (`gravityMultiplier: 0`) — flies straight
- each missile of a salvo plays its own sound `missile_1` → `missile_4` (`assets/sounds/missile_*.wav`)
- HUD icon: `missile.png` (selected automatically when the primary weapon kind is `missile`)
- **No bone recoil** on fire — only camera shake (`camera.shellShotShake*`). Cannon recoil keys in JSON should be `0`.

### Bullets / minigun (`weapons.bullet`)

- fire rate configurable (`shotsPerSecond`)
- ballistic projectile
- lower damage, higher velocity (configurable)
- on the armored car, the `minigun` bone spins on its Y axis while firing (`rig.minigunSpinDegPerSec`)

## Turret and Cannon Constraints

### Turret

- yaw only (bone `tourelle`)
- free `360` degree rotation
- turn rate from `turret.yawSpeedDeg` in JSON

### Cannon

- pitch only (bone `canon`)
- min/max pitch from `cannon.minPitchDeg` / `cannon.maxPitchDeg` in JSON
- pitch speed from `cannon.pitchSpeedDeg`

## Vehicle Health

Configured under `vehicle` in `TankController.json`:

- `healthMax` — maximum HP (e.g. `400` for the current tank)
- `startingHealth` — HP at level load (may be set below max for testing, e.g. `200`)

Runtime API on `TankGameplayController`:

- `takeDamage(amount)` — applies damage; respects active shield (`damageReduction`)
- **No damage** from tank ↔ static world / wall collisions (only explicit damage sources should call `takeDamage`)

Projectile vs. player tank filtering is unchanged (player shells ignore the tank collider group).

## Energy System

JSON section `energy` drives two resources. The HUD labels them **Fuel** and **Boost** (bars only, no `%` text on health or boost).

### Fuel (internal: `battery`)

- maximum: `batteryMax` (default `100`)
- starts at `startingBattery`
- drains at `batteryDrainMovingPerSecond` while movement input is producing movement
- reaching `0` disables chassis movement only
- **`fuel` power-up** adds `batteryAmount` (capped at max)

### Boost (internal: `overcharge`)

- maximum: `overchargeMax` (default `100`)
- starts at `startingOvercharge`
- **While `Shift` is held:** drains at `overchargeDrainBoostPerSecond` (default `5` %/s), even when stationary
- **When `Shift` is released:** recharges at `overchargeRechargePerSecond` (default `5` %/s) up to max
- **Gameplay effect** (traction × `movement.boostMultiplier`, wider FOV via `camera.boostFovMultiplier`) only applies when moving, `Shift` held, and gauge > `0`
- There is **no** boost refill power-up in the current design; the gauge is self-managed

### Shield feedback (active shield)

While `shieldTimeRemaining > 0`:

- HUD health bar shows **100% fill** in **blue** (actual HP unchanged underneath)
- Tank visual meshes get a blue `HighlightLayer` glow (`tank_shield_highlight`)

## Gameplay HUD (`assets/ui/UI_hud.json`)

Loaded once per match by `TankGameplayController.initHud()` via `AdvancedDynamicTexture.ParseFromFileAsync`, then wired in `bindHudLayoutFromJson()`. **Reload the page / restart a level** after editing the JSON to see layout changes.

### Layout (panels)

| Panel / region | Position | Role |
|----------------|----------|------|
| `hud_panel_status` | bottom center | Vehicle status: health, fuel, boost rows with icons |
| `hud_panel_bottom` | bottom right | Active / inactive weapon slots |
| `hud_panel_timer` | top right | Session elapsed time (`00:00:00`) |
| `hud_indicators_container` | top center | Debug-style `BOOST : ON/OFF` and `ZOOM : ON/OFF` labels |

All three main panels share the same chrome: semi-transparent grey background (`rgba(72,72,72,0.58)`) and **L-shaped corner brackets** added in code (`addWeaponCornerBrackets`).

### Status panel (`hud_panel_status`)

- Icons (set in code from `assetUrls.ts`): `health.png`, `fuel.png`, `boost.png`
- **Health bar** — `hud_health_bar_bg`: four equal segments (25% each) spawned in `setupHealthBarSegments()`. Fill is grey by default, **red** below 25% HP, **blue** and forced to 100% while shield is active.
- **Fuel bar** — `hud_fuel_bar_bg`: two segments (20% / 80%). The left segment **blinks red** when fuel ≤ 20%.
- **Boost bar** — `hud_boost_bar_fill`: simple width-based fill tied to overcharge % (no segments).
- Row spacing uses explicit spacer rectangles in code (`setupStatusHudSpacing()`); panel height is computed from constants in `TankGameplayController.ts`.

Legacy JSON child `hud_health_bar_fill` / `hud_fuel_bar_fill` are removed at runtime if still present.

### Weapons panel (`hud_panel_bottom`)

| Control | Role |
|---------|------|
| `hud_weapon_primary` | Active weapon frame (larger, full opacity) |
| `hud_weapon_secondary` | Inactive weapon frame (~75% size, 50% opacity) |
| `hud_weapon_primary_icon` / `hud_weapon_secondary_icon` | `shell.png`, `missile.png` (armored car) or `machinegun.png` |
| `hud_weapon_primary_ammo` / `hud_weapon_secondary_ammo` | `1/14` (shells), `4/16` (missile magazine) or `∞`; Square font |
| Reload fill rects | Spawned in code on the primary slot for shell / missile-salvo reload progress |

Weapon switch uses a short animated transition (`updateWeaponHud`). Ammo layout is rebuilt as a `Grid` in `buildWeaponHudGrid()` so text aligns to the right of the icon. The primary projectile icon is chosen from the vehicle's primary weapon kind (`shell` vs `missile`).

### Session timer (`hud_panel_timer`)

| Control | Role |
|---------|------|
| `hud_timer_label` | Elapsed time text, format `MM:SS:CC` (centiseconds on the last two digits) |

- Counter resets to `0` when the HUD finishes loading (`sessionElapsedSeconds` in `bindHudLayoutFromJson()`).
- Updated every frame in `updateGameplayHud(dt)`.
- **Font:** `assets/ui/digital.ttf` (`TIMER_FONT_FAMILY = "Digital"`), loaded by `ensureDigitalFontLoaded()` in `src/ui/applyUiFont.ts`. Use a **monospaced / tabular** digit font to avoid horizontal jitter when digits change.
- **Typography from JSON:** `fontSize` and panel size are authored in `UI_hud.json`; code only forces font family and alignment (not `fontSize`).

### Top indicators

- `hud_boost_indicator`, `hud_zoom_indicator` — optional on-screen state for boost and zoom cameras.

### 2D reticles and overlays

- World reticles (`reticle_camera`, `reticle_barrel`, `reticle_gun`) are **Image** controls created in code on top of the parsed HUD texture (`attachHudReticlesIfNeeded`).
- **FPS counter** — HTML overlay (`.fps-counter` in `src/styles.css`), created in `GameApp`, positioned **top left** so it does not overlap the session timer.

### HUD fonts (`assets/ui/`)

| File | Family name | Usage |
|------|-------------|--------|
| `Square.ttf` | `Square` | Default GUI text (menus + most HUD labels) via `applyUiFontToTexture()` |
| `digital.ttf` | `Digital` | Session timer only (`hud_timer_label`); excluded from the global Square pass |

Fonts are injected as `@font-face` rules in `src/ui/applyUiFont.ts`. In dev, `digital.ttf` is cache-busted so replacing the file picks up after HMR or hard refresh.

## Planned / Deferred Pickups

- `boost` type in JSON (disabled; boost is auto-recharge only)
- `weapon_boost` — damage/velocity stacks (config exists, pickup not implemented)

## Weapon Power-Ups

- up to `2` stacks
- each stack grants:
  - `+25%` damage
  - `+25%` projectile velocity

## Configuration Strategy

All vehicle gameplay tuning must be externalized in the per-vehicle JSON config (`config/TankController.json` for the tank, `config/vehicles/<type>.json` for others), resolved through `vehicleRegistry.ts`.

Each config is the source of truth for:

- `rig` node/bone names and axes (per-vehicle: `pitchBone`, `minigunBone`, `wheelBones`, `frontWheelBones`, `wheelRadius`, `wheelTravel*`, `suspensionProbeNames`, `rig.flight.*`, `nodes.*`)
- `movement` (including `steeringMode`: `"tank"`, `"car"`, `"plane"`, car steering keys, `requireGroundContactForControl`)
- `flight` (fighter jet only: thrust, lift, surfaces, gear, engine visuals, post-combustion thresholds)
- `suspension` (spring forces, contact tolerance, landing bounce, compression/rebound damping)
- `physics` (including `airborneLinearDamping` / `airborneAngularDamping`)
- `grounding`, `vehicle` health
- turn rates, pitch limits, recoil (shell only; missiles use camera shake)
- camera FOV and **orbit** parameters
- fuel (`energy` battery) and boost (`energy` overcharge) drain/recharge
- weapon values (`weapons.shell` **or** `weapons.missile`, plus `weapons.bullet`)
- `powerUps` global + per-type settings (`types.*`)
- `tracks` (tank only; armored car and jet omit this section)

**Per-map ambiance** (not in vehicle JSON): `LevelDefinition.environment` in `src/ui/menuData.ts` — fog, `clearColor`, `environmentIntensity`, `sunIntensity`. See **Per-map environment**.

The game code should avoid hardcoding gameplay numbers except for small glue constants (e.g. reticle `baseScale` in `TankGameplayController.ts` until moved to JSON).

## Debug toggles

Optional debug visuals can be enabled via `debug` in `config/TankController.json`:

- `debug.showSuspensionSpheres`: shows small red spheres at the `SUS_*` empty positions (used to validate suspension probe placement after GLB export).
- `debug.showPowerUpBounds`: wireframe pickup spheres around power-up instances.

## Recommended Module Layout (actual)

- `src/app/` — bootstrap, state transitions, global input (`V` switch wiring); `levels.ts` types for `LevelDefinition` / `environment`
- `src/ui/` — `menuData.ts` (maps, missions, per-map `environment`)
- `src/game/` — `createGameplayScene`, `applyLevelEnvironment`, `TankGameplayController`, `TankInput`, `PowerUpSystem`, `sceneGameplayUi`
- `src/game/vehicle/` — `VehicleController`, `TankVehicleController`, `FlightModel`, `JetMissileLockController`, `postCombustionParticles`, `flightEngineVisual`
- `src/game/level/` — `LevelManager` (vehicle roster + active vehicle switching)
- `src/config/` — typed config + JSON import + `vehicleRegistry`
- `src/assets/` — asset URLs
- `config/vehicles/` — per-vehicle JSON configs (`armoredCar.json`, `fighterJet.json`, …)
- `assets/effects/` — particle JSON definitions (`post_combustion.json`, `damage_smoke.json`, …)
- `tools/` — GLB inspection scripts (`inspectVehicleGlb.mjs`, `inspectBoneWeights.mjs`)

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
