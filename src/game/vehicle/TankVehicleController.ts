import {
  TankGameplayController,
  type TankGameplayDebugState
} from "../TankGameplayController";
import type { VehicleController, VehicleDebugState, VehicleInstanceId, VehicleTypeId } from "./VehicleController";

export interface TankVehicleControllerOptions {
  id: VehicleInstanceId;
  type?: VehicleTypeId;
  controller: TankGameplayController;
}

/** Adaptateur gameplay → contrat véhicule générique (tank, voiture blindée, …). */
export class TankVehicleController implements VehicleController {
  public readonly id: VehicleInstanceId;
  public readonly type: VehicleTypeId;
  private readonly controller: TankGameplayController;
  private playerActive = false;
  private levelPaused = false;

  public constructor(options: TankVehicleControllerOptions) {
    this.id = options.id;
    this.type = options.type ?? "tank";
    this.controller = options.controller;
  }

  public activate(): void {
    this.playerActive = true;
    this.controller.setPlayerActive(true);
    this.syncPausedState();
  }

  public deactivate(): void {
    this.playerActive = false;
    this.controller.setPlayerActive(false);
    this.syncPausedState();
  }

  public setPaused(paused: boolean): void {
    this.levelPaused = paused;
    this.syncPausedState();
  }

  public getDebugState(): VehicleDebugState {
    return toVehicleDebugState(this.controller.getDebugState());
  }

  public focusCamera(): void {
    this.controller.focusCamera();
  }

  public getEnemyPlayerTarget() {
    return this.controller.getEnemyPlayerTarget();
  }

  public getAimTargetNode() {
    return this.controller.getAimTargetNode();
  }

  public dispose(): void {
    this.controller.dispose();
  }

  private syncPausedState(): void {
    const shouldPause = !this.playerActive || this.levelPaused;
    this.controller.setPaused(shouldPause);
  }
}

function toVehicleDebugState(state: TankGameplayDebugState): VehicleDebugState {
  return {
    health: state.health,
    healthMax: state.healthMax,
    healthPercent: state.healthPercent,
    battery: state.battery,
    overcharge: state.overcharge,
    boostActive: state.boostActive,
    zoomActive: state.zoomActive,
    position: state.position
  };
}
