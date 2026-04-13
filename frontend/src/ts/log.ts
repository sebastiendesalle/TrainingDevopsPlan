import "../css/style.css";
import "../css/log.css";


interface Activity {
  id: number;
  type: string;
  start_time: string;
  distance_km: number;
  duration_sec: number;
  avg_hr: number;
  avg_speed: number;
}

const KNOWN_FILTERS = ["running", "lap_swimming", "paddelball", "cycling", "multi_sport", "hiking"];
const PACE_TYPES = ["running", "cycling", "hiking", "lap_swimming"];

const statusContainer = document.getElementById("status-container")!;
const tableBody = document.getElementById("activities-tbody")!;

let allActivities: Activity[] = [];
let activeFilter = "all";
let sortColumn: string = "date";
let sortDirection: "asc" | "desc" = "desc";

interface PRs {
  longestDistance: Map<string, number>;
  fastestPace: Map<string, number>;
  longestDuration: Map<string, number>;
}

function computePRs(activities: Activity[]): PRs {
  const distanceMax = new Map<string, { id: number; val: number }>();
  const speedMax = new Map<string, { id: number; val: number }>();
  const durationMax = new Map<string, { id: number; val: number }>();

  activities.forEach((a) => {
    const type = a.type.toLowerCase();

    if (a.distance_km > 0) {
      const current = distanceMax.get(type);
      if (!current || a.distance_km > current.val) {
        distanceMax.set(type, { id: a.id, val: a.distance_km });
      }
    }

    if (a.avg_speed > 0 && PACE_TYPES.includes(type)) {
      const current = speedMax.get(type);
      if (!current || a.avg_speed > current.val) {
        speedMax.set(type, { id: a.id, val: a.avg_speed });
      }
    }

    if (a.duration_sec > 0) {
      const current = durationMax.get(type);
      if (!current || a.duration_sec > current.val) {
        durationMax.set(type, { id: a.id, val: a.duration_sec });
      }
    }
  });

  const toIdMap = (map: Map<string, { id: number; val: number }>) =>
    new Map([...map.entries()].map(([k, v]) => [k, v.id]));

  return {
    longestDistance: toIdMap(distanceMax),
    fastestPace: toIdMap(speedMax),
    longestDuration: toIdMap(durationMax),
  };
}

let prs: PRs = {
  longestDistance: new Map(),
  fastestPace: new Map(),
  longestDuration: new Map(),
};

function prBadge(title: string): string {
  return `<span class="pr-badge" title="${title}">PR</span>`;
}

function getFilteredActivities(): Activity[] {
  let filtered: Activity[];
  if (activeFilter === "all") {
    filtered = [...allActivities];
  } else if (activeFilter === "other") {
    filtered = allActivities.filter((a) => !KNOWN_FILTERS.includes(a.type.toLowerCase()));
  } else {
    filtered = allActivities.filter((a) => a.type.toLowerCase() === activeFilter);
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
          ? a.type.localeCompare(b.type)
          : b.type.localeCompare(a.type);
      case "distance":
        valA = a.distance_km;
        valB = b.distance_km;
        break;
      case "duration":
        valA = a.duration_sec;
        valB = b.duration_sec;
        break;
      case "pace":
        // Lower pace (faster) = higher speed; sort "fastest first" when asc
        valA = a.avg_speed || 0;
        valB = b.avg_speed || 0;
        // Flip: higher speed = faster pace, so invert direction
        return sortDirection === "asc"
          ? valB - valA
          : valA - valB;
      case "hr":
        valA = a.avg_hr || 0;
        valB = b.avg_hr || 0;
        break;
      default:
        return 0;
    }

    return sortDirection === "asc" ? valA - valB : valB - valA;
  });
}

function renderActivities(activities: Activity[]) {
  tableBody.innerHTML = "";
  activities.forEach((activity) => {
    const row = document.createElement("tr");
    const type = activity.type.toLowerCase();

    const pace = formatPace(activity.avg_speed);
    const duration = formatDuration(activity.duration_sec);
    const hr = activity.avg_hr ? `${activity.avg_hr} bpm` : "--";

    const isDistancePR = prs.longestDistance.get(type) === activity.id;
    const isPacePR = prs.fastestPace.get(type) === activity.id;
    const isDurationPR = prs.longestDuration.get(type) === activity.id;

    const distanceCell = `${activity.distance_km} km${isDistancePR ? " " + prBadge("Longest distance for " + activity.type) : ""}`;
    const paceCell = `${pace}${isPacePR ? " " + prBadge("Fastest pace for " + activity.type) : ""}`;
    const durationCell = `${duration}${isDurationPR ? " " + prBadge("Longest duration for " + activity.type) : ""}`;

    row.innerHTML = `
      <td>${new Date(activity.start_time).toLocaleDateString()}</td>
      <td>${activity.type}</td>
      <td>${distanceCell}</td>
      <td>${durationCell}</td>
      <td>${paceCell}</td>
      <td>${hr}</td>
    `;
    tableBody.appendChild(row);
  });
}

function updateSortIndicators() {
  const headers = document.querySelectorAll<HTMLTableCellElement>("th[data-sort]");
  headers.forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sort === sortColumn) {
      th.classList.add(sortDirection === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}

function setupSorting() {
  const headers = document.querySelectorAll<HTMLTableCellElement>("th[data-sort]");
  headers.forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.dataset.sort!;
      if (sortColumn === col) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
      } else {
        sortColumn = col;
        // Sensible defaults per column
        sortDirection = col === "date" ? "desc" : "asc";
      }
      updateSortIndicators();
      renderActivities(getFilteredActivities());
    });
  });
}

function renderStatus(message: string, isError: boolean = false) {
  statusContainer.innerHTML = `<p class="${
    isError ? "error" : "loading"
  }">${message}</p>`;
  if (!isError) tableBody.innerHTML = "";
}

function setupFilters() {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".filter-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter!;
      renderActivities(getFilteredActivities());
    });
  });
}

function formatDuration(seconds: number): string {
  if (!seconds) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatPace(speedMps: number): string {
  if (!speedMps || speedMps === 0) return "--";
  const paceSeconds = 1000 / speedMps; // seconds per km
  const m = Math.floor(paceSeconds / 60);
  const s = Math.floor(paceSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')} /km`;
}

async function main() {
  try {
    renderStatus("Loading activities...");
    const response = await fetch("/api/activities");
    if (!response.ok)
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    allActivities = await response.json();
    prs = computePRs(allActivities);

    renderStatus("");
    setupFilters();
    setupSorting();
    updateSortIndicators();
    renderActivities(getFilteredActivities());
  } catch (err) {
    console.error("Error fetching activities:", err);
    if (err instanceof Error) renderStatus(err.message, true);
    else renderStatus("An unknown error occurred.", true);
  }
}

main();
