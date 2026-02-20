
// This is where your state machines and game logic lives


class Controller {

    // This is the state we start with.
    constructor() {
        this.gameState = "PLAYER_SELECTION";
        this.lightState = "STOP";             // Start on red, then auto-switch to GO
        this.lightIndex = displaySize - 1;     // rightmost pixel is both the light + finish line

        // First green light should start automatically (not triggered by GM).
        // Audio will actually play only once the browser is unlocked.
        this.initialGreenStarted = false;

        // Initial sequence: RED -> GREEN automatically, without GM motion.
        this.initialSequenceStarted = false;
        this.initialSequenceDone = false;
        this.initialGreenAt = 0;

        // game master driven light
        this.gmStillMs = 250;                 // if GM hasn't moved for this long -> red
        this.gmLastMotionAt = 0;              // updated from camera/key

        // anti-loop latch: after red->green, GM must advance >= 1 cell before we allow red again
        this.requireGmStepBeforeNextRed = false;
        this.gmHasSteppedSinceGreen = false;
        this.gmMotionDuringRed = false;

        // sound end bookkeeping (events come from sketch.js)
        this.redEndedAt = 0;

        // When red is triggered by green ending, enforce a minimum red du1ration
        this.redHoldUntil = 0;

        // Grace time to let players stop after red light turns on (ms)
        this.stopGraceMs = 750;
        this.stopGraceUntil = 0;

        // legacy fields kept for compatibility with older code paths
        this.nextSwitchAt = 0;
        this.redGraceUntil = 0;
        this.redGraceMs = 0;
        this.stopUntil = 0;
        this.stopStartedAt = 0;
        this.stopMinMs = 0;
        this.stopMaxMs = 0;
        this.stopMaxHardMs = 0;
        this.redGoDelayMs = 0;
        this.redSoundPending = false;

        // vote
        this.voteStartAt = 0;
        this.voteDurationMs = 30000;
        this.voteZoneSize = 3;
        this.voteCandidates = [];

        // win fades (retro)
        this.fadeOutMs = 450;
        this.fadeInMs = 650;
        this.winStartAt = 0;
        this.winType = null;                  // 'GM' | 'PLAYERS'
        this.winColors = [];

        // player selection
        this.selectionDurationMs = 10000;
        this.selectionStartAt    = 0;
        this.selectionStarted    = false;
        this.selectionThreshold  = 3;         // cells to advance to join
    }
    
    // This is called from draw() in sketch.js with every frame
    update() {

        // STATE MACHINE ////////////////////////////////////////////////
        // This is where your game logic lives
        /////////////////////////////////////////////////////////////////
        switch(this.gameState) {

            // ── Player selection: 10 s to press your key 3+ times ──────────────
            case "PLAYER_SELECTION":
                display.clear();
                if (!this.selectionStarted) {
                    this.selectionStartAt = millis();
                    this.selectionStarted = true;
                }
                this.drawSelectionScreen();
                if (millis() - this.selectionStartAt >= this.selectionDurationMs) {
                    this.finalizeSelection();
                }
                break;

            // This is the main game state, where the playing actually happens
            case "PLAY":

                // Start on RED, then switch to GREEN automatically (no GM movement required).
                this.runInitialSequence();

                // Ensure first GO sound starts as soon as audio is unlocked.
                this.ensureInitialGreenLightStarted();

                // clear screen at frame rate so we always start fresh
                display.clear();

                // update the light state (cyan/red)
                this.updateLight();

                // draw the light on the right
                display.setPixel(this.lightIndex, this.lightColor());

                // show players (with 1s alternation if multiple share the same cell)
                this.drawPlayersAlternating();

                // Round ends when ALL survivors reach the target
                if (this.haveAllSurvivorsFinished()) {
                    const alive = this.getAlivePlayers();
                    const gm = this.getGameMasterPlayer();

                    // If a round ends with GM + 1 other (or less), GM wins.
                    if (gm && alive.includes(gm) && alive.length <= 2) {
                        this.enterWin("GM");
                    } else {
                        this.startVote();
                    }
                }

                break;

            case "VOTE":
                display.clear();
                this.drawVoteBackground();
                this.clampPlayersToVoteStrip();
                this.drawPlayersAlternating();

                if (millis() - this.voteStartAt >= this.voteDurationMs) {
                    this.finishVote();
                }
                break;

            case "WIN_FADE_OUT":
                // Draw the last play frame and fade to black via sketch overlay
                display.clear();
                display.setPixel(this.lightIndex, this.lightColor());
                this.drawPlayersAlternating();

                if (millis() - this.winStartAt >= this.fadeOutMs) {
                    this.gameState = "WIN_FADE_IN";
                    this.winStartAt = millis();
                }
                break;

            case "WIN_FADE_IN":
                this.drawWinScreen(true);
                if (millis() - this.winStartAt >= this.fadeInMs) {
                    this.gameState = (this.winType === "PLAYERS") ? "PLAYERS_WIN" : "GM_WIN";
                }
                break;

            case "PLAYERS_WIN":
                this.drawWinScreen(false);
                break;

            case "GM_WIN":
                this.drawWinScreen(false);
                break;

            // Not used, it's here just for code compliance
            default:
                break;
        }
    }

