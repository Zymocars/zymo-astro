import { useEffect, useRef, useCallback } from 'react';
import { trapFocus, restoreFocus, getActiveElement } from '../utils/accessibility';

interface UseAccessibleModalOptions {
  isOpen: boolean;
  onClose: () => void;
  /** Set to false to skip focus trap (e.g. for non-interactive overlays) */
  trapFocusEnabled?: boolean;
}

/**
 * Hook for accessible modal dialogs (WCAG 2.1 AA).
 *
 * Handles:
 * - Focus trap inside modal
 * - Focus restore on close
 * - Escape key to close
 * - Body scroll lock
 * - Backdrop click to close
 *
 * Usage:
 *   const { dialogRef, handleBackdropClick } = useAccessibleModal({ isOpen, onClose });
 *   <div onClick={handleBackdropClick}>
 *     <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="title-id">
 */
export function useAccessibleModal({
  isOpen,
  onClose,
  trapFocusEnabled = true,
}: UseAccessibleModalOptions) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Save focus on open, restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = getActiveElement();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (previousFocusRef.current) {
        restoreFocus(previousFocusRef.current);
        previousFocusRef.current = null;
      }
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Trap focus
  useEffect(() => {
    if (!isOpen || !trapFocusEnabled || !dialogRef.current) return;
    const cleanup = trapFocus(dialogRef.current);
    return cleanup;
  }, [isOpen, trapFocusEnabled]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Backdrop click — close only when click is directly on the backdrop
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  return { dialogRef, handleBackdropClick };
}
