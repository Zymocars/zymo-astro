import { useState, useEffect, useMemo, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X, Clock, Calendar } from "lucide-react";
import { mixpanel } from "./utils/mixpanel";
import { useAccessibleModal } from "./hooks/useAccessibleModal";

interface DayInfo {
    day: number;
    isCurrentMonth: boolean;
    isPrevMonth?: boolean;
    isNextMonth?: boolean;
    date: Date;
}

interface DateTimeOverlayProps {
    selectedDate: Date | null;
    setSelectedDate: (date: Date) => void;
    onSave: (date: Date) => void;
    onClose: () => void;
    minDate?: Date | string | null;
}

const DateTimeOverlay = ({
    selectedDate,
    setSelectedDate,
    onSave,
    onClose,
    minDate,
}: DateTimeOverlayProps) => {
    const baseDate = selectedDate instanceof Date && !isNaN(selectedDate.getTime())
        ? selectedDate
        : new Date();

    // Calendar state
    const [currentMonth, setCurrentMonth] = useState(baseDate.getMonth());
    const [currentYear, setCurrentYear] = useState(baseDate.getFullYear());
    const [internalSelectedDate, setInternalSelectedDate] = useState(baseDate);

    // Time state
    let currHours = baseDate.getHours();
    let currMinutes = baseDate.getMinutes();

    const get12HourFormat = (hours: number) => {
        return hours % 12 || 12;
    };

    const [hour, setHour] = useState(get12HourFormat(currHours));
    const [minute, setMinute] = useState(currMinutes - (currMinutes % 30));
    const [ampm, setAmpm] = useState(currHours >= 12 ? "PM" : "AM");

    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const { dialogRef, handleBackdropClick } = useAccessibleModal({ isOpen: true, onClose });
    const [, startTransition] = useTransition();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        let mounted = true;
        const frame = requestAnimationFrame(() => { if (mounted) setIsVisible(true); });
        return () => { mounted = false; cancelAnimationFrame(frame); };
    }, []);

    useEffect(() => {
        mixpanel.track("Overlay Opened", {
            Overlay: "DateTimeOverlay",
            InitialDate: selectedDate instanceof Date && !isNaN(selectedDate.getTime())
                ? selectedDate.toISOString()
                : "Not Set",
            InitialTime: `${hour}:${minute} ${ampm}`,
            Page: window.location.pathname,
        });

        return () => {
            mixpanel.track("Overlay Closed", {
                Overlay: "DateTimeOverlay",
                Method: "Unmount",
                Page: window.location.pathname,
            });
        };
    }, []);

    // Generate calendar days
    const calendarDays = useMemo(() => {
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        const startingDay = firstDay.getDay();
        const totalDays = lastDay.getDate();

        const days = [];

        // Previous month's trailing days
        const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
        for (let i = startingDay - 1; i >= 0; i--) {
            days.push({
                day: prevMonthLastDay - i,
                isCurrentMonth: false,
                isPrevMonth: true,
                date: new Date(currentYear, currentMonth - 1, prevMonthLastDay - i)
            });
        }

        // Current month's days
        for (let i = 1; i <= totalDays; i++) {
            days.push({
                day: i,
                isCurrentMonth: true,
                date: new Date(currentYear, currentMonth, i)
            });
        }

        // Next month's leading days
        const remainingDays = 42 - days.length;
        for (let i = 1; i <= remainingDays; i++) {
            days.push({
                day: i,
                isCurrentMonth: false,
                isNextMonth: true,
                date: new Date(currentYear, currentMonth + 1, i)
            });
        }

        return days;
    }, [currentMonth, currentYear]);

    const isDateDisabled = (date: Date) => {
        if (!minDate) return false;
        const min = new Date(minDate);
        min.setHours(0, 0, 0, 0);
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);
        return checkDate < min;
    };

    const isToday = (date: Date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    const isSelected = (date: Date) => {
        return date.getDate() === internalSelectedDate.getDate() &&
            date.getMonth() === internalSelectedDate.getMonth() &&
            date.getFullYear() === internalSelectedDate.getFullYear();
    };

    const handleDateSelect = (dayInfo: DayInfo) => {
        if (isDateDisabled(dayInfo.date)) return;

        startTransition(() => {
            setInternalSelectedDate(dayInfo.date);
            setSelectedDate(dayInfo.date);
            if (dayInfo.isPrevMonth) {
                const d = new Date(currentYear, currentMonth - 1, 1);
                setCurrentMonth(d.getMonth());
                setCurrentYear(d.getFullYear());
            } else if (dayInfo.isNextMonth) {
                const d = new Date(currentYear, currentMonth + 1, 1);
                setCurrentMonth(d.getMonth());
                setCurrentYear(d.getFullYear());
            }
        });

        mixpanel.track("Date Changed", {
            Overlay: "DateTimeOverlay",
            NewDate: dayInfo.date.toISOString(),
            Page: window.location.pathname,
        });
    };

    const navigateMonth = (direction: number) => {
        const newDate = new Date(currentYear, currentMonth + direction, 1);
        startTransition(() => {
            setCurrentMonth(newDate.getMonth());
            setCurrentYear(newDate.getFullYear());
        });
    };

    const adjustTime = (type: string, value: number) => {
        if (type === "hour") {
            setHour((prev) => {
                let newHour = (prev + value) % 12;
                newHour = newHour > 0 ? newHour : newHour + 12;
                mixpanel.track("Time Adjusted", {
                    Overlay: "DateTimeOverlay",
                    Field: "Hour",
                    NewValue: newHour,
                    Page: window.location.pathname,
                });
                return newHour;
            });
        }
        if (type === "minute") {
            setMinute((prev) => {
                const newMinute = prev === 30 ? 0 : 30;
                mixpanel.track("Time Adjusted", {
                    Overlay: "DateTimeOverlay",
                    Field: "Minute",
                    NewValue: newMinute,
                    Page: window.location.pathname,
                });
                return newMinute;
            });
        }
        if (type === "ampm") {
            setAmpm((prev) => {
                const newAmpm = prev === "AM" ? "PM" : "AM";
                mixpanel.track("Time Adjusted", {
                    Overlay: "DateTimeOverlay",
                    Field: "AM/PM",
                    NewValue: newAmpm,
                    Page: window.location.pathname,
                });
                return newAmpm;
            });
        }
    };

    const handleSave = () => {
        let dateToSave = internalSelectedDate;
        if (!(dateToSave instanceof Date && !isNaN(dateToSave.getTime()))) {
            dateToSave = new Date();
        }

        const newDate = new Date(dateToSave);
        let adjustedHour = hour % 12;
        if (ampm === "PM") adjustedHour += 12;

        newDate.setHours(adjustedHour, minute, 0, 0);

        // Industry-standard validation: Check if selected time is in the past
        const now = new Date();
        if (newDate < now) {
            // Auto-adjust to minimum valid time (current time + 30 min rounded)
            const minValidTime = new Date(now.getTime() + 30 * 60 * 1000);
            const roundedMinutes = minValidTime.getMinutes() >= 30 ? 30 : 0;
            minValidTime.setMinutes(roundedMinutes, 0, 0);

            // Update internal state to show corrected time
            const correctedHour = minValidTime.getHours();
            setHour(correctedHour % 12 || 12);
            setMinute(roundedMinutes);
            setAmpm(correctedHour >= 12 ? "PM" : "AM");
            setInternalSelectedDate(minValidTime);

            // Show feedback but don't block - use corrected time
            newDate.setTime(minValidTime.getTime());
        }

        onSave(newDate);
        onClose();

        mixpanel.track("DateTime Saved", {
            Overlay: "DateTimeOverlay",
            SelectedDateTime: newDate.toISOString(),
            Page: window.location.pathname,
        });

        mixpanel.track("Overlay Closed", {
            Overlay: "DateTimeOverlay",
            Method: "Save",
            Page: window.location.pathname,
        });
    };

    const handleClose = () => {
        onClose();
        mixpanel.track("Overlay Closed", {
            Overlay: "DateTimeOverlay",
            Method: "Cancel",
            Page: window.location.pathname,
        });
    };

    const overlayContent = (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={handleBackdropClick}>
                {/* Backdrop */}
                <div
                    className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${isVisible ? "opacity-100" : "opacity-0"}`}
                    onClick={handleClose}
                />

                {/* Modal */}
                <div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="datetime-overlay-title"
                    style={{ willChange: "transform, opacity" }}
                    className={`relative w-[92%] max-w-[400px] max-h-[90vh] overflow-y-auto transition-all duration-300 ${isVisible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 translate-y-5"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-zinc-700">

                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-500 to-purple-500 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
                            <div className="flex items-center gap-2 text-white">
                                <Calendar className="w-5 h-5" aria-hidden="true" />
                                <span id="datetime-overlay-title" className="font-semibold">Select Date & Time</span>
                            </div>
                            <button
                                onClick={handleClose}
                                aria-label="Close date and time picker"
                                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                            >
                                <X className="w-5 h-5 text-white" aria-hidden="true" />
                            </button>
                        </div>

                        <div className="p-4">
                            {/* Calendar Section */}
                            <div className="mb-4">
                                {/* Month Navigation */}
                                <div className="flex items-center justify-between mb-3">
                                    <button
                                        onClick={() => navigateMonth(-1)}
                                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                                    >
                                        <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                                    </button>
                                    <h3 className="text-base font-semibold text-gray-800 dark:text-white">
                                        {monthNames[currentMonth]} {currentYear}
                                    </h3>
                                    <button
                                        onClick={() => navigateMonth(1)}
                                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                                    >
                                        <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                                    </button>
                                </div>

                                {/* Day Names */}
                                <div className="grid grid-cols-7 gap-1 mb-1">
                                    {dayNames.map((day) => (
                                        <div
                                            key={day}
                                            className="text-center text-xs font-medium text-gray-500 dark:text-gray-300 py-1"
                                        >
                                            {day}
                                        </div>
                                    ))}
                                </div>

                                {/* Calendar Grid */}
                                <div className="grid grid-cols-7 gap-1">
                                    {calendarDays.map((dayInfo, index) => {
                                        const disabled = isDateDisabled(dayInfo.date);
                                        const selected = isSelected(dayInfo.date);
                                        const today = isToday(dayInfo.date);

                                        return (
                                            <button
                                                key={index}
                                                onClick={() => handleDateSelect(dayInfo)}
                                                disabled={disabled}
                                                className={`
                                                    relative w-full aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all duration-150
                                                    ${!disabled ? "hover:scale-105 active:scale-95" : ""}
                                                    ${!dayInfo.isCurrentMonth ? "text-gray-300 dark:text-zinc-600" : ""}
                                                    ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
                                                    ${selected
                                                        ? "bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-md"
                                                        : dayInfo.isCurrentMonth
                                                            ? "text-gray-700 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                                                            : "hover:bg-gray-100 dark:hover:bg-zinc-700"
                                                    }
                                                    ${today && !selected ? "ring-2 ring-purple-400" : ""}
                                                `}
                                            >
                                                {dayInfo.day}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-zinc-600 to-transparent mb-4" />

                            {/* Time Section */}
                            <div className="mb-4">
                                <div className="flex items-center gap-2 mb-2 text-gray-700 dark:text-gray-300">
                                    <Clock className="w-4 h-4" />
                                    <span className="text-sm font-medium">Select Time</span>
                                </div>

                                <div className="flex items-center justify-center gap-2 bg-gray-50 dark:bg-zinc-700 rounded-xl p-3 border border-gray-200 dark:border-zinc-600">
                                    {/* Hour */}
                                    <div className="flex flex-col items-center">
                                        <button
                                            className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-600 transition-all duration-150 hover:scale-110 active:scale-90"
                                            onClick={() => adjustTime("hour", 1)}
                                        >
                                            <ChevronUp className="w-5 h-5 text-purple-500" />
                                        </button>
                                        <div className="bg-white dark:bg-zinc-600 px-3 py-1.5 rounded-lg my-1 shadow-sm border border-gray-200 dark:border-zinc-500">
                                            <span className="text-xl font-bold text-purple-600 dark:text-purple-400">
                                                {hour.toString().padStart(2, "0")}
                                            </span>
                                        </div>
                                        <button
                                            className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-600 transition-all duration-150 hover:scale-110 active:scale-90"
                                            onClick={() => adjustTime("hour", -1)}
                                        >
                                            <ChevronDown className="w-5 h-5 text-purple-500" />
                                        </button>
                                    </div>

                                    <span className="text-xl font-bold text-gray-400 dark:text-gray-300">:</span>

                                    {/* Minute */}
                                    <div className="flex flex-col items-center">
                                        <button
                                            className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-600 transition-all duration-150 hover:scale-110 active:scale-90"
                                            onClick={() => adjustTime("minute", 1)}
                                        >
                                            <ChevronUp className="w-5 h-5 text-purple-500" />
                                        </button>
                                        <div className="bg-white dark:bg-zinc-600 px-3 py-1.5 rounded-lg my-1 shadow-sm border border-gray-200 dark:border-zinc-500">
                                            <span className="text-xl font-bold text-purple-600 dark:text-purple-400">
                                                {minute.toString().padStart(2, "0")}
                                            </span>
                                        </div>
                                        <button
                                            className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-600 transition-all duration-150 hover:scale-110 active:scale-90"
                                            onClick={() => adjustTime("minute", -1)}
                                        >
                                            <ChevronDown className="w-5 h-5 text-purple-500" />
                                        </button>
                                    </div>

                                    {/* AM/PM */}
                                    <div className="flex flex-col items-center ml-1">
                                        <button
                                            className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-600 transition-all duration-150 hover:scale-110 active:scale-90"
                                            onClick={() => adjustTime("ampm", 1)}
                                        >
                                            <ChevronUp className="w-5 h-5 text-purple-500" />
                                        </button>
                                        <div className="bg-gradient-to-br from-blue-500 to-purple-500 px-2.5 py-1.5 rounded-lg my-1 shadow-md">
                                            <span className="text-lg font-bold text-white">
                                                {ampm}
                                            </span>
                                        </div>
                                        <button
                                            className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-600 transition-all duration-150 hover:scale-110 active:scale-90"
                                            onClick={() => adjustTime("ampm", -1)}
                                        >
                                            <ChevronDown className="w-5 h-5 text-purple-500" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Selected DateTime Preview */}
                            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-2.5 mb-4 border border-purple-200 dark:border-purple-800">
                                <p className="text-center text-xs text-gray-500 dark:text-gray-300">Selected</p>
                                <p className="text-center text-sm font-semibold text-purple-600 dark:text-purple-400">
                                    {internalSelectedDate instanceof Date && !isNaN(internalSelectedDate.getTime())
                                        ? new Intl.DateTimeFormat("en-US", {
                                            weekday: "short",
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric",
                                        }).format(internalSelectedDate)
                                        : "Select a date"
                                    }
                                    {" • "}
                                    {hour.toString().padStart(2, "0")}:{minute.toString().padStart(2, "0")} {ampm}
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <button
                                    className="flex-1 bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 px-4 py-3 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-zinc-600 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                                    onClick={handleClose}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-purple-600 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                                    onClick={handleSave}
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
    );

    // Use portal to render at body level
    return createPortal(overlayContent, document.body);
};

export default DateTimeOverlay;
