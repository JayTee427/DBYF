# DON'T BURN YOUR FEET — progress & backlog

Working document. [DESIGN.md](DESIGN.md) is the vision; this is the state of play
and what's left. Keep it current when things land.

---

## Where we are

**v2.9** — **section B complete**. Playable end to end. Third-person runner, endless escalating beaches,
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
| Weather (8) | clear, high noon, marine layer, golden hour, low tide, drizzle, **the wind**, **the humidity** |
| Events (15) | cloud shade, whale wave, sun focus, sneaker wave, dolphin escort, sea lion pile, Sandcastle Kingdom, Kite Guy, grunion run, beach wedding, Metal Detector Man, volleyball, low tide reveal, seagull civil war, fisherman's backcast |
| Items (31) | permanent for the run, 3 slots (4 with shorts), auto-pickup with the ejected item dropping on the sand, 10 actives on [E], 8 synergies, cursed items, single-shoe items that protect one foot, **6-7** instant invincibility |
| Birds (9) | gulls wheel overhead in a growing mob → peel off into telegraphed dives → **steal an item you can chase down**; Heermann's thief, plover broken-wing con, willet tripwires, least terns, pelican squadrons, vulture, falcon lock-on, bald eagle, and the Wash Prophet |
| Arcade | Hall of Soles **persisted to `scores.json`**, 3-initial entry, podiatrist report card, 4 difficulties |
| Audio | soft master bus, volume slider, M to mute, persisted |

### Tooling worth remembering
- `serve.py` accepts **POST /_shot** — the page posts a canvas dataURL, it lands in
  `_shots/*.jpg`. The only way to actually *see* renders when the browser pane
  won't composite.
- **Scores**: the client READS `scores.json` as a plain static file, so it works
  identically locally and on **Vercel**. It merges that with a localStorage mirror, so
  nothing is lost either way. Writing back (POST `/_scores`) only works against the
  local Python server — to publish scores to everyone on the deploy, commit
  `scores.json`. Keeps the last 100; the attract board scrolls 12 at a time.
- **Deployment is Vercel**, auto-tracking GitHub commits. `vercel.json` sets
  no-cache headers on `index.html`, `js/*` and `scores.json` so a push is live
  immediately rather than serving a stale bundle.
- `DBYF.step(dt, visual=false)` runs headless sim ticks — used for bot balance runs.
- `DBYF.heatProbe(x,z)` samples the effective heat field.
- **Never tune difficulty against perfect-routing bots.** They made it far too hard
  for a human. Model a sloppy player: limited lookahead, reaction delay, imperfect steering.

---

## A. Feel & polish — **doing this first**

The foundation everything else is experienced through. Adding content on top of
mediocre movement just produces more mediocre-feeling content.

- [x] **A1. Movement feel pass** — *done in v2.3*
  - [x] real acceleration (54 ground / 16 air) and friction instead of instant velocity —
        speed ramps 0 → 10.4 over ~0.2s and coasts down over ~0.4s
  - [x] momentum preservation + **skid** on hard reverse: grip breaks for ~0.35s, so a
        180° at speed carries you through at 6.5 m/s instead of scrubbing to 1.8
  - [x] coyote time (0.13s) on refuge edges
  - [x] landing impact scaled to fall speed — squash 0.93→0.58, camera kick 0.22→0.93,
        dust count/spread scale with it, hard landings scrub 22% speed
  - [x] reduced air control, panic-state grip loss at BURNING+
  - [x] camera: speed widens FOV 61→69 and pushes back, softer spring, kick on landing
  - [ ] jump buffering (press just before landing → it still fires) — *not done, hold-to-hop
        makes it mostly moot; revisit if it feels bad*
  - [ ] step-up onto low refuges instead of clipping — *not done; the y-damp hides it for now*
