import "../css/style.css";
import "../css/log.css";
import "./pageTop";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  type ChartDataset,
  type TooltipItem,
} from "chart.js";
import {
  type Activity,
  type HrZone,
  sportConfig,
  normalizeType,
  formatDuration,
  formatSpeedForType,
  speedMetricLabel,
  formatClock,
  paceMinPerKm,
  paceSecPerKm,
  trimp,
  estimateCalories,
  hrZoneFor,
  hrZoneBoundaries,
  ZONES,
  mondayKey,
  shortDate,
  isoDay,
  addDays,
} from "./activityMetrics";
import { loadActivities } from "./dataSource";
import { planData } from "./planData";
import { DAY_KEYS, parsePlanDate, type TrainingWeek } from "./planParser";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler
);

const KNOWN_FILTERS = [
  "running",
  "lap_swimming",
  "paddelball",
  "cycling",
  "multi_sport",
  "hiking",
];

const BEST_EFFORT_DISTANCES: { label: string; km: number }[] = [
  { label: "5k", km: 5 },
  { label: "10k", km: 10 },
  { label: "21k", km: 21.0975 },
  { label: "42k", km: 42.195 },
];

const statusContainer = document.getElementById("status-container")!;
const tableBody = document.getElementById("activities-tbody")!;
const summaryChips = document.getElementById("summary-chips")!;
const drawer = document.getElementById("activity-drawer")!;
const drawerBody = document.getElementById("drawer-body")!;
const drawerBackdrop = document.getElementById("drawer-backdrop")!;
const drawerClose = document.getElementById("drawer-close")!;

let allActivities: Activity[] = [];
let activeFilter = "all";
let sortColumn = "date";
let sortDirection: "asc" | "desc" = "desc";
let drawerChart: Chart | null = null;
let drawerHideTimer: number | undefined;

// What the plan said for each day, so a logged activity can show it.
const plannedByDay = new Map<string, string>();
for (const row of (planData as { MainPlan: TrainingWeek[] }).MainPlan) {
  const start = parsePlanDate(row["Week Start"]);
  if (!start) continue;
  DAY_KEYS.forEach((key, i) => plannedByDay.set(isoDay(addDays(start, i)), row[key]));
}

// ── PRs ──────────────────────────────────────────────────────

interface PRs {
  longestDistance: Map<string, number>;
  fastestPace: Map<string, number>;
  longestDuration: Map<string, number>;
  bestEfforts: Map<string, number>;
}

let prs: PRs = {
  longestDistance: new Map(),
  fastestPace: new Map(),
  longestDuration: new Map(),
  bestEfforts: new Map(),
};

function computePRs(activities: Activity[]): PRs {
  const distanceMax = new Map<string, { id: number; val: number }>();
  const speedMax = new Map<string, { id: number; val: number }>();
  const durationMax = new Map<string, { id: number; val: number }>();
  const bestEfforts = new Map<string, { id: number; val: number }>();

  activities.forEach((a) => {
    const type = normalizeType(a.type);
    const mode = sportConfig(type).mode;

    if (a.distance_km > 0) {
      const cur = distanceMax.get(type);
      if (!cur || a.distance_km > cur.val)
        distanceMax.set(type, { id: a.id, val: a.distance_km });
    }
    if (a.avg_speed > 0 && mode !== "none") {
      const cur = speedMax.get(type);
      if (!cur || a.avg_speed > cur.val)
        speedMax.set(type, { id: a.id, val: a.avg_speed });
    }
    if (a.duration_sec > 0) {
      const cur = durationMax.get(type);
      if (!cur || a.duration_sec > cur.val)
        durationMax.set(type, { id: a.id, val: a.duration_sec });
    }
    if (type === "running" && a.avg_speed > 0) {
      BEST_EFFORT_DISTANCES.forEach(({ label, km }) => {
        if (a.distance_km >= km) {
          const cur = bestEfforts.get(label);
          if (!cur || a.avg_speed > cur.val)
            bestEfforts.set(label, { id: a.id, val: a.avg_speed });
        }
      });
    }
  });

  const toIdMap = (m: Map<string, { id: number; val: number }>) =>
    new Map([...m.entries()].map(([k, v]) => [k, v.id]));

  return {
    longestDistance: toIdMap(distanceMax),
    fastestPace: toIdMap(speedMax),
    longestDuration: toIdMap(durationMax),
    bestEfforts: toIdMap(bestEfforts),
  };
}

