# Finger Spies — A 1D Spy Role-Play Game

> You are secret agents on a mission — but one of you is a double agent hiding in plain sight.
>
> A multiplayer social-deduction game built entirely on a **one-dimensional interface** (a single row of pixels).
>
> Built in the MIT **4.043 Design Studio: Interaction Intelligence** (Prof. Marcelo Coelho), Spring 2026.

---

## Demo

https://github.com/Polpii/Finger-Spies/raw/main/FingerSpies.mp4

<video src="https://github.com/Polpii/Finger-Spies/raw/main/FingerSpies.mp4" controls width="720"></video>

> If the player above does not render, [**download the demo video**](FingerSpies.mp4) (12 MB).

---

## Concept

In Finger Spies, each player is a spy trying to cross a laser corridor from left to right, one pixel at a time. At the start of each round, one player is **secretly assigned as the double agent** (the game master). During the play phase, spies can only move safely when the corridor light is green. The double agent controls the light and can switch it to red at any moment to trap moving players. A spy who moves while the light is red is **eliminated immediately**.

A round ends when only a few spies remain or someone reaches the end of the corridor. Surviving spies then vote: they must agree on who they believe is the double agent. If the spies vote correctly, they win; if they vote for the wrong person, they eliminate an ally and the double agent gains the advantage.

**The entire world is a single row of pixels.** Every movement, bluff, and timing decision is visible — and critical. The game is a study in how a minimal interface can carry a rich social space.

---

## How to play

### 1. Player selection (10 s)

Press your key 3 or more times to join the game. Each color represents a spy:

| Color  | Keys (alternate) |
|--------|------------------|
| Pink   | `S + D`          |
| Blue   | `B + N`          |
| Red    | `O + P`          |
| Yellow | `K + J`          |
| Green  | `C + V`          |

Walk by **alternating your two keys** — like stepping left foot, right foot. Pressing the same key twice in a row does nothing. This forces a small but real "physical" rhythm and makes hesitation legible to other players.

### 2. Play phase — Cross the corridor

- **Green light** → advance pixel by pixel toward the finish line on the right.
- **Red light** → freeze immediately. Any movement = instant elimination.
- The **double agent** controls when the light flips. They will try to lure spies forward, then snap it red to eliminate them.

### 3. Vote phase — Unmask the traitor

After the round ends, surviving spies vote by moving their pixel into a colored zone on the strip. The zone with the most votes wins. **Vote correctly → spies win. Vote wrong → you've eliminated an ally** and the double agent triumphs.

---

## Game flow

```
PLAYER_SELECTION  ──▶  PLAY  ──▶  VOTE  ──▶  WIN (Spies or Double Agent)
       ▲                                              │
       └──────────────────  new round  ───────────────┘
```

The full state machine is implemented in `controller.js` as a single `switch` statement called every frame by `draw()` in `sketch.js`. Each state owns its own update + render code, which keeps the logic readable and the transitions explicit.

---

## Why a 1D interface?

A **1D interface** is a graphical user interface made from a single row of pixels, where it is *not* possible to display symbolic content (text, icons, sprites). Its severity is what makes it interesting:

- pixels can be squares or circles;
- they can be arranged as a row, a column, or a ring;
- pixels cannot move their `(x, y)` position — they can only change color;
- you cannot stack lines into a 2D grid (that would be a different interface entirely).

Working under that constraint forces every design decision — feedback, spatial mapping, relationships, states — into the open. You cannot hide behind text labels or rich animations. That is the pedagogical point of the 4.043 studio: the limits of the medium make the *fundamental ideas* of interaction design visible.

Finger Spies takes that idea and pushes it into a multiplayer social game, where the constraint becomes the *source of tension*: every player's intent is broadcast on the same single strip.

---

## Interface architecture

The codebase separates three concerns:

1. **Interface structure** — state machine, event listeners, frame loop.
2. **Game structure** — player objects, scoring, win conditions, voting logic.
3. **Hardware specifics** — keyboard input today, optional Arduino-based joystick or LED strip output tomorrow.

This separation makes it easy to prototype on a laptop and later swap a `Joystick` driver in or pipe the display buffer to a physical LED strip.

### Logic

