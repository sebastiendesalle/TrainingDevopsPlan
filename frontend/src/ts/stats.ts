import "../css/style.css";
import "../css/stats.css";
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  ArcElement,
  DoughnutController,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
  type TooltipItem,
} from "chart.js";
import {
  type Activity,
  sportConfig,
  normalizeType,
  formatDuration,
  formatPace,
  paceMinPerKm,
  trimp,
  riegelTime,
  fitnessSeries,
  mondayKey,
  mondayOf,
  isoDay,
  addDays,
  shortDate,
  startOfDay,
} from "./activityMetrics";
import { ATHLETE, wattsPerKg, ftpRating } from "./athlete";
import { loadActivities } from "./dataSource";

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  ArcElement,
  DoughnutController,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
);

const C = {
  text: "rgba(255,255,255,0.6)",
  grid: "#3d3d44",
  accent: "#6c8cff",
  good: "#80cf80",
  warn: "#f0c040",
  bad: "#ff6b6b",
};

const BEST_EFFORTS = [
  { label: "5K", km: 5 },
  { label: "10K", km: 10 },
  { label: "Half Marathon", km: 21.0975 },
  { label: "Marathon", km: 42.195 },
];

const isRun = (a: Activity) => normalizeType(a.type) === "running";

function getMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function getMonthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(+y, +m - 1, 1).toLocaleDateString("en-BE", {
    month: "short",
    year: "numeric",
  });
}

// ── YTD ──────────────────────────────────────────────────────

function renderYTD(activities: Activity[]) {
  const year = new Date().getFullYear();
  const ytd = activities.filter(
    (a) => new Date(a.start_time).getFullYear() === year
  );
  const runs = ytd.filter(isRun);
  const totalDist = ytd.reduce((s, a) => s + a.distance_km, 0);
  const totalTime = ytd.reduce((s, a) => s + a.duration_sec, 0);
  const runDist = runs.reduce((s, a) => s + a.distance_km, 0);
  const load = ytd.reduce((s, a) => s + trimp(a), 0);

  document.getElementById("ytd-cards")!.innerHTML = card([
    ["Activities", String(ytd.length), "accent"],
    ["Total Distance", `${totalDist.toFixed(0)} km`, "good"],
    ["Total Time", formatDuration(totalTime), "accent"],
    ["Running Distance", `${runDist.toFixed(0)} km`, "good"],
    ["Total Load", String(Math.round(load)), "warn"],
  ]);
}

function card(rows: [string, string, string][]): string {
  return rows
    .map(
      ([k, v, accent]) => `
      <div class="stat-card accent-${accent}">
        <div class="stat-label">${k}</div>
        <div class="stat-value">${v}</div>
      </div>`
    )
    .join("");
}

// ── Consistency ──────────────────────────────────────────────

function renderConsistency(activities: Activity[]) {
  const today = startOfDay(new Date());
  const days = new Set(activities.map((a) => isoDay(new Date(a.start_time))));

  let active28 = 0;
  for (let i = 0; i < 28; i++) {
    if (days.has(isoDay(addDays(today, -i)))) active28++;
  }

  // Consecutive weeks (ending this week) with at least one activity.
  const weeks = new Set(activities.map((a) => mondayKey(new Date(a.start_time))));
  let streak = 0;
  let cursor = mondayOf(today);
  while (weeks.has(isoDay(cursor))) {
    streak++;
    cursor = addDays(cursor, -7);
  }

  // Avg activities / week over last 8 weeks.
  const eightWeeksAgo = addDays(today, -56);
  const recent = activities.filter(
    (a) => new Date(a.start_time) >= eightWeeksAgo
  );
  const perWeek = (recent.length / 8).toFixed(1);

  const longestSession = activities.reduce(
    (m, a) => Math.max(m, a.duration_sec),
    0
  );

  document.getElementById("consistency-cards")!.innerHTML = card([
    ["Active days / 28", `${active28}`, "good"],
    ["Week streak", `${streak}`, "accent"],
    ["Activities / week", perWeek, "accent"],
    ["Longest session", formatDuration(longestSession), "warn"],
  ]);
}

