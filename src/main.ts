// Audio engine must be registered before Engine is constructed anywhere.
import "@babylonjs/core/Audio/audioEngine";
import "@babylonjs/core/Audio/audioSceneComponent";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent";
import "./styles.css";
import { GameApp } from "./app/GameApp";
import { AudioEngine } from "@babylonjs/core/Audio/audioEngine";
import { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("App root element '#app' was not found.");
}

// Babylon Sound (v9) uses `AbstractEngine.audioEngine`.
// Create it explicitly if the bundler didn't.
if (!(AbstractEngine as any).audioEngine) {
  (AbstractEngine as any).audioEngine = new AudioEngine(rootElement);
}

const app = new GameApp(rootElement);
app.start();
