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
import type { VehicleDebugState } from "../game/vehicle/VehicleController";
import { AdvancedDynamicTexture, Button, Control, Image, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import { MENU_MAPS, type MenuMapEntry, type MenuMission } from "../ui/menuData";
import { applyUiFontToTexture, UI_FONT_FAMILY } from "../ui/applyUiFont";
import { TARGET_FPS, waitAnimationFrames } from "../game/frameTiming";

type ScreenState = "menu" | "gameplay";

interface GameplayUiState {
  levelName: string;
  isLoading: boolean;
  errorMessage: string | null;
  summary: GameplaySceneSummary | null;
  debug: VehicleDebugState | null;
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
  private loadingScene: Scene | null = null;
  private loadingUi: AdvancedDynamicTexture | null = null;
  private loadingBackgroundImage: Image | null = null;
  private loadingProgressFill: Rectangle | null = null;
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
  private missionPreviewImage: Image | null = null;
  private missionDescriptionText: TextBlock | null = null;
  private pauseUi: AdvancedDynamicTexture | null = null;
  private deathUi: AdvancedDynamicTexture | null = null;
  private currentLevel: LevelDefinition | null = null;
  private currentMission: MenuMission | null = null;
  private isPaused = false;
  private isPlayerDead = false;
  private isStartingLevel = false;
  private menuDebugSeq = 0;
  private lastCanvasWidth = 0;
  private lastCanvasHeight = 0;
  private renderLoopActive = false;

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
    window.addEventListener("keydown", this.handleGlobalKeyDown);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);

    this.engine = new Engine(this.canvas, true, {
      adaptToDeviceRatio: true,
      antialias: true,
      stencil: true
    });
    this.engine.maxFPS = TARGET_FPS;
    this.menuScene = this.createMenuScene();
    this.currentScene = this.menuScene;
    void this.ensureMenuUi();

    this.mountEngineResizeHandling(rootElement);
  }

  /** Resize when CSS dimensions change (cheap path for the render loop). */
  private syncEngineSize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width <= 0 || height <= 0) {
      return;
    }
    if (width === this.lastCanvasWidth && height === this.lastCanvasHeight) {
      return;
    }

    this.lastCanvasWidth = width;
    this.lastCanvasHeight = height;
    this.engine.resize();
  }

  private startRenderLoop(): void {
    if (this.renderLoopActive) {
      return;
    }

    this.renderLoopActive = true;
    this.engine.runRenderLoop(() => {
      this.syncEngineSize();
      this.currentScene.render();
      this.refreshGameplayUi();
      this.updateFpsDisplay();
    });
  }

  private activateScene(scene: Scene): void {
    this.currentScene = scene;
    this.lastCanvasWidth = 0;
    this.lastCanvasHeight = 0;
    this.syncEngineSize();
    this.updateCursorMode();
  }

  private mountEngineResizeHandling(rootElement: HTMLElement): void {
    const sync = (): void => {
      this.lastCanvasWidth = 0;
      this.lastCanvasHeight = 0;
      this.syncEngineSize();
    };

    window.addEventListener("resize", sync);

    const resizeObserver = new ResizeObserver(() => {
      sync();
    });
    resizeObserver.observe(rootElement);
    resizeObserver.observe(this.canvas);

    sync();
    requestAnimationFrame(sync);
  }

  private readonly handleGlobalKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key !== "Escape" &&
      this.screen === "gameplay" &&
      !this.isPaused &&
      !this.isPlayerDead &&
      !this.gameplayState.isLoading &&
      document.pointerLockElement !== this.canvas
    ) {
      this.requestGameplayPointerLockFromGesture();
    }

    if (event.key !== "Escape" || this.screen !== "gameplay" || this.gameplayState.isLoading || this.isPlayerDead) {
      return;
    }

    event.preventDefault();
    this.setPaused(!this.isPaused);
  };

  private readonly handlePointerLockChange = (): void => {
    if (
      document.pointerLockElement === this.canvas ||
      this.screen !== "gameplay" ||
      this.gameplayState.isLoading ||
      !this.gameplayBundle ||
      this.isPlayerDead ||
      this.isPaused
    ) {
      return;
    }

    this.setPaused(true);
  };

  private setPaused(paused: boolean, requestPointerLockOnResume = true): void {
    if (!this.gameplayBundle || this.isPlayerDead || this.isPaused === paused) {
      return;
    }

    this.isPaused = paused;
    this.gameplayBundle.setPaused(paused);
    if (this.pauseUi) {
      this.pauseUi.rootContainer.isVisible = paused;
      this.pauseUi.rootContainer.isHitTestVisible = paused;
      this.pauseUi.markAsDirty();
    }
    this.updateCursorMode();

    if (paused && document.pointerLockElement) {
      document.exitPointerLock();
    } else if (requestPointerLockOnResume) {
      this.requestGameplayPointerLockFromGesture();
    }
  }

  private requestGameplayPointerLockFromGesture(): void {
    if (document.pointerLockElement === this.canvas) {
      return;
    }

    this.canvas.focus();
    void this.canvas.requestPointerLock().catch(() => {
      // Browser may reject if this is not tied to a current user gesture.
    });
  }

  private updateCursorMode(): void {
    const hideCursor =
      this.screen === "gameplay" &&
      !this.isPaused &&
      !this.isPlayerDead &&
      !this.gameplayState.isLoading;
    const cursor = hideCursor ? "none" : "default";

    this.canvas.style.cursor = cursor;
    this.currentScene.defaultCursor = cursor;
    this.currentScene.hoverCursor = cursor;
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
    this.lastCanvasWidth = 0;
    this.lastCanvasHeight = 0;
    this.syncEngineSize();
    this.startRenderLoop();
  }

  private createMenuScene(): Scene {
    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.03, 0.035, 0.05, 1);

    const camera = new FreeCamera("menu_camera", new Vector3(0, 0, -10), scene);
    camera.setTarget(Vector3.Zero());
    scene.activeCamera = camera;

    return scene;
  }

  private getLoadingScene(): Scene {
    if (!this.loadingScene) {
      const scene = new Scene(this.engine);
      scene.clearColor = new Color4(0.05, 0.06, 0.08, 1);
      const camera = new FreeCamera("loading_camera", new Vector3(0, 0, -10), scene);
      camera.setTarget(Vector3.Zero());
      scene.activeCamera = camera;
      this.createLoadingUi(scene);
      this.loadingScene = scene;
    }
    return this.loadingScene;
  }

  private createLoadingUi(scene: Scene): void {
    const ui = AdvancedDynamicTexture.CreateFullscreenUI("loading_ui", true, scene);
    this.loadingUi = ui;

    const background = new Image("loading_mission_background");
    background.width = "100%";
    background.height = "100%";
    background.stretch = Image.STRETCH_FILL;
    background.source = "";
    ui.addControl(background);
    this.loadingBackgroundImage = background;

    const dimmer = new Rectangle("loading_dimmer");
    dimmer.width = "100%";
    dimmer.height = "100%";
    dimmer.thickness = 0;
    dimmer.background = "rgba(0, 0, 0, 0.34)";
    ui.addControl(dimmer);

    const progressTrack = new Rectangle("loading_progress_track");
    progressTrack.width = "78%";
    progressTrack.height = "8px";
    progressTrack.thickness = 0;
    progressTrack.background = "rgba(255, 255, 255, 0.24)";
    progressTrack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    progressTrack.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    progressTrack.top = "-54px";
    ui.addControl(progressTrack);

    const progressFill = new Rectangle("loading_progress_fill");
    progressFill.width = "0%";
    progressFill.height = "100%";
    progressFill.thickness = 0;
    progressFill.background = "#FFFFFFFF";
    progressFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    progressFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    progressTrack.addControl(progressFill);
    this.loadingProgressFill = progressFill;

    applyUiFontToTexture(ui);
  }

  private updateLoadingScreen(mission: MenuMission | null, progress: number): void {
    if (this.loadingBackgroundImage) {
      this.loadingBackgroundImage.source = mission?.imageUrl ?? "";
    }
    if (this.loadingProgressFill) {
      const clampedProgress = Math.max(0, Math.min(1, progress));
      this.loadingProgressFill.width = `${Math.round(clampedProgress * 100)}%`;
    }
    this.loadingUi?.markAsDirty();
  }

  private createPauseUi(scene: Scene): AdvancedDynamicTexture {
    const ui = AdvancedDynamicTexture.CreateFullscreenUI("pause_menu_ui", true, scene);
    ui.rootContainer.isVisible = false;
    ui.rootContainer.isHitTestVisible = false;

    const dimmer = new Rectangle("pause_menu_dimmer");
    dimmer.width = "100%";
    dimmer.height = "100%";
    dimmer.thickness = 0;
    dimmer.background = "rgba(25, 30, 36, 0.58)";
    ui.addControl(dimmer);

    const stack = new StackPanel("pause_menu_stack");
    stack.width = "420px";
    stack.isVertical = true;
    stack.spacing = 10;
    stack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    ui.addControl(stack);

    stack.addControl(this.createPauseButton("RESUME", () => {
      this.requestGameplayPointerLockFromGesture();
      this.setPaused(false);
    }, true));
    stack.addControl(this.createPauseButton("RESTART", () => {
      this.requestGameplayPointerLockFromGesture();
      void this.restartCurrentLevel();
    }, true));
    stack.addControl(this.createPauseButton("BRIEFING", () => {
      // Placeholder for future briefing panel.
    }));
    stack.addControl(this.createPauseButton("OPTIONS", () => {
      // Placeholder for future options panel.
    }));
    stack.addControl(this.createPauseButton("EXIT", () => {
      void this.exitToLevelSelect();
    }));

    applyUiFontToTexture(ui);
    return ui;
  }

  private createDeathUi(scene: Scene): AdvancedDynamicTexture {
    const ui = AdvancedDynamicTexture.CreateFullscreenUI("death_menu_ui", true, scene);
    ui.rootContainer.isVisible = false;
    ui.rootContainer.isHitTestVisible = false;

    const dimmer = new Rectangle("death_menu_dimmer");
    dimmer.width = "100%";
    dimmer.height = "100%";
    dimmer.thickness = 0;
    dimmer.background = "rgba(18, 20, 24, 0.74)";
    ui.addControl(dimmer);

    const stack = new StackPanel("death_menu_stack");
    stack.width = "420px";
    stack.isVertical = true;
    stack.spacing = 10;
    stack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    ui.addControl(stack);

    stack.addControl(this.createPauseButton("RESTART", () => {
      this.requestGameplayPointerLockFromGesture();
      void this.restartCurrentLevel();
    }, true));
    stack.addControl(this.createPauseButton("EXIT", () => {
      void this.exitToLevelSelect();
    }));

    applyUiFontToTexture(ui);
    return ui;
  }

  private createPauseButton(label: string, onActivate: () => void, activateOnPointerDown = false): Button {
    const button = Button.CreateSimpleButton(`pause_btn_${label.toLowerCase()}`, label);
    button.width = "410px";
    button.height = "84px";
    button.thickness = 1;
    button.cornerRadius = 4;
    button.color = "#d8dadd";
    button.background = "#171b20";
    button.hoverCursor = "pointer";
    button.onPointerEnterObservable.add(() => {
      button.background = "#232932";
    });
    button.onPointerOutObservable.add(() => {
      button.background = "#171b20";
    });
    if (activateOnPointerDown) {
      button.onPointerDownObservable.add(onActivate);
    } else {
      button.onPointerClickObservable.add(onActivate);
    }

    const text = button.textBlock as TextBlock | undefined;
    if (text) {
      text.fontFamily = UI_FONT_FAMILY;
      text.fontStyle = "";
      text.fontSize = "48px";
      text.color = "#d8dadd";
    }

    return button;
  }

  private disposeSceneIfTemporary(scene: Scene): void {
    if (scene === this.menuScene || scene === this.loadingScene) {
      return;
    }
    scene.dispose();
  }

  private setScreen(screen: ScreenState): void {
    this.screen = screen;
    this.renderUi();
    this.updateCursorMode();
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
    applyUiFontToTexture(ui);

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
    applyUiFontToTexture(ui);

    this.startButton = ui.getControlByName("ps_btn_start");
    this.mapsStack = ui.getControlByName("ps_stack_maps") as StackPanel | null;
    this.missionsStack = ui.getControlByName("ps_stack_missions") as StackPanel | null;
    this.missionPreviewImage = ui.getControlByName("ps_mission_preview_image") as Image | null;
    this.missionDescriptionText = ui.getControlByName("ps_mission_description") as TextBlock | null;

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

    this.startButton?.onPointerDownObservable.add(() => {
      if (!this.selectedMap || !this.selectedMission) return;
      this.requestGameplayPointerLockFromGesture();
      void this.startLevel(this.selectedMap.level, this.selectedMission);
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
    this.setMissionDetails(null, null);
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
        this.setMissionDetails(map, null);
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
        this.setMissionDetails(map, mission);
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
    tb.fontFamily = UI_FONT_FAMILY;
    tb.fontStyle = "";

    // Hover feedback
    btn.onPointerEnterObservable.add(() => {
      btn.background = "#00000055";
    });
    btn.onPointerOutObservable.add(() => {
      btn.background = "#00000000";
    });

    return btn;
  }

  private setMissionDetails(map: MenuMapEntry | null, mission: MenuMission | null): void {
    if (!mission || !map) {
      if (this.missionPreviewImage) {
        this.missionPreviewImage.isVisible = false;
        this.missionPreviewImage.source = "";
      }
      if (this.missionDescriptionText) {
        this.missionDescriptionText.text = "Selectionne une mission pour afficher son briefing.";
      }
      return;
    }

    if (this.missionPreviewImage) {
      this.missionPreviewImage.source = mission.imageUrl;
      this.missionPreviewImage.isVisible = true;
    }
    if (this.missionDescriptionText) {
      this.missionDescriptionText.text = mission.description;
    }
  }

  private setMenuSceneUiActive(active: boolean): void {
    for (const ui of [this.menuUi, this.levelSelectUi]) {
      if (!ui) {
        continue;
      }
      ui.rootContainer.isVisible = active;
      ui.isForeground = active;
      ui.rootContainer.isHitTestVisible = active;
      ui.markAsDirty();
    }
  }

  private showDeathScreen(): void {
    if (!this.gameplayBundle || !this.deathUi) {
      return;
    }

    this.isPlayerDead = true;
    this.isPaused = false;
    this.gameplayBundle.setPaused(false);
    if (this.pauseUi) {
      this.pauseUi.rootContainer.isVisible = false;
      this.pauseUi.rootContainer.isHitTestVisible = false;
      this.pauseUi.markAsDirty();
    }
    this.deathUi.rootContainer.isVisible = true;
    this.deathUi.rootContainer.isHitTestVisible = true;
    this.deathUi.markAsDirty();
    this.updateCursorMode();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  private createRadarWorldBounds(mission: MenuMission | null): {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    rotationDeg?: 0 | 90 | 180 | 270;
    flipX?: boolean;
    flipY?: boolean;
    zoom?: number;
  } | null {
    const radar = mission?.radar;
    if (!radar) {
      return null;
    }

    const halfWidth = radar.width / 2;
    const halfHeight = radar.height / 2;
    return {
      minX: radar.centerX - halfWidth,
      maxX: radar.centerX + halfWidth,
      minZ: radar.centerZ - halfHeight,
      maxZ: radar.centerZ + halfHeight,
      rotationDeg: radar.rotationDeg,
      flipX: radar.flipX,
      flipY: radar.flipY,
      zoom: radar.zoom
    };
  }

  private async startLevel(level: LevelDefinition, mission: MenuMission | null = this.currentMission): Promise<void> {
    if (this.isStartingLevel) {
      return;
    }

    const sceneToDispose = this.currentScene;
    this.isStartingLevel = true;
    this.isPlayerDead = false;
    this.currentLevel = level;
    this.currentMission = mission;
    this.setPaused(false);
    this.setMenuSceneUiActive(false);
    this.screen = "gameplay";
    this.gameplayState = {
      levelName: level.name,
      isLoading: true,
      errorMessage: null,
      summary: null,
      debug: null
    };
    this.pauseUi?.dispose();
    this.pauseUi = null;
    this.deathUi?.dispose();
    this.deathUi = null;
    this.disposeGameplayBundle();
    this.disposeSceneIfTemporary(sceneToDispose);
    this.activateScene(this.getLoadingScene());
    this.updateLoadingScreen(mission, 0);
    this.renderUi();
    await waitAnimationFrames(2);

    try {
      const bundle = await createGameplayScene(
        this.engine,
        level,
        mission,
        tankConfig,
        this.canvas,
        (progress) => {
          this.updateLoadingScreen(mission, progress);
        },
        () => this.showDeathScreen(),
        mission?.radarMapUrl ?? null,
        this.createRadarWorldBounds(mission)
      );
      const previousScene = this.currentScene;
      this.disposeGameplayBundle();
      this.gameplayBundle = bundle;
      this.pauseUi = this.createPauseUi(bundle.scene);
      this.deathUi = this.createDeathUi(bundle.scene);
      this.activateScene(bundle.scene);
      this.disposeSceneIfTemporary(previousScene);
      await waitAnimationFrames(2);

      this.gameplayState = {
        levelName: level.name,
        isLoading: false,
        errorMessage: null,
        summary: bundle.summary,
        debug: bundle.getDebugState()
      };
      this.updateCursorMode();
    } catch (error) {
      this.gameplayState = {
        levelName: level.name,
        isLoading: false,
        errorMessage: error instanceof Error ? error.message : "Unknown gameplay loading error.",
        summary: null,
        debug: null
      };
      this.updateCursorMode();
    }

    this.isStartingLevel = false;
    this.renderUi();
  }

  private async restartCurrentLevel(): Promise<void> {
    if (!this.currentLevel) {
      return;
    }

    await this.startLevel(this.currentLevel, this.currentMission);
  }

  private async exitToLevelSelect(): Promise<void> {
    this.isPlayerDead = false;
    this.setPaused(false, false);
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this.pauseUi?.dispose();
    this.pauseUi = null;
    this.deathUi?.dispose();
    this.deathUi = null;
    this.disposeGameplayBundle();
    this.disposeSceneIfTemporary(this.currentScene);
    this.currentScene = this.menuScene;
    this.currentLevel = null;
    this.currentMission = null;
    this.gameplayState = {
      levelName: "",
      isLoading: false,
      errorMessage: null,
      summary: null,
      debug: null
    };

    await this.ensureMenuUi();
    await this.ensureLevelSelectUi();
    this.setScreen("menu");
    this.showPlaySelect();
    this.activateScene(this.menuScene);
  }

  private renderUi(): void {
    this.overlay.innerHTML = "";

    if (this.screen !== "gameplay") {
      return;
    }

    const panel = document.createElement("div");
    panel.className = GameApp.SHOW_GAMEPLAY_DEBUG_PANEL ? "panel panel-debug" : "panel panel-menu";

    if (this.gameplayState.errorMessage) {
      const error = document.createElement("p");
      error.textContent = this.gameplayState.errorMessage;
      error.style.color = "#ff6b6b";
      error.style.marginTop = "0.75rem";
      panel.append(error);
    }

    if (this.gameplayState.errorMessage) {
      this.overlay.append(panel);
    }
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

// (formatVector removed; previous HTML debug panel trimmed)
