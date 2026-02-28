// ── js/background.js ── Retro Satellite Tracking HUD ──────────────────
// Purely decorative background for the 1D Spy Role Play Game.
// Everything here is non-interactive; only the 1D pixel strip is gameplay.

/* ── palette ──────────────────────────────────────────────── */
const HUD_AMBER  = [255, 140, 0];
const HUD_BRIGHT = [255, 185, 50];

/* ── layout (set once in initSpyBackground) ───────────────── */
let _mL, _mR, _mT, _mB;          // map-area pixel bounds

/* ── pre-rendered buffer ──────────────────────────────────── */
let _hudBuf  = null;
let _hudOK   = false;
let _beamY   = 0;                  // scanline sweep position

/* ═══════════════════════════════════════════════════════════ */
/*  PUBLIC API                                                */
/* ═══════════════════════════════════════════════════════════ */

function initSpyBackground() {
  _mL = 80;
  _mR = width - 50;
  _mT = 55;
  _mB = height - 40;

  _hudBuf = createGraphics(width, height);
  _renderStaticHUD(_hudBuf);
  _hudOK = true;
}

/** Call once per frame in draw(), before the 1-D strip renders. */
function drawSpyBackground() {
  if (!_hudOK) initSpyBackground();
  image(_hudBuf, 0, 0);

  // per-frame dynamic overlays
  _dynScanlines();
  _dynClock();
  _dynStripAccent();
}

/* ═══════════════════════════════════════════════════════════ */
/*  STATIC HUD  (rendered once into an off-screen buffer)     */
/* ═══════════════════════════════════════════════════════════ */

function _renderStaticHUD(g) {
  g.background(10, 8, 4);
  noiseSeed(42);               // deterministic terrain

  _sTerrain(g);                // faint landmass noise fills
  _sContours(g);               // topographic contour dots
  _sGrid(g);                   // coordinate grid lines
  _sFrame(g);                  // outer HUD border
  _sCoords(g);                 // axis numbers
  _sLocation(g);               // VERDANSK label box
  _sSatLabel(g);               // SATELLITE CBK 04
  _sTimerBox(g);               // clock outline (value is dynamic)
  _sStatusBars(g);             // top indicator blocks
  _sTrackLine(g);              // decorative dashed tracking line
  _sStripLabel(g);             // small label near the 1-D strip
  _sVignette(g);               // CRT edge-darkening
}

/* ── terrain fills ────────────────────────────────────────── */
function _sTerrain(g) {
  const res = 6, sc = 0.0035;
  g.noStroke();
  for (let x = _mL; x < _mR; x += res) {
    for (let y = _mT; y < _mB; y += res) {
      const n = noise(x * sc + 10, y * sc + 10);
      if (n > 0.44) {
        const a = constrain(map(n, 0.44, 0.72, 2, 14), 2, 14);
        g.fill(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], a);
        g.rect(x, y, res, res);
      }
    }
  }
}

/* ── contour dots (threshold crossings in Perlin noise) ───── */
function _sContours(g) {
  const res = 4, sc = 0.0035;
  const thresholds = [0.30, 0.37, 0.44, 0.51, 0.58, 0.65];

  g.strokeWeight(1.2);
  g.noFill();

  for (let th of thresholds) {
    g.stroke(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 22);

    // horizontal scan
    for (let y = _mT; y < _mB; y += res) {
      let pv = noise(_mL * sc + 10, y * sc + 10);
      for (let x = _mL + res; x < _mR; x += res) {
        const nv = noise(x * sc + 10, y * sc + 10);
        if ((pv < th) !== (nv < th)) g.point(x, y);
        pv = nv;
      }
    }

    // vertical scan
    for (let x = _mL; x < _mR; x += res) {
      let pv = noise(x * sc + 10, _mT * sc + 10);
      for (let y = _mT + res; y < _mB; y += res) {
        const nv = noise(x * sc + 10, y * sc + 10);
        if ((pv < th) !== (nv < th)) g.point(x, y);
        pv = nv;
      }
    }
  }
}

