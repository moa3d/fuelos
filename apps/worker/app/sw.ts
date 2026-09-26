// Service worker: precaches the app shell so the worker app opens without internet.
// Sales and shifts are NOT synced here (iOS has no Background Sync); the outbox syncs from the page.
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

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
  runtimeCaching: [
    // FIRST: never cache Supabase. defaultCache would cache cross-origin GETs such as /auth/v1/user
    // keyed only by URL, so on a shared phone one attendant could see another's data.
    { matcher: ({ url }) => url.hostname.endsWith(".supabase.co"), handler: new NetworkOnly() },
    ...defaultCache,
  ],
  // An installed app opened offline on a page that isn't cached gets the app's own login screen
  // (which shows its offline state) instead of the browser's error page.
  fallbacks: {
    entries: [{ url: "/", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
