/* /////////////////////////////////////

  4.043 / 4.044 Design Studio: Interaction Intelligence
  February 7, 2025
  Marcelo Coelho

*/ /////////////////////////////////////


let displaySize = 60;   // how many pixels are visible in the game
let pixelSize = 20;     // how big each 'pixel' looks on screen

let playerOne;   // Pink
let playerTwo;   // Blue
let playerThree; // Red
let playerFour;  // Yellow
let playerFive;  // Green
let allPlayers = [];

let display;      // Aggregates our final visual output before showing it on the screen

let controller;   // This is where the state machine and game logic lives

// sounds
let greenSound;
let redSound;
let shotSound;
let audioUnlocked = false;

// camera + color tracking (for Pink / Blue / Red / Yellow / Green)
let video;
let colorTrackers = [];
let cnv;
let prevVideoPixels = null;

// game master (defaults to Red)
let gameMasterPlayer;
let gameMasterTracker;

// Player active state (controlled by the toggle panel)
let playerActive = [true, true, true, true, true];
let playerTogglePanel = null;
const PLAYER_HEX_COLORS = ['#ff00ff', '#0000ff', '#ff0000', '#ffff00', '#00ff00'];
const PLAYER_NAMES      = ['Pink',   'Blue',  'Red',    'Yellow', 'Green'];


function preload() {
  soundFormats('wav', 'mp3');
  greenSound = loadSound('green.wav');
  redSound = loadSound('red.wav');
  shotSound = loadSound('bark.mp3');
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

  // Keep a single pixel row on screen
  cnv = createCanvas((displaySize*pixelSize), pixelSize);     // dynamically sets canvas size

  display = new Display(displaySize, pixelSize);        //Initializing the display

  // Players start from the left
  playerOne = new Player(color(255,0,255), 0, displaySize);      // Pink
  playerTwo = new Player(color(0,0,255), 0, displaySize);        // Blue
  playerThree = new Player(color(255, 0, 0), 0, displaySize);    // Red
  playerFour = new Player(color(255, 255, 0), 0, displaySize);   // Yellow
  playerFive = new Player(color(0, 255, 0), 0, displaySize);     // Green

  // Fixed player ordering for tie-display alternation
  allPlayers = [playerOne, playerTwo, playerThree, playerFour, playerFive];

  // Set game master randomly
  gameMasterPlayer = random(allPlayers);

  // Start camera feed (browser will ask permission)
  video = createCapture(VIDEO);
  video.size(320, 240);
  // Keep feed visible but place it under the 1D strip
  positionVideoUnderCanvas();
  // Mobile safari: avoid fullscreen takeover
  if (video.elt) video.elt.setAttribute('playsinline', '');

  // Build the player-active toggle panel (to the right of the video)
  createPlayerTogglePanel();

  // Reset motion buffer if size changes / on reload
  prevVideoPixels = null;

  colorTrackers = createDefaultColorTrackers(video.width, video.height);

  // Link game master to its camera tracker if possible
  gameMasterTracker = null;
  for (let t of colorTrackers) {
    if (t && t.player === gameMasterPlayer) {
      gameMasterTracker = t;
      break;
    }
  }

  controller = new Controller();            // Initializing controller

  // When GO sound ends: switch to red light
  if (greenSound && greenSound.onended) {
    greenSound.onended(() => {
      if (controller && controller.onGreenSoundEnded) controller.onGreenSoundEnded();
    });
  }

  // When STOP sound ends, allow GO after a delay (controller handles +2s)
  if (redSound && redSound.onended) {
    redSound.onended(() => {
      if (controller && controller.onRedSoundEnded) controller.onRedSoundEnded();
    });
  }

}

