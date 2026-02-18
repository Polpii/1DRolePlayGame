// Inception1D (prototype)
// - Nested layers you can traverse via doors
// - Doors are optional: stop 1s on a door to take it
// - You don't know which layer is Reality (hidden)
// - Collaboration: control alternates by layer (even=A with Q/D, odd=B with arrows)
// - Obstacles differ per layer; only Reality has a "true" goal


class Controller {
  constructor() {
    this.gameState = 'PLAY'; // PLAY | LOSE | WIN

    this.displaySize = displaySize;
    this.pixelGoalColor = color(255, 255, 0);

    // Hidden run setup
    this.layerCount = floor(random(4, 7)); // 4..6 (player doesn't know)
    this.realityLayerIndex = floor(random(0, this.layerCount));

    this.currentLayerIndex = 0;

    // Per-layer avatar positions (each layer has its own "you")
    this.layerPositions = new Array(this.layerCount).fill(0);

    // Door mechanic
    this.doorHoldMs = 1000;
    this.stillSinceMs = millis();
    this.lastPos = 0;
    this.lastLayerIndex = 0;

    // Lose cooldown
    this.loseUntilMs = 0;

    // Layers content
    this.layers = [];
    this.buildRun();
  }

  buildRun() {
    this.layers = [];

    for (let i = 0; i < this.layerCount; i++) {
      const isReality = (i === this.realityLayerIndex);
      const owner = this.layerOwner(i);

      const layer = {
        index: i,
        isReality,
        owner,

        // Doors: consistent positions so it's learnable
        doorUp: (i > 0) ? 2 : null,
        doorDown: (i < this.layerCount - 1) ? 10 : null,

        // Goal: Reality uses right side; dreams start with a "fake" goal that can lie
        goalIndex: this.displaySize - 1,
        dreamGoalLies: !isReality,
        dreamGoalHasLied: false,

        // Dream weirdness: one simple rule per dream layer
        // - mirrorControls: left/right are swapped
        // - timeStutter: every ~1.1s you get pulled back by 1
        // - doorDrift: doors shift slowly by +-1 (not while you stand on them)
        weirdness: isReality ? 'stable' : this.pickDreamWeirdness(i),
        hasMovedInLayer: false,
        nextStutterAtMs: 0,
        nextDoorDriftAtMs: 0,

        // Obstacles
        obstacles: [], // { type, pos, createdAtMs, ... }
        nearTraps: [], // { triggerPos, fired, obstacleDef }
      };

      this.populateLayer(layer);
      this.layers.push(layer);
    }

    // Keep doors/start/goal cells safe in every layer
    for (let layer of this.layers) {
      this.sanitizeLayer(layer);
    }

    // Reset positions and door timers
    this.layerPositions.fill(0);
    this.currentLayerIndex = 0;
    this.stillSinceMs = millis();
    this.lastPos = 0;
    this.lastLayerIndex = 0;
  }

  pickDreamWeirdness(layerIndex) {
    // Deeper dreams: slightly higher chance of the more confusing rules
    let depth = layerIndex;
    let r = random();
    if (depth >= 3 && r < 0.34) return 'doorDrift';
    if (depth >= 2 && r < 0.67) return 'timeStutter';
    return 'mirrorControls';
  }

  layerOwner(layerIndex) {
    return (layerIndex % 2 === 0) ? 'A' : 'B';
  }

  activeLayer() {
    return this.layers[this.currentLayerIndex];
  }

  activePlayer() {
    // Using existing global players for colors
    return (this.activeLayer().owner === 'A') ? playerOne : playerTwo;
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
      layer.obstacles.push({ createdAtMs: millis(), ...obstacle });
    };

    const addNearTrap = (triggerPos, obstacleDef) => {
      layer.nearTraps.push({ triggerPos, obstacleDef, fired: false });
    };

    const depth = layer.index;

    // Static obstacles (keep it sparse; devil traps will do the rest)
    const staticCount = layer.isReality ? 2 : 2 + min(2, depth);
    for (let i = 0; i < staticCount; i++) {
      let pos = floor(random(5, this.displaySize - 4));
      addObstacle({ type: 'static', pos });
    }

    // Blinkers in dreams
    if (!layer.isReality) {
      let pos = floor(random(6, this.displaySize - 6));
      addObstacle({ type: 'blink', pos, periodMs: 600 - depth * 40, onMs: 220 });
    }

    // Moving obstacle that bounces end-to-end (deeper = faster)
    if (depth >= 2) {
      addObstacle({
        type: 'moving',
        pos: this.displaySize - 3,
        velocity: -1,
        stepIntervalMs: max(90, 180 - depth * 20),
        bounce: true,
        minPos: 1,
        maxPos: this.displaySize - 2,
        lastStepAtMs: 0,
      });
    }

