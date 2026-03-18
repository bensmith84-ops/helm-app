import { NextResponse } from "next/server";

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const APP_URL = "https://helm-app-six.vercel.app";

export async function GET(request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
    return NextResponse.json({ error: "Shopify credentials not configured. Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in Vercel env vars." }, { status: 500 });
  }

  if (params.get("action") === "connect") {
    const shop = params.get("shop") || "earth-breeze-hydrogen.myshopify.com";
    const state = crypto.randomUUID();
    const scopes = "read_orders,read_customers,read_products";
    const redirectUri = `${APP_URL}/api/shopify-callback`;
    const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    return NextResponse.redirect(authUrl);
  }

  const code = params.get("code");
  const shop = params.get("shop");

  if (!code || !shop) {
    return NextResponse.redirect(`${APP_URL}?shopify=error&msg=missing_code`);
  }

  try {
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
      console.error("Shopify token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(`${APP_URL}?shopify=error&msg=token_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const scopes = tokenData.scope;

    if (!accessToken) {
      return NextResponse.redirect(`${APP_URL}?shopify=error&msg=no_token`);
    }

    await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/shopify-store-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop, access_token: accessToken, scopes }),
    });

    return NextResponse.redirect(`${APP_URL}?shopify=connected`);

  } catch (err) {
    console.error("Shopify OAuth error:", err);
    return NextResponse.redirect(`${APP_URL}?shopify=error&msg=${encodeURIComponent(err.message)}`);
  }
}
// Shopify integration ready
