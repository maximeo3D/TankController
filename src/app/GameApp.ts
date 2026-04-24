// Ensure Babylon AudioEngine is registered before Engine init.
import "@babylonjs/core/Audio/audioEngine";
import "@babylonjs/core/Audio/audioSceneComponent";
import { Engine } from "@babylonjs/core/Engines/engine";
import { AudioEngine } from "@babylonjs/core/Audio/audioEngine";
import { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import type { LevelDefinition } from "./levels";
import { tankConfig } from "../config/tankController";
import {
  createGameplayScene,
  type GameplaySceneBundle,
  type GameplaySceneSummary
} from "../game/createGameplayScene";
import type { TankGameplayDebugState } from "../game/TankGameplayController";
import { AdvancedDynamicTexture, Button, Control, StackPanel, TextBlock } from "@babylonjs/gui";
import { MENU_MAPS, type MenuMapEntry, type MenuMission } from "../ui/menuData";

type ScreenState = "menu" | "gameplay";

interface GameplayUiState {
  levelName: string;
  isLoading: boolean;
  errorMessage: string | null;
  summary: GameplaySceneSummary | null;
  debug: TankGameplayDebugState | null;
}

export class GameApp {
  // Toggle the HTML debug overlay during gameplay (panel on top of canvas).
  // Keep it off by default because it blocks navigation / aiming.
  private static readonly SHOW_GAMEPLAY_DEBUG_PANEL = false;
  /**
   * Verbose F12 console traces for main menu / level UI navigation. Set to false to silence.
   * Logs: showMainMenu vs showPlaySelect, mm_btn_play vs ps_btn_back, and `onControlPicked` (real pick).
   */
  private static readonly DEBUG_MENU_NAV = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLDivElement;
  private readonly fpsElement: HTMLDivElement;
  private readonly engine: Engine;
  private audioUnlockButton: HTMLButtonElement | null = null;
  private currentScene: Scene;
  private menuScene: Scene;
  /** Main menu only — never load `UI_levels` into this. */
  private menuUi: AdvancedDynamicTexture | null = null;
  /**
   * Fullscreen UI for the level-choose screen only (second parse target).
   * Merging two JSONs in one `AdvancedDynamicTexture` caused broken name lookup, z-fighting,
   * and “orphan” control refs; two separate textures avoids all of that.
   */
  private levelSelectUi: AdvancedDynamicTexture | null = null;
  private selectedMap: MenuMapEntry | null = null;
  private selectedMission: MenuMission | null = null;
  private startButton: Control | null = null;
  private mapsStack: StackPanel | null = null;
  private missionsStack: StackPanel | null = null;
  private menuDebugSeq = 0;

  private menuDebugMsg(message: string, extra?: Record<string, unknown>): void {
    if (!GameApp.DEBUG_MENU_NAV) return;
    const n = ++this.menuDebugSeq;
    if (extra) {
      console.log(`[TankMenu #${n}] ${message}`, extra);
    } else {
      console.log(`[TankMenu #${n}] ${message}`);
    }
  }

  private gameplayBundle: GameplaySceneBundle | null = null;
  private screen: ScreenState = "menu";
  private lastGameplayUiRefresh = 0;
  private gameplayState: GameplayUiState = {
    levelName: "",
    isLoading: false,
    errorMessage: null,
    summary: null,
    debug: null
  };

  public constructor(rootElement: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "game-canvas";

    this.overlay = document.createElement("div");
    this.overlay.className = "ui-layer";

    this.fpsElement = document.createElement("div");
    this.fpsElement.className = "fps-counter";
    this.fpsElement.setAttribute("aria-live", "polite");
    this.fpsElement.textContent = "— FPS";

    rootElement.append(this.canvas, this.overlay, this.fpsElement);

    // Ensure audio is created + unlocked on first user gesture.
    // Some browsers block WebAudio until a gesture, and our UI overlay can intercept canvas events.
    const tryUnlockAudio = (): void => {
      const ae =
        (AbstractEngine as any).audioEngine ??
        ((AbstractEngine as any).audioEngine = new AudioEngine(rootElement));
      try {
        ae.useCustomUnlockedButton = true;
        ae.unlock?.();
        const p = ae.audioContext?.resume?.();
        // If resume() returns a promise, check its result.
        if (p && typeof (p as Promise<unknown>).then === "function") {
          void (p as Promise<unknown>).catch(() => {
            /* ignore */
          });
        }
      } catch {
        // ignore
      }

      const state = {
        unlocked: ae.unlocked,
        mp3: ae.isMP3supported,
        ogg: ae.isOGGsupported,
        ctx: ae.audioContext?.state ?? null
      };
      console.log("[TankController][audio] state:", state);

      // If still suspended, show a one-time explicit button (some browser policies require it).
      if (state.ctx === "suspended" || state.unlocked === false) {
        this.ensureAudioUnlockButton(rootElement, tryUnlockAudio);
      } else if (this.audioUnlockButton) {
        this.audioUnlockButton.remove();
        this.audioUnlockButton = null;
      }
    };
    this.canvas.addEventListener("pointerdown", tryUnlockAudio, { passive: true });
    this.overlay.addEventListener("pointerdown", tryUnlockAudio, { passive: true });

    this.engine = new Engine(this.canvas, true);
    this.menuScene = this.createMenuScene();
    this.currentScene = this.menuScene;
    void this.ensureMenuUi();

    window.addEventListener("resize", () => {
      this.engine.resize();
    });
  }

  private ensureAudioUnlockButton(rootElement: HTMLElement, onClick: () => void): void {
    if (this.audioUnlockButton) return;
    const btn = document.createElement("button");
    btn.textContent = "Enable audio";
    btn.style.position = "absolute";
    btn.style.right = "12px";
    btn.style.bottom = "12px";
    btn.style.zIndex = "9999";
    btn.style.padding = "10px 12px";
    btn.style.borderRadius = "10px";
    btn.style.border = "1px solid rgba(255,255,255,0.2)";
    btn.style.background = "rgba(0,0,0,0.6)";
    btn.style.color = "white";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    rootElement.appendChild(btn);
    this.audioUnlockButton = btn;
  }

  public start(): void {
    this.renderUi();

    this.engine.runRenderLoop(() => {
      this.currentScene.render();
      this.refreshGameplayUi();
      this.updateFpsDisplay();
    });
  }

  private createMenuScene(): Scene {
    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.03, 0.035, 0.05, 1);

    const camera = new FreeCamera("menu_camera", new Vector3(0, 0, -10), scene);
    camera.setTarget(Vector3.Zero());
    scene.activeCamera = camera;

    return scene;
  }

  private setScreen(screen: ScreenState): void {
    this.screen = screen;
    this.renderUi();
  }

  private menuUrlRewriter(url: string): string {
    if (url.startsWith("https://assets.babylonjs.com/textures/Checker_albedo.png")) {
      return new URL("../../assets/ui/menu_background.png", import.meta.url).href;
    }
    return url;
  }

  private async ensureMenuUi(): Promise<void> {
    if (this.menuUi) {
      return;
    }

    const ui = AdvancedDynamicTexture.CreateFullscreenUI("menu_ui", true, this.menuScene);
    ui.useSmallestIdeal = true;

    await AdvancedDynamicTexture.ParseFromFileAsync(
      new URL("../../assets/ui/UI_mainmenu.json", import.meta.url).href,
      true,
      ui,
      (u) => this.menuUrlRewriter(u)
    );

    this.menuUi = ui;

    const btnPlay = ui.getControlByName("mm_btn_play");
    const btnOptions = ui.getControlByName("mm_btn_options");
    const btnSave = ui.getControlByName("mm_btn_save");
    const btnLoad = ui.getControlByName("mm_btn_load");
    btnPlay?.onPointerClickObservable.add(() => {
      this.menuDebugMsg("mm_btn_play onPointerClick → openLevelSelectScreen()");
      void this.openLevelSelectScreen();
    });
    const noop = () => {};
    btnOptions?.onPointerClickObservable.add(noop);
    btnSave?.onPointerClickObservable.add(noop);
    btnLoad?.onPointerClickObservable.add(noop);

    if (GameApp.DEBUG_MENU_NAV) {
      ui.onControlPickedObservable.add((c) => {
        const t = (c as { typeName?: string }).typeName ?? c.constructor.name;
        this.menuDebugMsg(`[menu] onControlPicked name="${c.name}" type=${t}`);
      });
    }

    this.showMainMenu();
  }

  private async ensureLevelSelectUi(): Promise<void> {
    if (this.levelSelectUi) {
      return;
    }

    const ui = AdvancedDynamicTexture.CreateFullscreenUI("level_select_ui", true, this.menuScene);
    ui.useSmallestIdeal = true;
    this.levelSelectUi = ui;

    await AdvancedDynamicTexture.ParseFromFileAsync(
      new URL("../../assets/ui/UI_levels.json", import.meta.url).href,
      true,
      ui,
      (u) => this.menuUrlRewriter(u)
    );

    this.startButton = ui.getControlByName("ps_btn_start");
    this.mapsStack = ui.getControlByName("ps_stack_maps") as StackPanel | null;
    this.missionsStack = ui.getControlByName("ps_stack_missions") as StackPanel | null;

    const btnBack = ui.getControlByName("ps_btn_back");
    if (btnBack) {
      btnBack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      btnBack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      btnBack.left = "1.2%";
      btnBack.top = "1.2%";
      btnBack.onPointerClickObservable.add(() => {
        this.menuDebugMsg("ps_btn_back onPointerClick → showMainMenu()");
        this.showMainMenu();
      });
    } else {
      this.menuDebugMsg("ensureLevelSelectUi: ps_btn_back NOT FOUND");
    }

    this.startButton?.onPointerClickObservable.add(() => {
      if (!this.selectedMap || !this.selectedMission) return;
      void this.startLevel(this.selectedMap.level);
    });

    if (GameApp.DEBUG_MENU_NAV) {
      ui.onControlPickedObservable.add((c) => {
        const t = (c as { typeName?: string }).typeName ?? c.constructor.name;
        this.menuDebugMsg(`[level] onControlPicked name="${c.name}" type=${t}`);
      });
    }

    // Hidden until `showPlaySelect` (avoids a one-frame flash before the first open).
    ui.rootContainer.isVisible = false;
  }

  private async openLevelSelectScreen(): Promise<void> {
    this.menuDebugMsg("openLevelSelectScreen() start");
    await this.ensureMenuUi();
    await this.ensureLevelSelectUi();
    this.showPlaySelect();
    this.menuDebugMsg("openLevelSelectScreen() end (after showPlaySelect)");
  }

  private showMainMenu(): void {
    this.selectedMap = null;
    this.selectedMission = null;
    this.setStartEnabled(false);

    if (this.menuUi) {
      this.menuUi.rootContainer.isVisible = true;
      this.menuUi.isForeground = true;
      this.menuUi.markAsDirty();
    }
    if (this.levelSelectUi) {
      this.levelSelectUi.rootContainer.isVisible = false;
      this.levelSelectUi.isForeground = false;
      this.levelSelectUi.markAsDirty();
    }

    this.menuDebugMsg("showMainMenu: menu vis=" + (this.menuUi?.rootContainer.isVisible ?? "?") + " level vis=" + (this.levelSelectUi?.rootContainer.isVisible ?? "n/a"));
  }

  private showPlaySelect(): void {
    if (this.menuUi) {
      this.menuUi.rootContainer.isVisible = false;
      this.menuUi.isForeground = false;
      this.menuUi.markAsDirty();
    }
    if (this.levelSelectUi) {
      this.levelSelectUi.rootContainer.isVisible = true;
      this.levelSelectUi.isForeground = true;
      this.levelSelectUi.markAsDirty();
    }

    this.selectedMap = null;
    this.selectedMission = null;
    this.populateMaps();
    this.populateMissions(null);
    this.setStartEnabled(false);

    this.menuDebugMsg("showPlaySelect: level vis=" + (this.levelSelectUi?.rootContainer.isVisible ?? "?"));
  }

  private setStartEnabled(enabled: boolean): void {
    if (!this.startButton) return;
    this.startButton.isEnabled = enabled;
    // Simple visual: dim when disabled.
    this.startButton.alpha = enabled ? 1 : 0.35;
  }

  private populateMaps(): void {
    if (!this.mapsStack) return;
    this.mapsStack.clearControls();

    for (const map of MENU_MAPS) {
      const row = this.createListRow(map.label, () => {
        this.selectedMap = map;
        this.selectedMission = null;
        this.populateMissions(map);
        this.setStartEnabled(false);
      });
      this.mapsStack.addControl(row);
    }
  }

  private populateMissions(map: MenuMapEntry | null): void {
    if (!this.missionsStack) return;
    this.missionsStack.clearControls();
    if (!map) return;

    for (const mission of map.missions) {
      const row = this.createListRow(mission.label, () => {
        this.selectedMission = mission;
        this.setStartEnabled(Boolean(this.selectedMap && this.selectedMission));
      });
      this.missionsStack.addControl(row);
    }
  }

  private createListRow(label: string, onClick: () => void): Control {
    const btn = Button.CreateSimpleButton(`row_${label}`, label);
    btn.width = "100%";
    btn.height = "52px";
    btn.thickness = 0;
    btn.background = "#00000000";
    btn.color = "#D1D1D1";
    btn.paddingLeft = "8px";
    btn.paddingRight = "8px";
    btn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    btn.onPointerClickObservable.add(onClick);

    const tb = btn.textBlock as TextBlock;
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tb.fontSize = "28px";

    // Hover feedback
    btn.onPointerEnterObservable.add(() => {
      btn.background = "#00000055";
    });
    btn.onPointerOutObservable.add(() => {
      btn.background = "#00000000";
    });

    return btn;
  }

  private async startLevel(level: LevelDefinition): Promise<void> {
    this.screen = "gameplay";
    this.gameplayState = {
      levelName: level.name,
      isLoading: true,
      errorMessage: null,
        summary: null,
        debug: null
    };
    this.renderUi();

    try {
      const bundle = await createGameplayScene(this.engine, level, tankConfig, this.canvas);
      const previousScene = this.currentScene;
      this.disposeGameplayBundle();
      this.gameplayBundle = bundle;
      this.currentScene = bundle.scene;
      // Keep menu scene + UI alive; dispose only gameplay scenes when leaving gameplay.
      if (previousScene !== this.menuScene) {
        previousScene.dispose();
      }

      this.gameplayState = {
        levelName: level.name,
        isLoading: false,
        errorMessage: null,
        summary: bundle.summary,
        debug: bundle.getDebugState()
      };
    } catch (error) {
      this.gameplayState = {
        levelName: level.name,
        isLoading: false,
        errorMessage: error instanceof Error ? error.message : "Unknown gameplay loading error.",
        summary: null,
        debug: null
      };
    }

    this.renderUi();
  }

  private returnToMainMenu(): void {
    if (this.screen === "gameplay") {
      this.disposeGameplayBundle();
      this.currentScene.dispose();
      this.currentScene = this.menuScene;
      this.gameplayState = {
        levelName: "",
        isLoading: false,
        errorMessage: null,
        summary: null,
        debug: null
      };
    }

    void this.ensureMenuUi().then(() => this.showMainMenu());
    this.setScreen("menu");
  }

  private renderUi(): void {
    this.overlay.innerHTML = "";

    if (this.screen !== "gameplay") {
      return;
    }

    const panel = document.createElement("div");
    panel.className = GameApp.SHOW_GAMEPLAY_DEBUG_PANEL ? "panel panel-debug" : "panel panel-menu";

    panel.append(createButton("Back To Menu", () => this.returnToMainMenu()));
    this.overlay.append(panel);
  }

  private refreshGameplayUi(): void {
    if (
      this.screen !== "gameplay" ||
      !this.gameplayBundle ||
      this.gameplayState.isLoading ||
      !GameApp.SHOW_GAMEPLAY_DEBUG_PANEL
    ) {
      return;
    }

    const now = performance.now();
    if (now - this.lastGameplayUiRefresh < 100) {
      return;
    }

    this.lastGameplayUiRefresh = now;
    this.gameplayState = {
      ...this.gameplayState,
      debug: this.gameplayBundle.getDebugState()
    };
    this.renderUi();
  }

  private disposeGameplayBundle(): void {
    this.gameplayBundle?.dispose();
    this.gameplayBundle = null;
  }

  private updateFpsDisplay(): void {
    const fps = Math.round(this.engine.getFps());
    this.fpsElement.textContent = `${fps} FPS`;
  }
}

function createButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "ui-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

// (formatVector removed; previous HTML debug panel trimmed)
