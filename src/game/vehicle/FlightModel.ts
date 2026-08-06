import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { FlightConfig } from "../../config/tankController";

export interface FlightModelOptions {
  scene: Scene;
  body: PhysicsBody;
  anchor: TransformNode;
  config: FlightConfig;
  /** Masse du rigidbody (kg) pour l'assistance arcade. */
  mass: number;
  /** Direction du nez dans l'espace local du châssis (unitaire). */
  noseLocal: Vector3;
}

export interface FlightInputFrame {
  /** +1 = Z (gaz), -1 = S (réduction / frein au sol). */
  throttleAxis: number;
  /** +1 = D, -1 = Q. */
  yawAxis: number;
  lookDeltaX: number;
  lookDeltaY: number;
  boostHeld: boolean;
}

/** Lecture de l'état de vol destinée au HUD, aux gouvernes et au son. */
export interface FlightState {
  throttle: number;
  afterburner: boolean;
  airspeed: number;
  forwardSpeed: number;
  altitudeAboveGround: number;
  angleOfAttackDeg: number;
  stalling: boolean;
  grounded: boolean;
  /** Position du manche, -1..1 (tangage positif = nez à cabrer). */
  stickPitch: number;
  stickRoll: number;
  yawInput: number;
  /** 0 = train rentré, 1 = train sorti. */
  gearExtension: number;
}

const UP_LOCAL = new Vector3(0, 1, 0);
const AGL_RAY_LENGTH = 80;

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

/** Mélanges altitude / vitesse pour l'atterrissage vs passes rapides en rase-mottes. */
export interface LowAltitudeFlightBlends {
  altitudeBlend: number;
  speedBlend: number;
  /** 1 = bas et lent (mode atterrissage). */
  landingBlend: number;
  /** 1 = haute altitude ou vitesse élevée (assistance croisière). */
  cruiseAssistBlend: number;
}

export function resolveLowAltitudeFlightBlends(
  altitude: number,
  airspeed: number,
  deployHeight: number,
  lowSpeed: number,
  highSpeed: number
): LowAltitudeFlightBlends {
  const altitudeBlend = clamp((altitude - deployHeight) / Math.max(deployHeight, 0.1), 0, 1);
  const speedBlend = clamp((airspeed - lowSpeed) / Math.max(highSpeed - lowSpeed, 0.1), 0, 1);
  const landingBlend = (1 - altitudeBlend) * (1 - speedBlend);
  const cruiseAssistBlend = Math.max(altitudeBlend, speedBlend);
  return { altitudeBlend, speedBlend, landingBlend, cruiseAssistBlend };
}

/**
 * Modèle de vol arcade : poussée dans l'axe, portance le long du plan de
 * symétrie, traînée séparée en trois axes et gouvernes pilotées en couple. Le
 * corps physique reste libre de tourner sur les trois axes ; l'assiette de
 * l'appareil est donc directement celle du rigidbody, sans redressement forcé.
 */
export class FlightModel {
  private readonly scene: Scene;
  private readonly body: PhysicsBody;
  private readonly anchor: TransformNode;
  private readonly config: FlightConfig;
  private readonly mass: number;
  private readonly noseLocal: Vector3;

  private throttle: number;
  private stickPitch = 0;
  private stickRoll = 0;
  private yawInput = 0;
  private gearExtension: number;
  private state: FlightState;

  public constructor(options: FlightModelOptions) {
    this.scene = options.scene;
    this.body = options.body;
    this.anchor = options.anchor;
    this.config = options.config;
    this.mass = Math.max(options.mass, 0.1);
    this.noseLocal = options.noseLocal.clone().normalize();
    this.throttle = clamp(this.config.idleThrottle, 0, 1);
    this.gearExtension = this.config.gear.deployedAtSpawn ? 1 : 0;
    this.state = {
      throttle: this.throttle,
      afterburner: false,
      airspeed: 0,
      forwardSpeed: 0,
      altitudeAboveGround: 0,
      angleOfAttackDeg: 0,
      stalling: false,
      grounded: true,
      stickPitch: 0,
      stickRoll: 0,
      yawInput: 0,
      gearExtension: this.gearExtension
    };
  }

