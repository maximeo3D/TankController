import type { Scene } from "@babylonjs/core/scene";
import type { LevelManager } from "./level/LevelManager";

/** Gèle la simulation (physique, animations, FX) et les véhicules pendant le menu pause. */
export class WorldPauseController {
  private paused = false;

  public constructor(
    private readonly scene: Scene,
    private readonly levelManager: LevelManager
  ) {}

  public isPaused(): boolean {
    return this.paused;
  }

  public setPaused(paused: boolean): void {
    if (this.paused === paused) {
      return;
    }

    this.paused = paused;

    if (paused) {
      this.levelManager.setPaused(true);
      this.freezeAllVehicles();
      this.scene.physicsEnabled = false;
      this.scene.animationsEnabled = false;
      this.scene.particlesEnabled = false;
      this.scene.spritesEnabled = false;
      return;
    }

    this.scene.physicsEnabled = true;
    this.scene.animationsEnabled = true;
    this.scene.particlesEnabled = true;
    this.scene.spritesEnabled = true;
    this.levelManager.setPaused(false);
  }

  private freezeAllVehicles(): void {
    for (const vehicle of this.levelManager.getVehicles()) {
      vehicle.freezePhysicsState();
    }
  }
}