function draw() {

  // start with a blank screen
  background(0, 0, 0);    

  // Runs state machine at determined framerate
  controller.update();

  // Camera-based controls for Pink / Blue / Red / Yellow / Green
  updateCameraDrivenPlayers();

  // After we've updated our states, we show the current one 
  display.show();

  // Retro overlays (timer / win text)
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


function updateCameraDrivenPlayers() {
  if (!video) return;
  if (controller.gameState !== "PLAY" && controller.gameState !== "VOTE") return;
  if (!video.elt || video.elt.readyState < 2) return;

  video.loadPixels();
  if (!video.pixels || video.pixels.length === 0) return;

  // Track all configured colors in one pass over pixels
  trackAllColorsFromVideo(video, colorTrackers);

  // Apply movement -> player step (one cell at a time)
  for (let tracker of colorTrackers) {
    if (!tracker) continue;
    if (!tracker.player) continue;
    if (tracker.player.eliminated) continue;
    if (tracker.player.active === false) continue;
    // Once a player reached the target, they are safe and should not be processed anymore.
    if (controller.gameState === "PLAY" && tracker.player.position >= controller.lightIndex) continue;
    if (tracker.shouldStepNow()) {
      // Vote scene: always allow movement.
      if (controller.gameState === "VOTE") {
        if (controller.moveVotePlayer) controller.moveVotePlayer(tracker.player, 1);
        controller.noteMotionForPlayer(tracker.player);
        continue;
      }

      // Play scene: forbidden movement eliminates.
      if (controller.canMoveNow()) {
        tracker.player.move(1);
        controller.noteMotionForPlayer(tracker.player);
        if (controller.noteStepForPlayer) controller.noteStepForPlayer(tracker.player);
      } else {
        if (tracker.player === controller.getGameMasterPlayer()) {
          // GM cannot move on red, but its motion can re-enable cyan
          controller.noteMotionForPlayer(tracker.player);
        } else if (controller.isStopGraceActive && controller.isStopGraceActive()) {
          // grace period: allow movement without elimination
          tracker.player.move(1);
        } else {
          controller.eliminatePlayer(tracker.player);
        }
      }
    }
  }
}


function drawOverlays() {
  if (!controller) return;

  // Global fade-to-black overlay (used for win transitions)
  if (controller.getFadeBlackAlpha && controller.getFadeBlackAlpha() > 0) {
    push();
    noStroke();
    fill(0, 0, 0, controller.getFadeBlackAlpha());
    rect(0, 0, width, height);
    pop();
  }

  if (controller.gameState === "VOTE") {
    const secLeft = controller.getVoteSecondsLeft();
    push();
    noStroke();
    fill(0, 255, 255);
    textFont('monospace');
    textAlign(CENTER, CENTER);
    textSize(pixelSize * 0.85);
    text(nf(secLeft, 2), width / 2, pixelSize * 0.5);
    pop();
  }

  if ((controller.gameState === "PLAYERS_WIN" || controller.gameState === "GM_WIN") && controller.getWinMessageAlpha) {
    const a = controller.getWinMessageAlpha();
    const msg = controller.gameState === "PLAYERS_WIN" ? "PLAYERS WIN" : "The Game Master wins.";
    const c = controller.gameState === "PLAYERS_WIN" ? color(0, 255, 255) : color(255, 0, 0);
    push();
    noStroke();
    fill(red(c), green(c), blue(c), a);
    textFont('monospace');
    textAlign(CENTER, CENTER);
    textSize(pixelSize * 0.62);
    // Message on the right side so it doesn't cover winner pixels
    text(msg, width * 0.70, pixelSize * 0.5);
    pop();
  }
}


function positionVideoUnderCanvas() {
  if (!cnv || !cnv.elt || !video) return;
  const rect = cnv.elt.getBoundingClientRect();
  // Center the video in the viewport (canvas can be wider than the screen).
  const left = window.scrollX + Math.max(0, (window.innerWidth - video.width) / 2);
  const top = rect.bottom + window.scrollY + 10;
  video.position(left, top);

  // Position toggle panel to the right of the video
  if (playerTogglePanel) {
    playerTogglePanel.position(left + video.width + 15, top);
  }
}

// ─── Player-active toggle panel ─────────────────────────────────────────────

function createPlayerTogglePanel() {
  playerTogglePanel = createDiv('');
  playerTogglePanel.style('display', 'flex');
  playerTogglePanel.style('flex-direction', 'column');
  playerTogglePanel.style('gap', '10px');
  playerTogglePanel.style('align-items', 'center');
  playerTogglePanel.style('padding', '10px');
  playerTogglePanel.style('background', 'rgba(0,0,0,0.5)');
  playerTogglePanel.style('border-radius', '10px');
  playerTogglePanel.style('cursor', 'pointer');

  for (let i = 0; i < 5; i++) {
    const light = createDiv('');
    light.style('width', '30px');
    light.style('height', '30px');
    light.style('border-radius', '50%');
    light.style('background-color', PLAYER_HEX_COLORS[i]);
    light.style('box-shadow', '0 0 12px 4px ' + PLAYER_HEX_COLORS[i]);
    light.style('transition', 'box-shadow 0.2s, filter 0.2s');
    light.style('cursor', 'pointer');
    light.attribute('title', PLAYER_NAMES[i]);
    light.parent(playerTogglePanel);

    // IIFE to capture index
    (function(idx) {
      light.mousePressed(function() {
        togglePlayerActive(idx);
        // Prevent the click from triggering p5's mousePressed (audio unlock etc.)
        return false;
      });
    })(i);
  }
}

function togglePlayerActive(i) {
  playerActive[i] = !playerActive[i];
  allPlayers[i].active = playerActive[i];

  // If we deactivated the current game master, reassign to another active player
  if (!playerActive[i] && allPlayers[i] === gameMasterPlayer) {
    const available = allPlayers.filter((p, idx) => playerActive[idx]);
    if (available.length > 0) {
      gameMasterPlayer = available[Math.floor(Math.random() * available.length)];
      gameMasterTracker = null;
      for (let t of colorTrackers) {
        if (t && t.player === gameMasterPlayer) {
          gameMasterTracker = t;
          break;
        }
      }
    }
  }

  // Refresh visuals
  refreshPlayerTogglePanel();
}

function refreshPlayerTogglePanel() {
  if (!playerTogglePanel) return;
  const lights = playerTogglePanel.elt.children;
  for (let i = 0; i < lights.length; i++) {
    if (playerActive[i]) {
      lights[i].style.filter    = 'brightness(1)';
      lights[i].style.boxShadow = '0 0 12px 4px ' + PLAYER_HEX_COLORS[i];
    } else {
      lights[i].style.filter    = 'brightness(0.30)';
      lights[i].style.boxShadow = 'none';
    }
  }
}


function windowResized() {
  positionVideoUnderCanvas();
}


function createDefaultColorTrackers(_w, _h) {
  return [
    new ColorMotionTracker({
      name: "pink",
      targetHue: 310,
      hueTol: 40,
      satMin: 0.02,
      valMin: 0.02,
      alpha: 0.55,
      jitterPx: 1.1,
      stepEnergy: 10,
      cooldownMs: 240,
      minTotalWeight: 12,
      minWgt: 0.05,
      satBoostPow: 2.0,
      roiRadius: 140,
      player: playerOne,
      w: _w,
      h: _h,
    }),
    new ColorMotionTracker({
      name: "blue",
      targetHue: 220,
      hueTol: 115,
      satMin: 0.01,
      valMin: 0.01,
      alpha: 0.55,
      jitterPx: 1.1,
      stepEnergy: 10,
      cooldownMs: 240,
      minTotalWeight: 12,
      minWgt: 0.045,
      satBoostPow: 1.6,
      roiRadius: 140,
      player: playerTwo,
      w: _w,
      h: _h,
    }),
    new ColorMotionTracker({
      name: "red",
      targetHue: 0,
      hueTol: 30,
      satMin: 0.02,
      valMin: 0.02,
      alpha: 0.55,
      jitterPx: 1.1,
      stepEnergy: 10,
      cooldownMs: 240,
      minTotalWeight: 12,
      minWgt: 0.06,
      satBoostPow: 2.6,
      roiRadius: 140,
      player: playerThree,
      w: _w,
      h: _h,
    }),
    new ColorMotionTracker({
      name: "yellow",
      targetHue: 55,
      hueTol: 45,
      satMin: 0.02,
      valMin: 0.02,
      alpha: 0.55,
      jitterPx: 1.1,
      stepEnergy: 10,
      cooldownMs: 240,
      minTotalWeight: 12,
      minWgt: 0.06,
      roiRadius: 140,
      player: playerFour,
      w: _w,
      h: _h,
    }),
    new ColorMotionTracker({
      name: "green",
      targetHue: 120,
      hueTol: 60,
      satMin: 0.02,
      valMin: 0.02,
      alpha: 0.55,
      jitterPx: 1.1,
      stepEnergy: 12,
      stepEnergy: 10,
      cooldownMs: 240,
      minTotalWeight: 12,
      minWgt: 0.06,
      player: playerFive,
      w: _w,
      h: _h,
    }),
  ];
}


function trackAllColorsFromVideo(_video, _trackers) {
  // downsample for speed (smaller step => better for small objects)
  const step = 2;
  const w = _video.width;
  const h = _video.height;
  const px = _video.pixels;

  // Motion gating/boosting: tiny blobs are easier to detect when moving.
  // We compare against previous frame pixels (same resolution).
  if (!prevVideoPixels || prevVideoPixels.length !== px.length) {
    prevVideoPixels = new Uint8ClampedArray(px.length);
  }
  const prev = prevVideoPixels;
  const motionThreshold = 14; // 0..765 (sum abs RGB diffs)
  const motionScale = 70;     // bigger => less boost

  let sumW = new Array(_trackers.length).fill(0);
  let sumX = new Array(_trackers.length).fill(0);
  let sumY = new Array(_trackers.length).fill(0);
  let hitN = new Array(_trackers.length).fill(0);

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = 4 * (y * w + x);
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];

      const pr = prev[i];
      const pg = prev[i + 1];
      const pb = prev[i + 2];
      const md = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
      if (md < motionThreshold) continue;

      const hsv = rgbToHsv(r, g, b);
      // Quick reject: too desaturated or too dark
      if (hsv.s < 0.01 || hsv.v < 0.01) continue;

      // Motion boost gives more weight to moving pixels.
      // Helps small colored objects beat background noise.
      const motionBoost = Math.max(0, Math.min(1, (md - motionThreshold) / motionScale));
      const motionMul = 1 + motionBoost * 3.0;

      for (let t = 0; t < _trackers.length; t++) {
        const tracker = _trackers[t];
        if (tracker.hasPos) {
          const dx = x - tracker.fx;
          const dy = y - tracker.fy;
          if ((dx * dx + dy * dy) > (tracker.roiRadius * tracker.roiRadius)) continue;
        }
        const wgt = (tracker.weightForPixel) ? tracker.weightForPixel(r, g, b, hsv) : tracker.weightForHsv(hsv);
        if (wgt <= 0) continue;
        const mw = wgt * motionMul;
        if (mw < tracker.minWgt) continue;
        hitN[t] += 1;
        sumW[t] += mw;
        sumX[t] += x * mw;
        sumY[t] += y * mw;
      }
    }
  }

  // Store current frame for next motion comparison
  prevVideoPixels.set(px);

  for (let t = 0; t < _trackers.length; t++) {
    const tracker = _trackers[t];
    tracker.updateFromAccum(sumW[t], sumX[t], sumY[t], hitN[t]);
  }
}


