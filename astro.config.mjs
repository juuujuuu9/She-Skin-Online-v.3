import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react(), clerk()],
  prefetch: {
    // Only prefetch on link click (not hover) to reduce bandwidth contention
    // during active navigation. 'hover' can cause prefetch storms when
    // moving mouse across many links.
    prefetchAll: false,
  },
  security: {
    checkOrigin: false, // Allow admin login from any origin
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': '/src',
        '@components': '/src/components',
        '@lib': '/src/lib',
        '@layouts': '/src/layouts',
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
  },
});
