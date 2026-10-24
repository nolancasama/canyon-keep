# Current State

## Status
Frontier geometry budgets and optional 50 G advanced scouting are implemented.
Principal enclosure estimates now fund generated contracts; the handcrafted
treasury is 1950 G (main curtain 1560 G, combined estimates 4200 G). Preparation
shows an advisory budget block. Purchased scouting reports real front strength,
dangerous types and wave directions, persists through retry, and emphasizes
the primary threat at the map edge. Authored sieges without front plans explain
why advanced scouting is unavailable. Canyon and wall-to-tower replacement
remain unchanged. See the latest verification below; older budgets/tables are
historical measurements.

The Frontier Commission slices 1–3 (Milestones A–G) are implemented; generated
contracts now use central castles and multi-directional, unequal sieges with
banded scout intel and edge warnings (see Verification). Accepted
slices 1–2 (22a87bd, c8de882) are extended with four visible engineering skills,
slow UI-owned career progression, seeded contracts for Compact Town, Twin
Settlements and Town + Outpost, deterministic validation/reseeding/fallback,
seed/replay controls, twin-keep results and final balance fixtures. The
handcrafted commission, requests, NPCs, journal, emergency construction and
exact siege retry remain available. Canyon behavior and balance are unchanged.
Slice 3 is implemented and headless-verified; controller acceptance and final
aesthetic judgment have not been performed.

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
New Frontier observations are plain read-only data on the existing live
`window.__game.state`: `skills` (communication/structural/field/mechanical),
`contract.seed`, `archetype`, `generated`, `generation` (attempts, fallback,
rejected reason arrays), `mandatoryObjectives`, `specialObjectives` (location,
mandatory flag, reward/penalty), `frontierMap` and `frontierSiege` for generated
contracts. Results add `keepStatuses`, `specialObjectives[].met` and
`specialPenalty`. Skill helpers in `src/sim/frontier/skills.js` expose numeric
effects; built Class A structures expose the resulting `hp` / `maxHp`, sites
their duration, and devices their actual cooldown/reset timers.

The UI's `window.__frontierCareer` returns an immutable snapshot of `skills`,
`points`, `contractsCompleted`, `contractSession` and `developmentAward`.
`api.frontierSession()` identifies fresh played commissions outside sim
snapshots; it is stable on Retry and advances on fresh starts/restarts.
`createGame({stage:'frontier',generated:true,seed,archetype,skills})`,
`api.startFrontier(options)` and `api.selectStage('frontier',options)` accept
plain contract data. Archetype IDs are `compact`, `twin`, `outpost`, `random`.
Seeds accept uint32 numbers or deterministic text hashes; the displayed
normalized number also reproduces the initial RNG/actor state. Generation's
data-only test hooks `rejectAttempts` and `forceFailure` are accepted by
`generateFrontierContract(seed,archetype,hooks)`; they never bypass validation.

Frontier observations use this same read-only presentation surface:
`state.stageId === 'frontier'`, `contract` (acceptance assessment, requests,
briefing, paid flag, earnings, owner advances, local reputation), `structures`
(owner/value/importance/objectives/promise), `journal`, `skills.communication`,
`guards`, `militia`, `inhabitants` and itemized `results`.
NPC semantic states are read-only observations on `window.__game.state`:
`status` (holding/engaging/returning/retreating/sheltering/sheltered/dead;
civilians idle/evacuating/sheltering/sheltered/dead), `postId`, `postX/postY`,
`targetId`, `hp`, `retreating`, `sheltered`, and bounded path state/revision.
`constructionSites` exposes `type`, footprint, `elapsed`, `duration` and
`status` (building/waiting/waiting_route), removed on completion.
`emergency` exposes `spent` and `cap`; `destroyedClassATiles` records prohibited
same-siege footprints. Caltrops expose `usesRemaining`/`hitIds` and enemies
`caltropSlowRemaining`. Properties/journal expose self-defense deployment,
structure IDs and hired guard IDs. No NPC commands are available in battle.
Raiders expose `propertyTargetId` and `propertyRaidComplete`; property flow
fields are cached by target and flow revision. The UI title uses phase `title`;
the default headless factory still starts in canyon `prep`.

