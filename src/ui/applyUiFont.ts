import { AdvancedDynamicTexture, Button, Container, Control, TextBlock } from "@babylonjs/gui";
import squareFontUrl from "../../assets/ui/Square.ttf?url";

export const UI_FONT_FAMILY = "Square";

let squareFontReady = false;

export function ensureSquareFontLoaded(): void {
  if (squareFontReady) {
    return;
  }
  squareFontReady = true;

  const style = document.createElement("style");
  style.textContent = `
@font-face {
  font-family: "${UI_FONT_FAMILY}";
  src: url("${squareFontUrl}") format("truetype");
  font-weight: normal;
  font-style: normal;
}
`;
  document.head.appendChild(style);
}

export function applyUiFontFamily(control: Control | null): void {
  if (!control) {
    return;
  }

  if (control instanceof TextBlock) {
    control.fontFamily = UI_FONT_FAMILY;
    control.fontStyle = "";
  }

  if (control instanceof Button) {
    const text = control.textBlock;
    if (text) {
      text.fontFamily = UI_FONT_FAMILY;
      text.fontStyle = "";
    }
  }

  if (control instanceof Container) {
    for (const child of control.children) {
      applyUiFontFamily(child);
    }
  }
}

export function applyUiFontToTexture(texture: AdvancedDynamicTexture | null): void {
  if (!texture) {
    return;
  }
  for (const root of texture.getChildren()) {
    applyUiFontFamily(root);
  }
}
