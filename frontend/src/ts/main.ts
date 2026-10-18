import "../css/style.css";
import "../css/home.css";
import "./pageTop";
import { planData } from "./planData";
import {
  DAY_KEYS,
  DISCIPLINES,
  parsePlanDate,
  parseWorkout,
  raceName,
  type ParsedWorkout,
  type TrainingWeek,
} from "./planParser";
import { SESSIONS } from "./strengthData";
import { blockFor, esc, isLightDay, sessionKeyIn } from "./strengthView";
import {
  type Activity,
  addDays,
  fitnessSeries,
  formVerdict,
  formatDuration,
  formatSpeedForType,
  isoDay,
  normalizeType,
  sportConfig,
  startOfDay,
} from "./activityMetrics";
import { loadActivities } from "./dataSource";

// The home page: today's session, the race countdown, a browsable week
// strip with planned-versus-done bars, form, and the latest activities.

interface PlanDay {
  date: Date;
  key: string; // YYYY-MM-DD, also the plan.html# link
  workout: ParsedWorkout;
  weekType: string;
}

interface PlanWeek {
  start: Date;
  phase: string;
  type: string;
  runKm: number;
  days: PlanDay[];
}

const DAY_MS = 86_400_000;
const TODAY = startOfDay(new Date());
const TODAY_KEY = isoDay(TODAY);

const weeks: PlanWeek[] = (planData as { MainPlan: TrainingWeek[] }).MainPlan.flatMap((row) => {
  const start = parsePlanDate(row["Week Start"]);
  if (!start) return [];
  const days = DAY_KEYS.map((key, i) => {
    const date = addDays(start, i);
    return { date, key: isoDay(date), workout: parseWorkout(row[key]), weekType: row["Week Type"] };
  });
  return [{ start, phase: row.Phase, type: row["Week Type"], runKm: Number(row["Total Run km"]) || 0, days }];
});
const allDays = weeks.flatMap((w) => w.days);
const currentIndex = weeks.findIndex((w) => TODAY >= w.start && TODAY < addDays(w.start, 7));

let activities: Activity[] | null = null; // stays null if the API is down
let loaded = false; // the API call has finished, either way
let byDay = new Map<string, Activity[]>();
let shownIndex = currentIndex;

// ── Small helpers ────────────────────────────────────────────

function fmtLong(d: Date): string {
  return d.toLocaleDateString("en-BE", { weekday: "long", day: "numeric", month: "long" });
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-BE", { weekday: "short", day: "numeric", month: "short" });
}

function fmtHours(min: number): string {
  if (min <= 0) return "0 min";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
}

function pills(w: ParsedWorkout): string {
  return w.disciplines
    .filter((d) => d !== "rest")
    .map(
      (d) =>
        `<span class="sport-pill"><span class="sport-dot" style="background-color:${DISCIPLINES[d].color}"></span>${DISCIPLINES[d].label}</span>`
    )
    .join("");
}

// "Day A · Hips & Thighs · Build · ~55 min" for a plan day with strength.
function strengthLine(day: PlanDay): string {
  const key = sessionKeyIn(day.workout.raw);
  if (!key) return "";
  const s = SESSIONS[key];
  const block = blockFor(day.date);
  const level = isLightDay(day.weekType, day.workout.raw) || block.light ? "light" : block.label;
  return `${s.name} · ${s.title} · ${level} · ~${s.minutes} min`;
}

function activityBits(a: Activity): string {
  const type = normalizeType(a.type);
  return [
    a.distance_km > 0 && sportConfig(type).mode !== "none" ? `${a.distance_km.toFixed(1)} km` : "",
    formatDuration(a.duration_sec),
  ]
    .filter(Boolean)
    .join(" · ");
}

// For a week tile: "8.1 km · 53:17", or "Paddelball · 1:35:50" when there's
// no distance to tell what it was.
function tileDone(a: Activity): string {
  const cfg = sportConfig(a.type);
  return cfg.mode === "none" ? `${cfg.label} · ${formatDuration(a.duration_sec)}` : activityBits(a);
}

// ── Header line, today, race ─────────────────────────────────

function renderDate() {
  const el = document.getElementById("home-date")!;
  const week = weeks[currentIndex];
  if (!week) {
    el.textContent = fmtLong(TODAY);
    return;
  }
  const phaseWeeks = weeks.filter((w) => w.phase === week.phase);
  el.textContent = `${fmtLong(TODAY)} · ${week.phase} · week ${phaseWeeks.indexOf(week) + 1} of ${
    phaseWeeks.length
  } · ${week.type}`;
}