    runInitialSequence() {
        if (this.initialSequenceDone) return;
        if (this.gameState !== "PLAY") return;

        const now = millis();
        if (!this.initialSequenceStarted) {
            this.initialSequenceStarted = true;
            this.lightState = "STOP";
            this.redEndedAt = 0;
            this.gmMotionDuringRed = false;
            // Give players an initial grace window so camera noise doesn't insta-kill on frame 1.
            this.stopGraceUntil = now + (this.stopGraceMs || 0);
            // Switch to green quickly without any movement.
            this.initialGreenAt = now + 650;
            if (greenSound && greenSound.isPlaying()) greenSound.stop();
            if (redSound && redSound.isPlaying()) redSound.stop();
            return;
        }

        if (this.lightState === "STOP" && now >= this.initialGreenAt) {
            this.enterGreenLight(true);
            this.initialSequenceDone = true;
        }
    }

    ensureInitialGreenLightStarted() {
        if (this.initialGreenStarted) return;
        if (this.gameState !== "PLAY") return;
        if (this.lightState !== "GO") return;

        // If sound is already playing, we're good.
        if (greenSound && greenSound.isPlaying && greenSound.isPlaying()) {
            this.initialGreenStarted = true;
            return;
        }

        // Browsers block audio until first interaction.
        if (typeof audioUnlocked === 'undefined' || !audioUnlocked) return;

        tryPlay(greenSound);
        if (greenSound && greenSound.isPlaying && greenSound.isPlaying()) {
            this.initialGreenStarted = true;
        }
    }

    updateLight() {
        const now = millis();

        // If the game master already finished the race, control the light randomly.
        if (this.shouldUseRandomLight()) {
            this.updateLightRandom(now);
            return;
        }

        // STOP (red): go back to GO if GM moves OR when red.wav ends
        if (this.lightState === "STOP") {
            // Enforce minimum red duration (mainly after green_end)
            if (this.redHoldUntil && now < this.redHoldUntil) return;
            if (this.gmMotionDuringRed) {
                this.enterGreenLight(true);
                return;
            }
            if (this.redEndedAt > 0 && now >= this.redEndedAt) {
                this.enterGreenLight(true);
                return;
            }
            return;
        }

        // GO (cyan): do NOT allow red again until GM advanced at least 1 cell after last red->green
        if (this.requireGmStepBeforeNextRed && !this.gmHasSteppedSinceGreen) {
            return;
        }

        // GM stopped -> red
        const lastMotionAt = this.getGameMasterLastMotionAt();
        if (lastMotionAt > 0 && (now - lastMotionAt) > this.gmStillMs) {
            this.enterRedLight("gm_stop");
        }
    }

