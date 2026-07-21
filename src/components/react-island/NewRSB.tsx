import { useEffect, useMemo, useState, useRef, useTransition, memo, useCallback } from "react";
import {
  MapPinIcon,
  CalendarIcon,
  SparklesIcon,
  LocateFixed,
  X,
} from "./icons/InlineIcons";
import { useNavigate } from "react-router-dom";
import { LoadScriptNext, type Libraries } from "@react-google-maps/api";
import { toast } from "react-toastify";
import DateTimeOverlay from "./DateTimeOverlay";
import ErrorPopup from "./ErrorPopup";
import { getCurrentTime, getSmartStartDate, getSmartEndDate } from "./utils/DateFunction";
import { setBookingCookies, getBookingCookies } from "./CookiesConsent";
import { mixpanel } from "./utils/mixpanel";
import { trackGA4Event } from "./utils/ga4Analytics";
import type { GoogleAddressComponent, GoogleGeocodeResult, PlaceState, CityCoordinates } from "./types/google-maps";

// ─── Local type definitions for NewRSB ──────────────────────────────────────

interface NewRSBProps {
  urlcity?: string;
}

interface PlaceSuggestionLocal {
  placeId: string;
  fullAddress: string;
  displayName: string;
  city: string;
}

/** Extended place state that may include addressComponents from Places API */
interface PlaceData extends PlaceState {
  addressComponents?: GoogleAddressComponent[];
}

/** Shape returned by getPlaceDetails (Google Places API new format) */
interface PlaceDetailsResult {
  addressComponents?: GoogleAddressComponent[];
  location?: {
    lat: () => number;
    lng: () => number;
  };
  displayName?: string;
  formattedAddress?: string;
  id?: string;
  fetchFields: (opts: { fields: string[] }) => Promise<void>;
}

/** Cookie data returned by getBookingCookies */
interface BookingCookieData {
  location: string | false;
  startDate: string | false;
  endDate: string | false;
  placeDetails: {
    name?: string;
    lat?: number;
    lng?: number;
    addressComponents?: GoogleAddressComponent[];
  } | false;
  city?: string | false;
}

// List of all supported cities (must match routes in App.jsx)
const SUPPORTED_CITIES = [
  "delhi", "bangalore", "mumbai", "hyderabad", "chennai", "pune", "kolkata", "ahmedabad",
  "noida", "gurgaon", "mangalore", "thane", "dombivli", "palava", "amritsar", "bhubaneswar",
  "chandigarh", "coimbatore", "jaipur", "kochi", "nashik", "madurai", "ghaziabad", "meerut",
  "goa", "lucknow", "bhopal", "guwahati", "indore", "cochin", "mysore", "modinagar",
  "muradnagar", "gurugram", "nagpur", "siliguri", "trichy", "vadodara", "vijayawada",
  "vizag", "udupi", "visakhapatnam", "udaipur", "jodhpur", "haridwar", "rishikesh", "surat",
  "ranchi", "navi-mumbai", "faridabad"
];

// Check if a city is supported
const isCitySupported = (city: string): boolean => {
  if (!city) return false;
  const normalizedCity = city.toLowerCase().replace(/\s+/g, "-");
  return SUPPORTED_CITIES.includes(normalizedCity);
};

// ═══════════════════════════════════════════════════════════════════════════════════
// INDUSTRY-STANDARD GEOCODING RESULT TYPE PRIORITY (Uber/Ola pattern)
//
// Google Geocoding API returns multiple results. Plus Codes (e.g., "8R27+JH4")
// often appear first but have minimal address_components, causing city detection
// to fail. We prioritize results by type to get the most reliable address.
// ═══════════════════════════════════════════════════════════════════════════════════
const GEOCODING_RESULT_TYPE_PRIORITY = [
  "street_address",              // Most precise (123 Main St)
  "premise",                     // Building/place name
  "subpremise",                  // Unit/apartment within building
  "route",                       // Street name
  "sublocality_level_1",         // Neighborhood
  "sublocality",                 // Area within city
  "locality",                    // City
  "administrative_area_level_2", // District
  "administrative_area_level_1", // State
  "postal_code",                 // PIN code area
  "plus_code",                   // Last resort - often lacks address components
];

// Find best geocoding result based on type priority and address component completeness
const findBestGeocodingResult = (results: GoogleGeocodeResult[]): GoogleGeocodeResult | null => {
  if (!results || results.length === 0) return null;

  // First pass: Find result with highest priority type that has address_components
  for (const priorityType of GEOCODING_RESULT_TYPE_PRIORITY) {
    const match = results.find((result: GoogleGeocodeResult) =>
      result.types?.includes(priorityType) &&
      result.address_components?.length > 2 &&
      !result.types?.includes("plus_code") // Exclude plus_code even if it has components
    );
    if (match) return match;
  }

  // Second pass: Find any result with locality or administrative_area_level_2
  const resultWithCity = results.find((result: GoogleGeocodeResult) =>
    result.address_components?.some((comp: GoogleAddressComponent) =>
      comp.types?.includes("locality") ||
      comp.types?.includes("administrative_area_level_2")
    )
  );
  if (resultWithCity) return resultWithCity;

  // Third pass: Find result with most address components (excluding plus_code)
  const nonPlusCodeResults = results.filter((r: GoogleGeocodeResult) => !r.types?.includes("plus_code"));
  if (nonPlusCodeResults.length > 0) {
    return nonPlusCodeResults.reduce((best: GoogleGeocodeResult, current: GoogleGeocodeResult) =>
      (current.address_components?.length || 0) > (best.address_components?.length || 0)
        ? current
        : best
    );
  }

  // Last resort: Use first result
  return results[0];
};

