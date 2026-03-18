import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const APP_URL = "https://helm-app-six.vercel.app";
const SUPABASE_URL = "https://upbjdmnykheubxkuknuj.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
    return NextResponse.json({ error: "Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in Vercel env vars." }, { status: 500 });
  }

  // Step 1: Redirect to Shopify OAuth
  if (params.get("action") === "connect") {
    const shop = params.get("shop") || "earth-breeze-hydrogen.myshopify.com";
    const scopes = "read_orders,read_customers,read_products";
    const redirectUri = `${APP_URL}/api/shopify-callback`;
    const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${crypto.randomUUID()}`;
    return NextResponse.redirect(authUrl);
  }

  // Step 2: Handle callback
  const code = params.get("code");
  const shop = params.get("shop");

  if (!code || !shop) {
    return NextResponse.redirect(`${APP_URL}?shopify=error&msg=missing_code`);
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return NextResponse.redirect(`${APP_URL}?shopify=error&msg=token_${tokenRes.status}_${encodeURIComponent(err.slice(0, 200))}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const scopes = tokenData.scope;

    if (!accessToken) {
      return NextResponse.redirect(`${APP_URL}?shopify=error&msg=no_token_in_response`);
    }

    // Verify token by fetching shop info
    let shopMeta = {};
    try {
      const shopRes = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
        headers: { "X-Shopify-Access-Token": accessToken },
      });
      if (shopRes.ok) {
        const shopData = await shopRes.json();
        shopMeta = {
          shop_name: shopData.shop?.name,
          shop_domain: shopData.shop?.domain,
          shop_email: shopData.shop?.email,
          shop_currency: shopData.shop?.currency,
        };
      }
    } catch (_) {}

    // Store in Supabase directly
    if (SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { error: upsertErr } = await supabase.from("integrations").upsert({
        org_id: "a0000000-0000-0000-0000-000000000001",
        provider: "shopify",
        store_domain: shop,
        access_token: accessToken,
        scopes: scopes || "",
        status: "active",
        connected_at: new Date().toISOString(),
        metadata: shopMeta,
      }, { onConflict: "org_id,provider" });

      if (upsertErr) {
        console.error("Supabase upsert error:", upsertErr);
        // Fallback: try the edge function
        await fetch(`${SUPABASE_URL}/functions/v1/shopify-store-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shop, access_token: accessToken, scopes }),
        });
      }
    } else {
      // No service key — use edge function
      await fetch(`${SUPABASE_URL}/functions/v1/shopify-store-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop, access_token: accessToken, scopes }),
      });
    }

    return NextResponse.redirect(`${APP_URL}?shopify=connected`);

  } catch (err) {
    return NextResponse.redirect(`${APP_URL}?shopify=error&msg=${encodeURIComponent(err.message)}`);
  }
}
