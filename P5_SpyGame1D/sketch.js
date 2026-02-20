/* /////////////////////////////////////

  1D Spy Role Play Game
  Tangible Squid Game â€” keyboard edition

*/ /////////////////////////////////////


let displaySize = 60;   // how many pixels are visible in the game
let pixelSize   = 20;   // how big each 'pixel' looks on screen
let stripY;             // vertical position of the 1D strip in the canvas

let playerOne;   // Pink
let playerTwo;   // Blue
let playerThree; // Red
let playerFour;  // Yellow
let playerFive;  // Green
let allPlayers = [];

let display;      // Aggregates our final visual output before showing it on the screen
let controller;   // State machine and game logic

// Background decorative image
let bgImage;

// sounds
let greenSound;
let redSound;
let shotSound;
let audioUnlocked = false;

// game master (assigned after player-selection finishes)
let gameMasterPlayer  = null;
let gameMasterTracker = null;

// Hidden camera + color tracking (video never shown, runs silently)
let video;
let colorTrackers = [];
let prevVideoPixels = null;


function preload() {
  soundFormats('wav', 'mp3');
  greenSound = loadSound('mission.wav');
  redSound   = loadSound('suspense.mp3');
  shotSound  = loadSound('jail.wav');
  bgImage    = loadImage('spyBackground.png');
}

function tryPlay(_sound) {
  if (!audioUnlocked) return;
  if (!_sound) return;
  if (_sound.isPlaying()) _sound.stop();
  _sound.play();
}

function unlockAudioIfNeeded() {
  // Browsers block audio until the first user interaction.
  if (audioUnlocked) return;
  audioUnlocked = true;
  userStartAudio();
  // If we're already in GO, start (or restart) the green sound.
  if (controller && controller.ensureInitialGreenLightStarted) {
    controller.ensureInitialGreenLightStarted();
  } else if (controller && controller.gameState === "PLAY" && controller.lightState === "GO") {
    tryPlay(greenSound);
  }
}



function setup() {
  const canvasH = 500;
  createCanvas(displaySize * pixelSize, canvasH);
  stripY = floor(canvasH / 2 - pixelSize / 2);

  display = new Display(displaySize, pixelSize);

  // Players start from the left
  playerOne   = new Player(color(255,   0, 255), 0, displaySize); // Pink
  playerTwo   = new Player(color(  0,   0, 255), 0, displaySize); // Blue
  playerThree = new Player(color(255,   0,   0), 0, displaySize); // Red
  playerFour  = new Player(color(255, 255,   0), 0, displaySize); // Yellow
  playerFive  = new Player(color(  0, 255,   0), 0, displaySize); // Green

  allPlayers = [playerOne, playerTwo, playerThree, playerFour, playerFive];

  // Hidden camera — never displayed, used only for color tracking
  video = createCapture(VIDEO);
  video.size(320, 240);
  video.hide();
  if (video.elt) video.elt.setAttribute('playsinline', '');
  prevVideoPixels = null;
  colorTrackers = createColorTrackers(320, 240);

  controller = new Controller();

  // When GO sound ends: switch to red light
  if (greenSound && greenSound.onended) {
    greenSound.onended(() => {
      if (controller && controller.onGreenSoundEnded) controller.onGreenSoundEnded();
    });
  }

  // When STOP sound ends, allow GO after a delay
  if (redSound && redSound.onended) {
    redSound.onended(() => {
      if (controller && controller.onRedSoundEnded) controller.onRedSoundEnded();
    });
  }
}

function draw() {

  // Background decorative image (or dark fallback)
  if (bgImage) {
    image(bgImage, 0, 0, width, height);
  } else {
    background(30, 20, 40);
  }

  // Semi-transparent strip backdrop for readability
  noStroke();
  fill(0, 0, 0, 160);
  rect(0, stripY - 3, width, pixelSize + 6, 3);

  // Run state machine (populates display buffer)
  controller.update();

  // Camera color tracking (invisible — keyboard + color both work)
  updateCameraDrivenPlayers();

  // Render the 1D pixel strip at vertical centre
  push();
  translate(0, stripY);
  noStroke();
  display.show();
  pop();

  // Overlays (countdown, win text, selection UI)
  drawOverlays();

}

