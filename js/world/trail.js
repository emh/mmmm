/**
 * The shape of the trail.
 *
 * One centreline function, shared by everything that needs to know where the
 * trail is: the path texture, the scenery beside it, and Molly walking it. A
 * second opinion anywhere here means trees standing in the path, so this is
 * deliberately the only source.
 *
 * `s` is arc length in metres from the start of the walk, and the return is
 * metres left (-) or right (+) of the walk's overall heading.
 *
 * Two sines rather than a random walk. Integrating a random curvature twice
 * drifts without bound -- a few minutes in, the trail is a kilometre off to one
 * side and every curve is in the same direction. A bounded sum returns, never
 * repeats on a period a player can feel (the wavelengths are deliberately not
 * a simple ratio), and can be evaluated at any `s` without stepping through
 * history, which is what makes it cheap to ask about a point 20 m ahead.
 */

/*
 * Tuned by curvature, not amplitude.
 *
 * Amplitude is the wrong dial: the camera turns to look along the trail, so a
 * big lazy swing cancels almost entirely and shows up as nothing. What the eye
 * actually reads is the second derivative -- A/L^2 -- because that is what
 * survives once the heading is subtracted. The first pass used amplitudes that
 * looked generous on paper and produced a bend of 0.7 m at 17 m out, under a
 * third of the trail's own width, which is invisible.
 *
 * Curvature and wavelength pull against each other -- heading is k*L, so more
 * bend at a fixed wavelength means the trail's absolute direction wanders more.
 * That turns out to cost nothing: the camera always looks along the trail and
 * nothing in the world is held in a global frame, so absolute heading is
 * unobservable. It is spent freely here, and only the backdrop pan reads it.
 *
 * Wavelength is the constraint that does bite. It has to stay well above the
 * ~16 m of trail that is clear of haze, or a whole S-bend fits on screen and
 * the trail reads as a snake rather than as a path round a bend.
 */
const A1 = 16.0, L1 = 26.0;            // the long, lazy swing
const A2 = 1.6, L2 = 13.7, P2 = 1.7;   // a shorter wander on top of it

/** Lateral position of the trail centreline at arc length `s`, in metres. */
export function centreline(s) {
  return A1 * Math.sin(s / L1) + A2 * Math.sin(s / L2 + P2);
}

/** The trail's heading at `s`: lateral metres per metre travelled. */
export function heading(s) {
  return (A1 / L1) * Math.cos(s / L1) + (A2 / L2) * Math.cos(s / L2 + P2);
}

/**
 * Where the trail is at `z` metres ahead, relative to the camera, in metres.
 *
 * Subtracting `heading * z` is the camera turning to look along the trail. It
 * matters more than it sounds: without it a curve slides the whole distance
 * sideways, as if you were walking a bend while staring rigidly ahead. With it
 * the linear term cancels and what is left is curvature alone -- the trail
 * leaves straight ahead and bends away roughly with the square of distance,
 * which is what walking round a bend actually looks like.
 */
export function bend(z, travelled) {
  return centreline(travelled + z) - centreline(travelled) - heading(travelled) * z;
}

/** A bend function bound to one moment, for passing to renderers. */
export function bendAt(travelled) {
  const here = centreline(travelled);
  const slope = heading(travelled);
  return (z) => centreline(travelled + z) - here - slope * z;
}
