import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY = "BH8BkhUxGLwyuQ0j4W1sOtbnBXAaC2YOC0r_b7QA-i6poRsOOsjEKgv89vZMYup7a9pYtPevtkL4nS9RlbILhVY";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

export type PushStatus = "unsupported" | "denied" | "enabled" | "disabled";

export async function getPushStatus(): Promise<PushStatus> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return "disabled";
  const sub = await reg.pushManager.getSubscription();
  return sub ? "enabled" : "disabled";
}

export async function enableOwnerPush(): Promise<number> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("denied");

  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
  });

  const json = sub.toJSON();
  const keys = json.keys as { p256dh: string; auth: string };
  const { data, error } = await supabase().rpc("subscribe_owner_push", {
    p_endpoint: sub.endpoint,
    p_p256dh: keys.p256dh,
    p_auth_key: keys.auth,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

export async function disableOwnerPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const { error } = await supabase().rpc("unsubscribe_owner_push", { p_endpoint: sub.endpoint });
  if (error) throw new Error(error.message);
  await sub.unsubscribe();
}
