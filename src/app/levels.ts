export interface LevelDefinition {
  id: string;
  name: string;
  description: string;
}

export const levels: LevelDefinition[] = [
  {
    id: "training-ground",
    name: "Training Ground",
    description: "Loads the current terrain GLB and spawns the player tank."
  }
];
