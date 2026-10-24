# Canyon Keep — Frozen Prototype Spec

Standalone 2D top-down castle-engineering / siege-defense prototype.
Source brief: the user's "CASTLE DEFENSE — Standalone 2D Gameplay Prototype" plan.
This file is that brief **as accepted and amended by the design lead**. Where the
two disagree, this file wins. Unrelated to `../castlerush` — never read, import or
modify it.

Guiding principle: *a small castle-engineering game, not road-side tower defense.*
The player is the client's hired fortress engineer. Gold funds military works;
the client owns and automatically grows houses, farms and the population.
Designing, testing, repairing and improving the castle is the fun.
Prefer a finished minimal mechanic over an elaborate unfinished one. No scope
beyond this file (no elaborate RPG, crafting, multiplayer, or
ladders/tunneling/flanking AI). Frontier's procedural contracts, small career
record and emergency construction are stage-specific exceptions below.

## Reading this specification: shared systems and stage boundaries

Section 1 specifies the shared technical contract. Sections 2–12 specify the
**Canyon campaign**, including its map, balance, construction restrictions,
three-siege progression, civilian behavior and treasury. Section 13 specifies
**The Frontier Commission** and explicitly overrides shared behavior only for
that stage. The 2026-10-24 frozen design decision governs Frontier's scope.
Shared grid, structures, combat, mechanisms, rendering and snapshot machinery
are reused through stage descriptors; Frontier career storage is UI-owned.

---

## 1. Tech contract

- HTML5 Canvas 2D, vanilla JS **ES modules**, CSS for HUD/menus. No engine, no
  build step, **no runtime npm dependencies**.
- `package.json` with `"type": "module"`, scripts `"start": "node serve.js"`,
  `"test": "node --test test/"`. `serve.js` is a zero-dependency static server
  on port 5180 (configurable via `PORT`). `start.bat` runs it and opens the browser.
- **Simulation is pure and headless**: everything under `src/sim/` and `src/data/`
  and `src/config.js` must run in Node with no DOM, no `window`, no `Math.random`,
  no `Date.now`. Seeded RNG (`src/sim/rng.js`, mulberry32) lives in game state.
- Fixed timestep: `SIM_DT = 1/60`. Render loop interpolation is optional. Speed
  controls (pause, 1×, 2×, 4×) run 0/1/2/4 sim ticks per 1/60 s of real time
  (accumulator, capped to avoid spiral of death).
- Game state is one plain JSON-serializable object (no class instances with
  hidden state, no Maps/Sets in persisted state — use arrays/objects; transient
  per-swing hit sets may use arrays of ids). `structuredClone` snapshots must work.
- Debug/acceptance surface: `window.__game` exposes `{ state, api }` where `api`
  has `place(type,x,y,{facing}?)`, `placeLine(type,x0,y0,x1,y1)`, `demolish(x,y)`,
  `toggleLink(sensorId,deviceId)`, `cycleSensorDelay(sensorId)`,
  `rotateLauncher(id)`, `mechanismWarnings()`,
  `canStart()`, `readiness()`, `price(type)`, `blockedRoadTiles()`,
  `startSiege()`, `triggerPendulum()`, `setSpeed(n)`, `stepSeconds(s)` (runs sim
  synchronously), `retrySiege()`, `restartCampaign()`, `phase()`.

### Module layout (frozen)

```
index.html  styles.css  serve.js  start.bat  package.json
src/config.js            ALL tunable numbers (economy, HP, damage, speeds, radii, timings, rewards)
src/data/map.js          hand-authored ASCII map + zone/site metadata
src/data/sieges.js       scripted wave schedules for sieges 1–3
src/sim/rng.js           seeded RNG
src/sim/grid.js          tile queries, terrain, occupancy
src/sim/build.js         placement validity, cost, line placement, demolish/refund, repair, trade-road check, capacity
src/sim/pathing.js       breach-cost flow field (Dijkstra) toward the keep
src/sim/enemies.js       enemy spawning, movement, target selection, attacks, boss windup
src/sim/towers.js        archer targeting + arrows
src/sim/explosions.js    powder-carrier detonation queue + chain reactions
src/sim/pendulum.js      Titan's Pendulum state machine + sweep hit detection
src/sim/inhabitants.js   idle/flee/shelter behaviour
src/sim/golems.js        temporary leashed wall defenders, slams and expiry
src/sim/mechanisms.js    device registry, sensor detection, links, bolts, retractable timers
src/sim/siege.js         createSiegeState, stepSiege(state, dt), end conditions, event log
src/sim/campaign.js      campaign state, snapshots, retry, rewards/penalties, population growth
src/sim/settlement.js    performance rating, deterministic client settlement growth
src/render/*.js          terrain cache, structures, units, effects, overlays (reads state only)
src/ui/*.js              HUD, build palette, results screen, input → api calls
src/main.js              boot, loop, wiring
test/*.test.js           node:test suites on sim modules only
```

Renderer and UI **never mutate sim state** except through the api functions.
Visual effects (dust, debris, shake, floating numbers) are driven by events the sim
pushes onto `state.events` (observed with a renderer-owned cursor), so sim stays pure.

## 2. Map — The Canyon Keep (`src/data/map.js`)

- Grid **64 × 36 tiles**, tile = 20 logical px → 1280 × 720 logical canvas,
  scaled to fit the window (letterboxed, crisp). Whole map always visible:
  **no camera scrolling** (amended from brief; the map fits one screen).
- ASCII legend: `#` cliff (impassable, unbuildable), `.` canyon floor (buildable),
  `C` castle-zone floor (buildable),
  `K` keep footprint (3×3), `S` enemy spawn edge tiles, `1`/`2`/`3` pendulum
  mount sites (cliff tiles that anchor a pendulum; impassable).
- Shape requirements:
  - Spawn at the far **left** map edge. Canyon winds with **at least two clear
    bends** (e.g. east, then south-east, then east again) before opening into
    the basin on the right third of the map.
  - Width profile: entrance stretch 5–6 tiles; **one choke of 3 tiles** about
    40% along; mid stretch 6–8; widening to the basin; basin ≈ 20 × 18 tiles of
    `C` with the keep near the back (right) wall.
  - Exactly 3 pendulum sites, each on a cliff edge at a different stretch
    (one before the choke, one at a bend in the mid stretch, one near the basin
    mouth). Each site's metadata: pivot tile, arm length (tiles), start angle,
    end angle — the sweep arc must cross the full canyon width at that point.
  - Cliffs fully enclose everything else; the only entry is the spawn edge.
