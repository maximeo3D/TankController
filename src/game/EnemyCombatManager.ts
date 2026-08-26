import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { CombatFaction, EnemiesControllerConfig } from "../config/enemiesController";
import {
  EnemyTurretSystem,
  areFactionsHostile,
  type CombatWorld,
  type CombatantSnapshot,
  type EnemyCombatSystem,
  type EnemyLockTarget,
  type EnemyTurretPlayerTarget,
  type EnemyTurretRadarTarget
} from "./EnemyTurretSystem";

export interface EnemyCombatManagerOptions {
  scene: Scene;
  terrainContainer: AssetContainer;
  enemiesContainer: AssetContainer;
  alliesContainer?: AssetContainer | null;
  config: EnemiesControllerConfig;
}

export class EnemyCombatManager implements EnemyCombatSystem, CombatWorld {
  private readonly systems: EnemyTurretSystem[] = [];
  private playerTarget: EnemyTurretPlayerTarget | null = null;
  private playerAim: TransformNode | AbstractMesh | null = null;

  public constructor(options: EnemyCombatManagerOptions) {
    if (options.config.turret.enabled) {
      this.addSystem(options, options.config.turret, "turret", options.enemiesContainer, "enemies.glb");
    }
    if (options.config.soldierRifle?.enabled) {
      this.addSystem(options, options.config.soldierRifle, "soldier rifle", options.enemiesContainer, "enemies.glb");
    }
    if (options.config.soldierRocket?.enabled) {
      this.addSystem(options, options.config.soldierRocket, "soldier rocket", options.enemiesContainer, "enemies.glb");
    }
    if (options.config.allySoldierRifle?.enabled) {
      if (!options.alliesContainer) {
        console.warn("[TankController] Ally soldier rifle enabled but allies.glb is not loaded.");
      } else {
        this.addSystem(
          options,
          options.config.allySoldierRifle,
          "ally soldier rifle",
          options.alliesContainer,
          "allies.glb"
        );
      }
    }
    for (const system of this.systems) {
      system.setCombatWorld(this);
    }
  }

  private addSystem(
    options: EnemyCombatManagerOptions,
    config: EnemiesControllerConfig["turret"],
    label: string,
    templatesContainer: AssetContainer,
    templatesGlbName: string
  ): void {
    try {
      this.systems.push(
        new EnemyTurretSystem({
          scene: options.scene,
          terrainContainer: options.terrainContainer,
          enemiesContainer: templatesContainer,
          templatesGlbName,
          config
        })
      );
    } catch (err) {
      console.warn(`[TankController] Enemy ${label} system could not be created:`, err);
    }
  }

  public get instanceCount(): number {
    return this.systems.reduce((sum, system) => sum + system.instanceCount, 0);
  }

  public getFaction(): CombatFaction {
    return "enemy";
  }

  public collectCombatants(): CombatantSnapshot[] {
    return this.collectAllCombatants();
  }

  public matchCombatantFromHit(hit: unknown): CombatantSnapshot | null {
    for (const system of this.systems) {
      const combatant = system.matchCombatantFromHit(hit);
      if (combatant) {
        return combatant;
      }
    }
    return null;
  }

  public setCombatWorld(_world: CombatWorld | null): void {
    // Le manager EST le CombatWorld partagé.
  }

  public bindPlayerTarget(target: EnemyTurretPlayerTarget): void {
    this.playerTarget = target;
    for (const system of this.systems) {
      system.bindPlayerTarget(target);
    }
  }

  public getNearestHostile(
    from: Vector3,
    faction: CombatFaction,
    range: number
  ): CombatantSnapshot | null {
    const rangeSq = range * range;
    let nearest: CombatantSnapshot | null = null;
    let nearestDistSq = rangeSq;
    for (const combatant of this.collectAllCombatants()) {
      if (!areFactionsHostile(faction, combatant.faction)) {
        continue;
      }
      const distSq = Vector3.DistanceSquared(from, combatant.position);
      if (distSq <= nearestDistSq) {
        nearestDistSq = distSq;
        nearest = combatant;
      }
    }
    return nearest;
  }

  public isFriendlyHit(hit: unknown, shooterFaction: CombatFaction, shooterSpawnId: string): boolean {
    const combatant = this.matchCombatantFromHit(hit);
    if (!combatant) {
      return false;
    }
    if (combatant.id === shooterSpawnId) {
      return true;
    }
    return !areFactionsHostile(shooterFaction, combatant.faction);
  }

  public resolveHostileHit(
    hit: unknown,
    shooterFaction: CombatFaction,
    shooterSpawnId: string
  ): CombatantSnapshot | null {
    const combatant = this.matchCombatantFromHit(hit);
    if (!combatant || combatant.id === shooterSpawnId) {
      return null;
    }
    if (combatant.faction === "player") {
      return null;
    }
    if (!areFactionsHostile(shooterFaction, combatant.faction)) {
      return null;
    }
    return combatant;
  }

  private collectAllCombatants(): CombatantSnapshot[] {
    const combatants = this.systems.flatMap((system) => system.collectCombatants());
    const player = this.playerTarget;
    if (player) {
      const aim = this.playerAim;
      aim?.computeWorldMatrix(true);
      player.tankColliderMesh?.computeWorldMatrix(true);
      const position =
        aim?.getAbsolutePosition().clone() ??
        player.tankColliderMesh?.getAbsolutePosition().clone() ??
        Vector3.Zero();
      combatants.push({
        id: "player",
        faction: "player",
        position,
        colliderMesh: player.tankColliderMesh,
        body: player.tankBody,
        applyDamage: player.onDamage
      });
    }
    return combatants;
  }

  public update(dt: number, aimTarget: TransformNode | AbstractMesh): void {
    this.playerAim = aimTarget;
    for (const system of this.systems) {
      system.update(dt, aimTarget);
    }
  }

  public getRadarTargets(): EnemyTurretRadarTarget[] {
    return this.systems.flatMap((system) => system.getRadarTargets());
  }

  public getLockTargets(): EnemyLockTarget[] {
    return this.systems.flatMap((system) => system.getLockTargets());
  }

  public getLockTargetAimPoint(spawnId: string): Vector3 | null {
    for (const system of this.systems) {
      const aimPoint = system.getLockTargetAimPoint(spawnId);
      if (aimPoint) {
        return aimPoint;
      }
    }
    return null;
  }

  public resolveTurretIdFromWeaponHit(hit: unknown): string | null {
    for (const system of this.systems) {
      const spawnId = system.resolveTurretIdFromWeaponHit(hit);
      if (spawnId) {
        return spawnId;
      }
    }
    return null;
  }

  public isTurretColliderMesh(mesh: AbstractMesh | null | undefined): boolean {
    return this.systems.some((system) => system.isTurretColliderMesh(mesh));
  }

  public applyDamageToTurret(spawnId: string, amount: number): boolean {
    return this.systems.some((system) => system.applyDamageToTurret(spawnId, amount));
  }

  public applyExplosionDamageAt(worldPos: Vector3, amount: number, radius: number): void {
    for (const system of this.systems) {
      system.applyExplosionDamageAt(worldPos, amount, radius);
    }
  }

  public collectShadowCasterMeshes(): AbstractMesh[] {
    return this.systems.flatMap((system) => system.collectShadowCasterMeshes());
  }

  public dispose(): void {
    for (const system of this.systems) {
      system.setCombatWorld(null);
      system.dispose();
    }
    this.systems.length = 0;
  }
}
