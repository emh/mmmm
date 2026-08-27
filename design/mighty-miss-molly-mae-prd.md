# Mighty Miss Molly Mae — Product Requirements Document

**Title:** Mighty Miss Molly Mae (locked)  
**Former working title:** Curious Labradoodle  
**Setting:** Pacific Spirit Regional Park, Vancouver, British Columbia  
**Platform:** Mobile-first web game  
**Deployment:** GitHub Pages  
**Client:** Vanilla JavaScript, HTML, CSS; no runtime dependencies for MVP  
**AI service:** Cloudflare Worker → OpenAI API  
**Document status:** MVP definition, revised against approved concept art  
**Companion art:** `design/art-character.png`, `design/art-environment.png`

---

## 1. Product Summary

Mighty Miss Molly Mae is a modern virtual-pet and exploration game in which the player lives alongside Molly Mae, an autonomous labradoodle exploring Pacific Spirit Regional Park — a dense coastal rainforest at the western edge of Vancouver.

The player does **not directly control the dog**. Instead, the dog has its own needs, personality, memories, preferences, fears, habits, and moment-to-moment motivations. The player's role is to care for it, interpret its behavior, make decisions on its behalf, encourage or discourage behavior, and gradually learn how this particular animal thinks.

The game combines the care loop of a virtual pet with an autonomous-agent simulation and a dense nature-exploration game. Its core emotional promise is:

> **The player should frequently wonder what the dog is thinking—and eventually become surprisingly good at knowing.**

The relationship develops in both directions. The player learns the dog, while the dog also learns the player.

---

## 2. Product Principles

### 2.1 Influence, do not puppet

The player chooses opportunities, constraints, responses, and guidance. The dog chooses its immediate behavior.

The player may choose to take the dog to Creek Trail, but cannot simply issue commands such as "walk to tree #14 and sniff it." Once there, the dog decides what attracts its attention.

### 2.2 Behavior should be legible, not transparent

The game should not expose the dog's internal state as a dashboard of percentages.

Avoid:

- Hunger: 72%
- Happiness: 84%
- Curiosity: 91%

Prefer observable behavior:

- staring at the food bowl
- bringing the leash
- walking more slowly
- lying down repeatedly
- lingering at the door
- refusing to cross a bridge
- repeatedly looking toward the creek
- glancing back at the player before chasing something

The player learns to infer state from behavior.

### 2.3 The forest is perceived as a dog would perceive it

A human may see a trail, bridge, cedar tree, and creek.

The dog experiences:

- fresh deer scent
- an old dog scent
- damp soil
- mushrooms
- something moving beneath the bridge
- squirrel activity
- water
- a familiar human smell
- the site of a previous experience

Dog-relevant perception is a first-class game system rather than flavor text.

### 2.4 Personality should produce consequences

The dog must feel like one persistent individual rather than a random behavior generator.

Its preferences and learned associations should make future behavior increasingly predictable without becoming completely deterministic.

### 2.5 Memory is progression

The main progression system is not levels or stat upgrades. It is the accumulation of:

- familiarity
- shared history
- learned behaviors
- place associations
- preferences
- fears
- rituals
- trust
- player knowledge of the animal

The park should gradually transform from unknown wilderness into a map of shared experiences.

### 2.6 AI enhances simulation; it does not replace simulation

The LLM must not drive locomotion, animation, collision, pathfinding, or every second of decision-making.

Conventional deterministic systems run the game continuously. The LLM is consulted intermittently for higher-level interpretation, memory consolidation, unusual situations, and behavioral planning.

The game must remain playable if an AI request is slow or temporarily unavailable.

---

## 3. Target Experience

A typical session should produce moments like:

- The dog suddenly leaves the trail and becomes intensely interested in a patch of ferns.
- The player chooses **Follow** rather than **Call Back**.
- The dog discovers an old deer antler.
- The event becomes a persistent memory associated with that place.
- Several sessions later, the dog pulls toward the same area.
- The player recognizes why before the game explains anything.

Or:

- The dog becomes frightened by a loud noise while crossing an old wooden bridge.
- Future approaches to the bridge produce hesitation.
- The player repeatedly waits patiently and encourages the crossing.
- The dog's confidence slowly changes.
- Eventually the bridge becomes routine.

The desired feeling is less "I solved the mechanic" and more "I know this dog."

---

## 4. Audience and Platform

### Primary audience

Players interested in:

- virtual pets
- cozy games
- autonomous characters
- animal behavior
- nature exploration
- emergent simulation
- emotionally expressive games
- short, repeatable mobile sessions

### Platform assumptions

MVP targets modern mobile browsers first.

Secondary support:

- desktop browsers
- tablets

The initial release is a static client hosted on GitHub Pages with server-side AI requests proxied through a Cloudflare Worker.

No installation, account, or native wrapper is required for MVP.

---

## 5. Core Game Loop

The high-level loop is:

1. **Observe**
   - See what the dog is doing.
   - Notice environmental cues.
   - Infer possible needs or intentions.

2. **Choose**
   - Select one of 3–5 contextually relevant actions.
   - Examples: Follow, Call Back, Wait, Offer Treat, Head Home.

3. **Dog acts**
   - The dog's autonomous model selects and executes behavior.
   - Behavior depends on needs, drives, environment, personality, memory, and learned expectations of the player.

4. **World responds**
   - New scents, animals, weather, terrain, objects, or encounters may appear.
   - Consequences alter state and memory.

5. **Learn**
   - The player gains implicit knowledge of the dog.
   - The dog updates associations about places, stimuli, and player behavior.

6. **Care**
   - Return home to eat, drink, sleep, groom, play, or recover.

7. **Explore again**
   - Familiar locations acquire new meaning.
   - New territory becomes available through exploration rather than conventional level gating.

---

## 6. Dog Model

The dog is represented by several interacting layers.

### 6.0 Character identity

The dog is **Molly Mae**, a single named character rather than a configurable pet. She is
canonical: the player does not choose her breed, coat, name, or starting temperament.

Molly Mae is a **straight-coat labradoodle** — the flat, shaggy, slightly wiry-looking coat
type rather than the curly or fleece coat the word "doodle" usually calls to mind. This is
the single most important thing to get right in any new art, because the default mental
image is wrong, and a curly Molly Mae is a different dog.