// ── Table ────────────────────────────────────────────────────

function sportPill(type: string): string {
  const cfg = sportConfig(type);
  return `<span class="sport-pill"><span class="sport-dot" style="background-color:${cfg.color}"></span>${cfg.label}</span>`;
}

function effortBar(value: number, max: number): string {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return `<span class="effort-cell"><span class="effort-track"><span class="effort-fill" style="width:${pct}%"></span></span><span class="effort-num">${Math.round(
    value
  )}</span></span>`;
}

function renderActivities(activities: Activity[]) {
  tableBody.innerHTML = "";
  const maxEffort = Math.max(1, ...activities.map((a) => trimp(a)));

  activities.forEach((activity) => {
    const type = normalizeType(activity.type);
    const row = document.createElement("tr");
    row.className = "activity-row";
    row.dataset.id = String(activity.id);
    row.tabIndex = 0;

    const speedDisplay = formatSpeedForType(activity.avg_speed, type);
    const hr = activity.avg_hr ? `${activity.avg_hr} bpm` : "--";

    const isDistancePR = prs.longestDistance.get(type) === activity.id;
    const isPacePR = prs.fastestPace.get(type) === activity.id;
    const isDurationPR = prs.longestDuration.get(type) === activity.id;

    const effortBadges = BEST_EFFORT_DISTANCES.filter(
      ({ label }) => prs.bestEfforts.get(label) === activity.id
    )
      .map(
        ({ label }) =>
          `<span class="pr-badge effort" title="Fastest ${label} effort">${label}</span>`
      )
      .join(" ");

    const distanceCell = `${
      activity.distance_km > 0 ? activity.distance_km.toFixed(2) + " km" : "--"
    }${isDistancePR ? " " + prBadge("Longest " + type) : ""}${
      effortBadges ? " " + effortBadges : ""
    }`;
    const paceCell = `${speedDisplay}${
      isPacePR ? " " + prBadge("Best pace/speed for " + type) : ""
    }`;
    const durationCell = `${formatDuration(activity.duration_sec)}${
      isDurationPR ? " " + prBadge("Longest duration for " + type) : ""
    }`;

    row.innerHTML = `
      <td>${new Date(activity.start_time).toLocaleDateString("en-BE", {
        year: "2-digit",
        month: "short",
        day: "numeric",
      })}</td>
      <td>${sportPill(type)}</td>
      <td>${distanceCell}</td>
      <td>${durationCell}</td>
      <td>${paceCell}</td>
      <td>${hr}</td>
      <td>${effortBar(trimp(activity), maxEffort)}</td>
    `;
    row.addEventListener("click", () => openDrawer(activity));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter") openDrawer(activity);
    });
    tableBody.appendChild(row);
  });
}

function prBadge(title: string, label = "PR"): string {
  return `<span class="pr-badge" title="${title}">${label}</span>`;
}

function renderSummaryChips(activities: Activity[]) {
  const count = activities.length;
  const dist = activities.reduce((s, a) => s + a.distance_km, 0);
  const time = activities.reduce((s, a) => s + a.duration_sec, 0);
  const effort = activities.reduce((s, a) => s + trimp(a), 0);

  summaryChips.innerHTML = `
    <div class="stat-chip"><div class="k">Activities</div><div class="v">${count}</div></div>
    <div class="stat-chip"><div class="k">Distance</div><div class="v">${dist.toFixed(
      0
    )} km</div></div>
    <div class="stat-chip"><div class="k">Moving time</div><div class="v">${formatDuration(
      time
    )}</div></div>
    <div class="stat-chip"><div class="k">Total effort</div><div class="v">${Math.round(
      effort
    )}</div></div>
  `;
}

// ── Filtering / sorting ──────────────────────────────────────

