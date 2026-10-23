# Current State

## Status
Fortress Engineer milestones 1–3 implemented: bounties, settlement growth,
spiked/golem walls, trigger mechanisms, generalized wall-family exchange and a categorized palette,
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
  boss 100 G, with nearby kills grouped into floating gold feedback. Results
  show bounties as already earned, plus rating/tier. Completion is 188/238/50 G,
  payout floor 100 G, with no separate boss bonus. Continue applies only payout
  and preserves military damage; after the third Continue, campaign completion
  displays totals and the final rating, without further growth.
- Titan's Pendulum manual release, friendly damage, cooldown, ready pulse and
  recharge ring. Enlarged timber/iron A-frame, anchors, rotating ratchet drum,
  double chains, spiked hammer and stronger swing smear.
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
  readiness. Prep circles and dashed gear-dot linkage lines flash when firing.
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
- `state.results`: per-siege counts, bonuses, penalties, raw payout, payout,
  `floorApplied`, keep damage, treasury after payout, `bountyGold`, `rating`, `tier`.
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
`npm test`: milestone 3 stage 1 **91 passed, 0 failed**; final **103 passed, 0 failed**.
Milestone 3 adds 23 headless tests for registry dispatch, sensor enemy/boss
detection, delay and standing-presence cooldown, inhabitants ignored, link
limits/toggles/cleanup, mixed-device activation, advisory readiness, directional
three-bolt cadence, piercing width/range, cliff/wall obstruction, dynamically
raised blockers ahead/behind bolts, bounties, unlinked inactivity, sensor
walkability/enclosure/road/immunity, explosion damage-slot immunity, exact
retry and cross-siege configuration, retractable rise/hold/lower/cooldown,
enemy/inhabitant/golem fail-safe, interrupted rises and corner occupancy,
no enemy inside a raised tile, synchronous flow/target updates, raised-wall
damage/rubble, lowered resets, HP-scaled exchanges and tower-support refusal.
No implementation test failures or repair reruns were needed.
Syntax checks (`node --check`) passed for src/ui/interface.js,
src/render/renderer.js and src/ui/audio.js; no build step exists.
Coverage includes once-only bounty accounting (boss, powder chains, pendulum),
informational results totals, exact treasury rollback, client structure/tool
protection, free rebuilds, weighted rating, deterministic growth, outside-wall
exceptional growth, no overlap/cliffs, military clearance, pendulum avoidance,
road preservation, shortages, extra food, report/highlight lifecycle and retry
without duplicate settlement growth. Milestone 2 adds intact/half-damaged family
exchanges, affordability and line totals/stops, support and road hints, spike
damage/bounties, once-only threshold awakening, immediate opened-tile flow and
enemy movement, golem leash/slams/knockback/stun/bounties, enemy targeting through
open routes, blocker fallback, lifetime/HP crumble and exact retry restoration.
Enemy pursuit discards obsolete breach steps so crumbling golems release their
attackers back onto the current flow route.
Area-damage coverage also verifies neighboring walls both awaken when a powder
blast or boss slam removes structures during iteration.
The affordable campaign reference still wins all three sieges deterministically
without a pendulum; unchanged Siege 1 defenses still lose Siege 3 with growth.
Military fixture positions are unchanged; obsolete civilian placements were removed.
Latest reference entering-prep treasuries: S2 **615 G**, S3 **965 G**.
Battle bounties remain 212/312/450 G; results payouts are 363/418/100 G.
Siege durations are 219.4/250.9/274.7 seconds, with 180/2000 keep HP after S3.
No browser suites, controller acceptance checks or screenshots were run/produced
for this update. UI layout and aesthetics remain for controller review.

## Known Issues / Next Steps
- Not yet play-tested by a human; balance comes from headless reference runs.
  First playtest questions: is S3 too hard without the pendulum, is the
  pendulum worth 400 gold, do players discover forward walls at bends?
- Pendulum gantry reads at a glance but could be larger/more ornate.
- Results breakdown mixes stats and gold rows in row-major two columns.
- Audio is procedural and untested by ear.
