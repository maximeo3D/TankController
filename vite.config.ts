import { defineConfig } from "vite";

export default defineConfig({
  base: "/TankController/",
  server: {
    host: "0.0.0.0"
  },
  optimizeDeps: {
    // Havok must stay external (WASM).
    exclude: ["@babylonjs/havok"],
    include: [
      "@babylonjs/core",
      "@babylonjs/core/Layers/effectLayerSceneComponent",
      "@babylonjs/core/Layers/highlightLayer",
      "@babylonjs/gui",
      "@babylonjs/loaders/glTF"
    ]
  }
});
