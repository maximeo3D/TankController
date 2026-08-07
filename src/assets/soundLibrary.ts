import {
  armoredCarHornSoundAssetUrl,
  armoredCarIdleSoundAssetUrl,
  armoredCarMoveSoundAssetUrl,
  armoredCarTurboSoundAssetUrl,
  jetIdleSoundAssetUrl,
  jetMoveSoundAssetUrl,
  jetTurboSoundAssetUrl,
  helicopterBladesSoundAssetUrl,
  missileLockSoundAssetUrl,
  suspensionImpactSoundAssetUrl,
  tankHornSoundAssetUrl,
  tankIdleSoundAssetUrl,
  tankMoveSoundAssetUrl,
  tankTurboSoundAssetUrl
} from "./assetUrls";

/**
 * Sons adressables par clé depuis les configs véhicule (`audio.*`). Les URLs
 * doivent rester statiques pour que le bundler les résolve, d'où ce catalogue
 * plutôt qu'une construction de chemin à la volée.
 */
export const vehicleSoundUrls: Record<string, string> = {
  tank_idle: tankIdleSoundAssetUrl,
  tank_move: tankMoveSoundAssetUrl,
  tank_turbo: tankTurboSoundAssetUrl,
  tank_horn: tankHornSoundAssetUrl,
  armoredcar_idle: armoredCarIdleSoundAssetUrl,
  armoredcar_move: armoredCarMoveSoundAssetUrl,
  armoredcar_turbo: armoredCarTurboSoundAssetUrl,
  armoredcar_horn: armoredCarHornSoundAssetUrl,
  jet_idle: jetIdleSoundAssetUrl,
  jet_move: jetMoveSoundAssetUrl,
  jet_turbo: jetTurboSoundAssetUrl,
  helicopter_blades: helicopterBladesSoundAssetUrl,
  missile_lock: missileLockSoundAssetUrl,
  suspension: suspensionImpactSoundAssetUrl
};

export type VehicleSoundKey = keyof typeof vehicleSoundUrls;

/** `null` explicite en config = son volontairement désactivé. */
export function resolveVehicleSoundUrl(key: string | null | undefined): string | null {
  if (key === null) {
    return null;
  }
  if (key === undefined) {
    return null;
  }

  const url = vehicleSoundUrls[key];
  if (!url) {
    console.warn(`[TankController][audio] unknown sound key "${key}"`);
    return null;
  }
  return url;
}