function renderToday() {
  const el = document.getElementById("home-today")!;
  const day = allDays.find((d) => d.key === TODAY_KEY);
  const tomorrow = allDays.find((d) => d.key === isoDay(addDays(TODAY, 1)));
  const done = byDay.get(TODAY_KEY) ?? [];

  if (!day) {
    el.innerHTML = `<span class="panel-label">Today</span><h2 class="today-title">Nothing planned</h2>`;
    return;
  }

  const w = day.workout;
  const strength = strengthLine(day);
  el.style.borderLeftColor = DISCIPLINES[w.isRest ? "rest" : w.primary].color;
  el.innerHTML = `
    <span class="panel-label">Today</span>
    ${w.isRest ? "" : `<div class="today-pills">${pills(w)}</div>`}
    <h2 class="today-title">${esc(w.isRest ? "Rest day" : w.headline)}</h2>
    ${w.sub ? `<p class="today-sub">${esc(w.sub)}</p>` : ""}
    ${strength ? `<p class="today-strength">Strength: ${esc(strength)}</p>` : ""}
    ${
      done.length
        ? `<div class="today-done">${done
            .map(
              (a) =>
                `<a class="done-row" href="log.html#${a.id}">✓ Done: ${esc(sportConfig(a.type).label)} · ${activityBits(a)}</a>`
            )
            .join("")}</div>`
        : ""
    }
    <div class="today-foot">
      <a class="home-link" href="plan.html#${day.key}">Open today in the plan →</a>
      ${
        tomorrow
          ? `<span class="today-next">Tomorrow: ${esc(
              tomorrow.workout.isRest ? "rest" : tomorrow.workout.headline
            )}</span>`
          : ""
      }
    </div>`;
}

function renderRace() {
  const el = document.getElementById("home-race")!;
  const next = allDays.find((d) => d.date >= TODAY && d.workout.isRace);
  const week = weeks[currentIndex];

  let phase = "";
  if (week) {
    const phaseWeeks = weeks.filter((w) => w.phase === week.phase);
    const n = phaseWeeks.indexOf(week) + 1;
    phase = `
      <div class="phase-progress">
        <div class="phase-progress-head"><span>${esc(week.phase.split(":")[0])}</span><span>week ${n} of ${
      phaseWeeks.length
    }</span></div>
        <div class="prog-track"><div class="prog-fill" data-pct="${(n / phaseWeeks.length) * 100}" style="background-color:var(--accent)"></div></div>
      </div>`;
  }

  if (!next) {
    el.innerHTML = `<span class="panel-label">Next race</span><p class="today-sub">No race left in the plan.</p>${phase}`;
    return;
  }
  const days = Math.round((next.date.getTime() - TODAY.getTime()) / DAY_MS);
  el.innerHTML = `
    <span class="panel-label">Next race</span>
    <div class="race-days">${days === 0 ? "Today" : `${days}<small>${days === 1 ? "day" : "days"}</small>`}</div>
    <div class="race-name">${esc(raceName(next.workout.raw))}</div>
    <div class="race-date">${fmtLong(next.date)} ${next.date.getFullYear()}</div>
    ${phase}`;
}

// ── Week strip and planned-versus-done ───────────────────────

function weekLabel(index: number): string {
  const offset = index - currentIndex;
  const w = weeks[index];
  const range = `${w.start.toLocaleDateString("en-BE", { day: "numeric", month: "short" })} – ${addDays(
    w.start,
    6
  ).toLocaleDateString("en-BE", { day: "numeric", month: "short" })}`;
  const name =
    currentIndex === -1
      ? "Week"
      : offset === 0
      ? "This week"
      : offset === -1
      ? "Last week"
      : offset === 1
      ? "Next week"
      : offset < 0
      ? `${-offset} weeks ago`
      : `In ${offset} weeks`;
  return `${name} · ${range} · ${w.type}`;
}