| Object        | Role                                                                                          |
|---------------|-----------------------------------------------------------------------------------------------|
| `Player`      | Owns position, color, alive/dead, score; receives `move(direction)` calls from `controller`.   |
| `Controller`  | The main object — wires everything together and owns the state machine.                        |
| `Display`     | Owns the **display buffer** (`displayBuffer[]`) and is the only object that draws on screen.   |
| `Animation`   | Frame-based color animations (collisions, lights, victory).                                    |

### Input

Keyboard events live in `controller.js`:

```js
function keyPressed() {
  if (key === "S" || key === "s" || key === "D" || key === "d") {
    playerPink.step(key);
  }
  // ...one branch per spy color
  if (key === "R" || key === "r") {
    controller.gameState = "PLAYER_SELECTION";
  }
}
```

For physical interfaces, a small Arduino sketch (under `A_Joystick/` and `Helper/`) emits serial messages that map to the same `step()` API, so the rest of the game does not know whether input came from a keyboard or a custom controller.

### Output

Visual output is the only place that writes to the canvas. Frames are built in a buffer, then flushed in one pass:

```js
this.displayBuffer = [];

show() {
  for (let i = 0; i < this.displaySize; i++) {
    fill(this.displayBuffer[i]);
    rect(i * this.pixelSize, 0, this.pixelSize, this.pixelSize);
  }
}
```

That single-writer pattern makes it trivial to redirect the output later (LED strip, projector, etc.) without touching the game logic.

### State machine

```
                 ┌───────────────┐
        ┌───────▶│ PLAYER_SELECT │
        │        └───────┬───────┘
        │                │  ≥ 2 players ready
        │                ▼
        │        ┌───────────────┐
        │        │      PLAY     │
        │        └───────┬───────┘
        │                │  end-of-round trigger
        │                ▼
        │        ┌───────────────┐
        │        │      VOTE     │
        │        └───────┬───────┘
        │                │  votes resolved
        │                ▼
        │        ┌───────────────┐
        └────────│      WIN      │ (Spies / Double Agent)
                 └───────────────┘
```

`Controller.update()` runs once per frame. It dispatches on `this.gameState`, performs the state-local update, and writes the resulting pixel colors into `display.displayBuffer`. State transitions are simple assignments to `this.gameState`.

---

## Getting started

1. Clone the repository (use **GitHub Desktop** if you are new to git):

   ```bash
   git clone https://github.com/Polpii/1DRolePlayGame.git
   ```

2. Open `P5_SpyGame1D/` in [Visual Studio Code](https://code.visualstudio.com/).
3. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension.
4. Open `index.html` and click **Go Live** (bottom right). The game opens on `http://127.0.0.1:5500/`.
5. No camera required — keyboard only.

---

## Stack

- **[p5.js](https://p5js.org/) 1.2.0** + `p5.sound` (canvas + audio)
- **Vanilla JavaScript / HTML / CSS** — no build step
- **Arduino** (optional) — breadboard joystick controllers in `A_Joystick/`, helpers in `Helper/`

---

## Other projects in this repo

The repo also contains a series of related 1D interface experiments produced through the 4.043 studio:

| Folder                      | Description                                                       |
|-----------------------------|-------------------------------------------------------------------|
| `P5_TangibleSquid1D`        | Squid Game-inspired prototype with camera color tracking         |
| `P5_Interface1D`            | Base 1D interface template (single-pixel player + target)        |
| `P5_Inception1D`            | Inception-themed 1D experience                                    |
| `P5_SwitchWorld1D`          | World-switching 1D game                                           |
| `P5_Wood1D`                 | Wood-themed 1D scene                                              |
| `P5_SpyGame1D`              | **Finger Spies** — the main game described above                  |

---

## About 4.043 Design Studio

4.043 — *Design Studio: Interaction Intelligence* (MIT Media Lab) covers the principles and techniques of interaction, behavior, and intelligence across objects and spaces. Students build low- and high-fidelity prototypes deployable to real users. The course covers HCI history, behavior prototyping, physical and graphical user interfaces, machine intelligence, neural networks, and large language models.

More info: [designintelligence.mit.edu](https://designintelligence.mit.edu/)

---

## Contributors

- [@marcelocoelho](https://github.com/marcelocoelho) — Marcelo Coelho (course instructor)
- [@Polpii](https://github.com/Polpii) — Paul-Peter Arslan
- [@marcelocoelhomit](https://github.com/marcelocoelhomit)
