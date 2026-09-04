'use client';

import { useRouteTransition } from '@/components/route-transition-provider';

export function TransitionLink({
  href,
  className,
  children,
  ...props
}: React.ComponentProps<'a'> & { href: string }) {
  const startTransition = useRouteTransition();

  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        startTransition(href);
      }}
      {...props}
    >
      {children}
    </a>
  );
}
