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
  /** Axe local de l'empty muzzle pour la direction de tir. Défaut : z. */
  muzzleForwardAxis?: "x" | "y" | "z";
  /** Signe de l'axe muzzle (Blender -Z → -1). Défaut : 1. */
  muzzleForwardSign?: 1 | -1;
}

export interface EnemyTurretTrackingConfig {
  yawSpeedDeg: number;
  pitchSpeedDeg: number;
  minPitchDeg: number;
  maxPitchDeg: number;
  /** Offset ajouté au yaw de visée (deg). 180 = face Blender Y+ / glTF -Z. */
  yawOffsetDeg?: number;
}

export interface EnemyTurretCombatConfig {
  healthMax: number;
  contactDamage: number;
  shotsPerSecondPerBarrel: number;
  bulletDamage: number;
  muzzleVelocity: number;
  /** Décalage le long de l'axe du canon pour éviter un impact immédiat avec la tourelle. */
  muzzleSpawnOffset: number;
  gravityMultiplier: number;
  projectileRadius: number;
  projectileMaxLifeSeconds: number;
  /** Angle max (deg) entre l'axe du canon et la cible pour autoriser le tir. */
  fireAlignmentMaxAngleDeg: number;
}

export interface EnemyTurretDebugConfig {
  showAimVectors: boolean;
  /** Origine / direction des balles (lignes + marqueurs au tir). */
  showBulletVectors?: boolean;
}

export interface EnemyTurretDamageFlashConfig {
  durationSeconds: number;
  maxAlpha: number;
  /** RGB 0–1 */
  color: [number, number, number];
}

export interface EnemyTurretConfig {
  enabled: boolean;
  meshName: string;
  /** Préfixe des empties terrain, ex. `SPAWN_enemy_turret_` → `_1`, `_2`, … */
  spawnNodePrefix: string;
  /** Nom du nœud armature à cloner dans `enemies.glb`. Défaut : `turret_armature`. */
  armatureRoot?: string;
  colliderMesh?: string;
  ammoMesh?: string;
  muzzleNodes?: string[];
  /**
   * Bone auquel rattacher un muzzle qui n'est pas enfant de l'armature
   * (ex. empty scène `soldier_rifle_muzzle` → `buste`).
   */
  muzzleAttachBone?: string | null;
  /** Empty fumée de dégâts. `null` = pas d'indicateur visuel. */
  damageSmokeNode?: string | null;
  /** Empty de lock missile. `null` = non verrouillable. */
  lockTargetNode?: string | null;
  missileLockable?: boolean;
  /** Explosion à la mort. Défaut : true. */
  playDeathExplosion?: boolean;
  gunMuzzleFlashMesh?: string | null;
  fireSound?: string | null;
  fireSoundVolume?: number;
  /** Offset yaw appliqué à l'instance au spawn (deg), ex. 180 si le mesh fait face à -Z. */
  spawnYawOffsetDeg?: number;
  detectionRange: number;
  debug?: EnemyTurretDebugConfig;
  damageFlash?: EnemyTurretDamageFlashConfig;
  tracking: EnemyTurretTrackingConfig;
  rig: EnemyTurretRigConfig;
  combat: EnemyTurretCombatConfig;
}

export interface EnemiesControllerConfig {
  turret: EnemyTurretConfig;
  soldierRifle?: EnemyTurretConfig;
}

export const enemiesConfig = enemiesControllerConfig as EnemiesControllerConfig;
