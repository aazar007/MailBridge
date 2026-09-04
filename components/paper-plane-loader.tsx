'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';

const DURATION_MS = 950;

export function PaperPlaneLoader({
  show,
  onComplete,
}: {
  show: boolean;
  onComplete?: () => void;
}) {
  const doneRef = useRef(false);

  useEffect(() => {
    if (!show) {
      doneRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        onComplete?.();
      }
    }, DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [show, onComplete]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-gray-50/92 backdrop-blur-[2px] pointer-events-auto flex items-center justify-center"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
    >
      <Image
        src="/auto-sender-logo.png"
        alt=""
        width={52}
        height={52}
        className="loader-pulse object-contain drop-shadow-md"
        priority
      />
    </div>
  );
}
