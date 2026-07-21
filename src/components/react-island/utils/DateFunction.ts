/**
 * SMART DATE PRESETS (Industry Standard - Zoomcar/Turo/MakeMyTrip style)
 *
 * Logic:
 * - If current time is before 6 PM: Start = Today + 4 hours (rounded to next hour)
 * - If current time is 6 PM or later: Start = Tomorrow 10:00 AM
 * - End = Start + 24 hours
 *
 * This maximizes conversion by:
 * 1. Never showing blank dates
 * 2. Providing realistic, bookable defaults
 * 3. Rounding to clean hour times (10:00, not 10:43)
 */

// Get smart default start time
export const getSmartStartDate = (): Date => {
    const now = new Date();
    const currentHour = now.getHours();

    let startDate = new Date(now);

    if (currentHour < 18) {
        // Before 6 PM: Start = Today + 4 hours, rounded up to next hour
        startDate.setHours(currentHour + 4);
        startDate.setMinutes(0);
        startDate.setSeconds(0);
        startDate.setMilliseconds(0);

        // If minutes were > 0, round up added an hour implicitly via +4
        if (now.getMinutes() > 0) {
            startDate.setHours(startDate.getHours() + 1);
        }
    } else {
        // 6 PM or later: Start = Tomorrow 10:00 AM
        startDate.setDate(startDate.getDate() + 1);
        startDate.setHours(10, 0, 0, 0);
    }

    return startDate;
};

// Get smart default end time (start + 24 hours)
export const getSmartEndDate = (startDate: Date): Date => {
    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + 24);
    return endDate;
};

// Round any date to the nearest hour
export const roundToNearestHour = (date: Date): Date => {
    const rounded = new Date(date);
    if (rounded.getMinutes() >= 30) {
        rounded.setHours(rounded.getHours() + 1);
    }
    rounded.setMinutes(0);
    rounded.setSeconds(0);
    rounded.setMilliseconds(0);
    return rounded;
};

// Legacy function - kept for backward compatibility
// Now returns smart start date instead of current time + 2 hours
export const getCurrentTime = (): string => {
    const date = getSmartStartDate();

    // Format as "YYYY-MM-DDTHH:MM" for datetime-local input
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutesFormatted = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}T${hours}:${minutesFormatted}`;
};
