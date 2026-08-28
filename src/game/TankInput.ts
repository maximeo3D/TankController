export type WeaponType = "shell" | "rocket" | "missile" | "bullet";
export type PrimaryWeaponType = "shell" | "rocket" | "missile";

/** Touches de sélection directe, dans l'ordre des emplacements d'armes. */
const WEAPON_SLOT_KEYS: readonly string[] = ["1", "2", "3", "4"];

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
  selectedCargoSlot: number;
  dropRequested: boolean;
  /** Remise à plat / respawn sur place (touche Y, front montant). */
  uprightResetRequested: boolean;
  /** Klaxon (touche H, front montant). */
  hornRequested: boolean;
}

export class TankInput {
  private readonly canvas: HTMLCanvasElement;
  private readonly shouldRequestPointerLock: () => boolean;
  private readonly pressedKeys = new Set<string>();
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private pointerX = 0;
  private pointerY = 0;
  private isPrimaryFireHeld = false;
  // Zoom is implemented as a toggle (RMB click) instead of "hold",
  // because holding RMB can prevent LMB events on some browsers.
  private zoomToggled = false;
  /** Armes sélectionnables, dans l'ordre des touches 1..N et de la molette. */
  private readonly weaponSlots: readonly WeaponType[];
  private selectedWeapon: WeaponType;
  /** Verrouille le changement d'arme (hélicoptère en vue zoom). */
  private weaponSelectionLocked = false;
  private readonly cargoSlotCount: number;
  private selectedCargoSlot = 0;
  private dropRequested = false;
  private pointerLocked = false;
  private uprightResetRequested = false;
  private hornRequested = false;

  public constructor(
    canvas: HTMLCanvasElement,
    shouldRequestPointerLock: () => boolean = () => true,
    weaponSlots: readonly WeaponType[] = ["shell", "bullet"],
    cargoSlotCount = 0
  ) {
    this.canvas = canvas;
    this.shouldRequestPointerLock = shouldRequestPointerLock;
    this.cargoSlotCount = Math.max(0, Math.floor(cargoSlotCount));
    this.weaponSlots =
      this.cargoSlotCount > 0 ? [] : weaponSlots.length > 0 ? [...weaponSlots] : ["shell", "bullet"];
    this.selectedWeapon = this.weaponSlots[0] ?? "bullet";
    this.pointerLocked = document.pointerLockElement === this.canvas;
    this.canvas.tabIndex = 0;

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointerleave", this.handlePointerUp);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  public consumeFrame(): TankInputFrame {
    const frame: TankInputFrame = {
      moveAxis: this.readAxis("z", "s"),
      turnAxis: this.readAxis("q", "d"),
      lookDeltaX: this.lookDeltaX,
      lookDeltaY: this.lookDeltaY,
      pointerX: this.pointerX,
      pointerY: this.pointerY,
      boostHeld: this.isBoostHeld(),
      zoomHeld: this.zoomToggled,
      fireHeld: this.isPrimaryFireHeld,
      selectedWeapon: this.selectedWeapon,
      selectedCargoSlot: this.selectedCargoSlot,
      dropRequested: this.dropRequested,
      uprightResetRequested: this.uprightResetRequested,
      hornRequested: this.hornRequested
    };

    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.uprightResetRequested = false;
    this.hornRequested = false;
    this.dropRequested = false;

    return frame;
  }

  /** Fige la munition sélectionnée (hélicoptère : interdit en vue zoom). */
  public setWeaponSelectionLocked(locked: boolean): void {
    this.weaponSelectionLocked = locked;
  }

  public resetState(): void {
    this.pressedKeys.clear();
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.isPrimaryFireHeld = false;
    this.zoomToggled = false;
  }