/* ── grid ─────────────────────────────────────────────────── */
function _sGrid(g) {
  g.stroke(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 18);
  g.strokeWeight(0.5);

  const cols = 16, rows = 8;
  const cw = (_mR - _mL) / cols;
  const ch = (_mB - _mT) / rows;

  for (let i = 0; i <= cols; i++) {
    const x = _mL + i * cw;
    g.line(x, _mT, x, _mB);
  }
  for (let i = 0; i <= rows; i++) {
    const y = _mT + i * ch;
    g.line(_mL, y, _mR, y);
  }
}

/* ── frame ────────────────────────────────────────────────── */
function _sFrame(g) {
  g.noFill();
  // outer
  g.stroke(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 110);
  g.strokeWeight(2);
  g.rect(_mL, _mT, _mR - _mL, _mB - _mT);
  // inner
  g.stroke(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 35);
  g.strokeWeight(0.5);
  g.rect(_mL + 4, _mT + 4, _mR - _mL - 8, _mB - _mT - 8);
}

/* ── coordinate labels ────────────────────────────────────── */
function _sCoords(g) {
  g.textFont('monospace');
  g.textSize(10);
  g.noStroke();
  g.fill(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 80);

  const cols = 16, rows = 8;
  const cw = (_mR - _mL) / cols;
  const ch = (_mB - _mT) / rows;

  // bottom — longitude
  g.textAlign(CENTER, TOP);
  for (let i = 0; i <= cols; i++) {
    g.text(String(20 + i), _mL + i * cw, _mB + 6);
  }
  // right — latitude
  g.textAlign(LEFT, CENTER);
  for (let i = 0; i <= rows; i++) {
    g.text((5 + (rows - i) * 5) + 'N', _mR + 8, _mT + i * ch);
  }
}

/* ── location label box ───────────────────────────────────── */
function _sLocation(g) {
  const bx = _mL + 12, by = _mT + 14, bw = 165, bh = 30;

  g.noFill();
  g.stroke(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 130);
  g.strokeWeight(1.5);
  g.rect(bx, by, bw, bh);

  g.noStroke();
  g.fill(HUD_BRIGHT[0], HUD_BRIGHT[1], HUD_BRIGHT[2], 230);
  g.textFont('monospace');
  g.textSize(17);
  g.textAlign(LEFT, CENTER);
  g.text('VERDANSK', bx + 14, by + bh / 2 + 1);
}

/* ── satellite label ──────────────────────────────────────── */
function _sSatLabel(g) {
  g.noStroke();
  g.fill(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 140);
  g.textFont('monospace');
  g.textSize(13);
  g.textAlign(RIGHT, TOP);
  g.text('SATELLITE CBK 04', _mR - 12, _mT + 12);
}

/* ── timer outline (dynamic value drawn per-frame) ────────── */
function _sTimerBox(g) {
  const bx = _mL + 12, by = _mT + 58, bw = 145, bh = 28;

  g.noFill();
  g.stroke(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 80);
  g.strokeWeight(1);
  g.rect(bx, by, bw, bh);
}

/* ── top status bars ──────────────────────────────────────── */
function _sStatusBars(g) {
  g.noStroke();
  g.fill(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 150);
  const y0 = _mT - 24;
  g.rect(_mL + 40, y0, 55, 10);
  g.rect(_mL + 110, y0, 55, 10);
}

/* ── decorative dashed tracking line + crosshair ──────────── */
function _sTrackLine(g) {
  g.strokeWeight(1);

  // main diagonal: lower-left toward centre-right
  const x0 = _mL + 60,  y0 = _mB - 50;
  const x1 = _mL + (_mR - _mL) * 0.56, y1 = _mT + (_mB - _mT) * 0.38;
  g.stroke(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 35);
  _dashedLine(g, x0, y0, x1, y1, 9, 6);

  // secondary line from upper-right area
  const x2 = _mR - 200, y2 = _mT + 30;
  _dashedLine(g, x2, y2, x1, y1, 7, 5);

  // crosshair at convergence
  const cs = 10;
  g.stroke(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 60);
  g.line(x1 - cs, y1, x1 + cs, y1);
  g.line(x1, y1 - cs, x1, y1 + cs);
  g.noFill();
  g.strokeWeight(0.8);
  g.rect(x1 - 5, y1 - 5, 10, 10);

  // small centre dot
  g.fill(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 90);
  g.noStroke();
  g.ellipse(x1, y1, 3, 3);
}

