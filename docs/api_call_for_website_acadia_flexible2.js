const ACADIA = {
  departureStopId: "1",
  departureApiBase: "https://brycecanyonshuttle.com/Services/JSONPRelay.svc/GetStopArrivalTimes?apiKey=8882812681&stopIds=",
  rtFeedUrl: "https://islandexplorertracker.availtec.com/InfoPoint/GTFS-Realtime.ashx?&Type=VehiclePosition&serverid=0",
  departuresRefreshMs: 25000,
  liveRefreshMs: 15000,
  routeBounds: {
    north: 44.46,
    south: 44.25,
    west: -68.42,
    east: -68.10,
  },
};

const pageMode = document.body.classList.contains("acadia-live") ? "live" : "departures";
const departureTitle = "Upcoming Departures from Acadia Gateway Center";

let protobufRoot = null;
let protobufFeedType = null;

function getElement(id) {
  return document.getElementById(id);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatClock(date) {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  if (hours === 0) {
    hours = 12;
  }
  return `${hours}:${minutes} ${ampm}`;
}

function formatWait(secondsUntil) {
  if (secondsUntil < 60) {
    return "Arriving now";
  }

  const waitMinutes = Math.max(1, Math.round(secondsUntil / 60));
  const departure = new Date(Date.now() + secondsUntil * 1000);
  return `${formatClock(departure)} - ${waitMinutes} minutes`;
}

async function fetchDepartureTimes() {
  const url = `${ACADIA.departureApiBase}${ACADIA.departureStopId}&version=2`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not fetch Acadia departure data");
  }

  const payload = await response.json();
  const times = ((payload && payload[0] && payload[0].Times) || []).slice(0, 3);
  const ids = ["inbound1", "inbound2", "inbound3"];

  ids.forEach((id, index) => {
    const el = getElement(id);
    if (!el) {
      return;
    }

    if (!times[index]) {
      el.textContent = index === 0 ? "No upcoming departures" : "";
      return;
    }

    el.textContent = formatWait(times[index].Seconds || 0);
  });

  const countdown = getElement("countdownBox");
  if (countdown) {
    countdown.textContent = "25";
  }
}

function projectVehicle(lat, lon) {
  const { north, south, west, east } = ACADIA.routeBounds;
  const x = clamp((lon - west) / (east - west), 0, 1);
  const y = clamp((north - lat) / (north - south), 0, 1);
  return {
    x: 4 + x * 92,
    y: 4 + y * 92,
  };
}

function ensureRtSchema() {
  if (!window.protobuf) {
    throw new Error("protobuf.js is not loaded");
  }

  if (protobufRoot) {
    return protobufFeedType;
  }

  protobufRoot = window.protobuf.Root.fromJSON({
    nested: {
      transit_realtime: {
        nested: {
          FeedMessage: {
            fields: {
              header: { type: "FeedHeader", id: 1 },
              entity: { rule: "repeated", type: "FeedEntity", id: 2 },
            },
          },
          FeedHeader: {
            fields: {
              gtfsRealtimeVersion: { type: "string", id: 1 },
              incrementality: { type: "Incrementality", id: 2 },
              timestamp: { type: "uint64", id: 3 },
            },
          },
          FeedEntity: {
            fields: {
              id: { type: "string", id: 1 },
              vehicle: { type: "VehiclePosition", id: 2 },
            },
          },
          VehiclePosition: {
            fields: {
              trip: { type: "TripDescriptor", id: 1 },
              position: { type: "Position", id: 2 },
              currentStopSequence: { type: "uint32", id: 3 },
              currentStatus: { type: "VehicleStopStatus", id: 4 },
              timestamp: { type: "uint64", id: 5 },
              vehicle: { type: "VehicleDescriptor", id: 6 },
            },
          },
          TripDescriptor: {
            fields: {
              tripId: { type: "string", id: 1 },
              routeId: { type: "string", id: 5 },
              directionId: { type: "uint32", id: 7 },
            },
          },
          VehicleDescriptor: {
            fields: {
              id: { type: "string", id: 1 },
              label: { type: "string", id: 2 },
              licensePlate: { type: "string", id: 3 },
            },
          },
          Position: {
            fields: {
              latitude: { type: "float", id: 1 },
              longitude: { type: "float", id: 2 },
              bearing: { type: "float", id: 3 },
              odometer: { type: "double", id: 4 },
              speed: { type: "float", id: 5 },
            },
          },
          Incrementality: {
            values: {
              FULL_DATASET: 0,
              DIFFERENTIAL: 1,
            },
          },
          VehicleStopStatus: {
            values: {
              INCOMING_AT: 0,
              STOPPED_AT: 1,
              IN_TRANSIT_TO: 2,
            },
          },
        },
      },
    },
  });

  protobufFeedType = protobufRoot.lookupType("transit_realtime.FeedMessage");
  return protobufFeedType;
}