function getFilteredActivities(): Activity[] {
  let filtered: Activity[];
  if (activeFilter === "all") {
    filtered = [...allActivities];
  } else if (activeFilter === "other") {
    filtered = allActivities.filter(
      (a) => !KNOWN_FILTERS.includes(normalizeType(a.type))
    );
  } else {
    filtered = allActivities.filter((a) => normalizeType(a.type) === activeFilter);
  }
  return sortActivities(filtered);
}

function sortActivities(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => {
    let valA: number;
    let valB: number;
    switch (sortColumn) {
      case "date":
        valA = new Date(a.start_time).getTime();
        valB = new Date(b.start_time).getTime();
        break;
      case "type":
        return sortDirection === "asc"
          ? sportConfig(a.type).label.localeCompare(sportConfig(b.type).label)
          : sportConfig(b.type).label.localeCompare(sportConfig(a.type).label);
      case "distance":
        valA = a.distance_km;
        valB = b.distance_km;
        break;
      case "duration":
        valA = a.duration_sec;
        valB = b.duration_sec;
        break;
      case "pace":
        valA = a.avg_speed || 0;
        valB = b.avg_speed || 0;
        return sortDirection === "asc" ? valB - valA : valA - valB;
      case "hr":
        valA = a.avg_hr || 0;
        valB = b.avg_hr || 0;
        break;
      case "effort":
        valA = trimp(a);
        valB = trimp(b);
        break;
      default:
        return 0;
    }
    return sortDirection === "asc" ? valA - valB : valB - valA;
  });
}

function updateSortIndicators() {
  document.querySelectorAll<HTMLTableCellElement>("th[data-sort]").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sort === sortColumn) {
      th.classList.add(sortDirection === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}

function setupSorting() {
  document.querySelectorAll<HTMLTableCellElement>("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.dataset.sort!;
      if (sortColumn === col) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
      } else {
        sortColumn = col;
        sortDirection = col === "date" ? "desc" : "asc";
      }
      updateSortIndicators();
      renderActivities(getFilteredActivities());
    });
  });
}

function setupFilters() {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".filter-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter!;
      const list = getFilteredActivities();
      renderSummaryChips(list);
      renderActivities(list);
    });
  });
}

function renderStatus(message: string, isError = false) {
  if (!message) {
    statusContainer.classList.add("hidden");
    return;
  }
  statusContainer.classList.remove("hidden");
  statusContainer.innerHTML = `<p class="${isError ? "error" : "loading"}">${message}</p>`;
  if (!isError) tableBody.innerHTML = "";
}

// ── Detail drawer ────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function distanceBucket(km: number): { lo: number; hi: number; label: string } {
  const size = km < 10 ? 2 : 5;
  const lo = Math.floor(km / size) * size;
  const hi = lo + size;
  return { lo, hi, label: `${lo}–${hi} km` };
}