// ── Monthly ──────────────────────────────────────────────────

function renderMonthly(activities: Activity[]) {
  const monthMap = new Map<string, Activity[]>();
  activities.forEach((a) => {
    const key = getMonthKey(new Date(a.start_time));
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key)!.push(a);
  });

  const months = [...monthMap.keys()].sort().reverse().slice(0, 6).reverse();

  document.getElementById("monthly-cards")!.innerHTML = months
    .map((key) => {
      const acts = monthMap.get(key)!;
      const runs = acts.filter(isRun);
      const totalDist = acts.reduce((s, a) => s + a.distance_km, 0);
      const runDist = runs.reduce((s, a) => s + a.distance_km, 0);
      const totalTime = acts.reduce((s, a) => s + a.duration_sec, 0);
      const validRuns = runs.filter((a) => a.avg_speed > 0);
      const avgPaceSec = validRuns.length
        ? validRuns.reduce((s, a) => s + 1000 / a.avg_speed, 0) / validRuns.length
        : 0;
      const avgPaceStr = avgPaceSec
        ? `${Math.floor(avgPaceSec / 60)}:${Math.floor(avgPaceSec % 60)
            .toString()
            .padStart(2, "0")} /km`
        : "--";

      return `
        <div class="stat-card month-card">
          <div class="month-label">${getMonthLabel(key)}</div>
          <div class="month-row"><span>Activities</span><span>${acts.length}</span></div>
          <div class="month-row"><span>Total Distance</span><span>${totalDist.toFixed(
            1
          )} km</span></div>
          <div class="month-row"><span>Running Distance</span><span>${runDist.toFixed(
            1
          )} km</span></div>
          <div class="month-row"><span>Total Time</span><span>${formatDuration(
            totalTime
          )}</span></div>
          <div class="month-row"><span>Avg Run Pace</span><span>${avgPaceStr}</span></div>
        </div>`;
    })
    .join("");
}

// ── Race predictions ─────────────────────────────────────────

// Actual bests: the fastest real run you have logged near each distance.
function renderPRCards(activities: Activity[]) {
  const runs = activities.filter((a) => isRun(a) && a.avg_speed > 0);
  const el = document.getElementById("pr-cards")!;

  if (!runs.length) {
    el.innerHTML = `<div class="stat-card pr-card"><div class="pr-distance">--</div><div class="pr-time">No runs yet</div></div>`;
    return;
  }

  const dateOf = (a: Activity) =>
    new Date(a.start_time).toLocaleDateString("en-BE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const effortCards = BEST_EFFORTS.map(({ label, km }) => {
    // The card shows the run's real elapsed time, so the run has to actually
    // be that distance — a 12 km run is not a 10K result.
    const window = runs.filter(
      (a) => a.distance_km >= km * 0.98 && a.distance_km <= km * 1.08
    );
    if (!window.length) {
      return `
        <div class="stat-card pr-card">
          <div class="pr-distance">${label}</div>
          <div class="pr-time">--</div>
          <div class="pr-meta">no run at this distance yet</div>
        </div>`;
    }
    const best = window.reduce((b, a) => (a.avg_speed > b.avg_speed ? a : b));
    return `
      <div class="stat-card pr-card">
        <div class="pr-distance">${label}</div>
        <div class="pr-time">${formatDuration(best.duration_sec)}</div>
        <div class="pr-meta">${best.distance_km.toFixed(2)} km · ${formatPace(
      best.avg_speed
    )} · ${dateOf(best)}</div>
      </div>`;
  }).join("");

  const longestRun = runs.reduce((b, a) => (a.distance_km > b.distance_km ? a : b));
  const fastestRun = runs.reduce((b, a) => (a.avg_speed > b.avg_speed ? a : b));
  const longestTime = activities.reduce(
    (b, a) => (a.duration_sec > b.duration_sec ? a : b),
    activities[0]
  );

  el.innerHTML =
    effortCards +
    `
    <div class="stat-card pr-card">
      <div class="pr-distance">Longest Run</div>
      <div class="pr-time">${longestRun.distance_km.toFixed(1)} km</div>
      <div class="pr-meta">${formatPace(longestRun.avg_speed)} · ${dateOf(longestRun)}</div>
    </div>
    <div class="stat-card pr-card">
      <div class="pr-distance">Fastest Pace</div>
      <div class="pr-time">${formatPace(fastestRun.avg_speed)}</div>
      <div class="pr-meta">${fastestRun.distance_km.toFixed(1)} km · ${dateOf(
      fastestRun
    )}</div>
    </div>
    <div class="stat-card pr-card">
      <div class="pr-distance">Longest Session</div>
      <div class="pr-time">${formatDuration(longestTime.duration_sec)}</div>
      <div class="pr-meta">${sportConfig(longestTime.type).label} · ${dateOf(
      longestTime
    )}</div>
    </div>`;
}

