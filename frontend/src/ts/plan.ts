import ".style.css";
import "../css/plan.css";

interface PlanItem {
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

const statusContainer = document.getElementById("plan-status-container")!;
const tableBody = document.getElementById("plan-tbody")!;

function renderPlan(planItems: PlanItem[]) {
  tableBody.innerHTML = "";

  planItems.forEach((item) => {
    const row = document.createElement("tr");

    const createCell = (text: string) => {
      const cell = document.createElement("td");
      cell.textContent = text;
      return cell;
    };
    row.appendChild(createCell(item["Week Start"]));
    row.appendChild(createCell(item.Phase));
    row.appendChild(createCell(item["Week Type"]));
    row.appendChild(createCell(item.Mon));
    row.appendChild(createCell(item.Tue));
    row.appendChild(createCell(item.Wed));
    row.appendChild(createCell(item.Thu));
    row.appendChild(createCell(item.Fri));
    row.appendChild(createCell(item.Sat));
    row.appendChild(createCell(item.Sun));
    row.appendChild(createCell(String(item["Total Run km"])));

    tableBody.appendChild(row);
  });
}

function renderStatus(message: string, isError: boolean = false) {
  if (!message) {
    statusContainer.innerHTML = "";
    return;
  }
  statusContainer.innerHTML = `<p class="${
    isError ? "error" : "loading"
  }">${message}</p>`;
  if (!isError) {
    tableBody.innerHTML = "";
  }
}

async function main() {
  try {
    renderStatus("Loading plan...");

    const response = await fetch("/api/plan");
    if (!response.ok)
      throw new Error(`Error: ${response.status} ${response.statusText}`);

    const data: PlanItem[] = await response.json();

    renderStatus("");
    renderPlan(data);
  } catch (err) {
    console.error("Error fetching plan:", err);
    if (err instanceof Error) renderStatus(err.message, true);
    else renderStatus("An unknown error occurred.", true);
  }
}

main();
