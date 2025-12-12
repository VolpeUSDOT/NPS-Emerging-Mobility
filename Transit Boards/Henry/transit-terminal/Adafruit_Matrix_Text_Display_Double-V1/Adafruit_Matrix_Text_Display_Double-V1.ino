/*
  MatrixPortal M4 Text Protocol Firmware
  --------------------------------------
  Listens on Serial1 for simple '|' delimited commands and drives
  a 64x32 HUB75 RGB matrix using the Adafruit_Protomatter library.

  Supported commands (newline-terminated):

    C
      Clear screen, stop scrolling, reset line states.

    COLOR|value
      Set global text color. 'value' can be:
        - #RRGGBB (hex)
        - RED, GREEN, BLUE, WHITE, YELLOW, CYAN, MAGENTA

    TEXT|row|text
      Draw plain text on row 0..3 using the current color.

    BOLD|row|text
      Draw "bold" text on row 0..3 (text drawn twice with 1px offset).

    FLASH|row|hz|text
      Flash text on row 0..3.
      hz = flash frequency in Hz (integer). If missing or invalid, defaults to 1.

    SCROLLH|dir|text
      Horizontal scrolling text, full-screen.
      dir = LEFT or RIGHT (default LEFT if missing/invalid).

    SCROLLV|dir|text
      Vertical scrolling text, full-screen.
      dir = UP or DOWN (default UP if missing/invalid).

  Protocol details:
    - Fields are separated by '|'.
    - Newline '\n' terminates a command.
    - Everything after the last '|' is treated as raw text (no escaping).

  Hardware link:
    - Connect sender TX -> MatrixPortal RX (Serial1)
    - Connect sender GND -> MatrixPortal GND
    - Optional: MatrixPortal TX -> sender RX (for debugging/ACKs)

*/

#include <Adafruit_Protomatter.h>
#include <Arduino.h>

// ---------- Matrix configuration for MatrixPortal M4 (64x32) ----------
// These pins come from Adafruit's MatrixPortal M4 + Protomatter examples. :contentReference[oaicite:2]{index=2}
uint8_t rgbPins[]  = { 7, 8, 9, 10, 11, 12 };
uint8_t addrPins[] = { 17, 18, 19, 20 };   // 4 address lines for 64x32
uint8_t clockPin   = 14;
uint8_t latchPin   = 15;
uint8_t oePin      = 16;


// Width = 64, bitDepth = 4 (16 brightness levels is plenty), chain = 1 panel
Adafruit_Protomatter matrix(
  128,        // bitWidth: total width in pixels
  4,         // bitDepth: 4 = 16 brightness levels (4096 colors)
  1,         // rgbCount: number of RGB panel chains
  rgbPins,   // rgbPins array
  4,         // addrCount: number of address lines (A..D) for 64x32
  addrPins,  // addrPins array
  clockPin,  // CLK
  latchPin,  // LAT
  oePin,     // OE
  false,     // doubleBuffer: true = smoother animation, more RAM; false is fine here
  0,         // tile offset: 0 for single panel / no tiling
  NULL       // serpentine layout info: not used, so NULL
);


// ---------- Text layout constants ----------
const int PANEL_WIDTH  = 128;
const int PANEL_HEIGHT = 32;

// For the classic 5x7 font in Adafruit_GFX:
// We'll assume about 6 px per char horizontally (5 + 1 spacing)
// and 8 px per row (7 + 1 spacing).
const int CHAR_WIDTH   = 6;
const int ROW_HEIGHT   = 8;
const int MAX_ROWS     = 4;   // 32 / 8 = 4 rows

// ---------- Line state structure ----------
struct LineState {
  String  text;        // Text to display on this row
  bool    bold;        // Whether to render "bold"
  bool    flash;       // Whether flashing is enabled
  float   flashHz;     // Flash frequency in Hz
  bool    flashOn;     // Current visible state (on/off)
  uint32_t lastToggle; // Last millis() when we toggled flashOn
};

LineState lines[MAX_ROWS];

// ---------- Global color state ----------
uint8_t  colorR = 255;
uint8_t  colorG = 255;
uint8_t  colorB = 255;
uint16_t color565;     // Cached 16-bit color