function mousePressed() {
  unlockAudioIfNeeded();
  return false;
}

function touchStarted() {
  unlockAudioIfNeeded();
  return false;
}


function drawOverlays() {
  if (!controller) return;

  // Global fade-to-black (win transitions)
  if (controller.getFadeBlackAlpha && controller.getFadeBlackAlpha() > 0) {
    push();
    noStroke();
    fill(0, 0, 0, controller.getFadeBlackAlpha());
    rect(0, 0, width, height);
    pop();
  }

  // â”€â”€ Player Selection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (controller.gameState === "PLAYER_SELECTION") {
    const secLeft   = controller.getSelectionSecondsLeft();
    const threshold = controller.selectionThreshold;
    const colors    = ['#ff00ff', '#0000ff', '#ff0000', '#ffff00', '#00ff00'];
    const names     = ['Pink',   'Blue',   'Red',    'Yellow', 'Green'];

    push();
    textFont('monospace');
    noStroke();

    // Title
    fill(255, 220, 0);
    textSize(20);
    textAlign(CENTER, BOTTOM);
    text('PLAYER SELECTION', width / 2, stripY - 50);

    // Instruction
    fill(255, 255, 255, 200);
    textSize(13);
    text('Press your key ' + threshold + '+ times to join the game!', width / 2, stripY - 28);

    // Countdown
    const hot = secLeft <= 3;
    fill(hot ? color(255, 60, 60) : color(0, 220, 180));
    textSize(30);
    textAlign(CENTER, TOP);
    text(secLeft + 's', width / 2, stripY + pixelSize + 14);

    // Per-player progress
    textSize(12);
    textAlign(CENTER, TOP);
    const slotW = width / 5;
    for (let i = 0; i < allPlayers.length; i++) {
      const p      = allPlayers[i];
      const joined = p.position >= threshold;
      fill(joined ? colors[i] : '#555555');
      const cx = slotW * i + slotW / 2;
      text(names[i] + ' ' + p.position + (joined ? ' âœ“' : ''), cx, stripY + pixelSize + 52);
    }
    pop();
    return; // skip other overlays during selection
  }

  // â”€â”€ Vote countdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (controller.gameState === "VOTE") {
    const secLeft = controller.getVoteSecondsLeft();
    push();
    noStroke();
    fill(0, 255, 255);
    textFont('monospace');
    textAlign(CENTER, CENTER);
    textSize(pixelSize * 0.85);
    text(nf(secLeft, 2), width / 2, stripY + pixelSize * 0.5);
    pop();
  }

  // â”€â”€ Win messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if ((controller.gameState === "PLAYERS_WIN" || controller.gameState === "GM_WIN") && controller.getWinMessageAlpha) {
    const a   = controller.getWinMessageAlpha();
    const msg = controller.gameState === "PLAYERS_WIN" ? "PLAYERS WIN" : "The Game Master wins.";
    const c   = controller.gameState === "PLAYERS_WIN" ? color(0, 255, 255) : color(255, 0, 0);
    push();
    noStroke();
    fill(red(c), green(c), blue(c), a);
    textFont('monospace');
    textAlign(CENTER, CENTER);
    textSize(pixelSize * 0.62);
    text(msg, width * 0.70, stripY + pixelSize * 0.5);
    pop();
  }
}


function windowResized() {
  // nothing to reposition
}


// ─── Camera color tracking (hidden video, runs every frame) ─────────────────

