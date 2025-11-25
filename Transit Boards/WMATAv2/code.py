import gc
import json
import time
import displayio
import terminalio
import supervisor
from adafruit_matrixportal.matrix import Matrix
from adafruit_matrixportal.network import Network
from adafruit_display_text import label

API_KEY = "4f5adc168e2b40f7a4e301cb644c1f0e"
STOP_ID = "F05"
REFRESH_INTERVAL = 30
CAP_CACHE_INTERVAL = 30
STATUS_FILE = "/status.txt"

URL_ARRIVALS = (
    "https://api.wmata.com/StationPrediction.svc/json/GetPrediction/"
)

matrix = Matrix(width=64, height=32, bit_depth=1)
network = Network()
capacity_cache = None
last_cap_time = 0

def save_last_board(texts):
    try:
        with open(STATUS_FILE, "w") as f:
            json.dump(texts, f)
    except Exception as e:
        print("Failed saving board:", e)

def load_last_board():
    try:
        with open(STATUS_FILE, "r") as f:
            return json.load(f)
    except OSError:
        return None

def board_screen(labels_texts):
    gc.collect()
    group = displayio.Group()
    F = terminalio.FONT
    ORANGE = 0xFFA500
    WHITE  = 0xFFFFFF
    GREEN  = 0x00FF00
    YELLOW = 0xFFFF00
    RED    = 0xFF0000
    XDIR = 0
    XMIN = 24
    XOCC = 46
    Y0 = 4
    LINE1_Y = 14
    LINE2_Y = 25

    for txt, x in (("DIR", XDIR), ("MIN", XMIN), ("OCC", XOCC)):
        h = label.Label(F, text=txt, color=ORANGE)
        h.x, h.y = x, Y0
        group.append(h)

    for row in range(2):
        y = LINE1_Y if row == 0 else LINE2_Y
        d,t,o = labels_texts[row*3 + 0], labels_texts[row*3 + 1], labels_texts[row*3 + 2]
        lbl_d = label.Label(F, text=d, color=WHITE)
        lbl_d.x, lbl_d.y = XDIR, y
        lbl_m = label.Label(F, text=t, color=WHITE)
        lbl_m.x, lbl_m.y = XMIN, y
        try:
            pct = int(o.strip("%"))
            c = GREEN if pct < 50 else YELLOW if pct < 75 else RED
        except:
            c = WHITE
        lbl_o = label.Label(F, text=o, color=c)
        lbl_o.x, lbl_o.y = XOCC, y

        group.append(lbl_d)
        group.append(lbl_m)
        group.append(lbl_o)

    matrix.display.root_group = group
    gc.collect()

last = load_last_board()
if last and len(last) == 6:
    board_screen(last)
else:
    board_screen(["--", "--m", "--%", "--", "--m", "--%"])

print("Connecting to WiFi…")
network.connect()
print("WiFi connected")

def is_spi_char_error(exc):
    """Detect common SPI/socket error messages that indicate ESP32 SPI problems."""
    try:
        s = str(exc)
    except Exception:
        return False
    s = s.lower()
    # common texts: "spi char", "timed out waiting for spi char", "outofretries", "repeated socket failures"
    return ("spi char" in s) or ("timed out waiting for spi char" in s) or ("outofretries" in s) or ("repeated socket failures" in s)

while True:
    try:
        now = time.monotonic()

        r = network._wifi.requests.get(URL_ARRIVALS)
        if r.status_code != 200:
            raise RuntimeError("Arrivals HTTP", r.status_code)
        stops = r.json()
        r.close()
        gc.collect()

        times = stops['Trains'][0].get("Min", [])
        arrivals = times[:2]

        texts = []
        for entry in arrivals:
            seconds = entry["Seconds"]
            vid = entry.get("VehicleId") or entry.get("VehicleID")
            pct = int(capacity_cache.get(str(vid), 0))
            if seconds < 60:
                mtxt = "ARR"
            else:
                mtxt = f"{seconds // 60}m"
            texts += ["NB", mtxt, f"{pct}%"]

        while len(texts) < 6:
            texts += ["--", "--m", "--%"]

        board_screen(texts)
        save_last_board(texts)
        time.sleep(REFRESH_INTERVAL)

    except MemoryError:
        print("MemoryError: restore last board then reboot")
        last = load_last_board()
        if last and len(last) == 6:
            board_screen(last)
        else:
            board_screen(["--", "--m", "--%", "--", "--m", "--%"])
        time.sleep(3)
        supervisor.reload()

    except Exception as e:
        print("Error:", e)
        # If this is an SPI/ESP32 socket-character error, save state and soft reboot
        if is_spi_char_error(e):
            print("Detected SPI Char / socket error, saving last board and soft rebooting...")
            try:
                # attempt to persist the displayed text if possible
                # load current display entries (best-effort: use last saved)
                last = load_last_board()
                if last and len(last) == 6:
                    save_last_board(last)
            except Exception as ex:
                print("Error saving before reboot:", ex)
            time.sleep(1)
            supervisor.reload()
        # otherwise sleep and continue
        time.sleep(REFRESH_INTERVAL)
