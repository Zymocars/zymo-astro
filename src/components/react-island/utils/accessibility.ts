/**
 * Accessibility Utilities
 *
 * Helpers for implementing WCAG 2.1 AA compliance:
 * - Focus management
 * - Screen reader announcements
 * - Keyboard navigation
 * - Color contrast utilities
 */

/**
 * Announce a message to screen readers
 * Uses ARIA live regions for dynamic content updates
 */
export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
) {
  // Find or create the announcer element
  let announcer = document.getElementById('sr-announcer');

  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = 'sr-announcer';
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', priority);
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'sr-only';
    announcer.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;
    document.body.appendChild(announcer);
  }

  // Update priority if needed
  announcer.setAttribute('aria-live', priority);

  // Clear and set message (needed for re-announcement)
  announcer.textContent = '';
  requestAnimationFrame(() => {
    announcer!.textContent = message;
  });
}

/**
 * Trap focus within a container (for modals/dialogs)
 */
export function trapFocus(container: HTMLElement) {
  const focusableElements = container.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    }
  }

  container.addEventListener('keydown', handleKeyDown);

  // Focus the first element
  firstElement?.focus();

  // Return cleanup function
  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Restore focus to a previous element (after modal closes)
 */
export function restoreFocus(previousElement: HTMLElement | null) {
  if (previousElement && typeof previousElement.focus === 'function') {
    previousElement.focus();
  }
}

/**
 * Get the currently focused element
 */
export function getActiveElement(): HTMLElement | null {
  return document.activeElement as HTMLElement;
}

/**
 * Check if element is focusable
 */
export function isFocusable(element: HTMLElement): boolean {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ];

  return focusableSelectors.some((selector) => element.matches(selector));
}

/**
 * Skip to main content (for skip link)
 */
export function skipToMain() {
  const main = document.querySelector('main') || document.getElementById('main-content');
  if (main) {
    (main as HTMLElement).focus();
    (main as HTMLElement).scrollIntoView({ behavior: 'smooth' });
  }
}

/**
 * Check color contrast ratio
 * Returns the contrast ratio between two colors
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Get relative luminance of a color
 */
export function getLuminance(color: string): number {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;

  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Convert hex to RGB
 * Supports 3-digit and 6-digit hex codes with or without #
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Convert 3-digit to 6-digit
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }

  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Check if contrast meets WCAG requirements
 */
export function meetsContrastRequirement(
  color1: string,
  color2: string,
  level: 'AA' | 'AAA' = 'AA',
  largeText: boolean = false
): boolean {
  const ratio = getContrastRatio(color1, color2);

  if (level === 'AAA') {
    return largeText ? ratio >= 4.5 : ratio >= 7;
  }
  // AA level
  return largeText ? ratio >= 3 : ratio >= 4.5;
}

/**
 * Generate accessible ID
 */
let idCounter = 0;
export function generateId(prefix: string = 'zymo'): string {
  return `${prefix}-${++idCounter}`;
}

/**
 * Accessible click handler that also handles keyboard
 */
export function accessibleClick(
  callback: (e: React.MouseEvent | React.KeyboardEvent) => void
) {
  return {
    onClick: callback,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        callback(e);
      }
    },
    role: 'button',
    tabIndex: 0,
  };
}

/**
 * Prefers reduced motion check
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * High contrast mode check
 */
export function prefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: more)').matches;
}

export default {
  announceToScreenReader,
  trapFocus,
  restoreFocus,
  getActiveElement,
  isFocusable,
  skipToMain,
  getContrastRatio,
  meetsContrastRequirement,
  generateId,
  accessibleClick,
  prefersReducedMotion,
  prefersHighContrast,
};
