// C5 «سيارتي ومصروفي». Reads sales directly (sales_read RLS: customer_id = auth.uid()) rather than through
// invoices — a customer's own fills, whatever their invoice status, are what actually happened to the car.
// No monthly budget or oil-change-reminder field exists in the schema yet (see docs/briefs/04f), so those two
// parts of the design aren't built here rather than shown with made-up numbers.
import { lastMonthKeys, type Fill } from "./vehicle-rules";
import { currencyLabel } from "./prices-rules";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type VehicleOption = { id: string; plate: string; label: string | null };
export type VehicleDashboard = {
  vehicle: VehicleOption; fills: Fill[]; months: string[]; currency: string; fetchedAt: string;
};

export async function loadVehicles(customerId: string): Promise<VehicleOption[]> {
  const { data, error } = await supabase().from("vehicles").select("id, plate, label").eq("customer_id", customerId).eq("is_active", true).order("created_at").abortSignal(signal());
  if (error) throw new Error(error.message);
  return (data ?? []) as VehicleOption[];
}

export async function loadVehicleDashboard(customerId: string, vehicle: VehicleOption, monthsBack = 6): Promise<VehicleDashboard> {
  const months = lastMonthKeys(new Date().toISOString(), monthsBack);
  const from = `${months[0]}-01T00:00:00.000Z`;
  const { data, error } = await supabase().from("sales")
    .select("amount, liters, odometer_km, received_at, station_id")
    .eq("customer_id", customerId).eq("vehicle_id", vehicle.id).neq("status", "voided")
    .gte("received_at", from).order("received_at", { ascending: true }).abortSignal(signal());
  if (error) throw new Error(error.message);
  const fills: Fill[] = (data ?? []).map((s) => ({ receivedAt: s.received_at, amount: Number(s.amount), liters: Number(s.liters), odometerKm: s.odometer_km }));

  // currency label from public_station_prices (sales' own station isn't RLS-readable to a customer directly)
  const stationIds = [...new Set((data ?? []).map((s) => s.station_id as string))];
  let currency = "ل.س";
  if (stationIds.length > 0) {
    const st = await supabase().from("public_station_prices").select("currency_code").in("station_id", stationIds).limit(1).abortSignal(signal());
    if (st.data?.[0]) currency = currencyLabel(st.data[0].currency_code as string);
  }

  return { vehicle, fills, months, currency, fetchedAt: new Date().toISOString() };
}
