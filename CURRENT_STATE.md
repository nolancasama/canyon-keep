# Current State

## Status
Fortress Engineer milestones 1–4 implemented: bounties, settlement growth,
spiked/golem walls, trigger mechanisms, scout intel, impact feedback and balance fixtures,
on the playable three-siege prototype. Headless validation passes;
controller behavioral acceptance and aesthetic review of this update are pending.
Work remains uncommitted. Controller behavioral acceptance is not performed here.

## Run
Run `npm start`, then open http://localhost:5180 (or use `start.bat`).
Run headless simulation tests with `npm test`. No dependencies or build step.

## Prototype
- Whole-map Canvas2D castle engineering on the controller canyon, with unchanged
  cliffs, pendulum sites and keep; former rocky ledges are buildable floor.
  Trade roads, gates, integrated towers, repairs, rubble and attack markers remain.
- The player is a hired fortress engineer spending gold on military works.
  Three scripted sieges start with a keep-only settlement of six inhabitants.
  Start Siege requires only the trade road. Preparation construction may
  seal the canyon; the road is checked at Start Siege instead of placement.
  Six inhabitants live at the keep and four per client-owned house thereafter; civilians
  idle at their homes and flee to shelter. Foot soldiers pillage nearby farms
  and houses until destroyed; destroyed buildings cease supplying capacity.
- Continue after victories 1 and 2 rebuilds destroyed civilian buildings for free
  and adds deterministic settlement growth. Ratings weigh surviving inhabitants
  (40), remaining keep HP (30), intact civilian buildings (20), and no enemy at
  the keep (10). Standard/strong/exceptional tiers add 1/1, 2/2 or 3/2 houses/farms;
  food shortages add extra farms. Sites preserve road access and military works,
  avoid pendulum strike bands, and exceptional growth includes an outside-wall
  building when possible. Limited space is reported. Population is 6 + 4 per house.
  A growth overlay announces settlers/buildings; new buildings pulse for eight
  visible prep seconds or until the first successful construction action.
- Deterministic 60 Hz breach-cost pathing, archers, chiselers, powder chains,
  boss windups/slams, inhabitant attacks and victory/defeat.
- Itemized victory/defeat results, every reward and penalty, minimum payout,
  treasury after payout, inspection, Continue, exact pre-siege retry and restart.
  Each enemy pays a bounty once immediately: foot 2, chiseler 3, powder 5,
  boss 100 G, with nearby kills grouped within 0.35 render seconds/two tiles,
  including batched multi-second steps. Measured labels stack vertically and
  larger sums have a slightly larger font. Results
  show bounties as already earned with readable per-type counts, plus rating/tier. Completion is 188/238/50 G,
  payout floor 100 G, with no separate boss bonus. Continue applies only payout
  and preserves military damage; after the third Continue, campaign completion
  displays total bounties and the final contract rating, without further growth.
- Each prep opens a data-backed four-bullet scout report, after settlement growth
  on S2/S3. Intel describes actual enemy counts, escalating chiselers, clustered
  powder and the giant brute without exact spawn times. Dismiss to build; the
  prep footer reopens it. Esc/Enter dismisses the visible report. Growth's visual
  highlight clock pauses while scout intel covers the map.
- Titan's Pendulum manual release, friendly damage, cooldown, ready pulse and
  recharge ring. Enlarged timber/iron A-frame, anchors, rotating ratchet drum,
  double chains, spiked hammer and stronger swing smear. Hit-driven dust/debris,
  capped shared shake and stronger flashes for pendulum-triggered powder chains
  observe existing events without changing damage or collision.
- Cached organic cliff contours and fractured angular rock plates/cracks with
  brighter lips and deep shading. Clear amber strike bands follow the same
  visual contour; orange intersections warn of friendly structure damage.
- Battle HUD, pause, 1×/2×/4× playback, procedural audio and mute.
- Preparation demolition returns the amount actually paid, scaled by remaining
  HP (100% intact, zero for destroyed/free structures). Repair prices retain
  their original base-cost calculation. Walls, gates, spiked/golem walls, launchers and retractable walls
  atomically replace one another for new price minus the old HP-scaled refund;
  only a positive net cost is required. Launchers support canyon towers;
  retractables do not, and exchanges that would strand towers are refused.
  Wall/gate/spiked/golem and barricade tools retain drag-line construction.
- Spiked walls (35 G / 170 HP) deal 12 DPS to every melee attacker with throttled
  hit sparks. Golem walls (90 G / 240 HP) awaken once at ≤50% HP during battle,
  opening their tile and rebuilding flow immediately without rubble or refund.
  The 350-HP defender slams for 35 damage in radius 1.2 every 1.2 s, with 1-tile
  knockback and 0.8 s stun. It stays within 3.5 tiles of its origin and crumbles
  after 30 s or at 0 HP. Enemies can attack it; kills pay ordinary bounties.
  Dormant walls persist with damage, while temporary golems clear between sieges.
  Emergence has cracks, dust, screen shake and procedural audio.