// ═══════════════════════════════════════════════════════════════════════════════════
// INDUSTRY-STANDARD CITY NORMALIZATION MAP
// Google Places API returns the city name (e.g., "Bengaluru")
// We normalize it to our supported city names using a simple map lookup
// This is the approach used by Uber, Ola, Zomato - no locality array scanning
// ═══════════════════════════════════════════════════════════════════════════════════
const CITY_NORMALIZATION_MAP: Record<string, string> = {
  // Karnataka
  "bengaluru": "Bangalore",
  "bangalore": "Bangalore",
  "bengaluru urban": "Bangalore",
  "bangalore urban": "Bangalore",
  "bangalore division": "Bangalore",
  "mysuru": "Mysore",
  "mysore": "Mysore",
  "mangaluru": "Mangalore",
  "mangalore": "Mangalore",
  "udupi": "Udupi",

  // Maharashtra
  "mumbai": "Mumbai",
  "mumbai city": "Mumbai",
  "mumbai suburban": "Mumbai",
  "konkan division": "Mumbai", // Google returns this as administrative_area_level_2 for Mumbai buildings
  "thane": "Thane",
  "navi mumbai": "Navi Mumbai",
  "pune": "Pune",
  "pune division": "Pune",
  "nashik": "Nashik",
  "nasik": "Nashik",
  "nashik division": "Nashik",
  "nagpur": "Nagpur",
  "nagpur division": "Nagpur",
  "dombivli": "Dombivli",
  "palava": "Palava",

  // Delhi NCR
  "new delhi": "Delhi",
  "delhi": "Delhi",
  "central delhi": "Delhi",
  "south delhi": "Delhi",
  "north delhi": "Delhi",
  "east delhi": "Delhi",
  "west delhi": "Delhi",
  "south west delhi": "Delhi",
  "north west delhi": "Delhi",
  "north east delhi": "Delhi",
  "south east delhi": "Delhi",
  "noida": "Noida",
  "greater noida": "Noida",
  "gautam buddha nagar": "Noida",
  "gurugram": "Gurugram",
  "gurgaon": "Gurugram",
  "gurgaon division": "Gurugram",
  "ghaziabad": "Ghaziabad",
  "faridabad": "Faridabad",
  "meerut": "Meerut",
  "modinagar": "Modinagar",
  "muradnagar": "Muradnagar",

  // Telangana & AP
  "hyderabad": "Hyderabad",
  "secunderabad": "Hyderabad",
  "rangareddy": "Hyderabad",
  "ranga reddy": "Hyderabad",
  "visakhapatnam": "Vizag",
  "vizag": "Vizag",
  "vijayawada": "Vijayawada",

  // Tamil Nadu
  "chennai": "Chennai",
  "coimbatore": "Coimbatore",
  "madurai": "Madurai",
  "tiruchirappalli": "Trichy",
  "trichy": "Trichy",

  // West Bengal
  "kolkata": "Kolkata",
  "calcutta": "Kolkata",
  "presidency division": "Kolkata",
  "siliguri": "Siliguri",

  // Gujarat
  "ahmedabad": "Ahmedabad",
  "vadodara": "Vadodara",
  "baroda": "Vadodara",
  "surat": "Surat",
  "rajkot": "Rajkot",

  // Rajasthan
  "jaipur": "Jaipur",
  "jaipur division": "Jaipur",
  "jodhpur": "Jodhpur",
  "udaipur": "Udaipur",
  "bikaner": "Bikaner",
  "jaisalmer": "Jaisalmer",
  "kota": "Kota",

  // Punjab & Chandigarh
  "chandigarh": "Chandigarh",
  "amritsar": "Amritsar",
  "ludhiana": "Ludhiana",

  // Madhya Pradesh
  "bhopal": "Bhopal",
  "indore": "Indore",
  "indore division": "Indore",

  // Uttarakhand
  "dehradun": "Dehradun",
  "haridwar": "Haridwar",
  "rishikesh": "Rishikesh",

  // Goa
  "goa": "Goa",
  "panaji": "Goa",
  "north goa": "Goa",
  "south goa": "Goa",

  // UP
  "lucknow": "Lucknow",
  "lucknow division": "Lucknow",
  "agra": "Agra",
  "varanasi": "Varanasi",

  // Kerala
  "kochi": "Kochi",
  "cochin": "Kochi",
  "ernakulam": "Kochi",
  "thiruvananthapuram": "Trivandrum",
  "trivandrum": "Trivandrum",
  "kozhikode": "Kozhikode",
  "calicut": "Kozhikode",

  // Odisha
  "bhubaneswar": "Bhubaneswar",
  "bhubaneshwar": "Bhubaneswar",

  // Jharkhand
  "ranchi": "Ranchi",

  // Assam
  "guwahati": "Guwahati",
  "gauhati": "Guwahati"
};

// State to default city mapping (fallback when city not found in map)
const STATE_DEFAULT_CITY: Record<string, string> = {
  "karnataka": "Bangalore",
  "maharashtra": "Mumbai",
  "delhi": "Delhi",
  "haryana": "Gurugram",
  "uttar pradesh": "Noida",
  "telangana": "Hyderabad",
  "andhra pradesh": "Hyderabad",
  "tamil nadu": "Chennai",
  "west bengal": "Kolkata",
  "gujarat": "Ahmedabad",
  "rajasthan": "Jaipur",
  "punjab": "Chandigarh",
  "madhya pradesh": "Indore",
  "kerala": "Kochi",
  "goa": "Goa",
  "uttarakhand": "Dehradun",
  "odisha": "Bhubaneswar",
  "jharkhand": "Ranchi",
  "assam": "Guwahati"
};

// PIN code prefix to city mapping (reliable fallback)
const PIN_CODE_CITY_MAP: Record<string, string> = {
  // Mumbai: 400xxx
  "400": "Mumbai",
  // Thane: 401xxx (specific ranges)
  "401": "Thane",
  // Pune: 411xxx, 412xxx
  "411": "Pune",
  "412": "Pune",
  // Bangalore: 560xxx, 561xxx, 562xxx
  "560": "Bangalore",
  "561": "Bangalore",
  "562": "Bangalore",
  // Hyderabad: 500xxx, 501xxx, 502xxx
  "500": "Hyderabad",
  "501": "Hyderabad",
  "502": "Hyderabad",
  // Chennai: 600xxx, 601xxx, 602xxx, 603xxx
  "600": "Chennai",
  "601": "Chennai",
  "602": "Chennai",
  "603": "Chennai",
  // Delhi: 110xxx
  "110": "Delhi",
  // Kolkata: 700xxx
  "700": "Kolkata",
  // Ahmedabad: 380xxx, 382xxx
  "380": "Ahmedabad",
  "382": "Ahmedabad",
  // Jaipur: 302xxx
  "302": "Jaipur",
  // Goa: 403xxx
  "403": "Goa",
  // Kochi: 682xxx, 683xxx
  "682": "Kochi",
  "683": "Kochi",
  // Lucknow: 226xxx
  "226": "Lucknow",
  // Chandigarh: 160xxx
  "160": "Chandigarh",
  // Indore: 452xxx
  "452": "Indore",
  // Bhopal: 462xxx
  "462": "Bhopal",
  // Nagpur: 440xxx
  "440": "Nagpur",
  // Vizag: 530xxx
  "530": "Vizag",
  // Gurugram: 122xxx
  "122": "Gurugram",
  // Noida: 201xxx
  "201": "Noida",
  // Faridabad: 121xxx
  "121": "Faridabad"
};

