# Current State

## Status
Complete playable prototype (SPEC milestones A–E). Slices 1 and 2 are
controller-reviewed and visually accepted from rendered screenshots (prep,
strike bands, pendulum swing, siege 3 battle, results, Siege 2 prep, campaign
complete). Work is uncommitted on top of the docs-only baseline commit.

## Run
Run `npm start`, then open http://localhost:5180 (or use `start.bat`).
Run headless simulation tests with `npm test`. No dependencies or build step.

## Prototype
- Whole-map Canvas2D castle engineering on the unchanged controller canyon,
  with trade roads, gates, integrated towers, repairs, rubble and attack markers.
- Three scripted sieges with population 6/10/14, mandatory housing/food capacity,
  exact shortage messages and disabled Start Siege when capacity is insufficient.
  Six inhabitants live at the keep and four per house thereafter; civilians
  idle at their homes and flee to shelter. Foot soldiers pillage nearby farms
  and houses until destroyed; destroyed buildings cease supplying capacity.
- Deterministic 60 Hz breach-cost pathing, archers, chiselers, powder chains,
  boss windups/slams, inhabitant attacks and victory/defeat.
- Itemized victory/defeat results, every reward and penalty, minimum payout,
  treasury after payout, inspection, Continue, exact pre-siege retry and restart.
  Continue applies a siege's payout once and preserves structure damage;
  after the third Continue, a campaign-complete panel displays totals.
- Titan's Pendulum manual release, friendly damage, cooldown, ready pulse and
  recharge ring. Enlarged timber/iron A-frame, anchors, rotating ratchet drum,
  double chains, spiked hammer and stronger swing smear.
- Cached organic cliff contours and fractured angular rock plates/cracks with
  brighter lips and deep shading. Clear amber strike bands follow the same
  visual contour; orange intersections warn of friendly structure damage.
- Battle HUD, pause, 1×/2×/4× playback, procedural audio and mute.

## Debug / Harness Surface
`window.__game.state` is a live getter; UI/render code observes it without
mutation. `api.phase()` retains its phase-string interface. Campaign observations:
- `state.phase`: `prep`, `siege`, `victory`, `defeat`, `complete`.
- `state.siegeIndex`, `population`, `prepGold`, `gold`.
- `state.results`: per-siege counts, bonuses, penalties, raw payout, payout,
  `floorApplied`, keep damage and treasury after payout.
- `state.campaign`: `rewardedSieges`, immutable result copies in `history`,
  aggregate `totals`, and `complete`.
- `state.pendulum.status`, `elapsed`, `resetRemaining`, `angle`, `drumAngle`,
  `swingId`, `hitIds`; enemy attack phase, target, windup, stun and slow;
  `keepReached`, `stats.keepReachedEnemies`, schedules, events and flow revision.

Actions include `place`, `placeLine`, `demolish`, `repair`, `repairAll`,
`startSiege`, `triggerPendulum`, `setSpeed`, `stepSeconds`, `tick`,
`continueCampaign`, `retrySiege`, `restartCampaign`, previews and capacity checks.
`stepSeconds` advances simulation independent of playback speed. Retry restores
the exact full preparation snapshot, including RNG and pending campaign history.
The third victory's payout is applied by Continue before `complete` is entered.

## Verification
`npm test`: **34 passed, 0 failed**, including the affordable no-pendulum
campaign reference winning all three sieges deterministically (S3 keep ends at
180/2000), and the unchanged Siege 1 castle losing Siege 3. Siege lengths at 1×:
~3.6 / 4.1 / 4.5 min.

## Known Issues / Next Steps
- Not yet play-tested by a human; balance comes from headless reference runs.
  First playtest questions: is S3 too hard without the pendulum, is the
  pendulum worth 400 gold, do players discover forward walls at bends?
- Pendulum gantry reads at a glance but could be larger/more ornate.
- Results breakdown mixes stats and gold rows in row-major two columns.
- Audio is procedural and untested by ear.
