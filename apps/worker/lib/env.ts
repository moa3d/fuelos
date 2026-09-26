// NEXT_PUBLIC_* values are inlined at build time; set them in apps/worker/.env.local (never committed).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

if (process.env.NODE_ENV === "development" && (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
    "Create apps/worker/.env.local (see docs/briefs/01-worker-pwa.md) and restart `npm run dev`.",
  );
}
