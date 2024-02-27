

def scrape_site(park):
    from selenium.common.exceptions import InvalidArgumentException

    driver = webdriver.Chrome(executable_path=chromedriver_location) #change location
    link = "https://www.nps.gov/"+park+"/index.htm"
    driver.get(link)
    #driver.find_element_by_xpath('//*[@id="anch_15"]').click()
    page_source = driver.page_source
    soup = BeautifulSoup(page_source, 'lxml')
    website_list=[]
    raw_list=[]
    website_content=[]
    for l in soup.find_all('a'):
        try:
            if "planyourvisit" in l.get('href') and l.get('href') not in raw_list: #only want plan your visit sites
                if "https://www.nps.gov" in l.get('href'):
                    z= l.get('href')
                    raw_list.append(z)
                    website_list.append(z)
                else:
                    z = l.get('href')
                    raw_list.append(z)
                    z = "https://www.nps.gov"+z
                    website_list.append(z)
        except:
            pass
    for x in website_list:
        try:
            driver.get(x)
            page_source = driver.page_source
            soup = BeautifulSoup(page_source, 'lxml')
            raw_content = soup.get_text(strip=True) #all text fields are scraped
            website_content.append(raw_content) #raw content added to list of all content
        except:
            #This means that the webpage doesn't exist
            website_content.append("page doesn't exist")
    driver.close() #close driver link at end of scrape
    dict = {'website page': website_list, 'content': website_content}  #create dataframe for park data
    park_data = pd.DataFrame(dict)
    park_data['park']=park
   # print("done with scrape")
    return park_data


def Traveler_Info_Finder(park):
    """
    Find the following fields:
    #Public transportation information
    #Alternative Fueling Stations
    #Bike/Pedestrian Information
    #Driving directions
    """


    AFS_list = []
    Bike_Ped_count = []
    Directions_count = []
    Directions_page_count = []
    Pub_Transit_count = []
    Direction_majorcount = []
    Direction_count = []
    Congestion_count = []
    Travel_dist_count = []
    Travel_dist_other_count=[]
    Accessibility_count=[]
    Parking_count=[]
    Parking_plan_count=[]


    Directions_Words = ["Entrance","Center","street","Visitor"
                        "Street","parking","directions","Route","Road",
                        "Interstate","Exit",
                        "mile","km","ferry","access", "Street","Blvd", "Hwy"
                       ]

    Directions_MajorWords = [
        "GPS Coordinates", "GPS coordinates", "GPS device address", "GPS address",
        "Latitude","Longitude","Street",
        "Blvd", "Boulevard", "Ln.","Rd.","Pl.",
        "Hwy","Exit","Interstate","US Highway", "U.S. Highway", "Indian Head Highway",  "Turnpike","beltway","Causeway"
        "Secondary Route", "State Route", "I-","State Highway"
        ]


    Public_Transit_Words = [
        "Public Transportation", "public transportation","Public transportation",
        "bus schedule", "Bus schedule", "shuttle", "shuttles","Shuttle",
        "bus stops", "buses stop", "ferry","transit","Transit"
    ]

    Congestion_Words = [
       "congestion","Congestion", "congested"
    ]

    BicyclePed_Words = [
        "Bicyclists","bicyclists","cyclists","pedestrians","biking"
        #,"biking","Biking"
    ]

    Travel_dist_Words = [
        'miles'
    ]

    Travel_dist_other_Words = [
        'Places To Go',"Popular Destinations"
    ]

    Accessibility_Words = [
        "wheelchair", "accessibility", "disability", "impaired", "disabilities", "handicap",
        "accessible","Wheelchair"
    ]

    Parking_Words = [
        "parking", "Parking", "pullout"
    ]


    #this will get the number of sites that have keywords
    count=0
    for x in park["content"]:
        try:
            y=0
            if "Department of Energy" in x and "Alternative Fueling Station" in x:
                y=1
                AFS_list.append(y)
            else:
                y=0
                AFS_list.append(y)
            if any(substring in x for substring in Public_Transit_Words):
                y=1
                Pub_Transit_count.append(y)
            else:
                y=0
                Pub_Transit_count.append(y)
            if any(substring in x for substring in Directions_MajorWords):
                y=1
                Direction_majorcount.append(y)
            else:
                y=0
                Direction_majorcount.append(y)
            if any(substring in x for substring in BicyclePed_Words):
                y=1
                Bike_Ped_count.append(y)
            else:
                y=0
                Bike_Ped_count.append(y)
            if any(substring in x for substring in Congestion_Words):
                y=1
                Congestion_count.append(y)
            else:
                y=0
                Congestion_count.append(y)
            if any(substring in x for substring in Travel_dist_Words):
                y=1
                Travel_dist_count.append(y)
            else:
                y=0
                Travel_dist_count.append(y)
            if any(substring in x for substring in Travel_dist_other_Words):
                y=1
                Travel_dist_other_count.append(y)
            else:
                y=0
                Travel_dist_other_count.append(y)
            if any(substring in x for substring in Parking_Words):
                y=1
                Parking_count.append(y)
            else:
                y=0
                Parking_count.append(y)
            if any(substring in x for substring in Directions_Words):
                y=1
                Directions_page_count.append(y)
            else:
                y=0
                Directions_page_count.append(y)
        except:
            y=0
            AFS_list.append(y)
            Pub_Transit_count.append(y)
            Direction_majorcount.append(y)
            Bike_Ped_count.append(y)
            Congestion_count.append(y)
            Travel_dist_count.append(y)
            Travel_dist_other_count.append(y)
            Parking_count.append(y)
            Directions_page_count.append(y)




