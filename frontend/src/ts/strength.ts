import "../css/style.css";
import "../css/strength.css";
import "./pageTop";
import { planData } from "./planData";
import { DAY_KEYS, parsePlanDate, type TrainingWeek } from "./planParser";
import { BLOCKS, MOBILITY, RULES, SESSIONS, type Block, type Session, type SessionKey } from "./strengthData";
import {
  blockFor,
  blockStart,
  esc,
  fmtDay,
  isLightDay,
  routineBlock,
  sessionBody,
  sessionKeyIn,
} from "./strengthView";
import { addDays, startOfDay } from "./activityMetrics";

const overviewEl = document.getElementById("strength-overview")!;
const noteEl = document.getElementById("strength-note")!;
const jumpEl = document.getElementById("strength-jump")!;
const sessionsEl = document.getElementById("strength-sessions")!;

const TODAY = startOfDay(new Date());

interface NextSession {
  key: SessionKey;
  date: Date;
  light: boolean;
}

// First Strength Day A/B in the plan from today on.
function nextSession(): NextSession | null {
  for (const row of (planData as { MainPlan: TrainingWeek[] }).MainPlan) {
    const start = parsePlanDate(row["Week Start"]);
    if (!start) continue;
    for (let i = 0; i < DAY_KEYS.length; i++) {
      const date = addDays(start, i);
      if (date < TODAY) continue;
      const text = row[DAY_KEYS[i]] ?? "";
      const key = sessionKeyIn(text);
      if (key) return { key, date, light: isLightDay(row["Week Type"], text) };
    }
  }
  return null;
}

function chip(k: string, v: string, note: string): string {
  return `<div class="stat-chip"><div class="k">${k}</div><div class="v">${esc(
    v
  )}</div><div class="n">${esc(note)}</div></div>`;
}

function sessionSection(s: Session, block: Block): string {
  const tone = s.key === "bands" ? "good" : "warn";
  return `
    <section class="session" id="${s.anchor}">
      <div class="session-head">
        <h2 class="session-title">${esc(s.name)} — ${esc(s.title)}<span class="week-badge tone-${tone}">${esc(
    s.day
  )}</span></h2>
        <p class="session-sub">${esc(s.focus)} · ~${s.minutes} min</p>
      </div>
      ${sessionBody(s, block, false, true)}
    </section>`;
}

function progressionSection(current: Block): string {
  const rows = BLOCKS.map(
    (b) => `
      <tr${b === current ? ' class="is-current"' : ""}>
        <td>${esc(b.label)}</td>
        <td>${fmtDay(blockStart(b))}</td>
        <td>${esc(b.lifts)}</td>
        <td>${esc(b.jumps)}</td>
        <td>${esc(b.nordics)}</td>
      </tr>`
  ).join("");

  return `
    <section class="session" id="progression">
      <div class="session-head">
        <h2 class="session-title">Progression &amp; rules</h2>
        <p class="session-sub">How the sets build through the block. Light weeks drop to 2 sets.</p>
      </div>
      <div class="progress-scroll">
        <table class="progress-table">
          <thead><tr><th>Block</th><th>Starts</th><th>Main lifts</th><th>Jumps</th><th>Nordics</th></tr></thead>
          <tbody>${rows}
            <tr>
              <td>Light days</td>
              <td>Easy weeks</td>
              <td>2 sets at about 70%</td>
              <td>Box jumps at most</td>
              <td>Skip</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ol class="rules-list">${RULES.map((r) => `<li>${esc(r)}</li>`).join("")}</ol>
    </section>`;
}

function render() {
  const next = nextSession();
  const block = blockFor(next?.date ?? TODAY);

  overviewEl.innerHTML = [
    next
      ? chip(
          "Next session",
          SESSIONS[next.key].name,
          `${next.date.toLocaleDateString("en-BE", { weekday: "short" })} ${fmtDay(next.date)}${
            next.light ? " · light" : ""
          }`
        )
      : chip("Next session", "--", "none left in the plan"),
    chip("Block", block.label, block.summary),
    chip("Each week", "Tue · Thu", "+ Sunday bands, optional"),
  ].join("");

  noteEl.textContent = `Sets and reps below are for the ${block.label} block. Tap a day in the Plan for that day's exact session.`;

  const links: [string, string, SessionKey | null][] = [
    ["day-a", "Day A · Hips & Thighs", "a"],
    ["day-b", "Day B · Knees, Calves & Spring", "b"],
    ["bands", "Sunday bands", "bands"],
    ["mobility", "Mobility", null],
    ["progression", "Progression & rules", null],
  ];
  jumpEl.innerHTML = links
    .map(
      ([id, label, key]) =>
        `<a class="jump-link${key && key === next?.key ? " is-next" : ""}" href="#${id}">${esc(label)}</a>`
    )
    .join("");

  sessionsEl.innerHTML = `
    ${sessionSection(SESSIONS.a, block)}
    ${sessionSection(SESSIONS.b, block)}
    ${sessionSection(SESSIONS.bands, block)}
    <section class="session" id="mobility">
      <div class="session-head">
        <h2 class="session-title">Mobility</h2>
        <p class="session-sub">For the plan's light mobility days, or any time you feel stiff.</p>
      </div>
      ${routineBlock("Mobility", MOBILITY)}
    </section>
    ${progressionSection(block)}`;

  // The sections only exist now, so honour a #day-a style link from the plan.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

render();
