import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AdvancedDynamicTexture, Control, Ellipse, Image, Rectangle } from "@babylonjs/gui";
import { mapPlayerIconUrl } from "../assets/assetUrls";

export interface RadarWorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  rotationDeg?: 0 | 90 | 180 | 270;
  flipX?: boolean;
  flipY?: boolean;
  zoom?: number;
}

export interface RadarTarget {
  id: string;
  position: Vector3;
  faction?: "enemy" | "ally";
}

interface RadarPingState {
  marker: Ellipse;
  position: Vector3;
  age: number;
  lastSweepAngle: number;
}

const RADAR_SIZE_PX = 330;
const RADAR_PADDING_PX = 20;
const SWEEP_SPEED_RAD_PER_SEC = (Math.PI * 2) / 3;
const SWEEP_HIT_ANGLE_RAD = 0.11;
const PING_LIFE_SECONDS = 1.35;
const WORLD_VIEW_RATIO = 0.34;
const SWEEP_REACH_PX = (RADAR_SIZE_PX * Math.SQRT2) / 2;

export class RadarHud {
  private readonly root: Rectangle;
  private readonly map: Image;
  private readonly sweep: Rectangle;
  private readonly playerMarker: Image;
  private readonly bounds: RadarWorldBounds;
  private readonly worldToPixelScale: number;
  private readonly mapWidthPx: number;
  private readonly mapHeightPx: number;
  private readonly rotationDeg: 0 | 90 | 180 | 270;
  private readonly flipX: boolean;
  private readonly flipY: boolean;
  private readonly pings = new Map<string, RadarPingState>();
  private sweepAngle = -Math.PI / 2;

  public constructor(texture: AdvancedDynamicTexture, mapUrl: string, bounds: RadarWorldBounds) {
    this.bounds = bounds;
    const worldWidth = Math.max(bounds.maxX - bounds.minX, 0.001);
    const worldHeight = Math.max(bounds.maxZ - bounds.minZ, 0.001);
    const zoom = Math.max(bounds.zoom ?? 1, 0.01);
    const viewWorldSize = (Math.max(worldWidth, worldHeight) * WORLD_VIEW_RATIO) / zoom;
    this.worldToPixelScale = RADAR_SIZE_PX / Math.max(viewWorldSize, 0.001);
    this.mapWidthPx = worldWidth * this.worldToPixelScale;
    this.mapHeightPx = worldHeight * this.worldToPixelScale;
    this.rotationDeg = bounds.rotationDeg ?? 0;
    this.flipX = bounds.flipX ?? false;
    this.flipY = bounds.flipY ?? false;

    const root = new Rectangle("radar_root");
    root.widthInPixels = RADAR_SIZE_PX;
    root.heightInPixels = RADAR_SIZE_PX;
    root.thickness = 1;
    root.cornerRadius = 5;
    root.color = "rgba(220, 225, 230, 0.75)";
    root.background = "rgba(28, 31, 34, 0.88)";
    root.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    root.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    root.leftInPixels = RADAR_PADDING_PX;
    root.topInPixels = -RADAR_PADDING_PX;
    root.clipChildren = true;
    root.isPointerBlocker = false;
    root.zIndex = 40;
    texture.addControl(root);
    this.root = root;

    const map = new Image("radar_map", mapUrl);
    map.widthInPixels = this.mapWidthPx;
    map.heightInPixels = this.mapHeightPx;
    map.stretch = Image.STRETCH_FILL;
    map.alpha = 0.82;
    map.isPointerBlocker = false;
    map.zIndex = 0;
    root.addControl(map);
    this.map = map;

    const sweep = new Rectangle("radar_sweep");
    sweep.widthInPixels = SWEEP_REACH_PX;
    sweep.heightInPixels = 3;
    sweep.thickness = 0;
    sweep.background = "rgba(255, 255, 255, 0.78)";
    sweep.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    sweep.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    sweep.leftInPixels = SWEEP_REACH_PX / 2;
    sweep.transformCenterX = 0;
    sweep.transformCenterY = 0.5;
    sweep.isPointerBlocker = false;
    sweep.zIndex = 4;
    root.addControl(sweep);
    this.sweep = sweep;

    const player = new Image("radar_player_arrow", mapPlayerIconUrl);
    player.widthInPixels = 24;
    player.heightInPixels = 24;
    player.stretch = Image.STRETCH_UNIFORM;
    player.isPointerBlocker = false;
    player.zIndex = 5;

    root.addControl(player);
    this.playerMarker = player;
  }

  public update(dt: number, playerPosition: Vector3, playerForward: Vector3, targets: RadarTarget[]): void {
    this.sweepAngle = normalizeRad(this.sweepAngle + SWEEP_SPEED_RAD_PER_SEC * dt);
    this.sweep.rotation = this.sweepAngle;
    this.updateMapPosition(playerPosition);

    this.placeControl(this.playerMarker, RADAR_SIZE_PX / 2, RADAR_SIZE_PX / 2);
    this.playerMarker.rotation = this.getRadarDirectionRotation(playerPosition, playerForward);

    for (const target of targets) {
      const point = this.worldToCenteredRadar(target.position, playerPosition);
      if (!isPointVisible(point.x, point.y)) {
        continue;
      }
      const targetAngle = Math.atan2(point.y - RADAR_SIZE_PX / 2, point.x - RADAR_SIZE_PX / 2);
      if (Math.abs(shortestAngleDelta(this.sweepAngle, targetAngle)) <= SWEEP_HIT_ANGLE_RAD) {
        this.triggerPing(target.id, target.position, point.x, point.y, target.faction);
      }
    }

    for (const [id, ping] of this.pings) {
      ping.age += dt;
      if (ping.age >= PING_LIFE_SECONDS) {
        ping.marker.dispose();
        this.pings.delete(id);
        continue;
      }

      const fade = 1 - ping.age / PING_LIFE_SECONDS;
      ping.marker.alpha = fade;
      const size = 10 + (1 - fade) * 12;
      ping.marker.widthInPixels = size;
      ping.marker.heightInPixels = size;
      const point = this.worldToCenteredRadar(ping.position, playerPosition);
      this.placeControl(ping.marker, point.x, point.y);
    }
  }