// ---------- Scroll state ----------
bool     scrollHActive = false;
bool     scrollVActive = false;
String   scrollText    = "";
int16_t  scrollX       = 0;
int16_t  scrollY       = 0;
int      scrollSpeed   = 1;     // pixels per frame
int      scrollDir     = -1;    // H: -1=LEFT, +1=RIGHT; V: -1=UP, +1=DOWN

// ---------- Serial line buffer ----------
const int   LINE_BUF_SIZE = 256;
char        lineBuf[LINE_BUF_SIZE];
uint16_t    linePos = 0;

// ---------- Helper: update cached color565 ----------
void updateColor565() {
  color565 = matrix.color565(colorR, colorG, colorB);
}

// ---------- Helper: parse hex nibble ----------
int hexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

// ---------- Helper: parse #RRGGBB into colorR/G/B ----------
bool parseHexColor(const String &s) {
  // Expect format "#RRGGBB", total length 7
  if (s.length() != 7 || s.charAt(0) != '#') return false;

  int rHigh = hexNibble(s.charAt(1));
  int rLow  = hexNibble(s.charAt(2));
  int gHigh = hexNibble(s.charAt(3));
  int gLow  = hexNibble(s.charAt(4));
  int bHigh = hexNibble(s.charAt(5));
  int bLow  = hexNibble(s.charAt(6));

  if (rHigh < 0 || rLow < 0 || gHigh < 0 || gLow < 0 || bHigh < 0 || bLow < 0) {
    return false;
  }

  colorR = (rHigh << 4) | rLow;
  colorG = (gHigh << 4) | gLow;
  colorB = (bHigh << 4) | bLow;
  updateColor565();
  return true;
}

// ---------- Helper: parse named colors ----------
bool parseNamedColor(const String &nameRaw) {
  String name = nameRaw;
  name.toUpperCase();

  if (name == "RED") {
    colorR = 255; colorG = 0;   colorB = 0;
  } else if (name == "GREEN") {
    colorR = 0;   colorG = 255; colorB = 0;
  } else if (name == "BLUE") {
    colorR = 0;   colorG = 0;   colorB = 255;
  } else if (name == "WHITE") {
    colorR = 255; colorG = 255; colorB = 255;
  } else if (name == "YELLOW") {
    colorR = 255; colorG = 255; colorB = 0;
  } else if (name == "CYAN") {
    colorR = 0;   colorG = 255; colorB = 255;
  } else if (name == "MAGENTA") {
    colorR = 255; colorG = 0;   colorB = 255;
  } else {
    return false;
  }

  updateColor565();
  return true;
}

// ---------- Helper: split a string by '|' ----------
String getField(const String &line, int fieldIndex) {
  // fieldIndex: 0 = first token, 1 = second, etc.
  // Returns "" if not found.
  int start = 0;
  int end   = -1;
  int currentIndex = 0;

  while (true) {
    end = line.indexOf('|', start);
    if (currentIndex == fieldIndex) {
      if (end == -1) {
        // Last field
        return line.substring(start);
      } else {
        return line.substring(start, end);
      }
    }
    if (end == -1) break; // No more fields
    start = end + 1;
    currentIndex++;
  }

  return "";
}

// ---------- Clear everything ----------
void clearState() {
  for (int i = 0; i < MAX_ROWS; i++) {
    lines[i].text       = "";
    lines[i].bold       = false;
    lines[i].flash      = false;
    lines[i].flashHz    = 1.0;
    lines[i].flashOn    = true;
    lines[i].lastToggle = millis();
  }

  scrollHActive = false;
  scrollVActive = false;
  scrollText    = "";
  scrollX       = 0;
  scrollY       = 0;
}

// ---------- Command handlers ----------

void handleColorCommand(const String &arg) {
  if (arg.length() == 0) return;

  if (arg.charAt(0) == '#') {
    if (!parseHexColor(arg)) {
      Serial.println("Bad hex color");
    }
  } else {
    if (!parseNamedColor(arg)) {
      Serial.println("Bad named color");
    }
  }
}

void handleTextCommand(bool bold, const String &rowStr, const String &text) {
  int row = rowStr.toInt();
  if (row < 0 || row >= MAX_ROWS) return;

  lines[row].text       = text;
  lines[row].bold       = bold;
  lines[row].flash      = false;
  lines[row].flashHz    = 1.0;
  lines[row].flashOn    = true;
  lines[row].lastToggle = millis();

  // Exiting scroll mode if we receive line-based text,
  // so line text "takes over".
  scrollHActive = false;
  scrollVActive = false;
}