Established by `design/art-character.png`:

- warm reddish-copper straight coat, shaggy rather than curled, with subtle tonal variation
- distinctive pale, shaggy beard and muzzle
- floppy ears set close to the head
- long legs; athletic, sturdy build
- warm, expressive brown eyes

Her billed traits are **friendly, curious, loyal** — these are marketing shorthand for the
trait vector in §6.4 and must remain consistent with it. A trait roll that produced a timid
or aloof Molly Mae would be off-model.

**Art-generation note.** Every prompt, reference, or brief for new Molly Mae art must say
*straight-haired* or *straight-coat* labradoodle explicitly, and should say *not curly*.
Image models and human illustrators alike default to a curly apricot doodle, which is
off-model. Treat `design/art-character.png` as the reference of record and check new art
against the four portraits in it before accepting it.

### 6.1 Physical needs

Initial set:

- hunger
- thirst
- fatigue
- exercise need
- temperature / comfort
- cleanliness / grooming
- physical stress

These values are internal and normally hidden from the player.

### 6.2 Psychological drives

Initial set:

- curiosity
- social contact
- play
- novelty seeking
- prey/chase drive
- exploration
- security
- attachment
- confidence

### 6.3 Emotional state

Shorter-lived states derived from events and needs:

- relaxed
- excited
- alert
- uncertain
- frightened
- frustrated
- content
- overstimulated

This should be modeled as continuous state where useful, not as a single exclusive "mood."

#### Expressed emotion set

Internal emotion is continuous. **Expression is quantized.** The approved character sheet
defines exactly four portrait states, and these are the only faces Molly Mae has:

| Expressed state | Reads as | Typical drivers |
| --- | --- | --- |
| `neutral` | at ease, unremarkable | low arousal, needs met, familiar place |
| `happy` | open mouth, soft eyes, loose posture | play, reward, reunion, water, high attachment satisfaction |
| `curious` | head tilt, ears forward, weight shifted toward stimulus | novel scent or sound, moderate arousal, unresolved interest |
| `alert` | still, head up, ears raised, attention locked | prey stimulus, unfamiliar noise, uncertainty, fear onset |

A projection function maps the continuous emotion vector onto one of these four each frame,
with hysteresis so the face does not flicker between states at a threshold boundary.

Note the deliberate gap: there is **no distinct frightened portrait**. Fear is expressed as
`alert` plus body-language and behavior signals — hesitation, lowered tail, ears back,
retreat, refusal to advance — not as a fifth face. This is a constraint on how the bridge
scenario (§3, §32) must be communicated, and it should be respected rather than solved by
commissioning more portraits. If playtesting shows fear is genuinely illegible, the fix is
better posture and pacing before it is a new expression.

### 6.4 Personality

A dog begins with persistent traits such as:

```json
{
  "curiosity": 0.82,
  "sociability": 0.71,
  "boldness": 0.43,
  "foodDrive": 0.76,
  "playfulness": 0.84,
  "independence": 0.38,
  "persistence": 0.62
}
```

Traits bias behavior but do not rigidly determine it.

MVP may start with one canonical dog personality. Later versions could generate a different temperament for each new game.

### 6.5 Learned tendencies

The dog develops learned associations over time.

Examples:

```text
squirrel → chase
player calls during chase → return
return → praise/treat
```

Over repeated experiences:

```text
squirrel → look toward player before acting
```

Other learned tendencies:

- water is fun
- thunder predicts discomfort
- the backpack predicts a long walk
- the leash predicts outside
- a particular person is safe
- the old bridge is frightening
- the player usually permits creek exploration
- returning when called produces a reward

These should alter future action probabilities.

---

## 7. Autonomous Behavior Architecture

Use a hierarchical architecture rather than a single AI agent.

### Layer 1 — Mechanical simulation

Pure local JavaScript.

Responsible for:

- movement
- path following
- collision
- animation state
- proximity
- stamina
- timing
- environmental triggers
- basic sensory checks

No LLM calls.

### Layer 2 — Behavior selection

Pure local JavaScript for most decisions.

At intervals or meaningful decision points, score candidate behaviors such as:

```text
follow_player
investigate_scent
drink_water
rest
chase_squirrel
return_home
sniff_dog
avoid_bridge
play
dig
wait
```

Conceptually:

```text
utility =
  drive_weight
  × personality_bias
  × environmental_relevance
  × memory_association
  × learned_expectation
  × situational_modifier
  + bounded_noise
```

Choose among high-utility candidates rather than always taking the mathematically highest one. This allows recognizable personality without mechanical predictability.

### Layer 3 — High-level neural reasoning

Use the OpenAI model only for selected events such as:

- an unfamiliar situation
- interpreting a complex combination of stimuli
- choosing among several plausible longer-term intentions
- consolidating an important experience into memory
- updating beliefs about the player
- generating a subtle behavioral response to a novel event
- producing an internal behavioral plan

The model should return **structured data**, not prose intended for direct display.

Example conceptual result:

```json
{
  "intent": "investigate_scent",
  "target": "fern_hollow_03",
  "urgency": 0.74,
  "confidence": 0.62,
  "signals": [
    "ears_forward",
    "slow_tail_wag",
    "look_back_at_player"
  ],
  "memoryUpdates": [
    {
      "subject": "fern_hollow_03",
      "association": "interesting",
      "delta": 0.12
    }
  ]
}
```

The local engine validates the response and decides how it can be expressed through available game mechanics.

### Critical rule

**The neural model requests intentions. The game engine owns reality.**

The model cannot invent an object, location, animal, action, or capability that is not present in the current game state.

---

## 8. Dog Memory

Memory should be one of the game's defining systems.

### 8.1 Memory types

#### Place memory

```json
{
  "placeId": "cedar_grove",
  "familiarity": 0.81,
  "associations": {
    "safe": 0.72,
    "interesting": 0.88,
    "frightening": 0.05
  }
}
```

#### Event memory

```json
{
  "eventId": "evt_2031",
  "placeId": "cedar_grove",
  "type": "found_object",
  "subject": "deer_antler",
  "importance": 0.67,
  "emotionalValence": 0.74,
  "timestamp": 2031902
}
```

