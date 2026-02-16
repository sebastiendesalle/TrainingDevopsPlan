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

const statusContainer = document.getElementById("status-container")!;
const tableBody = document.getElementById("activities-tbody")!;

function renderActivities(activities: Activity[]) {
  tableBody.innerHTML = "";
  activities.forEach((activity) => {
    const row = document.createElement("tr");

    // Calculate Pace
    const pace = formatPace(activity.avg_speed);
    const duration = formatDuration(activity.duration_sec);
    const hr = activity.avg_hr ? `${activity.avg_hr} bpm` : "--";

    row.innerHTML = `
      <td>${new Date(activity.start_time).toLocaleDateString()}</td>
      <td>${activity.type}</td>
      <td>${activity.distance_km} km</td>
      <td>${duration}</td>
      <td>${pace}</td>
      <td>${hr}</td>
    `;
    tableBody.appendChild(row);
  });
}

function renderStatus(message: string, isError: boolean = false) {
  statusContainer.innerHTML = `<p class="${
    isError ? "error" : "loading"
  }">${message}</p>`;
  if (!isError) tableBody.innerHTML = "";
}

async function main() {
  try {
    renderStatus("Loading activities...");
    const response = await fetch("/api/activities");
    if (!response.ok)
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    const data: Activity[] = await response.json();

    renderStatus("");
    renderActivities(data);
  } catch (err) {
    console.error("Error fetching activities:", err);
    if (err instanceof Error) renderStatus(err.message, true);
    else renderStatus("An unknown error occurred.", true);
  }
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

main();
