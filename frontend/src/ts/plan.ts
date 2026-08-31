import "../css/style.css";
import "../css/plan.css";
import { planData } from "./planData";
import {
  parseWorkout,
  raceName,
  formatInterval,
  DISCIPLINES,
  type ParsedWorkout,
  type Discipline,
  type PowerTarget,
} from "./planParser";
import { ATHLETE, pctOfFtp, powerZoneFor, POWER_ZONES } from "./athlete";
import {
  type Activity,
  sportConfig,
  normalizeType,
  formatDuration,
  formatSpeedForType,
  isoDay,
  startOfDay,
  addDays,
} from "./activityMetrics";
import { loadActivities } from "./dataSource";

interface TrainingWeek {
  "Week Start": string;
  Phase: string;
  "Week Type": string;
  Mon: string;
  Tue: string;
  Wed: string;
  Thu: string;
  Fri: string;
  Sat: string;
  Sun: string;
  "Total Run km": string | number;
}

const DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

interface DayModel {
  key: DayKey;
  date: Date;
  workout: ParsedWorkout;
  isToday: boolean;
}

interface WeekModel {
  id: number;
  phase: string;
  type: string;
  start: Date;
  end: Date;
  days: DayModel[];
  plannedRunKm: number;
  swimKm: number;
  bikeMin: number;
  isCurrent: boolean;
  isPast: boolean;
}

interface PhaseModel {
  name: string;
  weeks: WeekModel[];
  races: { name: string; date: Date }[];
}

const overviewEl = document.getElementById("plan-overview")!;
const statusEl = document.getElementById("plan-status")!;
const phasesEl = document.getElementById("plan-phases")!;
const drawer = document.getElementById("day-drawer")!;
const drawerBody = document.getElementById("drawer-body")!;
const drawerBackdrop = document.getElementById("drawer-backdrop")!;
const drawerClose = document.getElementById("drawer-close")!;

const TODAY = startOfDay(new Date());
const COLLAPSED_WEEKS = 5;

let allWeeks: WeekModel[] = [];
const weekCards = new Map<number, HTMLElement>();
let activitiesByDay = new Map<string, Activity[]>();
let hasActuals = false;
let drawerHideTimer: number | undefined;

// ── Model building ───────────────────────────────────────────

function parsePlanDate(value: string): Date | null {
  const parts = (value ?? "").split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map((p) => parseInt(p, 10));
  if ([day, month, year].some(Number.isNaN)) return null;
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

function buildModel(): PhaseModel[] {
  const rows = (planData as { MainPlan: TrainingWeek[] }).MainPlan.filter(
    (w) => w && typeof w === "object" && w["Week Start"] !== "Week Start"
  );

  // Phases come from the data itself, in first-seen order — so a renamed
  // phase can never fall out of sync with the page again.
  const phases = new Map<string, PhaseModel>();
  let id = 0;

  rows.forEach((row) => {
    const start = parsePlanDate(row["Week Start"]);
    if (!start) return;
    const end = addDays(start, 6);

    const days: DayModel[] = DAY_KEYS.map((key, i) => {
      const date = addDays(start, i);
      return {
        key,
        date,
        workout: parseWorkout(row[key]),
        isToday: date.getTime() === TODAY.getTime(),
      };
    });

    const week: WeekModel = {
      id: id++,
      phase: row.Phase,
      type: row["Week Type"],
      start,
      end,
      days,
      plannedRunKm: Number(row["Total Run km"]) || 0,
      swimKm: days.reduce((s, d) => s + d.workout.swimKm, 0),
      bikeMin: days.reduce((s, d) => s + d.workout.bikeMin, 0),
      isCurrent: TODAY >= start && TODAY <= end,
      isPast: end < TODAY,
    };

    if (!phases.has(row.Phase)) {
      phases.set(row.Phase, { name: row.Phase, weeks: [], races: [] });
    }
    const phase = phases.get(row.Phase)!;
    phase.weeks.push(week);
    days.forEach((d) => {
      if (d.workout.isRace) {
        phase.races.push({ name: raceName(d.workout.raw), date: d.date });
      }
    });
  });

  return [...phases.values()];
}

// ── Formatting helpers ───────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-BE", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString("en-BE", { day: "numeric", month: "short" });
}

function fmtHours(min: number): string {
  if (min <= 0) return "--";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
}

function paceToSeconds(pace: string): number {
  const [m, s] = pace.split(":").map((n) => parseInt(n, 10));
  return m * 60 + (s || 0);
}

