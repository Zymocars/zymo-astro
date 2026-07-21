/**
 * InlineIcons — 13 hand-inlined SVG icons for always-loaded components
 * (NavBar, Footer, Header). SVG path data extracted verbatim from
 * lucide-react v0.474.0 to preserve visual parity.
 *
 * Rationale: NavBar/Footer/Header statically imported `lucide-react`, which
 * pulled the entire `vendor-ui` bundle (~152 KB) into the homepage entry
 * chunk graph. Per PSI 2026-07-06 tool output, ~34.7 KB of that was unused
 * on the homepage (76% waste). By inlining just these 13 icons here,
 * `lucide-react` leaves the entry graph entirely; the remaining ~53 files
 * that use it are all in lazy routes, so lucide code-splits automatically.
 *
 * Prior attempt (2026-07-05 T2) at removing lucide-react from vite.config.js
 * manualChunks failed because NavBar/Footer/Header statically imported it.
 * This file addresses that root cause.
 *
 * API: matches lucide-react's default component signature — accepts
 * `size?: number`, `strokeWidth?: number`, `color?: string`, plus standard
 * SVG props (className, etc.).
 */

import { forwardRef, SVGProps } from "react";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "color"> {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
}

const SIZE_DEFAULT = 24;

// Base SVG factory — matches lucide's default rendering exactly.
function makeIcon(displayName: string, children: JSX.Element) {
    const Icon = forwardRef<SVGSVGElement, IconProps>(
        ({ size = SIZE_DEFAULT, color = "currentColor", strokeWidth = 2, ...rest }, ref) => (
            <svg
                ref={ref}
                xmlns="http://www.w3.org/2000/svg"
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...rest}
            >
                {children}
            </svg>
        )
    );
    Icon.displayName = displayName;
    return Icon;
}

export const Menu = makeIcon(
    "Menu",
    <>
        <line x1="4" x2="20" y1="12" y2="12" />
        <line x1="4" x2="20" y1="6" y2="6" />
        <line x1="4" x2="20" y1="18" y2="18" />
    </>
);

export const X = makeIcon(
    "X",
    <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
    </>
);

export const CircleUser = makeIcon(
    "CircleUser",
    <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="10" r="3" />
        <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </>
);

export const Facebook = makeIcon(
    "Facebook",
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
);

export const Twitter = makeIcon(
    "Twitter",
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
);

export const Instagram = makeIcon(
    "Instagram",
    <>
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </>
);

export const Linkedin = makeIcon(
    "Linkedin",
    <>
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect width="4" height="12" x="2" y="9" />
        <circle cx="4" cy="4" r="2" />
    </>
);

export const Youtube = makeIcon(
    "Youtube",
    <>
        <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
        <path d="m10 15 5-3-5-3z" />
    </>
);

export const Star = makeIcon(
    "Star",
    <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
);

export const Shield = makeIcon(
    "Shield",
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
);

export const MapPin = makeIcon(
    "MapPin",
    <>
        <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
        <circle cx="12" cy="10" r="3" />
    </>
);

export const Car = makeIcon(
    "Car",
    <>
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" />
        <path d="M9 17h6" />
        <circle cx="17" cy="17" r="2" />
    </>
);

export const Lock = makeIcon(
    "Lock",
    <>
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
);

// NewRSB entry-graph icons (2026-07-06): NewRSB is imported by HomeScreen
// non-lazily, so its lucide imports were pulling vendor-ui into the homepage
// modulepreload. Adding these 4 unblocks the vendor-ui removal from entry graph.

export const Calendar = makeIcon(
    "Calendar",
    <>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
    </>
);

export const Sparkles = makeIcon(
    "Sparkles",
    <>
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        <path d="M20 3v4" />
        <path d="M22 5h-4" />
        <path d="M4 17v2" />
        <path d="M5 18H3" />
    </>
);

export const LocateFixed = makeIcon(
    "LocateFixed",
    <>
        <line x1="2" x2="5" y1="12" y2="12" />
        <line x1="19" x2="22" y1="12" y2="12" />
        <line x1="12" x2="12" y1="2" y2="5" />
        <line x1="12" x2="12" y1="19" y2="22" />
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="3" />
    </>
);

// Lucide-style aliases: newer versions of lucide-react export both `Name`
// and `NameIcon`. Preserve import compatibility for existing call sites.
export const MapPinIcon = MapPin;
export const CalendarIcon = Calendar;
export const SparklesIcon = Sparkles;
