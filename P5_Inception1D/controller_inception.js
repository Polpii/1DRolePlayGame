// Inception1D (clean controller)
// - Layers traversed via doors
// - Stop 1s on a door to take it
// - Reality is always layer 0 (green tint)
// - No hard walls: hazards are timed (blink / moving)
// - Collaboration: both players can move the shared character

class Controller {
  constructor() {
    this.gameState = 'PLAY'; // PLAY | LOSE | WIN

    this.displaySize = displaySize;
    this.pixelGoalColor = color(255, 255, 0);

    this.layerCount = 4;
    this.realityLayerIndex = 0;

    this.currentLayerIndex = 0;
    this.layerPositions = new Array(this.layerCount).fill(0);

    this.doorHoldMs = 1000;
    this.stillSinceMs = millis();
    this.lastPos = 0;
    this.lastLayerIndex = 0;

    // After switching layers while standing on a door, force the player
    // to leave that door cell before they can take it again.
    this.mustLeaveDoorPos = null;

    this.loseUntilMs = 0;

    this.layers = [];
    this.buildRun();
  }

  buildRun() {
    this.layers = [];

    for (let i = 0; i < this.layerCount; i++) {
      const isReality = (i === this.realityLayerIndex);

      const layer = {
        index: i,
        isReality,
        doorUp: (i > 0) ? 2 : null,
        doorDown: (i < this.layerCount - 1) ? 10 : null,
        goalIndex: this.displaySize - 1,
        hasMovedInLayer: false,

        obstacles: [],
      };

      this.populateLayer(layer);
      this.layers.push(layer);
    }

    for (let layer of this.layers) this.sanitizeLayer(layer);

    this.layerPositions.fill(0);
    this.currentLayerIndex = 0;
    this.stillSinceMs = millis();
    this.lastPos = 0;
    this.lastLayerIndex = 0;
    this.mustLeaveDoorPos = null;
  }

  activeLayer() {
    return this.layers[this.currentLayerIndex];
  }

  activePosition() {
    return this.layerPositions[this.currentLayerIndex];
  }

  setActivePosition(pos) {
    this.layerPositions[this.currentLayerIndex] = this.clampPos(pos);
  }

  clampPos(pos) {
    if (pos < 0) return 0;
    if (pos > this.displaySize - 1) return this.displaySize - 1;
    return pos;
  }

  populateLayer(layer) {
    const addObstacle = (obstacle) => {
      const phaseOffsetMs = obstacle.phaseOffsetMs || 0;
      layer.obstacles.push({ createdAtMs: millis() - phaseOffsetMs, ...obstacle });
    };

    const depth = layer.index;

    // Timed hazards (crossable by waiting / switching layers). No static walls.
    const blinkCount = layer.isReality ? 2 : 3 + min(2, depth);
    const basePeriod = layer.isReality ? 720 : 680;
    const periodMs = max(360, basePeriod - depth * 60);
    const onMs = min(periodMs - 60, layer.isReality ? 240 : 270);
    const phaseOffsetMs = depth * 120;

    const forbidden = new Set([
      0,
      this.displaySize - 1,
      layer.doorUp,
      layer.doorDown,
    ].filter(v => v !== null && v !== undefined));

    const used = new Set();
    let attempts = 0;
    while (used.size < blinkCount && attempts < 200) {
      attempts++;
      const pos = floor(random(4, this.displaySize - 4));
      if (forbidden.has(pos)) continue;
      if (used.has(pos)) continue;
      used.add(pos);
      addObstacle({ type: 'blink', pos, periodMs, onMs, phaseOffsetMs });
    }

    if (depth >= 1) {
      // A moving hazard that sweeps; deeper layers sweep faster.
      addObstacle({
        type: 'moving',
        pos: this.displaySize - 3,
        velocity: -1,
        stepIntervalMs: max(90, 180 - depth * 25),
        bounce: true,
        minPos: 1,
        maxPos: this.displaySize - 2,
        lastStepAtMs: 0,
      });
    }
  }

  sanitizeLayer(layer) {
    const forbidden = new Set([
      0,
      this.displaySize - 1,
      layer.doorUp,
      layer.doorDown,
    ].filter(v => v !== null && v !== undefined));

    layer.obstacles = layer.obstacles.filter(ob => !forbidden.has(ob.pos));
  }

  update() {
    let now = millis();

    if (this.gameState === 'LOSE') {
      display.setAllPixels(color(255, 0, 0));
      if (now >= this.loseUntilMs) this.restartSameRun();
      return;
    }

    if (this.gameState === 'WIN') {
      display.setAllPixels(color(255, 255, 0));
      return;
    }

    const layer = this.activeLayer();
    const pos = this.activePosition();

    const alpha = layer.isReality ? 65 : (70 + min(20, layer.index * 4));
    let baseTint = layer.isReality
      ? color(0, 255, 0, alpha)
      : color(0, 140, 255, alpha);
    display.setAllPixels(baseTint);

    this.updateMoving(layer, now);

    if (layer.doorUp !== null) display.setPixel(layer.doorUp, color(200, 200, 255));
    if (layer.doorDown !== null) display.setPixel(layer.doorDown, color(200, 255, 255));

    if (layer.isReality) display.setPixel(layer.goalIndex, this.pixelGoalColor);

    this.drawObstacles(layer, now);
    display.setPixel(pos, playerOne.playerColor);

    if (this.isBlocked(layer, pos, now)) {
      this.lose();
      return;
    }

    if (layer.isReality && pos === layer.goalIndex) {
      this.gameState = 'WIN';
      return;
    }

    this.updateDoorHold(layer, pos, now);
  }



