/**
 * Google Maps / Places / Geocoding API Type Definitions
 * Used by NewRSB.tsx, ExtendedTestDriveLocation.tsx, and other location components
 */

export interface GoogleAddressComponent {
  types: string[];
  longText?: string;
  shortText?: string;
  long_name?: string;
  short_name?: string;
}

export interface GoogleGeocodeResult {
  types: string[];
  address_components: GoogleAddressComponent[];
  formatted_address: string;
  geometry?: {
    location: {
      lat: number | (() => number);
      lng: number | (() => number);
    };
  };
  place_id?: string;
}

export interface GoogleGeocodeResponse {
  results: GoogleGeocodeResult[];
  status: string;
}

export interface GooglePlaceDetails {
  addressComponents: GoogleAddressComponent[];
  location: {
    lat: () => number;
    lng: () => number;
  };
  displayName: { text: string };
  formattedAddress: string;
  id?: string;
}

export interface PlaceSuggestion {
  placeId: string;
  fullAddress: string;
  displayName: string;
  city: string;
  placePrediction?: {
    placeId: string;
    text: { text: string };
    structuredFormat?: {
      mainText: { text: string };
      secondaryText: { text: string };
    };
  };
}

export interface PlaceState {
  lat: number;
  lng: number;
  name?: string;
}

export interface CityCoordinates {
  lat: number;
  lng: number;
  name: string;
}
