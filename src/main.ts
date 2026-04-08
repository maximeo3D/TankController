import "./styles.css";
import { GameApp } from "./app/GameApp";

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("App root element '#app' was not found.");
}

const app = new GameApp(rootElement);
app.start();
