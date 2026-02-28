
// This is where your state machines and game logic lives

// ─── Key mapping: every keyboard key → { playerIdx (0-4), action } ──────────
const KEY_MAP = {
    // Player 1 (Pink) — play: D, CW: E, CCW: C, click: S
    'd': { playerIdx: 0, action: 'play' },
    'e': { playerIdx: 0, action: 'cw' },
    'c': { playerIdx: 0, action: 'ccw' },
    's': { playerIdx: 0, action: 'click' },

    // Player 2 (Blue) — play: L / ArrowRight, CW: ;, CCW: ., click: K
    'l': { playerIdx: 1, action: 'play' },
    ';': { playerIdx: 1, action: 'cw' },
    '.': { playerIdx: 1, action: 'ccw' },
    'k': { playerIdx: 1, action: 'click' },

    // Player 3 (Red) — play: O, CW: P, CCW: I, click: 9
    'o': { playerIdx: 2, action: 'play' },
    'p': { playerIdx: 2, action: 'cw' },
    'i': { playerIdx: 2, action: 'ccw' },
    '9': { playerIdx: 2, action: 'click' },

    // Player 4 (Yellow) — play: J, CW: U, CCW: M, click: H
    'j': { playerIdx: 3, action: 'play' },
    'u': { playerIdx: 3, action: 'cw' },
    'm': { playerIdx: 3, action: 'ccw' },
    'h': { playerIdx: 3, action: 'click' },

    // Player 5 (Green) — play: V, CW: F, CCW: B, click: G
    'v': { playerIdx: 4, action: 'play' },
    'f': { playerIdx: 4, action: 'cw' },
    'b': { playerIdx: 4, action: 'ccw' },
    'g': { playerIdx: 4, action: 'click' },
};

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
        this.voteDurationMs = 45000;
        this.voteCandidates = [];
        this.voteState = new Map();          // player -> { cursorIndex, submittedIndex, submitted }
        this.votePhase = "VOTING";           // "VOTING" | "RESULT_BLINK"
        this.voteResultPlayer = null;
        this.voteNoElimination = false;
        this.voteBlinkStartAt = 0;
        this.voteBlinkDurationMs = 1800;     // 3 blinks × 600ms

        // win fades (retro)
        this.fadeOutMs = 450;
        this.fadeInMs = 650;
        this.winStartAt = 0;
        this.winType = null;                  // 'GM' | 'PLAYERS'
        this.winColors = [];

        // GM finish deadline: 30s after GM reaches the finish line
        this.gmFinishedAt = 0;
        this.gmDeadlineMs = 30000;

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

                // Track when the GM reaches the finish line
                this.checkGmDeadline();

                // Round ends when ALL survivors reach the target
                if (this.haveAllSurvivorsFinished()) {
                    const alive = this.getAlivePlayers();
                    const gm = this.getGameMasterPlayer();

                    // If a round ends with GM + 1 other (or less), GM wins.
                    if (gm && alive.includes(gm) && alive.length <= 1) {
                        this.enterWin("GM");
                    } else {
                        this.startVote();
                    }
                }

                break;

            case "VOTE":
                display.clear();
                if (this.votePhase === "VOTING") {
                    this.drawVoteTimerStrip();
                    if (millis() - this.voteStartAt >= this.voteDurationMs) {
                        this.countVotesAndStartBlink();
                    }
                } else if (this.votePhase === "RESULT_BLINK") {
                    this.drawVoteResultBlink();
                    if (millis() - this.voteBlinkStartAt >= this.voteBlinkDurationMs) {
                        this.finalizeVoteResult();
                    }
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

    checkGmDeadline() {
        const gm = this.getGameMasterPlayer();
        if (!gm) return;

        // Record the moment the GM first reaches the finish line
        if (gm.position >= this.lightIndex && this.gmFinishedAt === 0) {
            this.gmFinishedAt = millis();
        }

        // If 30s have passed since GM finished, eliminate everyone who hasn't finished
        if (this.gmFinishedAt > 0 && millis() - this.gmFinishedAt >= this.gmDeadlineMs) {
            for (let p of this.getAlivePlayers()) {
                if (p.position < this.lightIndex) {
                    this.eliminatePlayer(p);
                }
            }
        }
    }

    startVote() {
        this.gameState = "VOTE";
        this.voteStartAt = millis();
        this.voteCandidates = this.getAlivePlayers();
        this.votePhase = "VOTING";
        this.voteResultPlayer = null;
        this.voteNoElimination = false;
        this.voteBlinkStartAt = 0;

        // Build vote state per alive player
        this.voteState = new Map();
        for (let p of this.voteCandidates) {
            this.voteState.set(p, { cursorIndex: 0, submittedIndex: -1, submitted: false });
        }

        // Make sure the light does not matter during vote
        this.lightState = "GO";
        this.redSoundPending = false;
        if (redSound && redSound.isPlaying()) redSound.stop();
        if (greenSound && greenSound.isPlaying()) greenSound.stop();
    }

    moveVoteCursor(player, delta) {
        if (!player) return;
        if (this.votePhase !== "VOTING") return;
        const vs = this.voteState.get(player);
        if (!vs || vs.submitted) return;
        const n = this.voteCandidates.length; // candidates = vote targets
        let next = (vs.cursorIndex + delta) % n;
        if (next < 0) next += n;
        vs.cursorIndex = next;
    }

    submitVote(player) {
        if (!player) return;
        if (this.votePhase !== "VOTING") return;
        const vs = this.voteState.get(player);
        if (!vs || vs.submitted) return;
        vs.submitted = true;
        vs.submittedIndex = vs.cursorIndex;
    }

    drawVoteTimerStrip() {
        const elapsed = millis() - this.voteStartAt;
        const fraction = Math.min(1, elapsed / this.voteDurationMs);
        const litCount = Math.round(displaySize * (1 - fraction));
        const blendColor = this.computeVoteBlendColor();
        for (let i = 0; i < litCount; i++) {
            display.setPixel(i, blendColor);
        }
    }

    computeVoteBlendColor() {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let [_player, vs] of this.voteState) {
            if (!vs.submitted) continue;
            const target = this.voteCandidates[vs.submittedIndex];
            if (!target) continue;
            const c = target.playerColor;
            rSum += red(c);
            gSum += green(c);
            bSum += blue(c);
            count++;
        }
        if (count === 0) return color(255, 255, 255); // white if no votes
        return color(Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count));
    }

    countVotesAndStartBlink() {
        const candidates = this.voteCandidates;
        const tallies = new Array(candidates.length).fill(0);

        for (let [_player, vs] of this.voteState) {
            if (!vs.submitted) continue;
            const idx = vs.submittedIndex;
            if (idx >= 0 && idx < tallies.length) {
                tallies[idx]++;
            }
        }

        // Find plurality winner
        let maxCount = 0, maxIdx = -1, tie = false;
        for (let i = 0; i < tallies.length; i++) {
            if (tallies[i] > maxCount) {
                maxCount = tallies[i];
                maxIdx = i;
                tie = false;
            } else if (tallies[i] === maxCount && tallies[i] > 0) {
                tie = true;
            }
        }

        if (tie || maxCount === 0) {
            this.voteNoElimination = true;
            this.voteResultPlayer = null;
        } else {
            this.voteNoElimination = false;
            this.voteResultPlayer = candidates[maxIdx];
        }

        this.votePhase = "RESULT_BLINK";
        this.voteBlinkStartAt = millis();
    }

    drawVoteResultBlink() {
        const elapsed = millis() - this.voteBlinkStartAt;
        // 3 on/off cycles: each 300ms on, 300ms off = 600ms per cycle
        const phase = Math.floor(elapsed / 300) % 2; // 0 = on, 1 = off
        if (phase === 0) {
            let blinkColor;
            if (this.voteNoElimination) {
                blinkColor = color(60, 60, 60); // dim gray for tie / no votes
            } else if (this.voteResultPlayer) {
                blinkColor = this.voteResultPlayer.playerColor;
            } else {
                blinkColor = color(60, 60, 60);
            }
            display.setAllPixels(blinkColor);
        }
        // phase 1 = off (strip stays black from display.clear())
    }

    finalizeVoteResult() {
        // Eliminate the voted-out player (if any)
        if (!this.voteNoElimination && this.voteResultPlayer) {
            this.eliminatePlayer(this.voteResultPlayer);
            // If GM was eliminated, we already entered win state
            if (this.gameState !== "VOTE") return;
        }

        // If after the vote only GM + 1 other (or less) remains, GM wins.
        const aliveAfter = this.getAlivePlayers();
        const gm = this.getGameMasterPlayer();
        if (gm && aliveAfter.includes(gm) && aliveAfter.length <= 1) {
            this.enterWin("GM");
            return;
        }

        // Transition to next PLAY round
        this.gameState = "PLAY";
        this.lightState = "STOP";
        this.redSoundPending = false;
        this.nextSwitchAt = 0;
        this.gmFinishedAt = 0;
        if (redSound && redSound.isPlaying()) redSound.stop();
        if (greenSound && greenSound.isPlaying()) greenSound.stop();

        // Reset initial sequence flags for the new round
        this.initialSequenceStarted = false;
        this.initialSequenceDone = false;
        this.initialGreenStarted = false;
        this.initialGreenAt = 0;

        // Reset survivor positions for the new round
        for (let p of this.getAlivePlayers()) {
            p.position = 0;
        }

        // Clear vote state
        this.voteStartAt = 0;
        this.voteCandidates = [];
        this.voteState = new Map();
        this.votePhase = "VOTING";

        // Reset GM motion so it doesn't instantly turn red
        this.gmLastMotionAt = millis();
        this.stopStartedAt = 0;
        if (typeof gameMasterTracker !== 'undefined' && gameMasterTracker) {
            gameMasterTracker.lastMotionAt = this.gmLastMotionAt;
        }
    }

    getVoteSecondsLeft() {
        if (this.gameState !== "VOTE") return 0;
        const msLeft = Math.max(0, this.voteDurationMs - (millis() - this.voteStartAt));
        return Math.ceil(msLeft / 1000);
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
        this.gmFinishedAt           = 0;
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
        this.voteState = new Map();
        this.votePhase = "VOTING";
        this.voteResultPlayer = null;
        this.voteNoElimination = false;
        this.voteBlinkStartAt = 0;

        this.winStartAt = 0;
        this.winType = null;
        this.winColors = [];

        this.initialGreenStarted = false;
        this.initialSequenceStarted = false;
        this.initialSequenceDone = false;
        this.initialGreenAt = 0;
        this.gmFinishedAt = 0;

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




// Handle a play-key press during PLAY state
function handlePlayMovement(p) {
    if (!p || p.eliminated || p.active === false) return;
    if (p.position >= controller.lightIndex) return;

    if (controller.canMoveNow()) {
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

    // Normalize key: ArrowRight maps to 'l' (Player 2 play), lowercase everything
    let k = key;
    if (k === 'ArrowRight') k = 'l';
    k = k.toLowerCase();

    // R — reset to player selection (always available)
    if (k === 'r') {
        controller.resetGame();
        return;
    }

    // T — skip straight to vote with all players active (debug shortcut)
    if (k === 't') {
        for (let p of controller.getAllPlayers()) {
            if (!p) continue;
            p.active = true;
            p.eliminated = false;
            p.position = 0;
        }
        // Pick a random game master if none set
        const all = controller.getAllPlayers().filter(p => p);
        if (typeof gameMasterPlayer !== 'undefined') {
            gameMasterPlayer = all[Math.floor(Math.random() * all.length)];
        }
        controller.startVote();
        return;
    }

    // Look up in KEY_MAP
    const mapping = KEY_MAP[k];
    if (!mapping) return;

    const { playerIdx, action } = mapping;
    const players = controller.getAllPlayers();
    const p = players[playerIdx];
    if (!p) return;

    const inSelection = controller.gameState === "PLAYER_SELECTION";
    const inPlay      = controller.gameState === "PLAY";
    const inVote      = controller.gameState === "VOTE";

    // ── PLAYER_SELECTION: only play keys advance ──
    if (inSelection) {
        if (action === 'play') {
            p.move(1);
        }
        return;
    }

    // ── PLAY: only play keys (both physical buttons send play) ──
    if (inPlay) {
        if (action === 'play') {
            handlePlayMovement(p);
        }
        // encoder keys ignored during PLAY
        return;
    }

    // ── VOTE: play/cw/ccw cycle cursor, click submits ──
    if (inVote && controller.votePhase === "VOTING") {
        if (p.eliminated || p.active === false) return;

        if (action === 'play' || action === 'cw') {
            controller.moveVoteCursor(p, 1);
        } else if (action === 'ccw') {
            controller.moveVoteCursor(p, -1);
        } else if (action === 'click') {
            controller.submitVote(p);
        }
    }
}