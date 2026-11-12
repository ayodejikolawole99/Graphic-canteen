import { useEffect, useRef } from 'react';

interface ScannerOptions {
  onScan: (token: string) => void;
  minChars?: number;
  timeGap?: number; // Time between keys to consider it a "burst" from a hardware reader
  allowInInputs?: boolean;
}

/**
 * Hook to detect "Plug and Play" HID RFID / Barcode readers that emulate keyboards.
 * USB RFID readers stream card serial numbers (e.g. '0010482914' or 'A3F8091B')
 * within milliseconds and usually terminate with an 'Enter' keycode.
 */
export function useHardwareScanner({
  onScan,
  minChars = 3,
  timeGap = 90,
  allowInInputs = false
}: ScannerOptions) {
  const buffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isSpecificRfidInput = target?.getAttribute('data-rfid-input') === 'true';
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      // Allow if configured or marked as an RFID capturing input
      if (isInput && !allowInInputs && !isSpecificRfidInput) {
        return;
      }

      const currentTime = Date.now();

      // Reset buffer if delay between characters exceeds hardware burst threshold
      if (buffer.current.length > 0 && currentTime - lastKeyTime.current > timeGap) {
        buffer.current = '';
      }

      lastKeyTime.current = currentTime;

      if (e.key === 'Enter') {
        const rawToken = buffer.current.trim();
        if (rawToken.length >= minChars) {
          e.preventDefault();
          onScan(rawToken);
        }
        buffer.current = '';
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      } else if (e.key.length === 1) {
        buffer.current += e.key;

        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);

        // Fallback for readers that don't send Enter at the end of the burst
        timeoutRef.current = window.setTimeout(() => {
          const rawToken = buffer.current.trim();
          if (rawToken.length >= minChars) {
            onScan(rawToken);
          }
          buffer.current = '';
        }, 220);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [onScan, minChars, timeGap, allowInInputs]);
}
