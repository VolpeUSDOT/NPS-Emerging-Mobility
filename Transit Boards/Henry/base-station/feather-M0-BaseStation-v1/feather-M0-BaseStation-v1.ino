/*
  Feather M0 RFM95 LoRa Transmitter for Bus Base Station
  ------------------------------------------------------

  - Receives completed NMEA-ish frames (WITH checksum) over Serial1
    from the Raspberry Pi, lines like:
      $BSTXT,0A,C\nCOLOR|WHITE\nTEXT|0|Next Station\nTEXT|1|Bos\\Camb\n*32

  - For each full line (ending in '\n'), it sends that line as a LoRa packet.

  - Uses the LoRa.h library (Sandeep Mistry) and standard Feather M0 RFM95 pins.

  Wiring to Raspberry Pi:
    Feather M0 RFM95           Raspberry Pi
    ---------------------------------------
    Pin 0 (RX, Serial1 RX) <-  Pi TX
    Pin 1 (TX, Serial1 TX) ->  Pi RX  (optional, for debug)
    GND                    <-> GND

*/

#include <SPI.h>
#include <LoRa.h>

// ---------- LoRa Pins (Feather M0 RFM95) ----------
#define LORA_SS   8
#define LORA_RST  4
#define LORA_DIO0 3

// ---------- LoRa Parameters ----------
#define LORA_FREQUENCY        903900000UL  // 903.9 MHz, US915 Ch8
#define LORA_BANDWIDTH        125E3       // 125 kHz
#define LORA_SPREADING_FACTOR 12          // SF12
#define LORA_CODING_RATE      8           // 4/8
#define LORA_TX_POWER         20          // dBm
#define LORA_SYNC_WORD        0x34        // private network sync word

// ---------- Serial1 line buffer ----------
String serial1Line;


void sendLoRaPacket(const String &frame) {
  // Send the full frame as a single LoRa packet
  LoRa.beginPacket();
  LoRa.print(frame);  // sends ASCII characters
  LoRa.endPacket();

  // Debug over USB
  Serial.print(F("[LoRa TX] "));
  Serial.println(frame);
}


// Read lines from Serial1 (coming from Raspberry Pi).
// A line termination ('\n') indicates a full frame ready to TX.
void pollSerial1() {
  while (Serial1.available() > 0) {
    char c = (char)Serial1.read();

    if (c == '\r') {
      // ignore CR
      continue;
    } else if (c == '\n') {
      if (serial1Line.length() > 0) {
        // We have a full frame from Pi; transmit over LoRa
        sendLoRaPacket(serial1Line);
        serial1Line = "";
      }
    } else {
      serial1Line += c;
    }
  }
}


void setupLoRa() {
  // Configure Feather M0 RFM95 pins
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println(F("[ERROR] LoRa init failed. Check wiring/antenna."));
    while (1) {
      delay(1000);
    }
  }

  // Configure advanced LoRa parameters
  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR); // 6–12
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);        // e.g., 125E3
  LoRa.setCodingRate4(LORA_CODING_RATE);          // 5–8 => 4/5..4/8
  LoRa.setTxPower(LORA_TX_POWER);                 // in dBm
  LoRa.setSyncWord(LORA_SYNC_WORD);

  Serial.println(F("LoRa configuration:"));
  Serial.print(F("  Frequency: "));
  Serial.print((double)LORA_FREQUENCY / 1e6, 3);
  Serial.println(F(" MHz"));
  Serial.print(F("  SF: ")); Serial.println(LORA_SPREADING_FACTOR);
  Serial.print(F("  BW: ")); Serial.println((long)LORA_BANDWIDTH);
  Serial.print(F("  CR: 4/")); Serial.println(LORA_CODING_RATE);
  Serial.print(F("  TX Power: ")); Serial.print(LORA_TX_POWER); Serial.println(F(" dBm"));
  Serial.print(F("  Sync Word: 0x")); Serial.println(LORA_SYNC_WORD, HEX);
}


void setup() {
  // USB debug
  Serial.begin(115200);
  while (!Serial && millis() < 4000) {}

  Serial.println(F("Feather M0 RFM95 LoRa TX (Bus Base Station)"));

  // Serial1: link to Raspberry Pi
  Serial1.begin(115200);
  Serial.println(F("Serial1 (to Pi) at 115200 bps"));

  // LoRa radio init
  setupLoRa();

  Serial.println(F("Ready. Waiting for frames from Raspberry Pi on Serial1..."));
}


void loop() {
  pollSerial1();
  // Optional small delay to avoid maxing out CPU
  delay(1);
}
