// Rendering for the strength programme, shared by the plan drawer and the
// strength page, plus the rules that tie a plan day to its session and dose.

import {
  BLOCKS,
  MOBILITY,
  SESSIONS,
  type Block,
  type Exercise,
  type Routine,
  type Session,
  type SessionKey,
} from "./strengthData";
import type { ParsedWorkout } from "./planParser";

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-BE", { day: "numeric", month: "short" });
}

// ── Which session, which dose ────────────────────────────────

export function blockStart(block: Block): Date {
  const [y, m, d] = block.from.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function blockFor(date: Date): Block {
  let current = BLOCKS[0];
  for (const block of BLOCKS) {
    if (blockStart(block) <= date) current = block;
  }
  return current;
}

// Easy weeks, and any day the plan itself marks "(light)" / "(very light)".
const LIGHT_WEEKS = /^(deload|recovery|exams|taper.*|race|ski|return)$/i;
const LIGHT_TEXT = /\((?:very\s+)?light\b/i;

export function isLightDay(weekType: string, text: string): boolean {
  return LIGHT_WEEKS.test(weekType.trim()) || LIGHT_TEXT.test(text);
}

export function sessionKeyIn(text: string): SessionKey | null {
  const m = text.match(/Strength Day ([AB])\b/i);
  return m ? (m[1].toLowerCase() as SessionKey) : null;
}

export function doseFor(ex: Exercise, block: Block, light: boolean): string | undefined {
  if (light || block.light) return ex.dose.light ?? ex.dose.all;
  return ex.dose[block.key] ?? ex.dose.all;
}

// For exercises that sit out the shown block: when do they come in?
function startsNote(ex: Exercise, block: Block): string {
  const later = BLOCKS.slice(BLOCKS.indexOf(block) + 1).find(
    (b) => !b.light && (ex.dose[b.key] ?? ex.dose.all)
  );
  return later ? `From ${fmtDay(blockStart(later))}` : "Not in this block";
}

// ── Building blocks ──────────────────────────────────────────

export function exerciseCard(ex: Exercise, dose?: string, offNote?: string): string {
  return `
    <article class="ex-card${dose ? "" : " is-off"}">
      <img class="ex-img" src="/strength/${ex.id}.svg" alt="" loading="lazy" />
      <div class="ex-body">
        <div class="ex-name">${esc(ex.name)}</div>
        <div class="ex-dose">${esc(dose ?? offNote ?? "")}</div>
        <p class="ex-cue">${esc(ex.cue)}</p>
        ${ex.alt ? `<p class="ex-alt">${esc(ex.alt)}</p>` : ""}
      </div>
    </article>`;
}

export function routineBlock(label: string, r: Routine): string {
  return `<div class="routine"><span class="routine-label">${esc(label)} · ${
    r.minutes
  } min</span>${esc(r.items.join(" · "))}${r.note ? ` — ${esc(r.note)}` : ""}</div>`;
}

// Warm-up, exercise grid and cool-down. The drawer leaves out what's skipped
// that day; the strength page dims it and says when it starts.
export function sessionBody(s: Session, block: Block, light: boolean, showSkipped: boolean): string {
  const cards = s.exercises
    .map((ex) => {
      const dose = doseFor(ex, block, light);
      if (dose) return exerciseCard(ex, dose);
      return showSkipped ? exerciseCard(ex, undefined, startsNote(ex, block)) : "";
    })
    .join("");

  return `
    ${s.warmup ? routineBlock("Warm-up", s.warmup) : ""}
    <div class="ex-grid">${cards}</div>
    ${routineBlock("Cool-down", s.cooldown)}`;
}

function sessionMeta(block: Block, light: boolean, minutes: number, order: string): string {
  const [label, tone, summary] =
    light && !block.light
      ? ["Light", "good", "2 sets at about 70%, no Nordics or hops"]
      : [block.label, block.light ? "good" : "warn", block.summary];
  const bits = [summary, `~${minutes} min`, order].filter(Boolean);
  return `<div class="session-meta"><span class="week-badge tone-${tone}">${esc(
    label
  )}</span><span>${esc(bits.join(" · "))}</span></div>`;
}

function orderNote(w: ParsedWorkout): string {
  if (w.disciplines.includes("run")) return "after the run";
  if (w.disciplines.includes("bike")) return "after the bike";
  if (w.disciplines.includes("swim")) return "lift first, swim after";
  return "";
}

// ── Plan drawer ──────────────────────────────────────────────

const BANDS_RE = /\bbands\b/i;

export interface PlanDayExtra {
  session?: Session;
  html: string;
}

// Everything strength-related on one plan day: the gym session with that
// week's dose, the Sunday bands, or the mobility routine.
export function planDayExtra(w: ParsedWorkout, weekType: string, date: Date): PlanDayExtra | null {
  const parts: string[] = [];
  const key = sessionKeyIn(w.raw);
  const session = key ? SESSIONS[key] : undefined;
  const block = blockFor(date);

  if (session) {
    const light = isLightDay(weekType, w.raw);
    parts.push(`
      <div class="section-header">Strength · ${esc(session.name)} — ${esc(session.title)}</div>
      ${sessionMeta(block, light, session.minutes, orderNote(w))}
      ${sessionBody(session, block, light, false)}
      <a class="session-link" href="strength.html#${session.anchor}">Open ${esc(
        session.name
      )} on the Strength page →</a>`);
  }

  if (w.segments.some((s) => BANDS_RE.test(s.text))) {
    const bands = SESSIONS.bands;
    parts.push(`
      <div class="section-header">Sunday bands · optional</div>
      <div class="session-meta"><span>~${bands.minutes} min at home · easy, no fatigue</span></div>
      ${sessionBody(bands, block, false, false)}
      <a class="session-link" href="strength.html#${bands.anchor}">Open Sunday bands on the Strength page →</a>`);
  }

  if (w.segments.some((s) => s.discipline === "mobility" && !BANDS_RE.test(s.text))) {
    parts.push(`
      <div class="section-header">Mobility routine</div>
      ${routineBlock("Mobility", MOBILITY)}
      <a class="session-link" href="strength.html#mobility">Open the mobility routine →</a>`);
  }

  return parts.length ? { session, html: parts.join("") } : null;
}
