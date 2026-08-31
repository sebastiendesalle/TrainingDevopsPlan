// Athlete profile. These are the numbers every derived metric keys off, so
// keep them here rather than scattered as literals. Update when Garmin does.

export const ATHLETE = {
  maxHr: 190,
  restHr: 50,
  weightKg: 77, // Garmin, 3 Apr
  ftpWatts: 238, // Garmin cycling FTP, 2 Jul
};

export function wattsPerKg(watts = ATHLETE.ftpWatts): number {
  return watts / ATHLETE.weightKg;
}

// Garmin's cycling FTP rating bands (males, W/kg).
const FTP_RATINGS: { label: string; min: number; color: string }[] = [
  { label: "Superior", min: 5.04, color: "#a78bfa" },
  { label: "Excellent", min: 3.93, color: "#60aaff" },
  { label: "Good", min: 2.79, color: "#80cf80" },
  { label: "Fair", min: 2.23, color: "#f0a04b" },
  { label: "Untrained", min: 0, color: "#ff6b6b" },
];

export function ftpRating(wkg = wattsPerKg()): { label: string; color: string } {
  const band = FTP_RATINGS.find((r) => wkg >= r.min);
  return band ?? FTP_RATINGS[FTP_RATINGS.length - 1];
}

// Coggan cycling power zones, as a fraction of FTP.
export interface PowerZone {
  zone: number;
  label: string;
  color: string;
  loPct: number;
  hiPct: number;
}

export const POWER_ZONES: PowerZone[] = [
  { zone: 1, label: "Active recovery", color: "#8ac6ff", loPct: 0, hiPct: 0.55 },
  { zone: 2, label: "Endurance", color: "#80cf80", loPct: 0.55, hiPct: 0.75 },
  { zone: 3, label: "Tempo", color: "#f0c040", loPct: 0.75, hiPct: 0.9 },
  { zone: 4, label: "Threshold", color: "#f0a04b", loPct: 0.9, hiPct: 1.05 },
  { zone: 5, label: "VO2 max", color: "#ff8a5b", loPct: 1.05, hiPct: 1.2 },
  { zone: 6, label: "Anaerobic", color: "#ff6b6b", loPct: 1.2, hiPct: 1.5 },
  { zone: 7, label: "Neuromuscular", color: "#e0729b", loPct: 1.5, hiPct: 99 },
];

export function powerZoneFor(watts: number): PowerZone {
  const pct = watts / ATHLETE.ftpWatts;
  return (
    POWER_ZONES.find((z) => pct >= z.loPct && pct < z.hiPct) ??
    POWER_ZONES[POWER_ZONES.length - 1]
  );
}

export function pctOfFtp(watts: number): number {
  return (watts / ATHLETE.ftpWatts) * 100;
}