Actions: `selectStage('canyon'|'frontier')`, `startFrontier()`, `returnToTitle()`,
`openBriefing()` / `dismissBriefing()`, `openJournal()` / `closeJournal()`, and
`respondToRequest(buildingId, 'promise'|'decline'|'askMore'|'selfDefend')`.
`guardPosts()` lists named posts; `requestGuards(postId,count)` requests the
desired total there, gated across all reassigned existing guards. Zero returns
that post's guards to the keep. `placeEmergency(type,x,y)` and `place()` in a
Frontier siege create Class B sites; `preview()` provides the same restrictions.
Stage selection returns a boolean; request responses return `{ok, reason?}`.
`createGame({stage:'frontier', seed})` constructs the same deterministic stage.
`retrySiege()` restores the entire pre-siege contract snapshot, including
requests, construction money and conditional workshop advance. `gold` is only
the client's construction budget in Frontier; bounty gold stays in siege stats
and final earnings. Finalization sets `contract.paid` / `results.paid` once,
and never adds payouts to construction gold. Inspecting results leaves the
battlefield and each property's final HP available.

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
2026-10-24 geometry budgets / advanced scouting: `npm test` **194 passed,
0 failed**, 202.1 seconds, including the unchanged Canyon campaign and existing
wall-to-tower replacement tests. `node --check src/ui/interface.js` and
`node --check src/render/renderer.js` also passed. No build script exists.

The new suites cover enclosure classification/closure, footprint shape versus
an equally padded rectangle, excluded/scattered outliers, geometry-dependent
archetype formulas and repeatability, occupied-lot avoidance, authored and
fallback estimates, Canyon's unchanged 1000 G, actual weighted front counts,
types/directions/diversions/waves, mutation-free purchase failures, exact 50 G
purchase, unchanged free intel/plan/groups, construction refund separation,
JSON persistence and retry without another charge or refund.

Balance sweep: seeds **1–8 per archetype**, starter skills, **96 complete
contracts**, public previews/purchases/placements/start actions only. Every
full main ring was affordable, buildable and trade-road accessible. Cells
show **wins / 8 · mean assessed value preserved** (including defeats).

| Strategy | Compact Town | Twin Settlements | Town + Outpost |
| --- | ---: | ---: | ---: |
| Main basic enclosure only | 0/8 · 60.3% | 0/8 · 65.1% | 0/8 · 64.1% |
| Scouted fronts: selective walls + towers | 8/8 · 84.9% | 3/8 · 75.3% | 7/8 · 92.3% |
| Reinforced main: full enclosure + towers | 7/8 · 72.8% | 2/8 · 71.6% | 6/8 · 91.8% |
| Distributed walls + towers | 8/8 · 90.3% | 4/8 · 80.4% | 6/8 · 93.7% |

The scouted strategy buys the real 50 G report, spends one quarter of remaining
gold on main-front walls, then adds towers. Reinforced main leaves satellites
exposed; distributed allocates walls/towers across principal settlements
(one principal in Compact Town). All defenses use the real client treasury;
there are no gold injections or schedule edits. Basic enclosure alone is not
an effective killing defense. Twin keeps and outlying objectives remain
difficult; budgets do not make every approach trivially successful. Enemy
counts/composition/HP were **not tuned**.

Legacy seed-1 equal-cost comparisons still pass at their original six/seven
towers via a test-helper limit, preserving their original tactical assertion.
The map-edge check now requires its cost to exceed the treasury, replacing
the obsolete three-budget multiplier. No other old-budget fixtures needed
changes. Handcrafted treasury is 1950 G versus main 1560 G and combined
4200 G estimates; original authored defense fixtures retain their behavior.
The specified dilation is tighter than an equally padded rectangular curtain
on the connected irregular fixture; disconnected farming lobes and road gate
crossings can exceed older unpadded rectangular estimates.

Controller screenshots at 1366×768 (handcrafted and twin seed 274140) checked
the budget block, scout dialog before/after purchase (50 G deducted) and the
PRIMARY edge marker; no console errors. The scout card now hides the purchase
button once bought and omits it where unavailable (handcrafted), keeping
Begin building visible. Human playtest of the new budgets is still pending.
Historical verification below retains its original budgets.

After central castles and multi-directional sieges `npm test`: **174 passed,
0 failed** (110 unchanged Canyon tests, 64 Frontier tests). New
`test/frontier-fronts.test.js` sweeps 30 seeds per archetype: keep ≤7 tiles
from centre (twin keeps ≥14 apart, flanking the centre), all eight directions
and ≥3 plan types per archetype, edge entries ≥8 tiles from districts, every
enemy entering through its front, unequal per-wave shares with a ≥50% main
front; scout reports name every front with no exact figures; the edge warning
fires 5 s before a front's first entry; the handcrafted contract has no fronts.
Controller screenshots at 1366×768 checked prep arrows/labels for all three
archetypes and the battle INCOMING pulse.