    // Level Devil near-traps (appear when you're just before)
    if (depth >= 1) {
      addNearTrap(6 + depth, { type: 'static', pos: 6 + depth });
      addNearTrap(this.displaySize - 3, { type: 'static', pos: this.displaySize - 3 });
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
    layer.nearTraps = layer.nearTraps.filter(t => !forbidden.has(t.obstacleDef.pos));
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
    const player = this.activePlayer();
    const pos = this.activePosition();

    // background tint indicates which player is in control
    // (alpha intentionally high so it's visible)
    let baseTint = layer.owner === 'A'
      ? color(0, 255, 0, layer.isReality ? 55 : 75)
      : color(0, 140, 255, layer.isReality ? 55 : 75);
    display.setAllPixels(baseTint);

    // heartbeat pixel: confirms rendering is alive
    display.setPixel(1, color(255, 255, 255, 160));

    // apply dream weirdness updates
    this.updateDreamWeirdness(layer, now);

    // update traps and moving obstacles
    this.updateNearTraps(layer, pos);
    this.updateMoving(layer, now);

    // draw doors
    if (layer.doorUp !== null) display.setPixel(layer.doorUp, color(200, 200, 255));
    if (layer.doorDown !== null) display.setPixel(layer.doorDown, color(200, 255, 255));

    // draw goal
    display.setPixel(layer.goalIndex, this.pixelGoalColor);

    // draw obstacles
    this.drawObstacles(layer, now);

    // draw player
    display.setPixel(pos, player.playerColor);

    // collision
    if (this.isBlocked(layer, pos, now)) {
      this.lose();
      return;
    }

    // Dream goal lies (devilish, but simple)
    if (layer.dreamGoalLies && !layer.dreamGoalHasLied) {
      if (abs(pos - layer.goalIndex) <= 2) {
        layer.dreamGoalHasLied = true;
        layer.goalIndex = 0;
        tryPlay(switchSound);
      }
    }

    // win only in reality
    if (layer.isReality && pos === layer.goalIndex) {
      this.gameState = 'WIN';
      return;
    }

    // door hold mechanic: stand still 1s on door
    this.updateDoorHold(layer, pos, now);
  }

  updateDreamWeirdness(layer, now) {
    if (layer.isReality) return;

    // small marker pixel for "this layer is glitchy"
    display.setPixel(0, color(180, 0, 255, 90));

    if (layer.weirdness === 'timeStutter') {
      if (layer.nextStutterAtMs === 0) {
        layer.nextStutterAtMs = now + 1100;
      }
      if (layer.hasMovedInLayer && now >= layer.nextStutterAtMs) {
        layer.nextStutterAtMs = now + 1100;
        let p = this.layerPositions[layer.index];
        if (p > 0) {
          this.layerPositions[layer.index] = p - 1;
          tryPlay(switchSound);
        }
      }
    }

    if (layer.weirdness === 'doorDrift') {
      if (layer.nextDoorDriftAtMs === 0) {
        layer.nextDoorDriftAtMs = now + 900;
      }
      if (now >= layer.nextDoorDriftAtMs) {
        layer.nextDoorDriftAtMs = now + 900;

        const pos = this.layerPositions[layer.index];
        const onAnyDoor = (layer.doorUp !== null && pos === layer.doorUp) || (layer.doorDown !== null && pos === layer.doorDown);
        if (!onAnyDoor) {
          if (layer.doorUp !== null) layer.doorUp = this.pickSafeDoorPos(layer, layer.doorUp + floor(random(-1, 2)));
          if (layer.doorDown !== null) layer.doorDown = this.pickSafeDoorPos(layer, layer.doorDown + floor(random(-1, 2)));
          tryPlay(plopSound);
        }
      }
    }
  }

  pickSafeDoorPos(layer, proposed) {
    let cand = this.clampPos(proposed);
    if (cand < 1) cand = 1;
    if (cand > this.displaySize - 2) cand = this.displaySize - 2;

    const forbidden = new Set([
      0,
      this.displaySize - 1,
      layer.goalIndex,
      this.layerPositions[layer.index],
      layer.doorUp,
      layer.doorDown,
    ].filter(v => v !== null && v !== undefined));

    for (let ob of layer.obstacles) forbidden.add(ob.pos);

    if (!forbidden.has(cand)) return cand;
    for (let d of [1, -1, 2, -2, 3, -3]) {
      let t = cand + d;
      if (t < 1 || t > this.displaySize - 2) continue;
      if (forbidden.has(t)) continue;
      return t;
    }
    return cand;
  }

  updateNearTraps(layer, pos) {
    for (let trap of layer.nearTraps) {
      if (trap.fired) continue;
      if (pos === trap.triggerPos - 1) {
        trap.fired = true;
        this.spawnObstacle(layer, trap.obstacleDef);
      }
    }
  }

  spawnObstacle(layer, obstacleDef) {
    let safePos = obstacleDef.pos;
    const forbidden = new Set([
      this.activePosition(),
      0,
      this.displaySize - 1,
      layer.doorUp,
      layer.doorDown,
      layer.goalIndex,
    ].filter(v => v !== null && v !== undefined));

    if (forbidden.has(safePos)) {
      for (let d of [1, -1, 2, -2, 3, -3]) {
        let cand = safePos + d;
        if (cand < 0 || cand >= this.displaySize) continue;
        if (forbidden.has(cand)) continue;
        safePos = cand;
        break;
      }
    }

    layer.obstacles.push({ createdAtMs: millis(), type: obstacleDef.type, pos: safePos });
    tryPlay(plopSound);
  }