void handleFlashCommand(const String &rowStr, const String &hzStr, const String &text) {
  int row = rowStr.toInt();
  if (row < 0 || row >= MAX_ROWS) return;

  float hz = hzStr.toFloat();
  if (hz <= 0.0f) hz = 1.0f;

  lines[row].text       = text;
  lines[row].bold       = false;
  lines[row].flash      = true;
  lines[row].flashHz    = hz;
  lines[row].flashOn    = true;
  lines[row].lastToggle = millis();

  scrollHActive = false;
  scrollVActive = false;
}

void handleScrollHCommand(const String &dirStrRaw, const String &text) {
  String dirStr = dirStrRaw;
  dirStr.toUpperCase();

  // Default LEFT if invalid or empty
  if (dirStr == "RIGHT") {
    scrollDir = +1;
  } else {
    scrollDir = -1; // LEFT
  }

  scrollText = text;

  // For horizontal scroll, we draw at a single baseline vertically centered.
  // We'll compute scrollX start based on direction.
  if (scrollDir < 0) {
    // LEFT: start off-screen to the right
    scrollX = PANEL_WIDTH;
  } else {
    // RIGHT: start off-screen to the left
    scrollX = - (text.length() * CHAR_WIDTH);
  }

  scrollY        = PANEL_HEIGHT / 2 + 3; // Approx mid-line baseline
  scrollHActive  = true;
  scrollVActive  = false;
}

void handleScrollVCommand(const String &dirStrRaw, const String &text) {
  String dirStr = dirStrRaw;
  dirStr.toUpperCase();

  // Default UP if invalid or empty
  if (dirStr == "DOWN") {
    scrollDir = +1;
  } else {
    scrollDir = -1; // UP
  }

  scrollText = text;

  // For vertical scroll, we scroll the text block through the screen.
  // We place the text horizontally centered.
  if (scrollDir < 0) {
    // UP: start below screen
    scrollY = PANEL_HEIGHT;
  } else {
    // DOWN: start above screen
    scrollY = -ROW_HEIGHT;
  }

  scrollX        = (PANEL_WIDTH - scrollText.length() * CHAR_WIDTH) / 2;
  scrollHActive  = false;
  scrollVActive  = true;
}

// ---------- Parse and dispatch a single command line ----------

void processLine(const String &lineRaw) {
  // Trim CR/LF and whitespace
  String line = lineRaw;
  line.trim();
  if (line.length() == 0) return;

  // Single-letter clear command
  if (line == "C") {
    clearState();
    return;
  }

  // Command name is field 0
  String cmd = getField(line, 0);
  cmd.toUpperCase();

  if (cmd == "COLOR") {
    String arg = getField(line, 1);
    handleColorCommand(arg);

  } else if (cmd == "TEXT") {
    String rowStr = getField(line, 1);
    String text   = getField(line, 2);
    handleTextCommand(false, rowStr, text);

  } else if (cmd == "BOLD") {
    String rowStr = getField(line, 1);
    String text   = getField(line, 2);
    handleTextCommand(true, rowStr, text);

  } else if (cmd == "FLASH") {
    String rowStr = getField(line, 1);
    String hzStr  = getField(line, 2);
    String text   = getField(line, 3);
    handleFlashCommand(rowStr, hzStr, text);

  } else if (cmd == "SCROLLH") {
    String dirStr = getField(line, 1);
    String text   = getField(line, 2);
    handleScrollHCommand(dirStr, text);

  } else if (cmd == "SCROLLV") {
    String dirStr = getField(line, 1);
    String text   = getField(line, 2);
    handleScrollVCommand(dirStr, text);

  } else {
    Serial.print("Unknown cmd: ");
    Serial.println(cmd);
  }
}

