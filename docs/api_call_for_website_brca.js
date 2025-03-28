
// api query for outbound and inbound. using 1 bus at MIT arrivals
const urloutb = "https://brycecanyonshuttle.com/Services/JSONPRelay.svc/GetStopArrivalTimes?apiKey=8882812681&stopIds=6&version=2";
const urlinb = "https://brycecanyonshuttle.com/Services/JSONPRelay.svc/GetStopArrivalTimes?apiKey=8882812681&stopIds=14&version=2";

// switch military time to string am pm time
function formatAMPM(militaryTime) {
  var hours = militaryTime.substring(0,2);
  var minutes = militaryTime.substring(3,5);
  var ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
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
      throw new Error("Could not fetch mbta data");
    }
    const brcaShuttle = await response.json();
    //console.log(brcaShuttle);

    // pull out the departure times only
    const predictedWaits = [];
    const vehicleOccStatus = [];
    for(const pred of brcaShuttle[0].Times) {
      if (predictedWaits.length < 3){
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
      if(departureTimeMinutes > 60) {
        depatureTimeHours = hours + 1;
        departureTimeMinutes = departureTimeMinutes - 60;
      }
      // determine ampm
      var ampm = depatureTimeHours >= 12 ? 'pm' : 'am';
      depatureTimeHours = depatureTimeHours % 12;
      
      // construct departure time
      var strTime = depatureTimeHours + ':' + String(departureTimeMinutes).padStart(2, '0') + ' ' + ampm;
      predictedDepartures.push(strTime);

      // get corresponding element
      var elName = direction + String(i + 1);
      var timeDisplay = document.getElementById(elName);
      // update crowding icon
      var crowdingElName = elName + "icon";
      // var crowdingDisplay = document.getElementById(crowdingElName);
      let crowdEmojis = "";
      if(vehicleOccStatus.length < i) {
        switch (true) {
          case vehicleOccStatus[i] < 0.4:
              // crowdingDisplay.className = "fa-solid fa-user";
              crowdEmojis = "👤";
              break;
          case vehicleOccStatus[i] < 0.8:
              // crowdingDisplay.className = "fa-solid fa-user-group";
              crowdEmojis = "👥";
              break;
          case vehicleOccStatus[i] > 0.9:
            crowdEmojis = "👥👥";
              // crowdingDisplay.className = "fa-solid fa-people-group";
              break;
        }
      }
      console.log(crowdEmojis);
      // update detail in the actual webpage
      let upcomingText = strTime + " - " + String(waittimeMinutes) + " minutes " + crowdEmojis;
      timeDisplay.textContent = String(upcomingText);
    }

    //update last updated in the webpage
    var currtimeDisplay = document.getElementById("currtime");
    let updatedText = "Last Updated " + formatAMPM(String(hours).padStart(2, '0') + ":" + String(minutes).padStart(2, '0'));
    currtimeDisplay.textContent = String(updatedText);

  }

  catch(error){
    console.error(error);
  }
}

// get wait times for next three arrivals at both stations
var updatePage = setInterval((function() {
  fetchGTFSdata("outbound");
  fetchGTFSdata("inbound");
}
), 3000); //refresh every 30 seconds

