export type WeaponType = "shell" | "bullet";

export interface TankInputFrame {
  moveAxis: number;
  turnAxis: number;
  lookDeltaX: number;
  lookDeltaY: number;
  pointerX: number;
  pointerY: number;
  boostHeld: boolean;
  zoomHeld: boolean;
  fireHeld: boolean;
  selectedWeapon: WeaponType;
}

export class TankInput {
  private readonly canvas: HTMLCanvasElement;
  private readonly pressedKeys = new Set<string>();
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private pointerX = 0;
  private pointerY = 0;
  private isPrimaryFireHeld = false;
  private isZoomHeld = false;
  private selectedWeapon: WeaponType = "shell";

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.tabIndex = 0;

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointerleave", this.handlePointerUp);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
  }

  public consumeFrame(): TankInputFrame {
    const frame: TankInputFrame = {
      moveAxis: this.readAxis("z", "s"),
      turnAxis: this.readAxis("q", "d"),
      lookDeltaX: this.lookDeltaX,
      lookDeltaY: this.lookDeltaY,
      pointerX: this.pointerX,
      pointerY: this.pointerY,
      boostHeld: this.pressedKeys.has("shift"),
      zoomHeld: this.isZoomHeld,
      fireHeld: this.isPrimaryFireHeld,
      selectedWeapon: this.selectedWeapon
    };

    this.lookDeltaX = 0;
    this.lookDeltaY = 0;

    return frame;
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointerleave", this.handlePointerUp);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const key = normalizeKey(event.key);
    this.pressedKeys.add(key);

    if (key === "1") {
      this.selectedWeapon = "shell";
      event.preventDefault();
    }

    if (key === "2") {
      this.selectedWeapon = "bullet";
      event.preventDefault();
    }

    if (isTrackedKey(key)) {
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(normalizeKey(event.key));
  };

  private readonly handleBlur = (): void => {
    this.pressedKeys.clear();
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.isPrimaryFireHeld = false;
    this.isZoomHeld = false;
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.lookDeltaX += event.movementX;
    this.lookDeltaY += event.movementY;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? this.canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? this.canvas.height / rect.height : 1;
    this.pointerX = event.offsetX * scaleX;
    this.pointerY = event.offsetY * scaleY;
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.canvas.focus();
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? this.canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? this.canvas.height / rect.height : 1;
    this.pointerX = event.offsetX * scaleX;
    this.pointerY = event.offsetY * scaleY;

    if (event.button === 0) {
      this.isPrimaryFireHeld = true;
    }

    if (event.button === 2) {
      this.isZoomHeld = true;
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.button === 0 || event.type === "pointerleave") {
      this.isPrimaryFireHeld = false;
    }

    if (event.button === 2 || event.type === "pointerleave") {
      this.isZoomHeld = false;
    }
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readAxis(positive: string, negative: string): number {
    const positiveDown = this.pressedKeys.has(positive);
    const negativeDown = this.pressedKeys.has(negative);

    if (positiveDown === negativeDown) {
      return 0;
    }

    return positiveDown ? 1 : -1;
  }
}

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

function isTrackedKey(key: string): boolean {
  return ["z", "q", "s", "d", "1", "2", "shift"].includes(key);
}