- Terrain must read instantly: sandy floor with subtle noise, dark layered cliffs
  with a lighter rim/shadow edge where cliff meets floor, castle zone a slightly
  greener/paler tint with a faint dashed border.
  Render terrain once to an offscreen canvas.

## 3. Structures & construction (`src/sim/build.js`, values in config)

| Type | Cost | HP | Size | Notes |
|---|---:|---:|---|---|
| Wall | 20 | 200 | 1×1 | blocks; drag to place lines; auto-connects visually |
| Gate | 60 | 180 | 1×1 | blocks enemies; **counts as open for the trade-road check** |
| Spiked Wall | 35 | 170 | 1×1 | blocking wall; deals 12 DPS to every enemy attacking it in melee |
| Golem Wall | 90 | 240 | 1×1 | blocking dormant defender; awakens once at ≤50% HP during battle |
| Proximity Sensor | 15 | invulnerable | 1×1 | walkable detector; links up to three devices |
| Launcher | 70 | 200 | 1×1 | supporting wall; trigger-controlled directional piercing volley |
| Retractable Wall | 45 | 200 raised | 1×1 | lowered by default; temporary triggered blocker; no tower support |
| Barricade | 8 | 70 | 1×1 | cheap forward obstacle |
| Archer tower | 120 | 250 | 1×1 | range 6.5 tiles, 12 dmg, 1.0 shot/s, arrows are visible projectiles |
| House (client-owned) | free growth | 120 | 2×2 | +4 housing |
| Farm (client-owned) | free growth | 100 | 2×2 | +6 food |
| Titan's Pendulum | 400 | — | site | one only, on a site; not attackable |
| Keep (pre-placed) | — | 2000 | 3×3 | goal; housing 6, food 6; not demolishable |

Rules:
- Houses and farms have no player tools. Placement, line placement, previews,
  demolition, replacement and repair cannot change houses, farms or the keep,
  including destroyed civilian footprints. Repair all affects military works only.
  Civilian construction and rebuilding are automatic and charge no gold.
- Floor tiles (`.`/`C`) only; no overlap with cliffs, keep, other
  structures, or the spawn column + 2 tiles in front of it.
- **Towers**: anywhere in the castle zone (`C`), or on canyon floor only if
  **orthogonally adjacent to a supporting wall-family piece** (wall, gate,
  spiked, golem or launcher; "integrated into the castle"). Retractable walls
  never support towers. CONFIG family, supportsTower,
  military and line flags define replacement, support, settlement and drag rules.
  Demolishing a wall that would leave a canyon tower unsupported is refused
  with a reason.