    onRedSoundEnded() {
        if (this.gameState !== "PLAY") return;
        if (this.lightState !== "STOP") return;
        if (this.shouldUseRandomLight()) return;
        // Mark ended; updateLight() will switch to GO on next frame
        this.redEndedAt = millis();
    }

    getRenderablePlayers() {
        // In PLAY: players that reached the light disappear (so they don't hide the light)
        if (this.gameState === "PLAY") {
            return this.getAlivePlayers().filter(p => p && p.position < this.lightIndex);
        }
        return this.getAlivePlayers();
    }

    onGreenSoundEnded() {
        if (this.gameState !== "PLAY") return;
        if (this.lightState !== "GO") return;
        if (this.shouldUseRandomLight()) return;

        // green.wav reaching the end also triggers red light
        this.enterRedLight("green_end");
    }

    enterRedLight(_reason) {
        if (this.gameState !== "PLAY") return;
        if (this.lightState === "STOP") return;

        // Enforce anti-loop latch
        if (this.requireGmStepBeforeNextRed && !this.gmHasSteppedSinceGreen) {
            // Allow red when green sound ends, even if GM didn't step, so green cannot stay infinite.
            if (_reason !== "green_end") return;
        }

        this.lightState = "STOP";
        this.redEndedAt = 0;
        this.gmMotionDuringRed = false;

        // Let players have time to stop after red turns on
        this.stopGraceUntil = millis() + (this.stopGraceMs || 0);

        // If red is triggered by green ending, hold at least 1s in red
        this.redHoldUntil = (_reason === "green_end") ? (millis() + 1500) : 0;

        if (greenSound && greenSound.isPlaying()) greenSound.stop();
        tryPlay(redSound); // play red ONCE on transition
    }

    enterGreenLight(_fromRed) {
        if (this.gameState !== "PLAY") return;

        this.lightState = "GO";
        this.redEndedAt = 0;
        this.gmMotionDuringRed = false;
        this.stopGraceUntil = 0;

        if (_fromRed) {
            this.requireGmStepBeforeNextRed = true;
            this.gmHasSteppedSinceGreen = false;
        }

        this.redHoldUntil = 0;

        // Prevent instant re-trigger if GM stays still
        const now = millis();
        this.gmLastMotionAt = now;
        if (typeof gameMasterTracker !== 'undefined' && gameMasterTracker) {
            gameMasterTracker.lastMotionAt = now;
        }

        if (redSound && redSound.isPlaying()) redSound.stop();
        tryPlay(greenSound);
    }

    updateLightRandom(now) {
        // Random toggle independent from audio onended
        if (this.nextSwitchAt === 0) {
            this.nextSwitchAt = now + this.randomDurationMs(this.lightState);
        }

        if (now < this.nextSwitchAt) return;

        if (this.lightState === "GO") {
            this.lightState = "STOP";
            this.redEndedAt = 0;
            this.gmMotionDuringRed = false;
            this.stopGraceUntil = now + (this.stopGraceMs || 0);
            if (greenSound && greenSound.isPlaying()) greenSound.stop();
            tryPlay(redSound);
        } else {
            this.lightState = "GO";
            this.redEndedAt = 0;
            this.stopGraceUntil = 0;
            if (redSound && redSound.isPlaying()) redSound.stop();
            tryPlay(greenSound);
        }

        this.nextSwitchAt = now + this.randomDurationMs(this.lightState);
    }

    randomDurationMs(state) {
        if (state === "GO") return random(900, 4500);
        return random(600, 4500);
    }

    shouldUseRandomLight() {
        // Random mode when GM is finished.
        const gm = this.getGameMasterPlayer();
        if (!gm) return true;
        if (this.gameState !== "PLAY") return false;

        const gmFinished = gm.position >= this.lightIndex;
        if (gmFinished) return true;

        return false;
    }

    lightColor() {
        if (this.lightState === "GO") return color(0, 255, 255);
        return color(255, 0, 0);
    }

    canMoveNow() {
        return (this.lightState === "GO");
    }

