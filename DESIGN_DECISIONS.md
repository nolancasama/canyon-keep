# Design Decisions

## 2026-10-24 — Geometry budgets and purchased advanced scouting

- Replace generated value/raider-based 600–950 G budgets with estimated basic
  enclosure costs. Dilate core building footprints by two Manhattan tiles,
  count their cardinal exterior ring, omit interior holes and remote outliers
  beyond 14 tiles of the keep/central lot. This matches the simulation's
  cardinal movement and follows irregular lots rather than pricing a bounding
  rectangle. Clip clearance near other civilian lots so a proposed curtain
  can be built. Natural barriers cost zero; roads use gates; existing walls
  are already built. No map rejection or siege generation changes are needed.
- Configured weights: Compact main 1.0, remote property 0, equipment +35%;
  Twin larger 1.0 + smaller 0.5, equipment +25%; Outpost main 1.0 + outpost 0.6,
  equipment +25%. Round to 10 G, with 1000–6000 G safeguards. The intent is a
  credible main enclosure and military equipment, with satellite protection
  requiring choices. Handcrafted treasury uses its main-town estimate plus
  equipment: 1950 G available versus 1560 G main-town and 4200 G combined
  estimates. Its map, siege and owner systems remain unchanged. Canyon's
  original 1000 G starting treasury and all combat values remain unchanged.
- Estimates are advisory and stored on the contract. Prep lists remaining
  gold, named basic enclosure costs and their combined total, with explicit
  exclusions for towers, machinery and terrain adjustments. No ring is drawn,
  built or enforced. Padding and multiple road crossings can cost more than
  older unpadded rectangular comparison fixtures, especially for disconnected
  farming lobes; estimates do not claim globally cheapest construction.
- Advanced scouting costs 50 G once per generated contract in prep. Report
  actual assigned groups with the same strength weights as generation, rounded
  to 5%; name genuine dangerous types, minor diversions, primary direction
  and second-wave direction without spawn times. Retain the entire free report.
  Paid prep markers remain at the edge, emphasizing the primary front and
  subduing secondary/diversion fronts. The handcrafted siege/fallback has no
  front plan; disable purchase with a clear explanation instead of inventing
  equivalent intelligence.
- Scouting is a non-refundable service, separate from structure paid costs,
  demolition and repair. Store its flag on the contract; normal JSON saves and
  the existing full pre-siege snapshot preserve both intel and spent money.
  Retry charges nothing and refunds nothing. Purchases never edit enemy groups,
  front plans, schedules, strengths or spawn timing.
- Rejected: fixed budget ranges as the funding model, bounding-box perimeters,
  fabricated intel, exact spawn-time disclosure and construction-enforced
  enclosure recommendations.
- Legacy seed-1 tactical comparisons retain their original six/seven tower
  spend through an explicit test-helper limit, keeping their equal-cost intel
  assertions meaningful at the larger treasury. Replace the old map-edge
  `> 3 × budget` check (an artifact of the old range) with `> budget`.
  New full-budget sweep strategies cover the larger treasury separately.

## 2026-10-24 — Ordinary wall-to-tower replacement

- The Tower tool replaces only living player-owned ordinary walls during
  preparation in Canyon and Frontier. Reuse atomic wall-family replacement
  so the defensive line never opens and occupancy/path revisions update together.
- Affordability uses tower price minus the wall's health-scaled refund; charge
  that net once and record the tower's full purchase price for later demolition.
- A replacement outside `C` needs an orthogonal supporting neighbour, excluding
  the replaced wall. Refuse replacement if removing the wall would leave another
  existing tower unsupported.
- Rejected: replacing gates or special walls, and requiring the full tower price
  up front. Ordinary-wall-only replacement keeps the action predictable; net
  affordability follows existing preparation exchanges without extra treasury.

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

## 2026-10-23 — Fortress Engineer update (user brief, controller-frozen design)

The player is a hired defense engineer. Gold is the military budget only;
the settlement (houses, farms, inhabitants) belongs to the client and grows by
itself. This supersedes the "houses/farms free while needed" entries above
(those rules existed because the player built civilian buildings; they no
longer do). Already shipped before this brief and kept as-is: full prep
refunds scaled by HP, sealed walls, road check at Start Siege, ledge removal,
wall↔gate swaps, the Start Siege advisory.

Controller modifications to the brief, with reasons:

- **Kill bounties replace the results-screen boss bonus** (foot 2, chiseler 3,
  powder 5, boss 100). Paying both would double the boss reward. Completion
  bonuses and the payout floor are lowered so that the reference campaign's
  treasury entering S2 and S3 stays within ±10% of the pre-bounty values —
  bounties shift income toward good defense without inflating budgets.
- **Siege 1 settlement stays keep-only (6 inhabitants).** The compact start is
  the brief's own example and preserves tested S1 balance.
- **Performance rating 0–100**, all from the siege: inhabitants surviving 40,
  keep HP remaining 30, civilian buildings intact 20, no enemy reached the keep
  10. Tiers: <80 standard (1 house, 1 farm), 80–94 strong (2, 2), ≥95
  exceptional (3, 2). Unspent gold is not a factor.
