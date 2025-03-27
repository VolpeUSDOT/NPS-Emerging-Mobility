
// api query for outbound and inbound. using 1 bus at MIT arrivals
const urloutb = "https://api-v3.mbta.com/predictions?page%5Blimit%5D=3&sort=departure_time&fields%5Bprediction%5D=departure_time&filter%5Bstop%5D=97";
const urlinb = "https://api-v3.mbta.com/predictions?page%5Blimit%5D=3&sort=departure_time&fields%5Bprediction%5D=departure_time&filter%5Bstop%5D=75";

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
    const mbta = await response.json();

    // pull out the departure times only
    const predictedDepartures = [];
    const vehicleOccStatus = [];
    for(const pred of mbta.data) {
      const text = pred.attributes.departure_time;
      // save predicted departure time, drop the date
      predictedDepartures.push(text.substring(11, 19));
      // get also occupancy status using vehicle id
      const currVehicID = pred.relationships.vehicle.data.id;
      const liveOccStatusResponse = await fetch("https://api-v3.mbta.com/vehicles/" + currVehicID + "?fields%5Bvehicle%5D=occupancy_status&include=stop");
      const liveOccStatus = await liveOccStatusResponse.json();
      vehicleOccStatus.push(liveOccStatus.data.attributes.occupancy_status);
    }
    //console.log(predictedDepartures);

    // assemble current time
    let now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();
    
    // calculate wait times
    const predictedWaits = []
    for(let i = 0; i < predictedDepartures.length; i++) {
      var departure = predictedDepartures[i];
      var waittime = 60*(departure.substring(0,2)-hours) + (departure.substring(3,5)-minutes) + (1/60)*(departure.substring(6,8)-seconds);
      // always round departure time down (if bus arrives in 1 min 50 seconds, say 1 minute)
      predictedWaits.push(Math.floor(waittime));

      // if wait time comes out as negative, force it to zero
      if(predictedWaits[i] < 0) {
        predictedWaits[i] = 0;
      }

      // get corresponding element
      var elName = direction + String(i + 1);
      var timeDisplay = document.getElementById(elName);
      // update crowding icon
      // var crowdingElName = elName + "icon";
      console.log(vehicleOccStatus[i])
      // var crowdingDisplay = document.getElementById(crowdingElName);
      var crowdEmojis = "";
      switch (true) {
        case vehicleOccStatus[i] == 'MANY_SEATS_AVAILABLE':
            // crowdingDisplay.className = "fa-solid fa-user";
            crowdEmojis = "👤";
            break;
        case vehicleOccStatus[i] == 'FEW_SEATS_AVAILABLE':
            // crowdingDisplay.className = "fa-solid fa-user-group";
            crowdEmojis = "👥";
            break;
        case vehicleOccStatus[i] == 'NO_DATA_AVAILABLE':
            crowdEmojis = "";
            // crowdingDisplay.className = "";
            break;
        case vehicleOccStatus[i] == 'STANDING_ROOM_ONLY' || vehicleOccStatus[i] == 'CRUSHED_STANDING_ROOM_ONLY' :
          crowdEmojis = "👥👤";
            // crowdingDisplay.className = "fa-solid fa-people-group";
            break;
        case vehicleOccStatus[i] == 'FULL' || vehicleOccStatus[i] == 'NOT_ACCEPTING_PASSENGERS':
          crowdEmojis = "👥👥";
            // crowdingDisplay.className = "fa-solid fa-people-group";
            break;
      }
      // update detail in the actual webpage
      let upcomingText = formatAMPM(predictedDepartures[i]) + " - " + String(predictedWaits[i]) + " minutes " + crowdEmojis;
      timeDisplay.textContent = String(upcomingText);
    }

    //update last updated in the webpage
    var currtimeDisplay = document.getElementById("currtime"); 
    let dateTimeNow = new Date();
    let updatedText = "Last Updated " + formatAMPM(String(dateTimeNow.getHours()) + ":" + String(dateTimeNow.getMinutes()));
    currtimeDisplay.textContent = String(updatedText);

    console.log(dateTimeNow)

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

