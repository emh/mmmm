/**
 * The park (PRD §31) and the spots inside it.
 *
 * There is no home. She lives in the forest and the game never leaves it --
 * which removes the one place where nothing she does is legible, and removes
 * the need for an indoors special case in every renderer and pose mapping.
 *
 * Places are what the player navigates between. Spots are what Molly Mae
 * actually attends to -- they carry stimuli and they are the keys for place
 * memory (§8.1). Keeping memory at spot granularity is what lets the dog
 * remember "the fern hollow" rather than "the whole trail".
 */

export const PLACES = {
  cedar_trail: {
    id: "cedar_trail",
    name: "Cedar Trail",
    blurb: "Packed earth through old growth.",
    art: "cedar-far",
    ground: "trail", groundScale: 38, scenery: "forest",
    connects: ["gravel_loop", "creek_boardwalk"],
    spots: ["trailhead", "cedar_grove", "fern_hollow", "fallen_log", "junction"],
  },
  creek_boardwalk: {
    id: "creek_boardwalk",
    name: "Creek & Boardwalk",
    blurb: "Cedar planks over shallow water.",
    art: "creek-far",
    // Planks are small and repetitive; at the trail's texture scale they come
    // out the size of railway sleepers.
    ground: "boardwalk", groundScale: 13, scenery: "boardwalk", rail: true,
    connects: ["cedar_trail", "creek"],
    spots: ["boardwalk_start", "plank_span", "creek_edge", "far_bank"],
  },

  /*
   * Two more places, so the park stops being one corridor with a different
   * floor. Each differs in all three of the things that make somewhere feel
   * like somewhere: what is underfoot, what grows beside it, and what she can
   * find there.
   */
  gravel_loop: {
    id: "gravel_loop",
    name: "Gravel Loop",
    blurb: "A wide packed-gravel path, easy going.",
    art: "cedar-far",
    ground: "gravel", groundScale: 26, scenery: "forest",
    connects: ["cedar_trail", "creek"],
    spots: ["loop_bend", "big_cedar", "bramble_edge", "bench_stop"],
  },
  creek: {
    id: "creek",
    name: "The Creek",
    blurb: "Shallow water over cobbles.",
    art: "creek-far",
    ground: "creekbed", groundScale: 22, scenery: "water",
    connects: ["gravel_loop", "creek_boardwalk"],
    spots: ["shingle_bar", "shallows", "deep_pool", "alder_bank"],
  },
};

/**
 * Spot definitions. `draws` are the drives a spot naturally pulls on, used as
 * environmental relevance in the utility formula (§7). `stimuli` are what can
 * appear here, with a per-visit chance.
 */
export const SPOTS = {
  // --- cedar trail ------------------------------------------------------
  trailhead:   { id: "trailhead",   name: "the trailhead",   place: "cedar_trail",
                 draws: { exploration: .5 },
                 stimuli: [{ id: "dog_scent", chance: .35 }] },
  cedar_grove: { id: "cedar_grove", name: "the cedar grove", place: "cedar_trail",
                 draws: { curiosity: .5, prey: .6 },
                 stimuli: [{ id: "squirrel", chance: .40 }, { id: "woodpecker", chance: .25 }] },
  fern_hollow: { id: "fern_hollow", name: "the fern hollow", place: "cedar_trail",
                 draws: { curiosity: .9, exploration: .7 },
                 stimuli: [{ id: "deer_scent", chance: .55 }, { id: "mushrooms", chance: .20 }] },
  fallen_log:  { id: "fallen_log",  name: "the fallen log",  place: "cedar_trail",
                 draws: { play: .6, curiosity: .4 },
                 stimuli: [{ id: "stick", chance: .45 }, { id: "insects", chance: .25 }] },
  junction:    { id: "junction",    name: "the trail junction", place: "cedar_trail",
                 draws: { exploration: .6, social: .4 },
                 stimuli: [{ id: "dog_scent", chance: .40 }, { id: "hiker", chance: .20 }],
                 // The signposted routes of §10 -- visible, not walkable.
                 signposts: ["North Trail", "Twin Falls", "Beach Trail"] },

  // --- creek & boardwalk ------------------------------------------------
  boardwalk_start: { id: "boardwalk_start", name: "the start of the boardwalk", place: "creek_boardwalk",
                     draws: { exploration: .4 },
                     stimuli: [{ id: "dog_scent", chance: .30 }] },
  plank_span:      { id: "plank_span",      name: "the plank span", place: "creek_boardwalk",
                     draws: { exploration: .5 },
                     // The fear-and-confidence set piece (§31).
                     crossing: true,
                     stimuli: [{ id: "loud_noise", chance: .30 }, { id: "hollow_planks", chance: .5 }] },
  creek_edge:      { id: "creek_edge",      name: "the creek edge", place: "creek_boardwalk",
                     draws: { thirst: .8, play: .7, curiosity: .5 },
                     stimuli: [{ id: "water", chance: 1 }, { id: "frog", chance: .30 }] },
  // --- gravel loop ------------------------------------------------------
  loop_bend:    { id: "loop_bend",    name: "the bend in the loop", place: "gravel_loop",
                  draws: { exploration: .5 },
                  stimuli: [{ id: "dog_scent", chance: .45 }, { id: "hiker", chance: .30 }] },
  big_cedar:    { id: "big_cedar",    name: "the big cedar", place: "gravel_loop",
                  draws: { curiosity: .6, prey: .5 },
                  stimuli: [{ id: "squirrel", chance: .45 }, { id: "woodpecker", chance: .30 }] },
  bramble_edge: { id: "bramble_edge", name: "the bramble edge", place: "gravel_loop",
                  draws: { curiosity: .7, exploration: .5 },
                  stimuli: [{ id: "berries", chance: .40 }, { id: "rabbit_scent", chance: .35 }] },
  bench_stop:   { id: "bench_stop",   name: "the bench", place: "gravel_loop",
                  draws: { social: .6, fatigue: .5 },
                  stimuli: [{ id: "hiker", chance: .35 }, { id: "dog_scent", chance: .40 }] },

  // --- the creek --------------------------------------------------------
  shingle_bar:  { id: "shingle_bar",  name: "the shingle bar", place: "creek",
                  draws: { exploration: .6, curiosity: .5 },
                  stimuli: [{ id: "animal_tracks", chance: .50 }, { id: "stick", chance: .40 }] },
  shallows:     { id: "shallows",     name: "the shallows", place: "creek",
                  draws: { thirst: .9, play: .8 },
                  stimuli: [{ id: "water", chance: 1 }, { id: "frog", chance: .40 }] },
  deep_pool:    { id: "deep_pool",    name: "the deep pool", place: "creek",
                  draws: { play: .7, curiosity: .5 },
                  stimuli: [{ id: "water", chance: 1 }, { id: "salmon", chance: .25 }] },
  alder_bank:   { id: "alder_bank",   name: "the alder bank", place: "creek",
                  draws: { curiosity: .8 },
                  stimuli: [{ id: "deer_scent", chance: .45 }, { id: "insects", chance: .35 }] },

  far_bank:        { id: "far_bank",        name: "the far bank", place: "creek_boardwalk",
                     // Only reachable across the plank span.
                     beyondCrossing: true,
                     draws: { exploration: .8, curiosity: .6 },
                     stimuli: [{ id: "deer_scent", chance: .35 }, { id: "animal_tracks", chance: .40 }] },
};

