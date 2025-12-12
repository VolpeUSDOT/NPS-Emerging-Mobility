/*
  Feather M0 RFM95 (Adafruit 3178) -> MatrixPortal M4 Bridge
  Using LoRa.h (Sandeep Mistry) for simple point-to-point LoRa.

  - Receives NMEA-ish frames from:
      * USB Serial Monitor
      * LoRa packets
  - Valid frame format:
      $BSTXT,<station_id_hex>,<payload>*<CS>

    Example:
      $BSTXT,0A,C\\nCOLOR|WHITE\\nTEXT|0|Next Station\\nTEXT|1|Bos\\\\Camb\\n*32

    Where:
      - Talker ID: "BS"  (Base Station)
      - Type: "TXT"
      - station_id_hex: 2-digit hex (e.g., "0A")
      - payload: text protocol for MatrixPortal M4, with escaping:
           \n  -> newline separator
           \\  -> literal '\'

  - The Feather:
      * Verifies checksum (XOR of all chars between '$' and '*')
      * Checks station ID against STATION_ID
      * Unescapes \n and \\
      * Forwards decoded text to MatrixPortal via Serial1

  MatrixPortal M4 still expects:
    C
    COLOR|WHITE
    TEXT|0|Next Station
    TEXT|1|Bos\Camb
  ...with real '\n' between commands.

  Wiring:
    Feather M0 RFM95          MatrixPortal M4
    -----------------------------------------
    Pin 1 (TX, Serial1 TX) -> RX (Serial1 RX)
    Pin 0 (RX, Serial1 RX) <- TX (Serial1 TX)  [optional]
    GND                 <-> GND
*/

#include <SPI.h>
#include <LoRa.h>

// ---------- Station ID (hex) ----------
#define STATION_ID 0x0A  // this node's station ID (hex)

// ---------- LoRa Pin Mapping (Feather M0 RFM95) ----------
// From Adafruit Feather M0 RFM95 examples
#define LORA_SS    8
#define LORA_RST   4
#define LORA_DIO0  3

// ---------- LoRa Parameters (as requested) ----------
// US915 Channel 8 frequency (in Hz)
#define LORA_FREQUENCY 903900000UL  // 903.9 MHz

// LoRa parameters - optimized for maximum range
#define LORA_BANDWIDTH        125E3      // 125kHz
#define LORA_SPREADING_FACTOR 12         // SF12
#define LORA_CODING_RATE      8          // 4/8
#define LORA_TX_POWER         20         // dBm
#define LORA_SYNC_WORD        0x34       // private network sync word

// ---------- Serial Monitor line buffer ----------
String serialLine = "";

// ---------- Helpers: hex parsing / checksum / unescaping ----------

int hexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return -1;
}

bool parseHexByte(const String &s, uint8_t &out) {
  if (s.length() < 2) return false;
  int hi = hexNibble(s.charAt(0));
  int lo = hexNibble(s.charAt(1));
  if (hi < 0 || lo < 0) return false;
  out = (uint8_t)((hi << 4) | lo);
  return true;
}

// XOR of all chars in 'body'
uint8_t computeChecksum(const String &body) {
  uint8_t cs = 0;
  for (size_t i = 0; i < body.length(); i++) {
    cs ^= (uint8_t)body.charAt(i);
  }
  return cs;
}

// Unescape payload:
//   "\n"  -> newline
//   "\\"  -> '\'
String unescapePayload(const String &in) {
  String out;
  out.reserve(in.length());
  for (size_t i = 0; i < in.length(); i++) {
    char c = in.charAt(i);
    if (c == '\\' && i + 1 < in.length()) {
      char next = in.charAt(i + 1);
      if (next == 'n') {
        out += '\n';
        i++;
      } else if (next == '\\') {
        out += '\\';
        i++;
      } else {
        // Unknown escape: keep the next char verbatim
        out += next;
        i++;
      }
    } else {
      out += c;
    }
  }
  return out;
}

// Send decoded text to MatrixPortal over Serial1
void sendToMatrixPortal(const String &decodedText) {
  for (size_t i = 0; i < decodedText.length(); i++) {
    Serial1.write((uint8_t)decodedText.charAt(i));
  }
  Serial1.flush();

  // Debug view
  Serial.println(F("[M4] Forwarded decoded payload:"));
  Serial.println(F("----- BEGIN M4 PAYLOAD -----"));
  Serial.print(decodedText);
  Serial.println(F("----- END M4 PAYLOAD -------"));
}

