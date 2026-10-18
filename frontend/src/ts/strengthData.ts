// The strength programme: Day A on Tuesdays, Day B on Thursdays (both in the
// gym) and optional band work on Sundays. The plan drawer and the strength
// page both read from here, so sets, reps and cues only change in one place.

export type BlockKey = "intro" | "build" | "strength" | "power" | "maintain";

export interface Block {
  key: BlockKey;
  label: string;
  from: string; // YYYY-MM-DD, first day of the block
  summary: string; // one line for the plan drawer
  light?: boolean; // the whole block uses the light doses
  // Columns of the progression table on the strength page.
  lifts: string;
  jumps: string;
  nordics: string;
}

export const BLOCKS: Block[] = [
  {
    key: "intro",
    label: "Intro",
    from: "2026-10-19",
    summary: "2 easy sets, learn the moves",
    light: true,
    lifts: "2 sets, light. Learn the moves",
    jumps: "Box jumps only",
    nordics: "Skip",
  },
  {
    key: "build",
    label: "Build",
    from: "2026-11-02",
    summary: "3 sets of 8–10, add weight when easy",
    lifts: "3 × 8–10, add weight when easy",
    jumps: "Box jumps, single-leg hops in place, side hops on both feet",
    nordics: "2 × 4",
  },
  {
    key: "strength",
    label: "Strength",
    from: "2026-11-30",
    summary: "Heavier: 3–4 sets of 6–8",
    lifts: "3–4 × 6–8, heavy",
    jumps: "Hops on one foot, depth drops",
    nordics: "3 × 5",
  },
  {
    key: "power",
    label: "Power",
    from: "2027-02-01",
    summary: "Heavy sets of 5, depth jumps",
    lifts: "3 × 5–6, heavy",
    jumps: "Depth jumps replace box jumps",
    nordics: "3 × 5",
  },
  {
    key: "maintain",
    label: "Maintain",
    from: "2027-04-05",
    summary: "2 heavy sets, keep it, don't build it",
    lifts: "2 sets, heavy",
    jumps: "2 sets, no depth jumps",
    nordics: "2 × 4",
  },
];

// Sets × reps per block. "light" is used on light days and in the Intro
// block, "all" is the fallback for any block. No dose means: skip it then.
export type Dose = Partial<Record<BlockKey | "light" | "all", string>>;

export interface Exercise {
  id: string; // also the drawing: public/strength/<id>.svg
  name: string;
  cue: string;
  dose: Dose;
  alt?: string;
}

export interface Routine {
  minutes: number;
  items: string[];
  note?: string;
}

export type SessionKey = "a" | "b" | "bands";

export interface Session {
  key: SessionKey;
  anchor: string; // section id on the strength page
  name: string;
  title: string;
  day: string;
  focus: string;
  minutes: number;
  warmup?: Routine;
  exercises: Exercise[];
  cooldown: Routine;
}

const DAY_A: Session = {
  key: "a",
  anchor: "day-a",
  name: "Day A",
  title: "Hips & Thighs",
  day: "Tuesday",
  focus: "Glutes, quads, hamstrings, groin and hip flexors, plus a calf hold",
  minutes: 55,
  warmup: {
    minutes: 10,
    items: [
      "5 min easy bike or rower",
      "leg swings 10 + 10 / leg",
      "hip 90/90 × 6 / side",
      "glute bridge 2 × 10, 3 s squeeze",
      "band side-walks 2 × 10 steps each way",
      "banded hip rotation 2 × 10 / side",
      "TKE with band 1 × 15 / side",
      "1 light set of split squats",
    ],
  },
  exercises: [
    {
      id: "bulgarian-split-squat",
      name: "Bulgarian split squat",
      cue: "Back foot on a bench, dumbbells in hand. Sink until the back knee nearly touches, drive up through the front heel.",
      dose: {
        light: "2 × 8 / side, light",
        build: "3 × 8–10 / side",
        strength: "4 × 6 / side, heavy",
        power: "3 × 5 / side, heavy",
        maintain: "2 × 6 / side, heavy",
      },
      alt: "Gym swap: hack squat, same sets. Never both.",
    },
    {
      id: "single-leg-rdl",
      name: "Single-leg RDL",
      cue: "Soft knee, hinge at the hip, weight to mid-shin. Keep your hips square, squeeze the glute to stand.",
      dose: {
        light: "2 × 8 / side, light",
        build: "3 × 8–10 / side",
        strength: "3 × 6–8 / side, heavy",
        power: "3 × 6 / side, heavy",
        maintain: "2 × 6 / side",
      },
    },
    {
      id: "nordic-curl",
      name: "Nordic curl",
      cue: "Heels hooked under a pad or held by a partner. Lower your straight body as slowly as you can, catch with your hands, push back up.",
      dose: { build: "2 × 4", strength: "3 × 5", power: "3 × 5", maintain: "2 × 4" },
    },
    {
      id: "copenhagen-plank",
      name: "Copenhagen plank",
      cue: "Side plank, top leg on a bench, bottom leg hanging. Lift your hips in line. Knee on the bench first, foot once 30 s is easy.",
      dose: {
        light: "2 × 15 s / side",
        build: "3 × 20 s / side",
        strength: "3 × 30 s / side",
        power: "3 × 30 s / side",
        maintain: "2 × 30 s / side",
      },
    },
    {
      id: "reverse-copenhagen",
      name: "Reverse Copenhagen",
      cue: "No bench: side plank on your forearm, feet stacked. Lift your hips, then raise the top leg and hold. The outer hip does the work.",
      dose: {
        light: "2 × 20 s / side",
        build: "3 × 30 s / side",
        strength: "3 × 45 s / side",
        power: "3 × 45 s / side",
        maintain: "2 × 45 s / side",
      },
    },
    {
      id: "hip-flexor-raise",
      name: "Banded hip flexor raise",
      cue: "Mini band around both feet. Drive one knee to hip height, hold 3 s, lower slowly. Stand tall.",
      dose: {
        light: "2 × 8 / side",
        build: "3 × 8 / side",
        strength: "3 × 10 / side",
        power: "3 × 10 / side",
        maintain: "2 × 10 / side",
      },
    },
    {
      id: "calf-iso-hold",
      name: "Single-leg calf hold",
      cue: "Heavy dumbbell in one hand, rise onto one forefoot and hold at the top, squeezing the calf. Other hand on the rack.",
      dose: {
        light: "2 × 20 s / side",
        build: "3 × 30 s / side",
        strength: "4 × 30 s / side, heavier",
        power: "3 × 30 s / side, heavy",
        maintain: "2 × 30 s / side",
      },
    },
  ],
  cooldown: {
    minutes: 5,
    items: [
      "half-kneeling hip flexor stretch",
      "figure-4 glute stretch",
      "hamstring stretch, heel on a bench",
      "frog groin stretch",
      "calf stretch on the wall",
    ],
    note: "45 s each, each side",
  },
};

