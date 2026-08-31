import type { Activity } from "./activityMetrics";
import { normalizeType } from "./activityMetrics";

// Single place both pages load activities from. In `vite dev`, if the API
// isn't running, fall back to the bundled sample set so the UI still renders.
export async function loadActivities(): Promise<Activity[]> {
  try {
    const res = await fetch("/api/activities");
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const rows = (await res.json()) as Activity[];
    return rows.map((a) => ({ ...a, type: normalizeType(a.type) }));
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[dev] /api/activities unreachable — using sample data.", err);
      const { sampleActivities } = await import("./sampleActivities");
      return sampleActivities().map((a) => ({
        ...a,
        type: normalizeType(a.type),
      }));
    }
    throw err;
  }
}