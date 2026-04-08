import { Engine } from "@babylonjs/core/Engines/engine";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { levels, type LevelDefinition } from "./levels";
import { tankConfig } from "../config/tankController";
import {
  createGameplayScene,
  type GameplaySceneBundle,
  type GameplaySceneSummary
} from "../game/createGameplayScene";
import type { TankGameplayDebugState } from "../game/TankGameplayController";

type ScreenState = "main-menu" | "controls" | "level-select" | "gameplay";

interface GameplayUiState {
  levelName: string;
  isLoading: boolean;
  errorMessage: string | null;
  summary: GameplaySceneSummary | null;
  debug: TankGameplayDebugState | null;
}

export class GameApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLDivElement;
  private readonly engine: Engine;
  private currentScene: Scene;
  private gameplayBundle: GameplaySceneBundle | null = null;
  private screen: ScreenState = "main-menu";
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

    rootElement.append(this.canvas, this.overlay);

    this.engine = new Engine(this.canvas, true);
    this.currentScene = this.createMenuScene();

    window.addEventListener("resize", () => {
      this.engine.resize();
    });
  }

  public start(): void {
    this.renderUi();

    this.engine.runRenderLoop(() => {
      this.currentScene.render();
      this.refreshGameplayUi();
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
      previousScene.dispose();

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
      this.currentScene = this.createMenuScene();
      this.gameplayState = {
        levelName: "",
        isLoading: false,
        errorMessage: null,
        summary: null,
        debug: null
      };
    }

    this.setScreen("main-menu");
  }

  private renderUi(): void {
    this.overlay.innerHTML = "";

    const panel = document.createElement("div");
    panel.className = this.screen === "gameplay" ? "panel panel-debug" : "panel panel-menu";

    if (this.screen === "main-menu") {
      panel.append(
        createTitle("TankController"),
        createParagraph("Prototype bootstrap for Babylon.js + Havok."),
        createButton("Play", () => this.setScreen("level-select")),
        createButton("Controls", () => this.setScreen("controls"))
      );
    }

    if (this.screen === "controls") {
      panel.append(
        createTitle("Controls"),
        createParagraph("ZQSD: move"),
        createParagraph("Shift: boost"),
        createParagraph("Mouse X/Y: turret and cannon"),
        createParagraph("1 / 2: switch weapon"),
        createParagraph("Left click hold: fire"),
        createParagraph("Right click hold: zoom"),
        createButton("Back", () => this.setScreen("main-menu"))
      );
    }

    if (this.screen === "level-select") {
      panel.append(createTitle("Select Level"));

      for (const level of levels) {
        panel.append(
          createParagraph(level.description),
          createButton(level.name, () => {
            void this.startLevel(level);
          })
        );
      }

      panel.append(createButton("Back", () => this.setScreen("main-menu")));
    }

    if (this.screen === "gameplay") {
      panel.append(createTitle(this.gameplayState.levelName || "Gameplay"));

      if (this.gameplayState.isLoading) {
        panel.append(createParagraph("Loading terrain, tank and Havok scene..."));
      }

      if (this.gameplayState.errorMessage) {
        panel.append(createParagraph(`Error: ${this.gameplayState.errorMessage}`));
      }

      if (this.gameplayState.summary) {
        panel.append(
          createParagraph(`Spawn found: ${this.gameplayState.summary.spawnFound ? "yes" : "no"}`),
          createParagraph(`Tank camera: ${this.gameplayState.summary.tankCameraFound ? "yes" : "no"}`),
          createParagraph(`Terrain SM_: ${this.gameplayState.summary.terrainStaticMeshes}`),
          createParagraph(`Terrain DM_: ${this.gameplayState.summary.terrainDynamicMeshes}`),
          createParagraph(`Terrain COL_: ${this.gameplayState.summary.terrainColliderMeshes}`),
          createParagraph(
            `Tank bones: ${this.gameplayState.summary.tankBones.join(", ") || "missing"}`
          )
        );
      }

      if (this.gameplayState.debug) {
        panel.append(
          createParagraph(`Battery: ${this.gameplayState.debug.battery.toFixed(1)}%`),
          createParagraph(`Overcharge: ${this.gameplayState.debug.overcharge.toFixed(1)}%`),
          createParagraph(`Weapon: ${this.gameplayState.debug.activeWeapon}`),
          createParagraph(`Boost active: ${this.gameplayState.debug.boostActive ? "yes" : "no"}`),
          createParagraph(`Zoom active: ${this.gameplayState.debug.zoomActive ? "yes" : "no"}`),
          createParagraph(`Fire held: ${this.gameplayState.debug.fireHeld ? "yes" : "no"}`),
          createParagraph(
            `Shells: ${this.gameplayState.debug.shellReserveAmmo} reserve / ${
              this.gameplayState.debug.shellChambered ? "chambered" : "reloading"
            }`
          ),
          createParagraph(
            `Position: ${formatVector(this.gameplayState.debug.position.x)}, ${formatVector(
              this.gameplayState.debug.position.y
            )}, ${formatVector(this.gameplayState.debug.position.z)}`
          )
        );
      }

      panel.append(createButton("Back To Menu", () => this.returnToMainMenu()));
    }

    this.overlay.append(panel);
  }

  private refreshGameplayUi(): void {
    if (this.screen !== "gameplay" || !this.gameplayBundle || this.gameplayState.isLoading) {
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
}

function createButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "ui-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function createTitle(text: string): HTMLHeadingElement {
  const heading = document.createElement("h1");
  heading.className = "ui-title";
  heading.textContent = text;
  return heading;
}

function createParagraph(text: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = "ui-text";
  paragraph.textContent = text;
  return paragraph;
}

function formatVector(value: number): string {
  return value.toFixed(2);
}