function rgbToHsv(r, g, b) {
  // r,g,b: 0..255 -> h:0..360, s:0..1, v:0..1
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;

  const maxc = Math.max(rr, gg, bb);
  const minc = Math.min(rr, gg, bb);
  const delta = maxc - minc;

  let h = 0;
  if (delta !== 0) {
    if (maxc === rr) h = ((gg - bb) / delta) % 6;
    else if (maxc === gg) h = (bb - rr) / delta + 2;
    else h = (rr - gg) / delta + 4;
    h = h * 60;
    if (h < 0) h += 360;
  }

  const s = maxc === 0 ? 0 : delta / maxc;
  const v = maxc;
  return { h, s, v };
}


class ColorMotionTracker {
  constructor(cfg) {
    this.name = cfg.name;
    this.targetHue = cfg.targetHue;
    this.hueTol = cfg.hueTol;
    this.satMin = cfg.satMin;
    this.valMin = cfg.valMin;
    this.alpha = cfg.alpha;
    this.jitterPx = cfg.jitterPx;
    this.stepEnergy = cfg.stepEnergy;
    this.player = cfg.player;
    this.w = cfg.w;
    this.h = cfg.h;

    this.minTotalWeight = (cfg.minTotalWeight !== undefined) ? cfg.minTotalWeight : 90;
    this.cooldownMs = (cfg.cooldownMs !== undefined) ? cfg.cooldownMs : 80;
    this.roiRadius = (cfg.roiRadius !== undefined) ? cfg.roiRadius : 140;
    this.maxEnergy = (cfg.maxEnergy !== undefined) ? cfg.maxEnergy : (this.stepEnergy * 1.25);
    this.minWgt = (cfg.minWgt !== undefined) ? cfg.minWgt : 0.16;
    this.satBoostPow = (cfg.satBoostPow !== undefined) ? cfg.satBoostPow : 3.0;

    // Auto-adaptation bounds (helps in very dark rooms)
    this.minWgtFloor = (cfg.minWgtFloor !== undefined) ? cfg.minWgtFloor : 0.03;
    this.minWgtCeil = (cfg.minWgtCeil !== undefined) ? cfg.minWgtCeil : 0.28;
    this.minTotalWeightFloor = (cfg.minTotalWeightFloor !== undefined) ? cfg.minTotalWeightFloor : 6;
    this.minTotalWeightCeil = (cfg.minTotalWeightCeil !== undefined) ? cfg.minTotalWeightCeil : 80;

    this.hasPos = false;
    this.fx = 0;
    this.fy = 0;
    this.prevFx = 0;
    this.prevFy = 0;
    this.motionEnergy = 0;
    this.lastStepAt = 0;
    this.lastSeenAt = 0;
    this.prevTotalW = 0;
    this.noSignalFrames = 0;
    this.tooMuchSignalFrames = 0;
    this.lastHitN = 0;

    // Used by controller (game master) to detect stopping
    this.lastMotionAt = 0;
  }

