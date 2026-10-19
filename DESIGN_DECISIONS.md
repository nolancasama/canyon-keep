# Design Decisions

## 2026-10-19 — Slice 1 controller corrections

- Replaced the previous canyon with the controller-authored `.ai/new-map.txt`.
  That source contains 35 terrain rows and a numeric ruler, rather than 36
  terrain rows. Omitted the ruler and supplied the missing initial cliff row:
  all authored terrain rows stay intact and the keep is at (56,16), with
  mount tiles at (18,6), (22,29), (40,31), matching the controller coordinates.
- Pendulums use tile-centred `pivotX`/`pivotY`, arm length, `centerAngle` and
  `halfSweep` in screen-space radians. The short sweeps cross the canyon;
  the cliff-top gantry and chain intentionally extend over rock. Ready locks
  at the lower angle, release eases toward the upper angle, and reset returns
  over 20 seconds. Only the radius-2.2 head damages entities, once per swing.
  Enemy collision covers the continuous head arc between fixed ticks to avoid
  missing centres near its edge. Strike overlays show the annular head band
  clipped to non-cliff tiles, a dashed head path, and orange structure overlap.
- Terrain remains a single cached offscreen canvas. Smoothed, irregular rock
  contours replace the tile staircase visually; layered cliff faces, bright
  lips and soft floor shadows communicate depth. Broad sand variation, rock
  clusters and a greener basin with a faint dashed border preserve terrain
  readability. Simulation terrain and construction tiles remain exact.
- Regular enemies and inhabitants have larger outlined silhouettes; the boss
  retains its existing scale. HUD, results and the public API are preserved.
- The new-map reference candidate spends 1000 gold on a gated curtain at
  column 48, a five-wall return at column 54 and four staggered basin towers.
  It is not yet a winning reference: validation leaves the boss at 132 HP
  when the keep falls, with two walls lost and all four towers surviving.
  Two layout repairs were attempted using traced breach/slam events; work
  stopped at the requested repair limit. Siege schedules and frozen balance
  values remain unchanged. This correction supersedes the historical map and
  reference-defense descriptions below; controller acceptance remains pending.

This file records meaningful product, UX, visual, architectural, or behavioral decisions for this project.

For each significant decision, record:

- Date
- What was decided or changed
- Why
- Previous approach, if relevant
- Rejected alternatives, if useful

Only record decisions that may be useful to understand later.

Do NOT record:
- trivial UI adjustments
- routine bug fixes
- formatting changes
- mechanical refactors with no design consequence
- every individual code modification

Git is the source of truth for detailed code-change history.

A useful rule:

> If a future developer or AI could reasonably ask, "Why is it designed this way?", record the answer here.

---

## 2026-10-19 — Prototype design frozen from the user's brief

The user's "CASTLE DEFENSE" brief was reviewed by the design lead and frozen,
with amendments, as `SPEC.md` (the authoritative spec). Key decisions:

- **Tile grid, whole map on one screen (64×36, no camera scrolling).** Why: one
  grid serves placement, drag-walls and pathing; seeing the whole canyon at once
  is what lets the player read terrain advantages. Rejected: scrolling camera
  (extra controls for no strategic gain on one handcrafted map).
- **Trade-road rule.** The keep must always connect to the canyon mouth through
  floor or gates; enemies treat gates as solid. Why: gives gates a real purpose
  and stops "one solid wall at the choke" being an automatic win, since every
  sealed line contains a weaker, pricier gate. Rejected: gates that open for
  friendly units (no friendly units exist).
- **Breach-cost flow field.** Enemies follow a single Dijkstra field toward the
  keep where structures cost proportional to HP; they attack whatever blocks the
  next tile. Why: simple, readable ("they hit the weakest point on the way"),
  never stuck, not omniscient. Rejected: per-unit A* with perfect wall
  awareness; pure straight-line marching.
- **Tower rule:** anywhere in the castle zone, or on canyon floor only when
  orthogonally adjacent to a wall/gate. Why: towers stay part of the castle.