const DAY_B: Session = {
  key: "b",
  anchor: "day-b",
  name: "Day B",
  title: "Knees, Calves & Spring",
  day: "Thursday",
  focus: "Calves, Achilles, shins and ankles, single-leg landing and jumps",
  minutes: 50,
  warmup: {
    minutes: 6,
    items: [
      "5 min easy bike (skip it straight after a run)",
      "knee-to-wall ankle rocks × 10 / side",
      "3-way banded calf raises 1 × 6 each way / side",
      "fast banded knee drives 2 × 10 s / side",
      "pogo hops 2 × 15",
      "TKE with band 1 × 15 / side",
    ],
  },
  exercises: [
    {
      id: "box-jump",
      name: "Box jump",
      cue: "Jump onto a knee-high box, land soft and quiet, stand tall. Step down, never jump down.",
      dose: { light: "2 × 5", build: "3 × 5", strength: "3 × 5", maintain: "2 × 5" },
    },
    {
      id: "single-leg-hops",
      name: "Single-leg hops",
      cue: "Small, quick hops on one foot with a stiff ankle. Land on the forefoot, knee soft. Rest fully between sets.",
      dose: {
        build: "2 × 8 / side, in place",
        strength: "2 × 10 / side, moving forward",
        power: "3 × 10 / side",
        maintain: "2 × 10 / side",
      },
    },
    {
      id: "side-hops",
      name: "Side-to-side hops",
      cue: "Hop sideways over a line and back, quick and light. Land quietly with knees over toes.",
      dose: {
        build: "2 × 10, both feet",
        strength: "2 × 10 / side, one foot",
        power: "3 × 10 / side, one foot",
        maintain: "2 × 10 / side",
      },
    },
    {
      id: "depth-drop",
      name: "Depth drop",
      cue: "Step off a 30 cm box, land on both feet and freeze in a quarter squat. Quiet landing, knees over toes.",
      dose: { strength: "3 × 5" },
    },
    {
      id: "depth-jump",
      name: "Depth jump",
      cue: "Step off a 30 cm box and jump up the moment you land. Short, springy contact, then step back up.",
      dose: { power: "3 × 5" },
    },
    {
      id: "seated-single-leg-squat",
      name: "Seated single-leg squat",
      cue: "Sit on a box, one leg out in front. Stand up on the other leg, lower in 3 s. Knee tracks over the toes.",
      dose: {
        light: "2 × 6 / side",
        build: "3 × 8 / side",
        strength: "3 × 8 / side, lower box",
        power: "3 × 8 / side, hold a plate",
        maintain: "2 × 8 / side",
      },
    },
    {
      id: "bent-knee-calf-raise",
      name: "Bent-knee calf raise",
      cue: "Seated calf machine, one leg at a time. Deep stretch at the bottom, rise high, 2 s up and 2 s down.",
      dose: {
        light: "2 × 10 / side, light",
        build: "3 × 10 / side",
        strength: "3 × 8 / side, heavy",
        power: "3 × 8 / side, heavy",
        maintain: "2 × 8 / side, heavy",
      },
    },
    {
      id: "single-leg-calf-raise",
      name: "Single-leg calf raise",
      cue: "On a step or slant board holding about 15 kg (20% of body weight). Heel low, rise high, squeeze 2 s at the top.",
      dose: {
        light: "2 × 8 / side, body weight",
        build: "3 × 10 / side",
        strength: "3 × 8 / side, heavier",
        power: "3 × 8 / side, heavy",
        maintain: "2 × 8 / side",
      },
    },
    {
      id: "tibialis-raise",
      name: "Tibialis raise",
      cue: "Back against a wall, heels 30 cm out. Lift your toes as high as you can, lower slowly. Later: a weight on the foot.",
      dose: {
        light: "2 × 12",
        build: "2 × 15",
        strength: "3 × 12, weighted",
        power: "3 × 12, weighted",
        maintain: "2 × 12",
      },
    },
    {
      id: "post-tib-raise",
      name: "Post-tib calf raise",
      cue: "Ball squeezed between your ankles. Rise onto your toes and lower slowly, keeping the ball tight the whole time.",
      dose: { light: "2 × 12", build: "2 × 15", strength: "3 × 15", power: "3 × 15", maintain: "2 × 15" },
    },
  ],
  cooldown: {
    minutes: 5,
    items: [
      "straight-knee calf stretch",
      "bent-knee calf stretch",
      "kneeling shin stretch",
      "roll your foot on a ball",
      "half-kneeling hip flexor stretch",
    ],
    note: "45 s each, each side",
  },
};

