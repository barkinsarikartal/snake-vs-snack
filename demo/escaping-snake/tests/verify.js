// Browser verification for the escaping-candy Snake demo.
// Drives the real page with a greedy "chase the candy" bot and checks every
// recorded frame against the rules of the spec.
const { chromium } = require('playwright');
const fs = require('fs');

const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = process.argv[2] || path.resolve(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const ESCAPE_DISTANCE = 4, EVERY_N = 3;
const STATE = { READY: 1, PAUSED: 2, PLAYING: 3, GAME_OVER: 4, WON: 5, DESTROYED: 6 };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  -- ' + detail : ''));
}
const manhattan = (a, b) => Math.abs(a.left - b.left) + Math.abs(a.top - b.top);
const same = (a, b) => a.left === b.left && a.top === b.top;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Installed inside the page: records every distinct game state and steers the
// snake toward the candy with synthetic keyboard events (arrows or WASD).
const PAGE_HELPERS = `
(() => {
  window.__frames = [];
  window.__bot = { enabled: false, useWasd: false, lastKey: null };
  let last = null;
  const KEYS = { arrows: { up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft' },
                 wasd: { up: 'w', right: 'd', down: 's', left: 'a' } };
  const DIR = { up: 1, right: 2, down: -1, left: -2 };
  const VEC = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  function press(name) {
    const key = (window.__bot.useWasd ? KEYS.wasd : KEYS.arrows)[name];
    window.__bot.lastKey = key;
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }
  function wrap(v, n) { return ((v % n) + n) % n; }
  function steer(s) {
    if (!s.candy || !(s.state === 1 || s.state === 3)) return;
    const head = s.snake[0];
    const body = new Set(s.snake.slice(0, s.growthLeft > 0 ? s.snake.length : s.snake.length - 1).map(p => p.left + ',' + p.top));
    const dx = s.candy.left - head.left, dy = s.candy.top - head.top;
    const prefs = [];
    if (Math.abs(dx) >= Math.abs(dy)) { if (dx) prefs.push(dx > 0 ? 'right' : 'left'); if (dy) prefs.push(dy > 0 ? 'down' : 'up'); }
    else { if (dy) prefs.push(dy > 0 ? 'down' : 'up'); if (dx) prefs.push(dx > 0 ? 'right' : 'left'); }
    for (const d of ['up', 'right', 'down', 'left']) if (!prefs.includes(d)) prefs.push(d);
    for (const d of prefs) {
      if (s.snake.length > 1 && DIR[d] === -s.direction) continue;   // no reversing
      const nx = wrap(head.left + VEC[d][0], s.gridWidth), ny = wrap(head.top + VEC[d][1], s.gridHeight);
      if (body.has(nx + ',' + ny)) continue;
      press(d); return;
    }
    press(prefs[0]);
  }
  setInterval(() => {
    if (!window.game) return;
    let s; try { s = window.game.getState(); } catch (e) { return; }
    s.t = performance.now();
    const key = JSON.stringify([s.snake[0], s.snake.length, s.candy, s.score, s.state]);
    if (key !== last) { last = key; window.__frames.push(s); }
    if (window.__bot.enabled) steer(s);
  }, 5);
})();
`;

// Length must equal 5 + number of candies eaten, as long as the snake has not died.
function growthDetail(frames) {
  const first = frames.find(f => f.state === STATE.READY || f.state === STATE.PLAYING);
  let eats = 0, bad = null;
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1], f = frames[i];
    if (f.state !== STATE.PLAYING || prev.state === STATE.GAME_OVER) break;
    // growth is applied on the move after the candy is eaten (upstream behaviour),
    // so the frame that eats still shows the old length
    if (f.snake.length !== 5 + eats) { bad = `frame ${i}: length ${f.snake.length}, expected ${5 + eats}`; break; }
    if (f.score > prev.score) eats++;
  }
  return JSON.stringify({ startLength: first && first.snake.length, eatsChecked: eats, problem: bad });
}
function growthOk(frames) {
  const d = JSON.parse(growthDetail(frames));
  return d.startLength === 5 && d.problem === null && d.eatsChecked >= 1;
}

