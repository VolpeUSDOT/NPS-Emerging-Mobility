/* variable to retrieve dropdown value */
var dropDown = document.getElementById("chooseStop")

// api base, for both directions if needed
const baseAPIurl = "https://brycecanyonshuttle.com/Services/JSONPRelay.svc/GetStopArrivalTimes?apiKey=8882812681&stopIds="

/* variables to set stop id from user input */
var inboundStopId = "";
var outboundStopId = "";
var stopName = "";
var urloutb = baseAPIurl + outboundStopId + "&version=2";
var urlinb = baseAPIurl + outboundStopId + "&version=2";
let showOvernightTime = false;

/* when displaying times, cycle between time and announcements every 15 seconds */
async function toggleSlides() {
  
  var slide_timetables = document.getElementById("timetables");
  var slide_notices = document.getElementById("notices");
  timetables_display_style = slide_timetables.style.display;
  notices_display_style = slide_notices.style.display;
  
  //swap which is on display
  slide_notices.style.display = timetables_display_style; 
  slide_timetables.style.display = notices_display_style; 
 
}

// Helper to determine active schedule based on current date
function getShuttleSeasonConfig(now = new Date()) {
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();
  const mmdd = month * 100 + day; // e.g., April 3 = 403, Oct 18 = 1018

  // Spring Service (Apr 3 – May 8) & Fall Service (Sep 21 – Oct 18)
  if ((mmdd >= 403 && mmdd <= 508) || (mmdd >= 921 && mmdd <= 1018)) {
    return {
      isOffseason: false,
      lastShuttleTime: "5:45 PM",
      startHour: 19, // 7 PM
      endHour: 7,    // 7 AM
      message: "Shuttles will resume at 8 am."
    };
  }
  
  // Summer Service (May 9 – Sep 20)
  if (mmdd >= 509 && mmdd <= 920) {
    return {
      isOffseason: false,
      lastShuttleTime: "7:30 PM",
      startHour: 21, // 9 PM
      endHour: 7,    // 7 AM
      message: "Shuttles will resume at 8 am."
    };
  }

  // Off-Season (Oct 19 – Apr 2)
  return {
    isOffseason: true,
    lastShuttleTime: null,
    startHour: null,
    endHour: null,
    message: "The shuttle season has ended and will resume in early April."
  };
}

// Dynamically update the notices list item text
function updateNoticesText(config) {
  const noticeItem = document.getElementById("last-shuttle-notice");
  if (!noticeItem) return;

  if (config.isOffseason) {
    noticeItem.innerHTML = "<strong>Plan Accordingly:</strong> Shuttle service has ended for the season and will resume in early April.";
  } else {
    noticeItem.innerHTML = `<strong>Plan Accordingly:</strong> Last Shuttle begins route from Shuttle Station at <strong>${config.lastShuttleTime}</strong>`;
  }
}

