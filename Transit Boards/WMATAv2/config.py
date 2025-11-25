from adafruit_bitmap_font import bitmap_font

config = {
    #########################
    # Network Configuration #
    #########################
    'wifi_ssid': 'Verizon-M3100-6587',
    'wifi_password': 'd8a73df6',
    # 'wifi_ssid': 'iPhoneV-09457',
    # 'wifi_password': 'Volpe2022',

    #########################
    # Metro Configuration   #
    #########################
    'metro_station_code': 'F05',
    'train_group': '1',
    'metro_api_key': '4f5adc168e2b40f7a4e301cb644c1f0e',
    'metro_api_url': 'https://api.wmata.com/StationPrediction.svc/json/GetPrediction/',
    'metro_api_retries': 2,

    #########################
    # Refresh Timing        #
    #########################
    'refresh_interval': 5,

    #########################
    # Display Settings      #
    #########################
    'matrix_width': 64,        # panel width in pixels
    'matrix_height': 32,       # panel height in pixels  <— ADD THIS
    'num_trains': 3,
    'font': bitmap_font.load_font('lib/5x7.bdf'),
    'character_width': 5,
    'character_height': 7,
    'text_padding': 1,
    'text_color': 0xFF7500,
    'loading_destination_text': 'Loading',
    'loading_min_text': '---',
    'loading_line_color': 0xFF00FF,
    'heading_text': 'LN DEST   MIN',
    'heading_color': 0xFF0000,
    'train_line_height': 6,
    'train_line_width': 2,
    'min_label_characters': 3,
    'destination_max_characters': 8,
}