  updateMoving(layer, now) {
    for (let ob of layer.obstacles) {
      if (ob.type !== 'moving') continue;
      if (!ob.lastStepAtMs) ob.lastStepAtMs = now;
      if (now - ob.lastStepAtMs < ob.stepIntervalMs) continue;

      ob.lastStepAtMs = now;
      let proposed = ob.pos + ob.velocity;

      if (ob.bounce) {
        if (proposed < ob.minPos || proposed > ob.maxPos) {
          ob.velocity = -ob.velocity;
          proposed = ob.pos + ob.velocity;
        }
      }

      const forbidden = new Set([
        layer.doorUp,
        layer.doorDown,
        layer.goalIndex,
      ].filter(v => v !== null && v !== undefined));

      if (proposed >= 0 && proposed < this.displaySize && !forbidden.has(proposed)) {
        ob.pos = proposed;
      }
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

    const onUp = (layer.doorUp !== null && pos === layer.doorUp);
    const onDown = (layer.doorDown !== null && pos === layer.doorDown);
    if (!onUp && !onDown) return;

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
    tryPlay(switchSound);

    const layer = this.activeLayer();
    if (this.isBlocked(layer, this.activePosition(), millis())) {
      this.lose();
    }
  }

  tryMoveInActiveLayer(direction) {
    if (this.gameState !== 'PLAY') return;

    const layer = this.activeLayer();
    let dir = direction;
    if (!layer.isReality && layer.weirdness === 'mirrorControls') dir = -dir;

    let nextPos = this.clampPos(this.activePosition() + dir);
    this.setActivePosition(nextPos);
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
  }

  restartNewRun() {
    this.gameState = 'PLAY';
    this.layerCount = floor(random(4, 7));
    this.realityLayerIndex = floor(random(0, this.layerCount));
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

  // R = new randomized run
  if (key === 'R' || key === 'r') {
    controller.restartNewRun();
    return;
  }

  if (controller.gameState !== 'PLAY') return;

  const layer = controller.activeLayer();

  if (layer.owner === 'A') {
    if (key === 'Q' || key === 'q') controller.tryMoveInActiveLayer(-1);
    else if (key === 'D' || key === 'd') controller.tryMoveInActiveLayer(1);
  } else {
    if (keyCode === LEFT_ARROW) controller.tryMoveInActiveLayer(-1);
    else if (keyCode === RIGHT_ARROW) controller.tryMoveInActiveLayer(1);
  }
}
// Inception1D (prototype)
// - Nested layers you can traverse via doors
// - Doors are optional: stop 1s on a door to take it
// - You don't know which layer is Reality (hidden)
// - Collaboration: control alternates by layer (even=A with Q/D, odd=B with arrows)
// - Obstacles differ per layer; only Reality has a "true" goal


class Controller {
  constructor() {
    this.gameState = 'PLAY'; // PLAY | LOSE | WIN

    this.displaySize = displaySize;
    this.pixelGoalColor = color(255, 255, 0);

    // Hidden run setup
    this.layerCount = floor(random(4, 7)); // 4..6 (player doesn't know)
    this.realityLayerIndex = floor(random(0, this.layerCount));

    this.currentLayerIndex = 0;

    // Per-layer avatar positions (each layer has its own "you")
    this.layerPositions = new Array(this.layerCount).fill(0);

    // Door mechanic
    this.doorHoldMs = 1000;
    this.stillSinceMs = millis();
    this.lastPos = 0;
    this.lastLayerIndex = 0;

    // Lose cooldown
    this.loseUntilMs = 0;

    // Layers content
    this.layers = [];
    this.buildRun();
  }

  buildRun() {
    this.layers = [];

    for (let i = 0; i < this.layerCount; i++) {
      const isReality = (i === this.realityLayerIndex);
      const owner = this.layerOwner(i);

      const layer = {
        index: i,
        isReality,
        owner,
        // Doors: consistent positions so it's learnable
        doorUp: (i > 0) ? 2 : null,
        doorDown: (i < this.layerCount - 1) ? 10 : null,

        // Goal: Reality uses right side; dreams start with a "fake" goal that can lie
        goalIndex: this.displaySize - 1,
        dreamGoalLies: !isReality,
        dreamGoalHasLied: false,

        // Dream weirdness: one simple rule per dream layer
        // - mirrorControls: left/right are swapped
        // - timeStutter: every ~1.1s you get pulled back by 1
        // - doorDrift: doors shift slowly by +-1 (not while you stand on them)
        weirdness: isReality ? 'stable' : this.pickDreamWeirdness(i),
        hasMovedInLayer: false,
        nextStutterAtMs: 0,
        nextDoorDriftAtMs: 0,

        // Obstacles
        obstacles: [], // { type, pos, createdAtMs, ... }
        nearTraps: [], // { triggerPos, fired, obstacleDef }
      };

      this.populateLayer(layer);
      this.layers.push(layer);
    }

    // Keep doors/start/goal cells safe in every layer
    for (let layer of this.layers) {
      this.sanitizeLayer(layer);
    }

    // Reset positions and door timers
    this.layerPositions.fill(0);
    this.currentLayerIndex = 0;
    this.stillSinceMs = millis();
    this.lastPos = 0;
    this.lastLayerIndex = 0;
  }

  pickDreamWeirdness(layerIndex) {
    // Deeper dreams: slightly higher chance of the more confusing rules
    let depth = layerIndex;
    let r = random();
    if (depth >= 3 && r < 0.34) return 'doorDrift';
    if (depth >= 2 && r < 0.67) return 'timeStutter';
    return 'mirrorControls';
  }

  layerOwner(layerIndex) {
    return (layerIndex % 2 === 0) ? 'A' : 'B';
  }

  activeLayer() {
    return this.layers[this.currentLayerIndex];
  }

  activePlayer() {
    // Using existing global players for colors
    return (this.activeLayer().owner === 'A') ? playerOne : playerTwo;
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
      layer.obstacles.push({ createdAtMs: millis(), ...obstacle });
    };

    const addNearTrap = (triggerPos, obstacleDef) => {
      layer.nearTraps.push({ triggerPos, obstacleDef, fired: false });
    };

    // Base difficulty: deeper layers have more chaos
    const depth = layer.index;

    // Static obstacles (keep it sparse; devil traps will do the rest)
    const staticCount = layer.isReality ? 2 : 2 + min(2, depth);
    for (let i = 0; i < staticCount; i++) {
      let pos = floor(random(5, this.displaySize - 4));
      addObstacle({ type: 'static', pos });
    }

    // Blinkers in dreams
    if (!layer.isReality) {
      let pos = floor(random(6, this.displaySize - 6));
      addObstacle({ type: 'blink', pos, periodMs: 600 - depth * 40, onMs: 220 });
    }

    // Moving obstacle that bounces end-to-end (deeper = faster)
    if (depth >= 2) {
      addObstacle({
        type: 'moving',
        pos: this.displaySize - 3,
        velocity: -1,
        stepIntervalMs: max(90, 180 - depth * 20),
        bounce: true,
        minPos: 1,
        maxPos: this.displaySize - 2,
        lastStepAtMs: 0,
      });
    }

    // Level Devil near-traps (appear when you're just before)
    if (depth >= 1) {
      // One early trap
      addNearTrap(6 + depth, { type: 'static', pos: 6 + depth });
      // One late trap close to the end
      addNearTrap(this.displaySize - 3, { type: 'static', pos: this.displaySize - 3 });
    }
  }

  sanitizeLayer(layer) {
    const forbidden = new Set([
      0,
      this.displaySize - 1,
      layer.doorUp,
      layer.doorDown,
    ].filter(v => v !== null && v !== undefined));

    // Remove obstacles on forbidden cells
    layer.obstacles = layer.obstacles.filter(ob => !forbidden.has(ob.pos));

    // Also remove near-traps that would spawn on forbidden cells
    layer.nearTraps = layer.nearTraps.filter(t => !forbidden.has(t.obstacleDef.pos));
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
    const player = this.activePlayer();
    const pos = this.activePosition();

    // background tint indicates which player is in control
    // (alpha is intentionally high so it is visible on a black page)
    let baseTint = layer.owner === 'A'
      ? color(0, 255, 0, layer.isReality ? 55 : 75)
      : color(0, 140, 255, layer.isReality ? 55 : 75);
    display.setAllPixels(baseTint);

    // heartbeat pixel: confirms rendering is alive
    display.setPixel(1, color(255, 255, 255, 160));

    // apply dream weirdness updates
    this.updateDreamWeirdness(layer, now);

    // update spawns and moving obstacles
    this.updateNearTraps(layer, pos);
    this.updateMoving(layer, now);

    // draw doors
    if (layer.doorUp !== null) display.setPixel(layer.doorUp, color(200, 200, 255));
    if (layer.doorDown !== null) display.setPixel(layer.doorDown, color(200, 255, 255));

    // draw goal
    display.setPixel(layer.goalIndex, this.pixelGoalColor);

    // draw obstacles
    this.drawObstacles(layer, now);

    // draw player
    display.setPixel(pos, player.playerColor);

    // collision
    if (this.isBlocked(layer, pos, now)) {
      this.lose();
      return;
    }

    // Dream goal lies (simple to understand, devil to beat)
    if (layer.dreamGoalLies && !layer.dreamGoalHasLied) {
      if (abs(pos - layer.goalIndex) <= 2) {
        layer.dreamGoalHasLied = true;
        layer.goalIndex = 0;
        tryPlay(switchSound);
      }
    }

    // win only in reality
    if (layer.isReality && pos === layer.goalIndex) {
      this.gameState = 'WIN';
      return;
    }

    // door hold mechanic: stand still 1s on door
    this.updateDoorHold(layer, pos, now);
  }

  updateDreamWeirdness(layer, now) {
    if (layer.isReality) return;

    // small marker pixel for "this layer is glitchy"
    display.setPixel(0, color(180, 0, 255, 90));

    if (layer.weirdness === 'timeStutter') {
      if (layer.nextStutterAtMs === 0) {
        layer.nextStutterAtMs = now + 1100;
      }
      if (layer.hasMovedInLayer && now >= layer.nextStutterAtMs) {
        layer.nextStutterAtMs = now + 1100;

        // Pull back by 1 (unless you're at start)
        let p = this.layerPositions[layer.index];
        if (p > 0) {
          this.layerPositions[layer.index] = p - 1;
          tryPlay(switchSound);
        }
      }
    }

    if (layer.weirdness === 'doorDrift') {
      if (layer.nextDoorDriftAtMs === 0) {
        layer.nextDoorDriftAtMs = now + 900;
      }
      if (now >= layer.nextDoorDriftAtMs) {
        layer.nextDoorDriftAtMs = now + 900;

        const pos = this.layerPositions[layer.index];
        const onAnyDoor = (layer.doorUp !== null && pos === layer.doorUp) || (layer.doorDown !== null && pos === layer.doorDown);
        if (!onAnyDoor) {
          // shift doors by -1/0/+1, but keep them safe
          if (layer.doorUp !== null) layer.doorUp = this.pickSafeDoorPos(layer, layer.doorUp + floor(random(-1, 2)));
          if (layer.doorDown !== null) layer.doorDown = this.pickSafeDoorPos(layer, layer.doorDown + floor(random(-1, 2)));
          tryPlay(plopSound);
        }
      }
    }
  }

  pickSafeDoorPos(layer, proposed) {
    let cand = this.clampPos(proposed);
    // keep doors away from edges so the hold mechanic is not trivial
    if (cand < 1) cand = 1;
    if (cand > this.displaySize - 2) cand = this.displaySize - 2;

    const forbidden = new Set([
      0,
      this.displaySize - 1,
      layer.goalIndex,
      this.layerPositions[layer.index],
      layer.doorUp,
      layer.doorDown,
    ].filter(v => v !== null && v !== undefined));

    // also avoid obstacles
    for (let ob of layer.obstacles) forbidden.add(ob.pos);

    if (!forbidden.has(cand)) return cand;
    for (let d of [1, -1, 2, -2, 3, -3]) {
      let t = cand + d;
      if (t < 1 || t > this.displaySize - 2) continue;
      if (forbidden.has(t)) continue;
      return t;
    }
    return cand;
  }

  tryMoveInActiveLayer(direction) {
    if (this.gameState !== 'PLAY') return;

    const layer = this.activeLayer();
    let dir = direction;
    if (!layer.isReality && layer.weirdness === 'mirrorControls') {
      dir = -dir;
    }

    let nextPos = this.clampPos(this.activePosition() + dir);
    this.setActivePosition(nextPos);
    layer.hasMovedInLayer = true;
  }

  updateNearTraps(layer, pos) {
    for (let trap of layer.nearTraps) {
      if (trap.fired) continue;
      if (pos === trap.triggerPos - 1) {
        trap.fired = true;
        this.spawnObstacle(layer, trap.obstacleDef);
      }
    }
  }

  spawnObstacle(layer, obstacleDef) {
    // Avoid spawning on current player cell, door cells, or goal cell
    let safePos = obstacleDef.pos;
    const forbidden = new Set([
      this.activePosition(),
      0,
      this.displaySize - 1,
      layer.doorUp,
      layer.doorDown,
      layer.goalIndex,
    ].filter(v => v !== null && v !== undefined));

    if (forbidden.has(safePos)) {
      // attempt to nudge
      for (let d of [1, -1, 2, -2, 3, -3]) {
        let cand = safePos + d;
        if (cand < 0 || cand >= this.displaySize) continue;
        if (forbidden.has(cand)) continue;
        safePos = cand;
        break;
      }
    }

    layer.obstacles.push({ createdAtMs: millis(), type: obstacleDef.type, pos: safePos });
    tryPlay(plopSound);
  }

  updateMoving(layer, now) {
    for (let ob of layer.obstacles) {
      if (ob.type !== 'moving') continue;
      if (!ob.lastStepAtMs) ob.lastStepAtMs = now;
      if (now - ob.lastStepAtMs < ob.stepIntervalMs) continue;

      ob.lastStepAtMs = now;
      let proposed = ob.pos + ob.velocity;

      if (ob.bounce) {
        if (proposed < ob.minPos || proposed > ob.maxPos) {
          ob.velocity = -ob.velocity;
          proposed = ob.pos + ob.velocity;
        }
      }

      // keep away from doors and goal (avoid impossible instakills)
      const forbidden = new Set([
        layer.doorUp,
        layer.doorDown,
        layer.goalIndex,
      ].filter(v => v !== null && v !== undefined));

      if (proposed >= 0 && proposed < this.displaySize && !forbidden.has(proposed)) {
        ob.pos = proposed;
      }
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
    // reset still timer when changing layer or position
    if (this.currentLayerIndex !== this.lastLayerIndex || pos !== this.lastPos) {
      this.lastLayerIndex = this.currentLayerIndex;
      this.lastPos = pos;
      this.stillSinceMs = now;
      return;
    }

    const onUp = (layer.doorUp !== null && pos === layer.doorUp);
    const onDown = (layer.doorDown !== null && pos === layer.doorDown);
    if (!onUp && !onDown) return;

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

    // Take the door: position carries over ONLY if the next layer hasn't been visited much.
    // But to keep it understandable, we always keep the same index.
    const currentPos = this.activePosition();
    this.currentLayerIndex = nextIndex;
    this.setActivePosition(currentPos);

    tryPlay(switchSound);

    // Avoid instant death on arrival if something moved there
    const layer = this.activeLayer();
    if (this.isBlocked(layer, this.activePosition(), millis())) {
      this.lose();
    }
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
  }

  restartNewRun() {
    this.gameState = 'PLAY';
    this.layerCount = floor(random(4, 7));
    this.realityLayerIndex = floor(random(0, this.layerCount));
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

  // R = new randomized run
  if (key === 'R' || key === 'r') {
    controller.restartNewRun();
    return;
  }

  if (controller.gameState !== 'PLAY') return;

  const layer = controller.activeLayer();

  if (layer.owner === 'A') {
    if (key === 'Q' || key === 'q') controller.tryMoveInActiveLayer(-1);
    else if (key === 'D' || key === 'd') controller.tryMoveInActiveLayer(1);
  } else {
    if (keyCode === LEFT_ARROW) controller.tryMoveInActiveLayer(-1);
    else if (keyCode === RIGHT_ARROW) controller.tryMoveInActiveLayer(1);
  }
}

// This is where your state machines and game logic lives


class Controller {

    // This is the state we start with.
    constructor() {
        this.gameState = "PLAY"; // PLAY | LOSE

        // Worlds: A is controlled by playerOne, B by playerTwo
        this.currentWorld = "A";

        // Shared position (synced between worlds)
        this.sharedPosition = 0;
        this.goalIndex = displaySize - 1;
        this.defaultGoalIndex = this.goalIndex;

        // Levels
        this.level = 1; // 1..9 normal + 10 troll
        this.maxNormalLevel = 9;
        this.trollLevel = 10;

        // Level modifiers
        this.invertDirections = false;
        this.goalFlip = null; // { triggerPos, newGoalIndex, fired }
        this.chase = null;    // { pos, nextStepAtMs, stepMs, color, active }
        this.hasMovedThisLevel = false;

        // Obstacles per world
        this.obstacles = { A: [], B: [] };
        this.spawnEvents = [];   // { atMs, world, obstacleDef, fired }
        this.nearTriggers = [];  // { world, triggerPos, obstacleDef, fired }
        this.levelStartMs = millis();

        // Troll spawning
        this.nextTrollSpawnAt = 0;

        // Lose cooldown
        this.loseUntilMs = 0;

        this.loadLevel(this.level);
    }
    
    // This is called from draw() in sketch.js with every frame
    update() {

        // world background tint = visual indicator (A green, B blue)
        display.setAllPixels(this.worldBackgroundColor(this.currentWorld));

        let now = millis();

        // Handle lose cooldown & restart same level
        if (this.gameState === "LOSE") {
            display.setAllPixels(color(255, 0, 0));
            if (now >= this.loseUntilMs) {
                this.restartLevel();
            }
            return;
        }

        // Level mechanics updates
        this.updateGoalFlip(now);
        this.updateChase(now);

        // Update dynamic obstacles
        this.updateSpawns(now);
        this.updateObstacles(now);

        // Draw goal (yellow point)
        display.setPixel(this.goalIndex, color(255, 255, 0));

        // Draw current world's obstacles
        this.drawObstacles(this.currentWorld, now);

        // Draw current active player
        let activePlayer = this.activePlayer();
        display.setPixel(this.sharedPosition, activePlayer.playerColor);

        // Win: reach the goal exactly (goal can flip sides)
        if (this.sharedPosition === this.goalIndex) {
            this.advanceLevel();
        }
    }

    worldBackgroundColor(world) {
        if (world === "A") return color(0, 255, 0, 35);
        return color(0, 120, 255, 35);
    }

    activePlayer() {
        return (this.currentWorld === "A") ? playerOne : playerTwo;
    }

    switchWorld() {
        if (this.gameState !== "PLAY") return;
        this.currentWorld = (this.currentWorld === "A") ? "B" : "A";
        tryPlay(switchSound);
    }

    moveActive(direction) {
        if (this.gameState !== "PLAY") return;

        // some levels invert directions
        let effectiveDir = direction;
        if (this.invertDirections) effectiveDir = -effectiveDir;

        // compute next position
        let nextPos = this.sharedPosition + effectiveDir;
        if (nextPos < 0) nextPos = 0;
        if (nextPos > displaySize - 1) nextPos = displaySize - 1;

        // collision check in current world
        if (this.isBlocked(this.currentWorld, nextPos, millis())) {
            this.lose();
            return;
        }

        let prevPos = this.sharedPosition;
        this.sharedPosition = nextPos;
        playerOne.position = this.sharedPosition;
        playerTwo.position = this.sharedPosition;

        if (this.sharedPosition !== prevPos) {
            this.hasMovedThisLevel = true;
            // start chase timer on first movement
            if (this.chase && this.chase.active && !this.chase.started) {
                this.chase.started = true;
                this.chase.nextStepAtMs = millis() + this.chase.stepMs;
            }
        }

        // If an obstacle moved/spawned on our current cell (rare but possible)
        if (this.isBlocked(this.currentWorld, this.sharedPosition, millis())) {
            this.lose();
            return;
        }
    }

    lose() {
        if (this.gameState !== "PLAY") return;
        this.gameState = "LOSE";
        this.loseUntilMs = millis() + 700;
        tryPlay(loseSound);
    }

    restartLevel() {
        this.gameState = "PLAY";
        this.currentWorld = "A";
        this.sharedPosition = 0;
        playerOne.position = 0;
        playerTwo.position = 0;
        this.loadLevel(this.level);
    }

    advanceLevel() {
        this.level += 1;
        if (this.level > this.trollLevel) {
            this.level = 1;
        }
        this.currentWorld = "A";
        this.sharedPosition = 0;
        playerOne.position = 0;
        playerTwo.position = 0;
        this.loadLevel(this.level);
    }

    loadLevel(levelNumber) {
        this.obstacles = { A: [], B: [] };
        this.spawnEvents = [];
        this.nearTriggers = [];
        this.levelStartMs = millis();
        this.nextTrollSpawnAt = 0;

        // reset goal and modifiers
        this.goalIndex = this.defaultGoalIndex;
        this.invertDirections = false;
        this.goalFlip = null;
        this.chase = null;
        this.hasMovedThisLevel = false;

        // helper to define obstacles
        const O = {
            static: (pos) => ({ type: "static", pos }),
            blink: (pos, periodMs, onMs) => ({ type: "blink", pos, periodMs, onMs }),
            moving: (pos, stepIntervalMs, velocity) => ({ type: "moving", pos, stepIntervalMs, velocity }),
            bounce: (pos, stepIntervalMs, velocity, minPos, maxPos) => ({ type: "moving", pos, stepIntervalMs, velocity, minPos, maxPos, bounce: true })
        };

        // Basic increasing difficulty. Goal is to force switching between worlds.
        // Important: NEVER place obstacles at the same position (or 1 cell apart) across worlds.
        switch(levelNumber) {
            case 1:
                // First tiny troll: a "last moment" block forcing an early switch
                this.nearTrigger("A", 5, O.static(5));
                this.addObstacle("A", O.static(9));
                this.addObstacle("B", O.static(14));
                break;
            case 2:
                // Appears right before you step on it, but only in one world
                this.nearTrigger("B", 7, O.static(7));
                this.addObstacle("A", O.static(11));
                this.addObstacle("B", O.static(17));
                // timed plop: pushes you to switch again later
                this.scheduleSpawnWhenWorldActive(750, "A", O.static(20));
                break;
            case 3:
                // Blink wall + last-moment wall combo
                this.addObstacle("A", O.blink(12, 650, 260));
                this.addObstacle("B", O.static(16));
                this.nearTrigger("A", 13, O.static(13));
                this.nearTrigger("B", 18, O.static(18));
                // goal flips to the left near the end (devil move)
                this.setGoalFlip(22, 0);
                break;
            case 4:
                // Fake safety: a moving wall starts late + a near trap
                this.addObstacle("A", O.static(8));
                this.addObstacle("B", O.static(12));
                this.nearTrigger("A", 15, O.static(15));
                // bouncing obstacle sweeps end-to-end
                this.scheduleSpawnWhenWorldActive(900, "A", O.bounce(24, 130, -1, 2, this.defaultGoalIndex - 1));
                // chase wall mechanic starts here (level 4)
                this.enableChase(-1, 1000);
                break;
            case 5:
                // Double troll: one trap forces switch, next trap punishes staying too long
                this.addObstacle("A", O.static(10));
                this.addObstacle("B", O.blink(13, 520, 210));
                this.nearTrigger("A", 11, O.static(11));
                this.nearTrigger("B", 19, O.static(19));
                this.scheduleSpawnWhenWorldActive(1100, "B", O.static(23));
                break;
            case 6:
                // Corridor pressure: blink in A, timed block in B, and a last-moment trap
                this.addObstacle("A", O.blink(9, 460, 170));
                this.addObstacle("B", O.static(15));
                this.scheduleSpawnWhenWorldActive(650, "B", O.static(10));
                this.nearTrigger("A", 17, O.static(17));
                // invert directions (devil)
                this.invertDirections = true;
                break;
            case 7:
                // Two late traps near the end (classic devil)
                this.addObstacle("A", O.static(6));
                this.addObstacle("B", O.static(11));
                this.addObstacle("A", O.blink(18, 700, 240));
                this.nearTrigger("A", 22, O.static(22));
                this.nearTrigger("B", 24, O.static(24));
                // chase wall speeds up
                this.enableChase(0, 900);
                break;
            case 8:
                // Moving + blink + last-moment at goal-2
                this.addObstacle("A", O.blink(8, 520, 180));
                this.addObstacle("B", O.static(13));
                this.scheduleSpawnWhenWorldActive(700, "A", O.bounce(24, 110, -1, 1, this.defaultGoalIndex - 1));
                this.nearTrigger("B", this.goalIndex - 2, O.static(this.goalIndex - 2));
                break;
            case 9:
                // Final normal level: chain of devil traps (but still solvable)
                this.addObstacle("A", O.static(7));
                this.addObstacle("B", O.static(12));
                this.addObstacle("A", O.blink(15, 430, 140));
                this.addObstacle("B", O.blink(19, 430, 140));
                this.nearTrigger("A", 16, O.static(16));
                this.nearTrigger("B", 20, O.static(20));
                this.nearTrigger("A", 24, O.static(24));
                this.scheduleSpawnWhenWorldActive(900, "B", O.bounce(22, 95, 1, 2, this.defaultGoalIndex - 2));
                // last moment: goal switches sides at the very end
                this.setGoalFlip(26, 0);
                break;
            case 10:
            default:
                // Troll bot level: random spawns keep you switching.
                // (Still winnable: no spawns on player cell or goal)
                this.nextTrollSpawnAt = millis() + 400;
                this.addObstacle("A", O.blink(9, 550, 160));
                this.addObstacle("B", O.blink(14, 550, 160));
                // random level also sometimes inverts
                this.invertDirections = (random() < 0.35);
                break;
        }
    }

    setGoalFlip(triggerPos, newGoalIndex) {
        this.goalFlip = { triggerPos, newGoalIndex, fired: false };
    }

    updateGoalFlip(now) {
        if (!this.goalFlip) return;
        if (this.goalFlip.fired) return;
        if (this.sharedPosition >= this.goalFlip.triggerPos) {
            this.goalFlip.fired = true;
            this.goalIndex = this.goalFlip.newGoalIndex;
        }
    }

    enableChase(startPos, stepMs) {
        this.chase = {
            pos: startPos,
            nextStepAtMs: 0,
            stepMs,
            color: color(255, 0, 0),
            active: true,
            started: false
        };
    }

    updateChase(now) {
        if (!this.chase || !this.chase.active) return;

        // Don't start until the player has moved at least once
        if (!this.hasMovedThisLevel) return;

        // draw red behind (overlays tint)
        for (let i = 0; i <= this.chase.pos; i++) {
            if (i < 0) continue;
            if (i === this.goalIndex) continue;
            display.setPixel(i, color(255, 0, 0, 140));
        }

        if (this.chase.started && now >= this.chase.nextStepAtMs) {
            this.chase.nextStepAtMs = now + this.chase.stepMs;
            this.chase.pos = min(this.chase.pos + 1, displaySize - 1);

        // If a moving obstacle hits the player's cell in the current world
        if (this.isBlocked(this.currentWorld, this.sharedPosition, now)) {
            this.lose();
        }
    }

    obstacleVisible(obstacle, now) {
        if (obstacle.type !== "blink") return true;
        let period = obstacle.periodMs || 600;
        let onMs = obstacle.onMs || floor(period / 2);
        let t = (now - obstacle.createdAtMs) % period;
        return t < onMs;
    }

    isBlocked(world, pos, now) {
        if (pos === this.goalIndex) return false; // goal cell is always safe
        for (let obstacle of this.obstacles[world]) {
            if (obstacle.pos !== pos) continue;
            if (!this.obstacleVisible(obstacle, now)) continue;
            return true;
        }
        return false;
    }

    drawObstacles(world, now) {
        for (let obstacle of this.obstacles[world]) {
            if (!this.obstacleVisible(obstacle, now)) continue;
            // don't overwrite goal
            if (obstacle.pos === this.goalIndex) continue;
            display.setPixel(obstacle.pos, color(255, 0, 0));
        }
    }
}




// This function gets called when a key on the keyboard is pressed
function keyPressed() {

    // Browsers block audio until the first user interaction
    if (!audioUnlocked) {
        audioUnlocked = true;
        userStartAudio();
    }

    // Inverted switching (collab troll):
    // - In World A: Player A moves (Q/D) but Player B decides when to switch (UP)
    // - In World B: Player B moves (←/→) but Player A decides when to switch (Z)

    if (controller.currentWorld === "A") {
        // movement by player A
        if (key === 'Q' || key === 'q') controller.moveActive(-1);
        else if (key === 'D' || key === 'd') controller.moveActive(1);

        // switch by player B
        if (keyCode === UP_ARROW) controller.switchWorld();
    }

    if (controller.currentWorld === "B") {
        // movement by player B
        if (keyCode === LEFT_ARROW) controller.moveActive(-1);
        else if (keyCode === RIGHT_ARROW) controller.moveActive(1);

        // switch by player A
        if (key === 'Z' || key === 'z') controller.switchWorld();
    }

    // R resets current level
    if (key === 'R' || key === 'r') {
        controller.restartLevel();
    }
  }