#### Entity memory

For:

- player
- other dogs
- humans
- animals
- recurring objects

#### Behavioral association

Examples:

```text
player + call_back + obey → praise
bridge + loud_noise → fear
creek + hot_day → pleasure
```

### 8.2 Memory decay

Not everything should be remembered forever.

Low-importance memories gradually weaken.

Important, repeated, emotional, or reinforced memories persist.

This creates a natural distinction between:

- experiences
- habits
- lasting memories

### 8.3 Memory consolidation

Periodic consolidation may merge repeated event memories into higher-level associations.

Example:

```text
three positive swims at Salmon Creek
```

becomes:

```text
Salmon Creek → water + play + positive
```

An LLM can assist with this process, but the resulting memory must be stored as compact structured state.

---

## 9. The Player Model

The dog should gradually build a model of the player.

Track behavioral tendencies such as:

- permits exploration
- recalls frequently
- gives treats often
- follows the dog when it becomes curious
- avoids dangerous areas
- prefers long walks
- responds calmly to fear
- interrupts chasing
- plays often
- maintains predictable routines

The dog should use these expectations when choosing behavior.

Example:

```text
novel scent
+ high curiosity
+ player historically follows investigations
→ dog investigates confidently
```

versus:

```text
novel scent
+ player historically recalls immediately
→ dog pauses and looks toward player
```

This creates a reciprocal relationship rather than a one-way pet-management system.

---

## 10. World Design

The park is **Pacific Spirit Regional Park** — a real coastal temperate rainforest on
Vancouver's west side, established as the setting by `design/art-environment.png`.

This is deliberately an *urban-edge* wilderness, not a remote backcountry. It is dense,
ancient, and quiet, but it is also a place people walk to from their houses. That framing
carries real design consequences:

- home is a house at the park edge, reachable on foot; there is no drive, no trailhead ritual
- other dogs and hikers are routine rather than rare encounters, which makes recurring
  entity memory (§8.1) valuable early
- trails are marked, signed, and interwoven — wayfinding is legible to the player even when
  Molly Mae's choices are not
- boardwalks exist to protect sensitive ground, which gives the world an in-fiction reason
  for surfaces that sound, feel, and smell different underfoot

The park should be **dense rather than enormous**.

A relatively small environment containing many overlapping sensory and memory layers is preferable to a large empty map.

### Initial biome set

Areas, drawn from the environment concept sheet:

- **old-growth grove** — towering conifers, dappled light, the hero view
- **boardwalk trail** — elevated cedar plank walkway over sensitive ground
- **creek and wetland** — shallow water, seeps, mossy root walls
- **trail junction** — signpost and bench; the natural place for a decision point
- fern gully
- fallen-log crossing
- mossy ravine
- packed-earth trail
- home / house at the park edge

Deferred beyond MVP but consistent with the setting: beach, wetland pond, forest clearing.

Note that the concept sheet's trail junction signpost reads *North Trail / Twin Falls /
Beach Trail*. Treat these as the diegetic names of routes leading out of the MVP world —
visible, signposted, and not yet walkable. They cost nothing now and make later expansion
feel like it was always there.

### Environmental entities

Examples:

- squirrels
- **pileated woodpecker** (*Dryocopus pileatus*) — named in the concept sheet; a good
  recurring individual, since it is loud, locatable by sound, and hard to reach
- ravens
- deer
- rabbits
- frogs
- salmon
- insects
- other dogs
- hikers
- **sword fern** (*Polystichum munitum*) — the dominant understory plant
- moss-covered branches
- fallen logs and new growth
- old-growth bark
- mushrooms
- bones / antlers
- sticks
- puddles
- animal tracks
- scent marks
- berries
- moving water

Not every entity must be visually prominent. Some exist primarily as sensory stimuli for the dog.

---

## 11. Scent and Dog Perception

Scent should be treated as a lightweight spatial information layer.

A scent record can contain:

```json
{
  "source": "deer",
  "position": [0.42, 0.68],
  "strength": 0.76,
  "age": 430,
  "familiarity": 0.18,
  "interest": 0.91
}
```

Strength decays over time and distance.

The player should not normally receive an explicit textual explanation such as:

> Deer scent detected: 76%.

Instead, perception is communicated through:

- head movement
- sniffing
- changes in gait
- tail position
- ears
- direction changes
- pausing
- pulling
- subtle visual treatment of scent when appropriate

A later accessibility or "dog sense" mode could make scents more visibly legible.

---

## 12. Care Systems

The player must maintain the animal's basic wellbeing, but care should create context rather than chores.

Initial care actions:

- feed
- refill water
- sleep
- rest
- groom
- play
- walk
- offer treat
- comfort

Care influences:

- physical state
- trust
- expectations
- behavior
- walk duration
- willingness to explore
- response to stressful events

Avoid repetitive maintenance requiring constant meter optimization.

---

## 13. Life Stage Progression

Long-term progression:

1. puppy
2. adolescent
3. mature dog

Life stages change:

- stamina
- curiosity
- confidence
- independence
- attention
- learned behavior
- physical capability
- player relationship

The MVP may focus entirely on one life stage while keeping the data architecture compatible with later progression.

---

## 14. Interaction Model

### Primary interaction rule

At any decision point, show only **3–5 relevant actions**.

The action set is context dependent.

Example — dog becomes interested in a scent:

- Follow
- Call back
- Wait

Example — frightened at bridge:

- Encourage
- Wait
- Turn back

Example — discovers creek:

- Let her swim
- Keep walking
- Call her back

Example — tired during walk:

- Rest here
- Head home
- Continue

### Button requirements

Buttons should:

- be large and thumb-friendly
- contain short labels
- occupy a consistent bottom action area
- never require precision tapping
- clearly indicate disabled/unavailable states only when necessary
- disappear or change as context changes

Avoid persistent menus covering the environment.

### Direct control

The MVP should avoid virtual joysticks.

Navigation should occur through contextual choices and autonomous movement.

Possible higher-level navigation actions:

- Go for a walk
- Take Creek Trail
- Explore
- Head home

Once walking, the player responds to situations rather than steering the dog continuously.

