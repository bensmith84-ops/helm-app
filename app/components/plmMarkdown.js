"use client";
// Markdown for AI answers in the PLM (tables, headings, lists, code, links).
import { T } from "../tokens";

// Markdown renderer for AI chat messages - handles tables, headers, bold, italic, code, lists
export function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table detection: line starts with | and next line has |---|
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(lines[i + 1]?.trim() || "")) {
      const tableLines = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith("|")) { tableLines.push(lines[j]); j++; }
      const cells = (r) => { const t = r.trim().replace(/^\|/, "").replace(/\|$/, ""); return t.split("|").map(c => c.trim()); };
      const headers = cells(tableLines[0]);
      const rows = tableLines.slice(2).map(cells);
      elements.push(
        <div key={`t${i}`} style={{ overflowX: "auto", margin: "8px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: T.surface3 }}>
                {headers.map((h, hi) => <th key={hi} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: T.text, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap" }} dangerouslySetInnerHTML={{ __html: inlineMd(h) }} />)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: `1px solid ${T.border}`, background: ri % 2 ? T.surface2 + "60" : "transparent" }}>
                  {row.map((cell, ci) => <td key={ci} style={{ padding: "5px 10px", color: T.text2, fontSize: 12 }} dangerouslySetInnerHTML={{ __html: inlineMd(cell) }} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j; continue;
    }

    // Code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3);
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { codeLines.push(lines[i]); i++; }
      i++; // skip closing ```
      elements.push(<pre key={`c${i}`} style={{ background: T.surface3, padding: "10px 12px", borderRadius: 8, overflow: "auto", fontSize: 11, fontFamily: "monospace", color: T.text, margin: "6px 0", border: `1px solid ${T.border}`, lineHeight: 1.5 }}>{codeLines.join("\n")}</pre>);
      continue;
    }

    // Headers
    if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^(#+)/)[1].length;
      const txt = line.replace(/^#+\s*/, "");
      const sizes = { 1: 16, 2: 14, 3: 13, 4: 12 };
      elements.push(<div key={`h${i}`} style={{ fontSize: sizes[level] || 13, fontWeight: 700, color: T.text, margin: `${level <= 2 ? 12 : 6}px 0 4px` }} dangerouslySetInnerHTML={{ __html: inlineMd(txt) }} />);
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={`hr${i}`} style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "8px 0" }} />);
      i++; continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(line.trim())) {
      const listItems = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) { listItems.push(lines[i].trim().slice(2)); i++; }
      elements.push(<ul key={`ul${i}`} style={{ margin: "4px 0", paddingLeft: 20 }}>{listItems.map((li, idx) => <li key={idx} style={{ fontSize: 13, color: T.text2, lineHeight: 1.6, marginBottom: 2 }} dangerouslySetInnerHTML={{ __html: inlineMd(li) }} />)}</ul>);
      continue;
    }

    // Numbered list
    if (/^\d+[.)]\s/.test(line.trim())) {
      const listItems = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trim())) { listItems.push(lines[i].trim().replace(/^\d+[.)]\s*/, "")); i++; }
      elements.push(<ol key={`ol${i}`} style={{ margin: "4px 0", paddingLeft: 20 }}>{listItems.map((li, idx) => <li key={idx} style={{ fontSize: 13, color: T.text2, lineHeight: 1.6, marginBottom: 2 }} dangerouslySetInnerHTML={{ __html: inlineMd(li) }} />)}</ol>);
      continue;
    }

    // Empty line
    if (!line.trim()) { elements.push(<div key={`br${i}`} style={{ height: 6 }} />); i++; continue; }

    // Normal paragraph
    elements.push(<div key={`p${i}`} style={{ fontSize: 13, color: T.text, lineHeight: 1.7, marginBottom: 2 }} dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />);
    i++;
  }
  return elements;
}

// Inline markdown: bold, italic, code, links, emoji
export function inlineMd(text) {
  return (text || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, `<code style="background:${T.surface3};padding:1px 4px;border-radius:3px;font-size:11px;font-family:monospace">$1</code>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s"]+)\)/g, `<a href="$2" target="_blank" rel="noopener noreferrer" style="color:${T.accent};text-decoration:underline">$1</a>`)
    .replace(/(^|[\s(])(https?:\/\/[^\s<)"]+)/g, `$1<a href="$2" target="_blank" rel="noopener noreferrer" style="color:${T.accent};text-decoration:underline;word-break:break-all">$2</a>`);
}

