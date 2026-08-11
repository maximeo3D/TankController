import { AdvancedDynamicTexture, Control, Rectangle } from "@babylonjs/gui";

const FRAME_W_PX = 240;
const FRAME_H_PX = 80;
const FRAME_LINE_PX = 2;
const TICK_LEN_PX = 9;
const TICK_THICK_PX = 3;
const MARKER_W_RATIO = 0.11;
const MARKER_H_RATIO = 0.24;
const HUD_COLOR = "#ffffff";

export interface HelicopterTurretAimHudLimits {
  minYawDeg: number;
  maxYawDeg: number;
  minPitchDeg: number;
  maxPitchDeg: number;
}

export interface HelicopterTurretAimHudState extends HelicopterTurretAimHudLimits {
  yawDeg: number;
  pitchDeg: number;
  visible: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function addTick(
  parent: Rectangle,
  name: string,
  widthPx: number,
  heightPx: number,
  leftPx: number,
  topPx: number
): void {
  const tick = new Rectangle(name);
  tick.widthInPixels = widthPx;
  tick.heightInPixels = heightPx;
  tick.thickness = 0;
  tick.background = HUD_COLOR;
  tick.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  tick.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  tick.leftInPixels = leftPx;
  tick.topInPixels = topPx;
  tick.isPointerBlocker = false;
  tick.zIndex = 2;
  parent.addControl(tick);
}

function buildTicks(frame: Rectangle): void {
  const centerX = FRAME_W_PX / 2 - TICK_THICK_PX / 2;

  addTick(frame, "hud_heli_turret_aim_tick_yaw0_top", TICK_THICK_PX, TICK_LEN_PX, centerX, 0);
  addTick(
    frame,
    "hud_heli_turret_aim_tick_yaw0_bottom",
    TICK_THICK_PX,
    TICK_LEN_PX,
    centerX,
    FRAME_H_PX - TICK_LEN_PX
  );
}

/** Indicateur tourelle / canon hélico (cadre + repères + curseur). */
export class HelicopterTurretAimHud {
  private readonly root: Rectangle;
  private readonly marker: Rectangle;

  private constructor(root: Rectangle, marker: Rectangle) {
    this.root = root;
    this.marker = marker;
  }

  public static getOrCreate(hudTexture: AdvancedDynamicTexture): HelicopterTurretAimHud {
    const existingRoot = hudTexture.getControlByName("hud_heli_turret_aim_root") as Rectangle | null;
    if (existingRoot) {
      const frame = existingRoot.getChildByName("hud_heli_turret_aim_frame") as Rectangle;
      const marker = frame.getChildByName("hud_heli_turret_aim_marker") as Rectangle;
      return new HelicopterTurretAimHud(existingRoot, marker);
    }

    const root = new Rectangle("hud_heli_turret_aim_root");
    root.widthInPixels = FRAME_W_PX;
    root.heightInPixels = FRAME_H_PX;
    root.thickness = 0;
    root.background = "transparent";
    root.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    root.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    root.top = "0px";
    root.isPointerBlocker = false;
    root.isVisible = false;
    root.clipChildren = false;
    root.zIndex = 45;

    const frame = new Rectangle("hud_heli_turret_aim_frame");
    frame.width = "100%";
    frame.height = "100%";
    frame.thickness = FRAME_LINE_PX;
    frame.color = HUD_COLOR;
    frame.background = "transparent";
    frame.isPointerBlocker = false;
    frame.clipChildren = false;

    buildTicks(frame);

    const marker = new Rectangle("hud_heli_turret_aim_marker");
    marker.thickness = FRAME_LINE_PX;
    marker.color = HUD_COLOR;
    marker.background = "transparent";
    marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    marker.isPointerBlocker = false;

    frame.addControl(marker);
    root.addControl(frame);
    hudTexture.addControl(root);

    return new HelicopterTurretAimHud(root, marker);
  }

  public syncLayout(bottomOffsetFromScreenBottomPx: number): void {
    this.root.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.root.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.root.top = `-${bottomOffsetFromScreenBottomPx}px`;
    this.root.left = "0px";
  }

  public update(state: HelicopterTurretAimHudState): void {
    this.root.isVisible = state.visible;
    if (!state.visible) {
      return;
    }

    const yaw = clamp(state.yawDeg, state.minYawDeg, state.maxYawDeg);
    const pitch = clamp(state.pitchDeg, state.minPitchDeg, state.maxPitchDeg);
    const yawSpan = state.maxYawDeg - state.minYawDeg;
    const pitchSpan = state.maxPitchDeg - state.minPitchDeg;
    const nx = yawSpan > 1e-6 ? (yaw - state.minYawDeg) / yawSpan : 0.5;
    const ny = pitchSpan > 1e-6 ? (state.maxPitchDeg - pitch) / pitchSpan : 0.5;

    const markerW = FRAME_W_PX * MARKER_W_RATIO;
    const markerH = FRAME_H_PX * MARKER_H_RATIO;
    const maxLeft = Math.max(FRAME_W_PX - markerW, 0);
    const maxTop = Math.max(FRAME_H_PX - markerH, 0);

    this.marker.widthInPixels = markerW;
    this.marker.heightInPixels = markerH;
    this.marker.leftInPixels = nx * maxLeft;
    this.marker.topInPixels = ny * maxTop;
  }

  public dispose(): void {
    this.root.dispose();
  }
}