  public getState(): FlightState {
    return this.state;
  }

  public reset(): void {
    this.throttle = clamp(this.config.idleThrottle, 0, 1);
    this.stickPitch = 0;
    this.stickRoll = 0;
    this.yawInput = 0;
    this.gearExtension = this.config.gear.deployedAtSpawn ? 1 : 0;
  }

  public update(input: FlightInputFrame, grounded: boolean, powered: boolean, dt: number): FlightState {
    if (dt <= 0) {
      return this.state;
    }

    const cfg = this.config;
    const altitude = this.measureAltitudeAboveGround();
    const nose = this.anchor.getDirection(this.noseLocal);
    nose.normalize();
    const up = this.anchor.getDirection(UP_LOCAL);
    up.normalize();
    const right = Vector3.Cross(up, nose);
    if (right.lengthSquared() > 1e-8) {
      right.normalize();
    } else {
      right.copyFrom(Axis.X);
    }

    this.updateControls(input, powered, grounded, altitude, dt);

    const velocity = this.body.getLinearVelocity();
    const airspeed = velocity.length();
    const forwardSpeed = Vector3.Dot(velocity, nose);
    const angleOfAttack = this.measureAngleOfAttack(velocity, up, airspeed);
    const stallAngle = toRadians(cfg.stallAngleDeg);
    const stalling = airspeed > 1 && Math.abs(angleOfAttack) > stallAngle;

    const center = this.body.getObjectCenterWorld();
    this.applyThrust(nose, center, input.boostHeld, powered);
    this.applyAerodynamics(
      velocity,
      nose,
      up,
      right,
      center,
      forwardSpeed,
      angleOfAttack,
      grounded
    );
    this.applyArcadeFlightAssist(velocity, nose, up, center, grounded, altitude, dt);
    this.applyControlTorques(nose, up, right, airspeed, dt);
    this.applyTaxiForces(velocity, center, input.throttleAxis, grounded);
    this.updateGear(airspeed, altitude, grounded, dt);

    this.state = {
      throttle: this.throttle,
      afterburner: input.boostHeld && this.throttle > 0.6,
      airspeed,
      forwardSpeed,
      altitudeAboveGround: altitude,
      angleOfAttackDeg: (angleOfAttack * 180) / Math.PI,
      stalling,
      grounded,
      stickPitch: this.stickPitch,
      stickRoll: this.stickRoll,
      yawInput: this.yawInput,
      gearExtension: this.gearExtension
    };
    return this.state;
  }

  /** Manette des gaz au clavier, manche virtuel à la souris, palonnier sur Q/D. */
  private updateControls(
    input: FlightInputFrame,
    powered: boolean,
    grounded: boolean,
    altitude: number,
    dt: number
  ): void {
    const cfg = this.config;
    if (!powered) {
      this.throttle = moveTowards(this.throttle, 0, cfg.throttleRatePerSecond * dt);
    } else if (input.throttleAxis !== 0) {
      this.throttle = clamp(
        this.throttle + input.throttleAxis * cfg.throttleRatePerSecond * dt,
        0,
        1
      );
    }

    if (!grounded) {
      const maxAirspeed = cfg.maxAirspeed ?? 0;
      const minRatio = cfg.minAirspeedRatio ?? 0.2;
      const cruiseMin =
        cfg.minAirspeed ?? (maxAirspeed > 0 ? maxAirspeed * minRatio : 0);
      const airspeed = this.body.getLinearVelocity().length();
      const { landingBlend } = resolveLowAltitudeFlightBlends(
        altitude,
        airspeed,
        cfg.gear.deployHeight,
        cfg.gear.deploySpeed,
        cfg.gear.retractSpeed
      );
      const canSlowBelowMin = landingBlend > 0.35;

      if (!canSlowBelowMin && cruiseMin > 0 && maxAirspeed > 0) {
        const minThrottle = cruiseMin / maxAirspeed;
        this.throttle = Math.max(this.throttle, minThrottle);
      }
    }

    // Convention manche : souris vers le bas = manche tiré = nez à cabrer.
    const pitchDelta = input.lookDeltaY * (cfg.invertPitchAxis ? -1 : 1);
    const rollDelta = input.lookDeltaX * (cfg.invertRollAxis ? -1 : 1);
    this.stickPitch = clamp(this.stickPitch + pitchDelta * cfg.stickPitchPerPixel, -1, 1);
    this.stickRoll = clamp(this.stickRoll + rollDelta * cfg.stickRollPerPixel, -1, 1);

    const centering = cfg.stickReturnPerSecond * dt;
    if (centering > 0) {
      this.stickPitch = moveTowards(this.stickPitch, 0, centering);
      this.stickRoll = moveTowards(this.stickRoll, 0, centering);
    }

    this.yawInput = clamp(input.yawAxis, -1, 1);
  }