// ── Athlete profile ──────────────────────────────────────────

function renderAthlete() {
  const wkg = wattsPerKg();
  const rating = ftpRating(wkg);

  document.getElementById("athlete-cards")!.innerHTML = `
    <div class="stat-card accent-warn">
      <div class="stat-label">Cycling FTP</div>
      <div class="stat-value">${ATHLETE.ftpWatts} W</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Power to weight</div>
      <div class="stat-value" style="color:${rating.color}">${wkg.toFixed(2)} W/kg</div>
      <div class="pr-meta">${rating.label}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Weight</div>
      <div class="stat-value">${ATHLETE.weightKg} kg</div>
    </div>
    <div class="stat-card accent-bad">
      <div class="stat-label">Max / rest HR</div>
      <div class="stat-value">${ATHLETE.maxHr} / ${ATHLETE.restHr}</div>
      <div class="pr-meta">drives effort &amp; zones</div>
    </div>`;
}

// ── Race projections (secondary) ─────────────────────────────

function renderPredictionCards(activities: Activity[]) {
  const runs = activities.filter((a) => isRun(a) && a.avg_speed > 0);

  const anchor = runs
    .filter((a) => a.distance_km >= 3)
    .reduce<Activity | null>(
      (best, a) => (!best || a.avg_speed > best.avg_speed ? a : best),
      null
    );

  const el = document.getElementById("prediction-cards")!;
  if (!anchor) {
    el.innerHTML = `<div class="stat-card pr-card"><div class="pr-distance">--</div><div class="pr-time">No qualifying run yet</div></div>`;
    return;
  }
  const anchorTime = (anchor.distance_km * 1000) / anchor.avg_speed;

  el.innerHTML = BEST_EFFORTS.map(({ label, km }) => {
    const predicted = riegelTime(anchor.distance_km, anchorTime, km);
    return `
      <div class="stat-card pr-card">
        <div class="pr-distance">${label}</div>
        <div class="pr-time">${formatDuration(predicted)}</div>
        <div class="pr-meta">${formatPace((km * 1000) / predicted)}</div>
      </div>`;
  }).join("");
}

// ── Fitness & freshness ──────────────────────────────────────

