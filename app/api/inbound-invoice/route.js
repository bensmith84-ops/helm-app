import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ORG_ID = "a0000000-0000-0000-0000-000000000001";
const BEN_ID = "32cad5dd-9e94-4095-a16d-b4521391b050";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// POST /api/inbound-invoice
// Accepts:
// 1. SendGrid Inbound Parse webhook (multipart/form-data)
// 2. Resend inbound webhook (JSON)
// 3. Direct upload (JSON with base64 file)
// 4. Gmail forwarding (JSON from a scheduled scan)
export async function POST(req) {
  try {
    const supabase = getSupabase();
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const contentType = req.headers.get("content-type") || "";
    let fileName, fileBuffer, fileContentType, fromEmail, subject, bodyText;

    // === FORMAT 1: SendGrid Inbound Parse (multipart/form-data) ===
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      fromEmail = formData.get("from") || formData.get("sender_ip") || "unknown";
      subject = formData.get("subject") || "Invoice";
      bodyText = formData.get("text") || formData.get("html") || "";

      // Try to get attachment
      // SendGrid sends attachments as numbered fields: attachment1, attachment2, etc.
      // Also check the 'attachments' count field
      const attachmentCount = parseInt(formData.get("attachments") || "0");
      let file = null;

      for (let i = 1; i <= Math.max(attachmentCount, 5); i++) {
        const att = formData.get(`attachment${i}`);
        if (att && att instanceof Blob) { file = att; break; }
      }

      // Also check for generic 'file' or 'attachment' field names
      if (!file) file = formData.get("file") || formData.get("attachment");

      if (file && file instanceof Blob) {
        fileName = file.name || `invoice_${Date.now()}.pdf`;
        fileContentType = file.type || "application/pdf";
        fileBuffer = Buffer.from(await file.arrayBuffer());
      } else {
        // No attachment — store the email body for reference but still create inbox item
        fileName = null;
      }
    }
    // === FORMAT 2: JSON body (Resend webhook, direct upload, Gmail scan) ===
    else {
      const body = await req.json();

      fromEmail = body.from || body.sender || body.email || "unknown";
      subject = body.subject || "Invoice";
      bodyText = body.body || body.text || "";

      if (body.file_base64 && body.file_name) {
        // Direct upload with base64 file
        fileName = body.file_name;
        fileContentType = body.content_type || "application/pdf";
        fileBuffer = Buffer.from(body.file_base64, "base64");
      } else if (body.attachments && body.attachments.length > 0) {
        // Resend-style webhook with attachments array
        const att = body.attachments[0];
        fileName = att.filename || att.name || `invoice_${Date.now()}.pdf`;
        fileContentType = att.content_type || att.type || "application/pdf";
        if (att.content) {
          fileBuffer = Buffer.from(att.content, "base64");
        }
      } else if (body.file_url) {
        // URL to fetch
        fileName = body.file_name || `invoice_${Date.now()}.pdf`;
        fileContentType = body.content_type || "application/pdf";
        try {
          const res = await fetch(body.file_url);
          if (res.ok) fileBuffer = Buffer.from(await res.arrayBuffer());
        } catch (e) {
          console.error("[inbound-invoice] Failed to fetch file_url:", e.message);
        }
      }
    }

    // Upload file to Supabase Storage if we have one
    let fileUrl = null;
    if (fileBuffer && fileName) {
      const storagePath = `inbound/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("bill-attachments")
        .upload(storagePath, fileBuffer, {
          contentType: fileContentType || "application/pdf",
          upsert: true,
        });

      if (!upErr) {
        fileUrl = `${SUPABASE_URL}/storage/v1/object/public/bill-attachments/${storagePath}`;
      } else {
        console.error("[inbound-invoice] Storage upload error:", upErr.message);
      }
    }

    // Create invoice_inbox record
    const { data: inbox, error: insertErr } = await supabase
      .from("invoice_inbox")
      .insert({
        org_id: ORG_ID,
        file_name: fileName,
        file_url: fileUrl,
        file_content_type: fileContentType || null,
        file_size: fileBuffer?.length || 0,
        source: "email",
        status: fileUrl ? "pending" : "error",
        memo: `From: ${fromEmail}\nSubject: ${subject}`,
        error_message: fileUrl ? null : "No attachment found in email",
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[inbound-invoice] DB insert error:", insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Trigger AI extraction if we have a file
    let extraction = null;
    if (fileUrl && inbox) {
      try {
        const extractRes = await fetch(
          `${SUPABASE_URL}/functions/v1/invoice-ai`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "extract", inbox_id: inbox.id }),
          }
        );
        extraction = await extractRes.json();
      } catch (e) {
        console.error("[inbound-invoice] Extraction trigger error:", e.message);
      }
    }

    // Notify Ben that an invoice arrived
    await supabase.from("notifications").insert({
      org_id: ORG_ID,
      user_id: BEN_ID,
      type: "invoice_received",
      title: `Invoice received${extraction?.extracted?.vendor_name ? `: ${extraction.extracted.vendor_name}` : ""}`,
      body: `${extraction?.extracted?.total_amount ? `$${Number(extraction.extracted.total_amount).toLocaleString()}` : "New invoice"} from ${fromEmail}${extraction?.extracted?.vendor_name ? ` (${extraction.extracted.vendor_name})` : ""}`,
      entity_type: "invoice_inbox",
      entity_id: inbox.id,
      category: "finance",
      link: "/finance/ap-ar",
    });

    return NextResponse.json({
      success: true,
      inbox_id: inbox.id,
      status: inbox.status,
      file_url: fileUrl,
      extraction: extraction?.success ? {
        vendor: extraction.extracted?.vendor_name,
        amount: extraction.extracted?.total_amount,
        invoice_number: extraction.extracted?.invoice_number,
        confidence: extraction.extracted?.confidence,
      } : null,
    });
  } catch (e) {
    console.error("[inbound-invoice] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — health check / info
export async function GET() {
  return NextResponse.json({
    service: "Helm Invoice Inbox",
    description: "Send vendor invoices here. Accepts email webhooks (SendGrid/Resend) or direct upload.",
    endpoints: {
      POST: {
        "multipart/form-data": "SendGrid Inbound Parse format (from, subject, attachments)",
        "application/json": {
          direct_upload: "{ file_base64, file_name, content_type, from, subject }",
          url_fetch: "{ file_url, file_name, from, subject }",
          resend_webhook: "{ from, subject, attachments: [{ filename, content_type, content }] }",
        },
      },
    },
    status: "active",
  });
}
