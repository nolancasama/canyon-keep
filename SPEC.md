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
beyond this file (no RPG, crafting, resources other than gold, multiplayer,
procedural maps, ladders/tunneling/flanking AI, building during battle).

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
pushes onto `state.events` (drained by the renderer each frame), so sim stays pure.

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
- In prep, faint sensor circles and dashed linkage lines with gear dots explain
  connections; firing briefly flashes links in battle. Procedural audio accompanies
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
  - S1 "The First Assault": ~45 enemies, few powder carriers, boss 1200.
  - S2 "The Growing Threat": ~75, more chiselers + clustered powder groups, boss 1700.
  - S3 "The Great Siege": ~120, dense waves, powder carriers mixed into chiseler
    packs, two-pronged timing (big group arrives while previous is at walls), boss 2000.
- End: **victory** when schedule exhausted and all enemies (incl. boss) dead;
  **defeat** when the keep is destroyed or every inhabitant is dead.
- Breaches matter through rewards; a breach alone is not defeat.

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
  gold labels, grouped within 0.3 seconds and two tiles. Battle treasury is live.
- Rewards (victory only): completion 188 / 238 / 50; all inhabitants alive +100;
  no enemy reached the keep +75; structural damage < 15% of total structure HP +50; spent < 70% of
  pre-siege gold +50.
- Penalties: −40 per inhabitant killed; −50 once if `keepReached`; −1 per 10 keep
  HP lost; −15 per house/farm destroyed.
- Payout floor: net payout never below 100. Bounties are already in the treasury
  and are an informational results row, never paid a second time. No boss bonus.
- Defeat: results show the same breakdown, payout 0, buttons Retry Siege /
  Restart Campaign. After S3 victory: campaign-complete screen with totals.
- Results screen lists: result, enemies defeated, boss defeated, inhabitants
  saved/lost, enemies that reached the keep, buildings destroyed, each bonus and
  penalty as a line item, net gold, treasury after. "Inspect castle" hides the
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
  leave one tile from living military structures, and preserve the trade road
  after every placement. No player military structures are changed.
- Flood fill from spawns treats living military structures (including gates)
  as blockers and civilians as traversable: unreached floor is inside walls.
  Houses cluster near habitation using BFS distance from the keep; farms occupy
  the next outward ring, preferring open neighbours. Ties use (y,x). Exceptional
  growth puts at least one new building at the best outside site when available.
  Add a farm if food would fall short; place what fits and report shortages.
- Continue shows a state-backed growth report with tier, settlers, added houses
  and farms, outside-wall warning and shortages, ending "Your next assignment:
  Protect the growing settlement." Dismissal reveals prep. New buildings pulse
  until the first successful build or eight seconds of visible prep.
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
