"use client";
import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { T } from "../tokens";

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);
  const resolveRef = useRef(null);

  const showPrompt = useCallback((title, placeholder, defaultValue = "") => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setModal({ type: "prompt", title, placeholder, defaultValue, value: defaultValue });
    });
  }, []);

  const showConfirm = useCallback((title, message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setModal({ type: "confirm", title, message });
    });
  }, []);

  const close = (result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setModal(null);
  };

  return (
    <ModalContext.Provider value={{ showPrompt, showConfirm }}>
      {children}
      {modal && <ModalOverlay modal={modal} setModal={setModal} close={close} />}
    </ModalContext.Provider>
  );
}

function ModalOverlay({ modal, setModal, close }) {
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleKey = (e) => {
    if (e.key === "Enter") {
      if (modal.type === "prompt") close(modal.value?.trim() || null);
      else close(true);
    }
    if (e.key === "Escape") close(modal.type === "prompt" ? null : false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
      onKeyDown={handleKey}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => close(modal.type === "prompt" ? null : false)} />
      <div style={{
        position: "relative", width: 400, background: T.surface, borderRadius: 14,
        border: `1px solid ${T.border}`, padding: "24px 28px", zIndex: 301,
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: modal.type === "confirm" ? 8 : 14, color: T.text }}>
          {modal.title}
        </h3>

        {modal.type === "confirm" && modal.message && (
          <p style={{ fontSize: 13, color: T.text2, lineHeight: 1.5, marginBottom: 20 }}>{modal.message}</p>
        )}

        {modal.type === "prompt" && (
          <input ref={inputRef}
            value={modal.value}
            onChange={e => setModal(p => ({ ...p, value: e.target.value }))}
            placeholder={modal.placeholder || ""}
            style={{
              width: "100%", padding: "10px 14px", fontSize: 14, color: T.text,
              background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8,
              outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 20,
            }} />
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => close(modal.type === "prompt" ? null : false)}
            style={{
              padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.surface2, color: T.text3,
              cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
          <button onClick={() => {
              if (modal.type === "prompt") close(modal.value?.trim() || null);
              else close(true);
            }}
            style={{
              padding: "8px 18px", fontSize: 13, fontWeight: 700, borderRadius: 8,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              background: modal.type === "confirm" && modal.title?.toLowerCase().includes("delete") ? "#ef4444" : T.accent,
              color: "#fff",
              opacity: modal.type === "prompt" && !modal.value?.trim() ? 0.5 : 1,
            }}>
            {modal.type === "confirm" ? (modal.title?.toLowerCase().includes("delete") ? "Delete" : "Confirm") : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const useModal = () => useContext(ModalContext);