function renderWeek() {
  const el = document.getElementById("home-week")!;
  const week = weeks[shownIndex];
  document.getElementById("week-label")!.textContent = week ? weekLabel(shownIndex) : "This week";
  (document.getElementById("week-prev") as HTMLButtonElement).disabled = shownIndex <= 0;
  (document.getElementById("week-next") as HTMLButtonElement).disabled = shownIndex >= weeks.length - 1;
  (document.getElementById("week-now") as HTMLButtonElement).disabled = shownIndex === currentIndex;

  if (!week) {
    el.innerHTML = `<p class="home-note">This week isn't in the plan.</p>`;
    renderProgress(null);
    return;
  }

  el.innerHTML = week.days
    .map((d, i) => {
      const w = d.workout;
      const done = byDay.get(d.key) ?? [];
      const isToday = d.key === TODAY_KEY;
      const dots = w.disciplines
        .filter((x) => x !== "rest")
        .map((x) => `<span class="d-dot" style="background-color:${DISCIPLINES[x].color}"></span>`)
        .join("");
      const status = done.length
        ? `<span class="wk-status done">✓ ${done.length > 1 ? `${done.length} activities` : esc(tileDone(done[0]))}</span>`
        : isToday
        ? `<span class="wk-status now">Today</span>`
        : "";
      const classes = ["wk-tile", w.isRest ? "is-rest" : "", isToday ? "is-today" : "", d.date < TODAY ? "is-past" : ""]
        .filter(Boolean)
        .join(" ");
      return `
        <a class="${classes}" href="plan.html#${d.key}" style="border-left-color:${
        DISCIPLINES[w.isRest ? "rest" : w.primary].color
      }">
          <span class="wk-top"><span class="wk-day">${DAY_KEYS[i]} ${d.date.getDate()}</span><span class="wk-dots">${dots}</span></span>
          <span class="wk-title">${esc(w.isRest ? "Rest" : w.headline)}</span>
          ${w.sub ? `<span class="wk-sub">${esc(w.sub)}</span>` : ""}
          ${status}
        </a>`;
    })
    .join("");

  // On phones the strip scrolls sideways; start it at today, not at Monday.
  const today = el.querySelector<HTMLElement>(".wk-tile.is-today");
  el.scrollLeft = today ? today.offsetLeft - el.offsetLeft - 8 : 0;

  renderProgress(week);
}

function progressBar(label: string, color: string, done: number, planned: number, doneText: string, planText: string): string {
  const pct = planned > 0 ? Math.min(100, (done / planned) * 100) : done > 0 ? 100 : 0;
  return `
    <div class="prog">
      <div class="prog-head"><span>${label}</span><span><b>${doneText}</b> / ${planText}</span></div>
      <div class="prog-track"><div class="prog-fill" data-pct="${pct.toFixed(1)}" style="background-color:${color}"></div></div>
    </div>`;
}

function renderProgress(week: PlanWeek | null) {
  const el = document.getElementById("home-progress")!;
  // Wait for the activities rather than flash a row of empty bars.
  if (!week || !loaded) {
    el.innerHTML = "";
    return;
  }

  const end = addDays(week.start, 7);
  const acts = (activities ?? []).filter((a) => {
    const d = startOfDay(new Date(a.start_time));
    return d >= week.start && d < end;
  });
  const total = (type: string, f: (a: Activity) => number) =>
    acts.filter((a) => normalizeType(a.type) === type).reduce((s, a) => s + f(a), 0);

  const planned = {
    run: week.runKm,
    bike: week.days.reduce((s, d) => s + d.workout.bikeMin, 0),
    swim: week.days.reduce((s, d) => s + d.workout.swimKm, 0),
    strength: week.days.filter((d) => sessionKeyIn(d.workout.raw)).length,
  };
  const done = {
    run: total("running", (a) => a.distance_km),
    bike: total("cycling", (a) => a.duration_sec / 60),
    swim: total("lap_swimming", (a) => a.distance_km),
    strength: acts.filter((a) => normalizeType(a.type) === "strength_training").length,
  };

  const bars: string[] = [];
  if (planned.run || done.run)
    bars.push(progressBar("Run", DISCIPLINES.run.color, done.run, planned.run, done.run.toFixed(1), `${planned.run} km`));
  if (planned.bike || done.bike)
    bars.push(progressBar("Bike", DISCIPLINES.bike.color, done.bike, planned.bike, fmtHours(done.bike), fmtHours(planned.bike)));
  if (planned.swim || done.swim)
    bars.push(progressBar("Swim", DISCIPLINES.swim.color, done.swim, planned.swim, done.swim.toFixed(1), `${planned.swim.toFixed(1)} km`));
  if (planned.strength || done.strength)
    bars.push(
      progressBar("Strength", DISCIPLINES.strength.color, done.strength, planned.strength, String(done.strength), `${planned.strength} sessions`)
    );

  // Padel, tennis and the like don't appear in the plan but still cost legs.
  const PLANNED_SPORTS = ["running", "cycling", "lap_swimming", "strength_training", "hiking"];
  const extra = new Map<string, { n: number; sec: number }>();
  acts
    .filter((a) => !PLANNED_SPORTS.includes(normalizeType(a.type)))
    .forEach((a) => {
      const label = sportConfig(a.type).label;
      const cur = extra.get(label) ?? { n: 0, sec: 0 };
      extra.set(label, { n: cur.n + 1, sec: cur.sec + a.duration_sec });
    });
  const extraNote = extra.size
    ? `<p class="home-note">Not in the plan: ${[...extra.entries()]
        .map(([label, v]) => `${v.n}× ${esc(label)} (${fmtHours(v.sec / 60)})`)
        .join(", ")}.</p>`
    : "";
  const missing = activities ? "" : `<p class="home-note">Activities unavailable right now, showing the plan only.</p>`;

  el.innerHTML = `<div class="prog-grid">${bars.join("")}</div>${extraNote}${missing}`;
  animateBars(el);
}

