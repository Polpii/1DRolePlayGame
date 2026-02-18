/* /////////////////////////////////////

  4.043 / 4.044 Design Studio: Interaction Intelligence
  February 7, 2025
  Marcelo Coelho

*/ /////////////////////////////////////


let displaySize = 30;   // how many pixels are visible in the game
let pixelSize = 20;     // how big each 'pixel' looks on screen

let playerOne;    // Adding 2 players to the game
let playerTwo;

let display;      // Aggregates our final visual output before showing it on the screen

let controller;   // This is where the state machine and game logic lives

// sounds
let plopSound;
let switchSound;
let loseSound;
let audioUnlocked = false;

function loadSoundsAsync() {
  // Don't block the whole sketch on audio loading.
  // (Opening index.html via file:// can block XHR and freeze preload.)
  if (typeof loadSound !== 'function') return;
  if (typeof soundFormats === 'function') soundFormats('wav', 'mp3');

  const onError = () => {};
  plopSound = loadSound('plop.wav', undefined, onError);
  switchSound = loadSound('switch.wav', undefined, onError);
  loseSound = loadSound('lose.wav', undefined, onError);
}


function tryPlay(_sound) {
  if (!audioUnlocked) return;
  if (!_sound) return;
  if (typeof _sound.isLoaded === 'function' && !_sound.isLoaded()) return;
  if (typeof _sound.isPlaying === 'function' && _sound.isPlaying()) {
    if (typeof _sound.stop === 'function') _sound.stop();
  }
  if (typeof _sound.play === 'function') _sound.play();
}



function setup() {

  createCanvas((displaySize*pixelSize), pixelSize);     // dynamically sets canvas size

  loadSoundsAsync();

  display = new Display(displaySize, pixelSize);        //Initializing the display

  // Players start from the left
  // World A: green player, World B: light-blue player
  playerOne = new Player(color(0, 255, 0), 0, displaySize);
  playerTwo = new Player(color(120, 200, 255), 0, displaySize);

  controller = new Controller();            // Initializing controller

}

function draw() {

  // start with a blank screen
  background(0, 0, 0);    

  // Runs state machine at determined framerate
  controller.update();

  // After we've updated our states, we show the current one 
  display.show();


}