---

## 15. User Interface

### Primary screen

The environment occupies the overwhelming majority of the viewport.

Persistent UI should be minimal.

Suggested layers:

1. **World view**
2. **Very small status/context region**
3. **Contextual action bar**
4. **Temporary event feedback**

### Action bar

Mobile layout:

```text
┌─────────────────────────────┐
│                             │
│                             │
│         WORLD VIEW          │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│ [ Follow ] [ Wait ] [ Call ]│
└─────────────────────────────┘
```

When only two actions make sense, show two.

Never pad the interface with irrelevant actions merely to maintain a fixed count.

### Information hierarchy

Prefer:

- animation
- posture
- environmental sound
- camera framing
- short contextual text

over:

- meters
- status dashboards
- inventory grids
- modal dialogs
- verbose narration

---

## 15A. Camera and Staging

*Added 2026-08-26. This section supersedes any earlier implication that the game
is staged side-on, and it is the single most important constraint on character
and environment art.*

### 15A.1 Where the player is

The player is **on the trail, a few paces behind Molly Mae**, at roughly adult
eye height, looking down the trail ahead. Portrait orientation, held in one hand.

This is not a neutral framing choice. It makes the player a *presence in the
park* rather than an observer of a diorama, and it gives the core verbs their
literal meaning:

- **Follow** means the camera goes where she goes.
- **Wait** means the camera stops and she carries on, or doesn't.
- **Call back** means she turns around and comes toward the camera.

A side-on view cannot express any of that. It shows a dog moving across a
picture; this shows a dog you are walking with.

### 15A.2 The follow camera

The camera trails her with easing, never rigidly locked. She can draw ahead,
lag, or drift to one side of frame, and the camera catches up — the small
distance between her and the centre of frame is itself information about whether
she is pulling away or hanging back.

Two motions:

- **Advance.** Walking down the trail moves the world toward the camera. The
  trail recedes ahead; near foliage passes and grows.
- **Yaw.** When she leaves the trail, the camera *turns to follow her*. The world
  pans horizontally. This is what makes an off-trail investigation feel like the
  player physically turning to watch, rather than a cut.

Yaw requires the environment to extend beyond the portrait viewport, which is
why environment plates are authored wide and cropped (§15A.4).

### 15A.3 What her orientation means

Her facing is a communication channel, and the most legible one at phone size.
It says more, faster, than any facial expression can at this scale.

| Orientation | What it means | When |
| --- | --- | --- |
| **Away** (rear view, centred) | absorbed, going somewhere, content to lead | ordinary walking |
| **Away, angled** | turning, choosing a direction, drifting toward something | approaching a junction or a scent |
| **Glancing back over her shoulder** | checking in — *the* dog gesture | before acting on something; when she expects to be recalled |
| **Facing you** | she wants something, or she is waiting on you | asking, waiting, being recalled, hesitating |
| **Side on** | her attention is off-trail, not on you | investigating a scent, watching an animal, refusing a crossing |
| **Sitting, facing you** | settled, waiting, at home | home, rest, an explicit wait |

The glance-back deserves emphasis. §9 describes a dog who checks with the player
before acting when she expects to be recalled — that behaviour already exists in
the simulation (`look_at_player`), and until now it had no visual form. In this
camera it becomes the single most readable moment in the game.

**Consequence for the expressed emotion set (§6.3).** The four portraits remain
the emotional vocabulary, but they are largely *invisible in the world view* —
from behind, there is no face. Emotion therefore reads through orientation,
posture, tail and gait first, and through the face only when she turns toward
the camera or the camera closes in. This strengthens rather than weakens §6.3's
position that fear needs no dedicated portrait.

### 15A.4 Environment authoring

Each location is a **trail corridor seen in perspective**, not a backdrop.

**Revised 2026-08-26 — layered plates are not sufficient.** Scaling a plate
toward the camera is a *zoom*, not travel: the same trees simply get bigger, and
within a few seconds it is obvious you are not going anywhere. Nothing that
reuses one fixed image can survive ten seconds of walking. The corridor is built
from three parts instead:

| Part | What it is | Motion |
| --- | --- | --- |
| **backdrop** | one wide plate: canopy, hazy distant trunks | yaws only, never advances |
| **ground** | a real 3D plane under the camera, tiling texture | scrolls — genuine forward travel |
| **scenery** | individual trunks, ferns, logs, stumps as sprites | each placed at a real (x, z), swept past and recycled |

Scenery is the load-bearing part. Every item has a position in a virtual
corridor; as the camera advances its `z` decreases, it grows by true
perspective, sweeps past and is recycled to the far end with a new kind,
position and size. Nothing repeats on a fixed period, so a walk can run
indefinitely.

One projection serves everything on the trail — scenery, Molly, and any later
encounter — so nothing can disagree about where the ground is. Depth sorting is
derived from `z`, which means a fern two metres away occludes her at two and a
half without either knowing about the other. **That occlusion is what puts her
in the park rather than on top of it**, and no amount of shadow or grading
substitutes for it.

Camera geometry is solved against one fixed point: Molly at a comfortable
following distance is about 54 px wide in a 375 px viewport with her feet around
three quarters down the frame. A true adult eye height cannot satisfy that — the
ground close to a standing adult is very low in frame — so the camera sits at
about a metre, nearer the dog's own world.

### 15A.5 What this supersedes

- The world view is no longer a side-on stage. §15's layout still holds — world
  view dominant, minimal persistent UI, contextual action bar at the bottom —
  but the world view itself is a trail ahead, not a proscenium.
- §28's rendering options still apply; the layered plates and the follow camera
  are achievable in DOM/CSS for the prototype and are the natural point at which
  Canvas becomes worthwhile.
- Character art must be specified by **orientation first**, expression second.
  The side view is now the exception rather than the default pose.

---

## 16. Visual Direction

### Resolved: naturalist field guide

**Decided 2026-08-26 by prototype (§16.3). This question is closed.**

The direction is **naturalistic illustration in the register of a field guide or a park
interpretive sign**: careful observed rendering, fine graphite-and-ink linework, visible coat
texture, accurate animal anatomy, soft directional light, restrained natural colour, on a
warm paper-toned ground. The care and specificity of a naturalist's plate — not a cartoon,
not a photograph.