- Proximity sensors (15 G) are invulnerable, walkable tile devices. They detect
  living enemies/bosses within radius 1.5, wait a configured 0/0.5/1/2 seconds,
  then dispatch to up to three linked living devices, with six-second cooldowns.
  Links and configuration survive retries and sieges; demolition/replacement
  removes old IDs. Sensors never affect targeting, road access or enclosure.
- Launchers (70 G / 200 HP) face N/E/S/W and fire only through linked triggers:
  three piercing bolts 0.25 seconds apart, 30 damage each within 0.45 tiles of
  the lane centre, range 12, speed 24 tiles/s, five-second activation cooldown.
  Cliffs and blockers stop bolts; kills pay bounties. Placement/panel rotation,
  clipped lane arrows, visible bolts, muzzle flashes and procedural sound are present.
- Retractable walls (45 G / 200 HP) start lowered every siege, rise in 0.4 seconds,
  hold raised for eight, lower in 0.4, then cool down for six. Only raised walls
  block or take damage. Occupancy prevents rising: enemies, inhabitants or active
  golems within 0.6 tiles (and any occupant in the footprint) wait; 1.5 occupied
  seconds skips activation. Checks continue throughout the rise. Blocking changes
  rebuild flow and clear cached enemy steps; destruction leaves ordinary rubble.
  Continue and retry lower the wall while preserving appropriate snapshot damage.
- The five-category palette groups Fortifications, Wall Upgrades, Mechanisms,
  Special Weapon and Editing, with one accordion category open to reserve height
  at 1366×768. Mechanisms includes Sensor, Launcher, Retractable Wall and Link.
  Keys 8/9/0/L select them; contextual R rotates launchers or selects Repair.
  Link selects sensors/toggles devices; the sensor panel lists links, delay and
  readiness. Prep links draw above structures as outlined 2px iron chains at 67%
  opacity, with endpoint rivets and selected-sensor emphasis. Battle hides links
  except for a brief bright traveling pulse when the sensor fires.
- The Start Siege advisory shows road readiness. Blocked-road hints pulse on
  bordering blocking wall-family pieces/barricades; previews show family net replacement prices.
  Empty sensors and unlinked devices add advisory warnings without disabling Start.
  Houses/farms are absent from the palette. Player placement, demolition,
  replacement and repair cannot change houses, farms or the keep, including
  destroyed civilian sites. Repair all affects military structures only.

## Debug / Harness Surface
`window.__game.state` is a live getter; UI/render code observes it without
mutation. `api.phase()` retains its phase-string interface. Campaign observations:
- `state.phase`: `prep`, `siege`, `victory`, `defeat`, `complete`.
- `state.siegeIndex`, `population`, `prepGold`, `gold`.
- `state.scoutReport`: null when dismissed; otherwise `{siegeIndex, bullets}`.
  `api.openScoutReport()` / `dismissScoutReport()` are prep-only presentation
  actions. Growth takes visual precedence when both reports are pending; phase
  remains `prep`, and the headless build API remains available. API retry restores
  the snapshot exactly; the UI retry action reopens scout intel explicitly.
- `state.results`: per-siege counts, bonuses, penalties, raw payout, payout,
  `floorApplied`, keep damage, treasury after payout, `bountyGold`, `bountyCounts`,
  `rating`, `tier`. Campaign bounty totals are summed from immutable result history.
- `state.stats.bountyGold`, `bountyCounts` (foot/chiseler/powder/boss); `bounty`
  events expose `entityId`, `enemyType`, `x`, `y`, `amount` and sim timestamp `t`.
- Growth's semantic state is observable through `state.growthReport` (null when
  dismissed; otherwise tier, settlers, houses, farms, outside count, repaired,
  shortage counts, rebuildShortage and buildingIds), `state.growthHighlight`
  (`ids`, `until`, or null), and `state.prepTime`. `state.phase` stays `prep`
  during the report. The UI blocks prep input until dismissal; the public API
  remains usable for headless preparation and snapshots.
- `state.campaign`: `rewardedSieges`, immutable result copies in `history`,
  aggregate `totals`, and `complete`.
- `state.pendulum.status`, `elapsed`, `resetRemaining`, `angle`, `drumAngle`,
  `swingId`, `hitIds`; enemy attack phase, target, windup, stun and slow;
  `keepReached`, `stats.keepReachedEnemies`, schedules, events and flow revision.
- `state.golems`: temporary units with `wallId`, `status` (`active`/`crumbled`),
  `hp`, `maxHp`, `x`, `y`, `originX`, `originY`, `remaining`, `attackCooldown`.
  The consumed wall is absent from `state.structures`; `flow.revision` equals
  `flowRevision` immediately on awakening. Events `golemAwaken`, `golemSlam`,
  `golemCrumble` and throttled `spikeHit` carry positions and entity IDs. These
  observations use the existing read-only presentation/harness state surface.
