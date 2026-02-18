
// This holds some player information, like color and position.
// It also has some player methods for managing how a player moves.


class Player {
  
    constructor(_color, _position, _displaySize) {
        this.playerColor = _color;
        this.position = _position;
        this.score = 0;
        this.displaySize = _displaySize;
    }



    // Move player based on keyboard input
    move(_direction) {

        // increments or decrements player position
        this.position = this.position + _direction;

        // clamp: no wrap-around for a race game
        if (this.position < 0) {
            this.position = 0;
        } else if (this.position > this.displaySize - 1) {
            this.position = this.displaySize - 1;
        }
         
    } 
  }