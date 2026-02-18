
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
        }

        // If red reaches you, you lose
        if (this.chase.pos >= this.sharedPosition) {
            this.lose();
        }
    }

    otherWorld(world) {
        return (world === "A") ? "B" : "A";
    }

    isNearOtherWorld(world, pos) {
        let other = this.otherWorld(world);
        for (let obstacle of this.obstacles[other]) {
            if (abs(obstacle.pos - pos) <= 1) return true;
        }
        return false;
    }

    hasAnyObstacleAt(world, pos) {
        for (let obstacle of this.obstacles[world]) {
            if (obstacle.pos === pos) return true;
        }
        return false;
    }

    normalizeObstaclePos(world, pos) {
        let candidate = pos;
        if (candidate >= this.goalIndex) candidate = this.goalIndex - 1;
        if (candidate < 0) candidate = 0;

        // Avoid exact player cell on spawn
        if (candidate === this.sharedPosition) {
            candidate = min(this.sharedPosition + 1, this.goalIndex - 1);
        }

        // Avoid duplicates in same world + avoid same/adjacent in the other world
        if (!this.hasAnyObstacleAt(world, candidate) && !this.isNearOtherWorld(world, candidate)) {
            return candidate;
        }

        for (let delta of [1, -1, 2, -2, 3, -3, 4, -4]) {
            let tryPos = candidate + delta;
            if (tryPos < 0) continue;
            if (tryPos >= this.goalIndex) continue;
            if (tryPos === this.sharedPosition) continue;
            if (this.hasAnyObstacleAt(world, tryPos)) continue;
            if (this.isNearOtherWorld(world, tryPos)) continue;
            return tryPos;
        }

        // Worst case: keep candidate (level might become hard/impossible but we tried)
        return candidate;
    }

    addObstacle(world, obstacleDef) {
        const normalizedPos = this.normalizeObstaclePos(world, obstacleDef.pos);
        const obstacle = {
            type: obstacleDef.type,
            pos: normalizedPos,
            createdAtMs: millis(),
            // blink
            periodMs: obstacleDef.periodMs,
            onMs: obstacleDef.onMs,
            // moving
            stepIntervalMs: obstacleDef.stepIntervalMs,
            velocity: obstacleDef.velocity,
            lastStepAtMs: 0
        };
        this.obstacles[world].push(obstacle);
    }

    scheduleSpawn(delayMs, world, obstacleDef) {
        this.spawnEvents.push({
            atMs: this.levelStartMs + delayMs,
            world,
            obstacleDef,
            fired: false
        });
    }

    scheduleSpawnWhenWorldActive(delayMs, world, obstacleDef) {
        this.spawnEvents.push({
            atMs: this.levelStartMs + delayMs,
            world,
            obstacleDef,
            fired: false,
            requireActiveWorld: true
        });
    }

    nearTrigger(world, triggerPos, obstacleDef) {
        this.nearTriggers.push({
            world,
            triggerPos,
            obstacleDef,
            fired: false
        });
    }

    updateSpawns(now) {
        // timed spawns
        for (let event of this.spawnEvents) {
            if (event.fired) continue;
            if (now >= event.atMs) {
                if (event.requireActiveWorld && this.currentWorld !== event.world) {
                    // postpone until the correct world is actually active
                    continue;
                }
                event.fired = true;
                this.spawnObstacleSafe(event.world, event.obstacleDef);
            }
        }

        // near-player triggers ("last moment")
        for (let trig of this.nearTriggers) {
            if (trig.fired) continue;
            // spawn when you're exactly one cell before
            if (this.sharedPosition === trig.triggerPos - 1) {
                trig.fired = true;
                this.spawnObstacleSafe(trig.world, trig.obstacleDef);
            }
        }

        // troll spawns
        if (this.level === this.trollLevel && now >= this.nextTrollSpawnAt) {
            this.nextTrollSpawnAt = now + random(650, 1350);

            let targetWorld = (random() < 0.55) ? this.currentWorld : ((this.currentWorld === "A") ? "B" : "A");
            let ahead = floor(random(2, 7));
            let pos = this.sharedPosition + ahead;
            if (pos >= this.goalIndex) pos = this.goalIndex - 1;
            if (pos <= this.sharedPosition) pos = this.sharedPosition + 1;

            // randomly choose blink or static, sometimes a moving obstacle
            let r = random();
            if (r < 0.15) {
                this.spawnObstacleSafe(targetWorld, { type: "moving", pos: this.defaultGoalIndex - 1, stepIntervalMs: 95, velocity: -1, bounce: true, minPos: 1, maxPos: this.defaultGoalIndex - 1 });
            } else if (r < 0.65) {
                this.spawnObstacleSafe(targetWorld, { type: "blink", pos, periodMs: 420, onMs: 150 });
            } else {
                this.spawnObstacleSafe(targetWorld, { type: "static", pos });
            }
        }
    }

    spawnObstacleSafe(world, obstacleDef) {
        // avoid spawning on the goal / player, and avoid cross-world overlaps
        let safeDef = { ...obstacleDef };
        safeDef.pos = this.normalizeObstaclePos(world, safeDef.pos);

        this.addObstacle(world, safeDef);
        tryPlay(plopSound);

        // If it spawns on us in the currently visible world (shouldn't), lose
        if (world === this.currentWorld && this.isBlocked(world, this.sharedPosition, millis())) {
            this.lose();
        }
    }

    updateObstacles(now) {
        // blink visibility and moving updates for both worlds
        for (let worldKey of ["A", "B"]) {
            let next = [];
            for (let obstacle of this.obstacles[worldKey]) {
                if (obstacle.type === "moving") {
                    if (obstacle.lastStepAtMs === 0) obstacle.lastStepAtMs = now;
                    if (now - obstacle.lastStepAtMs >= obstacle.stepIntervalMs) {
                        obstacle.lastStepAtMs = now;
                        let proposed = obstacle.pos + obstacle.velocity;

                        // bouncing behavior (end-to-end)
                        if (obstacle.bounce) {
                            let minPos = (obstacle.minPos !== undefined) ? obstacle.minPos : 0;
                            let maxPos = (obstacle.maxPos !== undefined) ? obstacle.maxPos : (displaySize - 2);
                            if (proposed < minPos || proposed > maxPos) {
                                obstacle.velocity = -obstacle.velocity;
                                proposed = obstacle.pos + obstacle.velocity;
                            }
                        }

                        // prevent moving too close to the other world's obstacles
                        if (proposed >= 0 && proposed < this.goalIndex && !this.isNearOtherWorld(worldKey, proposed)) {
                            // also avoid stacking with same-world obstacles
                            if (!this.hasAnyObstacleAt(worldKey, proposed)) obstacle.pos = proposed;
                        }
                    }
                    if (obstacle.pos <= 0) {
                        // allow reaching 0 but don't go negative; keep it, it's still a wall
                        obstacle.pos = 0;
                    }
                }

                // Keep obstacles within bounds
                if (obstacle.pos < 0 || obstacle.pos > this.goalIndex - 1) {
                    continue;
                }

                next.push(obstacle);
            }
            this.obstacles[worldKey] = next;
        }

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