  hueDistance(_h) {
    let d = Math.abs(_h - this.targetHue);
    if (d > 180) d = 360 - d;
    return d;
  }

  weightForHsv(hsv) {
    if (hsv.s < this.satMin) return 0;
    if (hsv.v < this.valMin) return 0;

    const d = this.hueDistance(hsv.h);
    if (d > this.hueTol) return 0;

    const hueScore = 1 - (d / this.hueTol);
    const satScore = (hsv.s - this.satMin) / (1 - this.satMin);
    const valScore = (hsv.v - this.valMin) / (1 - this.valMin);

    // Robustness vs background:
    // - hue must be correct (squared)
    // - low saturation is heavily down-weighted (power on raw saturation)
    // - value contributes but less aggressively
    const h2 = Math.max(0, hueScore);
    const s1 = Math.max(0, satScore);
    const v1 = Math.max(0, valScore);
    const satBoost = Math.pow(hsv.s, this.satBoostPow);
    return (h2 * h2) * (s1 * s1) * satBoost * v1;
  }

  weightForPixel(r, g, b, hsv) {
    let w = this.weightForHsv(hsv);
    if (w <= 0) return 0;

    // Extra separation between similar hues using RGB values
    if (this.name === "pink") {
      // Pink/magenta: R and B both high, B must be significant relative to R
      if (r < 80 || b < 80) return 0;
      if (b < g) return 0;
      // Require noticeable blue component to separate from pure red
      if (b / (r + 1) < 0.38) return 0;
      // Reject hues that are closer to pure red than to magenta
      if (hsv.h < 270 || hsv.h > 355) return 0;
    }

    if (this.name === "red") {
      // True red: R >> G and R >> B; reject pink/magenta which have significant blue
      if (b > r * 0.40) return 0;
      // Near-pink hues with any noticeable blue are not red
      if (hsv.h > 330 && b > 35) return 0;
    }

    if (this.name === "blue") {
      // Blue channel should be strong
      if (b < r + 10) return 0;
      if (b < g - 25) return 0;
    }

    return w;
  }

