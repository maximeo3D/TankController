import enemiesControllerConfig from "../../config/enemiesController.json";

export interface EnemyTurretRigConfig {
  yawBone: string;
  pitchBone: string;
  yawAxis: "x" | "y" | "z";
  yawSign: 1 | -1;
  pitchAxis: "x" | "y" | "z";
  /** Signe de l'axe local utilisé pour appliquer la rotation du pitch. */
  pitchSign: 1 | -1;
  /** Signe du pitch calculé depuis la visée (positif = cible au-dessus du pivot). */
  pitchAimSign: 1 | -1;
  /** Signe appliqué à la composante X locale lors du calcul du yaw (visée). */
  yawAimXSign: 1 | -1;
  /** Signe appliqué à la composante Z locale lors du calcul du yaw (visée). */
  yawAimZSign: 1 | -1;
}

export interface EnemyTurretTrackingConfig {
  yawSpeedDeg: number;
  pitchSpeedDeg: number;
  minPitchDeg: number;
  maxPitchDeg: number;
}

export interface EnemyTurretCombatConfig {
  healthMax: number;
  contactDamage: number;
}

export interface EnemyTurretDebugConfig {
  showAimVectors: boolean;
}

export interface EnemyTurretConfig {
  enabled: boolean;
  meshName: string;
  /** Préfixe des empties terrain, ex. `SPAWN_enemy_turret_` → `_1`, `_2`, … */
  spawnNodePrefix: string;
  detectionRange: number;
  debug?: EnemyTurretDebugConfig;
  tracking: EnemyTurretTrackingConfig;
  rig: EnemyTurretRigConfig;
  combat: EnemyTurretCombatConfig;
}

export interface EnemiesControllerConfig {
  turret: EnemyTurretConfig;
}

export const enemiesConfig = enemiesControllerConfig as EnemiesControllerConfig;
