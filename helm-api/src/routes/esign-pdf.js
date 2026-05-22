
// POST /esign-pdf — port of supabase/functions/esign-pdf
// Generates completed PDF + certificate of completion. Uses pdf-lib.
// Uploads to Supabase Storage via wrapper.
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { uploadToStorage } = require('../lib/supabase-storage');

module.exports = function(app, { pool }) {
  app.post('/esign-pdf', async (req, res) => {
    try {
      const { envelope_id } = req.body || {};
      if (!envelope_id) return res.status(400).json({ error: 'envelope_id required' });

      const { rows: envRows } = await pool.query(`SELECT * FROM esign_envelopes WHERE id = $1 LIMIT 1`, [envelope_id]);
      const envelope = envRows[0];
      if (!envelope) return res.status(404).json({ error: 'Envelope not found' });
      if (envelope.status !== 'completed') return res.status(400).json({ error: 'Envelope not completed yet' });

      const { rows: signers } = await pool.query(
        `SELECT * FROM esign_signers WHERE envelope_id = $1 ORDER BY signing_order`, [envelope_id]
      );
      if (!signers.length) return res.status(400).json({ error: 'No signers found' });

      const { rows: dbFields } = await pool.query(
        `SELECT * FROM esign_fields WHERE envelope_id = $1 ORDER BY page_number, y_pct`, [envelope_id]
      );

      let pdfDoc;
      if (envelope.document_url) {
        try {
          const docResp = await fetch(envelope.document_url);
          const docBytes = new Uint8Array(await docResp.arrayBuffer());
          pdfDoc = await PDFDocument.load(docBytes);
        } catch (e) {
          console.error('[esign-pdf] load failed, using blank:', e?.message);
          pdfDoc = await PDFDocument.create();
          pdfDoc.addPage([612, 792]);
        }
      } else {
        pdfDoc = await PDFDocument.create();
        pdfDoc.addPage([612, 792]);
      }

      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const courier = await pdfDoc.embedFont(StandardFonts.Courier);
      const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
      const pages = pdfDoc.getPages();

      const signerById = {};
      for (const s of signers) signerById[s.id] = s;

      // Field overlay
      for (const field of dbFields) {
        const pageIdx = (field.page_number || 1) - 1;
        if (pageIdx < 0 || pageIdx >= pages.length) continue;
        const page = pages[pageIdx];
        const { width: pw, height: ph } = page.getSize();
        const x = (field.x_pct / 100) * pw;
        const y = ph - ((field.y_pct / 100) * ph) - ((field.height_pct / 100) * ph);
        const w = (field.width_pct / 100) * pw;
        const h = (field.height_pct / 100) * ph;

        const signer = signerById[field.signer_id];
        if (!signer) continue;
        const det = signer.signer_details || {};
        const ft = field.field_type;

        if (ft === 'signature') {
          if (signer.signature_data?.type === 'draw' && signer.signature_data.value) {
            try {
              const b64 = signer.signature_data.value.split(',')[1];
              const sigBytes = Buffer.from(b64, 'base64');
              const sigImg = await pdfDoc.embedPng(sigBytes);
              const scale = Math.min(w / sigImg.width, h / sigImg.height);
              const imgW = sigImg.width * scale;
              const imgH = sigImg.height * scale;
              page.drawImage(sigImg, { x, y: y + (h - imgH), width: imgW, height: imgH });
            } catch {
              page.drawText(det.name || signer.name, { x, y: y + 4, size: Math.min(h * 0.6, 14), font: timesItalic, color: rgb(0.05, 0.05, 0.2) });
            }
          } else if (signer.signature_data?.type === 'type' && signer.signature_data.value) {
            page.drawText(signer.signature_data.value, { x, y: y + 4, size: Math.min(h * 0.6, 16), font: timesItalic, color: rgb(0.05, 0.05, 0.2) });
          }
        } else if (ft === 'initials') {
          if (signer.initials_data) {
            page.drawText(String(signer.initials_data), { x, y: y + 4, size: Math.min(h * 0.6, 14), font: timesItalic, color: rgb(0.05, 0.05, 0.2) });
          } else {
            const initials = (det.name || signer.name || '').split(' ').map(w => w[0]).join('').toUpperCase();
            page.drawText(initials, { x, y: y + 4, size: Math.min(h * 0.6, 14), font: timesItalic, color: rgb(0.05, 0.05, 0.2) });
          }
        } else {
          let textValue = '';
          switch (ft) {
            case 'name': textValue = det.name || signer.name || ''; break;
            case 'email': textValue = det.email || signer.email || ''; break;
            case 'date_signed': textValue = det.date || (signer.signed_at ? new Date(signer.signed_at).toLocaleDateString('en-US') : ''); break;
            case 'title': textValue = det.title || ''; break;
            case 'company': textValue = det.company || ''; break;
            case 'company_address': textValue = det.company_address || ''; break;
            case 'entity_type': textValue = det.entity_type || ''; break;
            case 'jurisdiction': textValue = det.jurisdiction || ''; break;
            case 'phone': textValue = det.phone || ''; break;
            case 'notices_email': textValue = det.notices_email || det.email || signer.email || ''; break;
            case 'send_copy_to': textValue = det.send_copy_to || ''; break;
            case 'text': textValue = field.value || ''; break;
            case 'checkbox': textValue = field.value === 'yes' ? '\u2611' : '\u2610'; break;
            default: textValue = field.value || ''; break;
          }
          if (textValue) {
            const fontSize = Math.min(h * 0.55, 11);
            const maxChars = Math.floor(w / (fontSize * 0.5));
            const displayText = textValue.length > maxChars ? textValue.slice(0, maxChars - 1) + '\u2026' : textValue;
            page.drawText(displayText, { x: x + 2, y: y + (h * 0.3), size: fontSize, font: helvetica, color: rgb(0, 0, 0) });
          }
        }
      }

      // Certificate page
      const certPage = pdfDoc.addPage([612, 792]);
      const accent = rgb(0.388, 0.4, 0.945);
      const dark = rgb(0.1, 0.1, 0.18);
      const gray = rgb(0.45, 0.45, 0.55);
      const green = rgb(0.133, 0.773, 0.369);
      let cy = 740;

      certPage.drawRectangle({ x: 0, y: 730, width: 612, height: 62, color: accent });
      certPage.drawText('CERTIFICATE OF COMPLETION', { x: 40, y: 755, size: 16, font: helveticaBold, color: rgb(1, 1, 1) });
      certPage.drawText('Helm E-Sign', { x: 480, y: 755, size: 11, font: helvetica, color: rgb(1, 1, 1) });

      cy = 710;
      certPage.drawText(envelope.title, { x: 40, y: cy, size: 18, font: helveticaBold, color: dark });
      cy -= 16;
      const cDate = envelope.completed_at
        ? new Date(envelope.completed_at).toLocaleString('en-US',
            { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      certPage.drawText(`Completed: ${cDate}`, { x: 40, y: cy, size: 9, font: helvetica, color: gray });
      cy -= 12;
      certPage.drawText(`Envelope ID: ${envelope.id}`, { x: 40, y: cy, size: 7, font: courier, color: gray });
      cy -= 25;
      certPage.drawRectangle({ x: 40, y: cy, width: 532, height: 1, color: rgb(0.88, 0.88, 0.92) });
      cy -= 20;
      certPage.drawText('SIGNERS', { x: 40, y: cy, size: 10, font: helveticaBold, color: accent });
      cy -= 18;

      const signerOnly = signers.filter(s => s.role === 'signer');
      for (const s of signerOnly) {
        const det = s.signer_details || {};
        const boxH = 115;
        if (cy - boxH < 60) {
          pdfDoc.addPage([612, 792]);
          cy = 740;
        }
        certPage.drawRectangle({
          x: 40, y: cy - boxH, width: 532, height: boxH,
          color: rgb(0.97, 0.97, 0.99),
          borderColor: rgb(0.88, 0.88, 0.92), borderWidth: 0.5,
        });
        certPage.drawText(det.name || s.name, { x: 55, y: cy - 12, size: 13, font: helveticaBold, color: dark });
        const titleLine = [det.title, det.company].filter(Boolean).join(' at ');
        if (titleLine) certPage.drawText(titleLine, { x: 55, y: cy - 25, size: 9, font: helvetica, color: gray });

        certPage.drawText('Signed', { x: 460, y: cy - 12, size: 11, font: helveticaBold, color: green });
        if (s.signed_at) certPage.drawText(new Date(s.signed_at).toLocaleString(), { x: 410, y: cy - 25, size: 7, font: helvetica, color: gray });

        if (s.signature_data?.type === 'draw' && s.signature_data.value) {
          try {
            const b64 = s.signature_data.value.split(',')[1];
            const bytes = Buffer.from(b64, 'base64');
            const img = await pdfDoc.embedPng(bytes);
            const sc = 30 / img.height;
            certPage.drawImage(img, { x: 55, y: cy - 65, width: img.width * sc, height: 30 });
          } catch {
            certPage.drawText(det.name || s.name, { x: 55, y: cy - 55, size: 14, font: timesItalic, color: dark });
          }
        } else if (s.signature_data?.type === 'type') {
          certPage.drawText(s.signature_data.value || s.name, { x: 55, y: cy - 55, size: 16, font: timesItalic, color: dark });
        }

        const details = [
          ['Email', det.email || s.email], ['Phone', det.phone || ''],
          ['Entity', det.company || ''], ['Type', det.entity_type || ''],
          ['Address', det.company_address || ''], ['Jurisdiction', det.jurisdiction || ''],
        ].filter(d => d[1]);
        let dl = 0;
        for (const [lab, val] of details) {
          certPage.drawText(`${lab}:`, { x: 220, y: cy - 42 - dl * 11, size: 7, font: helveticaBold, color: gray });
          const dispVal = val.length > 60 ? val.slice(0, 60) + '...' : val;
          certPage.drawText(dispVal, { x: 275, y: cy - 42 - dl * 11, size: 7, font: helvetica, color: dark });
          dl++;
        }

        certPage.drawText(`IP: ${s.ip_address || 'N/A'} | Consent: ${s.consent_given ? 'Yes' : 'No'}`,
          { x: 55, y: cy - boxH + 8, size: 6, font: helvetica, color: gray });
        cy -= boxH + 12;
      }

      if (envelope.document_hash) {
        certPage.drawRectangle({ x: 40, y: cy - 18, width: 532, height: 22, color: rgb(0.96, 0.96, 0.98) });
        certPage.drawText(`SHA-256: ${envelope.document_hash}`, { x: 50, y: cy - 12, size: 7, font: courier, color: gray });
        cy -= 35;
      }

      const legal = [
        'This certificate confirms that all parties listed above signed the document electronically.',
        'Signatures are legally binding under the ESIGN Act, UETA, and eIDAS regulations.',
        'All signing events were recorded in a tamper-evident audit trail.',
      ];
      for (const l of legal) { certPage.drawText(l, { x: 40, y: cy, size: 7, font: helvetica, color: gray }); cy -= 10; }

      const pdfBytes = await pdfDoc.save();
      const fileName = `completed/${envelope.org_id}/${envelope.id}.pdf`;
      let completedUrl = null;
      try {
        const upload = await uploadToStorage('esign-documents', fileName, Buffer.from(pdfBytes), 'application/pdf');
        completedUrl = upload.public_url;
      } catch (e) {
        console.error('[esign-pdf] upload:', e?.message);
      }

      if (completedUrl) {
        await pool.query(
          `UPDATE esign_envelopes SET completed_document_url = $1 WHERE id = $2`,
          [completedUrl, envelope_id]
        );
      }

      res.json({ success: true, url: completedUrl });
    } catch (e) {
      console.error('[esign-pdf] error:', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
