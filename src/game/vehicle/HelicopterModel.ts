import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { HelicopterConfig } from "../../config/tankController";

export interface HelicopterModelOptions {
  scene: Scene;
  body: PhysicsBody;
  anchor: TransformNode;
  config: HelicopterConfig;
  mass: number;
  /** Direction du nez dans l'espace local du châssis (unitaire). */
  noseLocal: Vector3;
}

export interface HelicopterInputFrame {
  /** +1 = Z (monter), -1 = S (descendre). */
  climbAxis: number;
  /** +1 = D, -1 = Q. */
  yawAxis: number;
  lookDeltaX: number;
  lookDeltaY: number;
  /**
   * `false` en vue zoom : la souris pilote la tourelle, le manche se recentre
   * et l'appareil revient à plat en stationnaire.
   */
  attitudeControlEnabled: boolean;
}

export interface HelicopterState {
  altitudeAboveGround: number;
  /** Altitude monde tenue par le stationnaire. */
  holdAltitude: number;
  verticalSpeed: number;
  horizontalSpeed: number;
  forwardSpeed: number;
  grounded: boolean;
  /** Position du manche, -1..1. */
  stickRoll: number;
  stickPitch: number;
  yawInput: number;
  climbInput: number;
  /** Angle cumulé des rotors (rad) pour l'animation. */
  rotorAngleRad: number;
}

const AGL_RAY_LENGTH = 300;
/** Vitesse angulaire max de rattrapage d'assiette (rad/s) — évite les à-coups. */
const MAX_ATTITUDE_RATE = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return current + Math.sign(delta) * maxDelta;
}

/** Lissage exponentiel indépendant du framerate (0..1). */
function smoothFactor(sharpness: number, dt: number): number {
  return 1 - Math.exp(-Math.max(sharpness, 0) * dt);
}

/**
 * Vitesse angulaire monde ramenant `current` sur `target` en `1 / sharpness` seconde.
 */
function attitudeAngularVelocity(
  current: Quaternion,
  target: Quaternion,
  sharpness: number
): Vector3 {
  // Ordre monde : `current * delta = target` avec la convention vecteur-ligne de Babylon.
  let delta = Quaternion.Inverse(current).multiply(target);
  if (delta.w < 0) {
    // Chemin le plus court : -q représente la même rotation.
    delta = new Quaternion(-delta.x, -delta.y, -delta.z, -delta.w);
  }

  const sinHalf = Math.sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
  if (sinHalf < 1e-6) {
    return Vector3.Zero();
  }

  const angle = 2 * Math.atan2(sinHalf, delta.w);
  const rate = clamp(angle * sharpness, -MAX_ATTITUDE_RATE, MAX_ATTITUDE_RATE);
  return new Vector3(delta.x / sinHalf, delta.y / sinHalf, delta.z / sinHalf).scale(rate);
}

/**
 * Vol stationnaire arcade. L'appareil tient son altitude et son assiette tout
 * seul : Z / S décalent l'altitude tenue, Q / D commandent le lacet, et la
 * souris incline l'appareil — l'inclinaison produisant la translation, comme
 * sur un vrai hélicoptère.
 *
 * La gravité du rigidbody est neutralisée : la portance est entièrement portée
 * par le maintien d'altitude, ce qui évite au joueur de compenser en permanence.
 */
export class HelicopterModel {
  private readonly scene: Scene;
  private readonly body: PhysicsBody;
  private readonly anchor: TransformNode;
  private readonly config: HelicopterConfig;
  private readonly mass: number;
  private readonly noseLocal: Vector3;
  /**
   * Amène le nez du rig sur l'axe +Z canonique, seul repère dans lequel
   * `RotationYawPitchRoll` produit le cap / roulis / tangage attendus.
   */
  private readonly noseAlign: Quaternion;

  private stickRoll = 0;
  private stickPitch = 0;
  private yawInput = 0;
  private yawRateDeg = 0;
  private targetYawRad: number | null = null;
  private holdAltitude: number | null = null;
  private rotorAngleRad = 0;
  private state: HelicopterState;

  public constructor(options: HelicopterModelOptions) {
    this.scene = options.scene;
    this.body = options.body;
    this.anchor = options.anchor;
    this.config = options.config;
    this.mass = Math.max(options.mass, 0.1);
    this.noseLocal = options.noseLocal.clone().normalize();
    this.noseAlign = Quaternion.RotationAxis(
      Axis.Y,
      Math.atan2(-this.noseLocal.x, this.noseLocal.z)
    );
    this.body.setGravityFactor(0);
    this.state = {
      altitudeAboveGround: 0,
      holdAltitude: 0,
      verticalSpeed: 0,
      horizontalSpeed: 0,
      forwardSpeed: 0,
      grounded: true,
      stickRoll: 0,
      stickPitch: 0,
      yawInput: 0,
      climbInput: 0,
      rotorAngleRad: 0
    };
  }