const WEEK_TYPE_TONE: Record<string, string> = {
  up: "accent",
  deload: "good",
  recovery: "teal",
  peak: "warn",
  taper: "purple",
  "taper 1": "purple",
  "taper 2": "purple",
  "taper 3": "purple",
  race: "bad",
  "race sim": "warn",
  test: "teal",
  exams: "muted",
  ski: "teal",
  return: "muted",
  gate: "warn",
};

function weekTypeTone(type: string): string {
  return WEEK_TYPE_TONE[type.toLowerCase()] ?? "muted";
}

// ── Rendering: overview ──────────────────────────────────────

function renderOverview(phases: PhaseModel[]) {
  const total = allWeeks.length;
  const currentWeek = allWeeks.find((w) => w.isCurrent);
  const doneWeeks = allWeeks.filter((w) => w.isPast).length;

  const races = phases
    .flatMap((p) => p.races)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const nextRace = races.find((r) => r.date >= TODAY);

  const chips: string[] = [];

  if (currentWeek) {
    const n = allWeeks.indexOf(currentWeek) + 1;
    chips.push(
      chip("Current week", `${n} of ${total}`, esc(currentWeek.phase.split(":")[0]))
    );
    chips.push(chip("This week", `${currentWeek.plannedRunKm} km`, esc(currentWeek.type)));
  } else {
    chips.push(chip("Plan progress", `${doneWeeks} of ${total}`, "weeks done"));
  }

  if (nextRace) {
    const days = Math.round((nextRace.date.getTime() - TODAY.getTime()) / 86400000);
    chips.push(
      chip("Next race", days === 0 ? "Today" : `${days} days`, esc(nextRace.name))
    );
  }

  const planKm = allWeeks.reduce((s, w) => s + w.plannedRunKm, 0);
  chips.push(chip("Plan volume", `${Math.round(planKm)} km`, "running total"));

  overviewEl.innerHTML = chips.join("");
}

function chip(k: string, v: string, note?: string): string {
  return `<div class="stat-chip"><div class="k">${k}</div><div class="v">${v}</div>${
    note ? `<div class="n">${note}</div>` : ""
  }</div>`;
}

// ── Rendering: phases ────────────────────────────────────────

function sparkline(weeks: WeekModel[]): string {
  const values = weeks.map((w) => w.plannedRunKm);
  const max = Math.max(...values, 1);
  const w = 100;
  const h = 20;
  const bw = w / Math.max(values.length, 1);

  const bars = values
    .map((v, i) => {
      const bh = Math.max((v / max) * h, v > 0 ? 1 : 0);
      const fill = weeks[i].isCurrent
        ? "var(--accent)"
        : weeks[i].isPast
        ? "var(--border-strong)"
        : "var(--surface-2)";
      // Inline style, not a fill attribute: var() is only reliable in styles.
      return `<rect x="${(i * bw).toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${(
        bw * 0.72
      ).toFixed(2)}" height="${bh.toFixed(2)}" style="fill:${fill}" />`;
    })
    .join("");

  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
}