  private applyThrust(nose: Vector3, center: Vector3, boostHeld: boolean, powered: boolean): void {
    if (!powered || this.throttle <= 0) {
      return;
    }
    const cfg = this.config;
    const multiplier = boostHeld && this.throttle > 0.6 ? cfg.afterburnerMultiplier : 1;
    this.body.applyForce(nose.scale(this.throttle * cfg.maxThrustForce * multiplier), center);
  }

  /**
   * Portance le long du plan de symétrie (elle bascule donc avec l'appareil, ce
   * qui fait virer en s'inclinant), traînée décomposée dans les trois axes de
   * l'appareil pour tuer le dérapage sans figer la trajectoire.
   */
  private applyAerodynamics(
    velocity: Vector3,
    nose: Vector3,
    up: Vector3,
    right: Vector3,
    center: Vector3,
    forwardSpeed: number,
    angleOfAttack: number,
    grounded: boolean
  ): void {
    const cfg = this.config;
    if (!grounded) {
      // En vol arcade la portance « physique » est remplacée par l'assistance verticale.
      const drag = cfg.dragPerSpeedSquared * forwardSpeed * Math.abs(forwardSpeed);
      const lateralSpeed = Vector3.Dot(velocity, right);
      const verticalSpeed = Vector3.Dot(velocity, up);
      const resistance = nose
        .scale(-drag)
        .add(right.scale(-lateralSpeed * cfg.lateralDragPerSpeed))
        .add(up.scale(-verticalSpeed * cfg.verticalDragPerSpeed * 0.35));
      this.body.applyForce(resistance, center);
      return;
    }

    const positiveForward = Math.max(forwardSpeed, 0);
    const stallAngle = toRadians(cfg.stallAngleDeg);
    const excess = Math.max(Math.abs(angleOfAttack) - stallAngle, 0);
    const stallFactor = excess <= 0 ? 1 : Math.max(0.5, 1 - excess / (stallAngle * 1.5));
    const speedLift = cfg.liftPerSpeedSquared * positiveForward * positiveForward * stallFactor;
    const baselineLift =
      !grounded && cfg.baselineLift && cfg.baselineLift > 0
        ? cfg.baselineLift * this.throttle
        : 0;
    const lift = clamp(speedLift + baselineLift, 0, cfg.maxLiftForce);
    if (lift > 0) {
      this.body.applyForce(up.scale(lift), center);
    }

    const drag = cfg.dragPerSpeedSquared * forwardSpeed * Math.abs(forwardSpeed);
    const lateralSpeed = Vector3.Dot(velocity, right);
    const verticalSpeed = Vector3.Dot(velocity, up);
    const lateralScale = grounded ? 3 : 1;
    const resistance = nose
      .scale(-drag)
      .add(right.scale(-lateralSpeed * cfg.lateralDragPerSpeed * lateralScale))
      .add(up.scale(-verticalSpeed * cfg.verticalDragPerSpeed));
    this.body.applyForce(resistance, center);
  }

