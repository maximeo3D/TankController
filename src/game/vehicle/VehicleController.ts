import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { EnemyTurretPlayerTarget } from "../EnemyTurretSystem";

/** Identifiant d'instance de véhicule dans un niveau (ex: `player_tank`). */
export type VehicleInstanceId = string;

/** Type de véhicule (définition gameplay / asset). */
export type VehicleTypeId = "tank" | "armoredCar" | "fighterJet" | "helicopter";

export interface VehicleDebugState {
  health: number;
  healthMax: number;
  healthPercent: number;
  battery: number;
  overcharge: number;
  boostActive: boolean;
  zoomActive: boolean;
  position: Vector3;
}

/** Contrat commun pour tout véhicule jouable ou switchable. */
export interface VehicleController {
  readonly id: VehicleInstanceId;
  readonly type: VehicleTypeId;
  activate(): void;
  deactivate(): void;
  setPaused(paused: boolean): void;
  /** Vrai si le véhicule est suffisamment à l'arrêt pour autoriser un switch joueur. */
  canSwitchVehicle(): boolean;
  getDebugState(): VehicleDebugState;
  /** Caméra gameplay à activer quand ce véhicule devient actif. */
  focusCamera(): void;
  /** Cible de visée pour les tourelles ennemies. */
  getEnemyPlayerTarget(): EnemyTurretPlayerTarget | null;
  /** Noeud suivi par les ennemis (fallback sur le body). */
  getAimTargetNode(): TransformNode | AbstractMesh | null;
  dispose(): void;
}
