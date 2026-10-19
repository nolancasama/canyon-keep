# Canyon Keep

Standalone 2D Canvas castle-engineering / siege-defense prototype.

- **`SPEC.md` is the authoritative design.** Read it before changing behaviour.
  Record new meaningful decisions in `DESIGN_DECISIONS.md`.
- Run: `npm start` (or `start.bat`) → http://localhost:5180. Tests: `npm test`.
- `src/sim/`, `src/data/`, `src/config.js` are pure and headless (no DOM, no
  `Math.random`, no `Date.now`). Rendering/UI read state and call the api only.
- All balance numbers live in `src/config.js`.
- Not related to `../castlerush`; never read or modify it.
