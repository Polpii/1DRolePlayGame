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

// sounds
let greenSound;
let redSound;
let shotSound;
let audioUnlocked = false;

// game master (assigned after player-selection finishes)
let gameMasterPlayer  = null;




function preload() {
  soundFormats('wav', 'mp3');
  greenSound = loadSound('assets/sounds/mission.wav');
  redSound   = loadSound('assets/sounds/suspense.mp3');
  shotSound  = loadSound('assets/sounds/jail.wav');
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

  // Procedural satellite tracking HUD background
  drawSpyBackground();

  // Run state machine (populates display buffer)
  controller.update();

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