/**
 * Stimuli the dog can perceive (PRD §31 MVP stimulus list). `interest` is the
 * baseline pull; `drive` names which drive it speaks to; `valence` is its
 * default emotional colour before any learning happens.
 */
export const STIMULI = {
  deer_scent:    { id: "deer_scent",    label: "deer scent",       drive: "curiosity",  interest: .85, valence:  .25, scent: true },
  dog_scent:     { id: "dog_scent",     label: "another dog",      drive: "social",     interest: .60, valence:  .20, scent: true },
  squirrel:      { id: "squirrel",      label: "a squirrel",       drive: "prey",       interest: .90, valence:  .35 },
  woodpecker:    { id: "woodpecker",    label: "a woodpecker",     drive: "curiosity",  interest: .45, valence:  .10 },
  frog:          { id: "frog",          label: "a frog",           drive: "prey",       interest: .55, valence:  .20 },
  water:         { id: "water",         label: "moving water",     drive: "play",       interest: .70, valence:  .40 },
  stick:         { id: "stick",         label: "a good stick",     drive: "play",       interest: .65, valence:  .45 },
  mushrooms:     { id: "mushrooms",     label: "mushrooms",        drive: "curiosity",  interest: .35, valence:  .05 },
  insects:       { id: "insects",       label: "insects",          drive: "curiosity",  interest: .25, valence:  .05 },
  animal_tracks: { id: "animal_tracks", label: "animal tracks",    drive: "curiosity",  interest: .60, valence:  .15, scent: true },
  hiker:         { id: "hiker",         label: "a hiker",          drive: "social",     interest: .50, valence:  .15 },
  loud_noise:    { id: "loud_noise",    label: "a sudden noise",   drive: "security",   interest: .80, valence: -.55, startling: true },
  hollow_planks: { id: "hollow_planks", label: "hollow planks",    drive: "security",   interest: .40, valence: -.20 },
  // Discoverable only by investigating -- the §32 scenario payoff.
  berries:       { id: "berries",       label: "ripe berries",     drive: "curiosity",  interest: .40, valence:  .20 },
  rabbit_scent:  { id: "rabbit_scent",  label: "rabbit scent",     drive: "prey",       interest: .75, valence:  .25, scent: true },
  salmon:        { id: "salmon",        label: "something in the pool", drive: "prey",  interest: .70, valence:  .20 },
  antler:        { id: "antler",        label: "a shed antler",    drive: "curiosity",  interest: .95, valence:  .70, treasure: true },
};

export const place = (id) => PLACES[id];
export const spot = (id) => SPOTS[id];
export const stimulus = (id) => STIMULI[id];

/** Spots the dog can currently reach in a place, given crossing state. */
export function reachableSpots(placeId, hasCrossed) {
  return PLACES[placeId].spots.filter((id) => !SPOTS[id].beyondCrossing || hasCrossed);
}
