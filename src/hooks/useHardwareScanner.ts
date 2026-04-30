import { useEffect, useRef } from 'react';

interface ScannerOptions {
  onScan: (token: string) => void;
  minChars?: number;
  timeGap?: number; // Time between keys to consider it a "burst"
}

/**
 * Hook to detect "Plug and Play" HID scanners that act as keyboards.
 * It listens for rapid input sequences ending in 'Enter'.
 */
export function useHardwareScanner({ onScan, minChars = 4, timeGap = 50 }: ScannerOptions) {
  const buffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field normally
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        // Special case: if we are in the verification modal, we might want to capture there
        // but generally, P&P scanners work best when they "just work" anywhere.
      }

      const currentTime = Date.now();
      
      // If the gap between keys is too long, it's a human typing, reset
      if (buffer.current.length > 0 && currentTime - lastKeyTime.current > timeGap) {
        buffer.current = '';
      }

      lastKeyTime.current = currentTime;

      if (e.key === 'Enter') {
        if (buffer.current.length >= minChars) {
          onScan(buffer.current);
          buffer.current = '';
          e.preventDefault();
        } else {
          buffer.current = '';
        }
      } else if (e.key.length === 1) {
        buffer.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan, minChars, timeGap]);
}
