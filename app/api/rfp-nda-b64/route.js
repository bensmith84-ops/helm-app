// TEMPORARY: proxies the ESign MNDA template PDF as base64 for one-time text extraction.
export const dynamic = "force-dynamic";
const PDF_URL = "https://upbjdmnykheubxkuknuj.supabase.co/storage/v1/object/public/esign-documents/templates/a0000000-0000-0000-0000-000000000001/1775866924817_Earth%20Breeze%20MNDA%20Template%20(1).pdf";
export async function GET() {
  const r = await fetch(PDF_URL);
  if (!r.ok) return new Response("fetch failed " + r.status, { status: 502 });
  const buf = Buffer.from(await r.arrayBuffer());
  return new Response(JSON.stringify({ size: buf.length, b64: buf.toString("base64") }), { headers: { "Content-Type": "application/json" } });
}