- **Trade-road rule:** preparation construction may seal the canyon or enclose
  the keep. Start Siege requires a 4-connected route from the spawn edge to
  the keep over floor/**gate** tiles, blocked by walls, barricades,
  towers, houses, farms and cliffs. Sensors and lowered retractable walls are
  traversable. Terrain, overlap, footprint, tower support,
  spawn safety and gold checks still apply to placement. Enemies treat gates
  as solid; their pathing is unchanged.
- Wall, gate, spiked, golem, launcher and retractable tools replace any other living wall-family piece atomically
  with a full-HP structure, including inside a sealed line. The net is the new
  price minus the old structure's HP-scaled refund; only a positive net amount
  must be affordable. Failure leaves the state unchanged. The replacement records
  its full purchase price, preserves adjacent tower support, and updates occupancy,
  flow field and wall connections. Other occupied tiles remain invalid.
- In preparation in either stage, the Tower tool also replaces a living,
  player-owned ordinary wall atomically. Gates, special walls, towers and
  non-player structures cannot be replaced by towers. Affordability uses the
  full tower price minus the wall's HP-scaled refund (100 G for an intact wall,
  110 G at half health); the tower records its full purchase price for refunds.
  Outside `C`, the new tower needs an orthogonal supporting neighbour, and
  replacing the wall must not leave another tower unsupported. Towers remain
  single-placement tools and cannot be built during Frontier battle.
- Left-click places; drag with Wall, Gate, Spiked Wall, Golem Wall or Barricade places a 4-connected line
  (L-shaped: horizontal then vertical leg); family lines replace crossed family
  pieces and skip matching existing structures at no charge.
  Preview shows each tile green/red and the total net cost or refund; on release
  places every valid tile in order until gold runs out. Right-click or Esc cancels
  tool. Hotkeys: 1 Wall, 2 Gate,
  3 Barricade, 4 Tower, 5 Spiked Wall, 6 Golem Wall, 7 Pendulum, X Demolish,
  8 Sensor, 9 Launcher, 0 Retractable Wall, L Link, R Repair (or rotate the
  launcher placement/selected launcher clockwise), Space pendulum
  (siege), P pause, F speed cycle.
- Demolish during prep: refund `round(paidCost × hp/maxHp)` (refund rate 1.0).
  Destroyed structures/rubble refund zero. Client buildings cannot be moved.
  Tower-support restrictions still apply.
- Repair (prep only): button "Repair all" + click-repair with the demolish-style
  tool; cost `ceil(cost × 0.5 × missingHp/maxHp)`. Destroyed structures leave
  rubble markers in prep (shows where breaches happened) and can be rebuilt at
  the current placement price.
- No construction during siege.
- Spikes use the shared enemy damage/death path, so all kills pay bounties.
  Each attacker receives a small spark/flash, throttled to once per 0.2 s.
- Any battle damage that brings a golem wall to ≤50% HP (including a lethal hit)
  consumes the wall and spawns one 350-HP golem at its centre. The wall leaves
  no rubble or refund; occupancy opens, cached enemy steps clear and the flow
  field rebuilds immediately through flowRevision. Emergence has visible cracks,
  dust, a short screen shake and procedural sound.
- Golems pursue enemies at 1.6 tiles/s while staying within 3.5 tiles of their
  origin. They never attack structures or walk through blockers. A ready slam
  hits all enemies within radius 1.2 for 35 damage, 1-tile collision-safe knockback
  and 0.8 s stun (including bosses), with 1.2 s between slams. Kills pay bounties.
  Enemies chase directly reachable golems within 2.5 tiles and use their existing
  unit DPS against them. Explosions damage golems as exposed units.
  Golems crumble at 0 HP or after 30 s and clear on Continue/start/retry;
  unawakened walls and their damage persist normally. The pendulum is unchanged.
- Hover/selection shows tower range circle; selecting the pendulum tool shows
  all 3 sites with their full sweep zones; a placed pendulum always shows its
  zone faintly during siege.

### Mechanical triggers

- CONFIG structure blocking flags separate occupancy from collision. Sensors
  have `blocks:false`, are never targeted or damaged, and contribute no breach
  cost, trade-road obstruction or settlement enclosure. They still occupy their
  construction tile. Nonblocking mechanisms do not consume explosion structure slots.
- Sensors detect living enemies, including bosses, within 1.5 tiles of the
  sensor tile centre. A detected presence latches a delay of 0/0.5/1/2 seconds,
  then activates each linked living device through the type registry's
  `activate(state,device)`. A latched delay finishes even if the enemy leaves.
  Firing starts a six-second cooldown; a standing enemy can trigger once per
  cooldown window. Inhabitants and golems never trigger sensors.
- The Link tool selects a sensor, then toggles launcher/retractable links (max
  three). Empty ground or Esc clears selection. The sensor panel lists linked
  devices, cycles delay and shows readiness. Links and configuration survive
  retries and sieges; demolished/replaced IDs are removed, with no inherited
  wiring on replacement. Destroyed targets are ignored when firing.
- Launcher facing N/E/S/W is chosen before placement with R, or changed using
  its prep configuration panel. Its preview shows the clipped firing lane.
  Activation fires three piercing bolts 0.25 seconds apart; cooldown is five
  seconds from activation, with busy activations ignored. Each bolt travels at
  24 tiles/s, for at most 12 tiles from the launcher centre, damaging each enemy
  once for 30 when within 0.45 tiles of the lane centre. Cliffs and blocking
  structures stop bolts at their near face. Shared enemy damage pays bounties.
  Unlinked launchers never fire automatically. Bolts and muzzle flashes are visible.
- Retractable walls start every siege lowered, preserving any prior damage.
  Activation rises over 0.4 seconds, blocks only when fully raised, holds eight
  seconds, lowers over 0.4 seconds, then cools down for six seconds. Raised
  walls can be attacked and destroyed into rubble; lowered walls take no damage.
  Pending/busy activations are ignored. An occupied rise waits: any living
  enemy, inhabitant or active golem within 0.6 tiles of the centre prevents it.
  The whole footprint is also checked to avoid trapping a unit at a tile corner.
  Occupancy is rechecked throughout the rise, restarting the animation if needed;
  1.5 seconds of accumulated occupied waiting skips the activation and starts
  cooldown. No units are moved or crushed. Mechanisms update after unit movement;
  each completed raise/start of lowering rebuilds flow and clears enemy walk targets.
  Continue and retry restore lowered mechanisms; links persist.
- In prep, faint sensor circles and outlined warm-iron dashed chains with end rivets
  explain connections. Selected sensor links are brighter; links remain hidden in
  battle except for a brief bright traveling pulse on firing. Procedural audio accompanies
  activation and machinery. Unlinked devices and empty sensors produce advisory
  warnings under Start Siege; only the trade road disables Start.

## 4. Enemies (`src/sim/enemies.js`, `src/sim/pathing.js`)

| Type | HP | Speed (tiles/s) | Struct DPS | Unit DPS | Special |
|---|---:|---:|---:|---:|---|
| Foot soldier | 40 | 1.6 | 8 | 10 | pillages houses/farms within 1.5 tiles of its route |
| Chiseler | 50 | 1.3 | 24 | 4 | visible chisel, chipping animation + chip particles |
| Powder carrier | 18 | 1.5 | 6 | 6 | explodes on death |
| Giant boss | 1200 / 1700 / 2000 | 0.55 | — | 40 | 1.4 s visible windup, slam 260 to structures in 1.6-tile radius |

**Pathing — breach-cost flow field.** One Dijkstra flow field toward the keep
over 4-/8-connected tiles (no corner cutting past cliffs). Tile cost: floor 1,
cliff ∞, structure `1 + hp × BREACH_COST_PER_HP` (config, start 0.08).
Every enemy follows the field; if its next tile holds a blocking structure it stops and
attacks that structure until it is destroyed. So enemies always walk toward the
**cheapest breach on the direct route** — understandable, never stuck, not
omniscient (they do not detour around the map to find an open gate if a weak
wall is in front of them; cost does the choosing). Recompute the field only
when a structure is destroyed, a mechanism changes blocking state, or at siege start. Units separate softly from
each other (cheap local repulsion) so groups read as crowds, not one dot.

Boss: 3×3-tile visual footprint, follows the flow field as a point, attacks the
structure on its next tile with the windup slam (also damages anything in the
slam radius, including enemies). Huge, readable silhouette with club; HP bar
in HUD when present. Boss is slowed, not stunned, by the pendulum (50% for 2 s).

Enemy targeting inside the castle: within 2.5 tiles of an inhabitant outside the
keep → chase and attack it; otherwise follow field; reaching the keep → attack
the keep. First enemy to touch the keep logs a `keepReached` event **once**.

## 5. Explosions (`src/sim/explosions.js`)

- Powder carrier death enqueues a detonation (`detonated` flag on the carrier
  set immediately — never twice). Detonation fires after `CHAIN_DELAY` 0.12 s.
- Radius 2.5 tiles. Damage falls off linearly to 50% at the edge: units 60,
  boss 140, structures 70. **Cap: one explosion damages at most 6 structure
  tiles** (nearest first) so one blast cannot level a castle.
- Other powder carriers killed by a blast enqueue their own detonations →
  visible staggered chain reaction.
- Events: big flash, shockwave ring at true radius, debris, scorch decal that
  fades, small screen shake.

## 6. Titan's Pendulum (`src/sim/pendulum.js`) — the centerpiece

- One per campaign, bought on one of 3 sites (cost 400). Can be demolished in
  prep for the normal full refund and moved.
- Top-down reading: a massive gantry tower on the cliff at the pivot, a long
  chained arm, and an enormous spiked stone/iron hammer head (≈2.2-tile radius)
  that sweeps an arc across the canyon floor. A winding drum with a ratchet
  visibly turns while resetting.
- State machine: `ready` (hammer raised at start angle, locked) → `released`
  (swing over **1.1 s** with ease-in acceleration, peak speed mid-arc) →
  `resetting` (hammer drifts back and drum rewinds; **20 s**) → `ready`.
  Trigger via HUD button or Space; ignored when not ready.
- Hits: each sim tick during `released`, test entities against the hammer head
  circle. Each entity id can be hit **at most once per swing** (`swingId` +
  hit-id list). Units: 160 dmg + knockback 2 tiles along swing tangent + 1.2 s
  stun. Boss: 450 dmg + slow (never one-shots any boss tier). Powder carriers
  killed this way detonate (chains). **Friendly structures in the sweep take
  120 damage** (so poor placement costs you) — preview zone warns in orange
  where player structures overlap the sweep.
- Feedback: anticipatory creak, whoosh, heavy impact thud, screen shake scaled
  to hits, dust burst along the arc, debris, motion-blur trail on the hammer,
  hit-stop of ~60 ms on big impacts (render-only, never sim).
- It must never block the canyon (it occupies cliff only).

## 7. Inhabitants (`src/sim/inhabitants.js`)

- Each inhabitant has a home (house or keep). Idle: wander within 2 tiles of home.
- When any enemy is within 7 tiles, or any enemy enters the castle zone, flee to
  the keep (speed 2.2) and become sheltered (invisible, safe). Inhabitants are
  only killable while outside. HP 30.
- Distinct look (round bodies, cloth colours, little heads) vs enemies (dark red /
  rust tones, angular, weapons).
- Siege-only; between sieges they show at their homes.
- A brief red "attacked here" marker persists into the results/prep view at
  places inhabitants were attacked; rubble shows breached structures.

## 8. Siege flow (`src/sim/siege.js`, `src/data/sieges.js`)

- Scripted, deterministic schedules: array of `{ t, type, count, spacing, lane }`
  groups. Same build + same schedule → identical outcome (tested).
- Target length ≈ 3–4 min at 1×. Buildup → escalating groups → boss at ~70–80%
  of the timeline with an on-screen "THE BRUTE APPROACHES" banner and horn.
  No empty stretches > 12 s (fast-forward exists anyway).
  - S1 "The First Assault": 46 enemies, few powder carriers, boss 1200.
  - S2 "The Growing Threat": ~75, more chiselers + clustered powder groups, boss 1700.
  - S3 "The Great Siege": ~120, dense waves, powder carriers mixed into chiseler
    packs, two-pronged timing (big group arrives while previous is at walls), boss 2000.
- End: **victory** when schedule exhausted and all enemies (incl. boss) dead;
  **defeat** when the keep is destroyed or every inhabitant is dead.
- Breaches matter through rewards; a breach alone is not defeat.
- Every preparation opens a dismissible "SIEGE N — SCOUT REPORT" card, after
  the growth report on Sieges 2–3 and before building. A small prep-footer
  "Scout report" button reopens it. Three or four short bullets live in
  `src/data/sieges.js`: actual force counts and changes from the previous siege,
  wall-attacking chiselers, powder clusters and the expected giant brute.
  Reports never reveal exact spawn times. The public API can still prepare
  headless builds while presentation reports are open.

## 9. Campaign, economy, rewards (`src/sim/campaign.js`)

- Start 1000 gold, population 6, keep gives housing 6 and food 6.
- Siege 1 starts keep-only with six inhabitants. After victories in Sieges 1
  and 2, Continue rebuilds destroyed civilian buildings at their positions for
  free, then adds performance-based growth. Population becomes 6 + 4 per house,
  with inhabitants replenished and re-homed. There is no growth after Siege 3.
- **Start Siege requires only an open trade road.** `api.readiness()` exposes
  a fresh `{ id:'tradeRoad', ok, message }` observation shared by Start and UI.
  Blocked message: "Castle entrance blocked. Install a gate to create a route
  to the keep." Housing and food are informative and never block readiness.
- Snapshot taken at Start Siege (full prep state incl. gold, structures, HP,
  pendulum, RNG seed). **Retry Siege** restores it exactly; rewards are only
  applied on leaving the results screen of a *victory* via "Continue", and the
  campaign records siege index so rewards can't be applied twice. Restart
  Campaign returns to the initial state.
- Kill bounties pay immediately at the single enemy death point, regardless of
  cause: foot 2 G, chiseler 3 G, powder 5 G, boss 100 G. Each enemy pays once;
  siege stats track gold and per-type kills. Renderer events produce floating
  gold labels, grouped within 0.35 presentation seconds and two tiles, including
  batched kills delivered in one frame. Larger sums use a slightly larger font;
  remaining text overlaps are offset vertically. Battle treasury is live.
- Rewards (victory only): completion 188 / 238 / 50; all inhabitants alive +100;
  no enemy reached the keep +75; structural damage < 15% of total structure HP +50; spent < 70% of
  pre-siege gold +50.
- Penalties: −40 per inhabitant killed; −50 once if `keepReached`; −1 per 10 keep
  HP lost; −15 per house/farm destroyed.
- Payout floor: net payout never below 100. Bounties are already in the treasury
  and are an informational results row, never paid a second time. No boss bonus.
- Defeat: results show the same breakdown, payout 0, buttons Retry Siege /
  Restart Campaign. After S3 victory: campaign-complete screen with total
  bounties and the final contract rating (the final siege's rating and tier).
- Results screen lists: result, enemies defeated, boss defeated, inhabitants
  saved/lost, enemies that reached the keep, buildings destroyed, each bonus and
  penalty as a line item, readable kill-bounty gold and per-type counts, net gold,
  treasury after. "Inspect castle" hides the
  panel to view the battlefield (rubble + attack markers) before Continue.
- All economy and reward numbers in `src/config.js`.

Performance and settlement growth:
- Rating (0–100): surviving inhabitant fraction ×40, remaining keep HP fraction
  ×30, intact civilian-building fraction ×20 (full credit if none existed),
  and +10 if no enemy reached the keep. Tiers use the unrounded rating:
  standard <80 adds 1 house/1 farm; strong 80–94 adds 2/2; exceptional ≥95 adds 3/2.
  Results and campaign completion show the rating and tier.
- Deterministic 2×2 sites use floor/castle tiles ≥7 columns from the spawn
  edge, avoid every structure, mount site and a built pendulum's strike band,
  leave one tile from military structures, and preserve the trade road
  after every placement. No player military structures are changed.
- Growth evaluates breached military footprints as standing, preserving the
  intended repaired perimeter, clearance and trade road.
- Flood fill from spawns treats military structures (including gates)
  as blockers and civilians as traversable: unreached floor is inside walls.
  Houses cluster near habitation using BFS distance from the keep; farms occupy
  the next outward ring, preferring open neighbours. Ties use (y,x). Exceptional
  growth puts at least one new building at the best outside site when available.
  Add a farm if food would fall short; place what fits and report shortages.
- Continue shows a state-backed growth report with tier, settlers, added houses
  and farms, outside-wall warning and shortages, ending "Your next assignment:
  Protect the growing settlement." Dismissal reveals the scout report. New buildings pulse
  until the first successful build or eight seconds of visible prep.
- Presentation pauses the prep highlight clock while scout intel covers the map.
- The next siege's Start snapshot includes growth, so retry restores exact
  treasury and settlement without duplicating bounties, buildings or inhabitants.
  Restart returns to the keep-only settlement.

## 10. HUD

- Prep palette categories: Fortifications (Wall, Gate, Barricade, Archer tower),
  Wall Upgrades (Spiked Wall, Golem Wall), Mechanisms (Proximity Sensor, Launcher,
  Retractable Wall, Link), Special Weapon (Titan's Pendulum),
  Editing (Demolish, Repair). Compact rows reserve space for a simple information
  panel: chosen tool cost, HP and description, or an existing structure's type,
  HP and refund while hovering/selecting it with Demolish/Repair. Only one
  accordion category is open at a time, keeping configuration visible at 1366×768.
  A mechanism can also be selected with Link or after cancelling the build tool.
- Prep (top bar + left build palette): gold, population, housing x/y, food x/y
  (red when short), selected tool + cost, hovered placement reason when invalid,
  Repair all (cost shown), Start Siege (disabled until ready), siege number/name.
- An always-visible advisory directly under Start Siege shows "Cannot start
  siege:" and the unmet road requirement in a warning colour, or a checkmarked
  "Castle entrance accessible" line
  followed by "Ready for battle!". It updates after every build, demolition and
  replacement, and fits without scrolling at 1366×768 and 1440×860. Housing and
  food indicators remain in the HUD. When blocked, the advisory also explains
  replacing a wall with a gate.
- During prep with a blocked trade road, wall/spiked/golem/barricade tiles orthogonally
  bordering the spawn-reachable region receive a subtle pulsing red outline.
  No other path visualisation is shown. The sim supplies these hint tiles via
  `api.blockedRoadTiles()`; the UI does not implement readiness checks.
- Wall-family swap previews read "Replace X -> Y | Cost: N G" or
  "Replace X -> Y | Refund: N G" (or `Cost` for a positive net), green
  when affordable and red otherwise. Houses and farms are absent from the palette.
- Battle: siege name + progress bar (schedule time), inhabitants remaining,
  keep HP bar, boss HP bar (when present), pendulum status widget (READY pulsing /
  recharge ring with seconds) with key hint, pause + 1×/2×/4× buttons.
- Compact, dark translucent panels, a clear readable sans-serif; nothing covers
  the canyon floor more than necessary.

## 11. Audio

Procedural WebAudio only (no files): arrow twang, chisel tick, explosion boom,
pendulum creak/whoosh/thud, sensor signal, launcher discharge, retractable
gears, boss horn, victory/defeat stingers. Master mute
toggle (M). Audio must start only after a user gesture and never throw.

## 12. Tests (`node --test test/`)

At minimum: placement validity (terrain, overlap, tower-adjacency rule,
sealed construction allowed but Start Siege requires a gate-accessible trade
road), line placement stops at gold, paid-cost/HP-scaled full refund and
repair math, flow field never routes through cliffs and prefers weaker walls,
enemies breach a wall and continue, explosion single-detonation + chain + 6-tile
structure cap, pendulum hit-once-per-swing + cooldown + boss survives one hit,
client building protection, automatic growth/rating, bounties paid once and
retry rollback, seeded construction/refund conservation,
atomic wall/gate replacement in either direction (net affordability, no mutation
on failure, support and flow updates), line replacement, readiness list + Start
Siege gating,
spiked-wall melee damage/bounties, generalized wall-family exchanges and hints,
golem threshold/single awakening/opened-tile flow, leashed movement, slam
damage/knockback/stun/bounties, enemy targeting, expiry and snapshot rollback,
sensor radius/delay/cooldown and immunity, dispatcher extension, link limits and
cleanup, directional launcher cadence/piercing/obstruction/range/bounties, exact
mechanism retry and inter-siege configuration persistence, retractable occupancy
fail-safe/animation/flow changes/attackability/cooldown and replacement support,
reward/penalty math incl. `keepReached`
counted once and payout floor, snapshot retry restores exact state and does not
duplicate rewards, determinism (two runs of S1 with same build → identical
event-log hash), headless full S1 run with a reasonable reference build ends in
victory and with no build ends in defeat.

## 13. The Frontier Commission — stage-specific rules (Milestones A–G)

The title offers **Canyon Keep Campaign** and **The Frontier Commission**.
Sections 2–12 continue to specify the canyon campaign, including its original
three sieges, growth, treasury, rewards and loss conditions. `createGame()` and
numeric-seed calls still create that campaign. `createGame({stage:'frontier',
seed})` or `api.startFrontier()` selects the independent handcrafted contract.
Results and completion screens can return to the title.

Shared systems are grid occupancy, breach-cost pathing, military construction,
Class A defenses, mechanisms, combat, pause/speed controls and kill bounties.
`src/data/stages.js` supplies each stage's map, settlement, siege schedule,
reward model, tools and feature flags. Frontier implementation/data live under
`src/sim/frontier/` and `src/data/frontier/`. Stage-aware terrain queries retain
the canyon map as their default. Frontier has no growth or pendulum mount.
Its makeshift Class B tools can also be built during a siege under the rules below.

Frontier is a 64×36 plain with an east approach, river crossings, rocks, roads,
a keep, clustered town, outskirts farms and a separated hamlet. Owned buildings
are pre-existing and protected from placement, replacement, demolition and repair,
including destroyed footprints. Each has a stable ID, type, owner, HP, value,
district, importance, objective flag, offered reward and promise state. One
building starts damaged. The handcrafted settlement has 24 civilian buildings
plus its keep: houses, market shops, two warehouses, a workshop, two outskirts
farm groups, a remote hamlet with its own fields, and a low-value barn.
Roads branch and the impassable river bends around a broad central ford.

A dismissible/reopenable mayor briefing states the construction budget, threats,
mandatory keep objective, assessed property at risk, fee, bonuses and damage
rule. Data-backed scouts give approximate forces, directions and district risks
without arrival times. Building requests offer Promise, Decline, Ask more
(Communication gate, deterministic +50% reward), or Defend it yourselves.
Communication is chosen at engineer creation; at least one request requires 3. The journal records
choices, locations, rewards and survival conditions. Workshop funds are a
conditional immediate owner advance recorded separately from construction money;
final settlement reconciles it with the survival condition. Earnings do not
carry into later construction budgets. Declines have no penalty; broken promises lose their reward and one
contract-local reputation point. Self-defense choices deploy at Start Siege.

Frontier foot raiders select a nearby valuable property through the stage's
targeting rule, lock onto it until destroyed, then resume toward the keep.
Chiselers/powder retain breach behavior; the brute advances toward the keep.
Property pursuit uses a target-specific breach field. Canyon enemy decisions
retain their original rule. Frontier ends in victory after all arrivals die and
pending explosions finish, or failure when the mandatory keep falls; optional
property or civilian losses alone never end the contract.

Construction gold is the client's budget; unused client funds are never earnings.
Confirmed enemy deaths immediately add spendable bounties to the Frontier battle
treasury, emit the existing floating `bounty` event and update siege stats once
per enemy ID, regardless of kill source. The separate battle ledger retains
`constructionFunds` (client balance), `clientEmergencySpent`, `bountyEarned`,
`bountySpent`, `constructionSpending` and `repairSpending`. Emergency spending
uses remaining client funds first, limited to 120 G client spending per siege,
then unspent bounty without a bounty spending cap. The HUD shows the combined
treasury, client allowance used and unspent bounty. Client funds above the
remaining allowance stay visible but cannot fund additional emergency work.
At acceptance each property
records `assessed = value × hpStart/maxHp`. Its single liability entry is
`assessed × (hpStart − hpEnd)/hpStart`, capped at full assessed value on
destruction. Each assessment, damage line and payment line rounds deterministically
to whole gold before totals are summed; percentages use one decimal. Pre-existing
damage is excluded. Mayor deductions itemize liability
times `damageLiability` and civilian penalties, capped at the base fee; mayor
payment is nonnegative. Failure pays no base fee or mayor bonuses, but surviving
promised property owners still pay and unspent bounties remain.

Unpromised civilian properties above the assessed-value threshold which take no
siege damage yield deterministic, capped thank-you payments. Results itemize
mayor fees/bonuses/deductions, owner rewards and gross bounties separately, assessed
value before/preserved, building/district damage, casualties, promises and final
earnings. Rating uses preservation, casualties, objectives and promises, with
reasons: Exceptional Engineering, Strong Defense, Acceptable Defense, Costly
Victory or Contract Failed; kills do not influence it. Results finalize once
and expose a paid flag. Results also show battlefield construction spending,
emergency repair spending, client spending, bounty spent and unspent bounty.
Final earnings add only `bountyEarned - bountySpent` to the otherwise unchanged
mayor/owner/thank-you formula; finalization never credits the battle treasury
again. Retry restores the exact pre-siege snapshot, including budget, all ledger
fields, death IDs, requests and owner ledger; restart clears attempt earnings.
Inspection retains damaged/destroyed property.

Professional guards hold their assigned post, engage nearby reachable enemies
within a leash and return. Weaker district militia retreat to the keep below
30% HP. Civilians idle near homes in prep and evacuate at siege start.
All use deterministic orthogonal paths: terrain, buildings, walls and barricades
block; gates pass friendlies. A failed route produces an explicit holding or
sheltering-in-place state until the map changes. Enemies can kill NPCs and
civilian deaths feed the casualty deduction. Defender kills pay normal bounties.

Generated settlement garrisons use an independent contract-seed stream and a
strength budget (footman 1, archer 1.2, cavalry 2). Size, wealth, archetype,
existing fortifications and raid difficulty contribute to the budget; it is
clamped to 3–8 strength. Every non-empty combination is possible, including
single-type rosters; poor settlements are less likely to field cavalry.
Twin keeps and remote outposts receive independent rosters. The handcrafted
commission and fallback retain four footmen. Legacy `guards` are footmen and
retain their post/leash combat and Communication-based preparation requests.
Briefing lists each roster and role limits. Preparation marks posts,
battlements/stairs, sortie gates and keep beds; battle shows living military
counts and care capacity/pool; results record survivors and losses by type.

Each functioning keep offers two infirmary places, healing 3 HP/s per patient
from its own finite 120-HP siege pool. Footmen, militia, archers and cavalry
must physically return by friendly routes. The most wounded receive care
first; nearby reachable combat prevents treatment. Death cannot be reversed,
golems are ineligible, and destroyed keeps or depleted pools stop care.
Recovery is latched until 85% HP (cavalry 80%), then units resume their role.
Retry restores preparation and resets pools when the siege starts again.

Archer battlements are a separate 4-connected network of intact wall, gate,
spiked, dormant-golem and integrated-tower tiles. Stairs are integrated towers,
gate-flanking walls and walls touching a keep. Archers walk to reachable stairs,
climb, and reposition only along their connected line toward threats. Ground
collision and enemy pathing never use this network. Without reachable stairs
they defend near the keep on foot. Archers have 60 HP, range 5, damage 6 and
a 1.4-s shot interval; visible arrows travel at 18 tiles/s. Cliffs and solid
structures block sight except the shooter's tile. Below 35% HP they descend
through connected stairs and seek care. Explosion splash and brute slams reach
them. A lost node drops its archer to adjacent walkable ground (the destroyed
tile if all neighbors block), costs 12 HP and stuns for 1 s.

Cavalry autonomously wait, sortie through intact gates, engage briefly,
retreat, return through a valid gate, rest/heal and cool down. Their friendly
ground graph passes gates and keeps, never intact walls. They favor isolated
attackers, chiselers/powder carriers and outer farms/roads. They have 130 HP,
speed 3.2, damage 10 every 1.1 s, plus 10 charge damage on the first hit.
Sorties last at most 8 s; 40% HP, crowding or a lost target initiates retreat.
Return replans if a gate is destroyed or blocked; without a gate route home
they shelter outside the nearest gate and fight defensively. Rest lasts 2 s,
followed by 12 s cooldown. Caltrops multiply speed/damage by .55, narrow tiles
(at least two blocked orthogonal neighbors) by .65 and dense groups multiply
damage by .65. All enemy types can harm ground cavalry. No direct commands
are provided for any military unit.

The prep mayor panel requests existing guards for named district/property posts.
Communication 2 allows up to two reassigned guards in total; Communication 3
allows four. Requesting zero returns that post's guards to the keep. Keep guard
counts and positions change; battle has no NPC commands. Owner self-defense
deploys free adjacent timber barricades/palisades or a hired guard according to
the owner's rule, including the stubborn barn owner. It never overwrites player
works, closes the trade route or removes a property's last access. Unsafe pieces
skip deterministically; the journal records deployment and hired guards.

Class A (wall, gate, tower, spiked, golem, launcher, sensor, retractable,
pendulum) remains prep only. Class B (barricade, palisade, caltrops) works in
Frontier prep and battle. Palisades cost 12 G with 100 HP versus the existing
8 G/70 HP barricade. Caltrops cost 10 G, remain walkable, damage an entering
enemy by 4 and slow it to 50% speed for 2 seconds, expiring after ten uses.
All tuning lives in CONFIG; canyon retains its original tools and rules.

Frontier gates have 130 base HP (canyon gates remain 180); ordinary walls remain
200. Structural Engineering applies through `classAMaxHp` to the Frontier base.
Gate cost is unchanged. Intact gates block enemies and are valid breach targets,
pass friendly units, and leave traversable ground when destroyed.
In preparation, a wall-tool line crossing an actual major road tile automatically
uses a gate on that tile. Both generated `map.roads` and the handcrafted trade
road qualify; decorative features and footpaths do not. Auto-gates use a blue
preview and gate marker; line previews show gross purchase cost and net cost
after replacement refunds. A later deliberate single wall placement can replace
an auto-gate provided mandatory friendly access remains. Start Siege's advisory
lists every mandatory keep-to-major-road-exit route and identifies inaccessible
routes. Friendly route validation treats gates as passable and remains separate
from enemy breach-cost pathing.

Frontier enemy flows use configured per-type HP breach weights and gate cost
multipliers: foot soldiers strongly prefer open routes, chiselers accept breaches
and favor weaker gates, powder carriers favor accessible approaches, and bosses
accept convenient breaches/openings. Positive obstacle costs ensure a cheaper
open route beats attacking a wall. Fields are deterministic and cached by target,
enemy type and flow revision; canyon retains its existing weights and behavior.

Emergency construction spends the shared battle treasury at normal price, with
the 120 G cap applying only to client funds. At most three simultaneous sites
and twelve living player Class B structures are allowed; pending sites reserve
slots and surviving preparation Class B works count. Client/NPC-owned defenses
do not consume the player's limit. Each non-blocking site
takes 2 seconds at starter Field 1 (hook: −0.3 seconds per additional Field
level). A finished timer waits while a living enemy/NPC/golem occupies its
footprint. Blocking sites also preserve an enemy route to the keep, counting
reserved blocking sites. Placement refuses living enemies within one tile,
overlap, protected property, and tiles of Class A works destroyed in this siege.
Battle permits no demolition or refunds. Canyon has no battle construction or
emergency repairs.

**Emergency Repair** is a Frontier siege tool with a palette button and `R` key.
Only surviving, damaged, player-owned military Class A works qualify; never
destroyed works, Class B, civilian/client buildings or a keep. Actual positive
enemy damage records `lastEnemyDamageAt`; proximity and friendly fire do not.
Repair is blocked on the hit timestamp ("Cannot repair — Wall is under attack.")
and for three simulation seconds after a hit ("Cannot repair — Wait until 3
seconds after the last hit."). Already-running repairs, exhausted allowance,
ineligible targets and no spendable gold each give specific messages.
Each structure may regain at most 25% of its maximum HP per siege, cumulatively
across interruptions, cancellations and restarts. A repair restores its remaining
allowance, limited by missing HP, over 5 s multiplied by Field L1/L2/L3/L4 factors
1.0/0.85/0.7/0.55. It charges only HP actually restored at 1.5 times the continuous
preparation repair price per HP (`cost * repairRate / maxHp`), using fractional
HP/gold and the shared client-first funding order. It stops if funds run out.
Any enemy damage during repair immediately marks it `interrupted`; restored HP
and payment remain, no refund, and another three damage-free seconds are needed.
Simulation time controls repair progress under pause/speed. A visible cyan progress
ring and repair marker identify running repairs.

The Frontier battle HUD shows mandatory objective HP, estimated value preserved,
living civilians, active promises with current survival status, emergency
client emergency spent/cap and unspent bounty, machine controls, pause and speed. Sites show a progress ring
and waiting state. Disabled Class A entries explain their prep-only restriction.
The centered title has two labelled cards, descriptions and Play buttons, with
construction/HUD/key hints hidden.

### Engineering skills and career

New Frontier careers begin with a one-time engineer creation screen: a trimmed
1–24 character name (default Rowan Stone), six procedural cosmetic portraits
and six colour accents. All four skills begin at 1 with exactly three free
points, and no skill above 3 at creation. Editable presets are Diplomat
C3 S1 F2 M1, Fortress Expert C1 S3 F2 M1, Field Engineer C2 S1 F3 M1 and
Mechanist C1 S2 F1 M3. Review and charter confirmation precede acceptance;
cancelling preserves the previous career. Level 4 requires development points.
Communication gates negotiation and existing guard
reassignment. Structural adds 5% Class A maximum HP per level above 1.
Field subtracts 0.3 seconds from emergency build time per extra level,
with a floor of 1.1 seconds (L1–4: 2.0/1.7/1.4/1.1 seconds).
Field repair multipliers remain 1.0/0.85/0.7/0.55. Mechanical subtracts 8% of base sensor,
launcher, retractable and pendulum cooldowns per extra level. These effects
apply only to Frontier and never bypass placement rules. Prep lists each
level and its current numeric effect; skills enter the sim as copied data.

A fulfilled contract grants one development point, or two for Exceptional
Engineering; failure grants none. Spending on the title/contract screen adds
one level for one point. The UI owns `{identity: {name, portrait, accent}, skills,
points, contractsCompleted, history, reputation}` with optional localStorage
access under try/catch and the existing `canyon-keep.frontier-career.v1` key.
The last 20 contract records contain seed, archetype, rating and finalEarnings.
Reputation averages the last 10 rating scores: Failed 0, Costly 1, Acceptable 2,
Strong 3, Exceptional 4. The title career panel shows identity, reputation and
history; these never fund construction. A failed session enters history once;
a successful retry replaces its failed entry and awards progression once.
Existing v1 skills/points/completion counts are preserved. Any points, completed
contracts, or skills different from the old C2 S1 F1 M1 default mean an
established career requiring identity only. An untouched old default requires
full creation. Explicit New career replaces all progression only after charter
confirmation, invalidates prior award tokens and never adds starting points to
existing progress. A UI contract
session ledger survives siege retries, so the same siege cannot award twice.
Storage failure leaves the full game playable with an in-memory career.

### Seeded procedural commissions

The contract screen offers the handcrafted commission, generated contracts,
replay, a seed input, and Compact Town / Twin Settlements / Town + Outpost
or seed-selected archetype. The seed appears in briefing and the HUD.
Compact Town has a principal settlement and exposed farming outskirts;
Twin Settlements has two comparably valuable communities, both keeps
mandatory, sharing one budget; Town + Outpost has a secure town and remote
hamlet. Enemy breach fields consider every living keep in Frontier.

Generation picks the siege plan first. The primary keep sits within ~6.5
tiles of the map centre (jittered); ring and far districts are pushed outward
along seeded bearings, and the first ring district faces the main front 60% of
the time. Twin Settlements flank the centre on a horizontal, diagonal or
vertical axis (keeps 16–28 tiles apart). Rivers and ridges (vertical or
horizontal, edge to edge) run through open ground beside the settlements;
a pattern that cannot fit becomes open outcrops.

Siege plans (`src/sim/frontier/fronts.js`): fronts from eight compass
directions — single front, main + secondary, main + 1–2 diversions, or a
3–4-direction encirclement. Each enemy joins the front furthest below its
strength target for its wave (foot 1, chiseler 1.5, powder 2, boss 8; the boss
joins that wave's main front). A 35% chance adds a second wave (from t = 46 s)
that swings 70% of later strength onto another or a fresh front. Each wave's
main front carries ≥50%. Entries slide along the front's edge to walkable
tiles ≥8 tiles from every district; the main front has two entries, others one.
Prep shows an inward arrow per front sized and labelled MAJOR (≥50%),
SECONDARY (20–49%) or POSSIBLE RAID (<20%), dashed "2ND WAVE?" for wave-2-only
fronts, with tinted entry tiles. The scout report names every front with banded
strength, the second-wave shift and rounded raider totals; no exact counts or
times. The free report retains this content. Generated commissions offer
**Purchase Advanced Scouting — 50 G**, once in Frontier preparation. It uses
the actual assigned group counts and configured enemy strength weights to
estimate each front's share to the nearest 5%, identifies the primary opening
direction, minor-band diversions, powder carriers/chiselers/the giant brute
only on fronts carrying them, and the second-wave main direction. It never
reveals exact arrival times or changes the siege. The purchase is separate from
construction accounting and non-refundable; the contract flag and spent gold
survive saved state and pre-siege retry without a second charge. Insufficient
funds, repeat purchase and other phases refuse without mutation. The authored
siege and generated fallback lack a front plan, so purchase is disabled with
an explanation and the free report remains available. After purchase, prep
edge markers distinguish the primary front from smaller, subdued secondary
and diversion markers; settlement interiors remain clear.
In battle arrows dim; each front pulses "INCOMING" 5 s before its first
entry (`frontWarning` event, `state.frontWarnings`). The handcrafted contract
keeps its single eastern schedule and label.

Seeds vary terrain, roads, property/population, keep positions, garrison rosters,
siege plans and entries, owner names/requests and special objectives.
Construction budgets come from deterministic settlement geometry, independent
of assessed value and raider counts. A pure enclosure estimator selects core
building footprints within a configured distance of the keep (or central lot
for settlements without a keep), excluding distant outliers, dilates them by
two tiles and counts the exterior ring. It follows the footprint, never its
bounding rectangle. Impassable terrain is a free natural barrier; road ring
tiles require gates, other buildable tiles walls, and existing defensive walls
are already paid. Interior holes need no curtain. Neighboring client lots
constrain clearance to keep the proposed ring buildable. Estimates expose wall,
gate, natural and existing counts, their base-price cost, and ring tiles.

Generated budget = round-to-10(weighted enclosure cost × (1 + equipment
allowance)), with configurable safeguard bounds. Compact Town funds its main
enclosure plus 35% for equipment; remote property has zero weight. Twin
Settlements weights the larger enclosure at 1.0 and smaller at 0.5, plus 25%.
Town + Outpost weights main at 1.0 and outpost at 0.6, plus 25%. These allow
impressive main defenses and partial satellite protection, while both full
curtains plus equipment still require compromise. The handcrafted budget is
configured using the same estimator: main enclosure and equipment are realistic,
enclosing all farms and the hamlet exceeds its treasury. The handcrafted
budget is 1950 G against a 1560 G main curtain and 4200 G combined estimates.
Canyon's budget,
layout and balance remain unchanged.

Every contract stores its budget plan, named principal settlement estimates,
combined enclosure cost and available budget. Frontier preparation shows a
compact **FRONTIER DEFENSE BUDGET** block: current available gold, each principal
enclosure estimate and the combined total for multiple settlements. A caveat
states that only basic walls and gates are covered, excluding towers,
machinery and terrain adjustments. This is advisory: it draws no curtain and
imposes no construction or readiness rule.

Named-building survival and preservation of at least 80% of
farm buildings have explicit mandatory/optional labels, locations and
reward/penalty amounts. Mandatory special failure fails the contract;
optional failure affects the itemized payment and rating.

Validation checks placement/overlaps, edge entries clear of districts, every
front routing to a keep, a ≥50% main front per wave, objective spawn clearance,
enemy reachability of every keep, civilian evacuation, connected district
roads, defensive space, NPC pathability and multiple valuable districts.
Invalid candidates retry using a deterministic `(seed, attempt)` derivation
up to the configured limit, then use the handcrafted map. Attempts, rejection
reasons and fallback state are recorded. Identical seed and archetype produce
deep-equal initial simulation state. Restart regenerates the same contract;
Retry restores the exact pre-siege snapshot including construction and promises.

Headless balance fixtures cover unaffordable equal defense (district curtains
and the full map edge), scout-weighted tower plans that win and beat an
equal-cost even ring on a multi-front seed for every archetype, the keep/property tradeoff of guard reassignment, and a
negotiated outlying promise worth more than its dedicated paid defenses.
