import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#fff">
        <h2>❌ Connection Failed</h2>
        <p style="color:#888">${error}</p>
        <script>setTimeout(() => window.close(), 3000)</script>
      </body></html>
    `, { headers: { "Content-Type": "text/html" } });
  }

  if (!code) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#fff">
        <h2>❌ No authorization code received</h2>
        <script>setTimeout(() => window.close(), 3000)</script>
      </body></html>
    `, { headers: { "Content-Type": "text/html" } });
  }

  // Pass the code to the meta-social edge function to exchange for token
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/meta-callback`;

  return new NextResponse(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#fff">
      <h2>🔗 Connecting to Meta...</h2>
      <p style="color:#888">Exchanging authorization code for access token...</p>
      <div id="status" style="margin-top:20px;color:#888"></div>
      <script>
        (async () => {
          try {
            const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/meta-social", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "oauth_callback",
                code: "${code}",
                redirect_uri: "${redirectUri}",
                org_id: "a0000000-0000-0000-0000-000000000001"
              })
            });
            const data = await res.json();
            if (data.error) {
              document.getElementById("status").innerHTML = '<span style="color:#ef4444">❌ ' + data.error + '</span>';
            } else {
              document.getElementById("status").innerHTML = '<span style="color:#22c55e">✅ Connected ' + (data.accounts?.length || 0) + ' account(s)! You can close this window.</span>';
              if (window.opener) window.opener.location.reload();
            }
          } catch(e) {
            document.getElementById("status").innerHTML = '<span style="color:#ef4444">❌ ' + e.message + '</span>';
          }
          setTimeout(() => window.close(), 4000);
        })();
      </script>
    </body></html>
  `, { headers: { "Content-Type": "text/html" } });
}
