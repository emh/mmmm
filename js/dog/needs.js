/**
 * Physical needs and psychological drives (PRD §6.1, §6.2).
 *
 * Values are 0..1 where 1 is "maximally pressing". They are internal and never
 * displayed as numbers (§2.2) -- the player reads them off behaviour.
 *
 * Decay rates are deliberately slow. PRD §36 warns that virtual-pet chores must
 * not dominate; needs exist to create context for exploration, not to demand
 * constant optimisation.
 */

/** Per simulated minute. */
export const NEED_RATES = {
  hunger:   1 / (10 * 60),   // pressing after ~10h
  thirst:   1 / (6 * 60),
  fatigue:  1 / (14 * 60),
  exercise: 1 / (8 * 60),
};

/** Drives recover toward a personality-set baseline rather than draining. */
export const DRIVE_RATES = {
  curiosity:   1 / (3 * 60),
  social:      1 / (5 * 60),
  play:        1 / (4 * 60),
  exploration: 1 / (4 * 60),
  prey:        1 / (2 * 60),
  security:    1 / (6 * 60),
};

export function initialNeeds() {
  return { hunger: .25, thirst: .20, fatigue: .15, exercise: .40 };
}

export function initialDrives() {
  return { curiosity: .55, social: .40, play: .45, exploration: .50, prey: .35, security: .10 };
}

/** Walking burns energy and satisfies the exercise drive. */
export function advanceNeeds(needs, minutes, { walking }) {
  const next = { ...needs };
  const effort = walking ? 2.2 : 1;
  next.hunger   = clamp(next.hunger   + NEED_RATES.hunger   * minutes * effort);
  next.thirst   = clamp(next.thirst   + NEED_RATES.thirst   * minutes * effort);
  next.fatigue  = clamp(next.fatigue  + NEED_RATES.fatigue  * minutes * effort);
  next.exercise = clamp(next.exercise + (walking ? -NEED_RATES.exercise * minutes * 3
                                                 :  NEED_RATES.exercise * minutes));
  return next;
}

export function advanceDrives(drives, minutes, traits) {
  const next = { ...drives };
  for (const key of Object.keys(DRIVE_RATES)) {
    const ceiling = driveCeiling(key, traits);
    next[key] = clamp(Math.min(ceiling, next[key] + DRIVE_RATES[key] * minutes));
  }
  // Security is a special case: it is *relief-seeking*, and settles on its own.
  next.security = clamp(next.security - DRIVE_RATES.security * minutes * 2);
  return next;
}

/** Personality caps how strongly a drive can build (§6.4 traits bias, not determine). */
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
