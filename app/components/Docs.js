"use client";
import { T, DOCS, getUser } from "../tokens";
import { Badge } from "./ui";

export default function DocsView() {
  return (
    <div style={{ padding: 24, overflow: "auto", maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Documents</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 12, color: T.text3 }}>
          🔍 Search docs...
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {DOCS.map(doc => (
          <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid transparent` }}>
            <span style={{ fontSize: 20 }}>{doc.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{doc.title}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>{getUser(doc.author).name} · {doc.updated}</div>
            </div>
            <Badge small color={doc.status === "published" ? T.green : T.yellow}>{doc.status}</Badge>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24, padding: 16, background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 16 }}>✨</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>AI Writing Assistant</span>
        </div>
        <div style={{ fontSize: 12, color: T.text2, marginBottom: 12 }}>Write, summarize, expand, translate, fix grammar, brainstorm — 16 AI actions powered by Claude.</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["Write", "Summarize", "Expand", "Translate", "Fix Grammar", "Brainstorm", "Outline", "Extract Actions"].map(a => (
            <span key={a} style={{ padding: "4px 10px", background: T.surface3, borderRadius: 4, fontSize: 11, color: T.text2, border: `1px solid ${T.border}` }}>{a}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
