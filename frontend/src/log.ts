import "./style.css";

interface Activity {
  id: number;
  type: string;
  start_time: string;
  distance_km: number;
}

const statusContainer = document.getElementById("status-container")!;
const tableBody = document.getElementById("activities-tbody")!;

function renderActivities(activities: Activity[]) {
  tableBody.innerHTML = "";
  activities.forEach((activity) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${new Date(activity.start_time).toLocaleDateString()}</td>
      <td>${activity.type}</td>
      <td>${activity.distance_km}</td>
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

main();