// ---------- Read from Serial1 into line buffer ----------
void pollSerial1() {
  while (Serial1.available() > 0) {
    char c = (char)Serial1.read();

    if (c == '\r') {
      // ignore CR, wait for LF
      continue;
    } else if (c == '\n') {
      // End of line: process it
      lineBuf[linePos] = '\0';
      String lineStr(lineBuf);
      processLine(lineStr);
      linePos = 0; // Reset buffer
    } else {
      // Add to buffer if there's room
      if (linePos < LINE_BUF_SIZE - 1) {
        lineBuf[linePos++] = c;
      } else {
        // Overflow, reset buffer to avoid garbage
        linePos = 0;
      }
    }
  }
}

// ---------- Update flashing state ----------
void updateFlashing(uint32_t now) {
  for (int i = 0; i < MAX_ROWS; i++) {
    if (!lines[i].flash) continue;

    // Flash period in ms: T = 1000 / Hz
    float periodMs = 1000.0f / lines[i].flashHz;
    if ((float)(now - lines[i].lastToggle) >= periodMs / 2.0f) {
      lines[i].flashOn   = !lines[i].flashOn;
      lines[i].lastToggle = now;
    }
  }
}

// ---------- Update scrolling state ----------
void updateScrolling() {
  if (scrollHActive) {
    scrollX += scrollDir * scrollSpeed;

    int textWidth = scrollText.length() * CHAR_WIDTH;

    if (scrollDir < 0) {
      // LEFT: when entirely off left side, reset to right
      if (scrollX < -textWidth) {
        scrollX = PANEL_WIDTH;
      }
    } else {
      // RIGHT: when entirely off right side, reset to left
      if (scrollX > PANEL_WIDTH) {
        scrollX = -textWidth;
      }
    }
  } else if (scrollVActive) {
    scrollY += scrollDir * scrollSpeed;

    // We approximate vertical text height as ROW_HEIGHT
    int textHeight = ROW_HEIGHT;

    if (scrollDir < 0) {
      // UP: when off top, reset below
      if (scrollY < -textHeight) {
        scrollY = PANEL_HEIGHT;
      }
    } else {
      // DOWN: when off bottom, reset above
      if (scrollY > PANEL_HEIGHT + textHeight) {
        scrollY = -textHeight;
      }
    }
  }
}

// ---------- Draw everything ----------
void renderDisplay() {
  matrix.fillScreen(0); // Clear backbuffer

  matrix.setTextWrap(false);
  matrix.setTextColor(color565);

  if (scrollHActive || scrollVActive) {
    // Scroll mode overrides line rendering
    matrix.setCursor(scrollX, scrollY);
    matrix.print(scrollText);
  } else {
    // Render up to 4 lines
    for (int row = 0; row < MAX_ROWS; row++) {
      if (lines[row].text.length() == 0) continue;

      // Skip drawing if flashing and currently "off"
      if (lines[row].flash && !lines[row].flashOn) continue;

      int16_t x = 0; // Left-aligned, adjust if you want centering
      int16_t y = (row + 1) * ROW_HEIGHT - 1; // Baseline

      matrix.setCursor(x, y);

      if (lines[row].bold) {
        // Draw twice, offset by (1,0) to fake bold
        matrix.setTextColor(color565);
        matrix.print(lines[row].text);

        matrix.setCursor(x + 1, y);
        matrix.print(lines[row].text);
      } else {
        matrix.setTextColor(color565);
        matrix.print(lines[row].text);
      }
    }
  }

  matrix.show(); // Push frame to the panel
}

// ---------- Arduino setup / loop ----------

void setup() {
  // USB serial for debug
  Serial.begin(115200);
  while (!Serial && millis() < 4000) {
    // wait a bit for USB
  }
  Serial.println("MatrixPortal Text Protocol Firmware starting...");

  // Command serial (hardware UART)
  Serial1.begin(115200);  // TX/RX pins (D1/D0) on MatrixPortal M4

  // Initialize matrix
  ProtomatterStatus status = matrix.begin();
  if (status != PROTOMATTER_OK) {
    Serial.print("Protomatter init error: ");
    Serial.println((int)status);
    for (;;); // halt
  }

  // Initial color: white
  updateColor565();

  clearState();
}

void loop() {
  uint32_t now = millis();

  // Read commands from Serial1 (Raspberry Pi / MKR / Feather, etc.)
  pollSerial1();

  // Update states
  updateFlashing(now);
  updateScrolling();

  // Render current frame
  renderDisplay();

  // Simple frame pacing: ~50 FPS
  delay(20);
}
