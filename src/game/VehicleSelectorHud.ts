import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Control, Image, Rectangle, StackPanel } from "@babylonjs/gui";
import type { VehicleInstanceId, VehicleTypeId } from "./vehicle/VehicleController";
import { addHudCornerBrackets } from "./hudChrome";

const VEHICLE_SLOT_SIZE_PX = 80;
const VEHICLE_SLOT_GAP_PX = 10;
const VEHICLE_SLOT_INACTIVE_ALPHA = 0.55;
const VEHICLE_SLOT_INACTIVE_SCALE = 0.85;
const VEHICLE_SWITCH_BLINK_SEC = 0.24;
const VEHICLE_SWITCH_BLOCKED_BLINK_SEC = 0.9;
const VEHICLE_SWITCH_BLOCKED_BLINK_COUNT = 3;
const VEHICLE_SWITCH_BLOCKED_BG = "rgba(244,67,54,0.88)";
const VEHICLE_FRAME_BG = "rgba(72,72,72,0.58)";

export interface VehicleSelectorEntry {
  id: VehicleInstanceId;
  type: VehicleTypeId;
  iconUrl: string;
}

interface VehicleSlotUi {
  id: VehicleInstanceId;
  frame: Rectangle;
  icon: Image;
}

type VehicleHudAnimPhase = "idle" | "blink" | "blocked";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class VehicleSelectorHud {
  private readonly slots: VehicleSlotUi[] = [];
  private readonly panel: StackPanel;
  private activeVehicleId: VehicleInstanceId;
  private animPhase: VehicleHudAnimPhase = "idle";
  private animTime = 0;

  public constructor(
    hudTexture: AdvancedDynamicTexture,
    panel: StackPanel,
    entries: VehicleSelectorEntry[],
    initialActiveId: VehicleInstanceId
  ) {
    this.panel = panel;
    this.activeVehicleId = initialActiveId;

    panel.isVertical = true;
    panel.width = `${VEHICLE_SLOT_SIZE_PX}px`;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.left = "-16px";
    panel.top = "40%";
    panel.spacing = VEHICLE_SLOT_GAP_PX;
    panel.clipChildren = false;
    panel.clipContent = false;
    panel.isPointerBlocker = false;
    panel.isVisible = entries.length > 1;

    for (const entry of entries) {
      this.slots.push(this.createSlot(hudTexture, panel, entry));
    }

    this.applyVisuals();
  }

  public setActiveVehicle(id: VehicleInstanceId): void {
    if (id === this.activeVehicleId && this.animPhase === "idle") {
      return;
    }

    this.activeVehicleId = id;
    this.animPhase = "blink";
    this.animTime = 0;
    this.applyVisuals();
  }

  /** Feedback rouge bref quand le switch est refusé (véhicule en mouvement). */
  public playSwitchBlockedFeedback(): void {
    this.animPhase = "blocked";
    this.animTime = 0;
  }

  public update(dt: number): void {
    if (this.animPhase === "blink") {
      this.animTime += dt;
      const t = clamp(this.animTime / VEHICLE_SWITCH_BLINK_SEC, 0, 1);
      const flicker = 0.68 + 0.32 * Math.abs(Math.sin(t * Math.PI * 3));
      this.applyVisuals({ switchBlinkAlpha: flicker });

      if (t >= 1) {
        this.animPhase = "idle";
        this.animTime = 0;
        this.applyVisuals();
      }
      return;
    }

    if (this.animPhase === "blocked") {
      this.animTime += dt;
      const t = clamp(this.animTime / VEHICLE_SWITCH_BLOCKED_BLINK_SEC, 0, 1);
      const wave = Math.sin(t * Math.PI * VEHICLE_SWITCH_BLOCKED_BLINK_COUNT);
      const showRedBg = wave > 0;
      this.applyVisuals({ blockedRedBg: showRedBg });

      if (t >= 1) {
        this.animPhase = "idle";
        this.animTime = 0;
        this.applyVisuals();
      }
      return;
    }

    this.applyVisuals();
  }

  public dispose(): void {
    for (const slot of this.slots) {
      this.panel.removeControl(slot.frame);
      slot.frame.dispose();
    }
    this.slots.length = 0;
  }

  private createSlot(
    _hudTexture: AdvancedDynamicTexture,
    panel: StackPanel,
    entry: VehicleSelectorEntry
  ): VehicleSlotUi {
    const frame = new Rectangle(`hud_vehicle_slot_${entry.id}`);
    frame.width = `${VEHICLE_SLOT_SIZE_PX}px`;
    frame.height = `${VEHICLE_SLOT_SIZE_PX}px`;
    frame.thickness = 0;
    frame.background = VEHICLE_FRAME_BG;
    frame.clipChildren = false;
    frame.clipContent = false;
    frame.isPointerBlocker = false;
    frame.transformCenterX = 0.5;
    frame.transformCenterY = 0.5;

    const icon = new Image(`hud_vehicle_icon_${entry.id}`, entry.iconUrl);
    icon.width = `${VEHICLE_SLOT_SIZE_PX - 16}px`;
    icon.height = `${VEHICLE_SLOT_SIZE_PX - 16}px`;
    icon.stretch = Image.STRETCH_UNIFORM;
    icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    icon.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    icon.isPointerBlocker = false;
    icon.zIndex = 1;
    frame.addControl(icon);

    const isActive = entry.id === this.activeVehicleId;
    addHudCornerBrackets(frame, `hud_vehicle_slot_${entry.id}`, isActive ? 1 : VEHICLE_SLOT_INACTIVE_ALPHA);

    panel.addControl(frame);

    return { id: entry.id, frame, icon };
  }

  private applyVisuals(options?: { switchBlinkAlpha?: number; blockedRedBg?: boolean }): void {
    for (const slot of this.slots) {
      const isActive = slot.id === this.activeVehicleId;
      const baseAlpha = isActive ? 1 : VEHICLE_SLOT_INACTIVE_ALPHA;
      const scale = isActive ? 1 : VEHICLE_SLOT_INACTIVE_SCALE;

      if (isActive && options?.switchBlinkAlpha !== undefined) {
        slot.frame.alpha = options.switchBlinkAlpha;
        slot.icon.alpha = 1;
        slot.frame.background = VEHICLE_FRAME_BG;
        slot.frame.scaleX = scale;
        slot.frame.scaleY = scale;
        this.setBracketAlpha(slot.frame, options.switchBlinkAlpha);
        continue;
      }

      if (isActive && options?.blockedRedBg !== undefined) {
        slot.frame.alpha = 1;
        slot.icon.alpha = 1;
        slot.frame.background = options.blockedRedBg ? VEHICLE_SWITCH_BLOCKED_BG : VEHICLE_FRAME_BG;
        slot.frame.scaleX = scale;
        slot.frame.scaleY = scale;
        this.setBracketAlpha(slot.frame, 1);
        continue;
      }

      slot.frame.alpha = baseAlpha;
      slot.icon.alpha = 1;
      slot.frame.background = VEHICLE_FRAME_BG;
      slot.frame.scaleX = scale;
      slot.frame.scaleY = scale;
      this.setBracketAlpha(slot.frame, isActive ? baseAlpha : VEHICLE_SLOT_INACTIVE_ALPHA);
    }
  }

  private setBracketAlpha(frame: Rectangle, alpha: number): void {
    for (const control of frame.children) {
      if (control.name?.includes("_bracket_")) {
        control.alpha = alpha;
      }
    }
  }
}
