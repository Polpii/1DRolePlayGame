/*
  SpyGame1D Per-Player Controller
  ================================
  Each of 5 players gets their own Arduino with 2 push buttons + 1 rotary encoder.
  Change PLAYER_ID (1–5) before flashing each Arduino.

  Wiring:
    Pin 2  — Button A (INPUT_PULLUP, press = LOW)
    Pin 3  — Button B (INPUT_PULLUP, press = LOW)
    Pin A0 — Rotary encoder pin A
    Pin A1 — Rotary encoder pin B
    Pin 4  — Encoder push button (INPUT_PULLUP, press = LOW)

  Both buttons send the play key. Encoder rotation sends CW/CCW keys.
  Encoder button sends the click (submit) key.
*/

#include <Keyboard.h>
#include <RotaryEncoder.h>

// ─── Change this before flashing each Arduino (1–5) ───────────────────────
#define PLAYER_ID 1

// ─── Key assignments per player ───────────────────────────────────────────
#if PLAYER_ID == 1
  // Player 1 (Pink): play=d, cw=e, ccw=c, click=s
  #define KEY_PLAY    'd'
  #define KEY_ENC_CW  'e'
  #define KEY_ENC_CCW 'c'
  #define KEY_ENC_BTN 's'
#elif PLAYER_ID == 2
  // Player 2 (Blue): play=l, cw=;, ccw=., click=k
  #define KEY_PLAY    'l'
  #define KEY_ENC_CW  ';'
  #define KEY_ENC_CCW '.'
  #define KEY_ENC_BTN 'k'
#elif PLAYER_ID == 3
  // Player 3 (Red): play=o, cw=p, ccw=i, click=9
  #define KEY_PLAY    'o'
  #define KEY_ENC_CW  'p'
  #define KEY_ENC_CCW 'i'
  #define KEY_ENC_BTN '9'
#elif PLAYER_ID == 4
  // Player 4 (Yellow): play=j, cw=u, ccw=m, click=h
  #define KEY_PLAY    'j'
  #define KEY_ENC_CW  'u'
  #define KEY_ENC_CCW 'm'
  #define KEY_ENC_BTN 'h'
#elif PLAYER_ID == 5
  // Player 5 (Green): play=v, cw=f, ccw=b, click=g
  #define KEY_PLAY    'v'
  #define KEY_ENC_CW  'f'
  #define KEY_ENC_CCW 'b'
  #define KEY_ENC_BTN 'g'
#else
  #error "PLAYER_ID must be 1–5"
#endif

// ─── Debounce ─────────────────────────────────────────────────────────────
#define DEBOUNCE_MS 50

// ─── Pin definitions ──────────────────────────────────────────────────────
#define PIN_BTN_A   2
#define PIN_BTN_B   3
#define PIN_ENC_BTN 4

RotaryEncoder encoder(A0, A1);

// Button state tracking
bool btnA_last = HIGH;
bool btnB_last = HIGH;
bool encBtn_last = HIGH;

unsigned long btnA_lastChange = 0;
unsigned long btnB_lastChange = 0;
unsigned long encBtn_lastChange = 0;

void setup() {
  Serial.begin(57600);

  pinMode(PIN_BTN_A,   INPUT_PULLUP);
  pinMode(PIN_BTN_B,   INPUT_PULLUP);
  pinMode(PIN_ENC_BTN, INPUT_PULLUP);

  Keyboard.begin();
}

void loop() {
  unsigned long now = millis();

  // ── Rotary encoder rotation ──────────────────────────────────────────
  static int lastPos = 0;
  encoder.tick();
  int newPos = encoder.getPosition();
  if (newPos != lastPos) {
    if (newPos > lastPos) {
      Keyboard.write(KEY_ENC_CW);
    } else {
      Keyboard.write(KEY_ENC_CCW);
    }
    lastPos = newPos;
  }

  // ── Button A (pin 2) — sends play key on press (LOW edge) ───────────
  bool btnA_read = digitalRead(PIN_BTN_A);
  if (btnA_read != btnA_last && (now - btnA_lastChange >= DEBOUNCE_MS)) {
    btnA_lastChange = now;
    btnA_last = btnA_read;
    if (btnA_read == LOW) {
      Keyboard.write(KEY_PLAY);
    }
  }

  // ── Button B (pin 3) — sends play key on press (LOW edge) ───────────
  bool btnB_read = digitalRead(PIN_BTN_B);
  if (btnB_read != btnB_last && (now - btnB_lastChange >= DEBOUNCE_MS)) {
    btnB_lastChange = now;
    btnB_last = btnB_read;
    if (btnB_read == LOW) {
      Keyboard.write(KEY_PLAY);
    }
  }

  // ── Encoder button (pin 4) — sends click key on press (LOW edge) ────
  bool encBtn_read = digitalRead(PIN_ENC_BTN);
  if (encBtn_read != encBtn_last && (now - encBtn_lastChange >= DEBOUNCE_MS)) {
    encBtn_lastChange = now;
    encBtn_last = encBtn_read;
    if (encBtn_read == LOW) {
      Keyboard.write(KEY_ENC_BTN);
    }
  }
}