| Seed 1 plan (equal cost) | Budget | Spend | District curtains | Map-edge wall | Result | Preserved | Keep HP |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| Compact, scout-weighted | 827 G | 720 G | 3160 G | 3760 G | Victory | 100% | 2000 |
| Compact, even ring | 827 G | 720 G | | | Victory | 95.3% | 1740 |
| Twin, scout-weighted | 903 G | 840 G | 3200 G | 3760 G | Victory | 81.7% | 1740 / 2000 |
| Twin, even ring | 903 G | 840 G | | | Victory | 68.5% | 440 / 2000 |
| Outpost, scout-weighted | 813 G | 720 G | 3120 G | 3760 G | Victory | 91.5% | 2000 |
| Outpost, even ring | 813 G | 720 G | | | Victory | 86.7% | 1220 |

A 12-seed sweep per archetype: all-in on the main front often lost (diversions
and second waves reach the keep); scout-weighted won 30/36, even rings 28/36,
each beating the other on different seeds — intel helps, no naive plan dominates.

Earlier (generator-variety correction): **170 passed**. The variety test (30 seeds per
archetype: ≥3 terrain patterns, ≥8 keep positions, ≥6 budgets, varied districts,
rivers one four-connected edge-to-edge channel with 1–3 crossings and no porous
gaps) was confirmed to fail against the slice-3 generator before passing.
Generated budgets now span roughly 780–950 G. Slice-3 notes follow. The 22 slice-3 tests cover numerical skills and Canyon
exclusion, career awards/spending/reset/storage failures/retry idempotence,
generator reproducibility and string/numeric seed replay, 30 seeds for each
archetype, clustering/overlaps/spawns/roads/evacuation/objectives, deterministic
rejection/fallback, twin mandatory failure, and balance. All 90 swept maps
generate without fallback. UI and renderer `node --check` checks pass; no
dependencies/build step were added. No browser suite, controller acceptance,
screenshots or aesthetic review were run.

Final deterministic balance measurements (starter skills, except Communication
3 for the negotiated hamlet fixture):

| Contract / plan | Budget | Spend | Equal district curtains | Result | Value preserved | Keep HP |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| Handcrafted / hamlet promise | 800 G | 620 G | 3400 G | Victory | 89.3% | 2000 |
| Compact Town / seed 2 | 720 G | 720 G | 3440 G | Victory | 82.6% | 2000 |
| Twin Settlements / seed 3 | 720 G | 720 G | 3440 G | Victory | 73.3% | 2000 / 1220 |
| Town + Outpost / seed 1 | 720 G | 720 G | 3680 G | Victory | 73.8% | 2000 |

Historical table, measured before the variety correction and before central
castles (generated rows no longer reproduce; see the seed-1 table above).

Generated fixtures choose the first seed with an optional special objective
from initial briefing data, then use public previews/placements to concentrate
towers ahead of keeps. The twin plan allocates two northern and four southern
towers; traces showed the evenly split plan lost the southern keep with its
brute at 69 HP, while the north had no keep damage. Equal curtains mean separate
rectangular wall/gate perimeters, not optimal terrain-assisted construction.

The controlled guard fixture compares identical simultaneous local contacts
on the handcrafted map: two foot raiders at the hill farm and four chiselers
near the keep. It uses real combat/NPCs for 12 simulated seconds with the
normal arrival schedule replaced solely to isolate reassignment. Four keep
guards yield farm liability **180 G**, keep **2000 HP**, **0** arrivals at the
keep; assigning those same guards to the hill farm yields **0 G**, **1646 HP**,
**4** arrivals. Full-schedule traces showed isolated farm guards were overwhelmed
before later raids, masking this specific tradeoff. The hamlet promise pays
**150 G** after Communication 3 negotiation, exceeding the dedicated wall and
tower's **140 G** cost; the full contract wins with the meeting house standing.
No existing balance values were tuned.

Earlier verification is retained below as history; its old map measurements
are not the final slice-3 balance table.

Frontier slice 2 integrated `npm test`: **147 passed, 0 failed**, including all
110 unchanged canyon tests and 37 Frontier tests. `node --check
src/ui/interface.js` and `node --check src/render/renderer.js` pass; no build
step exists. No browser suite, controller acceptance or screenshots were run.

