// Island Explorer API Endpoint for Acadia Gateway Center (Stop 74)
const stopId = "74";
const targetRouteId = "1";
const apiUrl = `https://islandexplorertracker.availtec.com/InfoPoint/rest/StopDepartures/Get/${stopId}`;

/* Cycle between departure timetable and info slide every 25s
async function toggleSlides() {
  const slide_timetables = document.getElementById("timetables");
  // const slide_notices = document.getElementById("notices");
  
  // if (slide_timetables && slide_notices) {
  //   if (slide_timetables.style.display === "none") {
  //     slide_timetables.style.display = "block";
  //     slide_notices.style.display = "none";
  //   } else {
  //     slide_timetables.style.display = "none";
  //     slide_notices.style.display = "block";
  //   }
  // }
} */

// Convert Date object to 12-hour AM/PM string
function formatAMPM(date) {
  let hours = date.getHours();
  let minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minutes} ${ampm}`;
}

// Safely parse ISO dates or WCF epoch dates (/Date(ms)/)
function parseInfoPointDate(timeStr) {
  if (!timeStr) return null;
  if (typeof timeStr === 'string' && timeStr.includes('/Date(')) {
    const timestamp = parseInt(timeStr.match(/\d+/)[0], 10);
    return new Date(timestamp);
  }
  const parsed = new Date(timeStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Fetch live arrival predictions from Island Explorer API
async function fetchGTFSdata() {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();

    const departuresList = [];

    if (Array.isArray(data) && data.length > 0) {
      const stopData = data[0];
      const routeDirections = stopData.RouteDirections || [];

      routeDirections.forEach(direction => {
        if (String(direction.RouteId) === String(targetRouteId)) {
          const departures = direction.Departures || [];
          departures.forEach(dep => {
            // Use EDT (Estimated Departure Time) if available, fallback to SDT (Scheduled)
            const rawTime = dep.EDT || dep.SDT;
            const depTime = parseInfoPointDate(rawTime);

            if (depTime) {
              departuresList.push({
                time: depTime,
                occupancy: dep.Occupancy !== undefined ? dep.Occupancy : null
              });
            }
          });
        }
      });
    }

    // Filter upcoming times and sort chronologically
    const now = new Date();
    const upcoming = departuresList
      .filter(d => d.time > now)
      .sort((a, b) => a.time - b.time)
      .slice(0, 3);

    // Update the next 3 departure slots on screen
    for (let i = 0; i < 3; i++) {
      const elId = `inbound${i + 1}`;
      const iconId = `${elId}icon`;
      const timeDisplay = document.getElementById(elId);
      const iconDisplay = document.getElementById(iconId);

      if (timeDisplay) {
        if (i < upcoming.length) {
          const dep = upcoming[i];
          const diffMs = dep.time - now;
          const waitMinutes = Math.max(0, Math.floor(diffMs / 60000));
          const formattedTime = formatAMPM(dep.time);

          const upcomingText = waitMinutes < 1 
            ? "Departing Now" 
            : `${waitMinutes} minutes`;

          timeDisplay.innerHTML = `<span class="time">${upcomingText}</span>`;

          // if (iconDisplay && dep.occupancy !== null) {
          //   const occRatio = dep.occupancy > 1 ? dep.occupancy / 100 : dep.occupancy;
          //   if (occRatio < 0.4) {
          //     iconDisplay.src = "images/one_person_icon.png";
          //   } else if (occRatio < 0.8) {
          //     iconDisplay.src = "images/two_person_icon.png";
          //   } else {
          //     iconDisplay.src = "images/three_person_icon.png";
          //   }
          // }
        } else {
          timeDisplay.innerHTML = i === 0 
            ? `<span class="time">No upcoming departures</span>` 
            : `<span class="time"></span>`;
        }
      }
    }

    // Make sure last updated time is current
    const updatedElement = document.getElementById("lastUpdated");
    if (updatedElement) {
      const formattedNow = formatAMPM(now);
      updatedElement.innerHTML = `<span>Last Updated ${formattedNow}</span>`;
    }

  } catch (error) {
    console.error("Error fetching InfoPoint departure data:", error);
  }
}

// // 1-second visual countdown
// setInterval(function () {
//   const countdownElement = document.getElementById("countdownBox");
//   if (countdownElement) {
//     let secondsLeft = parseInt(countdownElement.innerHTML, 10);
//     if (!isNaN(secondsLeft) && secondsLeft > 0) {
//       countdownElement.innerHTML = secondsLeft - 1;
//     }
//   }
// }, 1000);

// Fetch data and alternate display slides every 15 seconds -- just updating times now
// The slides are no longer changing
setInterval(function () {
  fetchGTFSdata();
  // toggleSlides();
  // const countdownElement = document.getElementById("countdownBox");
  // if (countdownElement) {
  //   countdownElement.innerHTML = "25";
  // }
}, 15000);

// Initial execution
fetchGTFSdata();