    isStopGraceActive() {
        if (this.lightState !== "STOP") return false;
        return (this.stopGraceUntil && millis() < this.stopGraceUntil);
    }

    noteMotionForPlayer(_player) {
        if (!_player) return;
        const gm = this.getGameMasterPlayer();
        if (_player === gm) {
            this.gmLastMotionAt = millis();
            if (this.lightState === "STOP") {
                this.gmMotionDuringRed = true;
            }
        }
    }

    noteStepForPlayer(_player) {
        if (!_player) return;
        const gm = this.getGameMasterPlayer();
        if (_player === gm && this.lightState === "GO") {
            this.gmHasSteppedSinceGreen = true;
        }
    }

    getGameMasterPlayer() {
        if (typeof gameMasterPlayer !== 'undefined' && gameMasterPlayer) return gameMasterPlayer;
        if (typeof playerThree !== 'undefined' && playerThree) return playerThree;
        return null;
    }

    getGameMasterLastMotionAt() {
        // Prefer camera tracker if present
        if (typeof gameMasterTracker !== 'undefined' && gameMasterTracker && gameMasterTracker.lastMotionAt) {
            return Math.max(this.gmLastMotionAt || 0, gameMasterTracker.lastMotionAt || 0);
        }
        return this.gmLastMotionAt || 0;
    }

    getAlivePlayers() {
        return this.getAllPlayers().filter(p => p && !p.eliminated && p.active !== false);
    }

    eliminatePlayer(_player) {
        if (!_player) return;
        if (_player.eliminated) return;

        // Players who already reached the target cannot be eliminated.
        if (this.gameState === "PLAY" && _player.position >= this.lightIndex) {
            return;
        }

        // Game master cannot die during a round.
        if (this.gameState === "PLAY" && _player === this.getGameMasterPlayer()) {
            return;
        }

        _player.eliminated = true;
        _player.position = 0;
        tryPlay(shotSound);

        // If the eliminated player is the game master, players win.
        if (_player === this.getGameMasterPlayer()) {
            this.enterWin("PLAYERS");
            return;
        }
    }

    haveAllSurvivorsFinished() {
        const alive = this.getAlivePlayers();
        if (alive.length === 0) return false;
        for (let p of alive) {
            if (p.position < this.lightIndex) return false;
        }
        return true;
    }

    startVote() {
        this.gameState = "VOTE";
        this.voteStartAt = millis();
        this.voteCandidates = this.getAlivePlayers();

        // Reset positions for voting strip
        for (let p of this.voteCandidates) {
            p.position = 0;
        }

        // Make sure the light does not matter during vote
        this.lightState = "GO";
        this.redSoundPending = false;
        if (redSound && redSound.isPlaying()) redSound.stop();
    }

    getVoteSecondsLeft() {
        if (this.gameState !== "VOTE") return 0;
        const msLeft = Math.max(0, this.voteDurationMs - (millis() - this.voteStartAt));
        return Math.ceil(msLeft / 1000);
    }

    voteCellCount() {
        const n = (this.voteCandidates && this.voteCandidates.length) ? this.voteCandidates.length : 0;
        // +1 neutral start cell (index 0)
        return Math.min(displaySize, 1 + n * this.voteZoneSize);
    }

    moveVotePlayer(_player, _delta) {
        if (!_player) return;
        if (this.gameState !== "VOTE") return;
        const len = this.voteCellCount();
        if (len <= 0) return;

        let next = (_player.position + _delta) % len;
        if (next < 0) next += len;
        _player.position = next;
    }

    clampPlayersToVoteStrip() {
        if (this.gameState !== "VOTE") return;
        const maxPos = Math.max(0, this.voteCellCount() - 1);
        for (let p of this.getAlivePlayers()) {
            if (!p) continue;
            // Movement in vote should wrap via moveVotePlayer(); this is only a safety clamp.
            if (p.position > maxPos) p.position = 0;
            if (p.position < 0) p.position = 0;
        }
    }

