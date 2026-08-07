# 🦶🔥 DON'T BURN YOUR FEET

*The sand is lava. The birds are watching. The truck is so far away.*

A silly first-person 3D browser game about sprinting barefoot across scorching beach sand, hopping between driftwood, rocks, and abandoned towels, cooling off in the shore wash — and getting mugged by seagulls for lingering there too long.

Born from a real day at the beach involving sea lions, hot sand, and two very burned feet.

## Play

No build step, no install. Any static file server works:

```bash
python -m http.server 8123 --directory .
```

Then open http://localhost:8123 in a browser. Three.js loads from CDN at runtime.

## Controls

| Key | Action |
|---|---|
| WASD / Arrows | run (camera-relative) |
| Mouse | orbit the camera |
| Shift | sprint (costs stamina) |
| Space | hop — airtime doesn't burn |
| **Q** or right-mouse | **SCOUT** — rise up and read the beach |
| E | use item (oar vault, boogie board) |
| Mouse wheel | zoom |

## The rules of the beach

**Hop → Scout → Commit.** That's the whole game.

- **Read the sand.** Pale cream sand is cool. Orange-red shimmering sand burns. Winding cool corridors snake across the beach and shift as you advance — holding one heading walks you straight into a scorch zone. Hold **Q** to rise up and plan your line before you commit to it.
- **Each foot has its own temperature**: COMFY → TOASTY → OW OW OW → BURNING → ON FIRE. Your character's feet visibly cook from tan to glowing red, steaming and smoking. Burning makes you faster but sloppier.
- **Refuges are lifelines.** Driftwood, rocks, towels and abandoned boogie boards cool you fast — but the gaps between them widen every level, and about 1 in 5 towels has a crab in it.
- **Stamina** limits sprinting, so you can't just run everywhere. Rest on a refuge to recover.
- **Wet sand is cool sand** for a few seconds after a wave. The water cools fastest of all — but the **BIRD SUSPICION** meter fills while you're down there, and gulls answer it. By level 6 a peregrine falcon starts locking onto you (shelter behind a rock).
- **Six rotating goals**, each with its own audio beacon: ice cream truck, your flip-flops, the beach shower, an umbrella camp, the tide pools, and rarely the golden **seal nursery** with bouncing pups.
- **Weather characters** change each beach: High Noon, Marine Layer, Golden Hour, Low Tide, Drizzle. Mid-level the beach interrupts you with drifting cloud shade to chase, whale-breach wave surges, sneaker waves, and the Sun personally focusing a burn-ring on you.
- **Items auto-equip into 3 FIFO slots.** Sandals, sunscreen, kelp wraps, spinach (punt a gull), pizza (birds adore you), a message in a bottle that reveals the cool route, a pirate's hat, and a rubber duck that does absolutely nothing and is beloved.
- Endless escalating levels, four difficulties from **Tourist** to **BAREFOOT IN AUGUST**, and arcade high scores: three initials, the **HALL OF SOLES**, and a podiatrist's report card ("Left foot: TECHNICALLY BRISKET").

## Roadmap

See [DESIGN.md](DESIGN.md) for the full design bible: the seal nursery finale, the bald eagle, the peregrine falcon, snowy plovers running the broken-wing scam, weather-as-characters, the Wash Prophet, pirate's treasure, and ~30 more items.

---
🤖 Prototyped with [Claude Code](https://claude.com/claude-code)