function updateCameraDrivenPlayers() {
  if (!video) return;
  if (!video.elt || video.elt.readyState < 2) return;
  video.loadPixels();
  if (!video.pixels || video.pixels.length === 0) return;

  trackAllColorsFromVideo(video, colorTrackers);

  const state = controller.gameState;

  for (let tracker of colorTrackers) {
    if (!tracker || !tracker.player) continue;
    if (!tracker.shouldStepNow()) continue;

    const p = tracker.player;

    // PLAYER_SELECTION: moving a colored object registers as joining
    if (state === "PLAYER_SELECTION") {
      p.move(1);
      continue;
    }

    if (p.eliminated) continue;
    if (p.active === false) continue;

    if (state === "VOTE") {
      if (controller.moveVotePlayer) controller.moveVotePlayer(p, 1);
      controller.noteMotionForPlayer(p);
      continue;
    }

    if (state !== "PLAY") continue;
    if (p.position >= controller.lightIndex) continue;

    if (controller.canMoveNow()) {
      p.move(1);
      controller.noteMotionForPlayer(p);
      if (controller.noteStepForPlayer) controller.noteStepForPlayer(p);
    } else {
      if (p === controller.getGameMasterPlayer()) {
        controller.noteMotionForPlayer(p);
      } else if (controller.isStopGraceActive && controller.isStopGraceActive()) {
        p.move(1);
      } else {
        controller.eliminatePlayer(p);
      }
    }
  }
}


function createColorTrackers(_w, _h) {
  return [
    new ColorMotionTracker({
      name: "pink", targetHue: 310, hueTol: 40,
      satMin: 0.02, valMin: 0.02, alpha: 0.55, jitterPx: 1.1,
      stepEnergy: 10, cooldownMs: 240, minTotalWeight: 12,
      minWgt: 0.05, satBoostPow: 2.0, roiRadius: 140,
      player: playerOne, w: _w, h: _h,
    }),
    new ColorMotionTracker({
      name: "blue", targetHue: 220, hueTol: 115,
      satMin: 0.01, valMin: 0.01, alpha: 0.55, jitterPx: 1.1,
      stepEnergy: 10, cooldownMs: 240, minTotalWeight: 12,
      minWgt: 0.045, satBoostPow: 1.6, roiRadius: 140,
      player: playerTwo, w: _w, h: _h,
    }),
    new ColorMotionTracker({
      name: "red", targetHue: 0, hueTol: 30,
      satMin: 0.02, valMin: 0.02, alpha: 0.55, jitterPx: 1.1,
      stepEnergy: 10, cooldownMs: 240, minTotalWeight: 12,
      minWgt: 0.06, satBoostPow: 2.6, roiRadius: 140,
      player: playerThree, w: _w, h: _h,
    }),
    new ColorMotionTracker({
      name: "yellow", targetHue: 55, hueTol: 45,
      satMin: 0.02, valMin: 0.02, alpha: 0.55, jitterPx: 1.1,
      stepEnergy: 10, cooldownMs: 240, minTotalWeight: 12,
      minWgt: 0.06, roiRadius: 140,
      player: playerFour, w: _w, h: _h,
    }),
    new ColorMotionTracker({
      name: "green", targetHue: 120, hueTol: 60,
      satMin: 0.02, valMin: 0.02, alpha: 0.55, jitterPx: 1.1,
      stepEnergy: 10, cooldownMs: 240, minTotalWeight: 12,
      minWgt: 0.06, roiRadius: 140,
      player: playerFive, w: _w, h: _h,
    }),
  ];
}


