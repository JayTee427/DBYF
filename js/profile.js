// ============================================================
// profile.js — the only thing that survives a run.
//
// Lifetime stats and an unlock pool. Two jobs: give you a reason to start
// another run beyond chasing a number, and stop the game dumping 40 items
// and 12 abilities on a first-time player all at once.
// ============================================================
const KEY = 'dbyf_profile';

/** Items you begin with. Everything else has to be earned. */
export const STARTING_ITEMS = [
  'sandals', 'kelp', 'cap', 'bucket', 'boogie', 'oar', 'umbrella',
  'sunscreen', 'popsicle', 'pizza', 'flipflop', 'duck', 'paperback', 'lid',
];
/** Chest-only rewards never enter the spawn pool, so they need no unlock. */
const CHEST_ONLY = ['doubloons', 'compass', 'mapfrag'];

/**
 * Each unlock reads one lifetime counter. `at` is the threshold.
 * Keep the flavour dry — the joke is that these are all humiliations.
 */
export const UNLOCKS = [
  { item: 'binos',     stat: 'beaches',   at: 3,   text: 'clear 3 beaches' },
  { item: 'spinach',   stat: 'raids',     at: 8,   text: 'survive 8 gull raids' },
  { item: 'crab',      stat: 'crabs',     at: 5,   text: 'meet 5 towel crabs' },
  { item: 'boot',      stat: 'faceplants', at: 8,  text: 'faceplant 8 times' },
  { item: 'wax',       stat: 'leaps',     at: 20,  text: 'leap 20 times' },
  { item: 'boatboard', stat: 'beaches',   at: 6,   text: 'clear 6 beaches' },
  { item: 'net',       stat: 'dodges',    at: 25,  text: 'dodge 25 birds' },
  { item: 'gopro',     stat: 'recovered', at: 5,   text: 'chase down 5 stolen items' },
  { item: 'bottle',    stat: 'scouts',    at: 25,  text: 'scout the beach 25 times' },
  { item: 'float',     stat: 'waterTime', at: 90,  text: 'spend 90s in the sea' },
  { item: 'pipe',      stat: 'prophecies', at: 6,  text: 'hear 6 prophecies' },
  { item: 'rock',      stat: 'bestCombo', at: 12,  text: 'reach a ×12 SOLE TRAIN' },
  { item: 'boots',     stat: 'chests',    at: 3,   text: 'open 3 treasure chests' },
  { item: 'hat',       stat: 'chests',    at: 6,   text: 'open 6 treasure chests' },
  { item: 'lantern',   stat: 'deaths',    at: 4,   text: 'die 4 times' },
  { item: 'timepiece', stat: 'bestLevel', at: 8,   text: 'reach beach 8' },
  { item: 'shorts',    stat: 'items',     at: 120, text: 'beachcomb 120 items' },
  { item: 'keys',      stat: 'beaches',   at: 12,  text: 'clear 12 beaches' },
  { item: 'leftovers', stat: 'trips',     at: 15,  text: 'trip over 15 times' },
  { item: 'corndog',   stat: 'thefts',    at: 12,  text: 'get robbed 12 times' },
  { item: 'dollar',    stat: 'deaths',    at: 8,   text: 'die 8 times' },
  { item: 'tuna',      stat: 'eagles',    at: 1,   text: 'see the bald eagle' },
  { item: 'sixseven',  stat: 'bestScore', at: 670000, text: 'score 670,000' },
];

/**
 * Things the game explains exactly once, ever — the first time they happen
 * to you. After that it shuts up about them, because you know.
 */
