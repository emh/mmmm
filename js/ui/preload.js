/**
 * Load everything before showing anything.
 *
 * The game used to come up immediately and fill in around itself: ferns
 * popping in, the ground arriving after the dog, the path last of all. Every
 * one of those is a separate request finishing at its own moment, and no amount
 * of tuning the first frame hides it -- the only fix is to not show the scene
 * until the scene exists.
 *
 * Nothing here is decorative. It is the same list the renderers will ask for,
 * fetched in advance so that by the time they build their <img> elements every
 * one is a cache hit.
 */

import { PLACES } from "../world/places.js";
import { SCENERY_SETS } from "./corridor.js";
import { CLIPS, clipOwns } from "./animator.js";

const CYCLES = "assets/molly/cycles/gaits";
const TRANS = "assets/molly/transitions";
const SCATTER = "assets/scene/scatter";

/** Never let a stalled asset hold the game shut. */
const CAP_MS = 15000;

/**
 * Every file the MVP can ask for.
 *
 * Derived from the same places and scenery sets the game reads, so adding a
 * place or a sprite cannot leave a hole here -- a hand-written list would go
 * stale the first time the world changed, which is exactly the kind of rot
 * that put a dead texture reference in the stylesheet earlier.
 */
export async function assetList() {
  const [gaits, trans] = await Promise.all([
    fetch(`${CYCLES}/sprites.json`).then((r) => r.json()),
    fetch(`${TRANS}/sprites.json`).then((r) => r.json()),
  ]);

  /*
   * Only the clips the Animator will actually build. Taking the manifests
   * whole would fetch poses the game cannot reach.
   */
  const urls = new Set();
  for (const [dir, man] of [[CYCLES, gaits], [TRANS, trans]]) {
    for (const [key, sprite] of Object.entries(man.sprites)) {
      if (CLIPS.some((c) => clipOwns(key, c))) urls.add(`${dir}/${sprite.file}`);
    }
  }

  for (const place of Object.values(PLACES)) {
    if (place.art) urls.add(`assets/scene/${place.art}.jpg`);
    if (place.ground) urls.add(`assets/scene/ground-${place.ground}.jpg`);
    if (place.path) urls.add(`assets/scene/path-${place.path}.png`);
    for (const file of SCENERY_SETS[place.scenery] || []) urls.add(`${SCATTER}/${file}`);
  }
  return [...urls];
}

/**
 * Fetch and decode every URL.
 *
 * A failed asset resolves rather than rejects. One missing file should cost a
 * fern, not the whole game -- and a boot that hangs on a 404 is indisponible
 * in a way that a missing sprite never is.
 */
export function preload(urls, onProgress = () => {}) {
  let done = 0;
  const one = (url) => new Promise((resolve) => {
    const img = new Image();
    const finish = () => { onProgress(++done, urls.length); resolve(img); };
    img.onload = finish;
    img.onerror = () => { console.warn(`preload: could not load ${url}`); finish(); };
    img.src = url;
  });

  const all = Promise.all(urls.map(one));
  const capped = new Promise((resolve) => setTimeout(resolve, CAP_MS));
  return Promise.race([all, capped]);
}
