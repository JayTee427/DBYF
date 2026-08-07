# DON'T BURN YOUR FEET
*A beach survival comedy. The sand is lava. The birds are watching. The ice cream truck is so far away.*

> **Camera note (v1.0):** built third-person, not first-person. The game is about
> your feet and about reading the beach — in first person you can't see either,
> you can't judge a landing on a 2m plank, and the whole hop/scout/commit loop
> collapses into holding W. Third-person puts the heat gauge on the character
> (feet visibly cook) and makes routes legible.

## Core loop
**Hop → Scout → Commit.** Stand on something safe, read the beach ahead, sprint across hot sand to the next refuge (or the wash line). Everything else in the game decorates this loop.

## Core systems (only two!)
1. **Heat** — per-foot temperature gauges + shared health bar.
2. **Bird Aggro** — one meter; what fills it and what answers the call escalates with levels.

## Heat states (per hottest foot)
| State | Effect | Audio |
|---|---|---|
| Comfy | — | soft pat-pat footsteps |
| Toasty | — | "ooh. ooh. warm." |
| OW OW OW | screen-edge wobble | "ow ow ow ow", slap-slap steps |
| BURNING | +25% speed, worse control (panic sprint) | "HOT HOT HOT" |
| ON FIRE | smoke footprints, health drain, gulls smell cooked food | sizzle steps, screaming |

## Reading the beach
- Heat-haze shimmer = hot zones. Dark wet sand = recently washed, cool (~10s timer).
- Sanderlings mark the safe wash line. Cloud shadows are moving cool paths.
- The tide is a slow metronome; surfing the wash line without touching water is the skill ceiling.

## Refuges
Driftwood, rocks, towels (20% crab), abandoned boogie boards, kelp mats (fly tax), sandcastle kingdom paths (guilt debuff if toppled).

## Bird escalation ladder (California cast)
1. **Sanderlings** — helpful tide indicators.
2. **Willets/Godwits** — flush screaming if sprinted through; aggro spike.
3. **Western Gulls** — rank-and-file dive-bombers, item theft.
4. **Heermann's Gulls** — professional thieves (real: they rob pelicans). Steal your BEST item when you stumble. They remember you.
5. **Snowy Plovers** — broken-wing act lures you off-path (real behavior!). Roped nesting zones = instant max aggro + furious docent.
6. **Least Terns** — precision aerial harassment, forced zigzags.
7. **Brown Pelican squadrons** — moving walls; traveling shadow lure.
8. **Turkey Vulture** — circles patiently if you stay ON FIRE. Psychological warfare only.
9. **Peregrine Falcon** — endgame. Targeting reticle, 240mph stoop, scatter all items if caught in open. Two of them on Ultra.

**The Bald Eagle** — rare roving event, outranks everyone (annoys the falcon). All birds flee while he circles (aggro frozen). May steal your newest item OR drop loot from a past victim. Carrying fish-smell items (tuna can!) makes YOU the target: carried and dropped somewhere random. Players will do this on purpose.

## Weather characters
Sun (smug antagonist, focus-beam), Fog Bank (sleepy, cool but blinding), Wind (prankster, moves refuges), Cloud (follow-the-shade paths), Drizzle (apologetic universal cooling, fumble-slippery pickups), The Humidity (invisible oppression bar, "It's Not the Heat, It's..."), Marine Layer (burns off mid-level — curtain-lift Sun reveal), Dust Devil (5-year-old tornado carrying items), Golden Hour (gorgeous amber cooling + final bird feeding frenzy).

## End goals (rotating)
Ice cream truck (jingle = audio beacon), abandoned flip-flops, beach shower, umbrella camp, tide pools, boardwalk stairs (asphalt gauntlet). **Golden rare: the Seal Nursery** — heard before seen (happy barking), guarded by opinionated mama seals (blubber maze), pups jump for you, one boops your ruined foot: instant cool, steam hiss, splash confetti. A harbor seal periscope-tracks you all level; she was scouting you.

## FIFO item slots (3; pickups auto-equip, oldest rotates out)
**Common:** sandals (fly off mid-sprint), sunscreen (greasy gull-trackable prints), kelp wrap, bucket (bunny-hop immunity), boogie board, single flip-flop (random foot), styrofoam lid (squeak aggro), fishing net (15% self-tangle), rubber duck (does NOTHING; squeaks at ON FIRE; beloved), glass float (waves reach farther for you), soggy paperback (score for standing on refuges), left boot (never a right), binoculars, lost cap (small shade), beach leftovers (heal + bird interest), shorts (grants a 4th slot; paradox unexplained), old tuna can (eagle bait gamble), pizza slice (big heal + most interesting object on the coastline), half-melted popsicle, hermit crab (disloyal bodyguard), lost GoPro (picture-in-picture intel), surf wax (slippy speed), corn dog, somebody's car keys (goal rerolls to parking lot), oar (pole-vault, 3 uses), rusty lantern (dusk levels: identifies mystic items pre-pickup).
**Mystical (buff+debuff):** message in a bottle, old timepiece (stops sun AND waves), special rock (throw-teleport, heavy), old boat board (splinters), cursed sand dollar, dented can of spinach (10s cartoon forearms, gull-punting, sea shanty sting), old captain's pipe (bubbles, maritime narration subtitles, Wash Prophet hints upgrade to 75/25), pirate's hat (gulls may salute instead of attack).
**Pirate's Treasure chest** (off-path temptation): doubloons (score, heavy), pirate boots (immune, LOUD), cursed compass (points through worst route), an enormous angry crab, map fragments ×3 → Treasure Island bonus level.

## Background events
Whale breach wave, sea lion pile (bark-wave knockback, tiptoe zone), dog + ball cool-sand trail, Sandcastle Kingdom, Kite Guy, grunion run (all birds leave; the shore is YOURS), beach wedding ("Wedding Crasher" → paparazzi flash), dolphin escort ("Feeling Cool" buff; they leave, embarrassed, if you ignite), Metal Detector Man (walking loot forecast), surf school parade, volleyball (cartoon physics; kick it back = gull respect), low tide reveal (greed timer), seagull civil war (walk through untouched), fisherman's backcast ("Hooked"), sneaker waves (sea lion says "uh oh").

## The Wash Prophet
One weird pelican per beach, apart from all birds, never attacks. Stand near 3s → cryptic subtitle hint. 50/50 real intel vs. pelican nonsense. Never labeled which.

## Difficulty
**Tourist** → **Local** → **Firewalker** → **BAREFOOT IN AUGUST** (Sun has a vendetta, every towel has a crab, gulls coordinate like velociraptors, the truck slowly drives away, memorial screen: "Here lie the feet of Jeff. They were told to bring sandals.") Ultra level 256 kill screen: all parking lot, no sand, the Sun fills half the sky.

## Arcade layer
Three-initial letter-wheel entry (seals watch if you place #1). Local leaderboard (localStorage) → daily-seed global later. Floating style bonuses: HOT STREAK, PHOTO FINISH, FULL POUCH, PACIFIST, DUCK LOYALIST. Attract mode: ghost runner burns to death under the score table. The coin is a sand dollar. End-of-level **podiatrist report card** ("Left foot: medium-rare. Diagnosis: why did you do this.") merges with arcade tick-tick score tally.

## Deferred to v2
Toe-dig (cut: slows gameplay), Dignity currency, zinc-oxide war paint cosmetics.

## Tech
Three.js, low-poly flat-shaded, seeded procedural strip (shareable "beach #48213"), heat = noise layer + modifiers (tint = simulation data), no physics engine, WebAudio synth everything (zero assets), daily-seed mode for Wordle-style sharing.