- **Population = keep 6 + 4 per house.** On Continue the authority first
  rebuilds destroyed houses/farms for free (lost inhabitants are replaced by
  new settlers), then adds growth buildings. An extra farm is added if food
  would fall short; capacity therefore never needs player action, and the
  housing/food readiness checks are removed. The road is the only blocking
  readiness requirement.
- **Inside/outside is computed, not read from the 'C' marker:** flood fill from
  the spawns over walkable tiles; every living military blocker (wall family,
  gate, tower, barricade) stops the fill; civilian buildings do not. Unreached
  tiles are inside. With no walls, everything is outside.
- **Growth planner is deterministic, no RNG.** 2×2 sites on floor/castle tiles,
  ≥7 columns from the spawn edge, never overlapping any structure, pendulum
  site or a built pendulum's strike band, one tile of clearance from military
  structures, and each placement must keep the trade road open. Houses take
  the site nearest (BFS from the keep) to existing habitation; farms take the
  nearest site at least one ring further out with the most open neighbours.
  Ties break by (y, x). On an exceptional rating at least one new building
  goes to the best outside site if one exists. Too little space → place what
  fits and report the shortage; never overlap or demolish.
- **Civilian buildings are untouchable by player tools** (no place over,
  demolish, replace). Player House/Farm tools are removed.
- **Wall family:** wall, gate, spiked wall, golem wall, launcher, retractable
  wall replace one another atomically in prep for new price minus the old
  piece's HP-scaled refund (the existing gate-swap code path, generalized).
  Wall, gate, spiked, golem and launcher support canyon towers; retractable
  does not (it is usually open).
- **Spiked wall** 35 G, 170 HP; every enemy attacking it in melee takes 12 dps.
- **Golem wall** 90 G, 240 HP. At ≤50% HP it opens (tile becomes open floor,
  flow field rebuilt) and a golem emerges: 350 HP, 35 damage area slam
  (radius 1.2) every 1.2 s with 1-tile knockback and 0.8 s stun, leashed to 3.5
  tiles of its wall, crumbles after 30 s or at 0 HP. Enemies can attack it.
  No refund once awakened. It is an emergency defender, never an army.
- **Proximity sensor** 15 G, 1×1, non-blocking, never targeted, radius 1.5
  tiles, configurable delay 0 / 0.5 / 1 / 2 s, 6 s cooldown, links up to 3
  devices. Devices are activated through one mechanism dispatcher
  (`activate(state, device)` by type) so new triggers/devices plug in.
- **Launcher** 70 G, 200 HP, wall-family, facing N/E/S/W set at placement
  (rotate key / panel). It fires only when a linked trigger activates it:
  volley of 3 piercing bolts 0.25 s apart, 30 damage per enemy, range 12 tiles,
  stopped by cliffs and blocking structures; 5 s cooldown. Rejected:
  auto-firing when an enemy is in the lane — it would make sensors pointless.
  Unlinked mechanisms produce a non-blocking advisory warning.
- **Retractable wall** 45 G, 200 HP while raised; starts lowered (walkable,
  ignored by road check and pathing). On activation: rises over 0.4 s, holds 8
  s, lowers over 0.4 s, 6 s cooldown. If any unit is within 0.6 tiles of the
  tile centre it waits; still blocked after 1.5 s → that activation is
  skipped. Raise/lower rebuilds the flow field. Since it always lowers again,
  no permanent deadlock.
- **Sequencing:** milestones commit separately after tests and controller
  review: (1) bounties + settlement growth, (2) spiked/golem walls + palette,
  (3) sensor/launcher/linking, then retractable walls, (4) scout reports,
  pendulum polish, balance, docs.

## 2026-10-23 — Fortress Engineer milestone 1 implementation decisions

- Completion rewards are 188/238/50 G and the payout floor is 100 G. Each
  completion reduction offsets that siege's regular-enemy bounties; the boss's
  100 G moves from results to battle. The measured reference prep treasuries
  remain S2 615 → 615 G and S3 1010 → 1010 G (0% change). Reference payouts
  become 363/463/275 G plus 212/312/450 G earned in battle. Defensive fixture
  positions are unchanged; only its obsolete house/farm placement actions go away.
- Growth distance ranking uses terrain BFS independent of structures, allowing
  outside sites to be ranked across a closed wall/gate ring. Houses minimize
  distance to existing keep/house footprints; farms choose the nearest keep-BFS
  ring beyond habitation, then most open neighbours. Final ties use (y,x).
  Exceptional growth reserves an outside house first so later placements cannot
  consume the only outside site. Existing rubble footprints remain reserved;
  rebuilding them later cannot conflict with automatic growth.
- Client ownership includes damaged/destroyed civilian footprints and keep
  repairs; Repair all therefore only changes military structures. Destroyed
  civilian buildings are restored on Continue before new growth. If an externally
  constructed state obstructs rebuilding, the report records that shortage
  rather than modifying military structures or overlapping buildings.
- The growth overlay is represented by `state.growthReport` during `prep`.
  Dismissal clears the report; the eight-second highlight timer advances only
  during visible preparation via `advancePrep(dt)`. API preparation remains
  callable for headless fixtures. Start snapshots the grown prep exactly;
  retries restore that snapshot without invoking growth or replaying gold labels.

