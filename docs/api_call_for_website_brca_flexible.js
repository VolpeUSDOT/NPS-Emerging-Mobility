/* variable to retrieve dropdown value */
var dropDown = document.getElementById("chooseStop");

// api base, for both directions if needed
const baseAPIurl = "https://brycecanyonshuttle.com/Services/JSONPRelay.svc/GetStopArrivalTimes?apiKey=8882812681&stopIds=";

/* variables to set stop id from user input */
var inboundStopId = "";
var outboundStopId = "";
var stopName = "";
var urloutb = baseAPIurl + outboundStopId + "&version=2";
var urlinb = baseAPIurl + inboundStopId + "&version=2"; 
let showOvernightTime = false;

/* when displaying times, cycle between time and announcements every 15 seconds */
async function toggleSlides() {
  var slide_timetables = document.getElementById("timetables");
  var slide_notices = document.getElementById("notices");
  
  var timetables_display_style = slide_timetables.style.display;
  var notices_display_style = slide_notices.style.display;
  
  //swap which is on display
  slide_notices.style.display = timetables_display_style; 
  slide_timetables.style.display = notices_display_style; 
}

// Helper to determine active schedule based on current date in Denver time
function getShuttleSeasonConfig() {
  // Translate current time to Denver time before extracting the month/day
  const denverDateStr = new Date().toLocaleString("en-US", { timeZone: "America/Denver" });
  const nowDenver = new Date(denverDateStr);
  const mmdd = (nowDenver.getMonth() + 1) * 100 + nowDenver.getDate();

  // Spring & Fall Service
  if ((mmdd >= 403 && mmdd <= 508) || (mmdd >= 921 && mmdd <= 1018)) {
    return { isOffseason: false, lastShuttleTime: "5:45 PM", startHour: 19, endHour: 7, message: "Shuttles will resume at 8 am." };
  }
  
  // Summer Service
  if (mmdd >= 509 && mmdd <= 920) {
    return { isOffseason: false, lastShuttleTime: "7:30 PM", startHour: 21, endHour: 7, message: "Shuttles will resume at 8 am." };
  }

  // Off-Season
  return { isOffseason: true, lastShuttleTime: null, startHour: null, endHour: null, message: "The shuttle season has ended and will resume in early April." };
}

// Dynamically update the notices list item text
function updateNoticesText(config) {
  const noticeItem = document.getElementById("last-shuttle-notice");
  if (!noticeItem) return;

  noticeItem.innerHTML = config.isOffseason 
    ? "<strong>Plan Accordingly:</strong> Shuttle service has ended for the season and will resume in early April."
    : `<strong>Plan Accordingly:</strong> Last Shuttle begins route from Shuttle Station at <strong>${config.lastShuttleTime}</strong>`;
}

function checkOvernightStatus() {
  const config = getShuttleSeasonConfig();
  updateNoticesText(config);

  // Use Denver time to check the current hour
  const denverDateStr = new Date().toLocaleString("en-US", { timeZone: "America/Denver" });
  const nowDenver = new Date(denverDateStr);
  
  const isOvernight = config.isOffseason || (nowDenver.getHours() >= config.startHour || nowDenver.getHours() < config.endHour);
  document.body.classList.toggle('overnight', isOvernight);

  if (isOvernight) {
    const overlay = document.getElementById("overnight-overlay");
    if (overlay) {
      // Display the current time formatted to Denver timezone
      overlay.textContent = showOvernightTime 
        ? new Date().toLocaleTimeString("en-US", { timeZone: "America/Denver", hour: 'numeric', minute: '2-digit' }) 
        : config.message;
      showOvernightTime = !showOvernightTime;
    }
  } else {
    showOvernightTime = false;
  }
}

// Run immediately on script load
checkOvernightStatus();