// City coordinates for city landing pages (center point of each city)
// Used when urlcity is provided to initialize the place object
const CITY_COORDINATES: Record<string, CityCoordinates> = {
  // Metro cities
  "delhi": { lat: 28.6139, lng: 77.2090, name: "Delhi" },
  "bangalore": { lat: 12.9716, lng: 77.5946, name: "Bangalore" },
  "mumbai": { lat: 19.0760, lng: 72.8777, name: "Mumbai" },
  "hyderabad": { lat: 17.3850, lng: 78.4867, name: "Hyderabad" },
  "chennai": { lat: 13.0827, lng: 80.2707, name: "Chennai" },
  "pune": { lat: 18.5204, lng: 73.8567, name: "Pune" },
  "kolkata": { lat: 22.5726, lng: 88.3639, name: "Kolkata" },
  "ahmedabad": { lat: 23.0225, lng: 72.5714, name: "Ahmedabad" },

  // NCR
  "noida": { lat: 28.5355, lng: 77.3910, name: "Noida" },
  "gurgaon": { lat: 28.4595, lng: 77.0266, name: "Gurgaon" },
  "gurugram": { lat: 28.4595, lng: 77.0266, name: "Gurugram" },
  "ghaziabad": { lat: 28.6692, lng: 77.4538, name: "Ghaziabad" },
  "faridabad": { lat: 28.4089, lng: 77.3178, name: "Faridabad" },
  "meerut": { lat: 28.9845, lng: 77.7064, name: "Meerut" },
  "modinagar": { lat: 28.8320, lng: 77.5774, name: "Modinagar" },
  "muradnagar": { lat: 28.7780, lng: 77.4912, name: "Muradnagar" },

  // Maharashtra
  "thane": { lat: 19.2183, lng: 72.9781, name: "Thane" },
  "navi-mumbai": { lat: 19.0330, lng: 73.0297, name: "Navi Mumbai" },
  "nashik": { lat: 19.9975, lng: 73.7898, name: "Nashik" },
  "nagpur": { lat: 21.1458, lng: 79.0882, name: "Nagpur" },
  "dombivli": { lat: 19.2183, lng: 73.0867, name: "Dombivli" },
  "palava": { lat: 19.1657, lng: 73.0942, name: "Palava" },

  // Karnataka
  "mangalore": { lat: 12.9141, lng: 74.8560, name: "Mangalore" },
  "mysore": { lat: 12.2958, lng: 76.6394, name: "Mysore" },
  "udupi": { lat: 13.3409, lng: 74.7421, name: "Udupi" },

  // Tamil Nadu
  "coimbatore": { lat: 11.0168, lng: 76.9558, name: "Coimbatore" },
  "madurai": { lat: 9.9252, lng: 78.1198, name: "Madurai" },
  "trichy": { lat: 10.7905, lng: 78.7047, name: "Trichy" },

  // Andhra & Telangana
  "vijayawada": { lat: 16.5062, lng: 80.6480, name: "Vijayawada" },
  "vizag": { lat: 17.6868, lng: 83.2185, name: "Vizag" },
  "visakhapatnam": { lat: 17.6868, lng: 83.2185, name: "Visakhapatnam" },

  // Gujarat
  "vadodara": { lat: 22.3072, lng: 73.1812, name: "Vadodara" },
  "surat": { lat: 21.1702, lng: 72.8311, name: "Surat" },

  // Rajasthan
  "jaipur": { lat: 26.9124, lng: 75.7873, name: "Jaipur" },
  "jodhpur": { lat: 26.2389, lng: 73.0243, name: "Jodhpur" },
  "udaipur": { lat: 24.5854, lng: 73.7125, name: "Udaipur" },

  // Punjab & Chandigarh
  "chandigarh": { lat: 30.7333, lng: 76.7794, name: "Chandigarh" },
  "amritsar": { lat: 31.6340, lng: 74.8723, name: "Amritsar" },

  // MP
  "bhopal": { lat: 23.2599, lng: 77.4126, name: "Bhopal" },
  "indore": { lat: 22.7196, lng: 75.8577, name: "Indore" },

  // Uttarakhand
  "haridwar": { lat: 29.9457, lng: 78.1642, name: "Haridwar" },
  "rishikesh": { lat: 30.0869, lng: 78.2676, name: "Rishikesh" },

  // Others
  "goa": { lat: 15.2993, lng: 74.1240, name: "Goa" },
  "lucknow": { lat: 26.8467, lng: 80.9462, name: "Lucknow" },
  "guwahati": { lat: 26.1445, lng: 91.7362, name: "Guwahati" },
  "kochi": { lat: 9.9312, lng: 76.2673, name: "Kochi" },
  "cochin": { lat: 9.9312, lng: 76.2673, name: "Cochin" },
  "bhubaneswar": { lat: 20.2961, lng: 85.8245, name: "Bhubaneswar" },
  "ranchi": { lat: 23.3441, lng: 85.3096, name: "Ranchi" },
  "siliguri": { lat: 26.7271, lng: 88.3953, name: "Siliguri" }
};

