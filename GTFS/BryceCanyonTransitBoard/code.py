import time
import board
import displayio
from adafruit_display_text import label
from adafruit_matrixportal.matrixportal import MatrixPortal
import adafruit_requests as requests
import json
from config import config

# Setup Matrix Portal
matrix = MatrixPortal()

# Load the font from the config
font = config['font']  # Ensure this is set up in your config file

# Display "Loading..." message while connecting to Wi-Fi
def show_loading_message():
    loading_group = displayio.Group(max_size=1)
    loading_label = label.Label(font, text="Loading...", color=0xFFFFFF)
    loading_label.x = 10  # Adjust the x position if needed
    loading_label.y = 16  # Center vertically on the display
    loading_group.append(loading_label)
    matrix.display.show(loading_group)

# Show loading message before attempting to connect
show_loading_message()

# Connect to Wi-Fi
matrix.network.connect()

# API Endpoints
arrival_url_1 = "https://brycecanyonshuttle.com/Services/JSONPRelay.svc/GetStopArrivalTimes?apiKey=8882812681&stopIds=2&version=2"  # Stop 2
arrival_url_2 = "https://brycecanyonshuttle.com/Services/JSONPRelay.svc/GetStopArrivalTimes?apiKey=8882812681&stopIds=10&version=2"  # Stop 10
capacities_url = "https://brycecanyonshuttle.com/Services/JSONPRelay.svc/GetVehicleCapacities"

# Function to fetch vehicle arrival times
def fetch_vehicle_arrival_times(arrival_url):
    try:
        response = requests.get(arrival_url)
        if response.status_code == 200:
            jsonp_data = response.text
            json_data = jsonp_data.replace("callback(", "")[:-1]  # Properly handle the JSONP data
            parsed_data = json.loads(json_data)

            # Extract arrival times
            vehicle_arrival_seconds = {}
            for stop in parsed_data:
                for time in stop['Times']:
                    vehicle_id = time['VehicleId']
                    if vehicle_id:
                        seconds_until_arrival = time['Seconds']
                        vehicle_arrival_seconds[vehicle_id] = min(vehicle_arrival_seconds.get(vehicle_id, float('inf')), seconds_until_arrival)

            # Sort and return the next 2 vehicles
            return sorted(vehicle_arrival_seconds.items(), key=lambda x: x[1])[:2]  # Return 2 vehicles
        else:
            print(f"Failed to retrieve data: {response.status_code}")
            return []

    except Exception as e:
        print(f"Error fetching vehicle arrival times: {e}")
        return []

# Function to fetch vehicle capacities
def fetch_vehicle_capacities():
    try:
        response = requests.get(capacities_url)
        if response.status_code == 200:
            jsonp_data = response.text
            json_data = jsonp_data.replace("callback(", "")[:-1]  # Properly handle the JSONP data
            return json.loads(json_data)
        else:
            print(f"Failed to retrieve capacities: {response.status_code}")
            return []

    except Exception as e:
        print(f"Error fetching vehicle capacities: {e}")
        return []

# Create the parent group once for optimization
parent_group = displayio.Group(max_size=5)  # Optimized size for up to 2 vehicles and header

# Function to update the display with vehicle information
def update_display(arrivals, capacities, current_stop):
    # Clear the group only once
    while len(parent_group):
        parent_group.pop()

    # Prepare header once
    header_label = label.Label(font, text="DIR  MIN  OCC", color=0xFFFFFF)
    header_label.y = 3  # Move it to the top
    parent_group.append(header_label)

    # Create a mapping of Vehicle ID to Capacity information
    capacity_map = {cap['VehicleID']: cap for cap in capacities}

    start_y = 13  # Starting Y position

    # Reuse existing labels, update their content
    for i, (vehicle_id, seconds) in enumerate(arrivals):
        if i >= 2: break  # Display only 2 vehicles to limit usage

        minutes = seconds // 60  # Convert seconds to minutes, rounding down
        capacity_info = capacity_map.get(vehicle_id, {})
        percentage = capacity_info.get('Percentage', 0)

        # Determine direction based on the current stop
        direction = "SB" if current_stop == 0 else "NB"

        # Display "ARR" if minutes <= 0, otherwise show minutes as a whole number
        min_display = "ARR" if minutes <= 0 else str(int(minutes))

        # Choose the color for the OCC based on the occupancy percentage
        if percentage < 0.5:  # Less than 50%
            occ_color = 0x00FF00  # Green
        elif 0.5 <= percentage <= 0.75:  # Between 50% and 75%
            occ_color = 0xFFA500  # Orange
        else:  # Greater than 75%
            occ_color = 0xFF0000  # Red

        # Create and update labels for DIR, MIN, OCC
        dir_label = label.Label(font, text=f"{direction:<3}", color=0xFFFFFF)
        min_label = label.Label(font, text=f"{min_display:<5}", color=0xFFFFFF)
        occ_label = label.Label(font, text=f"{percentage:.0%}", color=occ_color)

        # Set positions for the labels
        y_pos = start_y + (i * 12)
        dir_label.y = min_label.y = occ_label.y = y_pos
        min_label.x = 25
        occ_label.x = 50

        # Add labels to the parent group
        parent_group.append(dir_label)
        parent_group.append(min_label)
        parent_group.append(occ_label)

    # Show the updated display
    matrix.display.show(parent_group)

# Main loop to fetch and display vehicle information
current_stop = 0  # 0 for Stop 2, 1 for Stop 10
while True:
    try:
        # Determine which arrival URL to use
        arrival_url = arrival_url_1 if current_stop == 0 else arrival_url_2
        arrivals = fetch_vehicle_arrival_times(arrival_url)
        capacities = fetch_vehicle_capacities()

        # Update the display with vehicle data
        if arrivals and capacities:
            update_display(arrivals, capacities, current_stop)
        else:
            print("No arrivals or capacities to display.")

        # Toggle stop every 10 seconds
        current_stop = 1 - current_stop  # Flip between 0 and 1
        time.sleep(10)  # Wait before fetching again

    except Exception as e:
        print(f"Error: {e}")
        time.sleep(10)  # Wait before retrying
