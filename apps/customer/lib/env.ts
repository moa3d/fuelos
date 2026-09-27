// NEXT_PUBLIC_* values are inlined at build time; set them in apps/customer/.env.local (never committed).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

if (process.env.NODE_ENV === "development" && (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
    "Create apps/customer/.env.local (same values as apps/worker/.env.local) and restart `npm run dev:customer`.",
  );
}
