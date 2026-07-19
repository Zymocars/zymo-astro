/**
 * <zymo-search> — vanilla web component search widget.
 *
 * Phase 1 minimum-viable implementation:
 *   - city dropdown (from a static supported-cities list)
 *   - pickup date (native <input type="date">)
 *   - return date (native <input type="date">)
 *   - submit → hard-nav to /app/self-drive-car-rental-in-{citySlug}/cars?startDate=...&endDate=...
 *
 * NOT implemented in Phase 1 (deferred to a follow-up commit):
 *   - Google Places autocomplete on the pickup location field (needs dynamic
 *     import of `@googlemaps/js-api-loader` on user focus per plan section 3)
 *   - Native `<popover>` date-time picker (out of scope for Phase 1 PoC)
 *   - Location detection via navigator.geolocation
 *   - Cookie state persistence
 *
 * Phase 1 goal is to prove the Astro shell + booking-flow handoff works.
 * The final custom element is scoped for Phase 2.
 */

// Supported cities — verified against
// zymo-web/src/components/NewRSB.tsx:66-74 (read this session).
const SUPPORTED_CITIES = [
  'delhi', 'bangalore', 'mumbai', 'hyderabad', 'chennai', 'pune', 'kolkata', 'ahmedabad',
  'noida', 'gurgaon', 'mangalore', 'thane', 'dombivli', 'palava', 'amritsar', 'bhubaneswar',
  'chandigarh', 'coimbatore', 'jaipur', 'kochi', 'nashik', 'madurai', 'ghaziabad', 'meerut',
  'goa', 'lucknow', 'bhopal', 'guwahati', 'indore', 'cochin', 'mysore', 'modinagar',
  'muradnagar', 'gurugram', 'nagpur', 'siliguri', 'trichy', 'vadodara', 'vijayawada',
  'vizag', 'udupi', 'visakhapatnam', 'udaipur', 'jodhpur', 'haridwar', 'rishikesh', 'surat',
  'ranchi', 'navi-mumbai', 'faridabad',
] as const;

type CitySlug = (typeof SUPPORTED_CITIES)[number];

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

class ZymoSearch extends HTMLElement {
  private form: HTMLFormElement | null = null;

  connectedCallback() {
    const initialCity = (this.getAttribute('city') || 'mumbai') as CitySlug;
    const now = new Date();
    // Default pickup: tomorrow 09:00.
    const pickup = new Date(now);
    pickup.setDate(pickup.getDate() + 1);
    pickup.setHours(9, 0, 0, 0);
    // Default return: +2 days from pickup.
    const returnDate = new Date(pickup);
    returnDate.setDate(returnDate.getDate() + 2);
    returnDate.setHours(18, 0, 0, 0);

    this.innerHTML = `
      <form class="zs-form" role="search" aria-label="Search self-drive car rentals">
        <label class="zs-field">
          <span class="zs-label">City</span>
          <select name="city" class="zs-input">
            ${SUPPORTED_CITIES
              .map(
                (slug) =>
                  `<option value="${slug}"${slug === initialCity ? ' selected' : ''}>${titleCase(slug)}</option>`
              )
              .join('')}
          </select>
        </label>

        <label class="zs-field">
          <span class="zs-label">Pickup date</span>
          <input
            type="datetime-local"
            name="startDate"
            class="zs-input"
            value="${toIsoDate(pickup)}T09:00"
            required
          />
        </label>

        <label class="zs-field">
          <span class="zs-label">Return date</span>
          <input
            type="datetime-local"
            name="endDate"
            class="zs-input"
            value="${toIsoDate(returnDate)}T18:00"
            required
          />
        </label>

        <button type="submit" class="zs-submit">Search cars</button>
      </form>
    `;

    this.form = this.querySelector('form');
    this.form?.addEventListener('submit', this.onSubmit);
  }

  disconnectedCallback() {
    this.form?.removeEventListener('submit', this.onSubmit);
  }

  private onSubmit = (event: Event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const city = String(data.get('city') || 'mumbai');
    const startDate = String(data.get('startDate') || '');
    const endDate = String(data.get('endDate') || '');

    // Basic client-side validation
    if (!startDate || !endDate) return;

    const qs = new URLSearchParams({ startDate, endDate }).toString();
    // Booking SPA lives at /app/self-drive-car-rental-in-{city}/cars per plan
    // section 7 (Phase 4 path-prefix split). For Phase 1 PoC, keep the current
    // Vite route pattern until the /app prefix ships.
    const target = `/self-drive-car-rental-in-${city}/cars?${qs}`;

    // Fire an analytics event via the Partytown-forwarded gtag stub if present.
    // If gtag is not yet ready, dataLayer.push queues it — Partytown replays
    // once the worker script arrives.
    try {
      (window as any).dataLayer = (window as any).dataLayer || [];
      (window as any).dataLayer.push({
        event: 'search_submit',
        city,
        startDate,
        endDate,
      });
    } catch (_) {
      /* analytics is best-effort */
    }

    window.location.assign(target);
  };
}

if (!customElements.get('zymo-search')) {
  customElements.define('zymo-search', ZymoSearch);
}

export {};