function trackAllColorsFromVideo(_video, _trackers) {
  const step = 2;
  const w  = _video.width;
  const h  = _video.height;
  const px = _video.pixels;

  if (!prevVideoPixels || prevVideoPixels.length !== px.length) {
    prevVideoPixels = new Uint8ClampedArray(px.length);
  }
  const prev = prevVideoPixels;
  const motionThreshold = 14;
  const motionScale     = 70;

  const n   = _trackers.length;
  const sumW = new Array(n).fill(0);
  const sumX = new Array(n).fill(0);
  const sumY = new Array(n).fill(0);
  const hitN = new Array(n).fill(0);

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i  = 4 * (y * w + x);
      const r  = px[i]; const g = px[i+1]; const b = px[i+2];
      const md = Math.abs(r - prev[i]) + Math.abs(g - prev[i+1]) + Math.abs(b - prev[i+2]);
      if (md < motionThreshold) continue;

      const hsv = rgbToHsv(r, g, b);
      if (hsv.s < 0.01 || hsv.v < 0.01) continue;

      const motionMul = 1 + Math.max(0, Math.min(1, (md - motionThreshold) / motionScale)) * 3.0;

      for (let t = 0; t < n; t++) {
        const tk = _trackers[t];
        if (tk.hasPos) {
          const dx = x - tk.fx; const dy = y - tk.fy;
          if (dx*dx + dy*dy > tk.roiRadius * tk.roiRadius) continue;
        }
        const wgt = tk.weightForPixel ? tk.weightForPixel(r, g, b, hsv) : tk.weightForHsv(hsv);
        if (wgt <= 0) continue;
        const mw = wgt * motionMul;
        if (mw < tk.minWgt) continue;
        hitN[t]++; sumW[t] += mw; sumX[t] += x * mw; sumY[t] += y * mw;
      }
    }
  }
  prevVideoPixels.set(px);
  for (let t = 0; t < n; t++) _trackers[t].updateFromAccum(sumW[t], sumX[t], sumY[t], hitN[t]);
}


function rgbToHsv(r, g, b) {
  const rr = r/255, gg = g/255, bb = b/255;
  const maxc = Math.max(rr, gg, bb);
  const delta = maxc - Math.min(rr, gg, bb);
  let h = 0;
  if (delta !== 0) {
    if      (maxc === rr) h = ((gg - bb) / delta) % 6;
    else if (maxc === gg) h = (bb - rr) / delta + 2;
    else                  h = (rr - gg) / delta + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: maxc === 0 ? 0 : delta / maxc, v: maxc };
}


class ColorMotionTracker {
  constructor(cfg) {
    this.name        = cfg.name;
    this.targetHue   = cfg.targetHue;
    this.hueTol      = cfg.hueTol;
    this.satMin      = cfg.satMin;
    this.valMin      = cfg.valMin;
    this.alpha       = cfg.alpha;
    this.jitterPx    = cfg.jitterPx;
    this.stepEnergy  = cfg.stepEnergy;
    this.player      = cfg.player;
    this.w           = cfg.w;
    this.h           = cfg.h;

    this.minTotalWeight      = cfg.minTotalWeight      ?? 90;
    this.cooldownMs          = cfg.cooldownMs          ?? 80;
    this.roiRadius           = cfg.roiRadius           ?? 140;
    this.maxEnergy           = cfg.maxEnergy           ?? this.stepEnergy * 1.25;
    this.minWgt              = cfg.minWgt              ?? 0.16;
    this.satBoostPow         = cfg.satBoostPow         ?? 3.0;
    this.minWgtFloor         = cfg.minWgtFloor         ?? 0.03;
    this.minWgtCeil          = cfg.minWgtCeil          ?? 0.28;
    this.minTotalWeightFloor = cfg.minTotalWeightFloor ?? 6;
    this.minTotalWeightCeil  = cfg.minTotalWeightCeil  ?? 80;

    this.hasPos = false;
    this.fx = this.fy = this.prevFx = this.prevFy = 0;
    this.motionEnergy = this.lastStepAt = this.lastSeenAt = 0;
    this.prevTotalW = this.noSignalFrames = this.tooMuchSignalFrames = 0;
    this.lastHitN = this.lastMotionAt = 0;
  }

  hueDistance(_h) {
    let d = Math.abs(_h - this.targetHue);
    if (d > 180) d = 360 - d;
    return d;
  }