  /** Vol arcade : plancher de vitesse, anti-chute, plafond et alignement trajectoire. */
  private applyArcadeFlightAssist(
    velocity: Vector3,
    nose: Vector3,
    up: Vector3,
    center: Vector3,
    grounded: boolean,
    altitude: number,
    dt: number
  ): void {
    if (grounded) {
      return;
    }

    const cfg = this.config;
    const maxAirspeed = cfg.maxAirspeed ?? 0;
    if (maxAirspeed <= 0) {
      return;
    }

    const minRatio = cfg.minAirspeedRatio ?? 0.2;
    const cruiseMin = cfg.minAirspeed ?? maxAirspeed * minRatio;
    const deployHeight = cfg.gear.deployHeight;
    const airspeed = velocity.length();
    const { landingBlend, cruiseAssistBlend } = resolveLowAltitudeFlightBlends(
      altitude,
      airspeed,
      deployHeight,
      cfg.gear.deploySpeed,
      cfg.gear.retractSpeed
    );
    const canSlowBelowMin = landingBlend > 0.35;
    /** 0 = bas et lent (atterrissage), 1 = haute altitude ou passe rapide en rase-mottes. */
    const arcadeBlend = cruiseAssistBlend;
    const forwardSpeed = Vector3.Dot(velocity, nose);
    const gravity = 9.81 * (cfg.gravityScale ?? 1);
    const weight = this.mass * gravity;

    const vertDamp = cfg.arcadeVerticalDamping ?? 14;
    const stickMag = clamp(Math.abs(this.stickPitch), 0, 1);
    const levelAssist = 0.95 * arcadeBlend * (1 - stickMag * 0.92);
    const dampScale = 0.25 + 0.75 * arcadeBlend;
    const vertForce = weight * levelAssist - velocity.y * this.mass * vertDamp * dampScale;
    this.body.applyForce(Axis.Y.scale(vertForce), center);

    const pitchLiftGain = cfg.arcadePitchLift ?? 20;
    if (arcadeBlend > 0.1 && forwardSpeed > 0.5 && pitchLiftGain > 0) {
      const noseClimb = Math.max(Vector3.Dot(nose, Axis.Y), 0);
      const stickClimb = Math.max(this.stickPitch, 0);
      const liftAlongUp =
        (noseClimb * 0.7 + stickClimb * 0.3) * forwardSpeed * pitchLiftGain * arcadeBlend;
      if (liftAlongUp > 0) {
        this.body.applyForce(up.scale(liftAlongUp), center);
      }
    }

    const slipDrag = cfg.arcadeSlipDrag ?? 24;
    if (slipDrag > 0 && arcadeBlend > 0.05 && airspeed > 0.5) {
      const alongNose = nose.scale(forwardSpeed);
      const slip = velocity.subtract(alongNose);
      this.body.applyForce(slip.scale(-this.mass * slipDrag * arcadeBlend), center);
    }

    if (arcadeBlend > 0 && !canSlowBelowMin && forwardSpeed < cruiseMin) {
      const deficit = cruiseMin - forwardSpeed;
      const hold = cfg.minAirspeedHold ?? 16;
      this.body.applyForce(nose.scale(deficit * hold), center);
    }

    if (airspeed > 1e-3 && maxAirspeed > 0 && airspeed > maxAirspeed * 0.88) {
      const softStart = maxAirspeed * 0.88;
      const excess = airspeed - softStart;
      const range = Math.max(maxAirspeed - softStart, 0.01);
      const t = clamp(excess / range, 0, 1);
      const dragGain = cfg.maxAirspeedDrag ?? 10;
      this.body.applyForce(
        velocity.scale(1 / airspeed).scale(-excess * dragGain * t),
        center
      );
    }

    const stickBoost = 1 + stickMag * 2.5 + Math.abs(this.stickRoll) * 0.6;
    const alignRate = (cfg.arcadeVelocityAlign ?? 1.4) * arcadeBlend * stickBoost;
    if (alignRate > 0 && airspeed > 0.5) {
      const targetSpeed = canSlowBelowMin
        ? Math.max(forwardSpeed, 0)
        : Math.max(forwardSpeed, cruiseMin);
      const targetVelocity = nose.scale(targetSpeed);
      const delta = targetVelocity.subtract(velocity);
      this.body.applyForce(delta.scale(this.mass * alignRate), center);
    }

    const stickNeutral =
      Math.abs(this.stickPitch) + Math.abs(this.stickRoll) + Math.abs(this.yawInput) < 0.1;
    if (stickNeutral) {
      const angDamp = cfg.arcadeAngularDamping ?? 5;
      const angVel = this.body.getAngularVelocity();
      this.body.applyAngularImpulse(angVel.scale(-angDamp * dt));
    }
  }

