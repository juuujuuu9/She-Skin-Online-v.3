'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

const MD_BREAKPOINT = 768;

function isAdminPage(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
}

function isMdOrLarger(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(`(min-width: ${MD_BREAKPOINT}px)`).matches;
}

function shouldUseLenis(): boolean {
  return !isAdminPage() && isMdOrLarger();
}

export function LenisSmoothScroll() {
  useEffect(() => {
    let lenis: InstanceType<typeof Lenis> | null = null;

    function initLenis(): void {
      if (lenis) return;
      lenis = new Lenis({ autoRaf: true, anchors: true });
    }

    function destroyLenis(): void {
      if (!lenis) return;
      lenis.destroy();
      lenis = null;
    }

    function syncLenis(): void {
      if (shouldUseLenis()) {
        initLenis();
      } else {
        destroyLenis();
      }
    }

    syncLenis();

    const resizeHandler = () => syncLenis();
    window.addEventListener('resize', resizeHandler);

    const pageLoadHandler = () => {
      syncLenis();
      // Don't force scroll to top - View Transitions handle this naturally
      // and forcing it causes jank. Only scroll if not at top already.
      if (lenis && !isAdminPage() && window.scrollY > 0) {
        lenis.scrollTo(0, { immediate: false });
      }
    };
    document.addEventListener('astro:page-load', pageLoadHandler);

    const beforeSwapHandler = () => {
      if (lenis && !isAdminPage()) {
        // Use immediate: false (smooth) to avoid blocking the main thread
        // during page transitions. The native browser scroll will reset anyway.
        lenis.scrollTo(0, { immediate: false });
      }
    };
    document.addEventListener('astro:before-swap', beforeSwapHandler);

    return () => {
      window.removeEventListener('resize', resizeHandler);
      document.removeEventListener('astro:page-load', pageLoadHandler);
      document.removeEventListener('astro:before-swap', beforeSwapHandler);
      destroyLenis();
    };
  }, []);

  return null;
}