function renderPhase(phase: PhaseModel): HTMLElement {
  const section = document.createElement("section");
  section.className = "phase";

  const weeks = phase.weeks;
  const runKm = weeks.reduce((s, w) => s + w.plannedRunKm, 0);
  const swimKm = weeks.reduce((s, w) => s + w.swimKm, 0);
  const bikeMin = weeks.reduce((s, w) => s + w.bikeMin, 0);
  const hasCurrent = weeks.some((w) => w.isCurrent);

  const summary = [
    `${weeks.length} weeks`,
    `${Math.round(runKm)} km run`,
    swimKm > 0 ? `${Math.round(swimKm)} km swim` : "",
    bikeMin > 0 ? `${Math.round(bikeMin / 60)} h bike` : "",
  ].filter(Boolean);

  section.innerHTML = `
    <div class="phase-head">
      <div class="phase-headings">
        <h2 class="phase-title">${esc(phase.name)}${
    hasCurrent ? '<span class="phase-now">now</span>' : ""
  }</h2>
        <p class="phase-range">${fmtDate(weeks[0].start)} – ${fmtDate(
    weeks[weeks.length - 1].end
  )}</p>
      </div>
      <button class="expand-toggle" type="button">Expand</button>
    </div>
    <div class="phase-meta">
      <p class="phase-summary">${summary.join(" · ")}</p>
      ${sparkline(weeks)}
    </div>
    ${
      phase.races.length
        ? `<p class="phase-races">${phase.races
            .map((r) => `<span class="race-tag">${esc(r.name)} · ${fmtDateShort(r.date)}</span>`)
            .join("")}</p>`
        : ""
    }
    <div class="week-list"></div>
  `;

  const list = section.querySelector(".week-list") as HTMLElement;
  const cards = weeks.map((week) => {
    const card = renderWeekCard(week);
    list.appendChild(card);
    return card;
  });

  const button = section.querySelector(".expand-toggle") as HTMLButtonElement;
  let expanded = false;

  const apply = () => {
    button.textContent = expanded ? "Collapse" : "Expand";
    if (expanded) {
      cards.forEach((c) => c.classList.remove("hidden"));
      return;
    }
    // Collapsed: show a window centred on the current week, else the first few.
    const currentIndex = weeks.findIndex((w) => w.isCurrent);
    let start = 0;
    if (currentIndex !== -1) {
      start = Math.max(0, currentIndex - Math.floor(COLLAPSED_WEEKS / 2));
      start = Math.min(start, Math.max(0, weeks.length - COLLAPSED_WEEKS));
    }
    const end = start + COLLAPSED_WEEKS - 1;
    cards.forEach((c, i) => c.classList.toggle("hidden", i < start || i > end));
  };

  button.addEventListener("click", () => {
    expanded = !expanded;
    apply();
  });
  apply();

  return section;
}

function renderWeekCard(week: WeekModel): HTMLElement {
  const card = document.createElement("article");
  card.className = "week-card";
  if (week.isCurrent) card.classList.add("is-current");
  if (week.isPast) card.classList.add("is-past");

  const totals = [
    `${week.plannedRunKm} km run`,
    week.swimKm > 0 ? `${week.swimKm.toFixed(1)} km swim` : "",
    week.bikeMin > 0 ? `${fmtHours(week.bikeMin)} bike` : "",
  ].filter(Boolean);

  const actual = weekActualRunKm(week);
  const actualHtml =
    actual !== null
      ? `<span class="week-actual ${
          actual >= week.plannedRunKm * 0.9 ? "ok" : "under"
        }">${actual.toFixed(1)} km actual</span>`
      : "";

  card.innerHTML = `
    <header class="week-head">
      <div class="week-when">
        <span class="week-dates">${fmtDateShort(week.start)} – ${fmtDateShort(
    week.end
  )}</span>
        <span class="week-badge tone-${weekTypeTone(week.type)}">${esc(week.type)}</span>
        ${week.isCurrent ? '<span class="week-badge tone-now">This week</span>' : ""}
      </div>
      <div class="week-totals">${totals
        .map((t) => `<span>${t}</span>`)
        .join("")}${actualHtml}</div>
    </header>
    <div class="day-grid">
      ${week.days.map((day) => renderDayTile(week, day)).join("")}
    </div>
  `;

  card.querySelectorAll<HTMLButtonElement>(".day-tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      const dayIndex = Number(tile.dataset.day);
      openDrawer(week, week.days[dayIndex]);
    });
  });

  weekCards.set(week.id, card);
  return card;
}

// Garmin data arrives after the plan is already on screen, so patch the
// finished cards in place rather than re-rendering (which would collapse
// any phase the reader had already expanded).
function applyActuals() {
  allWeeks.forEach((week) => {
    const actual = weekActualRunKm(week);
    if (actual === null) return;
    const totals = weekCards.get(week.id)?.querySelector(".week-totals");
    if (!totals || totals.querySelector(".week-actual")) return;

    const span = document.createElement("span");
    span.className = `week-actual ${
      actual >= week.plannedRunKm * 0.9 ? "ok" : "under"
    }`;
    span.textContent = `${actual.toFixed(1)} km actual`;
    totals.appendChild(span);
  });
}

