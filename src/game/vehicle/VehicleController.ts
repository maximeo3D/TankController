import type { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Identifiant d'instance de véhicule dans un niveau (ex: `player_tank`). */
export type VehicleInstanceId = string;

/** Type de véhicule (définition gameplay / asset). */
export type VehicleTypeId = "tank" | "armoredCar";

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
  getDebugState(): VehicleDebugState;
  dispose(): void;
}