export const LESSONS = {
  lava:     ['\u{1F525} that orange patch is real lava — the plain sand is survivable, the puddles are not'],
  refuge:   ['\u{1F3D6} anything not sand is a refuge. chain fresh ones without cooking a foot for a SOLE TRAIN.'],
  hop:      ['\u{1FA78} tap SPACE to hop — it swaps your lead foot, and you can\'t burn mid-air'],
  raid:     ['\u{1F426} they only dive once the mob overhead is big enough. watch the shadows.'],
  theft:    ['\u{1F985} it TOOK that. chase it down and you get it back.'],
  chest:    ['\u{1FA99} chests are always out in the worst ground. that is the deal.'],
  synergy:  ['\u{2B50} two items just combined. the pause screen (ESC) lists what you\'re carrying.'],
  crab:     ['\u{1F980} about half the towels have a crab under them. sorry.'],
  swap:     ['\u{1F392} three pockets. a fourth item pushes your oldest out onto the sand — go back for it.'],
  water:    ['\u{1F30A} the sea is a full reset. it is also where the birds do their shopping.'],
  scout:    ['\u{1F50D} hold Q any time to lift the camera and read the beach ahead'],
  cursed:   ['\u{2620} cursed items are genuinely a gamble. they give more than they take, usually.'],
  ability:  ['\u{26A1} press E to use it. the pause screen shows the cooldown.'],
  stamina:  ['\u{1F3C3} sprinting burns stamina. standing still on a refuge gets it back fastest.'],
  prophet:  ['\u{1F9A2} he never attacks. stand near him and he tells you something — maybe true.'],
  weather:  ['\u{1F324} some beaches change weather partway through. the sand changes with it.'],
};

/**
 * MUTATORS — optional ways to make the beach worse, earned by playing.
 * Each one is a real rule change, not a slider, and each pays a score
 * multiplier. They stack, and stacking them is the point.
 */
export const MUTATORS = [
  { id: 'barefoot', icon: '\u{1F9B6}', name: 'STRICTLY BAREFOOT',
    blurb: 'no footwear spawns. at all. ever.',
    need: ['beaches', 5], mult: 0.35 },
  { id: 'onepocket', icon: '\u{1F45D}', name: 'ONE POCKET',
    blurb: 'you may carry exactly one thing',
    need: ['beaches', 10], mult: 0.55 },
  { id: 'noclock', icon: '\u{1F6AB}', name: 'NO REFUGES',
    blurb: 'the procedural towels and driftwood are gone. set pieces only.',
    need: ['bestCombo', 15], mult: 0.75 },
  { id: 'flocked', icon: '\u{1F426}', name: 'THE WHOLE FLOCK',
    blurb: 'twice the birds, and they start angry',
    need: ['dodges', 60], mult: 0.6 },
  { id: 'greased', icon: '\u{1F9F4}', name: 'GREASED',
    blurb: 'everything is surf wax. you slide constantly.',
    need: ['leaps', 50], mult: 0.4 },
  { id: 'sprint', icon: '\u{23F1}', name: 'THE SUN IS IN A HURRY',
    blurb: 'the sun climbs four times as fast',
    need: ['bestLevel', 10], mult: 0.7 },
  { id: 'cursed', icon: '\u{2620}', name: 'CURSED ONLY',
    blurb: 'every item that spawns is a bad idea',
    need: ['deaths', 15], mult: 0.8 },
  { id: 'blind', icon: '\u{1F32B}', name: 'PEA SOUP',
    blurb: 'permanent fog. you cannot see the goal or the lava coming.',
    need: ['beaches', 20], mult: 0.9 },
];

const BLANK = {
  stats: {
    beaches: 0, deaths: 0, runs: 0, items: 0, crabs: 0, faceplants: 0, trips: 0,
    leaps: 0, dodges: 0, raids: 0, thefts: 0, recovered: 0, scouts: 0,
    waterTime: 0, prophecies: 0, chests: 0, rescues: 0, conned: 0, eagles: 0,
    bestCombo: 0, bestLevel: 0, bestScore: 0,
  },
  unlocked: [],
  taught: [],
  mutators: [],          // which ones are switched ON for the next run
};

