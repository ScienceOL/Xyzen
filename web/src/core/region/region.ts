import { systemService } from "@/service/systemService";

let _region = "global";
let _resolved = false;

/** Call once at app init. After this, getRegion() is stable forever. */
export async function resolveRegion(): Promise<string> {
  if (_resolved) return _region;
  try {
    const data = await systemService.getRegion();
    _region = data.region || "global";
  } catch {
    _region = "global"; // default to global on failure
  }
  _resolved = true;
  return _region;
}

/** Synchronous read. Returns "global" before init, stable after. */
export function getRegion(): string {
  return _region;
}