  updateFromAccum(totalW, sumX, sumY, hitN) {
    const now = millis();
    this.lastHitN = hitN || 0;

    // Auto-tune thresholds:
    // - If we see almost nothing for a while, relax (lower minWgt + minTotalWeight)
    // - If we see a ton of pixels constantly (likely background), tighten (raise minWgt)
    if (totalW < this.minTotalWeight) {
      this.noSignalFrames += 1;
      this.tooMuchSignalFrames = 0;
    } else {
      this.noSignalFrames = 0;
    }

    if ((hitN || 0) > 1200 && totalW > (this.minTotalWeight * 6)) {
      this.tooMuchSignalFrames += 1;
    } else {
      this.tooMuchSignalFrames = 0;
    }

    if (this.noSignalFrames > 18) {
      this.minWgt = Math.max(this.minWgtFloor, this.minWgt * 0.85);
      this.minTotalWeight = Math.max(this.minTotalWeightFloor, this.minTotalWeight - 2);
      this.noSignalFrames = 0;
    }

    if (this.tooMuchSignalFrames > 12) {
      this.minWgt = Math.min(this.minWgtCeil, this.minWgt + 0.02);
      this.minTotalWeight = Math.min(this.minTotalWeightCeil, this.minTotalWeight + 2);
      this.tooMuchSignalFrames = 0;
    }

    // Not enough signal: slowly decay motion energy
    if (totalW < this.minTotalWeight) {
      this.motionEnergy *= 0.88;
      // Keep last known position briefly to reduce jitter; then allow global re-acquire
      if (this.lastSeenAt && (now - this.lastSeenAt > 650)) {
        this.hasPos = false;
      }
      return;
    }

    this.lastSeenAt = now;

    const cx = sumX / totalW;
    const cy = sumY / totalW;

    if (!this.hasPos) {
      this.fx = cx;
      this.fy = cy;
      this.prevFx = this.fx;
      this.prevFy = this.fy;
      this.hasPos = true;
      return;
    }

    // Low-pass filter for robustness
    this.prevFx = this.fx;
    this.prevFy = this.fy;
    this.fx = this.fx + this.alpha * (cx - this.fx);
    this.fy = this.fy + this.alpha * (cy - this.fy);

    const dx = this.fx - this.prevFx;
    const dy = this.fy - this.prevFy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const effective = Math.max(0, dist - this.jitterPx);
    this.motionEnergy += effective;

    if (effective > 0.75) {
      this.lastMotionAt = now;
    }

    // Small extra cue: changes in mask size (helps when background dominates centroid)
    const dW = Math.abs(totalW - this.prevTotalW);
    this.prevTotalW = totalW;
    const dwEffective = Math.max(0, dW - 6) * 0.02;
    this.motionEnergy += dwEffective;

    if (dwEffective > 0.35) {
      this.lastMotionAt = now;
    }

    if (this.motionEnergy > this.maxEnergy) this.motionEnergy = this.maxEnergy;
  }

  shouldStepNow() {
    const now = millis();
    if (now - this.lastStepAt < this.cooldownMs) return false;
    if (this.motionEnergy < this.stepEnergy) return false;

    this.motionEnergy -= this.stepEnergy;
    this.lastStepAt = now;
    return true;
  }
}