- [x] **A2. Physical comedy** — *done in v2.4*
  - [x] two-tier **trip system**: `stumble` (0.62s windmilling recovery, control cut to
        35%, can't jump) and `faceplant` (1.5s — slam down, legs kicking, push back up)
  - [x] triggers: hard landing (>0.86 impact → faceplant, >0.55 at speed → stumble),
        tripping over sanderlings at a sprint, full-speed belly flop into the shore break,
        gull peck → stumble, falcon hit → faceplant, towel crab launches you into the air
  - [x] **faceplanting into lava sand costs extra health** and gets its own scream
        ("MY FACE! MY FACE!") — going down face-first on a hot beach should hurt more
  - [x] faceplants shake an item loose 70% of the time; it tumbles onto the sand as a
        real pickup you can go back and grab
  - [x] **the sandal that sails away** — ~15% chance on a leap, lands 11m off, retrievable
  - [x] report card tracks Undignified stumbles / Full faceplants
  - [ ] wedding-photo cringe — blocked on the beach wedding event (see B)
- [x] **A3. Juice** — *done in v2.5*
  - [x] **hit-stop** — the world drops to 12% speed briefly on real impacts, scaled by
        force, so a falcon hit reads as force instead of a number changing
  - [x] **real death sequence** — you collapse face-first, the world hitches, the screen
        flashes, smoke pours off you and the camera pulls back for ~2.2s before the
        report card. `S.mode` gains a `dying` state.
  - [x] screen flash helper, heavier death particles
- [x] **Pickup bug (reported)** — with a full 3-item build, items silently refused to be
      collected because they required a hidden **F** press. Now matches the original
      design: **always auto-pickup, FIFO rotates**, and the ejected item *drops on the
      sand* (2s cooldown) instead of vanishing, so nothing is ever lost by accident.
      An approach warning shows what a pickup will displace. Item flow went from
      8 → 31 collected across two beaches.

## B. Content gaps from the design bible

### Birds still missing
- [x] **Willets / Godwits** — *v2.6*: groups doze on the open sand probing for food; sprint
      within 6m and the whole group explodes upward screaming, +26 attention
- [x] **Least Terns** *(v2.8)* — tight darting circles right around your head that shove
      you off your line for ~18s. Level 5+ at high attention.
- [x] **Brown Pelican squadrons** *(v2.8)* — a line of five in formation, gliding then
      one lazy beat; the leader drags a cool shadow you can ride, and running into one
      knocks you flat. Level 4+.

### Weather
- [x] **THE WIND** *(v2.8)* — gusts physically shove you sideways on a per-level wind
      direction, with sand streaming past. Lean against it.
- [x] **THE HUMIDITY** *(v2.8)* — no visible weather at all; everything just cools 45%
      worse. Refuges, shade and the sea all underperform. It's not the heat.
- [x] **Dust Devil** *(v2.9)* — a giddy little tornado wandering the beach carrying
      somebody's things. Get close and it hands them over; get closer and it spins you.

### Background events
Built: cloud shade, whale wave, sun focus, sneaker wave.
- [x] **Dolphin escort** *(v2.6, regression restored)* — a pod paces you offshore for
      ~26s, +6% speed, and they peel away embarrassed if you catch fire
- [x] **Sea lion pile** *(v2.6)* — a heap asleep in the way. Sprint near and the whole
      pile goes off, barking, and knocks you flat. Tiptoe past instead for +250.
- [x] **Sandcastle Kingdom** *(v2.6)* — packed damp sand around the towers is a genuine
      cool road; clip a castle and it collapses, with guilt slowing you 22% for 6s
- [x] **Kite Guy** *(v2.6)* — a crashed kite is a cool patch to stand on, until he
      starts reeling it back in and it slides away from you
- [x] **Grunion run** *(v2.6)* — every bird leaves for 22s, attention pinned at zero
- [x] **Beach wedding** *(v2.6)* — cross the seating and you're Wedding Crasher: guilt,
      plus the photographer's flash whiting out your screen for 8s
- [x] **Metal Detector Man** *(v2.8)* — paces the beach sweeping, headphones on,
      oblivious; digs up to 4 times and each dig drops real loot where he stops
- [x] **Volleyball** *(v2.8)* — a loose ball. Sprint into it and you go feet-up in a
      full faceplant; touch it gently and you punt it back for +300 and the gulls
      briefly respect you
- [x] **Low tide reveal** *(v2.8)* — the sea walks way out for 15s exposing a cool flat,
      then comes back
- [x] **Seagull civil war** *(v2.8)* — they turn on each other for 14s and attention
      drains hard; walk straight through the middle of it
- [x] **Fisherman's backcast** *(v2.8)* — stand near him when he casts and you get
      hooked, dragged and apologised to
- [x] **Surf school parade** *(v2.9)* — a wobbling line of beginners shuffling down to
      the water. The instructor's whistle spikes attention, and somebody drops a foam
      board that becomes a refuge.

### Systems
- [x] **The Wash Prophet** *(v2.6)* — one pelican per beach, standing apart, never
      attacks. Linger 2.4s and he offers a line; 50/50 real intel vs. pelican nonsense,
      never labelled which. The captain's pipe raises him to 75/25.
- [x] **Pirate's Treasure** *(v2.9)* — a half-buried chest, always out in the scorching
      dunes off the sensible line. Five outcomes, all verified firing: **gold doubloons**
      (score pours in, you're 14% slower), **pirate boots**, the **cursed compass**,
      an **enormous angry crab** that chases and pincers you, and **map fragments**.
- [x] **Treasure Island** *(v2.9)* — collect 3 fragments in a run and the next beach is
      THE BURIED HOARD: a rock garden with no lava and no chest, just the payout.

### Items — 40 built
- [x] ~~regressions~~ *restored in v2.6*: sunscreen, half-melted popsicle (3 charges),
      pizza slice (now an [E] you eat)
- [x] **single flip-flop** and **left boot** — each protects exactly ONE randomly chosen
      foot, which makes the two-foot gauge genuinely asymmetric and very funny
- [x] **styrofoam lid** (great insulation, squeaks, +45% attention)
- [x] **surf wax** (faster but everything becomes a slide — friction cut to 22%)
- [x] **soggy paperback** (points while you sit still on a refuge)
- [x] **shorts** — the fourth slot. Paradox unexplained, as designed.
- [x] **old captain's pipe** — upgrades the Wash Prophet to 75/25

- [x] *(v2.9)* **binoculars** ([E] marks everything worth having ahead), **beach
      leftovers**, **lost GoPro**, **rusty lantern**, **old boat board** ([E] lay a
      plank refuge), and **somebody's car keys** — which reroute the whole level's goal
      to **THE PARKING LOT** so you can return them.

**Section B is complete.** 40 items, 9 bird types, 8 weather characters, 17 events,
8 goals, the Wash Prophet, Pirate's Treasure and Treasure Island.

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
- Beach length: acceleration pushed a bot lap from ~78s to ~110s (turns now cost
  momentum). A real player is ~2.5–3 min. Still right, or trim the 504m?
