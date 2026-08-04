import { Control, Rectangle } from "@babylonjs/gui";

/** Coins blancs + barres latérales (armes, status, véhicules). */
export function addHudCornerBrackets(frame: Rectangle, idPrefix: string, alpha: number): void {
  if (frame.getChildByName(`${idPrefix}_bracket_tl_h`)) {
    return;
  }

  const arm = 14;
  const thick = 2;
  const color = `rgba(255,255,255,${alpha})`;
  const z = 4;

  const corners: Array<{ name: string; w: string; h: string; left?: string; top?: string; right?: string; bottom?: string }> = [
    { name: "tl_h", w: `${arm}px`, h: `${thick}px`, left: "0px", top: "0px" },
    { name: "tl_v", w: `${thick}px`, h: `${arm}px`, left: "0px", top: "0px" },
    { name: "tr_h", w: `${arm}px`, h: `${thick}px`, right: "0px", top: "0px" },
    { name: "tr_v", w: `${thick}px`, h: `${arm}px`, right: "0px", top: "0px" },
    { name: "bl_h", w: `${arm}px`, h: `${thick}px`, left: "0px", bottom: "0px" },
    { name: "bl_v", w: `${thick}px`, h: `${arm}px`, left: "0px", bottom: "0px" },
    { name: "br_h", w: `${arm}px`, h: `${thick}px`, right: "0px", bottom: "0px" },
    { name: "br_v", w: `${thick}px`, h: `${arm}px`, right: "0px", bottom: "0px" }
  ];

  for (const corner of corners) {
    const rect = new Rectangle(`${idPrefix}_bracket_${corner.name}`);
    rect.width = corner.w;
    rect.height = corner.h;
    rect.thickness = 0;
    rect.background = color;
    rect.isPointerBlocker = false;
    rect.zIndex = z;
    rect.horizontalAlignment = corner.right
      ? Control.HORIZONTAL_ALIGNMENT_RIGHT
      : Control.HORIZONTAL_ALIGNMENT_LEFT;
    rect.verticalAlignment = corner.bottom
      ? Control.VERTICAL_ALIGNMENT_BOTTOM
      : Control.VERTICAL_ALIGNMENT_TOP;
    if (corner.left) {
      rect.left = corner.left;
    }
    if (corner.right) {
      rect.left = corner.right;
    }
    if (corner.top) {
      rect.top = corner.top;
    }
    if (corner.bottom) {
      rect.top = corner.bottom;
    }
    frame.addControl(rect);
  }

  addHudBracketSideBorder(frame, `${idPrefix}_bracket_side_l`, "left", thick, color, z);
  addHudBracketSideBorder(frame, `${idPrefix}_bracket_side_r`, "right", thick, color, z);
}

function addHudBracketSideBorder(
  frame: Rectangle,
  name: string,
  side: "left" | "right",
  thick: number,
  color: string,
  z: number
): void {
  const rect = new Rectangle(name);
  rect.width = `${thick}px`;
  rect.height = "100%";
  rect.thickness = 0;
  rect.background = color;
  rect.isPointerBlocker = false;
  rect.zIndex = z;
  rect.horizontalAlignment =
    side === "left" ? Control.HORIZONTAL_ALIGNMENT_LEFT : Control.HORIZONTAL_ALIGNMENT_RIGHT;
  rect.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  rect.left = 0;
  frame.addControl(rect);
}
