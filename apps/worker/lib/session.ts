import { db, type CurrentMember } from "./db";
import { supabase } from "./supabase";

/** The signed-in attendant on this device, or undefined (the page then goes back to L2). */
export async function signedInMember(): Promise<CurrentMember | undefined> {
  const { data } = await supabase().auth.getSession();
  const userId = data.session?.user.id;
  const member = await db.member.get("current").catch(() => undefined);
  return userId && member?.userId === userId ? member : undefined;
}
