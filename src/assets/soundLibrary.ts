import {
  armoredCarHornSoundAssetUrl,
  armoredCarIdleSoundAssetUrl,
  armoredCarMoveSoundAssetUrl,
  armoredCarTurboSoundAssetUrl,
  armoredCarGunSoundAssetUrl,
  jetIdleSoundAssetUrl,
  jetMoveSoundAssetUrl,
  jetTurboSoundAssetUrl,
  jetGunSoundAssetUrl,
  helicopterBladesSoundAssetUrl,
  helicopterGunSoundAssetUrl,
  missileLockSoundAssetUrl,
  suspensionImpactSoundAssetUrl,
  tankHornSoundAssetUrl,
  tankIdleSoundAssetUrl,
  tankMoveSoundAssetUrl,
  tankTurboSoundAssetUrl,
  tankGunSoundAssetUrl
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
  tank_gun: tankGunSoundAssetUrl,
  armoredcar_idle: armoredCarIdleSoundAssetUrl,
  armoredcar_move: armoredCarMoveSoundAssetUrl,
  armoredcar_turbo: armoredCarTurboSoundAssetUrl,
  armoredcar_horn: armoredCarHornSoundAssetUrl,
  armoredcar_gun: armoredCarGunSoundAssetUrl,
  jet_idle: jetIdleSoundAssetUrl,
  jet_move: jetMoveSoundAssetUrl,
  jet_turbo: jetTurboSoundAssetUrl,
  jet_gun: jetGunSoundAssetUrl,
  helicopter_blades: helicopterBladesSoundAssetUrl,
  helicopter_gun: helicopterGunSoundAssetUrl,
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