  weightForHsv(hsv) {
    if (hsv.s < this.satMin || hsv.v < this.valMin) return 0;
    const d = this.hueDistance(hsv.h);
    if (d > this.hueTol) return 0;
    const h2 = 1 - d / this.hueTol;
    const s1 = (hsv.s - this.satMin) / (1 - this.satMin);
    const v1 = (hsv.v - this.valMin) / (1 - this.valMin);
    return Math.max(0, h2*h2) * Math.max(0, s1*s1) * Math.pow(hsv.s, this.satBoostPow) * Math.max(0, v1);
  }

  weightForPixel(r, g, b, hsv) {
    let w = this.weightForHsv(hsv);
    if (w <= 0) return 0;
    if (this.name === "pink") {
      if (r < 80 || b < 80)            return 0;
      if (b < g)                        return 0;
      if (b / (r + 1) < 0.38)          return 0;
      if (hsv.h < 270 || hsv.h > 355)  return 0;
    }
    if (this.name === "red") {
      if (b > r * 0.40) return 0;
      if (hsv.h > 330 && b > 35) return 0;
    }
    if (this.name === "blue") {
      if (b < r + 10) return 0;
      if (b < g - 25) return 0;
    }
    return w;
  }

  updateFromAccum(totalW, sumX, sumY, hitN) {
    const now = millis();
    this.lastHitN = hitN || 0;
    if (totalW < this.minTotalWeight) { this.noSignalFrames++; this.tooMuchSignalFrames = 0; }
    else                              { this.noSignalFrames = 0; }
    if ((hitN||0) > 1200 && totalW > this.minTotalWeight*6) this.tooMuchSignalFrames++;
    else                                                     this.tooMuchSignalFrames = 0;
    if (this.noSignalFrames > 18) {
      this.minWgt         = Math.max(this.minWgtFloor,         this.minWgt * 0.85);
      this.minTotalWeight = Math.max(this.minTotalWeightFloor, this.minTotalWeight - 2);
      this.noSignalFrames = 0;
    }
    if (this.tooMuchSignalFrames > 12) {
      this.minWgt         = Math.min(this.minWgtCeil,         this.minWgt + 0.02);
      this.minTotalWeight = Math.min(this.minTotalWeightCeil, this.minTotalWeight + 2);
      this.tooMuchSignalFrames = 0;
    }
    if (totalW < this.minTotalWeight) {
      this.motionEnergy *= 0.88;
      if (this.lastSeenAt && now - this.lastSeenAt > 650) this.hasPos = false;
      return;
    }
    this.lastSeenAt = now;
    const cx = sumX / totalW, cy = sumY / totalW;
    if (!this.hasPos) {
      this.fx = this.prevFx = cx;
      this.fy = this.prevFy = cy;
      this.hasPos = true;
      return;
    }
    this.prevFx = this.fx; this.prevFy = this.fy;
    this.fx += this.alpha * (cx - this.fx);
    this.fy += this.alpha * (cy - this.fy);
    const eff = Math.max(0, Math.hypot(this.fx - this.prevFx, this.fy - this.prevFy) - this.jitterPx);
    this.motionEnergy += eff;
    if (eff > 0.75) this.lastMotionAt = now;
    const dW = Math.abs(totalW - this.prevTotalW);
    this.prevTotalW = totalW;
    const dwEff = Math.max(0, dW - 6) * 0.02;
    this.motionEnergy += dwEff;
    if (dwEff > 0.35) this.lastMotionAt = now;
    if (this.motionEnergy > this.maxEnergy) this.motionEnergy = this.maxEnergy;
  }

  shouldStepNow() {
    const now = millis();
    if (now - this.lastStepAt < this.cooldownMs) return false;
    if (this.motionEnergy < this.stepEnergy)     return false;
    this.motionEnergy -= this.stepEnergy;
    this.lastStepAt = now;
    return true;
  }
}
