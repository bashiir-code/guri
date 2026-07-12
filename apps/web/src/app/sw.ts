import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';

// Injected by @serwist/next at build time with the precache manifest.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // defaultCache: network-first for pages/data, cache-first for static assets.
  // Deal/lease state must never be stale (rules 1–2), so API responses are
  // not cached here — NEXT_PUBLIC_API_URL is a different origin, which
  // defaultCache already treats as network-only.
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
