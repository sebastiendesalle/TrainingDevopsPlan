// Turns the free-text workout strings in planData into structured detail:
// disciplines, volume, pace/power targets and intervals. Everything the plan
// page shows beyond the raw sentence comes from here.

export type Discipline =
  | "run"
  | "bike"
  | "swim"
  | "strength"
  | "ski"
  | "mobility"
  | "rest"
  | "race"
  | "other";

export interface DisciplineMeta {
  key: Discipline;
  label: string;
  color: string;
}

export const DISCIPLINES: Record<Discipline, DisciplineMeta> = {
  run: { key: "run", label: "Run", color: "#6c8cff" },
  bike: { key: "bike", label: "Bike", color: "#f0a04b" },
  swim: { key: "swim", label: "Swim", color: "#4bc0c0" },
  strength: { key: "strength", label: "Strength", color: "#f0c040" },
  ski: { key: "ski", label: "Ski", color: "#8ac6ff" },
  mobility: { key: "mobility", label: "Mobility", color: "#80cf80" },
  rest: { key: "rest", label: "Rest", color: "#6b6b73" },
  race: { key: "race", label: "Race", color: "#ff6b6b" },
  other: { key: "other", label: "Other", color: "#9aa0a6" },
};

export interface PaceTarget {
  lo: string;
  hi?: string;
  unit: "km" | "100m";
}

export interface PowerTarget {
  lo: number;
  hi?: number;
}

export interface Interval {
  reps: number;
  amount: string;
}

export interface Segment {
  discipline: Discipline;
  text: string;
  label: string;
  distanceKm: number;
  durationMin: number;
}

export interface ParsedWorkout {
  raw: string;
  segments: Segment[];
  disciplines: Discipline[];
  primary: Discipline;
  isRace: boolean;
  isRaceSim: boolean;
  isRest: boolean;
  runKm: number;
  swimKm: number;
  bikeMin: number;
  paceTargets: PaceTarget[];
  powerTargets: PowerTarget[];
  speedTargets: string[];
  intervals: Interval[];
  hrTarget?: string;
  headline: string;
  sub?: string;
}

// ── Small helpers ────────────────────────────────────────────

// Split on " + " but only at parenthesis depth 0, so "(drills + 6x100m)"
// stays in one piece.
function splitSegments(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && ch === "+" && text[i - 1] === " " && text[i + 1] === " ") {
      parts.push(current.trim());
      current = "";
      i++; // skip the space after '+'
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

function stripParens(text: string): string {
  return text.replace(/\([^)]*\)/g, " ").replace(/\s{2,}/g, " ").trim();
}

const INTERVAL_RE = /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(min|s|km|m)\b/gi;
const STRIDE_RE = /(\d+)\s*x\s*(?:(\d+)\s*s\s*)?strides/gi;

function stripIntervals(text: string): string {
  return text
    .replace(INTERVAL_RE, " ")
    .replace(STRIDE_RE, " ")
    .replace(/\s{2,}/g, " ");
}

// ── Field extraction ─────────────────────────────────────────

function extractDistanceKm(segment: string): number {
  const clean = stripIntervals(stripParens(segment));

  // "12 km", "4-5 km" (take the upper bound); never "km/h".
  const km = clean.match(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*km(?!\s*\/)/i);
  if (km) return parseFloat(km[2] ?? km[1]);

  // "800 m" — but not "min".
  const m = clean.match(/(\d{2,4})\s*m(?![a-z/])/i);
  if (m) return parseFloat(m[1]) / 1000;

  return 0;
}

function extractDurationMin(segment: string): number {
  const clean = stripIntervals(stripParens(segment));

  const h = clean.match(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*h\b/i);
  if (h) return parseFloat(h[2] ?? h[1]) * 60;

  const min = clean.match(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*min\b/i);
  if (min) return parseFloat(min[2] ?? min[1]);

  return 0;
}

function extractPaces(text: string): PaceTarget[] {
  const out: PaceTarget[] = [];
  const re = /(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\s*\/\s*(km|100m)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ lo: m[1], hi: m[2], unit: m[3].toLowerCase() as "km" | "100m" });
  }
  return out;
}

function extractPower(text: string): PowerTarget[] {
  const out: PowerTarget[] = [];
  const re = /(\d{2,3})(?:\s*-\s*(\d{2,3}))?\s*W\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ lo: parseInt(m[1], 10), hi: m[2] ? parseInt(m[2], 10) : undefined });
  }
  return out;
}

function extractSpeeds(text: string): string[] {
  const out: string[] = [];
  const re = /(\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?)\s*km\s*\/\s*h/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(`${m[1].replace(/\s/g, "")} km/h`);
  return out;
}

function extractIntervals(text: string): Interval[] {
  const out: Interval[] = [];
  let m: RegExpExecArray | null;

  // Strides are matched first and blanked out, so "4x20s strides" is not also
  // reported as a bare "4x20s" interval.
  const withoutStrides = text.replace(new RegExp(STRIDE_RE.source, "gi"), " ");

  const ivl = new RegExp(INTERVAL_RE.source, "gi");
  while ((m = ivl.exec(withoutStrides)) !== null) {
    out.push({ reps: parseInt(m[1], 10), amount: `${m[2]}${m[3].toLowerCase()}` });
  }

  const str = new RegExp(STRIDE_RE.source, "gi");
  while ((m = str.exec(text)) !== null) {
    out.push({
      reps: parseInt(m[1], 10),
      amount: m[2] ? `${m[2]}s strides` : "strides",
    });
  }
  return out;
}