function analyseFrames(frames, mode) {
  // Frames are consecutive distinct states. A "snake move" is a frame whose
  // head differs from the previous frame's head while both are PLAYING.
  const stats = { snakeMoves: 0, fleeSteps: 0, eats: 0, deaths: 0, maxScore: 0, violations: [] };
  let movesSinceStep = 0; // a fresh candy waits EVERY_N snake moves before its first step
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1], cur = frames[i];
    if (cur.score > stats.maxScore) stats.maxScore = cur.score;
    if (cur.state === STATE.GAME_OVER && prev.state !== STATE.GAME_OVER) stats.deaths++;
    if (!prev.candy || !cur.candy) continue;
    if (!(prev.state === STATE.PLAYING || prev.state === STATE.READY) || cur.state !== STATE.PLAYING) continue;
    const headMoved = !same(prev.snake[0], cur.snake[0]);
    const ate = cur.score > prev.score;
    const candyMoved = !same(prev.candy, cur.candy);
    if (!headMoved) {
      // The snake did not move (collision grace frame or a non-frame update): the candy must not move either
      if (candyMoved && !ate && prev.candy.type !== 3)
        stats.violations.push(`frame ${i}: candy moved while snake did not`);
      continue;
    }
    stats.snakeMoves++;
    movesSinceStep++;
    const newHead = cur.snake[0];
    // Rule: head arriving on the candy cell => eaten, never escaped
    if (same(newHead, prev.candy)) {
      if (!ate) stats.violations.push(`frame ${i}: head reached candy at ${JSON.stringify(prev.candy)} but score did not increase`);
      stats.eats++;
      movesSinceStep = 0;
      continue;
    }
    if (ate) { stats.eats++; movesSinceStep = 0; continue; }
    if (candyMoved && prev.candy.type === 3 && cur.candy.type !== undefined && manhattan(prev.candy, cur.candy) > 1) {
      // shrinking candy expired and respawned elsewhere (original behaviour)
      movesSinceStep = 0;
      continue;
    }
    const distBefore = manhattan(newHead, prev.candy);
    if (mode === 'classic') {
      if (candyMoved) stats.violations.push(`frame ${i}: candy moved in classic mode`);
      continue;
    }
    // escaping mode
    const onSnake = p => cur.snake.some(q => same(p, q));
    const inGrid = p => p.left >= 0 && p.top >= 0 && p.left < cur.gridWidth && p.top < cur.gridHeight;
    const neighbours = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => ({ left: prev.candy.left + dx, top: prev.candy.top + dy }));
    const improving = neighbours.filter(p => inGrid(p) && !onSnake(p) && manhattan(newHead, p) > distBefore);
    const bestDist = improving.length ? Math.max(...improving.map(p => manhattan(newHead, p))) : null;
    if (candyMoved) {
      stats.fleeSteps++;
      const step = manhattan(prev.candy, cur.candy);
      if (step !== 1) stats.violations.push(`frame ${i}: candy stepped ${step} cells`);
      if (distBefore >= ESCAPE_DISTANCE) stats.violations.push(`frame ${i}: candy fled at distance ${distBefore}`);
      if (movesSinceStep < EVERY_N) stats.violations.push(`frame ${i}: candy stepped after only ${movesSinceStep} snake moves`);
      if (!inGrid(cur.candy)) stats.violations.push(`frame ${i}: candy left the grid ${JSON.stringify(cur.candy)}`);
      if (onSnake(cur.candy)) stats.violations.push(`frame ${i}: candy moved onto the snake`);
      const distAfter = manhattan(newHead, cur.candy);
      if (distAfter <= distBefore) stats.violations.push(`frame ${i}: candy step did not increase distance (${distBefore} -> ${distAfter})`);
      if (bestDist !== null && distAfter !== bestDist) stats.violations.push(`frame ${i}: candy chose distance ${distAfter}, best was ${bestDist}`);
      movesSinceStep = 0;
    } else {
      // candy stayed: allowed only if calm, not yet allowed, or trapped
      if (distBefore < ESCAPE_DISTANCE && movesSinceStep >= EVERY_N && improving.length > 0)
        stats.violations.push(`frame ${i}: candy stayed at distance ${distBefore} although ${improving.length} improving cell(s) existed`);
    }
  }
  return stats;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE);
  await page.evaluate(PAGE_HELPERS);

  // ---- Layout: narrow vertical window, no horizontal overflow
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
    canvasWidth: document.querySelector('#playfield canvas').getBoundingClientRect().width,
    canvases: document.querySelectorAll('canvas').length, mode: document.body.getAttribute('data-mode')
  }));
  check('page fits a 420px-wide window without horizontal scroll', layout.scrollWidth <= layout.innerWidth, JSON.stringify(layout));
  check('one canvas, classic mode on load', layout.canvases === 1 && layout.mode === 'classic');
  await page.screenshot({ path: OUT + '/01-classic-start-narrow.png' });

  // ---- Classic mode: bot plays 12 s
  await page.evaluate(() => { window.__frames.length = 0; window.__bot.enabled = true; });
  await sleep(12000);
  await page.evaluate(() => { window.__bot.enabled = false; });
  let frames = await page.evaluate(() => window.__frames);
  let st = analyseFrames(frames, 'classic');
  check('classic: snake moves and eats static candy', st.snakeMoves > 30 && st.eats >= 1, JSON.stringify({ moves: st.snakeMoves, eats: st.eats, maxScore: st.maxScore, deaths: st.deaths }));
  check('classic: candy never moved on its own', st.violations.length === 0, st.violations.slice(0, 5).join(' | '));
  check('classic: candy never shows scared eyes', frames.every(f => !f.candy || !f.candy.scared));
  check('classic: starts with 5 cells, +1 cell per candy', growthOk(frames), growthDetail(frames));
  await page.screenshot({ path: OUT + '/02-classic-playing.png' });

  // ---- Mode switch: old game must be fully stopped
  await page.evaluate(() => { window.__old = window.game; });
  await page.click('#mode-escaping');
  await sleep(300);
  const sw = await page.evaluate(() => {
    const o = window.__old.getState();
    return { oldState: o.state, oldHead: o.snake[0], sameObject: window.__old === window.game,
             canvases: document.querySelectorAll('canvas').length, mode: document.body.getAttribute('data-mode'),
             newState: window.game.getState().state };
  });
  await page.keyboard.press('ArrowRight');
  await sleep(700);
  const sw2 = await page.evaluate(() => {
    const o = window.__old.getState(); const n = window.game.getState();
    return { oldHead: o.snake[0], oldState: o.state, newState: n.state, newLen: n.snake.length };
  });
  check('mode switch: single canvas, escaping mode active, fresh game in READY', sw.canvases === 1 && sw.mode === 'escaping' && !sw.sameObject && sw.newState === STATE.READY, JSON.stringify(sw));
  check('mode switch: old game destroyed, ignores keys, no timers running', sw.oldState === STATE.DESTROYED && sw2.oldState === STATE.DESTROYED && same(sw.oldHead, sw2.oldHead) && sw2.newState === STATE.PLAYING, JSON.stringify(sw2));

  // ---- Escaping mode: bot plays with WASD for 45 s
  await page.click('#restart');
  await sleep(200);
  await page.evaluate(() => { window.__frames.length = 0; window.__bot.useWasd = true; window.__bot.enabled = true; });
  // grab a screenshot the first time the candy is scared
  let scaredShot = false;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    await sleep(100);
    if (!scaredShot) {
      const scared = await page.evaluate(() => { const s = window.game.getState(); return !!(s.candy && s.candy.scared && s.state === 3); });
      if (scared) { await page.screenshot({ path: OUT + '/03-escaping-scared-candy.png' }); scaredShot = true; }
    }
  }
  await page.evaluate(() => { window.__bot.enabled = false; });
  frames = await page.evaluate(() => window.__frames);
  st = analyseFrames(frames, 'escaping');
  fs.writeFileSync(OUT + '/escaping-frames.json', JSON.stringify(frames));
  check('escaping: WASD steering works (snake moved)', st.snakeMoves > 100, `moves=${st.snakeMoves}`);
  check('escaping: candy actually flees', st.fleeSteps >= 5, `fleeSteps=${st.fleeSteps}`);
  check('escaping: candy is still catchable (eaten at least twice)', st.eats >= 2, `eats=${st.eats} maxScore=${st.maxScore} deaths=${st.deaths}`);
  check('escaping: every flee step obeys distance<4, 1 cell, orthogonal, >=3 moves apart, in grid, off snake, increases distance', st.violations.length === 0, st.violations.length + ' violation(s): ' + st.violations.slice(0, 6).join(' | '));
  check('escaping: head reaching the candy cell always eats it', !st.violations.some(v => v.includes('score did not increase')));
  // "scared" is evaluated when the snake moves, before the candy's own step:
  // compare with the candy position before the step (prev frame) when it moved.
  const moodMismatches = [];
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1], f = frames[i];
    if (!f.candy || f.state !== STATE.PLAYING || !prev.candy) continue;
    const ate = f.score > prev.score;
    if (ate) continue; // spawn cell of the new candy is unknown to the recorder
    const before = (!same(prev.candy, f.candy) && manhattan(prev.candy, f.candy) === 1) ? prev.candy : f.candy;
    if (f.candy.scared !== (manhattan(f.snake[0], before) < ESCAPE_DISTANCE)) moodMismatches.push(i);
  }
  check('escaping: scared eyes shown exactly when the head is closer than 4', moodMismatches.length === 0, 'mismatching frames: ' + moodMismatches.slice(0, 5).join(','));
  check('escaping: scared screenshot captured', scaredShot);
  check('escaping: starts with 5 cells, +1 cell per candy', growthOk(frames), growthDetail(frames));
  await page.screenshot({ path: OUT + '/04-escaping-playing.png' });

  // ---- Pause: no candy movement while paused
  await page.evaluate(() => { window.__frames.length = 0; window.game.pause(); });
  await sleep(1500);
  const pausedFrames = await page.evaluate(() => window.__frames.length);
  const pausedState = await page.evaluate(() => window.game.getState().state);
  check('pause: nothing moves while paused', pausedFrames <= 1 && pausedState === STATE.PAUSED, `frames=${pausedFrames} state=${pausedState}`);
  await page.evaluate(() => window.game.resume());

  // ---- Restart button resets score and keeps a single canvas
  await page.click('#restart');
  await sleep(200);
  const rs = await page.evaluate(() => ({ score: window.game.getState().score, state: window.game.getState().state, canvases: document.querySelectorAll('canvas').length, len: window.game.getState().snake.length }));
  check('restart: score 0, READY, one canvas, snake reset to 5 cells', rs.score === 0 && rs.state === STATE.READY && rs.canvases === 1 && rs.len === 5, JSON.stringify(rs));

  // ---- Keys never scroll the page (short viewport so the page is scrollable)
  await page.setViewportSize({ width: 420, height: 360 });
  await sleep(100);
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
  for (const k of ['ArrowDown', 'ArrowDown', 'Space', 's', 'ArrowRight']) await page.keyboard.press(k);
  await sleep(300);
  const scrollY = await page.evaluate(() => window.scrollY);
  check('keys do not scroll the page', scrollable && scrollY === 0, `scrollable=${scrollable} scrollY=${scrollY}`);
  await page.setViewportSize({ width: 420, height: 760 });

  // ---- Win state on a tiny board (no infinite loop when the board is full)
  const win = await page.evaluate(async () => {
    window.game.destroy();
    const el = document.getElementById('playfield');
    const g = new SnakeJS(el, { gridWidth: 1, gridHeight: 4, pointSize: 20, frameInterval: 20, escapingCandy: true, winMessage: 'KAZANDIN!', initialLength: 1, growthPerCandy: 1 });
    window.game = g;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      await new Promise(r => setTimeout(r, 20));
      const s = g.getState();
      if (s.state === 5) return { won: true, len: s.snake.length, candy: s.candy, ms: Date.now() - t0 };
    }
    const s = g.getState();
    return { won: false, state: s.state, len: s.snake.length, candy: s.candy };
  });
  check('full board ends in WON state, no hang', win.won && win.len === 4 && win.candy === null, JSON.stringify(win));
  await page.screenshot({ path: OUT + '/05-win-state.png' });

  check('no page errors or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();

  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  fs.writeFileSync(OUT + '/results.json', JSON.stringify(results, null, 2));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