- **Defeat = keep destroyed or all inhabitants dead.** Breaches only cost gold.
- **Population follows a fixed table (6/10/14);** losses cost gold, not people,
  so retries and schedules stay deterministic.
- **Pendulum damages friendly structures in its sweep** and never one-shots the
  boss; hit-once-per-swing per entity.
- **Explosions chain with a 0.12 s stagger and hit at most 6 structure tiles.**
- **Zero-dependency stack:** ES modules, `node serve.js`, `node --test`. Sim is
  pure/headless and deterministic (seeded RNG, fixed 60 Hz).

## 2026-10-19 — Slice 1 implementation

- **Map geometry:** the western entrance occupies rows 6–11; the canyon bends
  south through a ledged three-tile throat at columns 25–27, bends again, then
  opens into the 20×18 basin at columns 43–62 / rows 10–27. The keep starts at
  (58,17). Three cliff mounts at (18,10), (35,17), and (40,15) sweep across
  distinct canyon stretches. Their arm lengths are 7, 7, and 9 tiles.
- **Siege 1 schedule:** 45 regular enemies plus one boss; the boss arrives at
  101 seconds (78% of the 130-second arrival schedule). No arrival gap exceeds
  nine seconds. Travel through the winding canyon supplies the remaining
  battle time. Combat, economy, and cooldown values retain the frozen numbers;
  the boss repeats its 1.4-second windup without an additional attack delay.
- **Reference defense:** `test/fixtures/reference-build.js` exports a 980-gold
  castle with four towers, a gate in a basin curtain wall, and a short forward
  wall. It wins Siege 1 with a breach; an empty castle loses. This reference
  does not require automated pendulum activation and is reusable by a browser
  harness through the public placement API.
- **Slice boundary and retry:** only Siege 1 is reachable in the UI. Schedules
  for Sieges 2–3 exist in the frozen data module, but rewards, progression and
  population growth remain slice 2. Retry restores the entire preparation
  snapshot exactly, returning to preparation so the player can redesign and
  press Start Siege again. The debug state getter follows state replacements.
- **Event observation:** rendering observes append-only events with a local
  cursor instead of removing them from simulation state. This preserves the
  read-only presentation contract and a deterministic event history. Actor IDs
  are separate from monotonic event IDs. Particles are pooled and transient
  rings/scorches are capped; terrain is cached once. Hit-stop pauses drawing
  only, leaving fixed simulation ticks unchanged.
- **Test entry point:** `test/index.js` imports the suites because Node 24 on
  this Windows environment resolves `node --test test/` as a directory module.
  This keeps the exact frozen npm script working without dependencies.

## 2026-10-19 — Controller review of slice 1: map, pendulum aim, balance