## 2026-10-23 — Growth judges the player's intended perimeter (controller review)

Inside/outside classification, military clearance and the planner's road check
treat breached (destroyed, not demolished) military pieces as still standing.
Why: growth runs right after battle, before the player repairs; with live-only
blockers one breach made the whole keep "outside", and a house could be placed
in a gap that blocks the road once the wall is rebuilt (seen in review: the
reference campaign could not start Siege 2). Gates stay road-passable.

## 2026-10-23 — Fortress Engineer milestone 2 implementation decisions

- Wall-family membership, canyon-tower support, military classification and line
  eligibility live in CONFIG structure flags. Current members are wall, gate,
  spiked and golem. The replacement path also refuses a future non-supporting
  family member when it would strand a canyon tower. No later devices are added.
- Awakening runs at the shared structure damage point during battle, including
  hits that cross both the half-HP threshold and zero. The consumed wall is removed
  rather than becoming destroyed rubble; stale enemy walk targets clear and the
  flow field rebuilds synchronously. Iterating damage snapshots prevents removal
  from skipping neighboring structures during an area hit. Awakening is not a
  demolition/refund or a structureDestroyed event; existing results still count
  the consumed wall's missing HP in structural damage.
- Golems start with a ready slam, pursue at 1.6 tiles/s, and enemies target them
  within the existing civilian chase distance of 2.5 tiles. These additional
  values live in CONFIG. Enemy golem pursuit requires an unobstructed segment;
  otherwise enemies keep their breach route instead of stalling against a wall.
  Existing enemy unit DPS and explosion unit damage apply to golems. Pendulum
  mechanics stay unchanged. All enemy types receive the frozen slam knockback
  and stun; golems never attack structures.
- Golems retain an observable active/crumbled record until the next siege/prep
  transition; HP, origin, remaining lifetime and slam cooldown remain readable
  through the existing live debug state. Continue clears even final-siege golems;
  retry restores the exact dormant-wall preparation snapshot.
- The palette uses compact categorized rows with keys 5/6 for the upgrades and
  R for Repair. Spike sparks are throttled per attacker to 0.2 seconds, separate
  from continuous 12-DPS damage, so crowds receive feedback without text spam.

## 2026-10-23 — Fortress Engineer milestone 3 implementation decisions

- Occupancy is distinct from blocking. CONFIG `blocks:false` makes sensors
  walkable and invulnerable; shared blocking queries serve enemy movement,
  targeting, path cost, road access, golem collision and settlement enclosure.
  Retractable walls use a CONFIG `retracts` flag and block only while raised.
  Nonblocking works do not consume the explosion's six damageable structure slots.
- Device activation/timers dispatch through the type registry in mechanisms.js.
  Sensor delays latch on detection, finish even if that enemy leaves, then start
  the six-second cooldown when fired. Dead linked devices are ignored; links to
  demolished/replaced IDs are removed, and replacements never inherit wiring.
  CONFIG device flags also define link eligibility and unlinked-device advisories.
- Launcher cooldown begins with the first bolt. Bolts travel at 24 tiles/s;
  swept axial segments and per-bolt hit IDs enforce once-only piercing damage.
  Obstructions clip at their near face, rechecked ahead of each moving bolt so
  raised walls stop approaching bolts without removing bolts already past them.
  These supporting speed/feedback values are centralized in CONFIG; frozen
  costs, HP, damage, range, cadence and cooldowns are unchanged.
- Mechanisms update after units move. Retractable occupancy is checked throughout
  rising, not just on activation; an interruption restarts the rise animation.
  The full footprint is checked as well as the frozen 0.6 radius to avoid trapping
  units near tile corners. After 1.5 seconds of accumulated occupied waiting, the
  activation is skipped with the usual six-second cooldown. Only fully raised
  walls block/take damage; lowering opens immediately and animates for 0.4 seconds.
  Each blocking transition synchronously rebuilds flow and clears enemy steps.
  Continue resets timers/lowered state while retaining links, facing, delay and HP;
  retry restores the exact lowered preparation snapshot.
- Five palette categories use a one-open-category accordion to leave room for
  configuration at 1366×768. Keys 8/9/0/L select Sensor/Launcher/Retractable/Link;
  R rotates launcher placement or selection and otherwise keeps Repair. Selecting
  a mechanism via Link or after cancelling construction shows its configuration.
  Advisory warnings are separate from the unchanged road-only Start requirement.
- Semantic sensor, volley, bolt and retractable state is exposed through the
  existing live debug state getter and events, documented in CURRENT_STATE.md.
  This supplies read-only controller observations without an acceptance-only API.

## 2026-10-23 — Fortress Engineer milestone 4: intel, feedback and balance

- Each siege owns four scout bullets in the data layer, describing actual force
  counts, changes from the preceding siege, wall pressure, powder clusters and
  its giant brute without revealing spawn times. Preparation shows growth first,
  then scout intel, then construction. The footer can reopen intel. Read-only
  `state.scoutReport` exposes the pending report; dismissal/reopening use API
  actions. Headless construction remains available. API retry retains its exact
  snapshot; the UI retry action explicitly reopens intel for the new preparation.