export const PROFILE = {
  data: JSON.parse(JSON.stringify(BLANK)),

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && raw.stats) {
        this.data.stats = Object.assign({}, BLANK.stats, raw.stats);
        this.data.unlocked = Array.isArray(raw.unlocked) ? raw.unlocked : [];
        this.data.taught = Array.isArray(raw.taught) ? raw.taught : [];
        this.data.mutators = Array.isArray(raw.mutators) ? raw.mutators : [];
      }
    } catch { /* first run */ }
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { } },
  reset() { this.data = JSON.parse(JSON.stringify(BLANK)); this.save(); },

  /**
   * Has this lesson already been taught? Returns the line the first time and
   * null forever after, so callers can just do `const l = PROFILE.teach('lava')`.
   */
  teach(id) {
    if (!LESSONS[id] || this.data.taught.includes(id)) return null;
    this.data.taught.push(id);
    this.save();
    return LESSONS[id][0];
  },
  lessonsLeft() { return Object.keys(LESSONS).length - this.data.taught.length; },

  // ---- mutators ----
  mutatorEarned(m) { return (this.data.stats[m.need[0]] || 0) >= m.need[1]; },
  mutatorOn(id) { return this.data.mutators.includes(id); },
  toggleMutator(id) {
    const i = this.data.mutators.indexOf(id);
    if (i >= 0) this.data.mutators.splice(i, 1); else this.data.mutators.push(id);
    this.save();
    return this.mutatorOn(id);
  },
  /** The ones actually in force, filtered to what's been earned. */
  activeMutators() {
    return MUTATORS.filter(m => this.mutatorOn(m.id) && this.mutatorEarned(m));
  },
  /** Combined score multiplier from every mutator switched on. */
  mutatorMult() {
    return this.activeMutators().reduce((a, m) => a + m.mult, 1);
  },

  isUnlocked(item) {
    if (STARTING_ITEMS.includes(item) || CHEST_ONLY.includes(item)) return true;
    return this.data.unlocked.includes(item);
  },
  /** Everything currently allowed to spawn. */
  pool() {
    return STARTING_ITEMS.concat(this.data.unlocked);
  },
  discovered() {
    return STARTING_ITEMS.length + this.data.unlocked.length;
  },

  /** Fold one finished run's stats into the lifetime record. */
  absorb(runStats, level, score, died) {
    const s = this.data.stats;
    s.runs++;
    if (died) s.deaths++;
    s.beaches += Math.max(0, level - 1);
    s.items += runStats.items || 0;
    s.crabs += runStats.crabs || 0;
    s.faceplants += runStats.faceplants || 0;
    s.trips += runStats.trips || 0;
    s.leaps += runStats.leaps || 0;
    s.dodges += runStats.dodges || 0;
    s.raids += runStats.raids || 0;
    s.thefts += runStats.thefts || 0;
    s.recovered += runStats.recovered || 0;
    s.scouts += runStats.scouts || 0;
    s.waterTime += Math.round(runStats.waterTime || 0);
    s.prophecies += runStats.prophecies || 0;
    s.chests += runStats.chests || 0;
    s.rescues += runStats.rescues || 0;
    s.conned += runStats.conned || 0;
    s.eagles += runStats.eagles || 0;
    s.bestCombo = Math.max(s.bestCombo, runStats.bestCombo || 0);
    s.bestLevel = Math.max(s.bestLevel, level);
    s.bestScore = Math.max(s.bestScore, score);
    this.save();
  },

  /** Anything newly earned. Returns the unlock records so they can be shown. */
  claim() {
    const s = this.data.stats;
    const fresh = [];
    for (const u of UNLOCKS) {
      if (this.data.unlocked.includes(u.item)) continue;
      if ((s[u.stat] || 0) >= u.at) { this.data.unlocked.push(u.item); fresh.push(u); }
    }
    if (fresh.length) this.save();
    return fresh;
  },
  /** The closest few things you haven't got yet — shown on the title screen. */
  nextUp(n = 3) {
    const s = this.data.stats;
    return UNLOCKS
      .filter(u => !this.data.unlocked.includes(u.item))
      .map(u => ({ ...u, have: s[u.stat] || 0, frac: (s[u.stat] || 0) / u.at }))
      .sort((a, b) => b.frac - a.frac)
      .slice(0, n);
  },
};
PROFILE.load();
