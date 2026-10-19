# Design Decisions

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
