import "../css/style.css";
import "../css/log.css";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  type TooltipItem,
} from "chart.js";
import {
  type Activity,
  sportConfig,
  normalizeType,
  formatDuration,
  formatSpeedForType,
  speedMetricLabel,
  formatClock,
  paceMinPerKm,
  trimp,
  estimateCalories,
  hrZoneFor,
  DEFAULT_MAX_HR,
  mondayKey,
  shortDate,
} from "./activityMetrics";
import { loadActivities } from "./dataSource";

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

  // Distance vs median
  if (activity.distance_km > 0) {
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

  // Duration rank
  if (activity.duration_sec > 0) {
    const longer = peers.filter((a) => a.duration_sec > activity.duration_sec).length;
    rows.push(
      row("Duration", formatDuration(activity.duration_sec), `${ordinal(longer + 1)} longest of ${peers.length + 1}`)
    );
  }

  // Pace/speed rank within distance bucket
  if (activity.avg_speed > 0 && cfg.mode !== "none" && activity.distance_km > 0) {
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

function hrZoneBlock(activity: Activity): string {
  if (!activity.avg_hr || activity.avg_hr <= 0) return "";
  const zone = hrZoneFor(activity.avg_hr, DEFAULT_MAX_HR);
  if (!zone) return "";
  const lo = DEFAULT_MAX_HR * 0.5;
  const pos = Math.max(0, Math.min(1, (activity.avg_hr - lo) / (DEFAULT_MAX_HR - lo)));
  const segments = [
    "#8ac6ff",
    "#80cf80",
    "#f0c040",
    "#f0a04b",
    "#ff6b6b",
  ]
    .map((c) => `<span style="background-color:${c}"></span>`)
    .join("");
  return `
    <div class="section-header">Heart rate</div>
    <div class="zone-bar">
      <div class="zone-segments">${segments}</div>
      <div class="zone-marker" style="left:${(pos * 100).toFixed(1)}%"></div>
    </div>
    <div class="zone-caption">Zone ${zone.zone} · ${zone.label} · ${activity.avg_hr} bpm avg</div>`;
}

function metricGrid(activity: Activity): string {
  const type = normalizeType(activity.type);
  const cals = estimateCalories(activity);
  const cells: [string, string][] = [];

  if (activity.distance_km > 0)
    cells.push(["Distance", `${activity.distance_km.toFixed(2)} km`]);
  cells.push(["Moving time", formatDuration(activity.duration_sec)]);
  if (activity.avg_speed > 0)
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
    activity.distance_km > 0
      ? `${activity.distance_km.toFixed(2)} km ${cfg.label}`
      : cfg.label;

  const weekPeers = allActivities.filter(
    (a) => mondayKey(new Date(a.start_time)) === mondayKey(when)
  );
  const weekEffort = weekPeers.reduce((s, a) => s + trimp(a), 0);

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
    ${comparisonRows(activity)}
    <div class="section-header">${comparisonChartTitle(activity)}</div>
    <div class="drawer-chart"><canvas id="drawer-chart-canvas"></canvas></div>
    <p id="drawer-chart-empty" class="drawer-note hidden">Not enough similar activities to chart yet.</p>
    <p class="drawer-note">This activity added ${Math.round(
      trimp(activity)
    )} to the week's effort (${Math.round(weekEffort)} total across ${
    weekPeers.length
  } ${weekPeers.length === 1 ? "activity" : "activities"}).</p>
  `;

  renderComparisonChart(activity);

  if (drawerHideTimer !== undefined) window.clearTimeout(drawerHideTimer);
  drawer.classList.remove("hidden");
  drawerBackdrop.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
  drawer.scrollTop = 0;
  requestAnimationFrame(() => drawer.classList.add("open"));
}

function comparisonChartTitle(activity: Activity): string {
  const cfg = sportConfig(activity.type);
  if (activity.distance_km > 0) {
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

  const hasDistance = activity.distance_km > 0;
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
  } catch (err) {
    console.error("Error fetching activities:", err);
    renderStatus(
      err instanceof Error ? err.message : "An unknown error occurred.",
      true
    );
  }
}

main();