// Bars start empty and fill in, so a change of week reads as movement.
function animateBars(root: HTMLElement) {
  void root.offsetWidth;
  root.querySelectorAll<HTMLElement>(".prog-fill").forEach((bar) => {
    bar.style.width = `${bar.dataset.pct}%`;
  });
}

// ── Form and recent activities ───────────────────────────────

function sparkline(values: number[]): string {
  const w = 100;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(2)},${(h - ((v - min) / span) * (h - 2) - 1).toFixed(2)}`)
    .join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" style="fill:none;stroke:var(--accent);stroke-width:1.5;vector-effect:non-scaling-stroke" /></svg>`;
}

function renderForm() {
  const chips = document.getElementById("home-form")!;
  const spark = document.getElementById("home-spark")!;
  const note = document.getElementById("home-form-note")!;
  if (!activities) {
    note.textContent = loaded ? "Activities unavailable right now." : "Loading activities…";
    return;
  }
  const series = fitnessSeries(activities);
  if (series.length < 14) {
    note.textContent = "Not enough history yet to model fitness.";
    return;
  }

  const last = series[series.length - 1];
  const weekAgo = series[series.length - 8];
  const delta = last.ctl - weekAgo.ctl;
  const chip = (k: string, v: string, n: string) =>
    `<div class="stat-chip"><div class="k">${k}</div><div class="v">${v}</div><div class="n">${n}</div></div>`;
  chips.innerHTML = [
    chip("Fitness", last.ctl.toFixed(0), `${delta >= 0 ? "+" : ""}${delta.toFixed(0)} this week`),
    chip("Fatigue", last.atl.toFixed(0), "last 7 days"),
    chip("Form", `${last.tsb >= 0 ? "+" : ""}${last.tsb.toFixed(0)}`, formVerdict(last.tsb)),
  ].join("");
  spark.innerHTML = sparkline(series.slice(-84).map((p) => p.ctl));
  note.textContent = "Fitness over the last 12 weeks. More on the Stats page.";
}

function renderRecent() {
  const el = document.getElementById("home-recent")!;
  if (!activities) {
    el.innerHTML = `<p class="home-note">${loaded ? "Activities unavailable right now." : "Loading activities…"}</p>`;
    return;
  }
  const latest = [...activities]
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
    .slice(0, 5);
  el.innerHTML = latest
    .map((a) => {
      const cfg = sportConfig(a.type);
      const speed = a.avg_speed > 0 && cfg.mode !== "none" ? formatSpeedForType(a.avg_speed, a.type) : "";
      const side = [speed, a.avg_hr > 0 ? `${a.avg_hr} bpm` : ""].filter(Boolean).join(" · ");
      return `
        <a class="recent-row" href="log.html#${a.id}">
          <span class="sport-pill"><span class="sport-dot" style="background-color:${cfg.color}"></span>${esc(cfg.label)}</span>
          <span class="recent-main">${activityBits(a)}</span>
          <span class="recent-when">${fmtShort(new Date(a.start_time))}</span>
          <span class="recent-side">${side}</span>
        </a>`;
    })
    .join("");
}

// ── Boot ─────────────────────────────────────────────────────

// Everything that changes once the activities arrive.
function renderLive() {
  renderToday();
  renderWeek();
  renderForm();
  renderRecent();
}

function setupWeekNav() {
  const go = (index: number) => {
    shownIndex = Math.max(0, Math.min(weeks.length - 1, index));
    renderWeek();
  };
  document.getElementById("week-prev")!.addEventListener("click", () => go(shownIndex - 1));
  document.getElementById("week-next")!.addEventListener("click", () => go(shownIndex + 1));
  document.getElementById("week-now")!.addEventListener("click", () => go(currentIndex));
}

async function main() {
  renderDate();
  renderRace();
  animateBars(document.getElementById("home-race")!);
  setupWeekNav();
  renderLive();

  // The plan parts render without the API; activities fill in when they load.
  try {
    activities = await loadActivities();
    byDay = new Map();
    activities.forEach((a) => {
      const key = isoDay(new Date(a.start_time));
      byDay.set(key, [...(byDay.get(key) ?? []), a]);
    });
  } catch (err) {
    console.warn("Home: activities unavailable, showing the plan only.", err);
  }
  loaded = true;
  renderLive();
}

main();
