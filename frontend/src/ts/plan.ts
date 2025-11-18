// --- Imports ---
// Keep your CSS imports so your bundler processes them
import "../css/style.css";
import "../css/plan.css";

// Import the JSON file directly.
// Note: Ensure "resolveJsonModule": true is set in your tsconfig.json
import planData from "../../../services/api-ts/src/plan.json";

// --- Type Definitions ---

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

// Type definition for the raw JSON structure
interface RawJson {
  MainPlan: (TrainingWeek | null | { [key: string]: string })[];
}

// Cast the imported data to our interface
const rawJson = planData as RawJson;

// --- State Management ---

// This maps specific phases to their HTML elements in the new layout
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

// --- Helper Functions ---

/**
 * Fetches and cleans the training plan data from the imported JSON.
 */
function fetchPlanData(): Promise<TrainingWeek[]> {
  return new Promise((resolve) => {
    // Simulating a tiny delay for UI feel (optional)
    setTimeout(() => {
      const allData = rawJson.MainPlan;

      // Filter out nulls and header rows
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

/**
 * Checks if a given week's start date is in the current week.
 */
function isCurrentWeek(weekStartDateString: string): boolean {
  try {
    // --- SETTING CURRENT DATE ---
    // HARDCODED for demo purposes: Monday, November 17, 2025
    // CHANGE THIS to `const today = new Date();` for production use.
    const today = new Date("2025-11-17T09:00:00");

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

/**
 * Creates a table row (TR) element for a given week.
 */
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

/**
 * Renders the rows for a specific phase based on the expand/collapse state.
 */
function renderPhase(
  phaseInfo: PhaseState,
  state: "expand" | "collapse"
): void {
  const { allRows, currentRowIndex, button } = phaseInfo;

  if (state === "expand") {
    // Show all rows
    allRows.forEach((row) => row.classList.remove("hidden"));
    button.textContent = "Collapse";
  } else {
    // Collapse state: Show 5 rows (2 before current, current, 2 after)
    button.textContent = "Expand";
    let startIndex = 0;
    let endIndex = 4; // Default to first 5 weeks

    if (currentRowIndex !== -1) {
      // Logic to center the view around the current week
      startIndex = Math.max(0, currentRowIndex - 2);
      endIndex = Math.min(allRows.length - 1, currentRowIndex + 2);

      // Adjust window if near the end
      while (endIndex - startIndex < 4 && endIndex < allRows.length - 1) {
        endIndex++;
      }
      // Adjust window if near the start
      while (endIndex - startIndex < 4 && startIndex > 0) {
        startIndex--;
      }
    }

    // Apply hidden class to rows outside the window
    allRows.forEach((row, index) => {
      if (index >= startIndex && index <= endIndex) {
        row.classList.remove("hidden");
      } else {
        row.classList.add("hidden");
      }
    });
  }
}

// --- Main Logic ---

async function loadPlan(): Promise<void> {
  const statusContainer = document.getElementById("plan-status-container");
  const statusText = statusContainer?.querySelector(".loading");

  if (!statusContainer || !statusText) return;

  try {
    const planData = await fetchPlanData();

    // 1. Process data and create all TR elements (in memory)
    planData.forEach((week) => {
      const phaseInfo = phaseState[week.Phase];
      if (phaseInfo) {
        const row = createWeekRow(week);

        if (row.classList.contains("current-week-highlight")) {
          phaseInfo.currentRowIndex = phaseInfo.allRows.length;
        }

        phaseInfo.allRows.push(row);
        // Append to DOM immediately, visibility is controlled via CSS classes later
        phaseInfo.tbody.appendChild(row);
      } else {
        // Handle unknown phases or phases not in our state map
        console.warn("Unknown phase:", week.Phase);
      }
    });

    statusContainer.classList.add("hidden");

    // 2. Render each phase and attach Event Listeners
    Object.values(phaseState).forEach((phaseInfo) => {
      if (phaseInfo.allRows.length > 0) {
        phaseInfo.section.classList.remove("hidden");

        // Initial Render: Collapsed state
        renderPhase(phaseInfo, "collapse");

        // Button Click Listener
        phaseInfo.button.addEventListener("click", () => {
          const isExpanded = phaseInfo.button.textContent === "Collapse";
          renderPhase(phaseInfo, isExpanded ? "collapse" : "expand");
        });
      }
    });

    // 3. Auto-scroll to the current week
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

// Initialize on load
document.addEventListener("DOMContentLoaded", loadPlan);