function renderFitnessChart(activities: Activity[]) {
  const series = fitnessSeries(activities).slice(-160);
  const note = document.getElementById("fitness-note");
  if (series.length < 14) {
    if (note) note.textContent = "Not enough history yet to model fitness.";
    return;
  }

  const last = series[series.length - 1];
  if (note) {
    const form = last.tsb;
    const verdict =
      form > 5 ? "fresh" : form < -15 ? "fatigued" : "balanced";
    note.textContent = `Fitness ${last.ctl.toFixed(0)} · Fatigue ${last.atl.toFixed(
      0
    )} · Form ${form >= 0 ? "+" : ""}${form.toFixed(0)} (${verdict}).`;
  }

  new Chart(document.getElementById("fitness-chart") as HTMLCanvasElement, {
    type: "line",
    data: {
      labels: series.map((p) => shortDate(new Date(p.date + "T00:00:00"))),
      datasets: [
        {
          label: "Fitness",
          data: series.map((p) => +p.ctl.toFixed(1)),
          borderColor: C.accent,
          backgroundColor: "rgba(108,140,255,0.12)",
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
        },
        {
          label: "Fatigue",
          data: series.map((p) => +p.atl.toFixed(1)),
          borderColor: C.bad,
          borderWidth: 1.5,
          pointRadius: 0,
          borderDash: [4, 3],
          fill: false,
          tension: 0.3,
        },
        {
          label: "Form",
          data: series.map((p) => +p.tsb.toFixed(1)),
          borderColor: C.good,
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: C.text, maxTicksLimit: 8 }, grid: { color: C.grid } },
        y: { ticks: { color: C.text }, grid: { color: C.grid } },
      },
    },
  });
}

// ── Weekly training load ─────────────────────────────────────

function lastNWeekKeys(n: number): string[] {
  const keys: string[] = [];
  const monday = mondayOf(new Date());
  for (let i = n - 1; i >= 0; i--) keys.push(isoDay(addDays(monday, -i * 7)));
  return keys;
}

function renderLoadChart(activities: Activity[]) {
  const keys = lastNWeekKeys(16);
  const load = new Map(keys.map((k) => [k, 0]));
  activities.forEach((a) => {
    const k = mondayKey(new Date(a.start_time));
    if (load.has(k)) load.set(k, load.get(k)! + trimp(a));
  });
  const values = keys.map((k) => Math.round(load.get(k)!));
  const avg = values.reduce((s, v) => s + v, 0) / values.length;

  new Chart(document.getElementById("load-chart") as HTMLCanvasElement, {
    type: "bar",
    data: {
      labels: keys.map((k) => shortDate(new Date(k + "T00:00:00"))),
      datasets: [
        {
          label: "Weekly load",
          data: values,
          backgroundColor: values.map((v) =>
            v > avg * 1.35 ? C.warn : C.accent
          ),
          borderRadius: 4,
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
            label: (ctx: TooltipItem<"bar">) => `${ctx.parsed.y ?? 0} load`,
          },
        },
      },
      scales: {
        x: { ticks: { color: C.text, maxTicksLimit: 8 }, grid: { color: C.grid } },
        y: { beginAtZero: true, ticks: { color: C.text }, grid: { color: C.grid } },
      },
    },
  });
}

// ── Sport breakdown ──────────────────────────────────────────

function renderSportChart(activities: Activity[]) {
  const bySport = new Map<string, number>();
  activities.forEach((a) => {
    if (a.distance_km <= 0) return;
    const key = normalizeType(a.type);
    bySport.set(key, (bySport.get(key) ?? 0) + a.distance_km);
  });

  const entries = [...bySport.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  new Chart(document.getElementById("sport-chart") as HTMLCanvasElement, {
    type: "doughnut",
    data: {
      labels: entries.map(([k]) => sportConfig(k).label),
      datasets: [
        {
          data: entries.map(([, v]) => +v.toFixed(1)),
          backgroundColor: entries.map(([k]) => sportConfig(k).color),
          borderColor: "#1f1f22",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "right",
          labels: { color: C.text, boxWidth: 12, padding: 10 },
        },
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<"doughnut">) =>
              `${ctx.label}: ${ctx.parsed.toFixed(0)} km`,
          },
        },
      },
    },
  });
}

// ── Weekly running distance ──────────────────────────────────

