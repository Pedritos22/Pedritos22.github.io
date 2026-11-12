// Pure time helpers for the time dial and the scenery that follows the clock.
// No DOM: tested in tests/time.test.mjs.

export const MINUTE = 60000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Local hour of a date as a float, 0 <= h < 24. */
export function hourOf(date) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/** Shortest signed difference between two angles in degrees, in (-180, 180]. */
export function angleDelta(from, to) {
  let d = (to - from) % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

/** Clockwise angle (degrees, 0 = 12 o'clock) of a point relative to a centre (y down). */
export function dialAngle(dx, dy) {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Dial zones, as a fraction of the dial radius: the inner face (moon, inner ring) turns the
 * hour hand, the outer rings turn the days.
 */
export const INNER_ZONE = 0.66;

/** Milliseconds a drag of `deg` degrees moves the clock in a zone. */
export function dragShift(deg, zone) {
  // Hour hand: one turn = 12 h (2 min per degree). Bezel: one turn = 30 days, about a
  // lunar month, so a full turn walks the moon through every phase.
  return zone === "days" ? (deg / 12) * DAY : (deg / 360) * 12 * HOUR;
}

/**
 * Snap a shift so the dialled time lands on a 5-minute step; with `magnet` (dragging), full
 * hours also pull from 6 minutes away. The result is a whole number of minutes, so the
 * dialled clock turns its minutes together with the real one. `base` is the real time the
 * shift applies to.
 */
export function snapShift(shift, base, { magnet = true } = {}) {
  const whole = Math.round(shift / MINUTE) * MINUTE;
  const minutes = new Date(base.getTime() + whole).getMinutes();
  let snapped = Math.round(minutes / 5) * 5;
  if (magnet && minutes < 6) snapped = 0;
  else if (magnet && minutes > 54) snapped = 60;
  return whole + (snapped - minutes) * MINUTE;
}

/** Keep a shift within +-days (the dial is a toy, not a calendar). */
export function clampShift(shift, days = 60) {
  return Math.max(-days * DAY, Math.min(days * DAY, shift));
}

/** "+2h 40m", "-3 days 1h", "now". Rounded to minutes. */
export function formatShift(shift) {
  const total = Math.round(shift / MINUTE);
  if (total === 0) return "now";
  const sign = total > 0 ? "+" : "-";
  let rest = Math.abs(total);
  const days = Math.floor(rest / 1440);
  rest -= days * 1440;
  const hours = Math.floor(rest / 60);
  const minutes = rest - hours * 60;
  const parts = [];
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && !days) parts.push(`${minutes}m`);
  return `${sign}${parts.join(" ") || "0m"}`;
}

/** Piecewise-linear interpolation over sorted [x, y] keys (x wraps at 24). */
function curve(keys, x) {
  const h = ((x % 24) + 24) % 24;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const [x0, y0] = keys[i];
    const [x1, y1] = keys[i + 1];
    if (h >= x0 && h <= x1) return y0 + ((y1 - y0) * (h - x0)) / (x1 - x0 || 1);
  }
  return keys[keys.length - 1][1];
}

/**
 * Share of city windows lit at an hour: full in the evening, thinning out after midnight,
 * a few early risers, and fewer by day (offices, and daylight hides the rest).
 */
export function windowShare(hour) {
  return curve(
    [[0, 0.8], [1, 0.62], [3, 0.3], [5, 0.3], [6.5, 0.55], [8, 0.5], [9.5, 0.34], [16, 0.36], [18, 0.88], [21, 1], [23, 0.95], [24, 0.8]],
    hour
  );
}

/** Brightness factor 0..1 of one window at a lit share (soft edge, stable per window). */
export function windowLit(rank, share) {
  return Math.max(0, Math.min(1, (share - rank) / 0.06 + 0.5));
}

/** Dawn and dusk glow on the horizon, 0..1. */
export function twilight(hour) {
  const bell = (center, width) => Math.exp(-(((hour - center) / width) ** 2));
  return Math.max(bell(6.2, 1.1), bell(19.2, 1.3));
}

/** Daylight lift of the night palette, 0..1 (the world stays a night scene, just less deep). */
export function daylight(hour) {
  const rise = Math.max(0, Math.min(1, (hour - 6.5) / 2.5));
  const set = Math.max(0, Math.min(1, (19.5 - hour) / 2.5));
  return Math.min(rise, set);
}