    drawVoteBackground() {
        const cells = this.voteCellCount();
        const candidates = this.voteCandidates || [];
        const a = 80;

        // Neutral start cell
        if (cells > 0) {
            display.setPixel(0, color(80, 80, 80, 120));
        }

        // Background: 3 pixels per remaining player (semi-transparent)
        for (let i = 1; i < cells; i++) {
            const idx = Math.floor((i - 1) / this.voteZoneSize);
            const p = candidates[idx];
            if (!p) continue;
            const c = p.playerColor;
            display.setPixel(i, color(red(c), green(c), blue(c), a));
        }
    }

    finishVote() {
        const candidates = this.voteCandidates || [];
        if (candidates.length === 0) {
            this.gameState = "PLAY";
            return;
        }

        const zoneCounts = new Array(candidates.length).fill(0);
        const alive = this.getAlivePlayers();
        const cells = this.voteCellCount();
        const maxPos = Math.max(0, cells - 1);

        // Count how many players are in each zone
        for (let p of alive) {
            if (!p) continue;
            const pos = Math.min(maxPos, Math.max(0, p.position));
            // Neutral cell (0) = abstain
            if (pos === 0) continue;
            const zone = Math.min(candidates.length - 1, Math.floor((pos - 1) / this.voteZoneSize));
            zoneCounts[zone] += 1;
        }

        // Find unique max
        let maxCount = -1;
        let maxIdx = -1;
        let tie = false;
        for (let i = 0; i < zoneCounts.length; i++) {
            const c = zoneCounts[i];
            if (c > maxCount) {
                maxCount = c;
                maxIdx = i;
                tie = false;
            } else if (c === maxCount) {
                tie = true;
            }
        }

        if (!tie && maxIdx >= 0 && maxCount > 0) {
            // The zone with most players is eliminated
            this.eliminatePlayer(candidates[maxIdx]);
            // If GM was eliminated, we already entered win state - don't continue
            if (this.gameState !== "VOTE") return;
        }

        // If after the vote only GM + 1 other (or less) remains, GM wins.
        const aliveAfter = this.getAlivePlayers();
        const gm = this.getGameMasterPlayer();
        if (gm && aliveAfter.includes(gm) && aliveAfter.length <= 2) {
            this.enterWin("GM");
            return;
        }

        // Next round
        this.gameState = "PLAY";
        this.lightState = "GO";
        this.redSoundPending = false;
        this.nextSwitchAt = 0;
        if (redSound && redSound.isPlaying()) redSound.stop();
        if (greenSound && greenSound.isPlaying()) greenSound.stop();
        tryPlay(greenSound);

        // Reset survivor positions for the new round
        for (let p of this.getAlivePlayers()) {
            p.position = 0;
        }

        // Reset vote state
        this.voteStartAt = 0;
        this.voteCandidates = [];

        // Reset GM motion so it doesn't instantly turn red
        this.gmLastMotionAt = millis();
        this.stopStartedAt = 0;
        if (typeof gameMasterTracker !== 'undefined' && gameMasterTracker) {
            gameMasterTracker.lastMotionAt = this.gmLastMotionAt;
        }
    }

    enterWin(_type) {
        this.winType = _type;
        this.winColors = this.computeWinColors(_type);
        this.gameState = "WIN_FADE_OUT";
        this.winStartAt = millis();
        this.redSoundPending = false;
        if (greenSound && greenSound.isPlaying()) greenSound.stop();
        if (redSound && redSound.isPlaying()) redSound.stop();
    }

    computeWinColors(_type) {
        const gm = this.getGameMasterPlayer();
        const alive = this.getAlivePlayers();

        if (_type === "GM") {
            // GM wins: show ONLY the game master's pixel.
            return (gm && gm.playerColor) ? [gm.playerColor] : [];
        }

        // PLAYERS win: show ALL players (even eliminated) EXCEPT the game master
        return this.getAllPlayers().filter(p => p && p !== gm).map(p => p.playerColor);
    }

