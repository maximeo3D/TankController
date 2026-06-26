import type { VehicleController, VehicleDebugState, VehicleInstanceId } from "../vehicle/VehicleController";
import { resolveLevelMissionContext, type LevelMissionContext } from "./missionConfig";
import type { LevelDefinition } from "../../app/levels";
import type { MenuMission } from "../../ui/menuData";

export class LevelManager {
  private readonly context: LevelMissionContext;
  private readonly vehicles = new Map<VehicleInstanceId, VehicleController>();
  private activeVehicleId: VehicleInstanceId | null = null;
  private levelPaused = false;
  private onActiveVehicleChanged: ((vehicle: VehicleController) => void) | null = null;

  public constructor(level: LevelDefinition, mission: MenuMission | null) {
    this.context = resolveLevelMissionContext(level, mission);
  }

  public setOnActiveVehicleChanged(callback: (vehicle: VehicleController) => void): void {
    this.onActiveVehicleChanged = callback;
  }

  public get missionContext(): LevelMissionContext {
    return this.context;
  }

  public registerVehicle(vehicle: VehicleController): void {
    if (this.vehicles.has(vehicle.id)) {
      console.warn(`[LevelManager] Vehicle "${vehicle.id}" already registered; replacing instance.`);
      this.vehicles.get(vehicle.id)?.dispose();
    }

    this.vehicles.set(vehicle.id, vehicle);

    if (!this.activeVehicleId) {
      this.setActiveVehicle(this.context.startVehicleId);
    }
  }

  public setActiveVehicle(id: VehicleInstanceId): boolean {
    const next = this.vehicles.get(id);
    if (!next) {
      console.warn(`[LevelManager] Unknown vehicle id "${id}".`);
      return false;
    }

    if (this.activeVehicleId === id) {
      return true;
    }

    const previous = this.activeVehicleId ? this.vehicles.get(this.activeVehicleId) : null;
    previous?.deactivate();

    this.activeVehicleId = id;
    next.activate();
    this.syncPauseState();
    this.onActiveVehicleChanged?.(next);
    return true;
  }

  /** Cycle vers le véhicule suivant (touche V). */
  public cycleActiveVehicle(): boolean {
    const ids = this.getVehicleIds();
    if (ids.length <= 1 || !this.activeVehicleId) {
      return false;
    }

    const currentIndex = ids.indexOf(this.activeVehicleId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % ids.length : 0;
    return this.setActiveVehicle(ids[nextIndex]);
  }

  public getActiveVehicle(): VehicleController | null {
    return this.activeVehicleId ? this.vehicles.get(this.activeVehicleId) ?? null : null;
  }

  public getActiveVehicleId(): VehicleInstanceId | null {
    return this.activeVehicleId;
  }

  public getVehicleIds(): VehicleInstanceId[] {
    return [...this.vehicles.keys()];
  }

  public setPaused(paused: boolean): void {
    if (this.levelPaused === paused) {
      return;
    }

    this.levelPaused = paused;
    this.syncPauseState();
  }

  public getDebugState(): VehicleDebugState | null {
    return this.getActiveVehicle()?.getDebugState() ?? null;
  }

  public dispose(): void {
    for (const vehicle of this.vehicles.values()) {
      vehicle.dispose();
    }
    this.vehicles.clear();
    this.activeVehicleId = null;
  }

  private syncPauseState(): void {
    for (const vehicle of this.vehicles.values()) {
      vehicle.setPaused(this.levelPaused);
    }
  }
}