This matches the approved concept art in `design/art-character.png` and
`design/art-environment.png`, which are the references of record.

#### Why, and the honest caveat

The original PRD asked for a hand-painted Japanese animated-film sensibility. That was
prototyped as a real alternative and **it is not achievable through the current asset
pipeline.**

Both candidates were generated at low and high quality from identical prompts differing only
in style text. At low quality they were visibly distinct — the painted candidate was softer,
flatter, more watercolour. At high quality **they converged into nearly the same image.**
More compute makes the model render harder, and rendering pulls toward naturalism; a style
string is not strong enough to hold it back.

The consequence matters more than the choice:

- The painted candidate's central argument — cheaper, simpler, faster to animate — is
  unavailable here. That was the real case for it, and the tooling does not support it.
- Naturalism is therefore partly a **default**, not purely a merit win. It is what this
  pipeline produces when asked for careful illustration.

The design case for naturalism is still genuine and independently sound:

- The game's subject is *observation*. The player watches an animal and infers intent.
  Detailed rendering rewards looking; a simplified style would quietly signal there is less
  to see.
- Species-level specificity — sword fern, pileated woodpecker, old-growth bark — makes the
  scent and perception layer (§11) feel like it describes real things.
- Molly Mae renders with enough fidelity that ear position, beard, tail and eye direction
  read as separate signals. In a game with no meters, that is the entire communication
  budget.

**Revisit this if** animation cost becomes the binding constraint, or if a human illustrator
joins the project. A genuine painted direction remains viable — it just needs a purpose-built
style anchor or a person, not a prompt.

#### Binding constraints, whatever else changes

- rich but restrained natural colours, sampled from the approved palettes in §16.1
- soft atmospheric depth; shafts of light through canopy as a primary mood tool
- strong changes in lighting across weather and time
- subtle environmental movement
- Molly Mae is a straight-coat copper labradoodle, on-model per §6.0
- she wears no collar, harness or tags — matching the character sheet
- the four expressed emotion states of §6.3, and no more
- **every asset is specified by orientation first (§15A.3)**; environments are
  trail corridors in perspective, authored as layered plates (§15A.4)

**Deliberate exception.** Dog-perception treatment (§16.4) may leave naturalism, because
scent has no naturalistic appearance. It should read as something added to an otherwise
observed world.

### 16.1 Approved palettes

Sampled directly from the concept sheets. These are the authoritative values in both
candidate styles.

From `design/art-environment.png`:

| Token | Name | Hex |
| --- | --- | --- |
| `--deep-forest-green` | Deep Forest Green | `#2C3927` |
| `--fern-green` | Fern Green | `#4B563A` |
| `--mossy-olive` | Mossy Olive | `#6E6436` |
| `--cedar-brown` | Cedar Brown | `#6D5338` |
| `--bark-gray` | Bark Gray | `#747165` |
| `--wet-earth` | Wet Earth | `#4E402F` |
| `--stone-gray` | Stone Gray | `#928A7E` |
| `--mist-light` | Mist Light | `#D6CBBA` |
| `--sunlit-green` | Sunlit Green | `#C4B487` |

From `design/art-character.png`, for Molly Mae herself:

| Token | Role | Hex |
| --- | --- | --- |
| `--molly-rust` | deepest coat, shadowed flank | `#7C4019` |
| `--molly-copper` | primary coat | `#925624` |
| `--molly-coat-mid` | coat midtone | `#B47A44` |
| `--molly-coat-light` | sunlit coat edge | `#CCA477` |
| `--molly-cream` | chest, paws, pale beard | `#DAD0C2` |
| `--molly-warm-gray` | muzzle gray, soft shadow | `#9C8C7A` |
| `--molly-dark` | nose, pupil, deepest accent | `#4A3D32` |

Ground / paper tone, common to both sheets: `#F0E9DF` (character) and `#F1E8D7`
(environment). Use `--paper: #F0E9DF` as the canonical UI ground.

The two palettes are near-complementary — Molly Mae's copper against the park's greens —
which means she stays findable in a busy frame without any outline, marker, or HUD
indicator. Preserve that separation when adding assets, in whichever style wins.

### 16.2 Ambient movement

The forest should feel alive even when nothing mechanically important is happening.

Examples of ambient movement:

- ferns settling after the dog passes
- cedar branches moving in wind
- insects hovering above puddles
- drifting mist
- water movement
- distant birds
- changing shafts of light

### 16.3 Style prototype (bake-off) — completed

Run on 2026-08-26. Six assets per candidate — the four expressed portraits plus a walking
side view and a sitting view — generated from identical prompts at both low and high quality
and compared in `bakeoff.html` at phone size, with labels hidden, and composited over park
backdrops.

Outcome: **Candidate A (naturalist) adopted**; see the decision above for the reasoning and
the convergence caveat.

Findings worth keeping, because they will recur on every future asset:

1. **Ears drift upright.** Any pose language that lets an ear "lift" produces pricked
   terrier ears and an off-model dog. The prompt must state that ears hang down in every
   frame, without exception, *including when alert*.
2. **`alert` collapses into `neutral`** unless posture carries it. Both are closed-mouth and
   forward-facing. The fix is the one §6.3 prescribes — a craned neck and an off-frame stare,
   not a new face. This is the practical proof that the four-state set can express fear.
3. **The model adds accessories it was not asked for.** A collar and tag appeared
   unprompted. Prompts must explicitly forbid them.
4. **Findability is confirmed.** Composited over all three park backdrops, Molly reads
   clearly with no outline or marker, validating the near-complementary palette note in
   §16.1.

`bakeoff.html` is retained as the record of this decision.

**Superseded by §15A.** The bake-off produced a side-on walk, a front-facing sit
and four front portraits. Under the follow camera these are reference art and a
partial asset set, not the shipping set: the side view is now the *off-trail
exception*, the front-facing sit still serves, and the portraits apply only when
she turns toward the camera or the camera closes in. The orientation set in
§15A.3 is the real specification.

### 16.4 Dog perception treatment

Important scents or memories may occasionally be represented through subtle painterly traces, particles, distortions, or transient shapes.