/* When the user selects stop, go there */
function chosenSite() {
  inboundStopId = dropDown.value;
  stopName = dropDown.options[dropDown.selectedIndex].text;
  
  if(dropDown.value == "11") outboundStopId = "15";
  else if(dropDown.value == "3") outboundStopId = "6";
  else if(dropDown.value == "47") outboundStopId = "49";
  else {
    document.getElementById("outboundTimes").style.display = "none";
    document.getElementById("inboundLabel").style.display = "none";
    document.getElementById("inboundTimes").style.width = "100%";
  }
  
  urloutb = baseAPIurl + outboundStopId + "&version=2";
  urlinb = baseAPIurl + inboundStopId + "&version=2";
  
  document.getElementById("titleLine").textContent = "Upcoming Departures from " + stopName;
 
  document.getElementById("welcome").style.display = "none";
  document.getElementById("timetables").style.display = "none";
  document.getElementById("notices").style.display = "block";
  document.getElementById("constantInfo").style.display = "block";
}

// get live predictions for departures
async function fetchGTFSdata(direction) {
  const url = direction == "outbound" ? urloutb : urlinb;

  try {
    const response = await fetch(url);
    if(!response.ok) throw new Error("Could not fetch real time data");
    const brcaShuttle = await response.json();
    
    const predictedWaits = [];
    const vehicleOccStatus = [];
    
    // Fetch capacity API once per direction rather than inside the prediction loop
    let liveOccStatus = null;
    if (brcaShuttle[0].Times.some(pred => pred.IsDeparted === false && pred.VehicleId != null)) {
        const liveOccStatusResponse = await fetch("https://brycecanyonshuttle.com/Services/JSONPRelay.svc/GetVehicleCapacities");
        liveOccStatus = await liveOccStatusResponse.json();
    }

    for(const pred of brcaShuttle[0].Times) {
      if (predictedWaits.length < 3 && pred.IsDeparted == false){
        predictedWaits.push(pred.Seconds);
        if (pred.VehicleId != null && liveOccStatus != null) {
          vehicleOccStatus.push(liveOccStatus[pred.VehicleId - 1]["Percentage"]); 
        }
      }
    }
    
    // clear old departure times
    for (let i = 1; i <= 3; i++) {
        document.getElementById(direction + i).textContent = "";
    }
    
    // calculate wait times using native Date math
    for(let i = 0; i < predictedWaits.length; i++) {
      const waittimeMinutes = Math.floor(predictedWaits[i] / 60);
      const departureTime = new Date(Date.now() + predictedWaits[i] * 1000);
      
      // Explicitly format departure time to the Denver timezone
      const strTime = departureTime.toLocaleTimeString("en-US", { 
        timeZone: "America/Denver", 
        hour: 'numeric', 
        minute: '2-digit' 
      }).toLowerCase().replace(' ', '');
      
      const elName = direction + String(i + 1);
      
      if(i < vehicleOccStatus.length) {
        const crowdingDot = document.getElementById(elName + "icon");
        if (vehicleOccStatus[i] < 0.4) crowdingDot.setAttribute("src", "images/one_person_icon.png");
        else if (vehicleOccStatus[i] < 0.8) crowdingDot.setAttribute("src", "images/two_person_icon.png");
        else crowdingDot.setAttribute("src", "images/three_person_icon.png");
      }
      
      let upcomingText = waittimeMinutes < 1 
        ? "NOW ARRIVING " 
        : `${strTime} - ${waittimeMinutes} minute${waittimeMinutes === 1 ? '' : 's'} `;
        
      document.getElementById(elName).textContent = upcomingText;
    }
  } catch(error) {
    console.error(error);
  }
}

var secondsCountdown = setInterval(function() {
  var countdownElement = document.getElementById("countdownBox");
  countdownElement.innerHTML = Number(countdownElement.innerHTML) - 1;
}, 1000);

var updatePage = setInterval((function() {
  checkOvernightStatus(); 
  fetchGTFSdata("outbound");
  fetchGTFSdata("inbound");
  toggleSlides();
  document.getElementById("countdownBox").innerHTML = 20;
}), 20000);