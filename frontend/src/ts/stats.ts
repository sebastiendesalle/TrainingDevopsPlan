import "../css/style.css";
import "../css/stats.css";
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  type TooltipItem,
} from "chart.js";

Chart.register(
  BarController, BarElement,
  LineController, LineElement, PointElement,
  LinearScale, CategoryScale,
  Tooltip, Filler
);

interface Activity {
  id: number;
  type: string;
  start_time: string;
  distance_km: number;
  duration_sec: number;
  avg_hr: number;
  avg_speed: number;
}

const BEST_EFFORTS = [
  { label: "5k",            km: 5 },
  { label: "10k",           km: 10 },
  { label: "Half Marathon", km: 21.0975 },
  { label: "Marathon",      km: 42.195 },
];

// ── Utilities ────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h > 0 ? h + ":" : ""}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatPace(speedMps: number): string {
  if (!speedMps) return "--";
  const sec = 1000 / speedMps;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")} /km`;
}

function speedToPaceMin(speedMps: number): number {
  if (!speedMps) return 0;
  return 1000 / speedMps / 60;
}

function getMondayKey(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function getMondayLabel(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-BE", { month: "short", day: "numeric" });
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  return new Date(parseInt(year), parseInt(month) - 1, 1)
    .toLocaleDateString("en-BE", { month: "short", year: "numeric" });
}

const CHART_COLORS = {
  text:   "rgba(255,255,255,0.65)",
  grid:   "#444",
  purple: "#646cff",
  green:  "#80cf80",
  red:    "#ff6b6b",
};

// ── YTD Summary ──────────────────────────────────────────────

function renderYTD(activities: Activity[]) {
  const year = new Date().getFullYear();
  const ytd  = activities.filter(a => new Date(a.start_time).getFullYear() === year);
  const runs  = ytd.filter(a => a.type.toLowerCase() === "running");

  const totalDist = ytd.reduce((s, a) => s + a.distance_km, 0);
  const totalTime = ytd.reduce((s, a) => s + a.duration_sec, 0);
  const runDist   = runs.reduce((s, a) => s + a.distance_km, 0);

  document.getElementById("ytd-cards")!.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Activities</div>
      <div class="stat-value">${ytd.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Distance</div>
      <div class="stat-value">${totalDist.toFixed(1)} km</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Time</div>
      <div class="stat-value">${formatDuration(totalTime)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Runs</div>
      <div class="stat-value">${runs.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Running Distance</div>
      <div class="stat-value">${runDist.toFixed(1)} km</div>
    </div>
  `;
}

// ── Monthly Summary ──────────────────────────────────────────

function renderMonthly(activities: Activity[]) {
  const monthMap = new Map<string, Activity[]>();
  activities.forEach(a => {
    const key = getMonthKey(new Date(a.start_time));
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key)!.push(a);
  });

  const months = [...monthMap.keys()].sort().reverse().slice(0, 6).reverse();

  document.getElementById("monthly-cards")!.innerHTML = months.map(key => {
    const acts      = monthMap.get(key)!;
    const runs      = acts.filter(a => a.type.toLowerCase() === "running");
    const totalDist = acts.reduce((s, a) => s + a.distance_km, 0);
    const runDist   = runs.reduce((s, a) => s + a.distance_km, 0);
    const totalTime = acts.reduce((s, a) => s + a.duration_sec, 0);

    const validRuns  = runs.filter(a => a.avg_speed > 0);
    const avgPaceSec = validRuns.length
      ? validRuns.reduce((s, a) => s + 1000 / a.avg_speed, 0) / validRuns.length
      : 0;
    const avgPaceStr = avgPaceSec
      ? `${Math.floor(avgPaceSec / 60)}:${Math.floor(avgPaceSec % 60).toString().padStart(2, "0")} /km`
      : "--";

    return `
      <div class="stat-card month-card">
        <div class="month-label">${getMonthLabel(key)}</div>
        <div class="month-row"><span>Activities</span><span>${acts.length}</span></div>
        <div class="month-row"><span>Total Distance</span><span>${totalDist.toFixed(1)} km</span></div>
        <div class="month-row"><span>Running Distance</span><span>${runDist.toFixed(1)} km</span></div>
        <div class="month-row"><span>Total Time</span><span>${formatDuration(totalTime)}</span></div>
        <div class="month-row"><span>Avg Run Pace</span><span>${avgPaceStr}</span></div>
      </div>
    `;
  }).join("");
}

// ── PR Cards ─────────────────────────────────────────────────

function renderPRCards(activities: Activity[]) {
  const runs = activities.filter(
    a => a.type.toLowerCase() === "running" && a.avg_speed > 0
  );

  const effortHtml = BEST_EFFORTS.map(({ label, km }) => {
    const qualifying = runs.filter(a => a.distance_km >= km);
    if (!qualifying.length) {
      return `
        <div class="stat-card pr-card">
          <div class="pr-distance">${label}</div>
          <div class="pr-time">--</div>
          <div class="pr-meta">No qualifying run yet</div>
        </div>`;
    }
    const best    = qualifying.reduce((b, a) => a.avg_speed > b.avg_speed ? a : b);
    const estTime = (km * 1000) / best.avg_speed;
    return `
      <div class="stat-card pr-card">
        <div class="pr-distance">${label}</div>
        <div class="pr-time">${formatDuration(estTime)}</div>
        <div class="pr-meta">${formatPace(best.avg_speed)} · ${new Date(best.start_time).toLocaleDateString()}</div>
      </div>`;
  }).join("");

  const longestRun = runs.length ? runs.reduce((b, a) => a.distance_km > b.distance_km ? a : b) : null;
  const fastestRun = runs.length ? runs.reduce((b, a) => a.avg_speed   > b.avg_speed   ? a : b) : null;

  const overallHtml = `
    <div class="stat-card pr-card">
      <div class="pr-distance">Longest Run</div>
      <div class="pr-time">${longestRun ? longestRun.distance_km.toFixed(2) + " km" : "--"}</div>
      <div class="pr-meta">${longestRun ? formatPace(longestRun.avg_speed) + " · " + new Date(longestRun.start_time).toLocaleDateString() : ""}</div>
    </div>
    <div class="stat-card pr-card">
      <div class="pr-distance">Fastest Pace</div>
      <div class="pr-time">${fastestRun ? formatPace(fastestRun.avg_speed) : "--"}</div>
      <div class="pr-meta">${fastestRun ? fastestRun.distance_km.toFixed(2) + " km · " + new Date(fastestRun.start_time).toLocaleDateString() : ""}</div>
    </div>
  `;

  document.getElementById("pr-cards")!.innerHTML = effortHtml + overallHtml;
}

// ── Weekly Distance Chart ────────────────────────────────────

function renderWeeklyChart(activities: Activity[]) {
  const now = new Date();
  const weekKeys: string[] = [];

  for (let i = 15; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const key = getMondayKey(d);
    if (!weekKeys.includes(key)) weekKeys.push(key);
  }

  const weekDist = new Map<string, number>();
  weekKeys.forEach(k => weekDist.set(k, 0));
  activities.forEach(a => {
    const key = getMondayKey(new Date(a.start_time));
    if (weekDist.has(key)) weekDist.set(key, weekDist.get(key)! + a.distance_km);
  });

  new Chart(document.getElementById("weekly-chart") as HTMLCanvasElement, {
    type: "bar",
    data: {
      labels: weekKeys.map(getMondayLabel),
      datasets: [{
        label: "Distance (km)",
        data: weekKeys.map(k => parseFloat(weekDist.get(k)!.toFixed(2))),
        backgroundColor: CHART_COLORS.purple,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<"bar">) =>
              `${(ctx.parsed.y ?? 0).toFixed(1)} km`,
          },
        },
      },
      scales: {
        x: { ticks: { color: CHART_COLORS.text }, grid: { color: CHART_COLORS.grid } },
        y: {
          beginAtZero: true,
          ticks: { color: CHART_COLORS.text },
          grid: { color: CHART_COLORS.grid },
          title: { display: true, text: "km", color: CHART_COLORS.text },
        },
      },
    },
  });
}

// ── Pace Over Time Chart ─────────────────────────────────────

function renderPaceChart(activities: Activity[]) {
  const runs = activities
    .filter(a => a.type.toLowerCase() === "running" && a.avg_speed > 0)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  new Chart(document.getElementById("pace-chart") as HTMLCanvasElement, {
    type: "line",
    data: {
      labels: runs.map(a => new Date(a.start_time).toLocaleDateString()),
      datasets: [{
        label: "Pace",
        data: runs.map(a => parseFloat(speedToPaceMin(a.avg_speed).toFixed(3))),
        borderColor: CHART_COLORS.purple,
        backgroundColor: "rgba(100,108,255,0.1)",
        tension: 0.3,
        pointRadius: 4,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<"line">) => {
              const totalSec = (ctx.parsed.y ?? 0) * 60;
              const m = Math.floor(totalSec / 60);
              const s = Math.floor(totalSec % 60);
              return `${m}:${s.toString().padStart(2, "0")} /km`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: CHART_COLORS.text, maxTicksLimit: 8 }, grid: { color: CHART_COLORS.grid } },
        y: {
          reverse: true,
          ticks: {
            color: CHART_COLORS.text,
            callback: (val: string | number) => {
              const sec = (val as number) * 60;
              const m = Math.floor(sec / 60);
              const s = Math.floor(sec % 60);
              return `${m}:${s.toString().padStart(2, "0")}`;
            },
          },
          grid: { color: CHART_COLORS.grid },
          title: { display: true, text: "min/km", color: CHART_COLORS.text },
        },
      },
    },
  });
}

// ── HR Trend Chart ───────────────────────────────────────────

function renderHRChart(activities: Activity[]) {
  const runs = activities
    .filter(a => a.type.toLowerCase() === "running" && a.avg_hr > 0)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  new Chart(document.getElementById("hr-chart") as HTMLCanvasElement, {
    type: "line",
    data: {
      labels: runs.map(a => new Date(a.start_time).toLocaleDateString()),
      datasets: [{
        label: "Avg HR",
        data: runs.map(a => a.avg_hr),
        borderColor: CHART_COLORS.red,
        backgroundColor: "rgba(255,107,107,0.1)",
        tension: 0.3,
        pointRadius: 4,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<"line">) =>
              `${ctx.parsed.y ?? 0} bpm`,
          },
        },
      },
      scales: {
        x: { ticks: { color: CHART_COLORS.text, maxTicksLimit: 8 }, grid: { color: CHART_COLORS.grid } },
        y: {
          ticks: { color: CHART_COLORS.text },
          grid: { color: CHART_COLORS.grid },
          title: { display: true, text: "bpm", color: CHART_COLORS.text },
        },
      },
    },
  });
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  try {
    const res = await fetch("/api/activities");
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const activities: Activity[] = await res.json();

    renderYTD(activities);
    renderMonthly(activities);
    renderPRCards(activities);
    renderWeeklyChart(activities);
    renderPaceChart(activities);
    renderHRChart(activities);
  } catch (err) {
    const el = document.getElementById("status-container");
    if (el) el.innerHTML = `<p class="error">${err instanceof Error ? err.message : "Unknown error"}</p>`;
  }
}

main();