These should feel integrated into the art rather than like HUD markers.

---

## 17. Audio Direction

Audio is important to making a relatively small park feel large.

Use:

- running water
- wind
- ravens
- insects
- distant wildlife
- footfalls
- panting
- tags/collar
- dog vocalizations
- rain
- branches
- distant human activity

Avoid constant music.

Music should be sparse and primarily emphasize emotional or transitional moments.

---

## 18. Time Model

The simulation operates continuously while the game is active.

Because mobile browsers may suspend background tabs, the game should not depend on continuous JavaScript execution while inactive.

On save, store:

```text
lastSimulationTimestamp
```

On resume:

1. calculate elapsed real time
2. apply bounded deterministic state changes
3. resolve sleep / hunger / recovery changes
4. generate at most a small number of meaningful elapsed-time events
5. continue simulation

The player should never return after several hours to discover catastrophic consequences caused by browser suspension.

The game is about companionship, not punishment for absence.

---

## 19. Technical Architecture

```text
┌──────────────────────────────┐
│        GitHub Pages          │
│                              │
│ HTML / CSS / Vanilla JS      │
│                              │
│ World simulation             │
│ Dog utility AI               │
│ Memory store                 │
│ Rendering                    │
│ Interaction                  │
│ Persistence                  │
└──────────────┬───────────────┘
               │ HTTPS JSON
               ▼
┌──────────────────────────────┐
│      Cloudflare Worker       │
│                              │
│ Request validation           │
│ Prompt construction          │
│ Rate limiting / abuse guard  │
│ OpenAI API key               │
│ Response validation          │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│          OpenAI API          │
│                              │
│ High-level dog reasoning     │
│ Memory consolidation         │
│ Novel situation handling     │
└──────────────────────────────┘
```

The OpenAI API key must exist only in the Worker environment and must never be shipped to the browser.

---

## 20. Client Architecture

Suggested source structure:

```text
/
├── index.html
├── css/
│   └── app.css
├── js/
│   ├── app.js
│   ├── state.js
│   ├── simulation.js
│   ├── dog/
│   │   ├── dog.js
│   │   ├── needs.js
│   │   ├── utility.js
│   │   ├── behavior.js
│   │   ├── perception.js
│   │   ├── learning.js
│   │   └── memory.js
│   ├── world/
│   │   ├── world.js
│   │   ├── places.js
│   │   ├── scents.js
│   │   └── encounters.js
│   ├── ui/
│   │   ├── render.js
│   │   ├── actions.js
│   │   └── input.js
│   ├── ai/
│   │   ├── client.js
│   │   └── schemas.js
│   └── storage.js
└── assets/
```

Use ES modules.

No build step is required.

---

## 21. State Management

Use one explicit application state tree.

Conceptually:

```json
{
  "game": {},
  "dog": {
    "traits": {},
    "needs": {},
    "drives": {},
    "emotion": {},
    "learned": {},
    "memory": {}
  },
  "world": {
    "time": {},
    "weather": {},
    "currentPlace": null,
    "entities": {},
    "scents": {}
  },
  "playerModel": {},
  "interaction": {
    "context": null,
    "actions": []
  }
}
```

Use pure reducer-style state transitions where practical:

```js
nextState = reduce(state, event)
```

This makes autonomous behavior reproducible, testable, saveable, and easier to debug.

---

## 22. Persistence

Use native browser storage.

### MVP recommendation

Use **IndexedDB** rather than `localStorage` as the authoritative save store because the game may accumulate:

- event history
- memories
- world state
- settings
- discovered places

No library is required.

`localStorage` may be used for very small preferences if convenient.

### Save strategy

Persist after:

- meaningful player action
- significant dog event
- location transition
- AI memory update
- periodic checkpoint
- page visibility change

Maintain a save schema version for future migrations.

---

## 23. AI Service

The browser calls a Cloudflare Worker endpoint such as:

```text
POST /dog/decide
POST /dog/consolidate-memory
```

The Worker:

1. validates the request
2. removes fields the model does not need
3. adds controlled developer instructions
4. calls the OpenAI Responses API
5. requests structured JSON output
6. validates the model result
7. returns only game-safe structured data

Use Structured Outputs / JSON Schema rather than relying on free-form JSON when supported by the selected model.

The model name should be a Worker environment/config value rather than hard-coded into the client.

### Example request

```json
{
  "dog": {
    "traits": {},
    "needs": {},
    "drives": {},
    "emotion": {}
  },
  "situation": {
    "place": "old_bridge",
    "nearbyStimuli": [],
    "candidateBehaviors": [
      "cross_bridge",
      "wait",
      "retreat",
      "look_at_player"
    ]
  },
  "relevantMemories": []
}
```

### Example response

```json
{
  "behavior": "look_at_player",
  "target": null,
  "intensity": 0.7,
  "signals": [
    "hesitate",
    "ears_back"
  ],
  "memoryEffects": []
}
```

Only server-approved schema fields reach the client.

---

## 24. AI Call Policy

Do **not** call the model:

- every frame
- every simulation tick
- for routine locomotion
- for obvious need satisfaction
- for every sniff
- for ordinary action selection

Call it at meaningful cognitive boundaries.

Target examples:

- first encounter with an unfamiliar phenomenon
- conflicting motivations
- major emotional event
- occasional strategic behavior selection
- relationship update
- memory consolidation

This minimizes:

- latency
- cost
- dependency on network quality
- behavioral inconsistency

and makes the AI feel more purposeful.

---

## 25. AI Failure Behavior

The game must degrade gracefully.

If an AI request:

- fails
- times out
- is rate limited
- returns invalid data
- is refused

then:

1. discard the response
2. choose behavior through local utility AI
3. continue the simulation
4. retry only at a later appropriate decision point

Never block the main game loop while waiting for AI.

---

## 26. Cloudflare Worker Requirements

The Worker must provide:

- OpenAI API key isolation
- CORS restricted to approved origins
- request schema validation
- response schema validation
- payload size limits
- per-client rate limiting
- abuse protection
- timeout handling
- retry/backoff only where appropriate
- logging without storing unnecessary player content

GitHub Pages must never contain an OpenAI credential.

---

## 27. Dependencies