  /** Re-acquire pointer lock (must run inside a user gesture, e.g. Resume click). */
  public requestPointerLock(): void {
    if (this.pointerLocked || !this.shouldRequestPointerLock()) {
      return;
    }

    void this.canvas.requestPointerLock().catch(() => {
      // Browser security cooldown after Escape; next regular click can acquire it.
    });
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointerleave", this.handlePointerUp);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    this.canvas.removeEventListener("wheel", this.handleWheel);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const key = normalizeKey(event.key);
    this.pressedKeys.add(key);
    this.trackShiftCode(event.code, true);

    const slotIndex = WEAPON_SLOT_KEYS.indexOf(key);
    if (slotIndex >= 0 && this.cargoSlotCount <= 0) {
      if (!this.weaponSelectionLocked && slotIndex < this.weaponSlots.length) {
        this.selectedWeapon = this.weaponSlots[slotIndex];
      }
      event.preventDefault();
    }

    if (key === "f" && this.cargoSlotCount > 0 && !event.repeat) {
      this.dropRequested = true;
      event.preventDefault();
    }

    if (key === "y") {
      this.uprightResetRequested = true;
      event.preventDefault();
    }

    // `event.repeat` : un klaxon par appui, pas un par répétition clavier.
    if (key === "h" && !event.repeat) {
      this.hornRequested = true;
      event.preventDefault();
    }

    if (isTrackedKey(key)) {
      event.preventDefault();
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (event.deltaY === 0) {
      return;
    }

    if (this.cargoSlotCount > 0) {
      event.preventDefault();
      const step = event.deltaY > 0 ? 1 : -1;
      this.selectedCargoSlot =
        (this.selectedCargoSlot + step + this.cargoSlotCount) % this.cargoSlotCount;
      return;
    }

    if (this.weaponSlots.length < 2) {
      return;
    }
    event.preventDefault();
    if (this.weaponSelectionLocked) {
      return;
    }

    const current = this.weaponSlots.indexOf(this.selectedWeapon);
    const step = event.deltaY > 0 ? 1 : -1;
    const next = (current + step + this.weaponSlots.length) % this.weaponSlots.length;
    this.selectedWeapon = this.weaponSlots[next];
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const key = normalizeKey(event.key);
    this.pressedKeys.delete(key);
    this.trackShiftCode(event.code, false);
  };

  private readonly handleBlur = (): void => {
    this.pressedKeys.clear();
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.isPrimaryFireHeld = false;
    this.zoomToggled = false;
  };

  private readonly handlePointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    // Avoid a big "jump" right after (un)locking.
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    // When pointer is locked, movementX/Y are reliable deltas even if cursor would leave the window.
    if (this.pointerLocked) {
      this.lookDeltaX += event.movementX;
      this.lookDeltaY += event.movementY;
    }
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? this.canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? this.canvas.height / rect.height : 1;
    this.pointerX = event.offsetX * scaleX;
    this.pointerY = event.offsetY * scaleY;
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.canvas.focus();
    this.requestPointerLock();
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? this.canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? this.canvas.height / rect.height : 1;
    this.pointerX = event.offsetX * scaleX;
    this.pointerY = event.offsetY * scaleY;

    if (event.button === 0) {
      this.isPrimaryFireHeld = true;
    }

    if (event.button === 2) {
      this.zoomToggled = !this.zoomToggled;
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.button === 0 || event.type === "pointerleave") {
      this.isPrimaryFireHeld = false;
    }

    if (event.button === 2 || event.type === "pointerleave") {
      // Zoom is toggled on RMB down; no-op here.
    }
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private isBoostHeld(): boolean {
    return (
      this.pressedKeys.has("shift") ||
      this.pressedKeys.has("shiftleft") ||
      this.pressedKeys.has("shiftright")
    );
  }

  private trackShiftCode(code: string, down: boolean): void {
    const normalized = code.trim().toLowerCase();
    if (normalized !== "shiftleft" && normalized !== "shiftright") {
      return;
    }
    if (down) {
      this.pressedKeys.add(normalized);
    } else {
      this.pressedKeys.delete(normalized);
    }
  }

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
  return ["z", "q", "s", "d", "y", "h", "f", "shift", ...WEAPON_SLOT_KEYS].includes(key);
}
