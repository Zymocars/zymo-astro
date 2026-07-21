// Google Ads Conversion ID (from index.html)
const GOOGLE_ADS_ID = "AW-11464217393";

function getGtag() {
    if (typeof window === "undefined") return null;
    if (typeof window.gtag === "function") {
        return window.gtag;
    }
    window.dataLayer = window.dataLayer || [];
    return function (...args: any[]) {
        window.dataLayer.push(args);
    };
}

export function setGA4UserId(userId: string) {
    if (typeof window === "undefined") return;
    const gtag = getGtag();
    if (!gtag || !userId) return;
    try {
        gtag("set", { user_id: userId });
        if (process.env.NODE_ENV !== "production") {
            console.log("[GA4] User ID set:", userId.slice(0, 8) + "...");
        }
    } catch (err: unknown) {
        console.error("[GA4] Error setting user ID:", err);
    }
}

export function setGA4UserProperties(properties: Record<string, string | null>) {
    if (typeof window === "undefined") return;
    const gtag = getGtag();
    if (!gtag) return;
    try { gtag("set", "user_properties", properties); } catch (_) {}
}

export function clearGA4UserId() {
    if (typeof window === "undefined") return;
    const gtag = getGtag();
    if (!gtag) return;
    try {
        gtag("set", { user_id: null });
    } catch (err: unknown) {
        console.error("[GA4] Error clearing user ID:", err);
    }
}

export function captureUTMParameters() {
    if (typeof window === "undefined") return null;
    const urlParams = new URLSearchParams(window.location.search);
    const utmParams = {
        utm_source: urlParams.get("utm_source"),
        utm_medium: urlParams.get("utm_medium"),
        utm_campaign: urlParams.get("utm_campaign"),
        utm_term: urlParams.get("utm_term"),
        utm_content: urlParams.get("utm_content"),
    };
    const filteredParams = Object.fromEntries(
        Object.entries(utmParams).filter(([_, v]) => v !== null)
    );
    if (Object.keys(filteredParams).length > 0) {
        sessionStorage.setItem("utm_params", JSON.stringify(filteredParams));
        if (process.env.NODE_ENV !== "production") {
            console.log("[GA4] UTM Parameters captured:", filteredParams);
        }
    }
    return filteredParams;
}

export function getStoredUTMParams() {
    if (typeof window === "undefined") return {};
    try {
        const stored = sessionStorage.getItem("utm_params");
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

export function trackPageView(path: string, title: string) {
    if (typeof window === "undefined") return;
    const gtag = getGtag();
    const params = {
        page_path: path,
        page_title: title,
        page_location: window.location.href
    };
    try {
        // @ts-ignore
        gtag("event", "page_view", params);
        if (process.env.NODE_ENV !== "production") {
            console.log("[GA4] Page View:", params);
        }
    } catch (err: unknown) {
        console.error("[GA4] Error sending page view:", err);
    }
}

export function trackGA4Event(eventName: string, params: Record<string, any> = {}) {
    if (typeof window === "undefined") return;
    const gtag = getGtag();
    const utmParams = getStoredUTMParams();
    const finalParams = {
        ...params,
        ...utmParams,
        page_path: window.location.pathname,
        page_title: document.title,
        client_timestamp: Date.now(),
    };
    try {
        // @ts-ignore
        gtag("event", eventName, finalParams);
        if (process.env.NODE_ENV !== "production") {
            console.log("[GA4] Event Sent: " + eventName, finalParams);
        }
    } catch (err: unknown) {
        console.error("[GA4] Error sending event:", err);
    }
}

export function trackGoogleAdsConversion(conversionLabel: string, value: number, transactionId: string) {
    if (typeof window === "undefined") return;
    const gtag = getGtag();
    if (!gtag) return;
    try {
        gtag("event", "conversion", {
            send_to: GOOGLE_ADS_ID + "/" + conversionLabel,
            value: value,
            currency: "INR",
            transaction_id: transactionId,
        });
        if (process.env.NODE_ENV !== "production") {
            console.log("[Google Ads] Conversion tracked:", { conversionLabel, value, transactionId });
        }
    } catch (err: unknown) {
        console.error("[Google Ads] Error tracking conversion:", err);
    }
}

export function trackPurchase(purchaseData: Record<string, any>) {
    if (typeof window === "undefined") return;
    const gtag = getGtag();
    if (!gtag) return;
    const utmParams = getStoredUTMParams();
    const params = {
        transaction_id: purchaseData.transaction_id,
        value: purchaseData.value,
        currency: purchaseData.currency || "INR",
        items: purchaseData.items || [],
        ...utmParams,
    };
    try {
        gtag("event", "purchase", params);
        if (process.env.NODE_ENV !== "production") {
            console.log("[GA4] Purchase tracked:", params);
        }
    } catch (err: unknown) {
        console.error("[GA4] Error tracking purchase:", err);
    }
}

function getBookingSessionId(): string | undefined {
    try {
        return sessionStorage.getItem('zymo_booking_sid') || undefined;
    } catch {
        return undefined;
    }
}

export function trackBookingComplete(bookingData: Record<string, any>) {
    if (typeof window === "undefined") return;
    const { bookingId, amount, carName, carId, vendor, city, conversionLabel } = bookingData;

    trackPurchase({
        transaction_id: bookingId,
        value: amount,
        currency: "INR",
        items: [{
            item_id: carId || bookingId,
            item_name: carName,
            item_category: "Car Rental",
            item_brand: vendor,
            price: amount,
            quantity: 1,
        }],
    });

    if (conversionLabel) {
        trackGoogleAdsConversion(conversionLabel, amount, bookingId);
    }

    trackGA4Event("booking_complete", {
        booking_session_id: getBookingSessionId(),
        transaction_id: bookingId,
        value: amount,
        currency: "INR",
        car_id: carId,
        car_name: carName,
        vendor: vendor,
        city: city,
        category: "Car Rental",
    });
}

export function trackError(errorType: string, errorDetails: Record<string, any> = {}) {
    if (typeof window === "undefined") return;
    trackGA4Event("error", {
        error_type: errorType,
        ...errorDetails,
    });
}
