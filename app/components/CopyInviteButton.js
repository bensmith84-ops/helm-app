"use client";
import React, { useState } from "react";

// Public, NDA-gated supplier link for an RFP portal. Recipients land on the
// public summary, request access, and only see full content after approval + NDA.
export const PORTAL_BASE = "https://helm-app-six.vercel.app/rfp/index.html";
export const inviteLinkFor = (rfpCode) => `${PORTAL_BASE}?rfp=${encodeURIComponent(rfpCode)}`;

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through to legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

// Internal documents (rfp_type 'internal') have no supplier flow, so no invite.
export default function CopyInviteButton({ rfpCode, rfpType, style, label = "Copy invite link" }) {
  const [state, setState] = useState("idle"); // idle | copied | failed
  if (!rfpCode || rfpType === "internal") return null;
  const link = inviteLinkFor(rfpCode);
  const onClick = async (e) => {
    e.stopPropagation();
    const ok = await copyText(link);
    setState(ok ? "copied" : "failed");
    if (!ok) window.prompt("Copy this invite link:", link);
    setTimeout(() => setState("idle"), 1800);
  };
  return (
    <button
      onClick={onClick}
      title={`Copies the supplier invite link:\n${link}\nRecipients request access, you approve, they sign the NDA.`}
      style={{ ...style, ...(state === "copied" ? { color: "#34a853", borderColor: "#34a853" } : {}) }}
    >
      {state === "copied" ? "✓ Link copied" : label}
    </button>
  );
}
