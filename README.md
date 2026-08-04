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
| WASD / Arrows | run |
| Mouse | look |
| Shift | sprint |
| Space | hop (airtime = no burn!) |
| E | oar vault (if you have an oar) |

## The rules of the beach

- Each foot has its own temperature gauge: **COMFY → TOASTY → OW OW OW → BURNING → ON FIRE.** Burning feet make you faster and sloppier. Keep them cool or your health melts.
- **Wet sand is cool sand.** The tide is a metronome — dark sand behind a receding wave is safe for ~10 seconds.
- **Don't linger in the wash.** The BIRD SUSPICION meter fills, and the gulls answer it. They steal your stuff.
- **Items auto-equip into 3 FIFO slots** — new pickups rotate old ones out. Sandals, sunscreen, kelp wraps, spinach (punt a gull!), pizza (birds find you fascinating), an oar, and a rubber duck that does absolutely nothing and is beloved.
- Reach the **ice cream truck**. Follow the jingle.
- Four difficulties, from **Tourist** to **BAREFOOT IN AUGUST**.
- Arcade high scores: three initials, the **HALL OF SOLES**, and a podiatrist's report card at the end of every run ("Left foot: TECHNICALLY BRISKET").

## Roadmap

See [DESIGN.md](DESIGN.md) for the full design bible: the seal nursery finale, the bald eagle, the peregrine falcon, snowy plovers running the broken-wing scam, weather-as-characters, the Wash Prophet, pirate's treasure, and ~30 more items.

---
🤖 Prototyped with [Claude Code](https://claude.com/claude-code)
