import type { Activity } from "./activityMetrics";
import { normalizeType } from "./activityMetrics";

export async function loadActivities(): Promise<Activity[]> {
  const res = await fetch("/api/activities");
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const rows = (await res.json()) as Activity[];
  return rows.map((a) => ({ ...a, type: normalizeType(a.type) }));
}