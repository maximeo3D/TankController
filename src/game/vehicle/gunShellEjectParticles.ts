import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import { shellCasingParticleUrl } from "../../assets/assetUrls";

const LOCAL_DIR_MIN = new Vector3(-0.225, 0.65, -0.1);
const LOCAL_DIR_MAX = new Vector3(0.225, 1, 0.175);
const localDir = new Vector3();

export interface GunShellEjectParticleBundle {
  playEject(): void;
  dispose(): void;
}

/**
 * Douilles éjectées depuis l'empty `FX_shells` : 1 sprite par coup, gravité monde, tumbling.
 * La direction locale +Y de l'empty vise le flux ; oriente-le dans Blender pour régler le côté.
 */
export function createGunShellEjectParticleBundle(
  scene: Scene,
  shellsNode: TransformNode | AbstractMesh | null
): GunShellEjectParticleBundle | null {
  if (!shellsNode) {
    return null;
  }

  if ("isVisible" in shellsNode) {
    shellsNode.isVisible = false;
  }

  const emitter = MeshBuilder.CreateBox("FX_shell_eject_emitter", { size: 0.01 }, scene);
  emitter.isVisible = false;
  emitter.isPickable = false;
  emitter.parent = shellsNode;
  emitter.position.setAll(0);

  const ps = new ParticleSystem("gun_shell_eject", 96, scene);
  ps.particleTexture = new Texture(shellCasingParticleUrl, scene, true, false);
  ps.particleTexture.hasAlpha = true;
  ps.emitter = emitter;
  // Monde : une fois éjectée, la douille ne suit plus l'arme (sinon ça ressemble à du vent).
  ps.isLocal = false;
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.isBillboardBased = true;
  ps.billboardMode = 7;
  ps.renderingGroupId = 0;

  ps.minEmitBox = new Vector3(-0.004, -0.002, -0.004);
  ps.maxEmitBox = new Vector3(0.004, 0.002, 0.004);

  ps.startDirectionFunction = (worldMatrix, directionToUpdate) => {
    localDir.set(
      LOCAL_DIR_MIN.x + Math.random() * (LOCAL_DIR_MAX.x - LOCAL_DIR_MIN.x),
      LOCAL_DIR_MIN.y + Math.random() * (LOCAL_DIR_MAX.y - LOCAL_DIR_MIN.y),
      LOCAL_DIR_MIN.z + Math.random() * (LOCAL_DIR_MAX.z - LOCAL_DIR_MIN.z)
    );
    Vector3.TransformNormalToRef(localDir, worldMatrix, directionToUpdate);
    directionToUpdate.normalize();
  };

  ps.minEmitPower = 1.8;
  ps.maxEmitPower = 2.2;
  ps.gravity = new Vector3(0, -9.81, 0);

  ps.minLifeTime = 1;
  ps.maxLifeTime = 1;
  ps.minSize = 0.03;
  ps.maxSize = 0.03;
  ps.minScaleX = 0.65;
  ps.maxScaleX = 0.65;
  ps.minScaleY = 1;
  ps.maxScaleY = 1;
  ps.minInitialRotation = 0;
  ps.maxInitialRotation = Math.PI * 2;
  ps.minAngularSpeed = -14;
  ps.maxAngularSpeed = 14;

  ps.color1 = new Color4(1, 1, 1, 1);
  ps.color2 = new Color4(1, 0.92, 0.72, 1);
  ps.colorDead = new Color4(1, 1, 1, 0);
  ps.emitRate = 0;
  ps.updateSpeed = 1 / 60;
  ps.start();

  return {
    playEject(): void {
      emitter.computeWorldMatrix(true);
      ps.manualEmitCount = 1;
    },
    dispose(): void {
      ps.stop();
      ps.dispose();
      emitter.dispose();
    }
  };
}
