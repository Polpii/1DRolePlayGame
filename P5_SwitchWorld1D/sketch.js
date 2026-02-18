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


function preload() {
  soundFormats('wav', 'mp3');
  plopSound = loadSound('plop.wav');
  switchSound = loadSound('switch.wav');
  loseSound = loadSound('lose.wav');
}


function tryPlay(_sound) {
  if (!audioUnlocked) return;
  if (!_sound) return;
  if (_sound.isPlaying()) _sound.stop();
  _sound.play();
}



function setup() {

  createCanvas((displaySize*pixelSize), pixelSize);     // dynamically sets canvas size

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


