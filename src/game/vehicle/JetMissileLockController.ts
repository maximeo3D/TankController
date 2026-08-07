import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Image } from "@babylonjs/gui/2D/controls/image";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Sound } from "@babylonjs/core/Audio/sound";
import type { MissileLockConfig } from "../../config/tankController";
import type { EnemyLockTarget } from "../EnemyTurretSystem";
import { resolveVehicleSoundUrl } from "../../assets/soundLibrary";

export interface JetMissileLockOrigin {
  position: Vector3;
  forward: Vector3;
}

export interface JetMissileLockControllerOptions {
  scene: Scene;
  hudTexture: AdvancedDynamicTexture;
  config: MissileLockConfig;
  getLockOrigin: () => JetMissileLockOrigin | null;
  getTargets: () => EnemyLockTarget[];
  isAudioUnlocked: () => boolean;
  reticleBaseSizePx?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Sélectionne la cible la plus proche de l'axe du cône (pas la plus proche en distance). */
function findBestTargetInCone(
  origin: Vector3,
  forward: Vector3,
  halfAngleDeg: number,
  maxDistance: number,
  targets: EnemyLockTarget[]
): EnemyLockTarget | null {
  const cosLimit = Math.cos(toRadians(halfAngleDeg));
  let best: EnemyLockTarget | null = null;
  let bestScore = Infinity;

  for (const target of targets) {
    const offset = target.aimPoint.subtract(origin);
    const distance = offset.length();
    if (distance < 1e-3 || distance > maxDistance) {
      continue;
    }

    const direction = offset.scale(1 / distance);
    const alignment = Vector3.Dot(forward, direction);
    if (alignment < cosLimit) {
      continue;
    }

    const score = 1 - alignment;
    if (score < bestScore) {
      bestScore = score;
      best = target;
    }
  }

  return best;
}

/**
 * Verrouillage missiles du jet : cône depuis le canon, réticule animé sur la cible,
 * son de lock au début de l'acquisition.
 */
export class JetMissileLockController {
  private readonly scene: Scene;
  private readonly config: MissileLockConfig;
  private readonly getLockOrigin: () => JetMissileLockOrigin | null;
  private readonly getTargets: () => EnemyLockTarget[];
  private readonly isAudioUnlocked: () => boolean;
  private readonly reticleBaseSizePx: number;
  private readonly lockReticle: Image;
  private readonly lockSound: Sound | null;

  private targetId: string | null = null;
  private targetAimPoint: Vector3 | null = null;
  /** 0 = invisible, 1 = lock complet. */
  private visualStrength = 0;

  public constructor(options: JetMissileLockControllerOptions) {
    this.scene = options.scene;
    this.config = options.config;
    this.getLockOrigin = options.getLockOrigin;
    this.getTargets = options.getTargets;
    this.isAudioUnlocked = options.isAudioUnlocked;
    this.reticleBaseSizePx = options.reticleBaseSizePx ?? 150;

    this.lockReticle = new Image("reticle_missile_jet_locked_img", "");
    this.lockReticle.widthInPixels = this.reticleBaseSizePx;
    this.lockReticle.heightInPixels = this.reticleBaseSizePx;
    this.lockReticle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.lockReticle.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.lockReticle.isVisible = false;
    this.lockReticle.isPointerBlocker = false;
    this.lockReticle.alpha = 0;
    this.lockReticle.zIndex = 12;
    options.hudTexture.addControl(this.lockReticle);

    const lockSoundUrl = resolveVehicleSoundUrl("missile_lock");
    this.lockSound = lockSoundUrl
      ? new Sound("missile_lock", lockSoundUrl, this.scene, null, {
          autoplay: false,
          loop: false,
          volume: 0.85
        })
      : null;
  }

  public setLockedReticleSource(url: string): void {
    this.lockReticle.source = url;
  }

  public update(dt: number, missileWeaponActive: boolean, camera: Camera | null): void {
    if (!missileWeaponActive || dt <= 0) {
      this.hideLockReticle();
      return;
    }

    const origin = this.getLockOrigin();
    if (!origin) {
      this.fadeOut(dt);
      this.refreshLockReticle(camera);
      return;
    }

    const best = findBestTargetInCone(
      origin.position,
      origin.forward,
      this.config.coneHalfAngleDeg,
      this.config.maxLockDistance,
      this.getTargets()
    );

    if (best) {
      if (best.id !== this.targetId) {
        this.beginAcquire(best);
      } else {
        this.targetAimPoint = best.aimPoint.clone();
      }
      const acquireRate = 1 / Math.max(this.config.acquireSeconds, 1e-3);
      this.visualStrength = Math.min(1, this.visualStrength + acquireRate * dt);
    } else {
      this.fadeOut(dt);
    }

    this.refreshLockReticle(camera);
  }

  /** Identifiant de la cible pleinement verrouillée, sinon `null`. */
  public getLockedTargetId(): string | null {
    return this.visualStrength >= 1 && this.targetId ? this.targetId : null;
  }

  public dispose(): void {
    this.lockReticle.dispose();
    this.lockSound?.dispose();
  }

  private beginAcquire(target: EnemyLockTarget): void {
    this.targetId = target.id;
    this.targetAimPoint = target.aimPoint.clone();
    this.visualStrength = 0;
    this.playLockSound();
  }

  private fadeOut(dt: number): void {
    const loseRate = 1 / Math.max(this.config.loseSeconds, 1e-3);
    this.visualStrength = Math.max(0, this.visualStrength - loseRate * dt);
    if (this.visualStrength <= 0) {
      this.targetId = null;
      this.targetAimPoint = null;
    }
  }

  private hideLockReticle(): void {
    this.visualStrength = 0;
    this.targetId = null;
    this.targetAimPoint = null;
    this.lockReticle.isVisible = false;
    this.lockReticle.alpha = 0;
  }

  private refreshLockReticle(camera: Camera | null): void {
    if (!camera || !this.targetAimPoint || this.visualStrength <= 0) {
      this.lockReticle.isVisible = false;
      return;
    }

    const engine = this.scene.getEngine();
    const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const projected = Vector3.Project(
      this.targetAimPoint,
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      viewport
    );

    const onScreen =
      Number.isFinite(projected.x) &&
      Number.isFinite(projected.y) &&
      projected.z >= 0 &&
      projected.z <= 1 &&
      projected.x >= viewport.x &&
      projected.x <= viewport.x + viewport.width &&
      projected.y >= viewport.y &&
      projected.y <= viewport.y + viewport.height;

    if (!onScreen) {
      this.lockReticle.isVisible = false;
      return;
    }

    const strength = clamp(this.visualStrength, 0, 1);
    const scale = lerp(1.5, 1, strength);
    this.lockReticle.isVisible = true;
    this.lockReticle.alpha = strength;
    this.lockReticle.leftInPixels = projected.x - (viewport.x + viewport.width / 2);
    this.lockReticle.topInPixels = projected.y - (viewport.y + viewport.height / 2);
    this.lockReticle.scaleX = scale;
    this.lockReticle.scaleY = scale;
  }

  private playLockSound(): void {
    if (!this.isAudioUnlocked() || !this.lockSound) {
      return;
    }

    try {
      this.lockSound.stop();
      this.lockSound.play();
    } catch {
      // Audio optionnel.
    }
  }
}