  public dispose(): void {
    for (const ping of this.pings.values()) {
      ping.marker.dispose();
    }
    this.pings.clear();
    this.root.dispose();
  }

  private triggerPing(
    id: string,
    position: Vector3,
    x: number,
    y: number,
    faction: RadarTarget["faction"] = "enemy"
  ): void {
    let ping = this.pings.get(id);
    const wasNew = !ping;
    if (!ping) {
      const marker = new Ellipse(`radar_ping_${id}`);
      marker.widthInPixels = 10;
      marker.heightInPixels = 10;
      marker.thickness = 2;
      const style = radarPingStyle(faction);
      marker.color = style.color;
      marker.background = style.background;
      marker.isPointerBlocker = false;
      marker.zIndex = 3;
      this.root.addControl(marker);
      ping = { marker, position: position.clone(), age: 0, lastSweepAngle: this.sweepAngle };
      this.pings.set(id, ping);
    }

    if (!wasNew && Math.abs(shortestAngleDelta(this.sweepAngle, ping.lastSweepAngle)) < SWEEP_HIT_ANGLE_RAD * 0.5) {
      return;
    }

    ping.age = 0;
    ping.lastSweepAngle = this.sweepAngle;
    ping.position.copyFrom(position);
    this.placeControl(ping.marker, x, y);
  }

  private placeControl(control: Control, x: number, y: number): void {
    control.leftInPixels = x - RADAR_SIZE_PX / 2;
    control.topInPixels = y - RADAR_SIZE_PX / 2;
  }

  private updateMapPosition(playerPosition: Vector3): void {
    const playerMapPoint = this.worldToMapPixel(playerPosition);
    const mapLeft = RADAR_SIZE_PX / 2 - playerMapPoint.x;
    const mapTop = RADAR_SIZE_PX / 2 - playerMapPoint.y;
    this.placeSizedControl(this.map, mapLeft, mapTop, this.mapWidthPx, this.mapHeightPx);
  }

  private worldToCenteredRadar(pos: Vector3, playerPosition: Vector3): { x: number; y: number } {
    const target = this.worldToMapPixel(pos);
    const player = this.worldToMapPixel(playerPosition);
    return {
      x: RADAR_SIZE_PX / 2 + (target.x - player.x),
      y: RADAR_SIZE_PX / 2 + (target.y - player.y)
    };
  }

  private worldToMapPixel(pos: Vector3): { x: number; y: number } {
    const width = Math.max(this.bounds.maxX - this.bounds.minX, 0.001);
    const height = Math.max(this.bounds.maxZ - this.bounds.minZ, 0.001);
    let nx = (pos.x - this.bounds.minX) / width;
    let ny = (this.bounds.maxZ - pos.z) / height;

    if (this.flipX) {
      nx = 1 - nx;
    }
    if (this.flipY) {
      ny = 1 - ny;
    }

    const rotated = rotateNormalizedPoint(nx, ny, this.rotationDeg);
    return {
      x: rotated.x * this.mapWidthPx,
      y: rotated.y * this.mapHeightPx
    };
  }

  private getRadarDirectionRotation(playerPosition: Vector3, playerForward: Vector3): number {
    const flatForward = playerForward.clone();
    flatForward.y = 0;
    if (flatForward.lengthSquared() <= 1e-6) {
      return this.playerMarker.rotation;
    }
    flatForward.normalize();

    const center = this.worldToMapPixel(playerPosition);
    const ahead = this.worldToMapPixel(playerPosition.add(flatForward));
    const dx = ahead.x - center.x;
    const dy = ahead.y - center.y;
    if (dx * dx + dy * dy <= 1e-6) {
      return this.playerMarker.rotation;
    }

    return Math.atan2(dy, dx) + Math.PI * 1.5;
  }

  private placeSizedControl(control: Control, left: number, top: number, width: number, height: number): void {
    control.leftInPixels = left + width / 2 - RADAR_SIZE_PX / 2;
    control.topInPixels = top + height / 2 - RADAR_SIZE_PX / 2;
  }
}

function isPointVisible(x: number, y: number): boolean {
  return x >= 0 && x <= RADAR_SIZE_PX && y >= 0 && y <= RADAR_SIZE_PX;
}

function radarPingStyle(faction: RadarTarget["faction"]): { color: string; background: string } {
  if (faction === "ally") {
    return { color: "#3d9fff", background: "rgba(50, 140, 255, 0.32)" };
  }
  return { color: "#ff3030", background: "rgba(255, 0, 0, 0.28)" };
}

function normalizeRad(angle: number): number {
  const twoPi = Math.PI * 2;
  return ((angle + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
}

function shortestAngleDelta(a: number, b: number): number {
  return normalizeRad(b - a);
}

function rotateNormalizedPoint(x: number, y: number, rotationDeg: 0 | 90 | 180 | 270): { x: number; y: number } {
  switch (rotationDeg) {
    case 90:
      return { x: 1 - y, y: x };
    case 180:
      return { x: 1 - x, y: 1 - y };
    case 270:
      return { x: y, y: 1 - x };
    case 0:
    default:
      return { x, y };
  }
}
