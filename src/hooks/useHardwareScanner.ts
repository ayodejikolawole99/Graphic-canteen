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
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field normally
      const isInput = 
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;

      const currentTime = Date.now();
      
      // If the gap between keys is too long, it might be a human typing
      // But we still want to capture if it's the start of a sequence
      if (buffer.current.length > 0 && currentTime - lastKeyTime.current > timeGap) {
        // Reset if too long gap
        buffer.current = '';
      }

      lastKeyTime.current = currentTime;

      if (e.key === 'Enter') {
        if (buffer.current.length >= minChars) {
          console.log("Hardware Scan Detected (Enter):", buffer.current);
          onScan(buffer.current);
          buffer.current = '';
          e.preventDefault();
        } else {
          buffer.current = '';
        }
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      } else if (e.key.length === 1) {
        // Only append if it's not an input field, or if we want global capture
        if (!isInput) {
          buffer.current += e.key;
          
          // Clear previous timeout
          if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
          
          // Set a timeout to trigger scan if no 'Enter' is sent but sequence stops
          timeoutRef.current = window.setTimeout(() => {
            if (buffer.current.length >= minChars) {
              console.log("Hardware Scan Detected (Timeout):", buffer.current);
              onScan(buffer.current);
            }
            buffer.current = '';
          }, 200); // 200ms of silence after a burst triggers the scan
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [onScan, minChars, timeGap]);
}