  updateMoving(layer, now) {
    for (let ob of layer.obstacles) {
      if (ob.type !== 'moving') continue;
      if (!ob.lastStepAtMs) ob.lastStepAtMs = now;
      if (now - ob.lastStepAtMs < ob.stepIntervalMs) continue;

      ob.lastStepAtMs = now;
      let proposed = ob.pos + ob.velocity;

      if (ob.bounce && (proposed < ob.minPos || proposed > ob.maxPos)) {
        ob.velocity = -ob.velocity;
        proposed = ob.pos + ob.velocity;
      }

      const forbidden = new Set([layer.doorUp, layer.doorDown, layer.goalIndex].filter(v => v !== null && v !== undefined));
      if (proposed >= 0 && proposed < this.displaySize && !forbidden.has(proposed)) ob.pos = proposed;
    }
  }

  obstacleVisible(ob, now) {
    if (ob.type !== 'blink') return true;
    const period = max(240, ob.periodMs || 600);
    const onMs = min(period - 1, ob.onMs || 220);
    const t = (now - ob.createdAtMs) % period;
    return t < onMs;
  }

  isBlocked(layer, pos, now) {
    for (let ob of layer.obstacles) {
      if (ob.pos !== pos) continue;
      if (!this.obstacleVisible(ob, now)) continue;
      return true;
    }
    return false;
  }

  drawObstacles(layer, now) {
    for (let ob of layer.obstacles) {
      if (!this.obstacleVisible(ob, now)) continue;
      display.setPixel(ob.pos, color(255, 0, 0));
    }
  }

  updateDoorHold(layer, pos, now) {
    if (this.currentLayerIndex !== this.lastLayerIndex || pos !== this.lastPos) {
      this.lastLayerIndex = this.currentLayerIndex;
      this.lastPos = pos;
      this.stillSinceMs = now;
      return;
    }

    if (this.mustLeaveDoorPos !== null) {
      if (pos !== this.mustLeaveDoorPos) this.mustLeaveDoorPos = null;
    }

    const onUp = (layer.doorUp !== null && pos === layer.doorUp);
    const onDown = (layer.doorDown !== null && pos === layer.doorDown);
    if (!onUp && !onDown) return;

    if (this.mustLeaveDoorPos !== null && pos === this.mustLeaveDoorPos) {
      // Just arrived on a door: must move away and come back.
      return;
    }

    if (now - this.stillSinceMs >= this.doorHoldMs) {
      if (onDown) this.goToLayer(this.currentLayerIndex + 1);
      else if (onUp) this.goToLayer(this.currentLayerIndex - 1);

      this.lastLayerIndex = this.currentLayerIndex;
      this.lastPos = this.activePosition();
      this.stillSinceMs = now;
    }
  }

  goToLayer(nextIndex) {
    if (nextIndex < 0 || nextIndex >= this.layerCount) return;
    const currentPos = this.activePosition();
    this.currentLayerIndex = nextIndex;
    this.setActivePosition(currentPos);
    this.mustLeaveDoorPos = currentPos;
    this.lastLayerIndex = this.currentLayerIndex;
    this.lastPos = this.activePosition();
    this.stillSinceMs = millis();
    tryPlay(switchSound);
  }

  tryMoveInActiveLayer(direction) {
    if (this.gameState !== 'PLAY') return;
    const layer = this.activeLayer();
    this.setActivePosition(this.activePosition() + direction);
    layer.hasMovedInLayer = true;
  }

  lose() {
    if (this.gameState !== 'PLAY') return;
    this.gameState = 'LOSE';
    this.loseUntilMs = millis() + 650;
    tryPlay(loseSound);
  }

  restartSameRun() {
    this.gameState = 'PLAY';
    this.layerPositions.fill(0);
    this.currentLayerIndex = 0;
    this.stillSinceMs = millis();
    this.lastPos = 0;
    this.lastLayerIndex = 0;
    this.mustLeaveDoorPos = null;
  }

  restartNewRun() {
    this.layerCount = 4;
    this.realityLayerIndex = 0;
    this.layerPositions = new Array(this.layerCount).fill(0);
    this.currentLayerIndex = 0;
    this.buildRun();
  }
}

function keyPressed() {
  if (!audioUnlocked) {
    audioUnlocked = true;
    if (typeof userStartAudio === 'function') userStartAudio();
  }

  if (!controller) return;

  if (key === 'R' || key === 'r') {
    controller.restartNewRun();
    return;
  }

  if (controller.gameState !== 'PLAY') return;

  if (key === 'Q' || key === 'q' || keyCode === LEFT_ARROW) controller.tryMoveInActiveLayer(-1);
  else if (key === 'D' || key === 'd' || keyCode === RIGHT_ARROW) controller.tryMoveInActiveLayer(1);
}
