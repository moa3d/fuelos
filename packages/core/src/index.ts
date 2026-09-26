export { createSupabaseClient, authStorageKey, type SupabaseConfig } from "./supabase";
export {
  errorMessage, loginErrorMessage, attemptsLeftText, isKnownError,
  FALLBACK_MESSAGE, LOGIN_NETWORK_MESSAGE, LOGIN_UNAVAILABLE_MESSAGE, PUMP_TAKEN_OFFLINE_MESSAGE, type ErrorDetail,
} from "./errors";
export { formatNumber, formatMoney, formatTime, formatDay } from "./format";
export { authErrorMessage, AUTH_NETWORK_MESSAGE, AUTH_FALLBACK_MESSAGE } from "./auth-errors";
