#!/usr/bin/env python3
import socketserver
import serial
import datetime
import threading
import sys

# ====== CONFIG ======
TCP_HOST = "0.0.0.0"
TCP_PORT = 3141

# Change this to match how the Feather is connected:
#   - UART header:      /dev/ttyAMA0 or /dev/ttyS0
#   - USB-serial cable: /dev/ttyUSB0
SERIAL_PORT = "/dev/ttyS0"
SERIAL_BAUD = 115200

# Global UART object (opened once)
ser = None


def timestamp() -> str:
    return datetime.datetime.now().isoformat(sep=" ", timespec="seconds")


def hex_nibble(c: str) -> int:
    if "0" <= c <= "9":
        return ord(c) - ord("0")
    if "A" <= c <= "F":
        return ord(c) - ord("A") + 10
    if "a" <= c <= "f":
        return ord(c) - ord("a") + 10
    return -1


def compute_checksum(body: str) -> int:
    """
    XOR of all characters in body (like NMEA-0183).
    'body' should be everything between '$' and '*' (exclusive).
    """
    cs = 0
    for ch in body:
        cs ^= ord(ch)
    return cs & 0xFF


def add_checksum_to_frame(line_in: str) -> str:
    """
    Given a line like:
      $BSTXT,0A,...*
    (no CS after '*'),
    return:
      $BSTXT,0A,...*CS
    where CS is two-digit hex uppercase.
    """
    # Strip CR/LF but otherwise keep content
    line = line_in.strip("\r\n")

    dollar_pos = line.find("$")
    star_pos = line.rfind("*")

    if dollar_pos == -1 or star_pos == -1 or star_pos <= dollar_pos + 1:
        raise ValueError(f"Invalid frame (missing $ or *): {line!r}")

    body = line[dollar_pos + 1 : star_pos]
    cs = compute_checksum(body)
    cs_hex = f"{cs:02X}"

    return line + cs_hex


class NMEARequestHandler(socketserver.StreamRequestHandler):
    """
    Handles a TCP client.
    Reads lines terminated by '\n', expects each line to:
      - start with '$'
      - contain '*'
      - have no checksum after '*'
    Appends checksum and forwards to UART.
    """

    def handle(self):
        peer = self.client_address
        print(f"[{timestamp()}] New connection from {peer}", flush=True)
        while True:
            line = self.rfile.readline()
            if not line:
                # client closed
                print(f"[{timestamp()}] Connection closed from {peer}", flush=True)
                break

            try:
                decoded = line.decode("utf-8", errors="replace")
            except Exception as e:
                print(f"[{timestamp()}] Decode error from {peer}: {e}", flush=True)
                continue

            stripped = decoded.strip("\r\n")
            if not stripped:
                continue

            # Log what we received (without checksum)
            print(f"[{timestamp()}] RX (TCP): {stripped}", flush=True)

            try:
                framed = add_checksum_to_frame(decoded)
            except ValueError as e:
                print(f"[{timestamp()}] WARN invalid frame: {e}", flush=True)
                continue

            # Log final frame (with checksum)
            print(f"[{timestamp()}] TX (UART): {framed}", flush=True)

            # Send via UART with newline
            try:
                ser.write(framed.encode("ascii") + b"\n")
                ser.flush()
            except Exception as e:
                print(f"[{timestamp()}] ERROR writing to serial: {e}", flush=True)


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    global ser

    # Open serial port to Feather
    try:
        ser = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=1)
    except Exception as e:
        print(f"ERROR: Could not open serial port {SERIAL_PORT}: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"[{timestamp()}] Opened UART {SERIAL_PORT} @ {SERIAL_BAUD} baud", flush=True)

    # Start TCP server
    server = ThreadedTCPServer((TCP_HOST, TCP_PORT), NMEARequestHandler)
    print(f"[{timestamp()}] Listening on {TCP_HOST}:{TCP_PORT}", flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\n[{timestamp()}] Shutting down...", flush=True)
    finally:
        server.shutdown()
        server.server_close()
        ser.close()


if __name__ == "__main__":
    main()
