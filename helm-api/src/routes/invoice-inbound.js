
// POST /invoice-inbound — port of supabase/functions/invoice-inbound
// Receives invoice attachments via SendGrid Inbound Parse, JSON+base64, or JSON+file_url.
// Stores in Supabase Storage (bill-attachments bucket), creates invoice_inbox row.
const multer = require('multer');
const { uploadToStorage, SUPABASE_URL } = require('../lib/supabase-storage');

const ORG_ID = 'a0000000-0000-0000-0000-000000000001';
const BEN_ID = '32cad5dd-9e94-4095-a16d-b4521391b050';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

module.exports = function(app, { pool }) {
  // Health check
  app.get('/invoice-inbound', (_req, res) => {
    res.json({
      service: 'Helm Invoice Inbound',
      status: 'active',
      accepts: ['SendGrid Inbound Parse', 'JSON with base64 file', 'JSON with file_url'],
    });
  });

  // POST — use multer to handle both multipart and JSON
  app.post('/invoice-inbound', upload.any(), async (req, res) => {
    try {
      const ct = req.headers['content-type'] || '';
      let fileName = null;
      let fileBuffer = null;
      let fileContentType = 'application/pdf';
      let fromEmail = 'unknown';
      let subject = 'Invoice';

      if (ct.includes('multipart')) {
        // SendGrid Inbound Parse format
        fromEmail = String(req.body.from || req.body.sender_ip || 'unknown');
        subject = String(req.body.subject || 'Invoice');
        // Look at attachments — try attachment1..5 first, then any file
        const files = req.files || [];
        for (const f of files) {
          if (f.mimetype.includes('pdf') || f.mimetype.startsWith('image/')) {
            fileName = f.originalname || `invoice_${Date.now()}.pdf`;
            fileBuffer = f.buffer;
            fileContentType = f.mimetype;
            break;
          }
        }
      } else {
        const body = req.body || {};
        fromEmail = body.from || body.sender || body.email || 'unknown';
        subject = body.subject || 'Invoice';

        if (body.file_base64 && body.file_name) {
          fileName = body.file_name;
          fileContentType = body.content_type || 'application/pdf';
          fileBuffer = Buffer.from(body.file_base64, 'base64');
        } else if (body.file_url) {
          fileName = body.file_name || `invoice_${Date.now()}.pdf`;
          fileContentType = body.content_type || 'application/pdf';
          try {
            const r = await fetch(body.file_url);
            if (r.ok) fileBuffer = Buffer.from(await r.arrayBuffer());
          } catch (e) { console.error('fetch file_url:', e?.message); }
        } else if (body.attachments?.length > 0) {
          const att = body.attachments[0];
          fileName = att.filename || att.name || `invoice_${Date.now()}.pdf`;
          fileContentType = att.content_type || att.type || 'application/pdf';
          if (att.content) fileBuffer = Buffer.from(att.content, 'base64');
        }
      }

      // Upload to Supabase Storage
      let fileUrl = null;
      if (fileBuffer && fileName) {
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `inbound/${Date.now()}_${safeName}`;
        try {
          const result = await uploadToStorage('bill-attachments', storagePath, fileBuffer, fileContentType);
          fileUrl = result.public_url;
        } catch (e) {
          console.error('Storage upload error:', e?.message);
        }
      }

      // Create inbox record
      const { rows: invRows } = await pool.query(
        `INSERT INTO invoice_inbox
          (org_id, file_name, file_url, file_content_type, source, status, memo, error_message)
         VALUES ($1, $2, $3, $4, 'email', $5, $6, $7) RETURNING *`,
        [ORG_ID, fileName, fileUrl, fileContentType,
         fileUrl ? 'pending' : 'error',
         `From: ${fromEmail}\nSubject: ${subject}`,
         fileUrl ? null : 'No PDF/image attachment found in email']
      );
      const inbox = invRows[0];
      if (!inbox) return res.status(500).json({ error: 'Failed to create inbox record' });

      // Trigger AI extraction (call our own /invoice-ai endpoint)
      let extraction = null;
      if (fileUrl) {
        try {
          // We need our own URL — derive from env or use localhost (since we're calling self)
          const selfUrl = process.env.SELF_URL || 'http://localhost:8080';
          const r = await fetch(`${selfUrl}/invoice-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'extract', inbox_id: inbox.id }),
          });
          extraction = await r.json();
        } catch (e) {
          console.error('Extraction trigger error:', e?.message);
        }
      }

      // Notify Ben
      const vendorName = extraction?.extracted?.vendor_name;
      const amount = extraction?.extracted?.total_amount;
      await pool.query(
        `INSERT INTO notifications
          (org_id, user_id, type, title, body, entity_type, entity_id, category, link)
         VALUES ($1, $2, 'invoice_received', $3, $4, 'invoice_inbox', $5, 'finance', '/finance/ap-ar')`,
        [ORG_ID, BEN_ID,
         `Invoice received${vendorName ? `: ${vendorName}` : ''}`,
         `${amount ? '$' + Number(amount).toLocaleString() : 'New invoice'} from ${fromEmail}${vendorName ? ` (${vendorName})` : ''}`,
         inbox.id]
      );

      res.json({
        success: true,
        inbox_id: inbox.id,
        file_url: fileUrl,
        vendor: vendorName,
        amount,
        status: inbox.status,
      });
    } catch (e) {
      console.error('[invoice-inbound]', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