function entityToVehicle(entity) {
  const vehicle = entity.vehicle || {};
  const position = vehicle.position || {};
  const trip = vehicle.trip || {};
  const id = (vehicle.vehicle && vehicle.vehicle.id) || vehicle.id || entity.id || vehicle.label || trip.tripId;

  if (position.latitude == null || position.longitude == null) {
    return null;
  }

  return {
    id: String(id || "vehicle"),
    lat: Number(position.latitude),
    lon: Number(position.longitude),
    routeId: String(trip.routeId || ""),
    label: String((vehicle.vehicle && vehicle.vehicle.label) || vehicle.label || ""),
    bearing: position.bearing == null ? null : Number(position.bearing),
    speed: position.speed == null ? null : Number(position.speed),
  };
}

function isRoute1Vehicle(vehicle) {
  const routeId = String(vehicle.routeId || "").trim().toLowerCase();
  return routeId === "1" || routeId === "route 1" || routeId === "route_1";
}

async function fetchVehiclePositions() {
  const rtType = ensureRtSchema();
  const response = await fetch(ACADIA.rtFeedUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not fetch Acadia GTFS-RT feed");
  }

  const buffer = await response.arrayBuffer();
  const message = rtType.decode(new Uint8Array(buffer));
  const entities = message.entity || [];
  return entities
    .map(entityToVehicle)
    .filter((vehicle) => vehicle && isRoute1Vehicle(vehicle));
}

function renderVehicleOverlay(vehicles) {
  const overlay = getElement("vehicleOverlay");
  const status = getElement("liveStatusText");
  if (!overlay || !status) {
    return;
  }

  while (overlay.firstChild) {
    overlay.removeChild(overlay.firstChild);
  }

  if (!vehicles.length) {
    status.textContent = "No Route 1 vehicles reported right now.";
    return;
  }

  status.textContent = `${vehicles.length} live vehicle${vehicles.length === 1 ? "" : "s"} on Route 1`;

  vehicles.forEach((vehicle) => {
    const point = projectVehicle(vehicle.lat, vehicle.lon);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", "vehicle-marker");
    group.setAttribute("transform", `translate(${point.x}, ${point.y})`);

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", "10");
    circle.setAttribute("cx", "0");
    circle.setAttribute("cy", "0");
    circle.setAttribute("fill", "#0B6E4F");
    circle.setAttribute("stroke", "#ffffff");
    circle.setAttribute("stroke-width", "3");

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", "14");
    label.setAttribute("y", "4");
    label.textContent = vehicle.label || vehicle.id;

    group.appendChild(circle);
    group.appendChild(label);
    overlay.appendChild(group);
  });
}

async function refreshLiveMap() {
  try {
    const vehicles = await fetchVehiclePositions();
    renderVehicleOverlay(vehicles);
    const countdown = getElement("countdownBox");
    if (countdown) {
      countdown.textContent = String(ACADIA.liveRefreshMs / 1000);
    }
  } catch (error) {
    const status = getElement("liveStatusText");
    if (status) {
      status.textContent = "Live vehicle feed unavailable.";
    }
    console.error(error);
  }
}

function startCountdown() {
  const countdown = getElement("countdownBox");
  if (!countdown) {
    return;
  }

  setInterval(() => {
    const current = Number(countdown.textContent || countdown.innerHTML || "0");
    if (Number.isFinite(current) && current > 0) {
      countdown.textContent = String(current - 1);
    }
  }, 1000);
}

function initDeparturesPage() {
  const title = getElement("titleLine");
  if (title) {
    title.textContent = departureTitle;
  }

  fetchDepartureTimes().catch((error) => {
    console.error(error);
  });

  setInterval(() => {
    fetchDepartureTimes().catch((error) => {
      console.error(error);
    });
  }, ACADIA.departuresRefreshMs);
}

function initLivePage() {
  const title = getElement("liveTitle");
  if (title) {
    title.textContent = "Acadia Route 1 Live Vehicles";
  }

  const baseMap = getElement("route_map");
  if (baseMap) {
    baseMap.addEventListener("load", () => {
      refreshLiveMap();
    }, { once: true });
  }

  refreshLiveMap().catch((error) => {
    console.error(error);
  });

  setInterval(() => {
    refreshLiveMap();
  }, ACADIA.liveRefreshMs);
}

startCountdown();

if (pageMode === "live") {
  initLivePage();
} else {
  initDeparturesPage();
}