- Pendulum hits drive capped dust/debris and hit-scaled shake through one maximum
  shake envelope shared with explosions and golems. Powder blasts descended from
  pendulum kills receive stronger flashes. All additions observe existing events;
  collision, timing, damage and mechanism rules are unchanged.
- Prep wiring uses outlined iron chains with endpoint rivets and selected-link
  emphasis. Battle wiring appears only for a brief firing pulse. Bounty labels
  merge by presentation time (0.35 seconds, two tiles), rather than simulation
  timestamps, so one batched multi-second step produces coherent gold feedback.
  Measured text bounds resolve remaining collisions vertically; pools stay capped.
- The 750 G mechanical S1 fixture uses three towers versus the reference's four,
  plus spiked/golem walls and
  a linked launcher. It wins with zero keep damage versus the 1000 G reference's
  1300 damage; both earn 212 G bounty. All three new damage defenses engage.
  These are layout examples rather than proof of optimal balance; no combat or
  economy CONFIG tuning is justified. Only the visual merge window changes.
- Results separate already-earned bounty gold and readable per-type counts.
  Campaign completion totals bounty income from result history and labels the
  final siege rating as the final contract rating; no new scoring rule is added.

## 2026-10-24 — The Frontier Commission stage (user brief, controller-frozen design)

A second, independently selectable stage. The player is a hired engineer
defending an *existing* settlement under a contract. The canyon campaign is
untouched: its 110 existing tests must pass without edits to their assertions.

Architecture
- **Stage configs, not global rules.** A stage object supplies map, settlement,
  siege schedule, rewards model, allowed tools and flags (`battleConstruction`,
  `contractPayment`, `npcDefenders`, `growth`). The canyon stage config
  reproduces current behaviour exactly; Frontier rules live in new modules
  (`src/sim/frontier/*`, `src/data/frontier/*`) and are reached only through the
  Frontier stage. Shared grid/pathing/structures/enemies/mechanisms are reused.
- **Title screen** with "Canyon Keep Campaign" and "The Frontier Commission".
  The canyon campaign starts exactly as before (`createGame()` default stays the
  canyon so existing tests and harness keep working).
- Same 64×36 grid; Frontier maps are open plains with authored terrain features
  (river/ravine/rock outcrops as impassable `#`, fords/bridges), not the canyon.

Contract economy (controller modifications to the brief, with reasons)
- **The construction budget is the client's money, not earnings.** Unspent
  budget is not paid to the player (otherwise "build nothing, pocket the budget"
  dominates). It *is* the only source of battle-time makeshift construction —
  holding gold in reserve is the trade-off.
- **Assessed value** is recorded at contract acceptance: `value × hp/maxHp`.
  Liability per building = `assessed × (hpStart − hpEnd)/hpStart`; destroyed ⇒
  the full assessed value (one charge, never partial + destroyed). Pre-existing
  damage is never charged. Mayor deduction = liability × `damageLiability`
  (config, ~0.5) + per-civilian casualty penalty, capped at the base fee:
  payment is clamped to ≥ 0, no debt.
- **Mandatory objective fails ⇒ contract failed:** no base fee, no mayor
  bonuses. Owner rewards for promised buildings that survived are still paid by
  their owners (independent parties); kill bounties stay earned.
- Earnings are listed in three separate groups: mayor payment (itemized),
  owner rewards (promised + thank-you), kill bounties. Results are computed once
  and flagged paid; retry restores the pre-siege snapshot and cannot duplicate.
- **Unpromised thank-you payments:** deterministic — each unpromised civilian
  building with assessed value ≥ a threshold that took no siege damage pays
  `thankYouRate` of its value; total capped (config).
- **Rating** from value-preserved %, casualties, mandatory/special objectives and
  promises kept: Exceptional Engineering / Strong Defense / Acceptable Defense /
  Costly Victory / Contract Failed, each with stated reasons. Kills don't count.

