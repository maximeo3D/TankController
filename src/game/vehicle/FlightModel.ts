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

    this.updateControls(input, powered, dt);

    const velocity = this.body.getLinearVelocity();
    const airspeed = velocity.length();
    const forwardSpeed = Vector3.Dot(velocity, nose);
    const altitude = this.measureAltitudeAboveGround();
    const angleOfAttack = this.measureAngleOfAttack(velocity, up, airspeed);
    const stallAngle = toRadians(cfg.stallAngleDeg);
    const stalling = airspeed > 1 && Math.abs(angleOfAttack) > stallAngle;

    const center = this.body.getObjectCenterWorld();
    this.applyThrust(nose, center, input.boostHeld, powered);
    this.applyAerodynamics(velocity, nose, up, right, center, forwardSpeed, angleOfAttack, grounded);
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
  private updateControls(input: FlightInputFrame, powered: boolean, dt: number): void {
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

    // Souris vers le haut = `movementY` négatif = manche poussé = nez à piquer.
    this.stickPitch = clamp(this.stickPitch + input.lookDeltaY * cfg.stickPitchPerPixel, -1, 1);
    this.stickRoll = clamp(this.stickRoll + input.lookDeltaX * cfg.stickRollPerPixel, -1, 1);

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
    const positiveForward = Math.max(forwardSpeed, 0);
    const stallAngle = toRadians(cfg.stallAngleDeg);
    const excess = Math.max(Math.abs(angleOfAttack) - stallAngle, 0);
    const stallFactor = excess <= 0 ? 1 : Math.max(0.15, 1 - excess / stallAngle);
    const lift = clamp(
      cfg.liftPerSpeedSquared * positiveForward * positiveForward * stallFactor,
      0,
      cfg.maxLiftForce
    );
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