### MVP decision: no client-side libraries

The game does not currently justify a runtime framework.

Vanilla browser APIs cover:

- ES modules
- DOM UI
- pointer/touch interaction
- fetch
- IndexedDB
- Web Audio
- Canvas
- CSS animation
- requestAnimationFrame
- local persistence

A framework would add more architecture than value at the current scope.

### Potential future dependency cases

A library should be introduced only if a concrete subsystem proves expensive to implement correctly.

Candidates might eventually include:

- a rendering engine if Canvas scene complexity becomes substantial
- spatial audio tooling if Web Audio management becomes unusually complex
- a small IndexedDB wrapper if persistence code becomes distracting

These are not MVP requirements.

---

## 28. Rendering Strategy

Two viable MVP approaches:

### Option A — DOM/CSS scenes

Best for an early interaction prototype.

Advantages:

- fastest to build
- easy responsive layout
- trivial contextual UI
- easy animation of a small number of elements

### Option B — Canvas world + DOM UI

Recommended once free movement and environmental animation become important.

Use:

- `<canvas>` for world rendering
- ordinary DOM for action buttons and textual UI

This keeps the UI accessible and simple while allowing a richer animated scene.

The first playable prototype can begin with Option A and migrate the world layer to Canvas without changing the simulation architecture.

### Under the follow camera (§15A)

The layered plates and the follow camera are both achievable in Option A —
three absolutely positioned images per location, transformed together, is
ordinary CSS. That is the right way to prove the framing.

Option B becomes worthwhile at the point where the camera needs to advance
*continuously* along a trail rather than crossfade between segments, or where
foliage must respond to her passing (§16.2). Neither is required to validate the
staging.

---

## 29. Mobile Requirements

Design target:

- portrait-first
- one-handed operation where possible
- minimum 44×44 CSS pixel touch targets
- no hover-dependent interaction
- no keyboard required
- no drag precision required
- safe-area support
- responsive to common phone aspect ratios
- fast initial load
- modest memory usage

Landscape support is desirable but secondary for MVP.

---

## 30. Accessibility

Initial requirements:

- sufficient UI contrast
- text labels on all player actions
- reduced-motion option
- sound-independent communication of important events
- color must not be the sole information carrier
- scalable text without destroying action layout

Future possibility:

- optional explicit "dog cues" accessibility mode that makes behavioral signals easier to interpret

---

## 31. MVP Scope

The MVP should prove one question:

> **Can a player form a mental model of an autonomous dog from its behavior and become attached to its particular personality?**

### MVP world

Three connected locations, drawn from the environment concept sheet:

1. **Home** — the house at the park edge. Care actions, food and water bowls, the door, the
   leash. Where a session starts and ends.
2. **Cedar Trail** — packed-earth trail through old growth, opening onto the signposted
   trail junction with its bench. Deer scent, squirrels, sword fern, the fallen log. This is
   where the §32 scenario's antler discovery happens.
3. **Creek and Boardwalk** — the elevated cedar boardwalk and the shallow creek it crosses.
   Water, frogs, the plank surface, and the boardwalk crossing that serves as the game's
   fear-and-confidence set piece.

The trail junction signpost visibly names North Trail, Twin Falls, and Beach Trail. None are
walkable in MVP. They exist so the world has edges that imply more world.

### MVP dog systems

- hunger
- thirst
- fatigue
- exercise
- curiosity
- confidence
- attachment
- play drive
- fixed personality traits
- simple emotional state
- utility-based behavior selection
- place memory
- stimulus associations
- basic player model

### MVP stimuli

At minimum:

- water
- squirrel
- deer scent
- another dog scent
- unfamiliar noise
- stick
- bridge
- food
- player call

### MVP care actions

- feed
- water
- sleep
- play
- walk
- treat
- comfort

### MVP contextual actions

Examples:

- Follow
- Wait
- Call back
- Encourage
- Turn back
- Let her explore
- Offer treat
- Head home

### MVP AI features

Use the LLM for only:

- novel/conflicting behavior decisions
- important memory interpretation
- periodic player-model updates

Everything else runs locally.

---

## 32. MVP Scenario Test

A successful vertical slice should support this sequence:

1. Player feeds the dog.
2. Player starts a walk.
3. Dog travels autonomously along Cedar Trail.
4. Dog encounters a deer scent.
5. Context actions appear:
   - Follow
   - Wait
   - Call back
6. Player follows.
7. Dog leaves the trail and discovers an antler.
8. Dog gains a positive association with the location.
9. Player returns home.
10. On a later walk, the dog reaches the same junction.
11. Without explicit prompting, it shows interest in returning toward the antler location.
12. The player can recognize the behavior as memory-driven.

If this interaction feels convincing, the central design is working.

---

## 33. Non-Goals for MVP

Do not initially build:

- open-world procedural terrain
- multiplayer
- player accounts
- cloud saves
- breeding
- multiple player-owned dogs
- complex inventories
- crafting
- survival mechanics
- combat
- detailed veterinary simulation
- voice recognition
- arbitrary natural-language player commands
- continuous LLM control
- hundreds of locations
- elaborate quest systems

---

## 34. Metrics for Internal Evaluation

Useful playtest questions are more important than conventional engagement analytics at this stage.

After playing, ask:

- Can the player describe the dog's personality?
- Can the player predict some of its behavior?
- Has the dog ever surprised the player in a way that still felt plausible?
- Can the player name places the dog likes or dislikes?
- Does the player remember why those associations formed?
- Does the dog appear to remember previous interactions?
- Does the player alter behavior because they understand the dog better?
- Does the player feel that the dog has learned something about them?
- Do AI-driven behaviors feel continuous with locally simulated behaviors?

The strongest success signal:

> Players spontaneously tell stories about "what my dog does."

---

## 35. Development Phases

### Phase 0 — Style bake-off ✅ complete (2026-08-26)

Both candidate sprite sets were produced and compared in `bakeoff.html`. **Naturalist field
guide adopted** (§16). The winning six assets are in `assets/molly/` and seed the real asset
library; `assets/naturalist/` and `assets/painted/` are retained as the decision record.

