# Changes against upstream Snake-JS

Upstream: https://github.com/betamos/Snake-JS (Didrik Nordström, MIT).
Files `README.md`, `example.html` and the untouched parts of `snake-js.js` are
the upstream work. Everything below was added for the snake-vs-snack demo.

## New files

- `index.html` – demo page: Klasik / Kaçan Yem mode switch, restart button,
  dark theme, responsive canvas, Turkish labels.
- `LICENSE` – MIT text for the upstream work (upstream ships none).
- `tests/verify.js` – Playwright script that plays both modes with a bot and
  checks every frame against the rules (run: `node tests/verify.js`).
- `REA-ANALYSIS.md` – what REA found in the original code before changes.

## `snake-js.js`

### Escaping candy mechanic (Engine)
- New config: `escapingCandy` (false = classic), `escapeDistance` (4),
  `escapeEveryNMoves` (3), `candyEyeColor`, `candyPupilColor`.
- `nextFrame`: counts snake moves (`movesSinceCandyStep`), keeps the original
  order (move → age → eat check) and only then calls `fleeCandy()`. A head
  landing on the candy cell is therefore always eaten first.
- `fleeCandy()`: while Manhattan distance < `escapeDistance`, at most once per
  `escapeEveryNMoves` snake moves, steps 1 cell up/down/left/right to a cell
  inside the grid, not on the snake, that increases the distance the most;
  random tie-break; stays put when trapped. Only runs inside the existing
  `setInterval` game loop, so a paused or finished game never moves the candy.
- `updateCandyMood()`: sets `candy.scared` / `candy.fleeVector` (for the eyes).
- A freshly spawned candy waits `escapeEveryNMoves` moves before its first step.

### Snake length (demo tuning)
- New config `initialLength` (demo: 5) and `growthPerCandy` (demo: 1).
  `createSnakeBody()` places a horizontal 5-cell body with the head on the
  right, both at game start and when the snake is revived after game over.
  Upstream started with 1 cell growing to 7, and grew 3/5/0 cells per candy
  type; defaults (`initialLength: 1`, `growthPerCandy: null`) keep that.
  Growth is still applied on the move after the candy is eaten.

### Robustness
- `randomCandy()` now builds the list of free cells and returns `null` on a
  full board instead of looping forever; `nextFrame` then calls `winGame()`
  (`STATE_WON`, interval cleared, `winMessage` overlay).
- Game-over animation timeouts are tracked in `pendingTimeouts`.
- New public API: `destroy()` (clears interval + timeouts, removes key/blur/
  focus listeners and the canvas), `getScore()`, `getState()` (plain snapshot),
  and `resume()` now calls the existing `resumeGame` (upstream called a
  non-existent `engine.resume`).
- `Snake.collidesWith`: `range` declared with `var` (was an implicit global).
- New `STATE_WON` and `STATE_DESTROYED` constants.

### Input
- Arrow keys and WASD, resolved by `event.key` with `keyCode` fallback;
  modifier combinations are ignored; `preventDefault` keeps the page still.

### View
- Scared candy gets two eyes with pupils looking away from the snake.
- Score board: configurable height, labels (`scoreLabel`, `highScoreLabel`),
  font scales with the board height.
- Optional faint grid lines (`gridLineColor`), `drawMessage()` overlay,
  `destroy()` to remove the canvas, `onUpdate(state)` callback after redraws.
- Regular candy radius 0.3 → 0.38 (more visible on video).