    drawWinScreen(_fadingIn) {
        display.clear();
        // black background (strip stays single-line)
        for (let i = 0; i < displaySize; i++) {
            display.setPixel(i, color(0, 0, 0));
        }

        const a = _fadingIn ? this.getWinMessageAlpha() : 255;
        const colors = this.winColors || [];
        const n = colors.length;
        if (n === 0) return;

        // Place winner pixels on the left, with 1 pixel spacing (keeps message readable)
        let start = 2;

        for (let i = 0; i < n; i++) {
            const x = start + i * 2;
            const c = colors[i];
            display.setPixel(x, color(red(c), green(c), blue(c), a));
        }
    }

    getFadeBlackAlpha() {
        if (this.gameState !== "WIN_FADE_OUT") return 0;
        const t = Math.min(1, Math.max(0, (millis() - this.winStartAt) / this.fadeOutMs));
        return Math.floor(255 * t);
    }

    getWinMessageAlpha() {
        if (this.gameState === "WIN_FADE_IN") {
            const t = Math.min(1, Math.max(0, (millis() - this.winStartAt) / this.fadeInMs));
            return Math.floor(255 * t);
        }
        if (this.gameState === "PLAYERS_WIN" || this.gameState === "GM_WIN") return 255;
        return 0;
    }

    getAllPlayers() {
        // Prefer the global array created in sketch.js for stable ordering
        if (typeof allPlayers !== 'undefined' && Array.isArray(allPlayers) && allPlayers.length > 0) {
            return allPlayers;
        }
        // Fallback (older sketches)
        let ps = [];
        if (typeof playerOne !== 'undefined') ps.push(playerOne);
        if (typeof playerTwo !== 'undefined') ps.push(playerTwo);
        if (typeof playerThree !== 'undefined') ps.push(playerThree);
        if (typeof playerFour !== 'undefined') ps.push(playerFour);
        if (typeof playerFive !== 'undefined') ps.push(playerFive);
        return ps;
    }

    // ─── Player Selection methods ─────────────────────────────────────────────

    drawSelectionScreen() {
        const threshold = this.selectionThreshold;
        // Dim marker at cell threshold-1: shows the target line
        if (threshold - 1 >= 0 && threshold - 1 < displaySize) {
            display.setPixel(threshold - 1, color(60, 60, 60));
        }
        // Draw each player at their current position
        for (let p of this.getAllPlayers()) {
            if (!p) continue;
            const c = p.playerColor;
            display.setPixel(p.position, color(red(c), green(c), blue(c)));
        }
    }

    finalizeSelection() {
        const threshold = this.selectionThreshold;
        let activePlayers = [];

        for (let p of this.getAllPlayers()) {
            if (!p) continue;
            if (p.position >= threshold) {
                p.active = true;
                activePlayers.push(p);
            } else {
                p.active = false;
            }
            p.position  = 0;
            p.eliminated = false;
        }

        // Fallback: if nobody moved, everyone plays
        if (activePlayers.length === 0) {
            for (let p of this.getAllPlayers()) { if (p) { p.active = true; activePlayers.push(p); } }
        }

        // Pick game master randomly from active players
        if (typeof gameMasterPlayer !== 'undefined') {
            gameMasterPlayer = activePlayers[Math.floor(Math.random() * activePlayers.length)];
            if (typeof gameMasterTracker !== 'undefined') gameMasterTracker = null;
        }

        // Transition to PLAY
        this.gameState              = "PLAY";
        this.lightState             = "STOP";
        this.selectionStarted       = false;
        this.initialSequenceStarted = false;
        this.initialSequenceDone    = false;
        this.initialGreenStarted    = false;
        this.initialGreenAt         = 0;
        this.gmLastMotionAt         = millis();
    }

    getSelectionSecondsLeft() {
        if (this.gameState !== "PLAYER_SELECTION") return 0;
        const msLeft = Math.max(0, this.selectionDurationMs - (millis() - this.selectionStartAt));
        return Math.ceil(msLeft / 1000);
    }