Asset pipeline lives in `art/` — one `art.json` per style, driving the spriteforge scripts.
`art/naturalist/art.json` is now the live config for all new Molly Mae art.

### Phase 1 — Simulation prototype ✅ complete (2026-08-26)

No LLM. All implemented and running:

- state tree with pure reducer transitions (`js/state.js`)
- needs and drives (`js/dog/needs.js`)
- utility behaviour selection with a full decision trace (`js/dog/utility.js`)
- three locations and their spots (`js/world/places.js`)
- contextual actions, 3–5, context-derived (`js/ui/actions.js`)
- place / event / stimulus memory with decay and consolidation (`js/dog/memory.js`)
- the dog's model of the player (`js/dog/learning.js`)
- IndexedDB save/load with schema versioning (`js/storage.js`)
- the dog inspector (`js/ui/debug.js`)

Visuals use the Phase 0 sprite set over placeholder backdrops cropped from the
concept art. Home has no art of its own yet.

**Both headline scenarios are covered by automated tests** (`./test/run.sh`,
12 seeds): the §32 memory scenario and the §3 crossing arc. They assert causal
links rather than fixed outcomes — discovery is uncertain by design, so the
test requires that a memory-driven pull appears *if and only if* something
actually happened there.

#### Model corrections found by those tests

Recorded because each is a trap that is easy to reintroduce:

- **Fear must not compound.** Retreat records no memory; the startle is the
  memory. When retreat wrote a negative event, repeated retreats consolidated
  into a stronger `frightening` association and fear outran any encouragement.
- **A successful crossing must outweigh a fright**, or patient play cannot win.
  Frights also taper as a place becomes safe and familiar.
- **`head_home` is not autonomously selectable.** A frightened dog ending the
  walk on her own violates §2.1 and strands the boardwalk arc.
- **Crossing is repeatable**; `hasCrossed` only records the first success.
- **She must be able to navigate to what she needs**, or a fed dog never
  reaches her bowl and a walk never progresses.

### Phase 2 — Relationship prototype

Add:

- player behavior tracking
- reinforcement
- learned associations
- dog-to-player expectation model
- recurring locations and stimuli

Prove that behavior changes over repeated sessions.

### Phase 3 — Neural layer

Add Cloudflare Worker and OpenAI integration.

Use the model only for carefully selected decision points.

Compare AI-assisted behavior against the local-only baseline.

### Phase 4 — Visual vertical slice

Phase 0 style decision is done; this is unblocked.

Add:

- environment assets in the chosen style
- expressive dog animation
- scent visualization
- environmental motion
- soundscape

### Phase 5 — Content expansion

Add:

- more park areas
- weather
- wildlife
- recurring dogs/humans
- additional memories
- richer dog development
- life stages

---

## 36. Major Design Risks

### Risk: dog appears random

**Mitigation:** Every behavior should be explainable from current drives, personality, environment, or memory. Maintain internal decision traces for debugging.

### Risk: LLM behavior feels disconnected

**Mitigation:** Restrict the model to selecting from valid world entities and available behaviors. Feed compact structured state rather than broad narrative prompts.

### Risk: virtual-pet chores dominate

**Mitigation:** Needs create behavioral context but should decay slowly enough that exploration remains the primary experience.

### Risk: player cannot understand dog

**Mitigation:** Use clear body language and repeated behavioral motifs. Mystery is desirable; inscrutability is not.

### Risk: player completely understands dog

**Mitigation:** Preserve stochasticity, novel environmental combinations, changing needs, memory effects, and occasional high-level AI decisions.

### Risk: AI latency breaks pacing

**Mitigation:** Never block animation or simulation on an AI call. Local utility AI always provides a fallback.

### Risk: API cost grows with playtime

**Mitigation:** Trigger AI at cognitive events rather than on time intervals. Keep context structured, compact, and retrieval-based.

---

## 37. Debugging Requirements

Development builds should have an optional dog-inspector panel that is never shown in the normal player experience.

It should expose:

- needs
- drives
- traits
- active stimuli
- candidate behaviors
- behavior utility scores
- selected behavior
- relevant memories
- player-model values
- latest AI request
- latest AI response
- reason for local fallback

A deterministic random seed should be available for reproducing simulation bugs.

The inspector is essential because the shipped design deliberately hides most of this information from the player.

---

## 38. Open Questions

Questions to resolve through prototyping rather than upfront specification:

- How frequently should meaningful decisions occur?
- How long should an average walk last?
- Does game time match real time?
- How much movement should be animated continuously versus represented through scene transitions?
- Should the dog visibly age?
- How explicit should scent visualization be?
- Is four expressed emotion states enough, or does fear eventually need its own portrait?
  (§6.3 says solve it with posture first.)
- How much authored narrative should exist alongside emergent events?
- Should recurring human and animal characters also have persistent models?
- How much can weather alter scent and behavior?
- How far can the camera yaw off-trail before the environment plates run out,
  and does an off-trail investigation need its own framing rather than a pan?
- Does advancing along a trail read better as crossfaded segments or as
  continuous motion — and does the answer force Canvas (§28)?
- How often should she glance back? It is the most legible gesture available
  (§15A.3), which makes it both valuable and easy to overuse.
- Should commands such as recall be guaranteed actions, trained abilities, or probabilistic behaviors?

### Closed since the last revision

- ~~Should the player name the dog?~~ **No.** She is Molly Mae, a fixed character (§6.0).
- ~~Should the dog begin as a puppy or young adult?~~ **Young adult**, matching the concept
  art. Life stages (§13) remain a post-MVP system.
- ~~What park is this?~~ **Pacific Spirit Regional Park**, Vancouver (§10).
- ~~Which visual style?~~ **Naturalist field guide** (§16), decided 2026-08-26 by prototype.
  The hand-painted alternative proved unreachable through the current pipeline; see the
  caveat in §16, which is worth reading before anyone reopens this.

---

## 39. Product North Star

Mighty Miss Molly Mae is successful when a player stops thinking in terms of hidden game variables and starts thinking in terms of the animal:

> She wants to go down there because she smelled deer here last time.

> She's looking at me because she knows I usually call her back at the creek.

> She doesn't like this bridge.

> She's tired. We should go home.

At that point, the simulation has become a relationship.