- Mechanisms use the same live read-only observation surface, `window.__game.state`:
  sensor structures expose `links`, `delay`, `pending` (null or remaining seconds),
  `cooldown`, `flashRemaining`; launchers expose `facing`, `cooldown`,
  `volleyRemaining`, `volleyTimer`, `muzzleRemaining`. Retractables expose `status`
  (`lowered`, `waiting`, `rising`, `raised`, `lowering`, `cooldown`), `elapsed`,
  `waitElapsed`, `cooldown`, `hp`, `destroyed`. `state.bolts` exposes positions,
  direction, origin, traveled distance, `sourceId` and per-bolt `hitIds`.
  `sensorFire`, `launcherFire`, `wallRaise`, `wallLower`, `wallSkip` events have
  timestamps and structure IDs. Existing `flowRevision`/`flow.revision` show
  synchronous raise/lower path updates. These are observations, not harness mutations.

Actions include `place`, `placeLine`, `demolish`, `repair`, `repairAll`,
`startSiege`, `triggerPendulum`, `setSpeed`, `stepSeconds`, `tick`,
`continueCampaign`, `dismissGrowthReport`, `advancePrep(dt)`, `retrySiege`,
`restartCampaign`, previews and capacity checks. `advancePrep` advances highlight
time only in preparation after the report is dismissed.
`place(type, x, y, {facing}?)` atomically exchanges any differing living
wall/gate/spiked/golem/launcher/retractable pieces; `placeLine` exchanges line-enabled
family tools. Prep APIs `toggleLink(sensorId,deviceId)`, `cycleSensorDelay(id)`
and `rotateLauncher(id)` configure mechanisms. `mechanismWarnings()` returns
advisory message strings; readiness remains road-only. Previews expose `replacement`, `replacedType`,
`refund` and net `cost`; matching line tiles are free skips. `readiness()` returns
the shared tradeRoad-only requirement list with `ok` and `message` for
each; `canStart()` and `startSiege()` use that same list. `price(type)` returns
the next placement price, and `blockedRoadTiles()` exposes map hint tiles.
Structures expose actual `paidCost` separately from base `cost` for refunds.
These observations preserve the read-only harness surface; campaign phases and
retry/restart semantics are unchanged.
`stepSeconds` advances simulation independent of playback speed. Retry restores
the exact full preparation snapshot, including treasury, grown settlement,
inhabitants, RNG and pending campaign history. Growth is performed on Continue,
and the next Start snapshots that grown preparation; retries cannot duplicate it.
The third victory's payout is applied by Continue before `complete` is entered.

## Verification
Final milestone 4 `npm test`: **110 passed, 0 failed**. Earlier development
runs exposed retry snapshot expectations and effects tests while those changes
were in progress; the integrated final run has no remaining failures.
`node --check src/ui/interface.js` and `node --check src/render/renderer.js`
also pass. No dependencies or build step.

New coverage includes render-time merge windows across frames and multi-second
batches, measured bounty-label separation and font scaling, capped shared
shake/particles, stronger pendulum powder-chain flashes, scout report lifecycle,
mechanical S1 viability and repair-only campaign growth/readiness/overlap checks.
Existing deterministic mechanics, growth, bounties and campaign coverage remains.

| S1 build | Cost | Outcome | Keep HP lost | Bounties |
|---|---:|---|---:|---:|
| Reference | 1000 G | Victory | 1300 | 212 G |
| Mechanical trap | 750 G | Victory | 0 | 212 G |

The mechanical fixture uses three towers, spiked walls, a golem wall and a
sensor-controlled launcher; spike-hit, golem-awaken and sensor-fire events all
occur. No combat/economy tuning was needed. The repair-only initial campaign
layout wins S1 (zero keep damage, 212 G bounty), grows into a playable S2 with
the restored road open and no overlaps, then loses S2 (2000 keep damage, 212 G
bounty). It does not earn another growth transition; no defensive extension
or injected gold is used. Shortages are explicitly checked against tier plans.

The affordable expanding campaign reference still wins all three sieges
deterministically without a pendulum; unchanged Siege 1 defenses still lose
Siege 3 with growth. Reference campaign bounties are 212/312/450 G, keep damage
0/0/1820 HP, payouts 363/418/100 G, entering-prep treasuries S2 615 G / S3 965 G,
and durations 219.4/250.9/274.7 seconds. Final keep HP is 180/2000.

No browser suites, controller acceptance checks or screenshots were run/produced.
UI layout at 1366×768 and final aesthetics remain for controller/Claude review.

## Known Issues / Next Steps
- Not yet play-tested by a human; balance comes from headless reference runs.
  First playtest questions: is S3 too hard without the pendulum, is the
  pendulum worth 400 gold, do players discover forward walls at bends? Do scout
  reports help players choose spikes, golems and trigger lanes, and does the very
  successful mechanical fixture leave enough room for other viable approaches?
- Controller review remains for 1366×768 scout/results readability, chain visibility,
  simultaneous bounty-label legibility, pendulum impact weight and shake intensity.
- Audio is procedural and untested by ear.
