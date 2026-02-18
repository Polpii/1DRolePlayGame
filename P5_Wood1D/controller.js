
// This is where your state machines and game logic lives


class Controller {

    // This is the state we start with.
    constructor() {
        this.gameState = "PLAY";
        this.lightState = "GO";              // GO = yellow, STOP = red
        this.lightIndex = displaySize - 1;    // rightmost pixel is both the light + finish line
        this.winnerColor = color(0, 0, 0);

        // timing (milliseconds)
        this.nextSwitchAt = 0;
        this.redGraceUntil = 0;              // when turning red, allow a short time to stop
        this.redGraceMs = 200;

        // sound timing: only play red when movement becomes forbidden
        this.redSoundPending = false;
    }
    
    // This is called from draw() in sketch.js with every frame
    update() {

        // STATE MACHINE ////////////////////////////////////////////////
        // This is where your game logic lives
        /////////////////////////////////////////////////////////////////
        switch(this.gameState) {

            // This is the main game state, where the playing actually happens
            case "PLAY":

                // clear screen at frame rate so we always start fresh
                display.clear();

                // update the light state (yellow/red)
                this.updateLight();

                // if we just turned red, wait until grace ends to play red
                if (this.redSoundPending && millis() >= this.redGraceUntil) {
                    this.redSoundPending = false;
                    // make sure green is not playing anymore
                    if (greenSound && greenSound.isPlaying()) greenSound.stop();
                    tryPlay(redSound);
                }

                // draw the light on the right
                display.setPixel(this.lightIndex, this.lightColor());

                // show players
                display.setPixel(playerOne.position, playerOne.playerColor);
                display.setPixel(playerTwo.position, playerTwo.playerColor);

                // win condition: first player to reach the rightmost pixel
                if (playerOne.position >= this.lightIndex) {
                    this.winnerColor = playerOne.playerColor;
                    this.gameState = "WIN";
                } else if (playerTwo.position >= this.lightIndex) {
                    this.winnerColor = playerTwo.playerColor;
                    this.gameState = "WIN";
                }

                break;

            case "WIN":
                // fill the whole strip with the winner color
                display.setAllPixels(this.winnerColor);

                break;

            // Not used, it's here just for code compliance
            default:
                break;
        }
    }

    updateLight() {
        let now = millis();

        // first time setup
        if (this.nextSwitchAt === 0) {
            this.nextSwitchAt = now + this.randomDurationMs(this.lightState);
        }

        if (now >= this.nextSwitchAt) {
            // toggle state
            if (this.lightState === "GO") {
                this.lightState = "STOP";
                this.redGraceUntil = now + this.redGraceMs;
                this.redSoundPending = true;

                // players will soon be forbidden to move: stop green immediately
                if (greenSound && greenSound.isPlaying()) greenSound.stop();
            } else {
                this.lightState = "GO";
                this.redSoundPending = false;

                // players are allowed to move again: stop red immediately
                if (redSound && redSound.isPlaying()) redSound.stop();
                tryPlay(greenSound);
            }
            this.nextSwitchAt = now + this.randomDurationMs(this.lightState);
        }
    }

    randomDurationMs(state) {
        // keep it simple: GO lasts a bit longer than STOP
        if (state === "GO") return random(900, 3000);
        return random(600, 3000);
    }

    lightColor() {
        if (this.lightState === "GO") return color(0, 255, 255);
        return color(255, 0, 0);
    }

    canMoveNow() {
        let now = millis();
        return (this.lightState === "GO") || (now < this.redGraceUntil);
    }
}




// This function gets called when a key on the keyboard is pressed
function keyPressed() {

    // Browsers block audio until the first user interaction
    if (!audioUnlocked) {
        audioUnlocked = true;
        userStartAudio();
    }

    // Player 1 advances with D
    if (key == 'D' || key == 'd') {
        if (controller.gameState === "PLAY") {
            if (controller.canMoveNow()) {
                playerOne.move(1);
            } else {
                // moved on red (after grace): back to start
                tryPlay(shotSound);
                playerOne.position = 0;
            }
        }
    }

    // Player 2 advances with L
    if (key == 'L' || key == 'l' || key === "ArrowRight") {
        if (controller.gameState === "PLAY") {
            if (controller.canMoveNow()) {
                playerTwo.move(1);
            } else {
                tryPlay(shotSound);
                playerTwo.position = 0;
            }
        }
    }

    // R resets the game
    if (key == 'R' || key == 'r') {
        controller.gameState = "PLAY";
        controller.lightState = "GO";
        controller.nextSwitchAt = 0;
        controller.redGraceUntil = 0;
        playerOne.position = 0;
        playerTwo.position = 0;

        if (greenSound && greenSound.isPlaying()) greenSound.stop();
        if (redSound && redSound.isPlaying()) redSound.stop();
    }
  }