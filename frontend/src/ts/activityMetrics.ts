// Shared activity model, sport config, formatters and derived analytics.
// Used by both the training log and the stats page.

import { ATHLETE } from "./athlete";

export interface Activity {
  id: number;
  type: string;
  start_time: string;
  distance_km: number;
  duration_sec: number;
  avg_hr: number;
  avg_speed: number;
}

export type MetricMode = "pace" | "speed" | "swim" | "none";

export interface SportConfig {
  key: string;
  label: string;
  color: string;
  mode: MetricMode;
}

// Physiological defaults for effort / zone estimates, from the athlete profile.
export const DEFAULT_MAX_HR = ATHLETE.maxHr;
export const DEFAULT_REST_HR = ATHLETE.restHr;

const TYPE_ALIASES: Record<string, string> = {
  road_biking: "cycling",
  mountain_biking: "cycling",
  gravel_cycling: "cycling",
  indoor_cycling: "cycling",
  virtual_ride: "cycling",
  cyclingclass: "cycling",
  trail_running: "running",
  treadmill_running: "running",
  indoor_running: "running",
  street_running: "running",
  open_water_swimming: "lap_swimming",
  walking: "hiking",
  hiking_v2: "hiking",
};

const SPORTS: Record<string, SportConfig> = {
  running: { key: "running", label: "Running", color: "#6c8cff", mode: "pace" },
  cycling: { key: "cycling", label: "Cycling", color: "#f0a04b", mode: "speed" },
  lap_swimming: { key: "lap_swimming", label: "Swimming", color: "#4bc0c0", mode: "swim" },
  hiking: { key: "hiking", label: "Hiking", color: "#80cf80", mode: "pace" },
  paddelball: { key: "paddelball", label: "Paddelball", color: "#c77dff", mode: "none" },
  multi_sport: { key: "multi_sport", label: "Multi-sport", color: "#e0729b", mode: "none" },
  strength_training: { key: "strength_training", label: "Strength", color: "#f0c040", mode: "none" },
};

const OTHER_SPORT: SportConfig = {
  key: "other",
  label: "Other",
  color: "#9aa0a6",
  mode: "none",
};

export function normalizeType(type: string): string {
  const t = (type || "").toLowerCase();
  return TYPE_ALIASES[t] ?? t;
}

export function sportConfig(type: string): SportConfig {
  const key = normalizeType(type);
  return SPORTS[key] ?? { ...OTHER_SPORT, label: prettyLabel(key) };
}

