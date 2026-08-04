import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Control, Image, Rectangle, StackPanel } from "@babylonjs/gui";
import type { VehicleInstanceId, VehicleTypeId } from "./vehicle/VehicleController";
import { addHudCornerBrackets } from "./hudChrome";

const VEHICLE_SLOT_SIZE_PX = 80;
const VEHICLE_SLOT_GAP_PX = 10;
const VEHICLE_SLOT_INACTIVE_ALPHA = 0.55;
const VEHICLE_SLOT_INACTIVE_SCALE = 0.85;
const VEHICLE_SWITCH_BLINK_SEC = 0.24;
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

type VehicleHudAnimPhase = "idle" | "blink";

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

    this.applyIdleVisuals();
  }

  public setActiveVehicle(id: VehicleInstanceId): void {
    if (id === this.activeVehicleId && this.animPhase === "idle") {
      return;
    }

    this.activeVehicleId = id;
    this.animPhase = "blink";
    this.animTime = 0;
    this.applyIdleVisuals();
  }

  public update(dt: number): void {
    if (this.animPhase === "idle") {
      this.applyIdleVisuals();
      return;
    }

    this.animTime += dt;
    if (this.animPhase === "blink") {
      const t = clamp(this.animTime / VEHICLE_SWITCH_BLINK_SEC, 0, 1);
      const flicker = 0.68 + 0.32 * Math.abs(Math.sin(t * Math.PI * 3));
      this.applyIdleVisuals(flicker);

      if (t >= 1) {
        this.animPhase = "idle";
        this.animTime = 0;
        this.applyIdleVisuals();
      }
    }
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

  private applyIdleVisuals(activeBlinkAlpha: number | null = null): void {
    for (const slot of this.slots) {
      const isActive = slot.id === this.activeVehicleId;
      const baseAlpha = isActive ? 1 : VEHICLE_SLOT_INACTIVE_ALPHA;
      const alpha = isActive && activeBlinkAlpha !== null ? activeBlinkAlpha : baseAlpha;
      const scale = isActive ? 1 : VEHICLE_SLOT_INACTIVE_SCALE;

      slot.frame.alpha = alpha;
      slot.icon.alpha = 1;
      slot.frame.scaleX = scale;
      slot.frame.scaleY = scale;
      this.setBracketAlpha(slot.frame, isActive ? alpha : VEHICLE_SLOT_INACTIVE_ALPHA);
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
