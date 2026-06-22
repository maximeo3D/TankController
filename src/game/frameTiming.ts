/** Target render / simulation rate for consistent gameplay feel across displays. */
export const TARGET_FPS = 60;

export const TARGET_FRAME_SEC = 1 / TARGET_FPS;

export const TARGET_FRAME_MS = 1000 / TARGET_FPS;

/** Yield to the browser so the Babylon render loop can paint between heavy load steps. */
export function waitAnimationFrames(frameCount = 1): Promise<void> {
  if (frameCount <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let remaining = frameCount;
    const step = (): void => {
      if (--remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