function prettyLabel(key: string): string {
  if (!key) return "Other";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Formatting ───────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h > 0 ? h + ":" : ""}${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}`;
}

export function formatClock(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return "--";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function paceSecPerKm(speedMps: number): number {
  if (!speedMps || speedMps <= 0) return 0;
  return 1000 / speedMps;
}

export function paceMinPerKm(speedMps: number): number {
  return paceSecPerKm(speedMps) / 60;
}

export function formatPace(speedMps: number): string {
  const sec = paceSecPerKm(speedMps);
  if (!sec) return "--";
  return `${formatClock(sec)} /km`;
}

// Sport-aware "how fast" string: pace for runs, km/h for bikes, /100m for swims.
export function formatSpeedForType(speedMps: number, type: string): string {
  if (!speedMps || speedMps <= 0) return "--";
  const mode = sportConfig(type).mode;

  if (mode === "speed") return `${(speedMps * 3.6).toFixed(1)} km/h`;
  if (mode === "swim") return `${formatClock(100 / speedMps)} /100m`;
  if (mode === "pace") return `${formatClock(1000 / speedMps)} /km`;
  return "--";
}

export function speedMetricLabel(type: string): string {
  const mode = sportConfig(type).mode;
  if (mode === "speed") return "Avg speed";
  if (mode === "swim") return "Avg /100m";
  if (mode === "pace") return "Avg pace";
  return "Pace / speed";
}

// ── Derived metrics ──────────────────────────────────────────

export function hrReserveFraction(
  avgHr: number,
  maxHr: number = DEFAULT_MAX_HR,
  restHr: number = DEFAULT_REST_HR
): number {
  if (!avgHr || avgHr <= restHr) return 0;
  return Math.min(1, (avgHr - restHr) / (maxHr - restHr));
}

export interface HrZone {
  zone: number;
  label: string;
  color: string;
}

const ZONE_TABLE: HrZone[] = [
  { zone: 1, label: "Recovery", color: "#8ac6ff" },
  { zone: 2, label: "Endurance", color: "#80cf80" },
  { zone: 3, label: "Aerobic", color: "#f0c040" },
  { zone: 4, label: "Threshold", color: "#f0a04b" },
  { zone: 5, label: "Anaerobic", color: "#ff6b6b" },
];

export function hrZoneBoundaries(maxHr: number = DEFAULT_MAX_HR): number[] {
  // Upper bound (bpm) of zones 1..4 as % of max HR.
  return [0.6, 0.7, 0.8, 0.9].map((f) => Math.round(f * maxHr));
}

export function hrZoneFor(avgHr: number, maxHr: number = DEFAULT_MAX_HR): HrZone | null {
  if (!avgHr || avgHr <= 0) return null;
  const bounds = hrZoneBoundaries(maxHr);
  let idx = 0;
  while (idx < bounds.length && avgHr >= bounds[idx]) idx++;
  return ZONE_TABLE[idx];
}

export const ZONES = ZONE_TABLE;

// Banister TRIMP — a single "relative effort" number. Falls back to a
// duration-only estimate when an activity has no heart-rate data.
export function trimp(
  a: Activity,
  maxHr: number = DEFAULT_MAX_HR,
  restHr: number = DEFAULT_REST_HR
): number {
  const minutes = a.duration_sec / 60;
  if (minutes <= 0) return 0;

  if (a.avg_hr && a.avg_hr > restHr) {
    const hrr = hrReserveFraction(a.avg_hr, maxHr, restHr);
    return minutes * hrr * 0.64 * Math.exp(1.92 * hrr);
  }

  // No HR: assume a moderate aerobic effort (~zone 2).
  return minutes * 0.35;
}

// Very rough MET-based calorie estimate — clearly an estimate.
export function estimateCalories(a: Activity): number {
  const hours = a.duration_sec / 3600;
  if (hours <= 0) return 0;
  const weightKg = ATHLETE.weightKg;
  const mode = sportConfig(a.type).mode;
  const kmh = a.avg_speed > 0 ? a.avg_speed * 3.6 : 0;

  let met = 4;
  if (mode === "pace") {
    met = kmh > 0 ? Math.max(6, Math.min(19, 1.0 + kmh * 1.0)) : 8;
  } else if (mode === "speed") {
    met = kmh > 0 ? Math.max(4, Math.min(16, kmh * 0.45)) : 6;
  } else if (mode === "swim") {
    met = 7;
  } else {
    met = 5;
  }
  return Math.round(met * weightKg * hours);
}

// Riegel race-time prediction: t2 = t1 * (d2 / d1) ^ 1.06
export function riegelTime(
  knownDistKm: number,
  knownTimeSec: number,
  targetDistKm: number,
  exponent = 1.06
): number {
  if (knownDistKm <= 0 || knownTimeSec <= 0) return 0;
  return knownTimeSec * Math.pow(targetDistKm / knownDistKm, exponent);
}

// ── Date grouping helpers ────────────────────────────────────

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isoDay(date: Date): string {
  return startOfDay(date).toLocaleDateString("en-CA"); // YYYY-MM-DD, local
}

export function mondayOf(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

export function mondayKey(date: Date): string {
  return isoDay(mondayOf(date));
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function shortDate(d: Date): string {
  return d.toLocaleDateString("en-BE", { month: "short", day: "numeric" });
}

// ── Fitness & freshness (CTL / ATL / TSB) ────────────────────

export interface LoadPoint {
  date: string;
  load: number;
  ctl: number; // chronic training load  (fitness)
  atl: number; // acute training load    (fatigue)
  tsb: number; // training stress balance (form) = ctl - atl
}

export function fitnessSeries(
  activities: Activity[],
  ctlDays = 42,
  atlDays = 7
): LoadPoint[] {
  const withDates = activities
    .filter((a) => a.duration_sec > 0)
    .map((a) => ({ when: startOfDay(new Date(a.start_time)), load: trimp(a) }))
    .filter((x) => !isNaN(x.when.getTime()))
    .sort((a, b) => a.when.getTime() - b.when.getTime());

  if (!withDates.length) return [];

  const dailyLoad = new Map<string, number>();
  withDates.forEach(({ when, load }) => {
    const k = isoDay(when);
    dailyLoad.set(k, (dailyLoad.get(k) ?? 0) + load);
  });

  const start = withDates[0].when;
  const end = startOfDay(new Date());
  const ctlAlpha = 1 - Math.exp(-1 / ctlDays);
  const atlAlpha = 1 - Math.exp(-1 / atlDays);

  const out: LoadPoint[] = [];
  let ctl = 0;
  let atl = 0;
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const key = isoDay(d);
    const load = dailyLoad.get(key) ?? 0;
    ctl = ctl + ctlAlpha * (load - ctl);
    atl = atl + atlAlpha * (load - atl);
    out.push({ date: key, load, ctl, atl, tsb: ctl - atl });
  }
  return out;
}