    drawPlayersAlternating() {
        const now = millis();
        const players = this.getRenderablePlayers();
        if (!players || players.length === 0) return;

        // Group by position
        let byPos = new Map();
        for (let p of players) {
            if (!p) continue;
            const pos = p.position;
            if (!byPos.has(pos)) byPos.set(pos, []);
            byPos.get(pos).push(p);
        }

        // Render each occupied position
        for (let [pos, ps] of byPos.entries()) {
            if (!ps || ps.length === 0) continue;

            if (ps.length === 1) {
                display.setPixel(pos, ps[0].playerColor);
            } else {
                // 1 second per player: cycle through players in stable order
                const idx = Math.floor(now / 1000) % ps.length;
                display.setPixel(pos, ps[idx].playerColor);
            }
        }
    }

    resetGame() {
        this.gameState = "PLAYER_SELECTION";
        this.selectionStarted = false;
        this.selectionStartAt = 0;
        this.lightState = "STOP";
        this.redSoundPending = false;
        this.redGraceUntil = 0;
        this.stopUntil = 0;
        this.stopStartedAt = 0;
        this.nextSwitchAt = 0;
        this.voteStartAt = 0;
        this.voteCandidates = [];

        this.winStartAt = 0;
        this.winType = null;
        this.winColors = [];

        this.initialGreenStarted = false;
        this.initialSequenceStarted = false;
        this.initialSequenceDone = false;
        this.initialGreenAt = 0;

        for (let p of this.getAllPlayers()) {
            if (!p) continue;
            p.position = 0;
            p.eliminated = false;
            p.active = true;
        }

        this.gmLastMotionAt = millis();
        if (typeof gameMasterTracker !== 'undefined' && gameMasterTracker) {
            gameMasterTracker.lastMotionAt = this.gmLastMotionAt;
        }

        if (greenSound && greenSound.isPlaying()) greenSound.stop();
        if (redSound && redSound.isPlaying()) redSound.stop();
    }
}




// This function gets called when a key on the keyboard is pressed
function keyPressed() {

    // Unlock audio on first interaction
    if (!audioUnlocked) {
        audioUnlocked = true;
        userStartAudio();
        if (controller && controller.gameState === "PLAY" && controller.lightState === "GO") {
            tryPlay(greenSound);
        }
    }

    const inSelection = controller.gameState === "PLAYER_SELECTION";
    const inPlay      = controller.gameState === "PLAY";
    const inVote      = controller.gameState === "VOTE";

    // Helper: handle a player key during PLAY / VOTE
    function doPlay(p) {
        if (!p || p.eliminated || p.active === false) return;
        if (inPlay && p.position >= controller.lightIndex) return;
        if (inVote) {
            controller.moveVotePlayer(p, 1);
            controller.noteMotionForPlayer(p);
        } else if (controller.canMoveNow()) {
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

    // Player 1 (Pink) — D
    if (key == 'D' || key == 'd') {
        if (inSelection) playerOne.move(1);
        else if (inPlay || inVote) doPlay(playerOne);
    }

    // Player 2 (Blue) — L / ArrowRight
    if (key == 'L' || key == 'l' || key === 'ArrowRight') {
        if (inSelection) playerTwo.move(1);
        else if (inPlay || inVote) doPlay(playerTwo);
    }

    // Player 3 (Red) — O
    if (key == 'O' || key == 'o') {
        if (inSelection) playerThree.move(1);
        else if (inPlay || inVote) doPlay(playerThree);
    }

    // Player 4 (Yellow) — J
    if (key == 'J' || key == 'j') {
        if (inSelection) playerFour.move(1);
        else if (inPlay || inVote) doPlay(playerFour);
    }

    // Player 5 (Green) — V
    if (key == 'V' || key == 'v') {
        if (inSelection) playerFive.move(1);
        else if (inPlay || inVote) doPlay(playerFive);
    }

    // R — reset to player selection
    if (key == 'R' || key == 'r') {
        controller.resetGame();
    }
}