/**
 * Psychological drives (PRD §6.2).
 *
 * Physical needs -- hunger, thirst, fatigue, exercise -- have been cut. The
 * game is "take Molly for a walk in the woods", and a meter that fills while
 * you are not playing is the opposite of that: it turns a walk into an errand,
 * and §36 already warned that virtual-pet chores must not dominate.
 *
 * What is left is what makes her interesting to watch: curiosity, play, the
 * pull of somewhere new, and the memory of what happened last time. None of it
 * decays into an obligation.
 */

/** Per simulated minute. Drives build toward a personality-set ceiling. */
export const DRIVE_RATES = {
  curiosity:   1 / (3 * 60),
  social:      1 / (5 * 60),
  play:        1 / (4 * 60),
  exploration: 1 / (4 * 60),
  prey:        1 / (2 * 60),
  security:    1 / (6 * 60),
};

export function initialDrives() {
  return { curiosity: .55, social: .40, play: .45, exploration: .50, prey: .35, security: .10 };
}

export function advanceDrives(drives, minutes, traits) {
  const next = { ...drives };
  for (const key of Object.keys(DRIVE_RATES)) {
    const ceiling = driveCeiling(key, traits);
    next[key] = clamp(Math.min(ceiling, next[key] + DRIVE_RATES[key] * minutes));
  }
  // Security is relief-seeking, and settles on its own.
  next.security = clamp(next.security - DRIVE_RATES.security * minutes * 2);
  return next;
}

/** Personality caps how strongly a drive can build (§6.4: bias, not determine). */
function driveCeiling(drive, traits) {
  switch (drive) {
    case "curiosity":   return .35 + traits.curiosity * .75;
    case "social":      return .30 + traits.sociability * .75;
    case "play":        return .30 + traits.playfulness * .75;
    case "exploration": return .30 + traits.curiosity * .5 + traits.independence * .3;
    case "prey":        return .20 + traits.playfulness * .4 + traits.boldness * .4;
    default:            return 1;
  }
}

export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
