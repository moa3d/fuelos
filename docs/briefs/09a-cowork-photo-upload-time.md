# Brief 09a — no honest "upload time" for a meter photo (minor, not blocking)

Written by Claude Code on 2026-10-04 while building the meter-photo galleries in owner-web (O7 approvals, O1
«آخر المناوبات»). **Nothing here blocks anything** — the galleries ship without this field; it's a possible
later nicety, not a request to act on now.

## What's missing
The task asked each photo's lightbox to show «وقت الرفع» (when it was uploaded). `leg_readings` has no
timestamp of its own (`opening_photo_path`/`closing_photo_path` are the only photo-related columns), so the
only place an actual upload time lives is Supabase Storage's own `storage.objects.created_at`. I checked
whether the client can read it directly:

```
GET /rest/v1/objects?select=name,created_at&bucket_id=eq.meter-photos
→ {"code":"PGRST106","message":"Invalid schema: storage","hint":"Only the following schemas are exposed: public, graphql_public"}
```

The `storage` schema isn't exposed over PostgREST at all (a project-level API setting, separate from RLS —
`fuelos_meter_photos_read`'s RLS policy would otherwise allow it fine for a station member). This isn't
something the client can work around, so rather than fake an upload time or silently drop the request, the
galleries show the **leg's own `started_at`/`ended_at`** next to each opening/closing photo instead — honest,
and in practice only moments apart from the real upload, since the attendant photographs the meter right when
opening or closing.

## If exact upload time is ever wanted
Either works, whichever is less to maintain:
- Expose `storage` in the project's API settings (Database → API → Exposed schemas) — simplest, but widens
  what's reachable beyond just this one use.
- A small SECURITY DEFINER RPC, e.g. `meter_photo_times(p_paths text[]) returns jsonb`, scoped to `public.leg_readings`'s
  own RLS (station members only) and returning just `{path, created_at}` pairs — narrower, no schema exposure change.
