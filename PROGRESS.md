# DON'T BURN YOUR FEET — progress & backlog

Working document. [DESIGN.md](DESIGN.md) is the vision; this is the state of play
and what's left. Keep it current when things land.

---

## Where we are

**v2.2** — playable end to end. Third-person runner, endless escalating beaches,
permanent roguelike builds, a living bird flock, arcade scoring.

### Built and working
| System | State |
|---|---|
| Third-person toon runner | feet visibly cook tan → red → glowing, steam and smoke |
| Heat field | discrete lava puddles on mostly-cool sand; density scales per level *and* per difficulty |
| Core verbs | run, sprint (stamina), hop (swaps lead foot, no burn mid-air), Shift+Space leap (~11m), **Scout** (hold Q) |
| Beaches | 504m, ~2.5 min at a real pace, 3 checkpoint cabanas splitting it into 4 legs |
| SOLE TRAIN | combo for chaining fresh refuges without cooking a foot |
| Goals (6) | ice cream truck, flip-flops, beach shower, umbrella camp, tide pools, rare **seal nursery** — each with its own model and audio beacon |
| Weather (6) | clear, high noon, marine layer, golden hour, low tide, drizzle |
| Events (4) | cloud shade to chase, whale-breach wave surge, sun focus ring, sneaker wave |
| Items (21) | permanent for the run, 3 FIFO slots, F to swap into a full build, 8 actives on [E], 8 synergies, 3 cursed, **6-7** instant invincibility |
| Birds | gulls wheel overhead in a growing mob → peel off into telegraphed dives → **steal an item you can chase down**; Heermann's thief, plover broken-wing con, vulture, falcon lock-on, bald eagle |
| Arcade | Hall of Soles, 3-initial entry, podiatrist report card, 4 difficulties |
| Audio | soft master bus, volume slider, M to mute, persisted |

### Tooling worth remembering
- `serve.py` accepts **POST /_shot** — the page posts a canvas dataURL, it lands in
  `_shots/*.jpg`. The only way to actually *see* renders when the browser pane
  won't composite.
- `DBYF.step(dt, visual=false)` runs headless sim ticks — used for bot balance runs.
- `DBYF.heatProbe(x,z)` samples the effective heat field.
- **Never tune difficulty against perfect-routing bots.** They made it far too hard
  for a human. Model a sloppy player: limited lookahead, reaction delay, imperfect steering.

---

## A. Feel & polish — **doing this first**

The foundation everything else is experienced through. Adding content on top of
mediocre movement just produces more mediocre-feeling content.

- [ ] **A1. Movement feel pass**
  - acceleration / deceleration curves (movement is currently instant velocity)
  - momentum preservation and a skid when you hard-turn at speed
  - coyote time on refuge edges
  - jump buffering (press just before landing → it still fires)
  - landing impact: squash scaled to fall speed, camera kick, dust
  - air control (reduced but present)
  - camera: spring lag, FOV widen with speed
  - step-up onto low refuges instead of clipping
- [ ] **A2. Physical comedy** — the design bible's "the comedy is in the physicality"
  - stumble on a bad landing, faceplant, flailing recovery
  - trip over sanderlings
  - drop an item when a bird connects
  - the sandal that flies off and sails away
  - crab-pinch hop, the wedding-photo cringe
- [ ] **A3. Juice** — hit-stop on impacts, richer particles, a real death animation

## B. Content gaps from the design bible

### Birds still missing
- [ ] **Willets / Godwits** — flush and shriek if you sprint through them; spikes attention
- [ ] **Least Terns** — precision aerial harassment forcing zigzags
- [ ] **Brown Pelican squadrons** — formation flyby, moving wall, traveling shadow lure

### Weather still missing
- [ ] **Wind** — prankster; blows refuges (and the umbrella goal) around
- [ ] **The Humidity** — invisible oppression bar, "It's Not the Heat, It's..."
- [ ] **Dust Devil** — a five-year-old tornado carrying items around; chase it to shop

### Background events — biggest content hole
Built: cloud shade, whale wave, sun focus, sneaker wave.
- [ ] **Dolphin escort** — ⚠️ *regression: existed in v0.3, lost in the v1 rebuild*
- [ ] Sea lion pile (bark-wave knockback, tiptoe zone)
- [ ] Sandcastle Kingdom (cool packed paths; topple one → guilt debuff)
- [ ] Kite Guy (crashed kite = temporary refuge, ride it as he reels it in)
- [ ] Grunion run (every bird leaves; the shore is yours)
- [ ] Beach wedding (Wedding Crasher debuff, paparazzi whiteout)
- [ ] Metal Detector Man (a walking loot forecast)
- [ ] Surf school parade, volleyball cartoon physics
- [ ] Low tide reveal (greed timer), seagull civil war, fisherman's backcast

### Systems never started
- [ ] **The Wash Prophet** — one weird pelican per beach, never attacks; stand near
      3s for a cryptic hint that's 50/50 real intel vs. pelican nonsense, never labelled.
      Captain's pipe upgrades him to 75/25.
- [ ] **Pirate's Treasure** — half-buried chest off the optimal path →
      doubloons (score, heavy), pirate boots, cursed compass (points through the
      *worst* route), an enormous angry crab, and map fragments ×3 →
      **Treasure Island** bonus level (all rock, no lava, pure platforming, one heron-equivalent)

### Items — 21 of ~40 built
⚠️ **Regressions — existed in v1, dropped in the v2 item rewrite:**
- [ ] sunscreen · [ ] half-melted popsicle · [ ] pizza slice

Never built:
- [ ] single flip-flop (random foot!) · [ ] left boot (never a right) · [ ] styrofoam lid (squeak aggro)
- [ ] binoculars · [ ] beach leftovers · [ ] **shorts** (grants a 4th slot, paradox unexplained)
- [ ] surf wax · [ ] lost GoPro (picture-in-picture intel) · [ ] somebody's car keys (rerolls the goal)
- [ ] rusty lantern (identifies mystic items pre-pickup) · [ ] old captain's pipe (maritime narration)
- [ ] soggy paperback (score for refuge downtime) · [ ] old boat board

## C. Structure & replay

- [ ] **C1. Hand-authored set-piece chunks** stitched procedurally instead of pure
      noise — driftwood boardwalk over a lava lake, sandcastle maze, the pier,
      a crowded towel-hopping stretch. This is what would make beaches *memorable*
      rather than merely different, and it's the highest-value item in C.
- [ ] **C2. Sun pressure** — the whole beach heats as the level runs, so dawdling
      always loses and cutting a corner through lava becomes a real decision
- [ ] **C3. Daily seed** + shareable beach codes ("beach #48213 nearly killed me")
- [ ] **C4. Ultra level-256 kill screen** — all parking lot, no sand, the Sun fills half the sky
- [ ] **C5. Attract mode ghost runner** burning to death under the score table
- [ ] **C6. Boardwalk stairs** goal (the asphalt gauntlet) — the 7th goal, designed but unbuilt

---

## Deferred by Jeff (revisit later)
- Toe-dig (cut: slows gameplay)
- Dignity currency
- Zinc-oxide war paint cosmetics

## Open questions
- Does the wheeling gull mob read from the default camera angle, or does it need a
  HUD cue / lower altitude?
- Is 504m / ~2.5 min the right beach length once movement feels better?
