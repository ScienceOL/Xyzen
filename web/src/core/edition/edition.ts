export interface EditionFeatures {
  billing: boolean;
  admin: boolean;
  checkIn: boolean;
  subscription: boolean;
}

export type Edition = "ce" | "ee";

export interface EditionState {
  edition: Edition;
  isEE: boolean;
  features: EditionFeatures;
}

const CE_FEATURES: Readonly<EditionFeatures> = Object.freeze({
  billing: false,
  admin: false,
  checkIn: false,
  subscription: false,
});

const EE_FEATURES: Readonly<EditionFeatures> = Object.freeze({
  billing: true,
  admin: true,
  checkIn: true,
  subscription: true,
});

const CE_STATE: Readonly<EditionState> = Object.freeze({
  edition: "ce",
  isEE: false,
  features: CE_FEATURES,
});

const EE_STATE: Readonly<EditionState> = Object.freeze({
  edition: "ee",
  isEE: true,
  features: EE_FEATURES,
});

import { systemService } from "@/service/systemService";

let _state: Readonly<EditionState> = CE_STATE;
let _resolved = false;

/** Call once at app init. After this, getEdition() is stable forever. */
export async function resolveEdition(): Promise<EditionState> {
  if (_resolved) return _state;
  try {
    const data = await systemService.getEdition();
    _state = data.edition === "ee" ? EE_STATE : CE_STATE;
  } catch {
    _state = CE_STATE; // default to CE on failure
  }
  _resolved = true;
  return _state;
}

/** Synchronous read. Returns CE_STATE before init, stable after. */
export function getEdition(): Readonly<EditionState> {
  return _state;
}

/** Convenience check for a single feature flag. */
export function hasFeature(key: keyof EditionFeatures): boolean {
  return _state.features[key];
}