  /**
   * Les gouvernes n'ont d'autorité qu'avec du vent relatif : à l'arrêt le manche
   * ne fait presque rien, ce qui impose de prendre de la vitesse avant de cabrer.
   */
  private applyControlTorques(
    nose: Vector3,
    up: Vector3,
    right: Vector3,
    airspeed: number,
    dt: number
  ): void {
    const cfg = this.config;
    const authority = clamp(
      cfg.controlAuthorityMin +
        (1 - cfg.controlAuthorityMin) * (airspeed / Math.max(cfg.controlAuthorityRefSpeed, 0.1)),
      cfg.controlAuthorityMin,
      1
    );

    const torque = right
      .scale(this.stickPitch * cfg.pitchTorque * cfg.pitchSign * authority)
      .add(nose.scale(this.stickRoll * cfg.rollTorque * cfg.rollSign * authority))
      .add(up.scale(this.yawInput * cfg.yawTorque * cfg.yawSign * authority));

    if (cfg.levelAssistTorque > 0 && Math.abs(this.stickRoll) < 0.05) {
      // `right.y` vaut le sinus de l'angle de gîte : couple de rappel vers l'horizontale.
      torque.addInPlace(nose.scale(-Vector3.Dot(right, Axis.Y) * cfg.levelAssistTorque * cfg.rollSign));
    }

    this.body.applyAngularImpulse(torque.scale(dt));
  }

  private applyTaxiForces(
    velocity: Vector3,
    center: Vector3,
    throttleAxis: number,
    grounded: boolean
  ): void {
    if (!grounded) {
      return;
    }

    const cfg = this.config;
    const groundVelocity = new Vector3(velocity.x, 0, velocity.z);
    const groundSpeed = groundVelocity.length();
    if (groundSpeed < 1e-3) {
      return;
    }

    const direction = groundVelocity.scale(1 / groundSpeed);
    let force = groundSpeed * cfg.taxiDragPerSpeed;
    if (throttleAxis < 0 && this.throttle <= 1e-3) {
      force += cfg.taxiBrakeForce;
    }
    this.body.applyForce(direction.scale(-force), center);
  }

  /**
   * Sortie du train seulement à basse vitesse et près du sol ; la plage entre
   * `deploySpeed` et `retractSpeed` sert d'hystérésis pour éviter le battement.
   */
  private updateGear(airspeed: number, altitude: number, grounded: boolean, dt: number): void {
    const gear = this.config.gear;
    let target = this.gearExtension >= 0.5 ? 1 : 0;
    if (grounded) {
      target = 1;
    } else if (airspeed <= gear.deploySpeed && altitude <= gear.deployHeight) {
      target = 1;
    } else if (airspeed >= gear.retractSpeed || altitude > gear.deployHeight) {
      target = 0;
    }

    const rate = dt / Math.max(gear.travelSeconds, 1e-3);
    this.gearExtension = moveTowards(this.gearExtension, target, rate);
  }

  /** Incidence signée : positive quand le nez pointe au-dessus de la trajectoire. */
  private measureAngleOfAttack(velocity: Vector3, up: Vector3, airspeed: number): number {
    if (airspeed < 0.5) {
      return 0;
    }
    const direction = velocity.scale(1 / airspeed);
    return Math.asin(clamp(-Vector3.Dot(direction, up), -1, 1));
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