function extractHr(text: string): string | undefined {
  const m = text.match(/HR\s*(\d{2,3})\s*-\s*(\d{2,3})/i);
  return m ? `${m[1]}-${m[2]} bpm` : undefined;
}

// ── Classification ───────────────────────────────────────────

const LEAD_RE =
  /^\s*(?:RACE(?:\s+SIM)?:\s*)?(?:Long\s+|Brick\s+)?(Run|Bike|Swim|Strength|Ski)\b/i;
const ANY_RE = /\b(Run|Bike|Swim|Strength|Ski)\b/i;

// Real races are flagged with an uppercase "RACE:" / "RACE SIM:" marker.
// Lowercase "race effort" / "race watts" are just intensity cues.
const RACE_MARKER = /\bRACE:/;
const RACE_SIM_MARKER = /\bRACE\s+SIM:/;

// A run prescribed only in minutes (brick runs, shakeouts) still adds volume;
// the plan's own weekly totals count it at roughly easy pace.
const EASY_PACE_MIN_PER_KM = 6.5;

function classify(segment: string): Discipline {
  const lead = segment.match(LEAD_RE);
  if (lead) return lead[1].toLowerCase() as Discipline;

  if (RACE_MARKER.test(segment) || RACE_SIM_MARKER.test(segment)) return "race";

  const any = segment.match(ANY_RE);
  if (any) return any[1].toLowerCase() as Discipline;

  if (/^\s*off\b|\brest\b/i.test(segment)) return "rest";
  if (/mobility|walk/i.test(segment)) return "mobility";
  return "other";
}

// Short tile label: drop parentheticals and anything after a dash or comma.
function shortLabel(segment: string, discipline: Discipline): string {
  const stripped = stripParens(segment);
  const dashParts = stripped.split(/\s+-\s+/);
  let s = dashParts[0];

  // "Travel to Calella - Swim 1.5 km Easy" should read as the swim, not the
  // travel. Races keep their own name, which never mentions a sport.
  if (discipline !== "race" && !ANY_RE.test(s)) {
    const better = dashParts.find((p) => ANY_RE.test(p));
    if (better) s = better;
  }

  s = s.split(/\.\s+/)[0];
  s = s.split(/,\s+/)[0];
  s = s.split(/\s+@\s+/)[0];
  return s.trim().replace(/[.!]$/, "");
}

// "3x15min", but "6x strides" reads better with the space.
export function formatInterval(i: Interval): string {
  return /^\d/.test(i.amount) ? `${i.reps}x${i.amount}` : `${i.reps}x ${i.amount}`;
}

// ── Public API ───────────────────────────────────────────────

export function parseWorkout(raw: string): ParsedWorkout {
  const text = (raw ?? "").trim();
  const isRaceSim = RACE_SIM_MARKER.test(text);
  const isRace = RACE_MARKER.test(text) && !isRaceSim;

  const segments: Segment[] = splitSegments(text).map((s) => {
    const discipline = classify(s);
    const isRaceSegment = discipline === "race";
    const durationMin = isRaceSegment ? 0 : extractDurationMin(s);
    let distanceKm = isRaceSegment ? 0 : extractDistanceKm(s);

    if (discipline === "run" && distanceKm === 0 && durationMin > 0) {
      distanceKm = durationMin / EASY_PACE_MIN_PER_KM;
    }

    return {
      discipline,
      text: s,
      label: shortLabel(s, discipline),
      distanceKm,
      durationMin,
    };
  });

  const disciplines = [...new Set(segments.map((s) => s.discipline))];
  const isRest =
    segments.length > 0 && segments.every((s) => s.discipline === "rest");

  const sum = (d: Discipline, field: "distanceKm" | "durationMin") =>
    segments
      .filter((s) => s.discipline === d)
      .reduce((acc, s) => acc + s[field], 0);

  // The tile is coloured by its primary discipline, and titled by its first
  // segment — so those two must agree. A race always wins.
  const primary: Discipline = disciplines.includes("race")
    ? "race"
    : segments[0]?.discipline ?? "other";

  const paceTargets = extractPaces(text);
  const powerTargets = extractPower(text);
  const intervals = extractIntervals(text);

  const lead = segments[0];
  const headline = lead ? lead.label : text;

  const subBits: string[] = [];
  if (intervals.length) {
    subBits.push(intervals.map(formatInterval).join(", "));
  }
  if (paceTargets.length) {
    const p = paceTargets[0];
    subBits.push(`@ ${p.lo}${p.hi ? "-" + p.hi : ""} /${p.unit}`);
  } else if (powerTargets.length) {
    const w = powerTargets[0];
    subBits.push(`@ ${w.lo}${w.hi ? "-" + w.hi : ""} W`);
  }
  if (!subBits.length && segments.length > 1) {
    subBits.push(segments.slice(1).map((s) => s.label).join(" + "));
  }

  return {
    raw: text,
    segments,
    disciplines,
    primary,
    isRace,
    isRaceSim,
    isRest,
    runKm: sum("run", "distanceKm"),
    swimKm: sum("swim", "distanceKm"),
    bikeMin: sum("bike", "durationMin"),
    paceTargets,
    powerTargets,
    speedTargets: extractSpeeds(text),
    intervals,
    hrTarget: extractHr(text),
    headline,
    sub: subBits.join(" · ") || undefined,
  };
}

// Race name, for the plan overview ("RACE: IRONMAN Barcelona - bike @ ...").
export function raceName(raw: string): string {
  const m = raw.match(/RACE(?:\s+SIM)?:\s*(.+)/i);
  if (!m) return raw;
  return m[1].split(/\s+-\s+/)[0].split(/,\s+/)[0].trim().replace(/[.!]$/, "");
}
