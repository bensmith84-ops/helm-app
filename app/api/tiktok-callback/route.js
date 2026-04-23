import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/tiktok-callback`;

  if (error || !code) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#fff">
        <h2>❌ ${error || "No authorization code received"}</h2>
        <script>setTimeout(() => window.close(), 3000)</script>
      </body></html>
    `, { headers: { "Content-Type": "text/html" } });
  }

  return new NextResponse(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#fff">
      <h2>🎵 Connecting to TikTok...</h2>
      <div id="status" style="margin-top:20px;color:#888"></div>
      <script>
        (async () => {
          try {
            const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/tiktok-social", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "oauth_callback", code: "${code}", redirect_uri: "${redirectUri}", org_id: "a0000000-0000-0000-0000-000000000001" })
            });
            const data = await res.json();
            if (data.error) { document.getElementById("status").innerHTML = '<span style="color:#ef4444">❌ ' + data.error + '</span>'; }
            else { document.getElementById("status").innerHTML = '<span style="color:#22c55e">✅ Connected! You can close this window.</span>'; if (window.opener) window.opener.location.reload(); }
          } catch(e) { document.getElementById("status").innerHTML = '<span style="color:#ef4444">❌ ' + e.message + '</span>'; }
          setTimeout(() => window.close(), 4000);
        })();
      </script>
    </body></html>
  `, { headers: { "Content-Type": "text/html" } });
}
