import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Control, Image, Rectangle } from "@babylonjs/gui";
import { addHudCornerBrackets } from "./hudChrome";

const SLOT_SIZE_PX = 72;
const SLOT_GAP_PX = 8;
const COLUMNS = 3;
const FRAME_BG = "rgba(72,72,72,0.58)";
const FRAME_BG_SELECTED = "rgba(110,110,110,0.72)";

export interface CargoHudSlot {
  kind: string | null;
  iconUrl: string | null;
}

interface CargoSlotUi {
  frame: Rectangle;
  icon: Image;
}

export class CargoHud {
  private readonly root: Rectangle;
  private readonly slots: CargoSlotUi[] = [];
  private selectedIndex = 0;

  public constructor(texture: AdvancedDynamicTexture, slotCount: number) {
    const rows = Math.ceil(slotCount / COLUMNS);
    const width = COLUMNS * SLOT_SIZE_PX + (COLUMNS - 1) * SLOT_GAP_PX;
    const height = rows * SLOT_SIZE_PX + (rows - 1) * SLOT_GAP_PX;

    const root = new Rectangle("hud_cargo_root");
    root.widthInPixels = width;
    root.heightInPixels = height;
    root.thickness = 0;
    root.background = "transparent";
    root.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    root.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    root.left = "-16px";
    root.top = "-16px";
    root.isPointerBlocker = false;
    root.zIndex = 20;
    texture.addControl(root);
    this.root = root;

    for (let i = 0; i < slotCount; i++) {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      const frame = new Rectangle(`hud_cargo_slot_${i}`);
      frame.widthInPixels = SLOT_SIZE_PX;
      frame.heightInPixels = SLOT_SIZE_PX;
      frame.thickness = 0;
      frame.background = FRAME_BG;
      frame.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      frame.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      frame.leftInPixels = col * (SLOT_SIZE_PX + SLOT_GAP_PX);
      frame.topInPixels = row * (SLOT_SIZE_PX + SLOT_GAP_PX);
      frame.isPointerBlocker = false;
      root.addControl(frame);
      addHudCornerBrackets(frame, `hud_cargo_slot_${i}`, i === 0 ? 1 : 0.55);

      const icon = new Image(`hud_cargo_icon_${i}`, "");
      icon.width = "78%";
      icon.height = "78%";
      icon.stretch = Image.STRETCH_UNIFORM;
      icon.isVisible = false;
      icon.isPointerBlocker = false;
      icon.zIndex = 1;
      frame.addControl(icon);

      this.slots.push({ frame, icon });
    }
  }

  public setVisible(visible: boolean): void {
    this.root.isVisible = visible;
  }

  public setSelectedSlot(index: number): void {
    this.selectedIndex = index;
    this.applySelectionChrome();
  }

  public setSlots(slots: readonly CargoHudSlot[]): void {
    for (let i = 0; i < this.slots.length; i++) {
      const ui = this.slots[i];
      const data = slots[i];
      const iconUrl = data?.iconUrl ?? null;
      if (iconUrl) {
        ui.icon.source = iconUrl;
        ui.icon.isVisible = true;
      } else {
        ui.icon.isVisible = false;
      }
    }
    this.applySelectionChrome();
  }

  public dispose(): void {
    this.root.dispose();
  }

  private applySelectionChrome(): void {
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].frame.background = i === this.selectedIndex ? FRAME_BG_SELECTED : FRAME_BG;
    }
  }
}