function renderDayTile(week: WeekModel, day: DayModel): string {
  const w = day.workout;
  const classes = [
    "day-tile",
    `d-${w.primary}`,
    w.isRest ? "is-rest" : "",
    day.isToday ? "is-today" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const dots = w.disciplines
    .filter((d) => d !== "rest")
    .map(
      (d) =>
        `<span class="d-dot" style="background-color:${DISCIPLINES[d].color}" title="${DISCIPLINES[d].label}"></span>`
    )
    .join("");

  return `
    <button class="${classes}" type="button" data-day="${week.days.indexOf(day)}">
      <span class="day-top">
        <span class="day-name">${day.key}</span>
        <span class="day-dots">${dots}</span>
      </span>
      <span class="day-title">${esc(w.headline)}</span>
      ${w.sub ? `<span class="day-sub">${esc(w.sub)}</span>` : ""}
    </button>`;
}

// ── Actuals from Garmin ──────────────────────────────────────

function weekActualRunKm(week: WeekModel): number | null {
  if (!hasActuals || !week.isPast) return null;
  let km = 0;
  for (let i = 0; i < 7; i++) {
    const acts = activitiesByDay.get(isoDay(addDays(week.start, i))) ?? [];
    km += acts
      .filter((a) => normalizeType(a.type) === "running")
      .reduce((s, a) => s + a.distance_km, 0);
  }
  return km;
}

// ── Drawer ───────────────────────────────────────────────────

function powerBlock(targets: PowerTarget[]): string {
  if (!targets.length) return "";

  const rows = targets
    .map((t) => {
      const hi = t.hi ?? t.lo;
      const zLo = powerZoneFor(t.lo);
      const zHi = powerZoneFor(hi);
      const zoneLabel =
        zLo.zone === zHi.zone
          ? `Z${zLo.zone} ${zLo.label}`
          : `Z${zLo.zone} ${zLo.label} – Z${zHi.zone} ${zHi.label}`;

      // Zone strip runs 0–150% of FTP; overlay marks the prescribed range.
      const SCALE = 150;
      const segs = POWER_ZONES.filter((z) => z.loPct < 1.5)
        .map(
          (z) =>
            `<span style="flex:${(Math.min(z.hiPct, 1.5) - z.loPct) * 100};background-color:${
              z.color
            }"></span>`
        )
        .join("");
      const left = (pctOfFtp(t.lo) / SCALE) * 100;
      const width = Math.max(((pctOfFtp(hi) - pctOfFtp(t.lo)) / SCALE) * 100, 1.5);

      return `
        <div class="power-row">
          <div class="power-head">
            <span class="power-watts">${t.lo}${t.hi ? `–${t.hi}` : ""} W</span>
            <span class="power-pct">${Math.round(pctOfFtp(t.lo))}${
        t.hi ? `–${Math.round(pctOfFtp(hi))}` : ""
      }% FTP</span>
          </div>
          <div class="zone-strip">
            <div class="zone-segments">${segs}</div>
            <div class="zone-range" style="left:${left.toFixed(1)}%;width:${width.toFixed(
        1
      )}%"></div>
          </div>
          <div class="zone-caption">${zoneLabel}</div>
        </div>`;
    })
    .join("");

  return `
    <div class="section-header">Power targets · FTP ${ATHLETE.ftpWatts} W</div>
    ${rows}`;
}

function paceBlock(w: ParsedWorkout): string {
  if (!w.paceTargets.length && !w.speedTargets.length && !w.hrTarget) return "";

  const rows: string[] = [];

  w.paceTargets.forEach((p) => {
    const unit = p.unit === "km" ? "/km" : "/100m";
    let note = "";
    // For a run with a known distance, a pace target implies a finish time.
    if (p.unit === "km" && w.runKm > 0) {
      const lo = paceToSeconds(p.lo) * w.runKm;
      const hi = paceToSeconds(p.hi ?? p.lo) * w.runKm;
      note =
        lo === hi
          ? `≈ ${formatDuration(lo)} for ${w.runKm.toFixed(1)} km`
          : `≈ ${formatDuration(lo)}–${formatDuration(hi)} for ${w.runKm.toFixed(1)} km`;
    }
    rows.push(
      detailRow(
        p.unit === "km" ? "Target pace" : "Target swim pace",
        `${p.lo}${p.hi ? `–${p.hi}` : ""} ${unit}`,
        note
      )
    );
  });

  w.speedTargets.forEach((s) => rows.push(detailRow("Target speed", s)));
  if (w.hrTarget) rows.push(detailRow("Heart rate", w.hrTarget));

  return `<div class="section-header">Targets</div><div class="detail-list">${rows.join(
    ""
  )}</div>`;
}

function detailRow(label: string, value: string, note = ""): string {
  return `<div class="detail-row"><span class="dl">${label}</span><span class="dv">${esc(
    value
  )}</span>${note ? `<span class="dn">${esc(note)}</span>` : ""}</div>`;
}

function actualBlock(day: DayModel): string {
  if (!hasActuals || day.date > TODAY) return "";
  const acts = activitiesByDay.get(isoDay(day.date)) ?? [];

  if (!acts.length) {
    return `<div class="section-header">What you did</div><p class="drawer-note">No activity recorded on this day.</p>`;
  }

  const rows = acts
    .map((a) => {
      const type = normalizeType(a.type);
      const cfg = sportConfig(type);
      const bits = [
        a.distance_km > 0 ? `${a.distance_km.toFixed(2)} km` : "",
        formatDuration(a.duration_sec),
        a.avg_speed > 0 ? formatSpeedForType(a.avg_speed, type) : "",
        a.avg_hr > 0 ? `${a.avg_hr} bpm` : "",
      ].filter(Boolean);
      return `<div class="actual-row">
        <span class="sport-pill"><span class="sport-dot" style="background-color:${cfg.color}"></span>${cfg.label}</span>
        <span class="actual-bits">${bits.join(" · ")}</span>
      </div>`;
    })
    .join("");

  return `<div class="section-header">What you did</div><div class="actual-list">${rows}</div>`;
}

function openDrawer(week: WeekModel, day: DayModel) {
  const w = day.workout;

  const pills = w.disciplines
    .map(
      (d: Discipline) =>
        `<span class="sport-pill"><span class="sport-dot" style="background-color:${DISCIPLINES[d].color}"></span>${DISCIPLINES[d].label}</span>`
    )
    .join("");

  const metrics: [string, string][] = [];
  if (w.runKm > 0) metrics.push(["Run", `${w.runKm.toFixed(1)} km`]);
  if (w.swimKm > 0) metrics.push(["Swim", `${w.swimKm.toFixed(1)} km`]);
  if (w.bikeMin > 0) metrics.push(["Bike", fmtHours(w.bikeMin)]);
  metrics.push(["Week type", week.type]);

  drawerBody.innerHTML = `
    <div class="drawer-head">
      <div class="pill-row">${pills}</div>
      <h2 class="drawer-title">${esc(w.headline)}</h2>
      <div class="drawer-sub">${day.date.toLocaleDateString("en-BE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })} · ${esc(week.phase)}</div>
    </div>

    <div class="metric-grid">
      ${metrics
        .map(
          ([k, v]) =>
            `<div class="metric-cell"><div class="mk">${k}</div><div class="mv">${esc(
              v
            )}</div></div>`
        )
        .join("")}
    </div>

    ${paceBlock(w)}
    ${powerBlock(w.powerTargets)}
    ${
      w.intervals.length
        ? `<div class="section-header">Intervals</div><p class="interval-row">${w.intervals
            .map((i) => `<span class="interval-tag">${esc(formatInterval(i))}</span>`)
            .join("")}</p>`
        : ""
    }

    <div class="section-header">Prescription</div>
    <p class="prescription">${esc(w.raw)}</p>

    ${actualBlock(day)}
  `;

  if (drawerHideTimer !== undefined) window.clearTimeout(drawerHideTimer);
  drawer.classList.remove("hidden");
  drawerBackdrop.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
  drawer.scrollTop = 0;
  requestAnimationFrame(() => drawer.classList.add("open"));
}

function closeDrawer() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  drawerBackdrop.classList.add("hidden");
  drawerHideTimer = window.setTimeout(() => drawer.classList.add("hidden"), 200);
}

// ── Boot ─────────────────────────────────────────────────────

async function main() {
  drawerClose.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.classList.contains("hidden")) closeDrawer();
  });

  const phases = buildModel();
  allWeeks = phases.flatMap((p) => p.weeks);

  if (!allWeeks.length) {
    statusEl.innerHTML = `<p class="error">No training weeks found in the plan.</p>`;
    return;
  }

  statusEl.classList.add("hidden");
  renderOverview(phases);
  phases.forEach((p) => phasesEl.appendChild(renderPhase(p)));

  document.querySelector(".week-card.is-current")?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });

  // Actuals are a bonus: the plan must still render if the API is down.
  try {
    const activities = await loadActivities();
    activitiesByDay = new Map();
    activities.forEach((a) => {
      const key = isoDay(new Date(a.start_time));
      if (!activitiesByDay.has(key)) activitiesByDay.set(key, []);
      activitiesByDay.get(key)!.push(a);
    });
    hasActuals = true;
    applyActuals();
  } catch (err) {
    console.warn("Plan: activities unavailable, showing plan only.", err);
  }
}

main();
