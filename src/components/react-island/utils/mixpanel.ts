// GA4-backed shim — Mixpanel SDK removed 2026-05-23 to drop the
// vendor-analytics chunk (320 KB) off the homepage critical path (INP).
// Public API of this module is preserved so the 38 consumers across
// src/components, src/pages, src/screens, src/hooks compile unchanged.
// Every event flows through window.gtag via utils/ga4Analytics.trackGA4Event.

import { trackGA4Event, trackPurchase, setGA4UserId, clearGA4UserId } from "./ga4Analytics";

// No-op init — kept so `import { mixpanelInit }` consumers don't break.
const mixpanelInit = () => {};

// Drop-in replacement for the old `mixpanel` export.
const safeMixpanel = {
  track: (name: string, props: Record<string, any> = {}) => {
    try { trackGA4Event(name, props); } catch (e) { console.error("[Analytics] track error:", e); }
  },
  identify: (userId: string) => {
    if (userId) setGA4UserId(userId);
  },
  reset: () => {
    clearGA4UserId();
  },
  people: {
    // GA4 has no per-user "people" profile concept; user props go on individual
    // events via custom params. Forward as a single user_properties event so
    // the values still land in GA4 if needed.
    set: (props: Record<string, any> = {}) => {
      try { trackGA4Event("user_properties_set", props); } catch (e) {}
    },
    // Revenue: forward as GA4 standard "purchase" event so it surfaces in
    // GA4's built-in Monetization reports (booking_id → transaction_id).
    track_charge: (amount: number, props: Record<string, any> = {}) => {
      try {
        trackPurchase({
          transaction_id: props.booking_id || props.bookingId || String(Date.now()),
          value: amount,
          currency: "INR",
          items: [{
            item_id: props.booking_id || props.bookingId,
            item_brand: props.vendor,
            price: amount,
            quantity: 1,
          }],
        });
      } catch (e) {}
    },
  },
};

const identifyUser = (userId: string, userProperties: Record<string, any> = {}) => {
  if (!userId) return;
  safeMixpanel.identify(userId);
  if (Object.keys(userProperties).length > 0) {
    safeMixpanel.people.set(userProperties);
  }
};

const resetUser = () => {
  safeMixpanel.reset();
};

const trackBooking = {
  started: (bookingData: Record<string, any>) => {
    safeMixpanel.track("booking_started", {
      car_name: bookingData.carName,
      car_id: bookingData.carId,
      vendor: bookingData.vendor,
      city: bookingData.city,
      price: bookingData.price,
      start_date: bookingData.startDate,
      end_date: bookingData.endDate,
    });
  },
  completed: (bookingData: Record<string, any>) => {
    safeMixpanel.track("booking_completed", {
      booking_id: bookingData.bookingId,
      car_name: bookingData.carName,
      car_id: bookingData.carId,
      vendor: bookingData.vendor,
      city: bookingData.city,
      price: bookingData.price,
      payment_id: bookingData.paymentId,
    });
    safeMixpanel.people.track_charge(bookingData.price, {
      booking_id: bookingData.bookingId,
      vendor: bookingData.vendor,
    });
  },
  failed: (errorData: Record<string, any>) => {
    safeMixpanel.track("booking_failed", {
      error_type: errorData.errorType,
      error_message: errorData.errorMessage,
      car_name: errorData.carName,
      vendor: errorData.vendor,
    });
  },
  cancelled: (bookingData: Record<string, any>) => {
    safeMixpanel.track("booking_cancelled", {
      booking_id: bookingData.bookingId,
      car_name: bookingData.carName,
      vendor: bookingData.vendor,
      reason: bookingData.reason,
    });
  },
};

const trackSearch = {
  performed: (searchData: Record<string, any>) => {
    safeMixpanel.track("search_performed", {
      city: searchData.city,
      start_date: searchData.startDate,
      end_date: searchData.endDate,
      results_count: searchData.resultsCount,
    });
  },
  filtered: (filterData: Record<string, any>) => {
    safeMixpanel.track("search_filtered", {
      filter_type: filterData.filterType,
      filter_value: filterData.filterValue,
      city: filterData.city,
    });
  },
  carViewed: (carData: Record<string, any>) => {
    safeMixpanel.track("car_viewed", {
      car_name: carData.carName,
      car_id: carData.carId,
      vendor: carData.vendor,
      price: carData.price,
      city: carData.city,
    });
  },
};

const trackPayment = {
  initiated: (paymentData: Record<string, any>) => {
    safeMixpanel.track("payment_initiated", {
      amount: paymentData.amount,
      car_name: paymentData.carName,
      vendor: paymentData.vendor,
    });
  },
  completed: (paymentData: Record<string, any>) => {
    safeMixpanel.track("payment_completed", {
      amount: paymentData.amount,
      payment_id: paymentData.paymentId,
      car_name: paymentData.carName,
      vendor: paymentData.vendor,
    });
  },
  failed: (paymentData: Record<string, any>) => {
    safeMixpanel.track("payment_failed", {
      amount: paymentData.amount,
      error: paymentData.error,
      car_name: paymentData.carName,
    });
  },
};

const trackEngagement = {
  pageViewed: (pageName: string, pageData: Record<string, any> = {}) => {
    safeMixpanel.track("page_viewed", { page_name: pageName, ...pageData });
  },
  buttonClicked: (buttonName: string, buttonData: Record<string, any> = {}) => {
    safeMixpanel.track("button_clicked", { button_name: buttonName, ...buttonData });
  },
  formSubmitted: (formName: string, formData: Record<string, any> = {}) => {
    safeMixpanel.track("form_submitted", { form_name: formName, ...formData });
  },
};

export {
  safeMixpanel as mixpanel,
  mixpanelInit,
  identifyUser,
  resetUser,
  trackBooking,
  trackSearch,
  trackPayment,
  trackEngagement,
};
