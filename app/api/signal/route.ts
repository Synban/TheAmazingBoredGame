import { getLastSignal, pushSignal } from "@/lib/signal-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const signal = await getLastSignal();
  return Response.json({ signal });
}

export async function POST() {
  const signal = await pushSignal();
  return Response.json({ signal });
}
