import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { EnemiesControllerConfig } from "../config/enemiesController";
import {
  EnemyTurretSystem,
  type EnemyCombatSystem,
  type EnemyLockTarget,
  type EnemyTurretPlayerTarget,
  type EnemyTurretRadarTarget
} from "./EnemyTurretSystem";

export interface EnemyCombatManagerOptions {
  scene: Scene;
  terrainContainer: AssetContainer;
  enemiesContainer: AssetContainer;
  config: EnemiesControllerConfig;
}

export class EnemyCombatManager implements EnemyCombatSystem {
  private readonly systems: EnemyTurretSystem[] = [];

  public constructor(options: EnemyCombatManagerOptions) {
    if (options.config.turret.enabled) {
      this.addSystem(options, options.config.turret, "turret");
    }
    if (options.config.soldierRifle?.enabled) {
      this.addSystem(options, options.config.soldierRifle, "soldier rifle");
    }
    if (options.config.soldierRocket?.enabled) {
      this.addSystem(options, options.config.soldierRocket, "soldier rocket");
    }
  }

  private addSystem(
    options: EnemyCombatManagerOptions,
    config: EnemiesControllerConfig["turret"],
    label: string
  ): void {
    try {
      this.systems.push(
        new EnemyTurretSystem({
          scene: options.scene,
          terrainContainer: options.terrainContainer,
          enemiesContainer: options.enemiesContainer,
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

  public bindPlayerTarget(target: EnemyTurretPlayerTarget): void {
    for (const system of this.systems) {
      system.bindPlayerTarget(target);
    }
  }

  public update(dt: number, aimTarget: TransformNode | AbstractMesh): void {
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

  public dispose(): void {
    for (const system of this.systems) {
      system.dispose();
    }
    this.systems.length = 0;
  }
}