function renderWeeklyChart(activities: Activity[]) {
  const keys = lastNWeekKeys(16);
  const dist = new Map(keys.map((k) => [k, 0]));
  activities.filter(isRun).forEach((a) => {
    const k = mondayKey(new Date(a.start_time));
    if (dist.has(k)) dist.set(k, dist.get(k)! + a.distance_km);
  });

  new Chart(document.getElementById("weekly-chart") as HTMLCanvasElement, {
    type: "bar",
    data: {
      labels: keys.map((k) => shortDate(new Date(k + "T00:00:00"))),
      datasets: [
        {
          label: "Distance (km)",
          data: keys.map((k) => +dist.get(k)!.toFixed(1)),
          backgroundColor: C.accent,
          borderRadius: 4,
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
            label: (ctx: TooltipItem<"bar">) =>
              `${(ctx.parsed.y ?? 0).toFixed(1)} km`,
          },
        },
      },
      scales: {
        x: { ticks: { color: C.text, maxTicksLimit: 8 }, grid: { color: C.grid } },
        y: {
          beginAtZero: true,
          ticks: { color: C.text },
          grid: { color: C.grid },
          title: { display: true, text: "km", color: C.text },
        },
      },
    },
  });
}

// ── Pace over time ───────────────────────────────────────────

function renderPaceChart(activities: Activity[]) {
  const runs = activities
    .filter((a) => isRun(a) && a.avg_speed > 0)
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

  new Chart(document.getElementById("pace-chart") as HTMLCanvasElement, {
    type: "line",
    data: {
      labels: runs.map((a) => new Date(a.start_time).toLocaleDateString("en-BE")),
      datasets: [
        {
          label: "Pace",
          data: runs.map((a) => +paceMinPerKm(a.avg_speed).toFixed(3)),
          borderColor: C.accent,
          backgroundColor: "rgba(108,140,255,0.1)",
          tension: 0.3,
          pointRadius: 2,
          fill: true,
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
              const total = (ctx.parsed.y ?? 0) * 60;
              return `${Math.floor(total / 60)}:${Math.floor(total % 60)
                .toString()
                .padStart(2, "0")} /km`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: C.text, maxTicksLimit: 8 }, grid: { color: C.grid } },
        y: {
          reverse: true,
          ticks: {
            color: C.text,
            callback: (val: string | number) => {
              const sec = (val as number) * 60;
              return `${Math.floor(sec / 60)}:${Math.floor(sec % 60)
                .toString()
                .padStart(2, "0")}`;
            },
          },
          grid: { color: C.grid },
          title: { display: true, text: "min/km", color: C.text },
        },
      },
    },
  });
}

// ── HR trend ─────────────────────────────────────────────────

function renderHRChart(activities: Activity[]) {
  const runs = activities
    .filter((a) => isRun(a) && a.avg_hr > 0)
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

  new Chart(document.getElementById("hr-chart") as HTMLCanvasElement, {
    type: "line",
    data: {
      labels: runs.map((a) => new Date(a.start_time).toLocaleDateString("en-BE")),
      datasets: [
        {
          label: "Avg HR",
          data: runs.map((a) => a.avg_hr),
          borderColor: C.bad,
          backgroundColor: "rgba(255,107,107,0.1)",
          tension: 0.3,
          pointRadius: 2,
          fill: true,
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
            label: (ctx: TooltipItem<"line">) => `${ctx.parsed.y ?? 0} bpm`,
          },
        },
      },
      scales: {
        x: { ticks: { color: C.text, maxTicksLimit: 8 }, grid: { color: C.grid } },
        y: {
          ticks: { color: C.text },
          grid: { color: C.grid },
          title: { display: true, text: "bpm", color: C.text },
        },
      },
    },
  });
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  try {
    const activities = await loadActivities();

    renderYTD(activities);
    renderPRCards(activities);
    renderAthlete();
    renderConsistency(activities);
    renderFitnessChart(activities);
    renderLoadChart(activities);
    renderSportChart(activities);
    renderWeeklyChart(activities);
    renderPredictionCards(activities);
    renderPaceChart(activities);
    renderHRChart(activities);
    renderMonthly(activities);
  } catch (err) {
    const el = document.getElementById("status-container");
    if (el)
      el.innerHTML = `<p class="error">${
        err instanceof Error ? err.message : "Unknown error"
      }</p>`;
  }
}

main();