// Format URL city slug to display name (e.g., "mumbai" → "Mumbai", "navi-mumbai" → "Navi Mumbai")
const formatCityDisplayName = (slug: string): string => {
  if (!slug) return "";
  // First check if it's in our normalization map
  const normalizedKey = slug.toLowerCase().replace(/-/g, " ");
  if (CITY_NORMALIZATION_MAP[normalizedKey]) {
    return CITY_NORMALIZATION_MAP[normalizedKey];
  }
  // Otherwise format it nicely
  return slug
    .split("-")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

interface SuggestionItemProps {
  sugg: PlaceSuggestionLocal;
  onClick: (sugg: PlaceSuggestionLocal) => void;
}

const SuggestionItem = memo(({ sugg, onClick }: SuggestionItemProps) => (
  <li
    role="option"
    aria-selected={false}
    onClick={() => onClick(sugg)}
    className="flex items-center px-4 py-3 hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 dark:hover:from-purple-900/20 dark:hover:to-blue-900/20 cursor-pointer text-sm text-gray-700 dark:text-gray-200 transition-all duration-200 border-b border-gray-50 dark:border-zinc-700 last:border-b-0"
  >
    <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-lg mr-3" aria-hidden="true">
      <MapPinIcon className="w-4 h-4 text-red-500" />
    </div>
    <span className="truncate">{sugg.displayName || sugg.fullAddress}</span>
  </li>
));
SuggestionItem.displayName = "SuggestionItem";

const NewRSB = ({ urlcity }: NewRSBProps) => {
  const [activeTab, setActiveTab] = useState("rent");
  // If urlcity is provided, format it for display; otherwise empty
  const initialCityDisplay = urlcity ? formatCityDisplayName(urlcity) : "";
  const [placeInput, setPlaceInput] = useState(initialCityDisplay);
  const [place, setPlace] = useState<PlaceData | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestionLocal[]>([]);
  // If urlcity is provided, set city directly from it (skip autocomplete)
  const [city, setCity] = useState(initialCityDisplay);
  const [address, setAddress] = useState<string | string[]>("");
  // Smart date presets (industry standard): Start = Tomorrow 10AM or Today+4h, End = Start+24h
  const smartStart = getSmartStartDate();
  const smartEnd = getSmartEndDate(smartStart);
  const [startDate, setStartDate] = useState<Date>(smartStart);
  const [endDate, setEndDate] = useState<Date>(smartEnd);
  const [tripDuration, setTripDuration] = useState("24 hours");
  const [tripDurationHours, setTripDurationHours] = useState<number | string>("");
  const [fade, setFade] = useState(false);
  const [isStartPickerOpen, setIsStartPickerOpen] = useState(false);
  const [isEndPickerOpen, setIsEndPickerOpen] = useState(false);
  const [disableBtn, setDisableBtn] = useState(false);
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorTitle, setErrorTitle] = useState("Error");
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  

  const navigate = useNavigate();
  const [, startTransition] = useTransition();
  const isManuallySelected = useRef(false);

  const headerTexts = [
    "Smart rentals, easy driving",
    "Affordable rides for less",
    "Great deals, Smooth drives",
    "Drive more, Spend less",
    "Compare and save on rental",
  ];
  const [headerIndex, setHeaderIndex] = useState(0);

  const placesAPILibraries: Libraries = useMemo(() => ["places"] as Libraries, []);
  const placesAPIKey = import.meta.env.VITE_PLACES_API_KEY || "AIzaSyD_MEGXTOrcX0VUcYC2Uzw7ryAgs9H-vG4";

  //flag to track if you're initializing from localStorage,  Only true on first render
  const isInitialLoad = useRef(true);
  useEffect(() => {
    if (isInitialLoad.current) {
      // If urlcity is provided (city page), use it directly and skip localStorage
      if (urlcity) {
        const formattedCity = formatCityDisplayName(urlcity);
        setPlaceInput(formattedCity);
        setCity(formattedCity);

        // Set place coordinates from CITY_COORDINATES map
        // This is critical - without coordinates, search validation fails
        const cityKey = urlcity.toLowerCase();
        const cityCoords = CITY_COORDINATES[cityKey];
        if (cityCoords) {
          setPlace({
            lat: cityCoords.lat,
            lng: cityCoords.lng,
            name: cityCoords.name || formattedCity
          });
        }

        isManuallySelected.current = true;
        isInitialLoad.current = false;
        return;
      }

      // Only load from localStorage on homepage (no urlcity)
      const selectedPickupLocation = localStorage.getItem("pickupLocation");

      if (selectedPickupLocation) {
        setPlaceInput(selectedPickupLocation);
        isManuallySelected.current = true; // Mark as selected to suppress suggestions
      }

      isInitialLoad.current = false; // prevent re-running this block
      return;
    }

    if (isManuallySelected.current) {
      return;
    }

    if (!placeInput) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        if (window.google?.maps?.places?.AutocompleteSuggestion) {
          const sessionToken =
            new window.google.maps.places.AutocompleteSessionToken();

          const response =
            await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(
              {
                input: placeInput,
                includedRegionCodes: ["IN"],
                language: "en",
                sessionToken: sessionToken,
              }
            );

          const formatted =
            response?.suggestions?.map((item) => {
              const prediction = item?.placePrediction;
              const placeId = prediction?.placeId || "";
              const fullText = prediction?.text?.text || "";
              const mainText = prediction?.mainText?.text || "";
              const secondaryText = prediction?.secondaryText?.text || "";

              return {
                placeId,
                fullAddress: fullText,
                displayName: `${mainText}${secondaryText ? ", " + secondaryText : ""
                  }`,
                city: secondaryText,
              };
            }) || [];

          setSuggestions(formatted);
        }
      } catch (error: unknown) {
        console.error("Error fetching autocomplete suggestions:", error);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 200);
    return () => clearTimeout(debounce);
  }, [placeInput, mapsLoaded]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSuggestionClick = useCallback(async (sugg: PlaceSuggestionLocal) => {
    isManuallySelected.current = true;
    startTransition(() => {
      setPlaceInput(sugg.fullAddress);
      setSuggestions([]);
    });
    localStorage.setItem("pickupLocation", sugg.fullAddress);

    const placeDetails = await getPlaceDetails(sugg.placeId);
    if (placeDetails) {
      let cityName = extractCityFromDetails(placeDetails);

      const location = placeDetails.location;
      const lat = location ? location.lat() : 0;
      const lng = location ? location.lng() : 0;

      // Reverse geocode fallback: if Place details didn't yield a supported city
      // (e.g. building-level places like "Wing-H"), resolve city from coordinates
      const normalizedForCheck = cityName?.toLowerCase().replace(/\s+/g, "-") || "";
      if (!isCitySupported(normalizedForCheck) && lat && lng) {
        try {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${placesAPIKey}`
          );
          const data = await res.json();
          if (data.status === "OK" && data.results?.length > 0) {
            const best = findBestGeocodingResult(data.results);
            if (best) {
              const geocodedCity = extractCityFromGeocodingResult(best);
              if (geocodedCity) cityName = geocodedCity;
            }
          }
        } catch (err: unknown) {
          console.error("Reverse geocode fallback failed:", err);
        }
      }

      setCity(cityName);

      setPlace({
        name: String(placeDetails.displayName || sugg.fullAddress),
        lat,
        lng,
        addressComponents: placeDetails.addressComponents || [],
      });
    }
  // placesAPIKey is import.meta.env (compile-time constant); inner utils are pure (no state deps)
  }, [placesAPIKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPlaceDetails = async (placeId: string): Promise<PlaceDetailsResult | null> => {
    try {
      const placesLib = await window.google.maps.importLibrary("places") as Record<string, unknown>;
      const Place = placesLib.Place as new (opts: { id: string; requestedLanguage: string }) => PlaceDetailsResult;
      const place = new Place({
        id: placeId,
        requestedLanguage: "en",
      });

      await place.fetchFields({
        fields: [
          "addressComponents",
          "displayName",
          "formattedAddress",
          "location",
        ],
      });

      return place;
    } catch (error: unknown) {
      console.error("Error fetching place details:", error);
      return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════════
  // INDUSTRY-STANDARD CITY EXTRACTION (New Places API format)
  //
  // How Uber/Ola/Zomato do it:
  // - Extract SERVICE CITY from administrative_area_level_2 (district) - NOT from locality
  // - locality = "Jogeshwari" (display only)
  // - administrative_area_level_2 = "Mumbai Suburban" (actual city for routing)
  // ═══════════════════════════════════════════════════════════════════════════════════
  const extractCityFromDetails = (place: { addressComponents?: GoogleAddressComponent[] }): string => {
    if (!place?.addressComponents) {
      console.warn("No address components found");
      return "";
    }

    const components: GoogleAddressComponent[] = Array.isArray(place.addressComponents)
      ? place.addressComponents
      : [];

    // Helper to find component by type
    const findComponent = (type: string): string => {
      const match = components.find((comp: GoogleAddressComponent) => {
        const types = Array.isArray(comp.types) ? comp.types : [];
        return types.includes(type);
      });
      return match ? (match.longText || match.shortText || "") : "";
    };

    // STEP 1: Try all administrative levels (Google varies which level has the city)
    // e.g. "Mumbai Suburban" can be at level_2 OR level_3 depending on the place
    const adminLevels = [
      "administrative_area_level_2",
      "administrative_area_level_3",
    ];
    for (const level of adminLevels) {
      const adminCity = findComponent(level);
      if (adminCity) {
        const normalized = adminCity.toLowerCase().trim();
        if (CITY_NORMALIZATION_MAP[normalized]) {
          return CITY_NORMALIZATION_MAP[normalized];
        }
      }
    }

    // STEP 2: Try locality (works for some cities like "Pune", "Jaipur", "Mumbai")
    const locality = findComponent("locality");
    if (locality) {
      const normalized = locality.toLowerCase().trim();
      if (CITY_NORMALIZATION_MAP[normalized]) {
        return CITY_NORMALIZATION_MAP[normalized];
      }
    }

    // STEP 3: Try sublocality_level_1 (neighborhoods that map to cities, e.g. "Thane")
    const sublocality = findComponent("sublocality_level_1");
    if (sublocality) {
      const normalized = sublocality.toLowerCase().trim();
      if (CITY_NORMALIZATION_MAP[normalized]) {
        return CITY_NORMALIZATION_MAP[normalized];
      }
    }

    // STEP 4: Try administrative_area_level_1 (state) with state mapping
    const state = findComponent("administrative_area_level_1");
    if (state) {
      const stateLower = state.toLowerCase().trim();
      if (STATE_DEFAULT_CITY[stateLower]) {
        return STATE_DEFAULT_CITY[stateLower];
      }
    }

    // STEP 5: PIN code fallback
    const fullAddress = components.map((comp: GoogleAddressComponent) => comp.longText || comp.shortText).join(", ");
    const pinMatch = fullAddress.match(/\b(\d{6})\b/);
    if (pinMatch) {
      const prefix = pinMatch[1].substring(0, 3);
      if (PIN_CODE_CITY_MAP[prefix]) {
        return PIN_CODE_CITY_MAP[prefix];
      }
    }

    // STEP 6: Scan all component texts against city map (catches edge cases)
    for (const comp of components) {
      const text = (comp.longText || comp.shortText || "").toLowerCase().trim();
      if (text && CITY_NORMALIZATION_MAP[text]) {
        return CITY_NORMALIZATION_MAP[text];
      }
    }

    // STEP 7: If "India" is present, default to Delhi
    if (fullAddress.toLowerCase().includes("india")) {
      return "Delhi";
    }

    // Final fallback: return locality or first component as-is (will likely fail isCitySupported)
    return locality || (components[0]?.longText) || "";
  };

  // Extract city from a location string like "Gurukrupa Marina Enclave, Malad West, Mumbai, Maharashtra"
  // Scans each comma-separated segment against CITY_NORMALIZATION_MAP
  const extractCityFromLocationString = (locationStr: string): string => {
    if (!locationStr) return "";
    const segments = locationStr.split(",").map((s) => s.trim().toLowerCase());
    for (const segment of segments) {
      if (CITY_NORMALIZATION_MAP[segment]) {
        return CITY_NORMALIZATION_MAP[segment];
      }
    }
    // No match — return first segment as-is
    return locationStr.split(",")[0].trim();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(true);
      setTimeout(() => {
        setHeaderIndex((prevIndex) => (prevIndex + 1) % headerTexts.length);
        setFade(false);
      }, 500);
    }, 3000);
    return () => clearInterval(interval);
  }, [headerTexts.length]);

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    if (tab === "buy") {
      mixpanel.track("HomeScreen page details", {
        section: "buy",
        location: null,
        startDate: null,
        endDate: null,
        page: window.location.pathname,
      });
      navigate("/buy-car");
    } else if (tab === "subscribe") {
      const newEndDate = new Date(startDate);
      newEndDate.setDate(newEndDate.getDate() + 30);
      setEndDate(newEndDate);
      calculateDuration(startDate, newEndDate);
    }
  };

  const handleLocationInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    localStorage.removeItem("pickupLocation");
    setPlaceInput(e.target.value);
    isManuallySelected.current = false;
  };

  // Clear location input and all related state
  const clearLocation = () => {
    setPlaceInput("");
    setPlace(null);
    setCity("");
    setSuggestions([]);
    localStorage.removeItem("pickupLocation");
    isManuallySelected.current = false;
  };

  // ═══════════════════════════════════════════════════════════════════════════════════
  // INDUSTRY-STANDARD CITY EXTRACTION (Geocoding API format - for "Use my location")
  //
  // Same logic as extractCityFromDetails but uses old API format (long_name vs longText)
  // ═══════════════════════════════════════════════════════════════════════════════════
  const extractCityFromGeocodingResult = (place: any): string => {
    const components: any[] = place?.address_components || [];

    // Helper to find component by type
    const findComponent = (type: string): string => {
      const match = components.find((comp: any) => comp.types?.includes(type));
      return match ? (match.long_name || "") : "";
    };

    // STEP 1: Try all administrative levels (Google varies which level has the city)
    const adminLevels = [
      "administrative_area_level_2",
      "administrative_area_level_3",
    ];
    for (const level of adminLevels) {
      const adminCity = findComponent(level);
      if (adminCity) {
        const normalized = adminCity.toLowerCase().trim();
        if (CITY_NORMALIZATION_MAP[normalized]) {
          return CITY_NORMALIZATION_MAP[normalized];
        }
      }
    }

    // STEP 2: Try locality
    const locality = findComponent("locality");
    if (locality) {
      const normalized = locality.toLowerCase().trim();
      if (CITY_NORMALIZATION_MAP[normalized]) {
        return CITY_NORMALIZATION_MAP[normalized];
      }
    }

    // STEP 3: Try sublocality_level_1
    const sublocality = findComponent("sublocality_level_1");
    if (sublocality) {
      const normalized = sublocality.toLowerCase().trim();
      if (CITY_NORMALIZATION_MAP[normalized]) {
        return CITY_NORMALIZATION_MAP[normalized];
      }
    }

    // STEP 4: Try state with state mapping
    const state = findComponent("administrative_area_level_1");
    if (state) {
      const stateLower = state.toLowerCase().trim();
      if (STATE_DEFAULT_CITY[stateLower]) {
        return STATE_DEFAULT_CITY[stateLower];
      }
    }

    // STEP 5: PIN code fallback
    const fullAddress = components.map((comp: any) => comp.long_name).join(", ");
    const pinMatch = fullAddress.match(/\b(\d{6})\b/);
    if (pinMatch) {
      const prefix = pinMatch[1].substring(0, 3);
      if (PIN_CODE_CITY_MAP[prefix]) {
        return PIN_CODE_CITY_MAP[prefix];
      }
    }

    // STEP 6: Scan all component texts against city map
    for (const comp of components) {
      const text = (comp.long_name || "").toLowerCase().trim();
      if (text && CITY_NORMALIZATION_MAP[text]) {
        return CITY_NORMALIZATION_MAP[text];
      }
    }

    // STEP 7: Default to Delhi if India is present
    if (fullAddress.toLowerCase().includes("india")) {
      return "Delhi";
    }

    return locality || "";
  };

  const getCurrentLocation = (): void => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;

          fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${placesAPIKey}`
          )
            .then((response) => response.json())
            .then((data) => {
              if (data.status === "OK" && data.results && data.results.length > 0) {
                // Use industry-standard result selection (skip Plus Codes, prioritize by type)
                const placeDetails = findBestGeocodingResult(data.results);

                if (!placeDetails) {
                  toast.error("Unable to determine location details", {
                    position: "top-center",
                    autoClose: 1000 * 5,
                  });
                  return;
                }

                const lat = latitude;
                const lng = longitude;
                setPlace({ name: placeDetails.formatted_address, lat, lng });

                const address = placeDetails.formatted_address.split(",");
                setAddress(
                  address.length > 2
                    ? `${address[0]}, ${address[1]}, ${address.at(-2)}`
                    : address
                );

                const cityName = extractCityFromGeocodingResult(placeDetails);
                setCity(cityName);

                setPlaceInput(placeDetails.formatted_address);
              } else {
                toast.error("Unable to fetch location details", {
                  position: "top-center",
                  autoClose: 1000 * 5,
                });
              }
            })
            .catch((error) => {
              toast.error("Error fetching location details", {
                position: "top-center",
                autoClose: 1000 * 5,
              });
            });
        },
        (error) => {
          toast.error("Unable to retrieve your location", {
            position: "top-center",
            autoClose: 1000 * 5,
          });
        }
      );
    } else {
      toast.error("Geolocation is not supported by this browser", {
        position: "top-center",
        autoClose: 1000 * 5,
      });
    }
  };

  const calculateDuration = (currentStartDate: Date | string, currentEndDate: Date | string): void => {
    const start = new Date(currentStartDate);
    let end: any;
    if (activeTab === "subscribe") {
      end = new Date(start);
      end.setDate(end.getDate() + 30);
      setEndDate(end);
    } else {
      end = new Date(currentEndDate);
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setTripDuration("Invalid Date");
      return;
    }

    const timeDifference = end.getTime() - start.getTime();

    if (timeDifference < 8 * 60 * 60 * 1000) {
      setDisableBtn(true);
      setErrorTitle("Invalid Duration");
      setErrorMessage("Trip duration should be more than 8 hours!");
      setShowErrorPopup(true);

      // Reset trip duration to previous valid state or default
      setTripDuration("Select both dates");
      return;
    } else {
      setDisableBtn(false);
    }

    const totalHours = Math.floor(timeDifference / (1000 * 60 * 60));
    setTripDurationHours(totalHours);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    setTripDuration(`${days} Day(s) ${hours} Hour(s)`);
  };

  const handleSearch = (): void => {
    if (!city) {
      toast.error("Please select a valid city", {
        position: "top-center",
        autoClose: 5000,
      });
      return;
    }

    if (!startDate) {
      toast.error("Please select a start date", {
        position: "top-center",
        autoClose: 5000,
      });
      return;
    }

    if (!endDate) {
      toast.error("Please select an end date", {
        position: "top-center",
        autoClose: 5000,
      });
      return;
    }

    // ════════════════════════════════════════════════════════════════
    // INDUSTRY-STANDARD DATE VALIDATION
    // ════════════════════════════════════════════════════════════════
    const now = new Date();
    const startDateEpoc = startDate.getTime();
    const endDateEpoc = endDate.getTime();
    const MINIMUM_ADVANCE_HOURS = 2; // Minimum 2 hours advance booking
    const minimumStartTime = now.getTime() + (MINIMUM_ADVANCE_HOURS * 60 * 60 * 1000);

    // Check 1: Start date must be in the future
    if (startDateEpoc < now.getTime()) {
      toast.error("Pickup date/time is in the past. Please select a future date.", {
        position: "top-center",
        autoClose: 5000,
      });
      return;
    }

    // Check 2: Minimum advance booking (4 hours)
    if (startDateEpoc < minimumStartTime) {
      toast.error(`Booking requires at least ${MINIMUM_ADVANCE_HOURS} hours advance notice. Please select a later pickup time.`, {
        position: "top-center",
        autoClose: 5000,
      });
      return;
    }

    // Check 3: End date must be after start date
    if (endDateEpoc <= startDateEpoc) {
      toast.error("Drop-off date must be after pickup date.", {
        position: "top-center",
        autoClose: 5000,
      });
      return;
    }

    // Check 4: Minimum rental duration (8 hours)
    const durationHours = (endDateEpoc - startDateEpoc) / (1000 * 60 * 60);
    if (durationHours < 8) {
      toast.error("Minimum rental duration is 8 hours. Please extend your booking.", {
        position: "top-center",
        autoClose: 5000,
      });
      return;
    }
    // ════════════════════════════════════════════════════════════════

    if (!place || !place.lat || !place.lng) {
      toast.error("Please select a valid location", {
        position: "top-center",
        autoClose: 5000,
      });
      return;
    }

    // Validate city is supported before navigation (prevents 404)
    const formattedCity = city.toLowerCase().replace(/\s+/g, "-");
    if (!isCitySupported(formattedCity)) {
      setErrorTitle("Location Not Available");
      setErrorMessage(`We're not available in ${city} yet. We currently serve major cities like Mumbai, Delhi, Bangalore, and more. Please select a location in one of our service areas.`);
      setShowErrorPopup(true);
      return;
    }

    // Capture analytics payload before going async (closure over current state)
    const analyticsSnapshot = {
      city: city || "Unknown",
      start_date: startDate ? startDate.toISOString() : null,
      end_date: endDate ? endDate.toISOString() : null,
      rental_days: tripDurationHours ? Math.ceil(Number(tripDurationHours) / 24) : null,
      trip_duration: tripDuration,
      section: activeTab,
      tripDurationHours,
      page: window.location.pathname,
    };

    // Defer analytics + cookie writes past the next paint so they don't block INP
    requestAnimationFrame(() => setTimeout(() => {
      trackGA4Event("search_submitted", {
        city: analyticsSnapshot.city,
        start_date: analyticsSnapshot.start_date,
        end_date: analyticsSnapshot.end_date,
        rental_days: analyticsSnapshot.rental_days,
        trip_duration: analyticsSnapshot.trip_duration,
      });
      mixpanel.track("HomeScreen page details", {
        section: analyticsSnapshot.section,
        location: analyticsSnapshot.city,
        startDate: analyticsSnapshot.start_date,
        endDate: analyticsSnapshot.end_date,
        TripDuration: analyticsSnapshot.trip_duration,
        TripDurationHours: analyticsSnapshot.tripDurationHours,
        page: analyticsSnapshot.page,
      });
      setBookingCookies(placeInput, startDate, endDate, place, city);
      sessionStorage.setItem("fromSearch", "true");
    }, 0));

    const stateData = {
      address: address || place.name,
      lat: place.lat,
      lng: place.lng,
      startDate,
      endDate,
      tripDuration,
      tripDurationHours,
      activeTab,
    };

    startTransition(() => {
      navigate(`/self-drive-car-rental-in-${formattedCity}/cars`, {
        state: stateData,
      });
    });
  };

  const handleStartDatePickerOpen = (): void => {
    setIsStartPickerOpen(true);
    setIsEndPickerOpen(false);
  };

  const handleEndDatePickerOpen = (): void => {
    if (activeTab !== "subscribe") {
      setIsEndPickerOpen(true);
      setIsStartPickerOpen(false);
    }
  };


  useEffect(() => {
    // Skip cookie loading on city pages - URL city takes precedence
    if (urlcity) {
      return;
    }

    const cookieData = (getBookingCookies as any)();
    const currentDate = new Date(getCurrentTime());

    if (cookieData.location) {
      setPlaceInput(cookieData.location);

      if (cookieData.placeDetails) {
        const placeData = {
          name: cookieData.placeDetails.name,
          lat: cookieData.placeDetails.lat,
          lng: cookieData.placeDetails.lng,
          addressComponents: cookieData.placeDetails.addressComponents,
        };
        setPlace(placeData);

        setAddress(cookieData.placeDetails.name || cookieData.location);
        // Use saved city from cookie (most reliable — avoids re-parsing addressComponents)
        if (cookieData.city) {
          setCity(cookieData.city);
        } else if (cookieData.placeDetails.addressComponents?.length > 0) {
          const cityName = extractCityFromDetails({
            addressComponents: cookieData.placeDetails.addressComponents,
          });
          setCity(cityName || extractCityFromLocationString(cookieData.location));
        } else {
          setCity(extractCityFromLocationString(cookieData.location));
        }
      }
    }

    if (cookieData.startDate && cookieData.endDate) {
      const startDateObj = new Date(cookieData.startDate);
      const endDateObj = new Date(cookieData.endDate);

      if (startDateObj < currentDate) {
        // Cookie dates expired - use smart defaults
        const newStart = getSmartStartDate();
        const newEnd = getSmartEndDate(newStart);
        setStartDate(newStart);
        setEndDate(newEnd);
        calculateDuration(newStart, newEnd);
      } else {
        setStartDate(startDateObj);
        setEndDate(endDateObj);
        calculateDuration(startDateObj, endDateObj);
      }
    }
    // No else needed - smart defaults already set in state initialization
  }, []);

  return (
    <>
      {/* Dynamic Header Text with Glass Effect.
          CLS FIX v1: fixed min-width so pill doesn't resize when the rotating
          text changes length ("Smart rentals, easy driving" vs "Affordable
          rides for less"). Was contributing 0.0005 × 8 ≈ 0.004 CLS per run.
          CLS FIX v2 (2026-07-06): added fixed minHeight so async CSS loading
          cannot shift the pill's height before Tailwind applies. Unlocks the
          render-blocking CSS async pattern (~150ms LCP saving, ~15 perf pts). */}
      <div
        className="rounded-full p-3 mx-auto mb-6 px-6 z-20 shadow-lg backdrop-blur-sm border border-white/20"
        style={{
          background:
            "linear-gradient(135deg, rgba(227,240,255,0.95), rgba(243,232,255,0.95))",
          minWidth: "min(320px, 90vw)",
          maxWidth: "min(360px, 92vw)",
          minHeight: "48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h1
          className={`text-gray-800 text-center text-md transition-opacity duration-500 font-medium whitespace-nowrap ${fade ? "opacity-0" : "opacity-100"
            }`}
          style={{ lineHeight: "24px", margin: 0 }}
        >
          <SparklesIcon className="inline-block w-5 h-5 mr-2 text-blue-500 animate-pulse" />
          {headerTexts[headerIndex]}
          <SparklesIcon className="inline-block w-5 h-5 ml-2 text-purple-500 animate-pulse" />
        </h1>
      </div>

      {/* Main Booking Card with Glass Effect */}
      <div className="mx-auto w-full max-w-[95%] sm:max-w-[90%] md:max-w-[75%] lg:max-w-[900px] px-1 sm:px-0">
        <div
          className="backdrop-blur-md rounded-2xl p-4 sm:p-6 md:p-8 shadow-xl border border-white/30 dark:border-zinc-700/50"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(249,250,251,0.85) 100%)",
          }}
        >
          {/* Book Now Header */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-16 md:w-24 h-[2px] bg-gradient-to-r from-transparent via-blue-400 to-purple-400 rounded-full"></div>
            <h2 className="text-gray-800 font-bold tracking-wider text-sm md:text-base">
              BOOK NOW
            </h2>
            <div className="w-16 md:w-24 h-[2px] bg-gradient-to-r from-purple-400 via-blue-400 to-transparent rounded-full"></div>
          </div>

          {/* Premium Pill Tab Navigation */}
          <div className="flex justify-center mb-4 sm:mb-6">
            <div className="inline-flex bg-gray-100 dark:bg-zinc-800 rounded-full p-1 shadow-inner">
              {["rent", "subscribe", "buy"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabClick(tab)}
                  className={`px-4 sm:px-5 md:px-8 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm md:text-base font-semibold transition-all duration-300 ${
                    activeTab === tab
                      ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg transform scale-105"
                      : "text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400"
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Location Input with Premium Styling */}
          {(mapsReady || !!placeInput) ? (
          <LoadScriptNext
            googleMapsApiKey={placesAPIKey}
            libraries={placesAPILibraries}
            version="beta"
            onLoad={() => setMapsLoaded(true)}
          >
            <div
              className={`flex items-center rounded-xl px-4 py-3 w-full shadow-sm transition-all duration-300 ease-in-out bg-white dark:bg-zinc-700 relative mb-4 border-2 ${
                placeInput
                  ? "border-purple-400 shadow-purple-100"
                  : "border-gray-200 dark:border-zinc-600 hover:border-purple-300"
              }`}
            >
              <div
                className={`p-2 rounded-lg mr-3 ${placeInput ? "bg-purple-100" : "bg-gray-100 dark:bg-zinc-600"}`}
                aria-hidden="true"
              >
                <MapPinIcon className={`w-5 h-5 ${placeInput ? "text-purple-500" : "text-gray-500 dark:text-gray-300"}`} />
              </div>
              <div className="relative w-full">
                <input
                  id="pickup-location"
                  name="pickup_location"
                  type="text"
                  placeholder="Enter pickup location"
                  aria-label="Pickup location"
                  autoComplete="off"
                  enterKeyHint="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={suggestions.length > 0}
                  aria-controls="pickup-location-suggestions"
                  aria-haspopup="listbox"
                  className="bg-transparent outline-none w-full placeholder-gray-400 dark:placeholder-gray-500 text-gray-800 dark:text-white font-medium text-base"
                  value={placeInput}
                  onChange={handleLocationInputChange}
                  onFocus={() => {
                    if (!mapsReady) setMapsReady(true);
                  }}
                />
                {suggestions.length > 0 && (
                  <ul
                    id="pickup-location-suggestions"
                    role="listbox"
                    aria-label="Location suggestions"
                    className="absolute left-0 top-full mt-2 z-50 bg-white dark:bg-zinc-800 rounded-xl shadow-2xl max-h-60 overflow-y-auto w-full min-w-[300px] border border-gray-100 dark:border-zinc-700 text-left"
                  >
                    {suggestions.map((sugg, idx) => (
                      <SuggestionItem key={idx} sugg={sugg} onClick={handleSuggestionClick} />
                    ))}
                  </ul>
                )}
              </div>
              {/* Clear location button - only shows when location is entered */}
              {placeInput && (
                <button
                  className="flex items-center justify-center ml-2 flex-shrink-0 w-11 h-11 rounded-full bg-gray-100 dark:bg-zinc-600 text-gray-500 dark:text-gray-300 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors duration-200"
                  onClick={clearLocation}
                  type="button"
                  aria-label="Clear location"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                className="flex items-center ml-2 flex-shrink-0 px-3 sm:px-4 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors duration-200 min-w-[44px] min-h-[44px] justify-center"
                onClick={getCurrentLocation}
                type="button"
                aria-label="Get current location"
              >
                <LocateFixed className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-1.5" />
                <span className="text-sm font-medium hidden sm:inline">Locate</span>
              </button>
            </div>
          </LoadScriptNext>
          ) : (
            <div
              className={`flex items-center rounded-xl px-4 py-3 w-full shadow-sm transition-all duration-300 ease-in-out bg-white dark:bg-zinc-700 relative mb-4 border-2 ${
                placeInput
                  ? "border-purple-400 shadow-purple-100"
                  : "border-gray-200 dark:border-zinc-600 hover:border-purple-300"
              }`}
            >
              <div
                className={`p-2 rounded-lg mr-3 ${placeInput ? "bg-purple-100" : "bg-gray-100 dark:bg-zinc-600"}`}
                aria-hidden="true"
              >
                <MapPinIcon className={`w-5 h-5 ${placeInput ? "text-purple-500" : "text-gray-500 dark:text-gray-300"}`} />
              </div>
              <div className="relative w-full">
                <input
                  id="pickup-location"
                  name="pickup_location"
                  type="text"
                  placeholder="Enter pickup location"
                  aria-label="Pickup location"
                  autoComplete="off"
                  enterKeyHint="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={false}
                  aria-controls="pickup-location-suggestions"
                  aria-haspopup="listbox"
                  className="bg-transparent outline-none w-full placeholder-gray-400 dark:placeholder-gray-500 text-gray-800 dark:text-white font-medium text-base"
                  value={placeInput}
                  onChange={handleLocationInputChange}
                  onFocus={() => setMapsReady(true)}
                />
              </div>
              {placeInput && (
                <button
                  className="flex items-center justify-center ml-2 flex-shrink-0 w-11 h-11 rounded-full bg-gray-100 dark:bg-zinc-600 text-gray-500 dark:text-gray-300 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors duration-200"
                  onClick={clearLocation}
                  type="button"
                  aria-label="Clear location"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                className="flex items-center ml-2 flex-shrink-0 px-3 sm:px-4 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors duration-200 min-w-[44px] min-h-[44px] justify-center"
                onClick={getCurrentLocation}
                type="button"
                aria-label="Get current location"
              >
                <LocateFixed className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-1.5" />
                <span className="text-sm font-medium hidden sm:inline">Locate</span>
              </button>
            </div>
          )}

          {/* Date Inputs with Premium Styling */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {/* Start Date Input */}
            <div className="relative w-full">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block ml-1">
                Start Date & Time
              </label>
              <div
                className={`rounded-xl p-3 flex items-center cursor-pointer transition-all duration-300 bg-white dark:bg-zinc-700 border-2 ${
                  startDate
                    ? "border-purple-400 shadow-sm shadow-purple-100"
                    : "border-gray-200 dark:border-zinc-600 hover:border-purple-300"
                }`}
                onClick={handleStartDatePickerOpen}
              >
                <div className={`p-2 rounded-lg mr-3 ${startDate ? "bg-purple-100" : "bg-gray-100 dark:bg-zinc-600"}`}>
                  <CalendarIcon className={`w-4 h-4 ${startDate ? "text-purple-500" : "text-gray-500 dark:text-gray-300"}`} />
                </div>
                <span className={`font-medium text-sm ${startDate ? "text-gray-800 dark:text-white" : "text-gray-400"}`}>
                  {startDate
                    ? new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    }).format(new Date(startDate))
                    : "Select date & time"}
                </span>
              </div>
              {isStartPickerOpen && (
                <DateTimeOverlay
                  selectedDate={startDate}
                  setSelectedDate={setStartDate}
                  onSave={(value: Date) => {
                    setStartDate(value);
                    if (endDate) calculateDuration(value, endDate);
                    setIsStartPickerOpen(false);
                  }}
                  onClose={() => setIsStartPickerOpen(false)}
                  minDate={new Date()}
                />
              )}
            </div>

            {/* End Date Input */}
            <div className={`${activeTab == "subscribe" ? "hidden sm:block sm:invisible" : "relative w-full"}`}>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block ml-1">
                End Date & Time
              </label>
              <div
                className={`rounded-xl p-3 flex items-center cursor-pointer transition-all duration-300 bg-white dark:bg-zinc-700 border-2 ${
                  activeTab === "subscribe" ? "opacity-50 cursor-not-allowed border-gray-200" : ""
                } ${
                  endDate
                    ? "border-purple-400 shadow-sm shadow-purple-100"
                    : "border-gray-200 dark:border-zinc-600 hover:border-purple-300"
                }`}
                onClick={handleEndDatePickerOpen}
                aria-disabled={activeTab === "subscribe"}
              >
                <div className={`p-2 rounded-lg mr-3 ${endDate ? "bg-purple-100" : "bg-gray-100 dark:bg-zinc-600"}`}>
                  <CalendarIcon className={`w-4 h-4 ${endDate ? "text-purple-500" : "text-gray-500 dark:text-gray-300"}`} />
                </div>
                <span className={`font-medium text-sm ${endDate ? "text-gray-800 dark:text-white" : "text-gray-400"}`}>
                  {endDate
                    ? new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    }).format(new Date(endDate))
                    : "Select date & time"}
                </span>
              </div>
              {isEndPickerOpen && (
                <DateTimeOverlay
                  selectedDate={endDate || new Date()}
                  setSelectedDate={setEndDate}
                  onSave={(value: Date) => {
                    setEndDate(value);
                    if (startDate) calculateDuration(startDate, value);
                    setIsEndPickerOpen(false);
                  }}
                  onClose={() => setIsEndPickerOpen(false)}
                  minDate={startDate}
                />
              )}
            </div>
          </div>

          {/* Trip Duration with Gradient Background */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 text-center border border-purple-100 dark:border-purple-900/30">
            <div className="text-gray-500 dark:text-gray-300 text-xs font-semibold uppercase tracking-wider mb-1">Trip Duration</div>
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent text-lg sm:text-xl md:text-2xl font-bold">
              {tripDuration}
            </div>
          </div>

          {/* Premium Search Button */}
          <div>
            {disableBtn ? (
              <button
                disabled
                className="w-full bg-gray-200 dark:bg-zinc-700 opacity-50 cursor-not-allowed text-gray-400 font-semibold py-4 rounded-xl"
              >
                Search Cars
              </button>
            ) : (
              <button
                onClick={handleSearch}
                className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-purple-600 text-white font-bold py-4 rounded-xl transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/25 hover:scale-[1.02] active:scale-[0.98] shadow-lg"
              >
                Search Cars
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Popup */}
      <ErrorPopup
        isOpen={showErrorPopup}
        onClose={() => setShowErrorPopup(false)}
        title={errorTitle}
        message={errorMessage}
      />
    </>
  );
};

export default NewRSB;
