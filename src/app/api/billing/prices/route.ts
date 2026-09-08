import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { serverEnv } from "@/lib/env";
import { getResolvedDisplayPrices } from "@/modules/billing/server/offers";
import { getStripeMode } from "@/modules/billing/stripePriceIds";

export async function GET(_req: NextRequest) {
  try {
    // Keep pricing behind auth (in-app only).
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prices = await getResolvedDisplayPrices(
      getStripeMode(serverEnv.STRIPE_MODE),
    );

    return NextResponse.json({ prices });
  } catch (err) {
    console.error("[billing/prices] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
