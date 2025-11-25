from adafruit_bitmap_font import bitmap_font

config = {


	#########################
	# Metro Configuration   #
	#########################

	# Metro Station Code
	'metro_station_code': 'B04',

	# Metro Train Group
	'train_group1': '1',
	'train_group2': '2',


	# Metro Station Code
	'metro_station_codes': ['E03','C02'],

	# Metro Train Group
	'train_groups': ['2','2'],

	# API Key for WMATA
	'metro_api_key': 'your api key here',

	#########################
	# Other Values You      #
	# Probably Shouldn't    #
	# Touch                 #
	#########################
	'metro_api_url': 'https://api.wmata.com/StationPrediction.svc/json/GetPrediction/',
	'metro_api_retries': 2,
	'refresh_interval': 5, # 5 seconds is a good middle ground for updates, as the processor takes its sweet ol time

	# Display Settings
	'matrix_width': 64,
	'num_trains': 3,
	'font': bitmap_font.load_font('lib/5x7.bdf'),

	'character_width': 5,
	'character_height': 7,
	'text_padding': 1,
	'text_color': 0xFF7500,

	'loading_destination_text': 'Loading',
	'loading_min_text': '---',
	'loading_line_color': 0xFF00FF, # Something something Purple Line joke

	'heading_text': 'LN DEST   MIN',
	'heading_color': 0xFF0000,

	'train_line_height': 6,
	'train_line_width': 2,

	'min_label_characters': 3,
	'destination_max_characters': 8,
}