  public getState(): HelicopterState {
    return this.state;
  }

  public reset(): void {
    this.stickRoll = 0;
    this.stickPitch = 0;
    this.yawInput = 0;
    this.yawRateDeg = 0;
    this.targetYawRad = null;
    this.holdAltitude = null;
    this.body.setGravityFactor(0);
  }

  public update(
    input: HelicopterInputFrame,
    grounded: boolean,
    powered: boolean,
    dt: number
  ): HelicopterState {
    if (dt <= 0) {
      return this.state;
    }

    const position = this.anchor.getAbsolutePosition();
    const altitude = this.measureAltitudeAboveGround();
    const velocity = this.body.getLinearVelocity();

    const nose = this.anchor.getDirection(this.noseLocal);
    nose.normalize();

    // Repère horizontal stabilisé : la translation ne dépend pas du roulis courant.
    const flatNose = new Vector3(nose.x, 0, nose.z);
    if (flatNose.lengthSquared() > 1e-6) {
      flatNose.normalize();
    } else {
      flatNose.copyFrom(Axis.Z);
    }
    // Scène en main droite : le flanc droit est `nez × haut`.
    const flatRight = Vector3.Cross(flatNose, Axis.Y).normalize();

    this.updateStick(input, powered, dt);
    this.updateRotors(powered, dt);

    const targetVy = this.resolveTargetVerticalSpeed(input, position, altitude, grounded, powered);
    this.applyVelocityImpulse(velocity, targetVy, flatNose, flatRight, powered, dt);
    this.applyAttitude(nose, input, powered, dt);

    const nextVelocity = this.body.getLinearVelocity();
    const horizontal = new Vector3(nextVelocity.x, 0, nextVelocity.z);

    this.state = {
      altitudeAboveGround: altitude,
      holdAltitude: this.holdAltitude ?? position.y,
      verticalSpeed: nextVelocity.y,
      horizontalSpeed: horizontal.length(),
      forwardSpeed: Vector3.Dot(nextVelocity, flatNose),
      grounded,
      stickRoll: this.stickRoll,
      stickPitch: this.stickPitch,
      yawInput: this.yawInput,
      climbInput: clamp(input.climbAxis, -1, 1),
      rotorAngleRad: this.rotorAngleRad
    };
    return this.state;
  }

  /** Manche virtuel à la souris ; recentrage automatique dès que le joueur lâche. */
  private updateStick(input: HelicopterInputFrame, powered: boolean, dt: number): void {
    const cfg = this.config;

    if (input.attitudeControlEnabled && powered) {
      const rollDelta = input.lookDeltaX * (cfg.invertRollAxis ? -1 : 1);
      const pitchDelta = input.lookDeltaY * (cfg.invertPitchAxis ? -1 : 1);
      this.stickRoll = clamp(this.stickRoll + rollDelta * cfg.stickRollPerPixel, -1, 1);
      this.stickPitch = clamp(this.stickPitch + pitchDelta * cfg.stickPitchPerPixel, -1, 1);
    }

    // En zoom (ou batterie vide) le manche revient au neutre : retour au stationnaire.
    const returnRate = input.attitudeControlEnabled
      ? cfg.stickReturnPerSecond
      : Math.max(cfg.stickReturnPerSecond, 2.5);
    if (returnRate > 0) {
      this.stickRoll = moveTowards(this.stickRoll, 0, returnRate * dt);
      this.stickPitch = moveTowards(this.stickPitch, 0, returnRate * dt);
    }
  }

  private updateRotors(powered: boolean, dt: number): void {
    const cfg = this.config;
    const speedDeg = powered ? cfg.rotorSpeedDeg ?? 1440 : cfg.rotorIdleSpeedDeg ?? 0;
    this.rotorAngleRad = (this.rotorAngleRad + toRadians(speedDeg) * dt) % (Math.PI * 2);
  }

  /**
   * Maintien d'altitude : sans commande, l'altitude tenue est figée et un
   * ressort y ramène l'appareil. Z / S déplacent simplement la consigne.
   */
  private resolveTargetVerticalSpeed(
    input: HelicopterInputFrame,
    position: Vector3,
    altitude: number,
    grounded: boolean,
    powered: boolean
  ): number {
    const cfg = this.config;

    if (!powered) {
      // Batterie vide : descente lente au lieu d'un stationnaire figé.
      this.holdAltitude = null;
      return -cfg.climbSpeed * 0.5;
    }

    if (this.holdAltitude === null) {
      this.holdAltitude = position.y;
    }

    const climbAxis = clamp(input.climbAxis, -1, 1);
    if (climbAxis !== 0) {
      // Commande active : la consigne suit l'appareil, donc pas d'effet ressort.
      this.holdAltitude = position.y;
      if (climbAxis < 0 && grounded && altitude <= cfg.groundHoverHeight) {
        return 0;
      }
      return climbAxis * cfg.climbSpeed;
    }

    if (grounded && altitude <= cfg.groundHoverHeight) {
      // Posé : on garde l'appareil au sol plutôt que de le faire vibrer.
      this.holdAltitude = position.y;
      return 0;
    }

    const error = this.holdAltitude - position.y;
    return clamp(error * cfg.altitudeHoldSharpness, -cfg.climbSpeed, cfg.climbSpeed);
  }