function _dashedLine(g, x0, y0, x1, y1, dashLen, gapLen) {
  const totalLen = dist(x0, y0, x1, y1);
  if (totalLen < 1) return;
  const dx = (x1 - x0) / totalLen;
  const dy = (y1 - y0) / totalLen;
  let d = 0;
  while (d < totalLen) {
    const sx = x0 + dx * d;
    const sy = y0 + dy * d;
    const ed = min(d + dashLen, totalLen);
    const ex = x0 + dx * ed;
    const ey = y0 + dy * ed;
    g.line(sx, sy, ex, ey);
    d = ed + gapLen;
  }
}

/* ── label just above the 1-D strip ──────────────────────── */
function _sStripLabel(g) {
  const sy = (typeof stripY !== 'undefined') ? stripY : 240;
  g.noStroke();
  g.fill(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 50);
  g.textFont('monospace');
  g.textSize(8);
  g.textAlign(LEFT, BOTTOM);
  g.text('AGENT TRACKING \u25CF LIVE FEED', _mL + 10, sy - 6);
}

/* ── CRT vignette ─────────────────────────────────────────── */
function _sVignette(g) {
  g.noStroke();
  const n = 30;
  // top
  for (let i = 0; i < n; i++) {
    g.fill(0, 0, 0, map(i, 0, n, 70, 0));
    g.rect(0, i * 2, width, 2);
  }
  // bottom
  for (let i = 0; i < n; i++) {
    g.fill(0, 0, 0, map(i, 0, n, 70, 0));
    g.rect(0, height - i * 2 - 2, width, 2);
  }
  // left
  for (let i = 0; i < n; i++) {
    g.fill(0, 0, 0, map(i, 0, n, 50, 0));
    g.rect(i * 2, 0, 2, height);
  }
  // right
  for (let i = 0; i < n; i++) {
    g.fill(0, 0, 0, map(i, 0, n, 50, 0));
    g.rect(width - i * 2 - 2, 0, 2, height);
  }
}

/* ═══════════════════════════════════════════════════════════ */
/*  DYNAMIC OVERLAYS  (drawn every frame on the main canvas)  */
/* ═══════════════════════════════════════════════════════════ */

/* ── CRT scanlines + sweeping beam ────────────────────────── */
function _dynScanlines() {
  push();
  noStroke();

  // static scanline rows
  for (let y = 0; y < height; y += 3) {
    fill(0, 0, 0, 28);
    rect(0, y, width, 1);
  }

  // slow-moving bright scan beam
  _beamY = (_beamY + 1.5) % height;
  fill(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 6);
  rect(0, _beamY - 25, width, 50);
  fill(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 14);
  rect(0, _beamY - 1.5, width, 3);
  pop();
}

/* ── mission clock (elapsed time since play began) ────────── */
function _dynClock() {
  let secs = 0;
  if (typeof controller !== 'undefined' && controller &&
      controller.gameState !== 'PLAYER_SELECTION') {
    secs = millis() / 1000;
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const str = _p2(h) + ':' + _p2(m) + ':' + _p2(s);

  push();
  noStroke();
  fill(HUD_BRIGHT[0], HUD_BRIGHT[1], HUD_BRIGHT[2], 210);
  textFont('monospace');
  textSize(15);
  textAlign(LEFT, CENTER);
  text(str, _mL + 24, _mT + 72);
  pop();
}

function _p2(v) { return v < 10 ? '0' + v : '' + v; }

/* ── amber accent lines flanking the 1-D strip ───────────── */
function _dynStripAccent() {
  const sy = (typeof stripY !== 'undefined') ? stripY : 240;
  const ps = (typeof pixelSize !== 'undefined') ? pixelSize : 20;

  push();
  stroke(HUD_AMBER[0], HUD_AMBER[1], HUD_AMBER[2], 30);
  strokeWeight(0.5);
  line(_mL, sy - 1, _mR, sy - 1);
  line(_mL, sy + ps + 1, _mR, sy + ps + 1);
  pop();
}