const BANDS: Session = {
  key: "bands",
  anchor: "bands",
  name: "Sunday bands",
  title: "Ankles, Calves & Hips",
  day: "Sunday · optional",
  focus: "Light band work at home for ankles, calves, shins, hips and knees. No fatigue",
  minutes: 15,
  exercises: [
    {
      id: "three-way-calf-raise",
      name: "3-way banded calf raise",
      cue: "Band round the ankle, tied low. Single-leg calf raises with the band pulling forward, then from each side.",
      dose: { all: "2 × 8 each way / side" },
    },
    {
      id: "hip-flexor-hold",
      name: "45° hip flexor hold",
      cue: "Mini band around both feet. Lift one knee halfway, about 45°, and hold still. Tall posture, no leaning back.",
      dose: { all: "2 × 20 s / side" },
    },
    {
      id: "banded-clamshell",
      name: "Banded clamshell",
      cue: "Lie on your side, knees bent, band above the knees. Open the top knee without rolling your hips back.",
      dose: { all: "2 × 12 / side" },
    },
    {
      id: "monster-walk",
      name: "Monster walk",
      cue: "Band round the ankles, half squat, feet wide. 10 steps forward, 10 back, keeping the band tight.",
      dose: { all: "2 × 10 steps each way" },
    },
    {
      id: "tke",
      name: "TKE with band",
      cue: "Band behind the knee, tied in front. Bend the knee slightly, then push it straight and squeeze the thigh for 2 s.",
      dose: { all: "2 × 15 / side" },
    },
    {
      id: "banded-tib-raise",
      name: "Banded tib raise",
      cue: "Sit with your legs straight, band round the top of the foot, tied in front. Pull your toes toward you, lower slowly.",
      dose: { all: "2 × 15 / side" },
    },
  ],
  cooldown: {
    minutes: 5,
    items: ["hip 90/90", "couch stretch", "straight- and bent-knee calf stretch"],
    note: "slow and easy",
  },
};

export const SESSIONS: Record<SessionKey, Session> = { a: DAY_A, b: DAY_B, bands: BANDS };

// For the plan's "Light mobility" days, and any time you feel stiff.
export const MOBILITY: Routine = {
  minutes: 20,
  items: [
    "5–10 min easy walk",
    "leg swings 10 + 10 / leg",
    "hip 90/90 × 8 / side",
    "world's greatest stretch × 4 / side",
    "knee-to-wall ankle rocks × 10 / side",
    "glute bridge 2 × 10",
    "couch stretch 45 s / side",
    "calf stretch, straight and bent knee, 45 s each",
  ],
  note: "foam roll calves and quads if they feel tight",
};

export const RULES: string[] = [
  "Leave about 2 reps in the tank. When every set feels easy, add 2–5 kg next time.",
  "Light days (deload, recovery, exam and taper weeks, or marked light in the plan): 2 sets at about 70%, no Nordics or hops.",
  "Calf check: the morning after Day B, do 10 single-leg calf raises per side. Stiffer or sorer than usual? Skip the hops next time and repeat last week's weights.",
  "Left leg first on every single-leg exercise. The right side does the same reps, never more.",
  "Pain up to 3/10 that has settled by the next morning is fine. Sharper pain, numbness or tingling: stop that exercise and get it checked.",
  "Combined days: run or bike first, then lift. With a swim, lift first and swim after.",
];
