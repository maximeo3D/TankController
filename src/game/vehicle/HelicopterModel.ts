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

/** Cap horizontal (monde) à partir du lacet intégré. */
function flatBasisFromYaw(yawRad: number): { forward: Vector3; right: Vector3 } {
  const forward = new Vector3(Math.sin(yawRad), 0, Math.cos(yawRad));
  if (forward.lengthSquared() < 1e-6) {
    forward.copyFrom(Axis.Z);
  } else {
    forward.normalize();
  }
  const right = Vector3.Cross(forward, Axis.Y);
  if (right.lengthSquared() > 1e-6) {
    right.normalize();
  } else {
    right.copyFrom(Axis.X);
  }
  return { forward, right };
}

/** Lacet horizontal initial depuis l'orientation courante du rig. */
function readFlatYawRad(anchor: TransformNode, noseLocal: Vector3): number {
  const nose = anchor.getDirection(noseLocal);
  const flat = new Vector3(nose.x, 0, nose.z);
  if (flat.lengthSquared() < 1e-6) {
    return 0;
  }
  flat.normalize();
  return Math.atan2(flat.x, flat.z);
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
  /** Dernière assiette commandée — réappliquée après la physique si Havok dérive. */
  private commandedRotation: Quaternion | null = null;
  private state: HelicopterState;

  public constructor(options: HelicopterModelOptions) {
    this.scene = options.scene;
    this.body = options.body;
    this.anchor = options.anchor;
    this.config = options.config;
    this.noseLocal = options.noseLocal.clone().normalize();
    this.noseAlign = Quaternion.RotationAxis(
      Axis.Y,
      Math.atan2(-this.noseLocal.x, this.noseLocal.z)
    );
    this.body.setGravityFactor(0);
    this.targetYawRad = readFlatYawRad(this.anchor, this.noseLocal);
    this.commandedRotation = this.buildTargetRotation(0, 0);
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
    this.targetYawRad = readFlatYawRad(this.anchor, this.noseLocal);
    this.holdAltitude = null;
    this.body.setGravityFactor(0);
    this.commandedRotation = this.buildTargetRotation(0, 0);
    this.applyCommandedRotation(this.commandedRotation);
    this.body.setAngularVelocity(Vector3.Zero());
  }

  /** Réapplique l'assiette arcade après le pas Havok (collisions latérales). */
  public enforcePoseAfterPhysics(): void {
    if (!this.commandedRotation) {
      return;
    }
    this.applyCommandedRotation(this.commandedRotation);
    this.body.setAngularVelocity(Vector3.Zero());
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
    const yawRad = this.targetYawRad ?? readFlatYawRad(this.anchor, this.noseLocal);
    const { forward: flatNose, right: flatRight } = flatBasisFromYaw(yawRad);

    this.updateStick(input, powered, dt);
    this.updateRotors(powered, dt);

    const targetVy = this.resolveTargetVerticalSpeed(input, position, altitude, grounded, powered);
    this.applyVelocityImpulse(velocity, targetVy, flatNose, flatRight, powered, dt);
    this.applyAttitude(input, powered, dt);

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
   * Amène la vitesse vers la consigne sans impulsion brutale : les collisions
   * restent possibles mais ne font plus vriller l'appareil.
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
      const accel = flatNose
        .scale(-this.stickPitch * cfg.translationAccel)
        .add(flatRight.scale(this.stickRoll * cfg.translationAccel));
      horizontal.addInPlace(accel.scale(dt));
    }

    horizontal.scaleInPlace(1 - smoothFactor(cfg.horizontalDrag, dt));

    const speed = horizontal.length();
    if (speed > cfg.maxHorizontalSpeed && speed > 1e-5) {
      horizontal.scaleInPlace(cfg.maxHorizontalSpeed / speed);
    }

    const verticalBlend = smoothFactor(cfg.verticalDamping, dt);
    const nextVy = velocity.y + (targetVy - velocity.y) * verticalBlend;
    this.body.setLinearVelocity(new Vector3(horizontal.x, nextVy, horizontal.z));
  }

  private buildTargetRotation(pitchRad: number, rollRad: number): Quaternion {
    const yawRad = this.targetYawRad ?? 0;
    return Quaternion.RotationYawPitchRoll(yawRad, pitchRad, rollRad).multiply(this.noseAlign);
  }

  private applyCommandedRotation(rotation: Quaternion): void {
    this.anchor.rotationQuaternion ??= Quaternion.Identity();
    this.anchor.rotationQuaternion.copyFrom(rotation);
    this.anchor.computeWorldMatrix(true);
  }

  /**
   * Assiette pilotée en slerp direct : pas de couple Havok, donc pas de retournement
   * au décollage ni de tremblement une fois à l'envers.
   */
  private applyAttitude(input: HelicopterInputFrame, powered: boolean, dt: number): void {
    const cfg = this.config;

    const commandedYaw = powered ? clamp(input.yawAxis, -1, 1) : 0;
    this.yawInput = commandedYaw;
    this.yawRateDeg +=
      (commandedYaw * cfg.yawSpeedDeg - this.yawRateDeg) * smoothFactor(cfg.yawSharpness, dt);

    if (this.targetYawRad === null) {
      this.targetYawRad = readFlatYawRad(this.anchor, this.noseLocal);
    }
    this.targetYawRad += toRadians(this.yawRateDeg) * dt;

    const targetRollRad = powered ? toRadians(this.stickRoll * cfg.maxBankDeg) : 0;
    const targetPitchRad = powered ? toRadians(-this.stickPitch * cfg.maxPitchDeg) : 0;
    const target = this.buildTargetRotation(targetPitchRad, targetRollRad);

    const current =
      this.anchor.absoluteRotationQuaternion ??
      this.anchor.rotationQuaternion ??
      Quaternion.Identity();
    const blend = smoothFactor(cfg.attitudeSharpness, dt);
    const next = Quaternion.Slerp(current, target, blend);

    this.commandedRotation = next;
    this.applyCommandedRotation(next);
    this.body.setAngularVelocity(Vector3.Zero());
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
