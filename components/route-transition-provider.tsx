'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaperPlaneLoader } from '@/components/paper-plane-loader';

const RouteTransitionContext = createContext<(href: string) => void>(() => {});

export function useRouteTransition() {
  return useContext(RouteTransitionContext);
}

export function RouteTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const pendingHref = useRef<string | null>(null);

  const startTransition = useCallback((href: string) => {
    if (pendingHref.current) return;
    pendingHref.current = href;
    setShow(true);
  }, []);

  function handleComplete() {
    const href = pendingHref.current;
    pendingHref.current = null;
    setShow(false);
    if (href) router.push(href);
  }

  return (
    <RouteTransitionContext.Provider value={startTransition}>
      <PaperPlaneLoader show={show} onComplete={handleComplete} />
      {children}
    </RouteTransitionContext.Provider>
  );
}
