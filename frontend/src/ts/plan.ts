import "../css/style.css";
import "../css/plan.css";
import { planData } from "./planData";

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

interface PhaseState {
  tbody: HTMLElement;
  section: HTMLElement;
  button: HTMLButtonElement;
  allRows: HTMLTableRowElement[];
  currentRowIndex: number;
}

const rawJson = planData as { MainPlan: any[] };

const phaseState: Record<string, PhaseState> = {
  "Phase 1: Antwerp 10 Miler": {
    tbody: document.getElementById("plan-tbody-1") as HTMLElement,
    section: document.getElementById("phase-section-1") as HTMLElement,
    button: document.querySelector('[data-phase-id="1"]') as HTMLButtonElement,
    allRows: [],
    currentRowIndex: -1,
  },
  "Phase 2: Antwerp Marathon": {
    tbody: document.getElementById("plan-tbody-2") as HTMLElement,
    section: document.getElementById("phase-section-2") as HTMLElement,
    button: document.querySelector('[data-phase-id="2"]') as HTMLButtonElement,
    allRows: [],
    currentRowIndex: -1,
  },
  "Phase 3: Tri Base / Bike Intro": {
    tbody: document.getElementById("plan-tbody-3") as HTMLElement,
    section: document.getElementById("phase-section-3") as HTMLElement,
    button: document.querySelector('[data-phase-id="3"]') as HTMLButtonElement,
    allRows: [],
    currentRowIndex: -1,
  },
  "Phase 4: Ironman Build": {
    tbody: document.getElementById("plan-tbody-4") as HTMLElement,
    section: document.getElementById("phase-section-4") as HTMLElement,
    button: document.querySelector('[data-phase-id="4"]') as HTMLButtonElement,
    allRows: [],
    currentRowIndex: -1,
  },
};

function fetchPlanData(): Promise<TrainingWeek[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const allData = rawJson.MainPlan;

      const cleanData = allData.filter(
        (week): week is TrainingWeek =>
          week !== null &&
          typeof week === "object" &&
          week["Week Start"] !== "Week Start"
      );

      resolve(cleanData);
    }, 300);
  });
}

function isCurrentWeek(weekStartDateString: string): boolean {
  try {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const parts = weekStartDateString.split("/");
    if (parts.length !== 3) return false;

    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    const startDate = new Date(year, month - 1, day);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    return today >= startDate && today <= endDate;
  } catch (e) {
    console.error("Error parsing date:", weekStartDateString, e);
    return false;
  }
}

function createWeekRow(week: TrainingWeek): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.className = "week-row";

  if (isCurrentWeek(week["Week Start"])) {
    tr.classList.add("current-week-highlight");
  }

  tr.innerHTML = `
    <td>${week["Week Start"]}</td>
    <td>${week["Week Type"]}</td>
    <td>${week.Mon}</td>
    <td>${week.Tue}</td>
    <td>${week.Wed}</td>
    <td>${week.Thu}</td>
    <td>${week.Fri}</td>
    <td>${week.Sat}</td>
    <td>${week.Sun}</td>
    <td>${week["Total Run km"]}</td>
  `;
  return tr;
}

function renderPhase(
  phaseInfo: PhaseState,
  state: "expand" | "collapse"
): void {
  const { allRows, currentRowIndex, button } = phaseInfo;

  if (state === "expand") {
    allRows.forEach((row) => row.classList.remove("hidden"));
    button.textContent = "Collapse";
  } else {
    button.textContent = "Expand";
    let startIndex = 0;
    let endIndex = 4;

    if (currentRowIndex !== -1) {
      startIndex = Math.max(0, currentRowIndex - 2);
      endIndex = Math.min(allRows.length - 1, currentRowIndex + 2);

      while (endIndex - startIndex < 4 && endIndex < allRows.length - 1) {
        endIndex++;
      }
      while (endIndex - startIndex < 4 && startIndex > 0) {
        startIndex--;
      }
    }

    allRows.forEach((row, index) => {
      if (index >= startIndex && index <= endIndex) {
        row.classList.remove("hidden");
      } else {
        row.classList.add("hidden");
      }
    });
  }
}

async function loadPlan(): Promise<void> {
  const statusContainer = document.getElementById("plan-status-container");
  const statusText = statusContainer?.querySelector(".loading");

  if (!statusContainer || !statusText) return;

  try {
    const planData = await fetchPlanData();

    planData.forEach((week) => {
      const phaseInfo = phaseState[week.Phase];
      if (phaseInfo) {
        const row = createWeekRow(week);

        if (row.classList.contains("current-week-highlight")) {
          phaseInfo.currentRowIndex = phaseInfo.allRows.length;
        }

        phaseInfo.allRows.push(row);
        phaseInfo.tbody.appendChild(row);
      } else {
        console.warn("Unknown phase:", week.Phase);
      }
    });

    statusContainer.classList.add("hidden");

    Object.values(phaseState).forEach((phaseInfo) => {
      if (phaseInfo.allRows.length > 0) {
        phaseInfo.section.classList.remove("hidden");
        renderPhase(phaseInfo, "collapse");

        phaseInfo.button.addEventListener("click", () => {
          const isExpanded = phaseInfo.button.textContent === "Collapse";
          renderPhase(phaseInfo, isExpanded ? "collapse" : "expand");
        });
      }
    });

    const highlightedRow = document.querySelector(".current-week-highlight");
    if (highlightedRow) {
      highlightedRow.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  } catch (error) {
    console.error("Error loading plan:", error);
    statusText.textContent = "Error loading training plan.";
    statusText.className = "error";
  }
}

document.addEventListener("DOMContentLoaded", loadPlan);