- **Map re-authored by the design lead** (generator + coverage check, not
  hand-placed by a worker): a 5-wide western entrance, S-curve descent through a
  3–4-wide throat whose three narrowest rows each contain a ledge (so the choke
  can't be sealed; the nearest sealable rows are 5 wide), a long southern bend,
  then a rising mouth into an oval basin. Why: the first map was short, wide and
  half dead cliff, and its "choke" made walls trivial.
- **Pendulum pivots sit on cliff at the outside of bends looking down a
  straight; a ±~30° arc carries the head across the canyon.** Site 2 was re-aimed
  from 245° to 280° (±28°) because at 245° the head spent most of its swing
  inside rock. Every site's swept band provably separates spawn from the basin.
  Rejected: a side-cliff pivot with a ~160° arc (head travelled through rock and
  missed enemies in front of the gantry).
- **Balance:** boss HP 1500/2300/3200 → 1200/1900/2700; keep HP 1500 → 2000.
  Why: the ~1000-gold no-pendulum reference build lost Siege 1 by 132 boss HP,
  which made the pendulum mandatory in the introductory siege. Now the reference
  wins while losing a wall, and the pendulum is an edge rather than a requirement.

## 2026-10-19 — Slice 2 campaign, siege pressure and visual polish

- **Campaign transition:** results are calculated when the API observes a siege
  ending, and money is credited only by `continueCampaign()`. Recorded siege
  indices prevent repeated payouts. Continue retains damaged structures,
  rubble and attacked-inhabitant markers, then replenishes inhabitants to the
  fixed 6/10/14 population table. A third Continue credits the final reward and
  enters `complete`. Retry restores the entire pre-siege state; Continue drops
  the old snapshot so a later retry cannot roll back a paid reward.
- **Reward interpretation:** structural damage is new damage during this siege
  divided by the starting living structures' total maximum HP (including keep).
  Existing unrepaired damage is not charged again. Economical construction uses
  net gold spent since the beginning of this preparation, including repairs and
  demolition refunds, compared with its opening treasury. Keep HP penalties use
  whole ten-HP increments. Defeat displays zero bonuses, incurred penalties and
  zero payout; the victory floor is shown explicitly only when it raises payout.
  Enemy arrivals at the keep are counted per distinct enemy; their event and
  monetary penalty remain once per siege.
- **Civilian homes:** stable structure-order slots allocate six inhabitants to
  keep and four to each surviving house. House placement/demolition updates idle
  home assignments during preparation. Pillaging foot soldiers retain a local
  house/farm target until it falls, then resume the breach route.
- **Schedule tuning:** S2 has 75 arrivals (34 foot, 28 chiselers, 12 powder,
  one 1900-HP boss); S3 has 120 (47 foot, 52 chiselers, 20 powder, one 2700-HP
  boss). Alternating lanes and overlapping chisel/powder packs pressure the
  previous pack's breach. Bosses spawn at 108/114 seconds, 75% of the 144/152
  second arrival timelines; all arrival gaps are at most 12 seconds. S1 schedule,
  combat HP/damage, reward amounts, map and pendulum geometry are unchanged.
  **No SPEC.md numbers were changed by slice 2.** Existing controller HP edits
  remain in the working tree.
- **Reference plan and limit:** the accepted 1000-gold S1 reference is preserved
  and wins S1; its unchanged defenses lose S3. A separate 960-gold campaign
  initial build shortens the curtain to x43/y15–24, enabling six initial towers.
  It wins S1 and S2 without a pendulum. Its S3 inner-return/tower additions exceed
  earned funds, leaving the full-campaign reference test at an affordability
  precondition failure. Two repair attempts were used; further fixture or reward
  tuning was stopped under the task's explicit limit. Whole-campaign victory,
  duration targets and deterministic replay still need verification.
- **Terrain approach:** three weighted smoothing passes and quadratic contours
  replace isolated tile-corner rounding. Jittered angular plates, fractured
  facets, broad value variation and branching cracks replace sinusoidal grain.
  Bright rim strokes and soft shadows retain depth; the offscreen cache and
  exact gameplay tiles remain unchanged. Strike clipping shares the organic
  visual cliff contour so the overlay does not reintroduce a staircase.
- **Machinery approach:** the cliff gantry grows to several tiles with a timber
  A-frame, iron bands, stone anchors, toothed rotating winding drum and paired
  heavy chains. A larger release smear reinforces the existing spiked head.
  Prep tool/gantry hover shows a 25% amber rounded strike tube and dashed head
  path; faint siege coverage persists. Orange friendly-fire intersections draw
  above roofs/walls to remain visible. The collision sweep/site data is unchanged.
  These visual changes have not been captured or aesthetically accepted.

## 2026-10-19 — Controller review of slice 2: campaign balance and results layout

- **Boss HP 1200/1700/2000 (was 1200/1900/2700); Siege 2 completion reward 450
  (was 350).** Why: with the old values the affordable no-pendulum campaign
  reference could not afford its Siege 3 additions and lost S3 with the boss at
  1092/2700. Probing showed 2300 still loses by 272 HP; 2000 wins with the keep
  at 180/2000 — a close finish, so the pendulum and better layouts are the
  margin, not a requirement. The unchanged Siege 1 castle still loses Siege 3.
- **Start-gating message lists every shortage** ("Need 1 more house · Need 4
  more food capacity") instead of only the first.
- **Results screen uses a two-column breakdown** so all line items and the
  Continue button fit a ~860px-tall window without inner scrolling.

## 2026-10-19 — Preparation sandbox rules (user brief, amended)

Accepted from the user's "Preparation Phase Improvements" brief: 100% refund of
intact structures in prep (scaled by remaining HP; destroyed = 0), trade-road
check moved from placement to Start Siege, Gate tool replaces a Wall atomically
for the net cost, and a always-visible requirements advisory under Start Siege.

Amendment by the design lead:
- **Houses/farms are free only while needed.** A house is free while intact
  housing (keep + houses) < population; a farm is free while intact food <
  population. Surplus ones cost the old price (80/70). Each structure stores
  what was actually paid; demolish refunds that (free → 0). Why: unconditionally
  free 2×2 blocking buildings would be free walls (sealing the canyon for 0 gold).
  This keeps the brief's intent — mandatory civilian infrastructure never costs
  gold — without the exploit. Rejected: free and non-blocking (changes battle
  pathing, which the brief forbids); a hard count cap (opaque to players).
- **Blocked-road hint:** when the road is blocked, wall/barricade tiles bordering
  the region reachable from the entrance get a red highlight in prep. One flood
  fill, no new path visualisation.
- Refund-exploit check: demolish+rebuild of a damaged piece costs cost×(1−f)
  while repair costs 0.5×cost×(1−f), so full refunds can't launder repairs.

## 2026-10-19 — Preparation sandbox implementation contract

- **Actual payment is separate from base price.** Structures store `paidCost`
  for refunds while retaining base `cost` for unchanged repair pricing. The
  placement-time house/farm price depends on current intact capacity, so a free
  building never gains refund value when population or other buildings change.
- **Gate replacement uses the existing placement action.** Calling
  `place('gate', x, y)` on a living wall performs one atomic replacement; there
  is no demolition step that could strand a canyon tower or require the full
  gate price up front. The new gate records the full gate purchase price and
  the removed wall contributes its recoverable value to the exchange. This
  conserves gold plus recoverable construction value for intact structures.
- **Readiness and map hints belong to the simulation.** `readiness()` exposes
  all housing, food and tradeRoad requirements; both Start Siege actions and
  the advisory consume that shared result. `price(type)` supplies dynamic next
  prices, and `blockedRoadTiles()` supplies only wall/barricade boundary tiles
  for the amended map hint. Presentation does not duplicate path checks or
  capacity-to-shortage calculations. This gives the harness semantic read-only
  observations without altering campaign phases or battle pathing.

## 2026-10-19 — Ledges removed; walls and gates interchangeable in prep (user brief)

- **Rocky ledges (`,`) become plain buildable floor.** The ledges existed to stop
  the throat being trivially sealed. Since the trade road is now enforced at
  Start Siege, a sealed choke still needs a gate, which enemies target as its
  weakest point, so the choke is a strong option rather than an automatic win.
  Side effect accepted: those tiles lose their 1.5 movement cost (now 1).
- **Wall ↔ Gate swaps** in prep, single click or drag, atomic: new cost minus
  the old piece's HP-scaled refund (Gate→Wall on an intact gate returns 40 G).
  Swapping a damaged gate equals demolish + build, which is already allowed, so
  no repair exploit. Gate-tool drags over walls also swap (symmetry).

## 2026-10-19 — Houses and farms: always free, only buildable when needed (user decision)

Replaces "free while needed, surplus priced 80/70". The user found surplus
pricing confusing (in Siege 1 the keep covers 6 people, so every house cost
gold). Now houses/farms always cost 0 and the tool is locked (greyed, "NOT
NEEDED") unless housing/food is short of the population. Still prevents free
2×2 blockers being spammed as walls, since you can only build as many as the
population requires. Moving one is free: demolish (refund 0) re-opens the need.
Rejected: always free anywhere (free walls), always free but basin-only.
