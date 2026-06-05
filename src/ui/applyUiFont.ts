import { AdvancedDynamicTexture, Button, Container, Control, TextBlock } from "@babylonjs/gui";
import digitalFontUrl from "../../assets/ui/digital.ttf?url";
import squareFontUrl from "../../assets/ui/Square.ttf?url";

export const UI_FONT_FAMILY = "Square";
export const TIMER_FONT_FAMILY = "Digital";

const TIMER_LABEL_NAME = "hud_timer_label";
const SQUARE_FONT_STYLE_ID = "ui-font-square";
const DIGITAL_FONT_STYLE_ID = "ui-font-digital";

let squareFontReady = false;

function fontSrc(url: string): string {
  if (!import.meta.env.DEV) {
    return url;
  }
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}v=${Date.now()}`;
}

function upsertFontFaceStyle(styleId: string, family: string, url: string): void {
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.appendChild(style);
  }

  style.textContent = `
@font-face {
  font-family: "${family}";
  src: url("${fontSrc(url)}") format("truetype");
  font-weight: normal;
  font-style: normal;
}
`;
}

export function ensureSquareFontLoaded(): void {
  if (squareFontReady) {
    return;
  }
  squareFontReady = true;
  upsertFontFaceStyle(SQUARE_FONT_STYLE_ID, UI_FONT_FAMILY, squareFontUrl);
}

export function ensureDigitalFontLoaded(): void {
  upsertFontFaceStyle(DIGITAL_FONT_STYLE_ID, TIMER_FONT_FAMILY, digitalFontUrl);
}

export function applyUiFontFamily(control: Control | null): void {
  if (!control) {
    return;
  }

  if (control instanceof TextBlock) {
    if (control.name === TIMER_LABEL_NAME) {
      control.fontFamily = TIMER_FONT_FAMILY;
    } else {
      control.fontFamily = UI_FONT_FAMILY;
    }
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

ensureDigitalFontLoaded();

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    ensureDigitalFontLoaded();
  });
}
