# Current State

## Status
Fortress Engineer milestone 1 implemented: kill bounties and automatic settlement
growth, on the playable three-siege prototype. Headless validation passes;
controller behavioral acceptance and aesthetic review of this update are pending.
Work remains uncommitted. Later Fortress Engineer machinery is outside this update.

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
  their original base-cost calculation. Walls and gates atomically replace one
  another for new price minus the old HP-scaled refund, in clicks and drag lines;
  only a positive net cost is required, and adjacent towers remain supported.
- The Start Siege advisory shows road readiness. Blocked-road hints pulse on
  bordering walls/barricades; previews show wall/gate net replacement prices.
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

Actions include `place`, `placeLine`, `demolish`, `repair`, `repairAll`,
`startSiege`, `triggerPendulum`, `setSpeed`, `stepSeconds`, `tick`,
`continueCampaign`, `dismissGrowthReport`, `advancePrep(dt)`, `retrySiege`,
`restartCampaign`, previews and capacity checks. `advancePrep` advances highlight
time only in preparation after the report is dismissed.
`place('wall', x, y)` and `place('gate', x, y)` atomically replace a living gate
and wall respectively. `readiness()` returns
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
`npm test`: baseline **48 passed, 0 failed**; final **64 passed, 0 failed**.
Coverage includes once-only bounty accounting (boss, powder chains, pendulum),
informational results totals, exact treasury rollback, client structure/tool
protection, free rebuilds, weighted rating, deterministic growth, outside-wall
exceptional growth, no overlap/cliffs, military clearance, pendulum avoidance,
road preservation, shortages, extra food, report/highlight lifecycle and retry
without duplicate settlement growth.
The affordable campaign reference still wins all three sieges deterministically
without a pendulum; unchanged Siege 1 defenses still lose Siege 3 with growth.
Military fixture positions are unchanged; obsolete civilian placements were removed.
Reference entering-prep treasuries: S2 **615 → 615 G**, S3 **1010 → 1010 G**
(both **0%** change). Battle bounties are 212/312/450 G; results payouts changed
575/775/725 → 363/463/275 G. Siege durations remain 219.4/243.7/260.1 seconds.
No browser suites, controller acceptance checks or screenshots were run/produced
for this update. UI layout and aesthetics remain for controller review.

## Known Issues / Next Steps
- Not yet play-tested by a human; balance comes from headless reference runs.
  First playtest questions: is S3 too hard without the pendulum, is the
  pendulum worth 400 gold, do players discover forward walls at bends?
- Pendulum gantry reads at a glance but could be larger/more ornate.
- Results breakdown mixes stats and gold rows in row-major two columns.
- Audio is procedural and untested by ear.