// Parse a full NMEA-ish frame and act on it if valid / for this station.
// Returns true if processed, false otherwise.
bool handleNmeaLikeMessage(const String &msgRaw) {
  String msg = msgRaw;
  msg.trim();
  if (msg.length() == 0) return false;

  int dollarPos = msg.indexOf('$');
  int starPos   = msg.lastIndexOf('*');

  if (dollarPos == -1 || starPos == -1 || starPos <= dollarPos + 1) {
    Serial.print(F("[WARN] Invalid frame, missing $ or *: "));
    Serial.println(msg);
    return false;
  }

  // Compute checksum on substring between '$' and '*'
  String body = msg.substring(dollarPos + 1, starPos);
  String csStr = msg.substring(starPos + 1);
  csStr.trim();
  if (csStr.length() < 2) {
    Serial.print(F("[WARN] Checksum too short: "));
    Serial.println(msg);
    return false;
  }
  csStr = csStr.substring(0, 2);

  uint8_t computedCS = computeChecksum(body);
  uint8_t receivedCS = 0;
  if (!parseHexByte(csStr, receivedCS)) {
    Serial.print(F("[WARN] Invalid checksum hex: "));
    Serial.println(msg);
    return false;
  }

  if (computedCS != receivedCS) {
    Serial.print(F("[WARN] Checksum mismatch recv="));
    Serial.print(receivedCS, HEX);
    Serial.print(F(" calc="));
    Serial.print(computedCS, HEX);
    Serial.print(F(" for frame: "));
    Serial.println(msg);
    return false;
  }

  // body looks like: "BSTXT,0A,<payload>"
  int firstComma  = body.indexOf(',');
  int secondComma = body.indexOf(',', firstComma + 1);
  if (firstComma == -1 || secondComma == -1) {
    Serial.print(F("[WARN] Not enough commas in body: "));
    Serial.println(body);
    return false;
  }

  String header  = body.substring(0, firstComma);
  String idStr   = body.substring(firstComma + 1, secondComma);
  String payload = body.substring(secondComma + 1);

  header.trim();
  idStr.trim();
  payload.trim();

  // Expect "BSTXT"
  if (!header.startsWith("BSTXT")) {
    Serial.print(F("[INFO] Ignoring header: "));
    Serial.println(header);
    return false;
  }

  uint8_t msgStationId = 0;
  if (!parseHexByte(idStr, msgStationId)) {
    Serial.print(F("[WARN] Bad station ID hex: "));
    Serial.println(idStr);
    return false;
  }

  if (msgStationId != STATION_ID) {
    Serial.print(F("[INFO] Frame for station 0x"));
    Serial.print(msgStationId, HEX);
    Serial.print(F(" (this node: 0x"));
    Serial.print(STATION_ID, HEX);
    Serial.println(F("), ignoring."));
    return false;
  }

  // Station matches and checksum is good
  String decoded = unescapePayload(payload);
  sendToMatrixPortal(decoded);
  return true;
}

// Read NMEA frames from USB Serial Monitor
void pollSerialMonitor() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') {
      // ignore
      continue;
    } else if (c == '\n') {
      if (serialLine.length() > 0) {
        Serial.print(F("[USB] Line: "));
        Serial.println(serialLine);
        handleNmeaLikeMessage(serialLine);
        serialLine = "";
      }
    } else {
      serialLine += c;
    }
  }
}

// Read LoRa packets and feed them to the same parser
void pollLoRa() {
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    String msg;
    msg.reserve(packetSize);
    while (LoRa.available()) {
      char c = (char)LoRa.read();
      msg += c;
    }
    Serial.print(F("[LoRa] Packet: "));
    Serial.println(msg);
    handleNmeaLikeMessage(msg);
  }
}

// Optional: echo any MatrixPortal Serial1 output to the monitor
void pollMatrixPortalBackChannel() {
  while (Serial1.available() > 0) {
    char c = (char)Serial1.read();
    Serial.write(c);
  }
}

void setup() {
  // USB debug Serial
  Serial.begin(115200);
  while (!Serial && millis() < 4000) {}

  Serial.println(F("Feather M0 RFM95 + LoRa.h -> MatrixPortal Bridge"));
  Serial.print(F("Station ID (hex): 0x"));
  Serial.println(STATION_ID, HEX);

  // UART to MatrixPortal
  Serial1.begin(115200);
  Serial.println(F("Serial1 to MatrixPortal at 115200 bps"));

  // LoRa pin config
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_FREQUENCY)) { // freq in Hz
    Serial.println(F("[ERROR] LoRa init failed. Check wiring/antenna."));
    while (1) {
      delay(1000);
    }
  }
  Serial.print(F("LoRa started at "));
  Serial.print((double)LORA_FREQUENCY / 1e6, 3);
  Serial.println(F(" MHz"));

  // Advanced LoRa params
  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR); // 6–12
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);        // e.g. 125E3
  LoRa.setCodingRate4(LORA_CODING_RATE);          // 5–8 => 4/5..4/8
  LoRa.setTxPower(LORA_TX_POWER);                 // dBm
  LoRa.setSyncWord(LORA_SYNC_WORD);

  Serial.println(F("LoRa config:"));
  Serial.print(F("  SF=")); Serial.println(LORA_SPREADING_FACTOR);
  Serial.print(F("  BW=")); Serial.println((long)LORA_BANDWIDTH);
  Serial.print(F("  CR=4/")); Serial.println(LORA_CODING_RATE);
  Serial.print(F("  TX power=")); Serial.print(LORA_TX_POWER); Serial.println(F(" dBm"));
  Serial.print(F("  SyncWord=0x")); Serial.println(LORA_SYNC_WORD, HEX);

  Serial.println(F("Ready. Send frames like:"));
  Serial.println(F("$BSTXT,0A,C\\nCOLOR|WHITE\\nTEXT|0|Next Station\\nTEXT|1|Bos\\\\Camb\\n*CS"));
}

void loop() {
  pollSerialMonitor();
  pollLoRa();
  pollMatrixPortalBackChannel();
  delay(2);
}