  /**
   * Une seule impulsion pour les trois axes : la vitesse est amenée vers la
   * consigne sans être écrasée, ce qui laisse les collisions agir normalement.
   */
  private applyVelocityImpulse(
    velocity: Vector3,
    targetVy: number,
    flatNose: Vector3,
    flatRight: Vector3,
    powered: boolean,
    dt: number
  ): void {
    const cfg = this.config;
    const horizontal = new Vector3(velocity.x, 0, velocity.z);

    if (powered) {
      // L'inclinaison porte la translation : nez piqué => avant, roulis droit => droite.
      const accel = flatNose
        .scale(-this.stickPitch * cfg.translationAccel)
        .add(flatRight.scale(this.stickRoll * cfg.translationAccel));
      horizontal.addInPlace(accel.scale(dt));
    }

    // Traînée : manche neutre => l'appareil retrouve le stationnaire.
    horizontal.scaleInPlace(1 - smoothFactor(cfg.horizontalDrag, dt));

    const speed = horizontal.length();
    if (speed > cfg.maxHorizontalSpeed && speed > 1e-5) {
      horizontal.scaleInPlace(cfg.maxHorizontalSpeed / speed);
    }

    const verticalBlend = smoothFactor(cfg.verticalDamping, dt);
    const deltaV = new Vector3(
      horizontal.x - velocity.x,
      (targetVy - velocity.y) * verticalBlend,
      horizontal.z - velocity.z
    );
    if (deltaV.lengthSquared() < 1e-10) {
      return;
    }
    this.body.applyImpulse(deltaV.scale(this.mass), this.body.getObjectCenterWorld());
  }

  /**
   * Assiette pilotée en vitesse angulaire : lacet intégré depuis Q / D, roulis
   * et tangage directement issus du manche. L'appareil ne part jamais en vrille.
   */
  private applyAttitude(
    nose: Vector3,
    input: HelicopterInputFrame,
    powered: boolean,
    dt: number
  ): void {
    const cfg = this.config;

    const commandedYaw = powered ? clamp(input.yawAxis, -1, 1) : 0;
    this.yawInput = commandedYaw;
    this.yawRateDeg +=
      (commandedYaw * cfg.yawSpeedDeg - this.yawRateDeg) * smoothFactor(cfg.yawSharpness, dt);

    if (this.targetYawRad === null) {
      this.targetYawRad = Math.atan2(nose.x, nose.z);
    }
    this.targetYawRad += toRadians(this.yawRateDeg) * dt;

    // Dans le repère aligné sur le nez, un tangage positif pique le nez : le
    // manche tiré (stickPitch > 0) doit donc produire un tangage négatif.
    const targetRollRad = powered ? toRadians(this.stickRoll * cfg.maxBankDeg) : 0;
    const targetPitchRad = powered ? toRadians(-this.stickPitch * cfg.maxPitchDeg) : 0;
    const target = Quaternion.RotationYawPitchRoll(
      this.targetYawRad,
      targetPitchRad,
      targetRollRad
    ).multiply(this.noseAlign);

    const current =
      this.anchor.absoluteRotationQuaternion ??
      this.anchor.rotationQuaternion ??
      Quaternion.Identity();
    this.body.setAngularVelocity(attitudeAngularVelocity(current, target, cfg.attitudeSharpness));
  }

  private measureAltitudeAboveGround(): number {
    const engine = this.scene.getPhysicsEngine();
    if (!engine) {
      return AGL_RAY_LENGTH;
    }

    const from = this.anchor.getAbsolutePosition();
    const to = from.add(Axis.Y.scale(-AGL_RAY_LENGTH));
    const hit = engine.raycast(from, to, {
      ignoreBody: this.body,
      shouldHitTriggers: false,
      collideWith: 0xffffffff
    });
    if (!hit.hasHit) {
      return AGL_RAY_LENGTH;
    }

    hit.calculateHitDistance();
    const distance = hit.hitDistance;
    if (Number.isFinite(distance)) {
      return distance;
    }
    return hit.hitPointWorld ? Vector3.Distance(from, hit.hitPointWorld) : AGL_RAY_LENGTH;
  }
}