function comparisonRows(activity: Activity): string {
  const type = normalizeType(activity.type);
  const cfg = sportConfig(type);
  const peers = allActivities.filter(
    (a) => normalizeType(a.type) === type && a.id !== activity.id
  );
  if (!peers.length) return "";

  const row = (label: string, value: string, note: string): string =>
    `<div class="compare-row"><span class="cl">${label}</span><span class="cv">${value}</span><span class="cn">${note}</span></div>`;

  const rows: string[] = [];

  // Distance vs median, where distance means something (not padel's GPS wander).
  if (cfg.mode !== "none" && activity.distance_km > 0) {
    const dists = peers
      .map((a) => a.distance_km)
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    if (dists.length) {
      const median = dists[Math.floor(dists.length / 2)];
      const ratio = median > 0 ? activity.distance_km / median : 0;
      const longerThan = dists.filter((d) => d < activity.distance_km).length;
      const rank = dists.length + 1 - longerThan;
      rows.push(
        row(
          "Distance",
          `${ratio.toFixed(1)}× your median`,
          `${ordinal(rank)} longest of ${dists.length + 1}`
        )
      );
    }
  }

  // Duration rank where there's no real distance; otherwise it only repeats it.
  if (activity.duration_sec > 0 && (cfg.mode === "none" || activity.distance_km <= 0)) {
    const longer = peers.filter((a) => a.duration_sec > activity.duration_sec).length;
    rows.push(
      row("Duration", formatDuration(activity.duration_sec), `${ordinal(longer + 1)} longest of ${peers.length + 1}`)
    );
  }

  // Runs: pace rank among runs at the same heart-rate zone, i.e. the same effort.
  const zone = type === "running" ? hrZoneFor(activity.avg_hr) : null;
  if (zone && activity.avg_speed > 0) {
    const sameZone = peers.filter(
      (a) => a.avg_speed > 0 && a.distance_km >= 2 && hrZoneFor(a.avg_hr)?.zone === zone.zone
    );
    const faster = sameZone.filter((a) => a.avg_speed > activity.avg_speed).length;
    rows.push(
      row(
        speedMetricLabel(type),
        formatSpeedForType(activity.avg_speed, type),
        sameZone.length
          ? `${ordinal(faster + 1)} fastest of ${sameZone.length + 1} zone ${zone.zone} runs`
          : `first run in zone ${zone.zone}`
      )
    );
  } else if (activity.avg_speed > 0 && cfg.mode !== "none" && activity.distance_km > 0) {
    // Other sports, or a run without HR: rank within a distance bucket.
    const b = distanceBucket(activity.distance_km);
    const sameBucket = peers.filter(
      (a) =>
        a.avg_speed > 0 &&
        a.distance_km >= b.lo &&
        a.distance_km < b.hi
    );
    const faster = sameBucket.filter((a) => a.avg_speed > activity.avg_speed).length;
    rows.push(
      row(
        speedMetricLabel(type),
        formatSpeedForType(activity.avg_speed, type),
        sameBucket.length
          ? `${ordinal(faster + 1)} fastest of ${sameBucket.length + 1} at ${b.label}`
          : `first at ${b.label}`
      )
    );
  }

  if (!rows.length) return "";
  return `
    <div class="section-header">Compared with your ${cfg.label.toLowerCase()}</div>
    <div class="compare-list">${rows.join("")}</div>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hrZoneBlock(activity: Activity): string {
  const zone = hrZoneFor(activity.avg_hr);
  if (!zone) return "";
  // Zones are equal steps of heart-rate reserve, so the bar's five equal
  // segments and its tick labels line up with the real boundaries.
  const bounds = hrZoneBoundaries();
  const lo = bounds[0];
  const hi = bounds[bounds.length - 1];
  const pos = Math.max(0, Math.min(1, (activity.avg_hr - lo) / (hi - lo)));
  const segments = ZONES.map((z) => `<span style="background-color:${z.color}"></span>`).join("");
  const ticks = bounds
    .map((bpm, i) => `<span style="left:${(i / (bounds.length - 1)) * 100}%">${bpm}</span>`)
    .join("");
  const where =
    activity.avg_hr < lo
      ? "Below zone 1"
      : `Zone ${zone.zone} · ${zone.label} · ${bounds[zone.zone - 1]}–${bounds[zone.zone]} bpm`;
  return `
    <div class="section-header">Heart rate</div>
    <div class="zone-bar">
      <div class="zone-segments">${segments}</div>
      <div class="zone-marker" style="left:${(pos * 100).toFixed(1)}%"></div>
    </div>
    <div class="zone-ticks">${ticks}</div>
    <div class="zone-caption">${where} · ${activity.avg_hr} bpm avg</div>`;
}

function plannedBlock(activity: Activity): string {
  const day = isoDay(new Date(activity.start_time));
  const text = plannedByDay.get(day);
  if (!text) return "";
  return `
    <div class="section-header">Planned that day</div>
    <p class="plan-note">${esc(text)}</p>
    <a class="session-link" href="plan.html#${day}">Open the day in the plan →</a>`;
}

function metricGrid(activity: Activity): string {
  const type = normalizeType(activity.type);
  const cals = estimateCalories(activity);
  const cells: [string, string][] = [];

  const hasDistance = sportConfig(type).mode !== "none";
  if (hasDistance && activity.distance_km > 0)
    cells.push(["Distance", `${activity.distance_km.toFixed(2)} km`]);
  cells.push(["Moving time", formatDuration(activity.duration_sec)]);
  if (hasDistance && activity.avg_speed > 0)
    cells.push([speedMetricLabel(type), formatSpeedForType(activity.avg_speed, type)]);
  if (activity.avg_hr > 0) cells.push(["Avg HR", `${activity.avg_hr} bpm`]);
  cells.push(["Relative effort", String(Math.round(trimp(activity)))]);
  if (cals > 0) cells.push(["Est. calories", `~${cals}`]);

  return `<div class="metric-grid">${cells
    .map(
      ([k, v]) =>
        `<div class="metric-cell"><div class="mk">${k}</div><div class="mv">${v}</div></div>`
    )
    .join("")}</div>`;
}

function openDrawer(activity: Activity) {
  const type = normalizeType(activity.type);
  const cfg = sportConfig(type);
  const when = new Date(activity.start_time);
  const title =
    cfg.mode !== "none" && activity.distance_km > 0
      ? `${activity.distance_km.toFixed(2)} km ${cfg.label}`
      : cfg.label;

  const weekPeers = allActivities.filter(
    (a) => mondayKey(new Date(a.start_time)) === mondayKey(when)
  );
  const weekEffort = weekPeers.reduce((s, a) => s + trimp(a), 0);
  const byZone = type === "running" && activity.avg_hr > 0 && activity.avg_speed > 0;

  drawerBody.innerHTML = `
    <div class="drawer-head">
      ${sportPill(type)}
      <h2 class="drawer-title">${title}</h2>
      <div class="drawer-sub">${when.toLocaleDateString("en-BE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })} · ${when.toLocaleTimeString("en-BE", {
    hour: "2-digit",
    minute: "2-digit",
  })}</div>
    </div>
    ${metricGrid(activity)}
    ${hrZoneBlock(activity)}
    ${plannedBlock(activity)}
    ${comparisonRows(activity)}
    ${
      byZone
        ? `<div class="section-header">Pace by heart-rate zone</div>
    <p class="drawer-note zone-intro">Each run sits in the zone of its average heart rate. Same zone means the same effort, so a faster pace there is real progress. Lines are the monthly median.</p>
    <div class="drawer-chart tall"><canvas id="drawer-chart-canvas"></canvas></div>
    <div id="zone-chips" class="zone-chips"></div>
    <div id="zone-trends" class="compare-list"></div>`
        : `<div class="section-header">${comparisonChartTitle(activity)}</div>
    <div class="drawer-chart"><canvas id="drawer-chart-canvas"></canvas></div>
    <p id="drawer-chart-empty" class="drawer-note hidden">Not enough similar activities to chart yet.</p>`
    }
    <p class="drawer-note">This activity added ${Math.round(
      trimp(activity)
    )} to the week's effort (${Math.round(weekEffort)} total across ${
    weekPeers.length
  } ${weekPeers.length === 1 ? "activity" : "activities"}).</p>
  `;

  if (byZone) renderZonePaceChart(activity);
  else renderComparisonChart(activity);

  if (drawerHideTimer !== undefined) window.clearTimeout(drawerHideTimer);
  drawer.classList.remove("hidden");
  drawerBackdrop.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
  drawer.scrollTop = 0;
  requestAnimationFrame(() => drawer.classList.add("open"));
}

function comparisonChartTitle(activity: Activity): string {
  const cfg = sportConfig(activity.type);
  if (cfg.mode !== "none" && activity.distance_km > 0) {
    return `Your ${cfg.label.toLowerCase()} form near ${activity.distance_km.toFixed(
      0
    )} km`;
  }
  return `Your ${cfg.label.toLowerCase()} effort over time`;
}

function renderComparisonChart(activity: Activity) {
  const type = normalizeType(activity.type);
  const cfg = sportConfig(type);
  const canvas = document.getElementById(
    "drawer-chart-canvas"
  ) as HTMLCanvasElement | null;
  const empty = document.getElementById("drawer-chart-empty");
  if (!canvas) return;

  const hasDistance = cfg.mode !== "none" && activity.distance_km > 0;
  const peers = allActivities
    .filter((a) => {
      if (normalizeType(a.type) !== type) return false;
      if (cfg.mode !== "none" && a.avg_speed <= 0) return false;
      if (hasDistance) {
        return Math.abs(a.distance_km - activity.distance_km) <=
          activity.distance_km * 0.25;
      }
      return a.duration_sec > 0;
    })
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

  if (peers.length < 3) {
    canvas.classList.add("hidden");
    empty?.classList.remove("hidden");
    return;
  }

  const useSpeed = cfg.mode === "speed";
  const useSwim = cfg.mode === "swim";
  const valueOf = (a: Activity): number => {
    if (useSpeed) return a.avg_speed * 3.6;
    if (useSwim) return 100 / a.avg_speed;
    if (cfg.mode === "pace") return paceMinPerKm(a.avg_speed);
    return trimp(a);
  };
  const yTitle = useSpeed
    ? "km/h"
    : useSwim
    ? "sec / 100m"
    : cfg.mode === "pace"
    ? "min / km"
    : "effort";
  const lowerIsBetter = useSwim || cfg.mode === "pace";

  const pointColors = peers.map((a) =>
    a.id === activity.id ? cfg.color : "rgba(255,255,255,0.28)"
  );
  const pointRadius = peers.map((a) => (a.id === activity.id ? 6 : 3));

  drawerChart?.destroy();
  drawerChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: peers.map((a) => shortDate(new Date(a.start_time))),
      datasets: [
        {
          data: peers.map((a) => +valueOf(a).toFixed(3)),
          borderColor: cfg.color,
          backgroundColor: hexToRgba(cfg.color, 0.12),
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<"line">) => {
              const y = ctx.parsed.y ?? 0;
              if (useSpeed) return `${y.toFixed(1)} km/h`;
              if (useSwim) return `${formatClock(y)} /100m`;
              if (cfg.mode === "pace") return `${formatClock(y * 60)} /km`;
              return `${Math.round(y)} effort`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(255,255,255,0.55)", maxTicksLimit: 6 },
          grid: { color: "#3d3d44" },
        },
        y: {
          reverse: lowerIsBetter,
          ticks: {
            color: "rgba(255,255,255,0.55)",
            callback: (val: string | number) => {
              const n = val as number;
              if (cfg.mode === "pace") return formatClock(n * 60);
              if (useSwim) return formatClock(n);
              return String(n);
            },
          },
          grid: { color: "#3d3d44" },
          title: { display: true, text: yTitle, color: "rgba(255,255,255,0.55)" },
        },
      },
    },
  });
  canvas.classList.remove("hidden");
  empty?.classList.add("hidden");
}

// ── Pace by heart-rate zone (runs) ───────────────────────────
//
// Average HR puts every run in a zone. Within a zone the effort is the same,
// so a faster pace there is real progress, whatever the run was meant to be.

const DAY_MS = 86_400_000;
const ZONE_WINDOW_DAYS = 365;
// Zones with fewer runs get dots but no line, and start switched off so a
// handful of slow jogs doesn't stretch the pace axis.
const MIN_TREND_RUNS = 6;

interface ZoneRun {
  a: Activity;
  t: number;
  pace: number; // sec / km
  zone: number;
}

// Extra fields ride along on each chart point for the tooltip.
interface ZonePoint {
  x: number;
  y: number;
  hr: number;
  km: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// One point per month (the median of that month's runs, placed mid-month);
// months with a single run are skipped as too noisy.
function monthlyMedians(runs: ZoneRun[]): { x: number; y: number }[] {
  const months = new Map<string, number[]>();
  runs.forEach((r) => {
    const d = new Date(r.t);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    months.set(key, [...(months.get(key) ?? []), r.pace]);
  });
  return [...months.entries()]
    .filter(([, paces]) => paces.length >= 2)
    .map(([key, paces]) => {
      const [y, m] = key.split("-").map(Number);
      return { x: new Date(y, m, 15).getTime(), y: median(paces) };
    })
    .sort((a, b) => a.x - b.x);
}

// First of every other month across the window, for the x-axis.
function monthTicks(start: number, end: number): number[] {
  const d = new Date(start);
  const ticks: number[] = [];
  for (let m = new Date(d.getFullYear(), d.getMonth() + 1, 1); m.getTime() <= end; m.setMonth(m.getMonth() + 1)) {
    ticks.push(m.getTime());
  }
  return ticks.length > 7 ? ticks.filter((_, i) => i % 2 === 0) : ticks;
}

function monthLabel(t: number): string {
  const d = new Date(t);
  return d.toLocaleDateString("en-BE", d.getMonth() === 0 ? { month: "short", year: "2-digit" } : { month: "short" });
}

// "6:58 → 6:41 /km": median of the first few runs in the zone against the latest few.
function zoneTrendRow(z: HrZone, runs: ZoneRun[], bounds: number[], current: boolean): string {
  const label = `<span class="zt-dot" style="background-color:${z.color}"></span>Zone ${z.zone} · ${z.label}`;
  const range = `${bounds[z.zone - 1]}–${bounds[z.zone]} bpm`;
  // At least 3 runs on each side, or one odd run swings the verdict.
  const k = Math.min(5, Math.floor(runs.length / 2));
  let value: string;
  let note: string;

  if (k < 3) {
    value = `${formatClock(median(runs.map((r) => r.pace)))} /km`;
    note = `${range} · ${runs.length} ${runs.length === 1 ? "run" : "runs"}, too few for a trend`;
  } else {
    const then = median(runs.slice(0, k).map((r) => r.pace));
    const now = median(runs.slice(-k).map((r) => r.pace));
    const diff = Math.round(then - now); // positive = faster now
    const verdict =
      Math.abs(diff) < 5
        ? "about the same"
        : `<span class="${diff > 0 ? "trend-good" : "trend-bad"}">${Math.abs(diff)} s/km ${
            diff > 0 ? "faster" : "slower"
          }</span>`;
    value = `${formatClock(then)} → ${formatClock(now)} /km`;
    note = `${range} · ${verdict} · ${runs.length} runs`;
  }

  return `<div class="compare-row${current ? " is-current" : ""}"><span class="cl">${label}</span><span class="cv">${value}</span><span class="cn">${note}</span></div>`;
}

function renderZonePaceChart(activity: Activity) {
  const canvas = document.getElementById("drawer-chart-canvas") as HTMLCanvasElement | null;
  const chipsEl = document.getElementById("zone-chips");
  const trendsEl = document.getElementById("zone-trends");
  const own = hrZoneFor(activity.avg_hr);
  if (!canvas || !chipsEl || !trendsEl || !own) return;

  const openedAt = new Date(activity.start_time).getTime();
  const end = Date.now();
  const start = Math.min(end - ZONE_WINDOW_DAYS * DAY_MS, openedAt - 30 * DAY_MS);
  const bounds = hrZoneBoundaries();

  const runs: ZoneRun[] = allActivities
    .filter(
      (a) =>
        normalizeType(a.type) === "running" && a.avg_hr > 0 && a.avg_speed > 0 && a.distance_km >= 2
    )
    .map((a) => ({
      a,
      t: new Date(a.start_time).getTime(),
      pace: paceSecPerKm(a.avg_speed),
      zone: hrZoneFor(a.avg_hr)?.zone ?? 1,
    }))
    // 3:30–9:30 /km keeps out walk breaks and GPS glitches.
    .filter((r) => r.t >= start && r.pace >= 210 && r.pace <= 570)
    .sort((x, y) => x.t - y.t);

  const datasets: ChartDataset<"line", { x: number; y: number }[]>[] = [];
  const datasetZone: number[] = [];
  const zonesShown: HrZone[] = [];
  const hiddenZones = new Set<number>();
  const trendRows: string[] = [];

  ZONES.forEach((z) => {
    const inZone = runs.filter((r) => r.zone === z.zone);
    if (!inZone.length) return;
    zonesShown.push(z);

    const points: ZonePoint[] = inZone.map((r) => ({
      x: r.t,
      y: r.pace,
      hr: r.a.avg_hr,
      km: r.a.distance_km,
    }));
    const sparse = inZone.length < MIN_TREND_RUNS;
    if (sparse && z.zone !== own.zone) hiddenZones.add(z.zone);

    datasets.push({
      label: `Z${z.zone}`,
      data: points,
      showLine: false,
      pointRadius: 2.5,
      pointHoverRadius: 4,
      pointBackgroundColor: hexToRgba(z.color, 0.45),
      pointBorderWidth: 0,
      hidden: hiddenZones.has(z.zone),
    });
    datasetZone.push(z.zone);
    if (!sparse) {
      datasets.push({
        label: `Z${z.zone} trend`,
        data: monthlyMedians(inZone),
        borderColor: z.color,
        borderWidth: z.zone === own.zone ? 3 : 1.5,
        pointRadius: 0,
        tension: 0.3,
      });
      datasetZone.push(z.zone);
    }
    trendRows.push(zoneTrendRow(z, inZone, bounds, z.zone === own.zone));
  });

  const thisRun: ZonePoint = {
    x: openedAt,
    y: paceSecPerKm(activity.avg_speed),
    hr: activity.avg_hr,
    km: activity.distance_km,
  };
  datasets.push({
    label: "This run",
    data: [thisRun],
    showLine: false,
    pointRadius: 7,
    pointHoverRadius: 8,
    pointBackgroundColor: own.color,
    pointBorderColor: "#fff",
    pointBorderWidth: 2,
  });
  datasetZone.push(0); // never toggled off

  const axisColor = "rgba(255,255,255,0.55)";
  drawerChart?.destroy();
  drawerChart = new Chart(canvas, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item) => !String(item.dataset.label).endsWith("trend"),
          callbacks: {
            title: (items) =>
              items.length ? shortDate(new Date((items[0].raw as ZonePoint).x)) : "",
            label: (ctx) => {
              const p = ctx.raw as ZonePoint;
              return `${formatClock(p.y)} /km · ${p.hr} bpm · ${p.km.toFixed(1)} km`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: start,
          max: end,
          afterBuildTicks: (axis) => {
            axis.ticks = monthTicks(start, end).map((value) => ({ value }));
          },
          ticks: { color: axisColor, callback: (v) => monthLabel(Number(v)) },
          grid: { color: "#3d3d44" },
        },
        y: {
          reverse: true,
          ticks: { color: axisColor, callback: (v) => formatClock(Number(v)) },
          grid: { color: "#3d3d44" },
          title: { display: true, text: "min / km", color: axisColor },
        },
      },
    },
  });

  chipsEl.innerHTML = zonesShown
    .map(
      (z) =>
        `<button type="button" class="zone-chip${hiddenZones.has(z.zone) ? " is-off" : ""}" data-zone="${
          z.zone
        }"><span class="zt-dot" style="background-color:${z.color}"></span>Z${z.zone} ${z.label}</button>`
    )
    .join("");
  chipsEl.querySelectorAll<HTMLButtonElement>(".zone-chip").forEach((btn) =>
    btn.addEventListener("click", () => {
      const zone = Number(btn.dataset.zone);
      const hidden = btn.classList.toggle("is-off");
      datasetZone.forEach((z, i) => {
        if (z === zone) drawerChart?.setDatasetVisibility(i, !hidden);
      });
      drawerChart?.update();
    })
  );

  trendsEl.innerHTML = trendRows.join("");
}

function closeDrawer() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  drawerBackdrop.classList.add("hidden");
  drawerChart?.destroy();
  drawerChart = null;
  drawerHideTimer = window.setTimeout(() => drawer.classList.add("hidden"), 200);
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Boot ─────────────────────────────────────────────────────

async function main() {
  drawerClose.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.classList.contains("hidden")) closeDrawer();
  });

  try {
    renderStatus("Loading activities...");
    allActivities = await loadActivities();
    prs = computePRs(allActivities);

    renderStatus("");
    setupFilters();
    setupSorting();
    updateSortIndicators();
    const list = getFilteredActivities();
    renderSummaryChips(list);
    renderActivities(list);

    // log.html#<activity id> opens that activity straight away.
    const wanted = decodeURIComponent(location.hash.slice(1));
    const target = wanted ? allActivities.find((a) => String(a.id) === wanted) : undefined;
    if (target) openDrawer(target);
  } catch (err) {
    console.error("Error fetching activities:", err);
    renderStatus(
      err instanceof Error ? err.message : "An unknown error occurred.",
      true
    );
  }
}

main();