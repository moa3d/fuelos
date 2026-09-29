// NEXT_PUBLIC_* values are inlined at build time; set them in apps/admin/.env.local (never committed).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
// Where owner-web's /welcome page lives — A2 builds the owner's join link against this origin.
export const OWNER_WEB_URL = process.env.NEXT_PUBLIC_OWNER_WEB_URL ?? "http://localhost:3001";

if (process.env.NODE_ENV === "development" && (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
    "Create apps/admin/.env.local (same values as apps/worker/.env.local) and restart `npm run dev:admin`.",
  );
}