function checkOvernightStatus() {
  const now = new Date();
  const currentHour = now.getHours();
  const config = getShuttleSeasonConfig(now);

  // Update schedule notice text
  updateNoticesText(config);

  // Determine if the black screen overlay should display
  let isOvernight = false;
  if (config.isOffseason) {
    isOvernight = true; // Display continuously 24/7 during off-season
  } else {
    // Display between seasonal evening start hour (19:00 or 21:00) and 07:00 AM
    isOvernight = currentHour >= config.startHour || currentHour < config.endHour;
  }
  
  document.body.classList.toggle('overnight', isOvernight);

  if (isOvernight) {
    const overlay = document.getElementById("overnight-overlay");
    if (overlay) {
      if (showOvernightTime) {
        overlay.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      } else {
        overlay.textContent = config.message;
      }
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
  
  /* set values from selections*/
  inboundStopId = dropDown.value;
  stopName = dropDown.options[dropDown.selectedIndex].text;
  if(dropDown.value == "11"){ // rubys campground
     outboundStopId = "15";
  } else if(dropDown.value == "3"){ // sunset campground
     outboundStopId = "6";
  } else if(dropDown.value == "47"){ // visitor center
     outboundStopId = "49";
  } else {
    /* if no outbound, then don't show outbound or directional labels*/
    var outboundTimetable = document.getElementById("outboundTimes");
    outboundTimetable.style.display = "none";  // <-- Set it to none
    var inboundLabel = document.getElementById("inboundLabel");
    inboundLabel.style.display = "none";  // <-- Set it to none
    /* also shift time to be in middle, not half */
    var inboundTimetable = document.getElementById("inboundTimes");
    inboundTimetable.style.width = "100%";  // <-- Set it to 100% instead of 50%
    
  }
  
  /* set api to the right stop */
  urloutb = baseAPIurl + outboundStopId + "&version=2";
  urlinb = baseAPIurl + inboundStopId + "&version=2";
  
  /* customize text elements */
  var titleLine = document.getElementById("titleLine");
  titleLine.textContent = "Upcoming Departures from " + stopName;
 
  /* get dropdown to disappear, timetable to appear */
  var preContent = document.getElementById("welcome");
  preContent.style.display = "none";  // <-- Set it to none
  var slide_timetables = document.getElementById("timetables");
  slide_timetables.style.display = "none";  // <-- Set it to block
  var slide_timetables = document.getElementById("notices");
  slide_timetables.style.display = "block";  // <-- Set it to block
  var mapPlusCountdown = document.getElementById("constantInfo");
  mapPlusCountdown.style.display = "block";  // <-- Set it to block
}

// switch military time to string am pm time
function formatAMPM(militaryTime) {
  var hours = militaryTime.substring(0,2);
  var minutes = militaryTime.substring(3,5);
  while(minutes >= 60) { // the minutes shouldn't be getting to 60
    minutes = minutes - 60;
    hours = hours + 1;
  }
  var ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  if(hours == 0) { // the hour '0' should be '12'
    hours = 12;
  }
  var strTime = hours + ':' + minutes + ' ' + ampm;
  return strTime;
}

// get live predictions for departures
async function fetchGTFSdata(direction) {

  var url = urlinb;
  if(direction == "outbound") {
    var url = urloutb;
  } 

  try{
    const response = await fetch(url);
    if(!response.ok) {
      throw new Error("Could not fetch real time data");
    }
    const brcaShuttle = await response.json();
    //console.log(brcaShuttle);
    
  console.log(urloutb)
  console.log(urlinb)

    // pull out the departure times only
    const predictedWaits = [];
    const vehicleOccStatus = [];
    for(const pred of brcaShuttle[0].Times) {
      if (predictedWaits.length < 3 & pred.IsDeparted == false){
        //console.log(pred);
        const text = pred.Seconds;
        // save predicted departure time, drop the date
        predictedWaits.push(text);
        // get also occupancy status using vehicle id
        const currVehicID = pred.VehicleId;
        if (currVehicID != null) {
          const liveOccStatusResponse = await fetch("https://brycecanyonshuttle.com/Services/JSONPRelay.svc/GetVehicleCapacities");
          const liveOccStatus = await liveOccStatusResponse.json();
          vehicleOccStatus.push(liveOccStatus[currVehicID - 1]["Percentage"]); 
          console.log(liveOccStatus[currVehicID - 1]);
        }
      }
    }
    
    // assemble current time
    let now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();

    // clear old departure times before setting anew
    var inbound1Display = document.getElementById("inbound1")
    inbound1Display.textContent = "";
    var inbound2Display = document.getElementById("inbound2")
    inbound2Display.textContent = "";
    var inbound3Display = document.getElementById("inbound3")
    inbound3Display.textContent = "";
    // same for outbound
    var outbound1Display = document.getElementById("outbound1")
    outbound1Display.textContent = "";
    var outbound2Display = document.getElementById("outbound2")
    outbound2Display.textContent = "";
    var outbound3Display = document.getElementById("outbound3")
    outbound3Display.textContent = "";
    
    // calculate wait times
    const predictedDepartures = [];
    for(let i = 0; i < predictedWaits.length; i++) {
      var waittime = predictedWaits[i];
      var waittimeMinutes = Math.floor((1/60)*(waittime));
      // construct expected arrival time from seconds to arrival
      var departureTimeMinutes = minutes + Math.floor((seconds + waittime)/60);
      console.log(String(departureTimeMinutes).padStart(2, '0'));
      var depatureTimeHours = hours;
      // minutes exceeds 60, subtract 60 and add an hour. shuttles don't run at midnight so shouldn't have to handle hour carryovers
      while(departureTimeMinutes >= 60) {
        depatureTimeHours = depatureTimeHours + 1;
        departureTimeMinutes = departureTimeMinutes - 60;
      }
      
      // determine ampm, set time to 12-hour format
      var ampm = depatureTimeHours >= 12 ? 'pm' : 'am';
      depatureTimeHours = depatureTimeHours % 12;
      if(depatureTimeHours == 0) { // the hour '0' should be '12'
        depatureTimeHours = 12;
      }
      
      // construct departure time
      var strTime = depatureTimeHours + ':' + String(departureTimeMinutes).padStart(2, '0') + ' ' + ampm;
      predictedDepartures.push(strTime);
      
      // get corresponding element
      var elName = direction + String(i + 1);
      var timeDisplay = document.getElementById(elName);
      // update crowding icon
      console.log(vehicleOccStatus.length);
      var crowdingDot1 = document.getElementById(elName + "icon");
      if(i < vehicleOccStatus.length) {
        console.log(vehicleOccStatus[i])
        switch (true) {
          case vehicleOccStatus[i] < 0.4:
              crowdingDot1.setAttribute("src", "images/one_person_icon.png");
              break;
          case vehicleOccStatus[i] < 0.8:
              crowdingDot1.setAttribute("src", "images/two_person_icon.png");
              break;
          case vehicleOccStatus[i] > 0.9:
              crowdingDot1.setAttribute("src", "images/three_person_icon.png");
              break;
        }
      }
      // update detail in the actual webpage
      // if wait time comes out as less than 1, say "Arriving in <1 minute"
      let upcomingText = ""
      if(waittimeMinutes < 1) {
        upcomingText = "NOW ARRIVING ";
      } else if(waittimeMinutes == 1) {
        upcomingText = strTime + " - 1 minute ";
      } else {
        upcomingText = strTime + " - " + String(waittimeMinutes) + " minutes ";
      }
      timeDisplay.textContent = String(upcomingText);
    }
  }

  catch(error){
    console.error(error);
  }
}

var secondsCountdown = setInterval(function() {

  // Find the distance between now and the count down date
  var countdownElement = document.getElementById("countdownBox");
  // get current seconds displayed
  var secondsLeft = Number(countdownElement.innerHTML);
  // Output the result in element
  countdownElement.innerHTML = secondsLeft - 1;
    
}, 1000);


/* Update your existing updatePage interval */
var updatePage = setInterval((function() {
  checkOvernightStatus(); // Executes the 20-second toggle loop
  fetchGTFSdata("outbound");
  fetchGTFSdata("inbound");
  toggleSlides();
  
  // kick off another 20 second count down
  document.getElementById("countdownBox").innerHTML = 20
}
), 20000);