New coverage verifies post defense/return and bounties, Communication reassignment,
bounded wall/gate evacuation, militia retreat, NPC deaths/slam safety, owner
defense placement/hired guards/access/journal, integer money totals, Class A
battle refusal, Class B cost/timing/occupancy, enemy clearance and destroyed-A
footprints, emergency cap/three-site limit, route reservations, no battle editing
or bounty-funded construction, and caltrops damage/slow/exhaustion. A focused
deterministic farm-defense contract completes through normal combat and results:
emergency caltrops reduce assessed orchard loss from **25 G to 2 G**, using the
same paid defense and raid in both runs. The original authored full-contract
distributed/town/empty fixtures still satisfy their victory/loss assertions at
the unchanged 800 G budget.

The first run passed 146/147 with `HARNESS_PRECONDITION_FAILED` in the emergency
benefit scenario: its raider targeted the orchard and never crossed the site.
Position/target/damage traces corrected the fixture's tower coverage and hazard
location; the subsequent integrated run passes. No product assertion was relaxed.

Historical slice-1 verification follows; its old preservation percentages refer
to the smaller settlement and are not measurements of the enriched map.

Frontier slice 1 integrated `npm test`: **129 passed, 0 failed**, including all
110 existing canyon tests with unchanged assertions and 19 new Frontier tests.
The test entry point imports the new suite for Node versions that resolve
`node --test test/` through `test/index.js`. JavaScript syntax checks pass for
`src/main.js`, `src/ui/interface.js`, `src/render/renderer.js` and
`src/render/terrain.js`; no build step exists.

Deterministic Frontier fixtures spend only public construction actions. The
760 G distributed build wins with 93.22% assessed value preserved and the keep
undamaged, fulfilling the merchant promise. The 740 G town-focused build wins
with 84.34% preserved and no keep damage, while losing the eastern farm,
orchard and hamlet cottages and breaking its farmer promise. An empty build
fails the contract. Separate complete rectangular district curtains cost
2480 G versus the 800 G budget; the estimate explicitly does not claim to be
the cheapest possible terrain-assisted defense. Pure damage fixtures cover
pre-existing workshop damage (108/180 HP; assessed 180 G of its 300 G value),
partial/destruction charges, casualties, failure payouts, owner choices,
Communication gates, thank-you caps, idempotence and exact retries.

The first combined run found two fixture assumptions: distributed towers lost
rear brute coverage, and the town build protected the elder's hall while losing
other outlying property. Traced positions and damage events informed the final
forward/rear tower plan and exposed-farm promise; the assertions still require
a real high-preservation victory and a real broken-promise victory.
No controller acceptance, browser suites or screenshots were run/produced.

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
- No known failing headless checks remain: latest `npm test` is 194/194.
  Current budget/scouting UI has no captured visual evidence; 1366×768 layout,
  markers, human playtesting and Claude's aesthetic review remain pending.
  Controller behavioral
  acceptance, human playtesting and final visual review remain incomplete.
- Generated sieges now attack from any of eight directions with unequal
  fronts and optional second waves; latest budget balance is a 96-contract
  headless sweep across eight seeds per archetype and four public-action plans.
- The generator intentionally uses four authored geographic patterns, not
  unrestricted terrain synthesis. Maps author no pendulum sites. Careers
  persist only skill levels, development points and completed-contract count;
  earnings and reputation stay contract-local. A storage-denied browser loses
  its in-memory career when the page closes.
- Frontier workshop payment is an immediate conditional advance in owner
  earnings, reconciled at results; a broken promise pays zero in the final
  ledger. No owner payment or bounty can fund construction.
- Controller screenshot review at 1366×768 (title, briefing, request dialog,
  prep, battle with emergency site, results, all three archetypes) is done;
  remaining visual judgment is for human playtest. Original note: Frontier visual layout and final aesthetic judgment remain for the
  controller/Claude. No screenshots or browser acceptance were produced here.
- Not yet play-tested by a human; balance comes from headless reference runs.
  Frontier playtest questions: are skill effects and slow point awards clear?
  Are mandatory special objectives distinguishable from optional owner promises?
  Do Twin Settlements feel similarly valuable, and does protecting both keeps
  leave a satisfying choice over farming losses? Are seeds, replay and fallback
  understandable? Does reassignment feel worthwhile before isolated guards are
  overwhelmed? Do briefing, career, prep skills and both keep results fit and
  remain readable at 1366×768? Canyon questions: is S3 too hard without the pendulum, is the
  pendulum worth 400 gold, do players discover forward walls at bends? Do scout
  reports help players choose spikes, golems and trigger lanes, and does the very
  successful mechanical fixture leave enough room for other viable approaches?
- Controller review remains for 1366×768 scout/results readability, chain visibility,
  simultaneous bounty-label legibility, pendulum impact weight and shake intensity.
- Audio is procedural and untested by ear.