#this section will get the total number of times that keywords show up on all sites for a park
    ps = PorterStemmer()
    lem = WordNetLemmatizer()

    stemmed_words=[]

    for x in park['content']:
        z=0
        z2=0
        z3=0
        major = 0
        congestion = 0
        pubtrans=0
        bikeped=0
        try:
            tokenized_word=word_tokenize(x)
            filtered_sent=[]
            stemmed_words=[]
            direction_words_temp = []
            for w in tokenized_word:
                if w not in stopwords:
                    filtered_sent.append(w)
            for w in filtered_sent:
                if w in Directions_Words:
                    z += 1
                if w in Parking_Words:
                    z2 +=1
                if w in Accessibility_Words:
                    z3 += 1
            Direction_count.append(z)
            Parking_plan_count.append(z2)
            Accessibility_count.append(z3)
        except:
            Direction_count.append(0)
            Parking_plan_count.append(0)
            Accessibility_count.append(0)

    park["Alternative_Fueling_Stations"]=AFS_list
    park["MajorDirections_count"]=Direction_majorcount
    park["Directions_count"]=Direction_count
    park["Directions_page_count"]=Directions_page_count
    park["Public_transportation_information"]=Pub_Transit_count
    park["Congestion_information"]=Congestion_count
    park["Bike_Pedestrian_Information"]=Bike_Ped_count
    park["Travel_dist_information"]=Travel_dist_count
    park["Travel_other_dist_information"]=Travel_dist_other_count
    park['Accessibility_intro_information']=Accessibility_count
    park['Parking_information']=Parking_count
    park['Parking_experience_information']=Parking_plan_count
    park['Parking_max_on_one_site']=park['Parking_experience_information']


    park['Accessibility_information']=np.where(
        np.logical_or(park['Accessibility_intro_information']>2,
                     park['Parking_experience_information']>2),1,0)

    park_final = park.groupby('park', as_index=False).agg({
        "MajorDirections_count": "sum",
        "Directions_count": "sum",
        "Directions_page_count":"sum",
        "Public_transportation_information": "sum",
        "Alternative_Fueling_Stations":"sum",
        "Bike_Pedestrian_Information":"sum",
        'Congestion_information':'sum',
        'Travel_dist_information':'sum',
        'Travel_other_dist_information':'sum',
        'Accessibility_information':'sum',
        'Parking_information':'sum',
        'Parking_experience_information':'sum',
        'Parking_max_on_one_site':'max',
        "website page":"count",
    })

   # park_final2 = park.groupby('park')['Directions_word_list'].apply(lambda x: ','.join(x))
   # park_final = park_final.merge(park_final2, on="park")

    return park_final