Promises & negotiation
- Requests appear as markers on owners' buildings; a panel shows owner, building,
  condition, value and *why* it matters (one line per building type). Options:
  Promise / Decline / Ask more (requires Communication ≥ stated level, +50%
  reward, deterministic) / "Defend it yourselves" (owner self-defends with NPC
  barricades or a hired guard per that owner's rule; no reward, no promise).
- Broken promise: reward lost, reputation −1 (contract-local, shown in rating
  reasons). Declining costs nothing. Contract journal lists all of it.
- Workshop "funds for your next commission" becomes an immediate payment: there
  is no cross-contract economy in this pass.

NPCs
- Simple state machines only. Guards hold a post (keep by default), engage
  enemies within a radius, return to post; militia likewise for a district, are
  weaker, and retreat below 30% HP. Civilians evacuate along walkable paths to the
  keep at siege start; walls block them, gates pass friendlies.
- **Reassignment moves existing guards** (the keep's count visibly drops). It is
  a mayor request gated by Communication with a stated rule (e.g. "Comm 2: up to
  2 guards", "Comm 3: up to 4"). No battle micromanagement.
- NPC self-defense structures are placed at Start Siege on free tiles adjacent
  to their building, never over player structures, never sealing the trade
  route or a building's last access; skipped deterministically otherwise. They
  never cost the player's budget.

Two construction classes
- Class A (wall, gate, towers, spiked, golem, launcher, sensor, retractable,
  pendulum): preparation only. Class B (barricade, palisade, caltrops):
  prep or battle. Frontier only; the canyon gets no battle construction.
- Battle build: costs budget gold (×1.0), hard cap per siege (`emergencyCap`
  gold) and a max of 3 sites under construction at once; build time 2.0 s base
  minus Field Engineering. The site is non-blocking while building; it completes
  only when no enemy/NPC occupies it (waits, like retractable walls). Cannot
  place within 1 tile of an enemy, on rubble of a destroyed Class A piece in the
  same siege, or where it would seal every enemy route to the keep. No battle
  demolition or refunds. Kill bounties never refill the budget.

Skills (Milestone E)
- Four skills, starter values Communication 2, Structural 1, Field 1,
  Mechanical 1, max 4. Each level has one visible effect (Structural +5% Class A
  HP per level above 1; Field −0.3 s build time per level above 1; Mechanical
  −8% device cooldown per level above 1; Communication gates options). Effects
  apply only in Frontier. A completed contract grants 1 development point
  (2 for Exceptional); the career record is kept by the UI in localStorage
  (try/catch, optional) and passed into the sim as plain data.

Procedural contracts (Milestone F)
- Seeded and template-guided: authored terrain patterns × procedural building
  clusters for three archetypes (Compact Town, Twin Settlements, Town + Outpost).
  Validation as listed in the brief; deterministic reject-and-reseed up to N
  tries, then the handcrafted fallback. Seed shown; "Generate New Contract",
  "Replay Contract", "Enter Seed" added only after generator tests pass.
  Twin Settlements: both keeps mandatory and the budget is shared.

Deferred / rejected for this pass
- Cross-contract economy and persistent reputation; elaborate social sim.
- Titan's Pendulum only appears on Frontier maps that author a pendulum site.

## 2026-10-24 — Frontier Commission slice 1 implementation decisions

- Stage descriptors supply terrain, settlement selection, siege data, payment
  model, tool list, targeting and feature flags. An absent stage ID resolves to
  the canyon descriptor, preserving default factory state and numeric seeds.
  Frontier selection constructs a fresh independent contract; the UI alone
  opens the title at boot. Stage-aware grid queries retain their original
  two-argument canyon behavior.
- Owned properties remain in the shared structure list, so all existing damage,
  explosions and occupancy systems apply. Owner metadata extends the existing
  civilian tool-protection rule to shops, warehouses and the workshop, including
  destroyed footprints. Property-specific flow fields reuse the shared breach
  algorithm and revision invalidation; each raider commits to at most one
  property before returning to the keep route. The Frontier brute ignores
  civilian/golem distractions and advances along the keep breach field.
- Acceptance assessments are independent of the Start Siege retry snapshot.
  Each property contributes one current loss against its acceptance HP. Cash
  values round to cents after calculation; pre-existing damage is excluded.
  Finalization records paid results once and never puts earnings into client
  construction gold. Failure still honors surviving independent owner promises.
- The workshop's immediate payment is a conditional owner advance, shown in
  the contract earnings ledger at acceptance and reconciled in final owner
  rewards. Breaking its promise yields zero final reward, without debt or a
  negative construction budget. This preserves both the immediate-payment
  request and the frozen broken-promise rule within a single contract.
- Slice 1 records self-defense intent and renders already-posted static keep
  guards. NPC AI, guard reassignment, emergency construction, skill advancement
  and procedural generation are deliberately deferred to their named slices.

## 2026-10-24 — Frontier Commission slice 2 implementation decisions

- Frontier stage flags enable autonomous NPCs and emergency construction through
  stage-only lifecycle hooks. Canyon retains its inhabitants, combat/economy,
  schedules and tool permissions; its 110 test assertions remain unchanged.
- Guards, district militia, civilians and enemies pursuing NPCs use bounded,
  orthogonal friendly/enemy path searches. Gates and the keep pass friendlies;
  failed routes are cached against goal/position/structure revision and produce
  explicit shelter/hold states rather than endless blocked movement. Militia
  retreat is latched below 30% HP. Frontier explosions and brute slams can kill
  exposed defenders/civilians; shelter protects evacuated civilians.
- Guard requests specify the desired total at a named post. Limits apply across
  all guards moved from the keep (Comm 2: two; Comm 3+: four), and requesting
  zero recalls that post. These are the same four professional guards, with
  changed positions/counts; owner-hired guards are separate and cannot be
  reassigned. There are no battle orders.
- Owner defenses deploy after the exact retry snapshot, before evacuation.
  Stable perimeter order picks free adjacent cells, preserves trade access and
  every property's last access, and skips unsafe pieces. They cost zero and
  carry `npcOwned`/owner-building metadata. Merchant self-defense hires a guard;
  the authored stubborn barn owner deploys palisades. Journal entries record
  deployed/skipped state and concrete piece/guard IDs.
- Class B battle placement reserves budget and cap gold immediately. Sites
  remain outside structure occupancy until their timer and live-unit clearance
  permit completion. Route checks count all reserved blocking footprints to
  prevent simultaneous sites closing the final enemy route; completion rechecks
  route safety after intervening changes. Destroyed Class A footprints,
  including awakened golem walls, remain prohibited for that siege. Timers,
  waiting states, spent/cap gold and destroyed footprints are exposed as plain
  semantic state. Starter Field 1 has no reduction; the frozen Field reduction
  hook is present without progression UI.
- Palisades are 12 G/100 HP (barricades stay 8 G/70 HP). Walkable caltrops cost
  10 G, hit each entering enemy once for 4 damage and a two-second 50% slow,
  then expire after ten uses. Emergency supply spending is capped at 120 G per
  siege, with three sites and a two-second base timer. All tuning is in CONFIG.
- Whole-gold accounting supersedes slice 1's cents. Assessments and each
  building liability round first; district/contract totals sum those integers.
  Payment line items also round before summation. Preservation percentages keep
  one decimal, and displayed monetary lines reconcile exactly with totals.
- The handcrafted settlement now has 24 civilian buildings plus the keep:
  eleven houses, four shops, two warehouses, workshop, five farms and barn.
  Bending river banks and branched roads retain the central ford. Distinct type
  sprites make protection choices readable. The existing 800 G budget and
  public-action defense fixtures still demonstrate distributed protection,
  exposed-district losses and empty-defense defeat, so no canyon or Frontier
  siege balance was changed in this slice.
- The title uses a full-width centered pair of cards and hides game HUD/build
  controls. Frontier battle presentation adds live objective/property/civilian/
  promise/supply observations and visible site progress/waits. Controller/Claude
  owns visual judgment; no browser acceptance or screenshot run was performed.

## 2026-10-24 — Frontier Commission slice 3 implementation decisions

- Frontier receives a normalized copy of four skill levels at contract start.
  Structural changes only player Class A maximum HP; client property and
  Class B retain their authored HP. Mechanical scales device cooldowns at
  activation/reset, leaving volley, rise/hold and swing durations unchanged.
  Field uses the frozen reduction and 0.8-second floor. Placement still uses
  the same footprint, terrain, support, route and affordability checks.
- The UI owns a small career record and optional guarded localStorage access.
  Awarded contract-session tokens live outside simulation and retry snapshots;
  a paid victory awards once, failure never awards, and a later successful
  retry of a failed contract can award. Fresh replay/restart is a new played
  commission. Spending and reset happen on the title before acceptance;
  neither earnings nor reputation carry into construction budgets.
- Generated commissions combine three authored terrain patterns with seeded
  irregular lots and a connected road tree. Compact Town, Twin Settlements
  and Town + Outpost each have three valuable districts. Acceptance value
  scales the shared budget within Frontier-only CONFIG limits. Entries vary
  across east and north/south edges; scouts count the actual generated schedule.
  Owner requests draw from a data pool with seeded owner names.
- Validation rejects unsafe objectives, blocked access, overlapping lots,
  disconnected roads, unreachable keeps, insufficient defensive space and
  missing district choices. Attempts use deterministic seed mixing, capped at
  eight, then clone the handcrafted fallback. Test hooks can force rejection
  but cannot bypass validation. Contract metadata records attempts, reasons
  and fallback. String seeds normalize to the displayed uint32 before both
  map generation and simulation RNG initialization, so displayed-seed replay
  also reproduces actor/RNG state.
- Both Twin Settlements keeps are mandatory. Frontier breach fields use all
  living keeps; civilians route toward their nearest keep and emergency blocking
  construction preserves routes to every keep. The Canyon single-keep path
  and loss rules remain unchanged.
- Special objectives protect a named warehouse/store/infirmary, or require
  at least 80% of the farming district's original properties to remain
  standing (building count, including barns). Each states location,
  mandatory/optional status, reward and penalty. Mandatory failure ends the
  commission; optional loss reduces the nonnegative mayor fee and prevents
  Exceptional Engineering. Special penalties are separate result line items.
- Balance fixtures select a keep-focused scenario from its initial optional
  objective briefing, before combat; sacrificing a mandatory outlying
  objective is intentionally not a valid keep-only plan. Full rectangular
  district curtains provide a transparent equal-defense estimate, not a
  claim about minimum-cost terrain-assisted protection. No existing Canyon
  or handcrafted Frontier combat, reward or construction prices were tuned.
- Final `npm test`: 169 passed, 0 failed, including the original 110 Canyon
  assertions. Generator checks sweep 30 seeds per archetype without fallback.
  Keep-focused generated victories use Compact seed 2 (82.6% preserved),
  Twin seed 3 (73.3%; keeps 2000/1220 HP), and Outpost seed 1 (73.8%).
  The controlled reassignment fixture isolates simultaneous farm/keep contacts:
  farm liability 180→0 G trades keep HP 2000→1646. A negotiated hamlet promise
  pays 150 G against 140 G dedicated defenses in a full-contract victory.
  Early fixture failures were traced: isolated guards died before later
  full-schedule raids; even tower allocation left the southern twin keep
  facing a 69-HP brute. Fixtures now isolate the guard mechanism and weight
  southern tower coverage. Product balance was not changed to fit the tests.
  No controller acceptance, browser suite or visual evidence was produced.

## 2026-10-24 — Generated contracts: real variety (controller review)

Review of slice-3 seeds found the "river" was a porous column of water blocks,
the town district was the same rectangle on every seed, and budgets were
clamped to the minimum. Changed: four terrain patterns (river-fords,
river-bend, ridge-passes, open-outcrops); rivers are a continuous seeded walk,
2–3 tiles wide, with 1–3 two-row bridge/ford crossings rendered as planks or
stepping stones (the handcrafted ford now renders the same way; its data is
unchanged); district position/size jitter per seed with overlays drawn from the
actual clusters; budget = base + assessed×rate + raiders×perRaider, clamped
600–950. In-game skills collapse to one hover line so the five-category palette
still fits 1366×768; the full skills panel stays on the title screen.
Rejected: arbitrary noise terrain (the brief asks for authored patterns first).

## 2026-10-24 — Central castles and multi-directional sieges (user brief, controller-frozen)

Applies to generated Frontier contracts. The canyon stage is untouched. The
handcrafted Frontier contract keeps its layout and east-only schedule as the
"single major front" reference (its fixtures stay valid).

- **Layout follows the threat.** Generation picks the siege plan (fronts) and
  places settlements relative to the map centre: the primary keep within
  ~6 tiles of centre (jittered, never exactly centred), neighbourhoods around it
  asymmetrically, farms/outskirts outward, satellite hamlets toward some edge.
  Twin Settlements: two keeps on opposite or diagonal sides of centre, ~16–26
  tiles apart, no single central keep. Terrain patterns must not cut through
  the town (rivers/ridges offset from the centre or crossing it with bridges).
- **Fronts:** 8 compass directions (N, NE, E, SE, S, SW, W, NW); entry regions
  on the matching edge/corner. Plans: single front; main + secondary; main +
  diversion(s); 3–4-direction encirclement. Never mandatory four-way. Weights
  are unequal by default (e.g. 70/20/10); enemy totals stay as budgeted, each
  group is assigned to one front; bosses travel with the main front.
- **Waves:** a contract siege may have two waves; wave 2 may shift the main
  front ("staggered fronts" and "principal direction changes" are expressed
  inside one siege, since Frontier contracts are single-siege). Multi-siege
  contracts are deferred.
- **Intel is honest but approximate.** Edge arrows sized by band (Major ≥50%,
  Secondary 20–49%, Minor <20%) — no exact counts or times. Every front that
  will attack is shown. Minor fronts may be labelled "possible raiding party"
  (uncertain) but never omitted. Wave-2 shifts are reported as "a second wave
  may come from X". In battle, an edge warning appears ~5 s before any group
  enters from a front that has not yet attacked.
- **Validation adds:** every spawn on the map edge and ≥ 8 tiles from any
  district; every front has a walkable route to a keep; roads lead from
  most fronts toward the town; no front unreachable-by-terrain; the main front
  carries ≥ 50% of strength; seed-determinism includes the siege plan.
- **Anti-ring rule (balance fixture):** the cost of walling the map's full
  inner perimeter, or a closed ring around every district, exceeds the budget
  by a wide margin, and a front-weighted plan preserves more value than an
  evenly spread plan of the same cost on at least one seed per archetype.

## 2026-10-24 — Multi-directional sieges: implementation decisions

- "Main front ≥ 50%" is enforced **per wave**: a shifted second wave can make
  two fronts nearly equal overall (e.g. 55/45) while each wave stays clearly
  unequal. Requiring it overall would have made wave shifts almost impossible.
- Scout intel gives a total rounded to 5 ("roughly 20 raiders") and banded
  per-front strength; chiseler/powder numbers become "a few / several / many".
  The old exact-count bullet and its test were replaced.
- Balance finding: putting every tower on the main front often loses because
  diversions and second waves reach the keep; an even ring around the keep
  usually wins but leaks value; a plan weighted by the scout bands won 30/36
  sweep runs vs 28/36 for even rings, each better on different seeds. The
  fixture asserts the weighted plan beats an equal-cost even ring on seed 1
  (multi-front in all archetypes) rather than claiming it always does.
- Rivers/ridges are kept out of districts entirely (no bridged towns) so the
  existing continuity/crossing rules hold; they now run horizontally or
  vertically. Centre jitter is ±3×±2 tiles plus ±2×±1 keep jitter (≤6.5 tiles).
- Same seed across archetypes shares the first RNG draws, so plans/terrain can
  look alike between archetypes on one seed; accepted (seeds still differ).

## 2026-10-25 — Fortress Engineer & Garrison update: frozen design (controller)

Scope and preservation
- **Frontier-only changes.** Gate HP 130, reusable golems, emergency repairs,
  spendable bounties, garrisons, infirmary, archers and cavalry apply only to
  `stageId==='frontier'`. The canyon campaign keeps gate 180 HP, its one-shot
  golem and its existing bounty flow, because preserving the authored
  three-siege balance outranks a global stat change. Rejected: global gate/golem
  changes (would silently rebalance the reference campaign fixtures).
- The handcrafted Frontier contract keeps its 4 footmen (its fixtures depend on
  them); generated contracts get seeded garrisons.

Economy
- **Funding order in battle:** emergency spending (Class B sites and repairs)
  draws client funds first, up to the existing 120 G client emergency allowance,
  then earned bounty gold, which has no cap. The HUD shows one combined
  treasury; the ledger keeps `clientEmergencySpent`, `bountyEarned`,
  `bountySpent` separately. Spam stays limited by build time, 3 simultaneous
  sites, a cap of 12 living makeshift (Class B) structures, placement rules,
  and no rebuilding destroyed Class A.
- **Final pay:** engineer earnings include only *unspent* bounty
  (`bountyEarned - bountySpent`); results list gross bounty, battlefield
  spending and unspent bounty. Unspent client funds stay the client's.
- Retry restores the pre-siege snapshot including the ledger; death bounties
  are keyed by enemy id so repeated death processing pays once.

Repairs
- **Pay-as-you-go:** emergency repair is charged per HP actually restored, at
  1.5× the preparation repair price per HP. An interrupted or unaffordable
  repair stops; HP already restored is kept and was already paid; nothing is
  reserved or refunded. Rejected: up-front reservation (refund edge cases).
- Allowance 25% of max HP per structure per siege, cumulative; one repair
  restores the remaining allowance over 5 s × Field multiplier
  (L1 1.0, L2 0.85, L3 0.7, L4 0.55). Blocked within 3 sim-seconds of the last
  enemy damage event; damage during repair interrupts it.

Engineer creation
- All skills start at 1 + 3 free points, each ≤ 3 at creation; 4 via career.
  Presets: Diplomat C3 S1 F2 M1; Fortress Expert C1 S3 F2 M1;
  Field Engineer C2 S1 F3 M1; Mechanist C1 S2 F1 M3.
- **Legacy careers** (existing v1 record with any progression) keep their
  skills/points untouched and are only asked for a name and portrait. An
  untouched default record counts as no career. Starting a new career discards
  the old progression, so re-creating never yields free points.
- Reputation = average rating score of the last 10 contracts; history keeps
  the last 20 (seed, archetype, rating, earnings).

Garrisons
- Strength budget: footman 1, archer 1.2, cavalry 2. Any non-empty subset of
  types is valid; seeded from size, wealth, archetype and difficulty; cavalry
  weighted down in poor settlements but never forbidden.
- **Archer wall network:** nodes are intact wall/gate/spiked/dormant-golem
  tiles and integrated towers, 4-connected. Access points are towers, the two
  wall tiles flanking a gate (gatehouse stairs) and walls touching the keep.
  Archers never occupy ground collision; if their tile is destroyed they drop
  to an adjacent walkable tile, take fall damage and are briefly stunned.
  Without reachable battlements they fight from the ground near the keep.
- **Cavalry** sortie through intact friendly gates only, using the friendly
  route graph (gates passable, walls not); slower in caltrops and narrow
  tiles; with no route home they shelter outside the nearest gate and fight
  defensively.
- Infirmary per keep: 2 patients, 3 HP/s each, 120 HP pool per siege;
  conventional units only, never while fighting, stops if the keep falls.

Golems (Frontier)
- Dormant 240 HP, active 160 HP max, HP fraction preserved across forms.
  Guard leash 1.5 tiles, Patrol 4 tiles; 20 s active, 30 s cooldown.
  Mechanical: cooldown −8/16/24% (L2–4), return speed +10/15% (L3–4).
  Manual release or auto-awaken at ≤ 50%. If the breach is occupied the golem
  waits nearby and keeps fighting until it can reform (no timeout death); a
  dead golem leaves the breach open for the siege.

## 2026-10-25 — Frontier Commission Phase A implementation notes

- Implements only the frozen economy, emergency repair, gate and breach-routing
  rules. Later garrison, character, infirmary and golem work remains deferred.
- The true preparation state is cloned before battle initialization. Battle
  initialization takes remaining prep gold as the client balance and clears
  attempt-local ledger/death IDs/repair state. Retry restores every original
  field, and starting again creates the same baseline without farmable earnings.
- `emergency.constructionFunds` is remaining client money in battle; `spent`
  remains a compatibility total of construction plus repairs. Dedicated source
  and purpose fields are authoritative. Payment uses fractional HP/gold; existing
  whole-gold final-payment rounding is unchanged. Results explicitly distinguish
  spending from bounty amounts so only unspent bounty contributes to earnings.
- Makeshift capacity includes surviving player prep works and reserved sites;
  client/NPC self-defense pieces are excluded from the player's twelve slots.
- A repair limited by missing HP restores that amount over the full configured
  Field-adjusted duration. Starting requires positive spendable funds, permitting
  partial repairs; cancellation is a headless API action and retains cumulative
  allowance. Enemy melee/slams and powder blasts carry an explicit enemy damage
  source; pendulum friendly fire does not reset the damage-free timer.
- Major-road exits are actual road tiles on the boundary or adjacent to a spawn
  (the handcrafted road ends just before its eastern spawn). Each living keep
  requires friendly access to every such exit. The advisory names failed pairs.
  Auto-gates belong to wall-line placement; a deliberate single wall replacement
  preserves all mandatory routes. Footpath/decorative metadata is ignored.
- Frontier breach costs are per-type HP weights with a gate multiplier, cached
  by enemy type/target/revision. Canyon keeps the original shared field/costs.
