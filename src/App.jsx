import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { enqueueCapture, listQueuedCaptures, updateQueuedCapture, removeQueuedCapture, pendingCount } from "./offlineQueue.js";

// ═══ InventoryIQ — FoodSafeIQ family design system (matched to the real app) ═══
// Navy #0d1b2a · Navy-mid #1F3864 · Gold #C9A84C · Cream #F2F0EB
// DM Serif Display headings · DM Sans body
const C = {
  bg: "#F2F0EB",
  card: "#ffffff",
  cardAlt: "#F7F6F2",
  navy: "#0d1b2a",
  navyMid: "#1F3864",
  navyLight: "#1b2f45",
  gold: "#C9A84C",
  goldLight: "#E8C96A",
  goldGradient: "linear-gradient(135deg,#edc65e,#cc9528)",
  goldDim: "#c9a84c1a",
  goldBorder: "#c9a84c55",
  green: "#16a34a",
  greenBg: "#f0fdf4",
  greenBorder: "#bbf7d0",
  amber: "#d97706",
  amberBg: "#fffbeb",
  amberBorder: "#fde68a",
  red: "#c0392b",
  redBg: "#fef2f2",
  redBorder: "#f87171",
  blue: "#6366f1",
  blueBg: "#f0f4ff",
  text: "#0d1b2a",
  textSub: "#555",
  textMuted: "rgba(13,27,42,.45)",
  border: "#E8EBF0",
  borderDark: "#ddd",
};

// Spring-like easing used for every screen/sheet transition, to feel native rather than "web".
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const uid = (p = "id") => p + "-" + Math.random().toString(36).slice(2, 8);


// ─── Area suggestions per industry (all user-editable) ───────────────────────
const AREA_SUGGESTIONS = {
  Foodservice: ["Walk-in Cooler","Freezer","Dry Storage","Bar & Spirits","Prep Kitchen","Dairy Reach-in","Produce Cooler","Chemical Storage"],
  Retail: ["Backroom","Sales Floor","Receiving","Cooler Case","Endcap","Overstock","Aisle 1","Aisle 2"],
};

const DEFAULT_SETTINGS = {
  industry: "Foodservice",
  confidenceThreshold: 0.75,
  staffCanAddItems: true,
  requireApproval: false,
  attributionRule: "physical",
  units: ["cases","bottles","bags","cartons","lbs","boxes","packs","flats","rolls","eaches","units"],
  vendors: ["Sysco","US Foods","Southern Glazer's"],
};

// NOTE: demo locations/items/assignments removed — the app now loads real
// data live from Supabase on startup via loadCatalog() / GET /api/catalog.


// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 20, color = C.textSub, strokeWidth = 1.75 }) => {
  const p = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    location:  <><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></>,
    camera:    <><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></>,
    order:     <><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></>,
    plus:      <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    edit:      <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash:     <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></>,
    check:     <><polyline points="20 6 9 17 4 12"/></>,
    shield:    <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    arrow:     <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    ai:        <><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></>,
    export:    <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    close:     <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    upload:    <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    list:      <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    pkg:       <><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    gear:      <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">{p[name]}</svg>;
};

// The real FoodSafeIQ shield mark: gold-gradient border, navy fill, camera housing, checkmark badge.
const BrandMark = ({ size = 34 }) => (
  <svg width={size} height={size * (210 / 180)} viewBox="0 0 180 210" aria-hidden="true">
    <defs>
      <linearGradient id="iiq-shield-gold" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#f0c35a" />
        <stop offset="1" stopColor="#be7e12" />
      </linearGradient>
    </defs>
    <path d="M90 8C67 25 42 30 20 33v71c0 50 29 78 70 99 41-21 70-49 70-99V33C137 30 113 25 90 8Z" fill="url(#iiq-shield-gold)" />
    <path d="M90 20C70 34 48 39 31 41v63c0 41 23 65 59 84 36-19 59-43 59-84V41c-18-2-39-7-59-21Z" fill="#0b2038" />
    <path d="M61 78h58c8 0 14 6 14 14v47c0 8-6 14-14 14H61c-8 0-14-6-14-14V92c0-8 6-14 14-14Z" fill="#fff" />
    <path d="M75 78l7-17h26l7 17" fill="#fff" />
    <circle cx="91" cy="116" r="34" fill="#0b2038" stroke="url(#iiq-shield-gold)" strokeWidth="7" />
    <path d="m75 116 11 11 22-25" fill="none" stroke="url(#iiq-shield-gold)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="120" cy="92" r="6" fill="#0b2038" />
  </svg>
);

// ─── Shared components ────────────────────────────────────────────────────────
const Badge = ({ children, color = C.gold, bg, border }) => (
  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color, background: bg || color + "18", border: `1px solid ${border || color + "50"}`, padding: "2px 8px", borderRadius: 4 }}>{children}</span>
);

const ConfBar = ({ val, threshold = 0.75 }) => {
  const col = val >= 0.85 ? C.green : val >= threshold ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: C.border, overflow: "hidden" }}>
        <div style={{ width: `${val * 100}%`, height: "100%", background: col, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: col, fontWeight: 700, minWidth: 32 }}>{Math.round(val * 100)}%</span>
    </div>
  );
};

const FInput = ({ label, value, onChange, placeholder, type = "text" }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {label && <label style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</label>}
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ background: C.card, border: `1px solid ${C.borderDark}`, borderRadius: 10, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
  </div>
);

const FSelect = ({ label, value, onChange, options }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {label && <label style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</label>}
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ background: C.card, border: `1px solid ${C.borderDark}`, borderRadius: 10, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none", fontFamily: "'DM Sans', sans-serif", appearance: "none", cursor: "pointer" }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const Toggle = ({ label, sub, value, onChange }) => (
  <div onClick={() => onChange(!value)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, cursor: "pointer", boxShadow: "0 1px 2px rgba(13,27,42,0.04)" }}>
    <div style={{ flex: 1, paddingRight: 12 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.text }}>{label}</p>
      {sub && <p style={{ margin: "3px 0 0", fontSize: 11, color: C.textSub, lineHeight: 1.5 }}>{sub}</p>}
    </div>
    <div style={{ width: 46, height: 26, borderRadius: 13, background: value ? C.navy : C.border, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 2, left: value ? 22 : 2, width: 22, height: 22, borderRadius: "50%", background: value ? C.gold : "#fff", transition: "left 0.2s, background 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  </div>
);

const Modal = ({ title, onClose, children }) => {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);

  const onTouchStart = (e) => { startY.current = e.touches[0].clientY; setDragging(true); };
  const onTouchMove = (e) => {
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setDragY(delta);
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (dragY > 110) onClose();
    else setDragY(0);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d1b2a99", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", animation: `iiqBackdropIn 200ms ${EASE}` }}>
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{
          width: "100%", maxWidth: 430, background: C.bg, borderRadius: "20px 20px 0 0",
          maxHeight: "92vh", overflowY: dragging ? "hidden" : "auto",
          boxShadow: "0 -8px 40px rgba(13,27,42,0.25)",
          transform: `translateY(${dragY}px)`,
          transition: dragging ? "none" : `transform 280ms ${EASE}`,
          animation: dragging ? "none" : `iiqSheetUp 320ms ${EASE}`,
        }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 2px", position: "sticky", top: 0, background: C.bg }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px 16px", borderBottom: `2px solid ${C.gold}`, position: "sticky", top: 14, background: C.bg, zIndex: 1 }}>
          <span style={{ fontSize: 18, fontWeight: 400, color: C.navy, fontFamily: "'DM Serif Display', serif" }}>{title}</span>
          <button onClick={onClose} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, cursor: "pointer" }}><Icon name="close" size={16} color={C.textSub} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
};

const PrimaryBtn = ({ children, onClick, disabled, style = {} }) => (
  <button onClick={onClick} disabled={disabled} style={{ background: disabled ? C.border : C.navy, border: "none", color: disabled ? C.textMuted : "#fff", borderRadius: 9, padding: 16, fontWeight: 700, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", ...style }}>{children}</button>
);

const GoldBtn = ({ children, onClick, disabled, style = {} }) => (
  <button onClick={onClick} disabled={disabled} style={{ background: disabled ? C.border : C.goldGradient, border: "none", color: disabled ? C.textMuted : C.navy, borderRadius: 9, padding: 16, fontWeight: 700, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: disabled ? "none" : "0 8px 20px rgba(201,168,76,0.28)", ...style }}>{children}</button>
);

// ─── Supabase Auth (browser client) ──────────────────────────────────────────
// The SAME browser client used for photo Storage uploads now also handles sign-in/sign-up
// and session storage -- it's initialized with the public anon key (safe to expose), never
// the service role key, which stays server-side. Session persistence is left on (default),
// so a signed-in person stays signed in across reloads.
let _sb = null;
function getSupabaseBrowserClient() {
  if (_sb) return _sb;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Auth isn't configured yet (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  _sb = createClient(url, key);
  return _sb;
}

// Every API call in this file goes through here instead of raw fetch(), so the caller's
// Supabase Auth access token is attached automatically. Every API route except /api/health
// now requires it -- a request without a valid, current session token gets a 401 back.
async function apiFetch(path, options = {}) {
  const sb = getSupabaseBrowserClient();
  const { data: { session } } = await sb.auth.getSession();
  const headers = { ...(options.headers || {}) };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return fetch(path, { ...options, headers });
}

// ─── Backend proxy: Claude Vision photo analysis (area-scoped) ──────────────
// Calls YOUR backend (/api/analyze-photos), never Anthropic directly -- the
// backend holds the item list for this area itself, keyed by areaId. Photos
// are no longer sent in this request body at all (see uploadPhotoToStorage
// below) -- only the storage paths of photos already uploaded. That's what
// removes the 4.5MB body ceiling and makes several-hundred-photo counts
// practical: nothing photo-sized ever needs to fit in one function's body.
// Retries with backoff on 429/5xx, since a several-dozen-stage count firing
// concurrent requests will occasionally get rate-limited or hit a transient
// error, and that shouldn't fail the whole count.
async function analysePhotosViaBackend({ storagePaths, areaId, countId, stageId, stageName }, attempt = 1) {
  const retry = async () => {
    const delay = Math.min(1500 * 2 ** (attempt - 1), 12000) + Math.random() * 300;
    await new Promise(r => setTimeout(r, delay));
    return analysePhotosViaBackend({ storagePaths, areaId, countId, stageId, stageName }, attempt + 1);
  };

  let res;
  try {
    res = await apiFetch("/api/analyze-photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ areaId, countId, stageId, stageName, storagePaths }),
    });
  } catch (networkErr) {
    // fetch() itself threw -- a network-layer failure (e.g. iOS Safari's "Load failed")
    // rather than an HTTP error response. Give it the same backoff-retry treatment as
    // 429/5xx below, since these are just as transient (dropped connection, brief signal
    // loss, tab backgrounded mid-request).
    if (attempt <= 4) return retry();
    throw new Error("Network connection lost during analysis. Check your signal and try again.");
  }

  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt <= 4) {
      return retry();
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Analysis failed (${res.status})`);
  }
  return res.json(); // { areaId, countId, stageId, results: [{itemId,name,aiCount,confidence,matchStatus,dbId}], model, persisted }
}

// Adapts the backend's response into the count-sheet row shape the Review
// screen already expects, filling in sku/size/unit/price/par from the area's
// already-loaded item list (the backend only returns id/count/confidence).
// dbId is carried through so overrides/finalize can target the exact
// count_items row this came from instead of re-matching by itemId.
function adaptAnalysisResults(backendResults, areaItems) {
  const byId = new Map(areaItems.map(i => [i.id, i]));
  return backendResults.results.map(r => {
    const it = byId.get(r.itemId);
    return {
      key: uid("ci"), itemId: r.itemId, dbId: r.dbId || null, sku: it?.sku || r.itemId, name: r.name || it?.name || "Unknown item",
      size: it?.size || "", aiCount: Math.max(0, Math.round(r.aiCount || 0)),
      par: it?.par ?? null, confidence: Math.min(1, Math.max(0, r.confidence || 0)),
      unit: it?.unit || "units", price: it?.price || 0,
      notes: "", matchStatus: r.matchStatus || "unknown",
      override: null, confirmed: false,
    };
  });
}

// Adapts the raw count_items rows that /api/count-session's resume endpoint
// returns (completedStageResults: { id, item_id, ai_count, confidence,
// match_status, stage_id, stage_name }) into the SAME row shape
// adaptAnalysisResults produces, so a resumed stage's results can be merged
// into the final count sheet exactly like a freshly-analyzed stage's results.
// Without this, resumed stages only ever informed the "✓ already analyzed"
// banner -- they never actually flowed into allResults / finalResults, so an
// item that existed only on an earlier (resumed) stage silently became
// not_found once a later stage was analyzed and merged.
function adaptResumedResults(rows, areaItems) {
  const byId = new Map(areaItems.map(i => [i.id, i]));
  return (rows || []).map(r => {
    const it = byId.get(r.item_id);
    return {
      key: uid("ci"), itemId: r.item_id, dbId: r.id || null, sku: it?.sku || r.item_id, name: it?.name || "Unknown item",
      size: it?.size || "", aiCount: Math.max(0, Math.round(r.ai_count || 0)),
      par: it?.par ?? null, confidence: Math.min(1, Math.max(0, r.confidence || 0)),
      unit: it?.unit || "units", price: it?.price || 0,
      notes: "", matchStatus: r.match_status || "unknown",
      override: null, confirmed: false,
      stageId: r.stage_id || null, stageName: r.stage_name || null,
    };
  });
}

// ─── Storage-uploaded photo capture ──────────────────────────────────────────
async function sha256Hex(blob) {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── Backend proxy: count session lifecycle ──────────────────────────────────
// All four of these hit /api/count-session (one file, routed by `action`) rather than
// four separate endpoint files -- Vercel's Hobby plan caps a deployment at 12 Serverless
// Functions, and four new files would have pushed this project over that limit outright.
async function startCountSession(areaId, { force = false } = {}) {
  const res = await apiFetch("/api/count-session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start", areaId, force }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 409 && body.collision) {
      const err = new Error(body.error || "Someone else is already counting this area");
      err.collision = { startedAt: body.startedAt, countId: body.countId };
      throw err;
    }
    throw new Error(body.error || "Could not start this count session");
  }
  return body; // { countId, resumed }
}

async function resumeCount(areaId) {
  const res = await apiFetch(`/api/count-session?areaId=${encodeURIComponent(areaId)}`);
  if (!res.ok) return { resumable: false };
  return res.json(); // { resumable, countId, stageIds, completedStageResults, photos } | { resumable: false, activeElsewhere, startedAt }
}

// "Start Over" needs to genuinely abandon the in-progress count session, not just clear the
// photos client-side -- otherwise the next attempt silently keeps writing into the same old
// countId (and would even get "resumed" back into it on next load). This marks the session
// abandoned server-side rather than deleting it, so it's still there for audit purposes.
async function abandonCount(countId) {
  const res = await apiFetch("/api/count-session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "abandon", countId }),
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || "Could not abandon count session"); }
  return res.json();
}

// Uploads one already-compressed photo directly to Supabase Storage via a
// signed URL (never through this app's own API body), then records it in
// count_photos for the audit trail. Returns the storage path to hand to
// analyze-photos once the whole stage's photos are up.
async function uploadPhotoToStorage({ areaId, stageId, countId, blob, mediaType }) {
  const urlRes = await apiFetch("/api/count-session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "upload-url", areaId, stageId, mediaType }),
  });
  if (!urlRes.ok) { const b = await urlRes.json().catch(() => ({})); throw new Error(b.error || "Could not get upload URL"); }
  const { path, token, bucket } = await urlRes.json();

  const sb = getSupabaseBrowserClient();
  const [{ error: uploadErr }, sha256] = await Promise.all([
    sb.storage.from(bucket).uploadToSignedUrl(path, token, blob, { contentType: mediaType }),
    sha256Hex(blob),
  ]);
  if (uploadErr) throw new Error(uploadErr.message || "Photo upload failed");

  const recordRes = await apiFetch("/api/count-session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "record-photos", countId, photos: [{ storagePath: path, sha256, stageId }] }),
  });
  if (!recordRes.ok) { const b = await recordRes.json().catch(() => ({})); throw new Error(b.error || "Photo uploaded but failed to record"); }

  return path;
}

// Runs `worker` over `items` with at most `limit` in flight at once. Used to
// analyze several stages in parallel (instead of one strictly sequential
// loop) without firing 40+ requests at the Anthropic API simultaneously.
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runNext() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  return results;
}

// ─── Backend proxy: vendor invoice parsing ───────────────────────────────────
async function parseInvoice(file) {
  const base64 = await new Promise((res, rej) => {
    const r = new FileReader(); r.onload = e => res(e.target.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file);
  });
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";

  let body;
  if (isImage || isPdf) body = { mediaType: file.type, data: base64 };
  else body = { csvText: await file.text() };

  const res = await apiFetch("/api/parse-invoice", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Invoice parsing failed (${res.status})`);
  }
  const { items: parsed } = await res.json();
  return parsed.map(it => ({
    id: uid("it"), sku: it.vendorItemCode || uid("VND").toUpperCase(), name: it.description || "Unknown",
    size: it.packSize || "", unit: it.orderUom || "units", vendor: it.vendor || "",
    price: parseFloat(it.unitPrice) || 0, aliases: it.vendorItemCode || "",
  }));
}

// ─── Loads the real catalog from Supabase (via the backend) and adapts it ───
// into the shapes the rest of this app already expects, so no other
// component needs to change.
async function loadCatalog() {
  const res = await apiFetch("/api/catalog");
  if (!res.ok) throw new Error(`Failed to load catalog (${res.status})`);
  const { locations: rawLocations, areas: rawAreas, items: rawItems, assignments: rawAssignments, stages: rawStages, recentCounts: rawRecentCounts } = await res.json();

  const areasByLocation = {};
  for (const a of rawAreas) (areasByLocation[a.location_id] ||= []).push({
    id: a.id, name: a.name,
    countIntervalDays: a.count_interval_days ?? 7,
    lastCountedAt: a.last_counted_at || null,
  });

  const locations = rawLocations.map(l => ({
    id: l.id, name: l.name, type: l.type || "Restaurant",
    areas: (areasByLocation[l.id] || []).sort((a, b) => a.name.localeCompare(b.name)),
  }));

  const items = rawItems.map(i => ({
    id: i.id, sku: i.vendor_item_code || i.id, name: i.name, size: i.pack_size || "",
    unit: i.order_uom || "units", vendor: i.vendor || "", price: i.unit_price || 0,
    aliases: Array.isArray(i.aliases) ? i.aliases.join(",") : "",
    referenceImageUrl: i.reference_image_url || null,
    referenceImages: Array.isArray(i.reference_image_urls) ? i.reference_image_urls : [],
  }));

  const areaToLocation = {};
  for (const a of rawAreas) areaToLocation[a.id] = a.location_id;

  const assignments = rawAssignments.map(a => ({
    id: a.id, itemId: a.item_id, areaId: a.area_id,
    locationId: areaToLocation[a.area_id], par: a.par_level || 0,
  }));

  const stages = (rawStages || []).map(s => ({
    id: s.id, areaId: s.area_id, name: s.name, sortOrder: s.sort_order || 0,
  }));

  const recentCounts = (rawRecentCounts || []).map(c => ({
    countId: c.countId, areaId: c.areaId, areaName: c.areaName, status: c.status, date: c.date,
  }));

  return { locations, items, assignments, stages, recentCounts };
}

// ─── Backend proxy: catalog writes (items/assignments/stages) ───────────────
// All of these hit /api/catalog-write (one file, routed by `action`) -- consolidated from
// 3 separate files for the same Vercel-Hobby-12-function-cap reason as count-session.js.
async function catalogWrite(action, body) {
  const res = await apiFetch("/api/catalog-write", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function saveStagesToBackend(areaId, stagesToSave) {
  return catalogWrite("upsert-stages", { areaId, stages: stagesToSave.map(s => ({ id: s.id, name: s.name, sortOrder: s.sortOrder })) });
  // -> { stages: [{id, area_id, name, sort_order}] }
}

async function removeStageFromBackend(stageId) {
  return catalogWrite("delete-stage", { id: stageId });
}

async function saveLocationToBackend(location) {
  const { locations } = await catalogWrite("upsert-locations", { locations: [{ id: location.id, name: location.name, type: location.type }] });
  return locations[0]; // { id, name, type }
}

async function deleteLocationFromBackend(id) {
  return catalogWrite("delete-location", { id });
}

async function saveAreasToBackend(locationId, areasToSave) {
  const { areas } = await catalogWrite("upsert-areas", { locationId, areas: areasToSave.map(a => ({ id: a.id, name: a.name, countIntervalDays: a.countIntervalDays })) });
  return areas; // [{id, location_id, name, count_interval_days}]
}

async function deleteAreaFromBackend(id) {
  return catalogWrite("delete-area", { id });
}

// ─── Backend proxy: reference photos for hard-to-identify items ─────────────
// An item can hold several labeled angles (front/side/label/other) instead of a single
// photo -- useful for SKUs that are hard to tell apart by front label alone. Returns the
// item's full updated image list so the caller doesn't need a second round-trip.
async function saveReferenceImage(itemId, mediaType, data, label = "other") {
  const res = await apiFetch("/api/upload-reference-image", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, mediaType, data, label }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Uploading reference photo failed (${res.status})`);
  }
  return res.json(); // { url, images: [{url,label,uploadedAt}] }
}

async function deleteReferenceImage(itemId, url) {
  const res = await apiFetch("/api/upload-reference-image", {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Removing reference photo failed (${res.status})`);
  }
  return res.json(); // { images }
}

const REFERENCE_LABELS = [["front", "Front"], ["side", "Side"], ["label", "Label Close-up"], ["other", "Other"]];

const ReferenceGallery = ({ item, uploading, onUpload, onRemove, compact = false }) => {
  const fileRef = useRef(null);
  const [pendingLabel, setPendingLabel] = useState("front");
  const images = item.referenceImages || [];

  return (
    <div>
      {images.length > 0 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 10 }}>
          {images.map(img => (
            <div key={img.url} style={{ position: "relative", flexShrink: 0 }}>
              <img src={img.url} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", border: `1px solid ${C.border}`, display: "block" }} />
              <span style={{ position: "absolute", bottom: 2, left: 2, right: 2, background: "#0d1b2acc", color: "#fff", fontSize: 8, fontWeight: 700, textTransform: "uppercase", borderRadius: 5, textAlign: "center", padding: "1px 0" }}>{REFERENCE_LABELS.find(([k]) => k === img.label)?.[1] || "Other"}</span>
              <button onClick={() => onRemove(img.url)} style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: C.red, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="close" size={8} color="#fff" /></button>
            </div>
          ))}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) onUpload(f, pendingLabel); e.target.value = ""; }} />
      {!compact && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {REFERENCE_LABELS.map(([k, label]) => (
            <button key={k} onClick={() => setPendingLabel(k)} style={{ flex: 1, background: pendingLabel === k ? C.navy : C.cardAlt, border: `1px solid ${pendingLabel === k ? C.navy : C.border}`, color: pendingLabel === k ? "#fff" : C.textSub, borderRadius: 7, padding: "6px 2px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
      )}
      <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ width: "100%", background: C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 8, padding: 9, fontSize: 12, fontWeight: 700, cursor: uploading ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Icon name="camera" size={13} color={C.gold} />{uploading ? "Uploading…" : images.length ? `Add ${compact ? "Photo" : REFERENCE_LABELS.find(([k]) => k === pendingLabel)?.[1]}` : "Add Reference Photo"}
      </button>
      {images.length === 0 && !compact && <p style={{ margin: "6px 0 0", fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>A front shot is usually enough. Add a side or label close-up too for items with similar packaging.</p>}
    </div>
  );
};

async function fetchFlaggedItems() {
  const res = await apiFetch("/api/flagged-items");
  if (!res.ok) throw new Error(`Failed to load flagged items (${res.status})`);
  const { items } = await res.json();
  return items;
}

// ─── Backend proxy: persist item master changes ──────────────────────────────
// Invoice import, manual add/edit, and "+Add to Catalog" all funnel through
// here so the item master actually grows in Supabase, not just in memory.
async function saveItemsToBackend(itemsToSave) {
  return catalogWrite("upsert-items", { items: itemsToSave }); // -> { items: [{id, name}] }
}

// ─── Backend proxy: persist area assignment changes (add/update par, remove) ─
async function saveAssignmentToBackend(itemId, areaId, parLevel) {
  return catalogWrite("upsert-assignments", { assignments: [{ itemId, areaId, parLevel }] });
}

async function removeAssignmentFromBackend(itemId, areaId) {
  return catalogWrite("delete-assignment", { itemId, areaId });
}

// ─── Backend proxy: finalize a count session (this locks in overrides + not_found) ─
// countId must be the session created by start-count / returned in countMeta --
// analyze-photos already persisted every stage's detections as the count happened,
// so this call's job is just to apply overrides and reconcile not_found once, then
// lock the session. sourceRowIds lets the backend tell a single-stage detection
// (one row, gets an UPDATE) apart from a cross-stage merge or not_found item
// (zero or multiple rows, gets a new reconciled row) -- see finalize-count.js.
async function finalizeCountToBackend(countId, areaId, requireApproval, items) {
  const res = await apiFetch("/api/finalize-count", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      countId, areaId, requireApproval,
      finalItems: items.map(i => ({
        itemId: i.itemId || null,
        aiCount: i.aiCount, confidence: i.confidence, matchStatus: i.matchStatus,
        override: i.override, note: i.notes || "",
        overrideReason: i.overrideReason || null, overrideNote: i.overrideNote || i.notes || "",
        countStatus: i.countStatus || (i.matchStatus === "not_found" ? "not_seen" : "counted"),
        sourceRowIds: i.sourceRowIds || [],
      })),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Finalizing count failed (${res.status})`);
  }
  return res.json(); // { countId, status, itemCount }
}

// ─── Backend proxy: approve / reject a submitted count ───────────────────────
// actorName is no longer client-supplied -- the backend derives who did this from the
// caller's verified auth token, which apiFetch already attaches.
async function decideCount(action, countId, note) {
  const res = await apiFetch("/api/finalize-count", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, countId, note }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Could not ${action} this count (${res.status})`);
  }
  return res.json(); // { countId, status }
}

// ─── Backend proxy: operation-wide inventory value history, variance, approvals ─────
async function fetchInventoryMetrics() {
  const res = await apiFetch("/api/inventory-metrics");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Inventory metrics failed (${res.status})`);
  }
  return res.json();
}

const VARIANCE_TAGS = [
  ["theft", "Theft"], ["waste", "Waste"], ["recipe_variance", "Recipe Variance"],
  ["receiving_error", "Receiving Error"], ["counting_error", "Counting Error"], ["other", "Other"],
];

// Why an AI count needed correction -- captured at override time and later aggregated
// into which items need a reference photo and which areas' review thresholds should be
// more conservative. Deliberately short: a manager mid-review won't fill out a form.
const OVERRIDE_REASONS = [
  ["wrong_item", "Wrong Item"], ["wrong_quantity", "Wrong Quantity"],
  ["partial_case", "Partial Case"], ["lighting_angle", "Lighting/Angle"], ["other", "Other"],
];

// Assigns (or clears with tag=null) a root-cause tag on a specific count line -- the only
// write this endpoint does; everything else is read-only.
async function tagVariance(countItemId, tag, note) {
  const res = await apiFetch("/api/inventory-metrics", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "tagVariance", countItemId, tag, note }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Tagging variance failed (${res.status})`);
  }
  return res.json();
}

const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n || 0));

const InventoryTrend = ({ snapshots }) => {
  const pts = [...(snapshots || [])].reverse();
  if (pts.length < 2) return <div style={{ fontSize: 12, color: C.textMuted, padding: "18px 0 4px" }}>Complete at least two inventory cycles to build a dollar trend.</div>;
  const vals = pts.map(p => Number(p.value || 0));
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const width = 320, height = 88, pad = 8;
  const coords = vals.map((v, i) => ({
    x: pad + i * ((width - pad * 2) / Math.max(1, vals.length - 1)),
    y: height - pad - ((v - min) / span) * (height - pad * 2),
  }));
  const points = coords.map(p => `${p.x},${p.y}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="96" preserveAspectRatio="none" aria-label="Inventory dollar trend">
        <polyline points={points} fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill={C.navy} stroke={C.gold} strokeWidth="2" />)}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: -4 }}>
        {pts.map((p, i) => <div key={i} style={{ textAlign: i === 0 ? "left" : i === pts.length - 1 ? "right" : "center", flex: 1 }}>
          <div style={{ fontSize: 10, color: C.textMuted }}>{new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.navy }}>{money(p.value)}</div>
        </div>)}
      </div>
    </div>
  );
};

// ─── Backend proxy: last finalized count for an area (starting reference) ────
async function fetchLastCount(areaId) {
  const res = await apiFetch(`/api/last-count?areaId=${encodeURIComponent(areaId)}`);
  if (!res.ok) return null;
  const { lastCount } = await res.json();
  return lastCount;
}

// ─── Backend proxy: org/team management (identity, members, invites, join codes) ────
async function fetchWhoAmI() {
  const res = await apiFetch("/api/org?action=me");
  if (!res.ok) throw new Error(`Failed to load account info (${res.status})`);
  return res.json(); // { userId, email, orgId, orgName, role }
}

async function fetchOrgMembers() {
  const res = await apiFetch("/api/org?action=members");
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || "Failed to load team"); }
  const { members } = await res.json();
  return members; // [{ userId, email, role, joinedAt }]
}

async function orgAction(action, body) {
  const res = await apiFetch("/api/org", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function inviteMemberByEmail(email, role) { return orgAction("invite-email", { email, role }); }
async function createJoinCode(role, expiresInHours) { return orgAction("create-join-code", { role, expiresInHours }); } // -> { code, role, expiresAt }
async function redeemJoinCode(code) { return orgAction("redeem-join-code", { code }); } // -> { joined, orgId, role }
async function updateMemberRole(userId, role) { return orgAction("update-role", { userId, role }); }
async function removeMember(userId) { return orgAction("remove-member", { userId }); }

// ─── SCREEN: Dashboard ────────────────────────────────────────────────────────
const Dashboard = ({ locations, navigate, onSelectArea, isOnline, queuePending = 0, readyForReview = [], onOpenReady, recentCounts = [] }) => {
  const now = Date.now();

  // "Due Today": an area is due once its last approved count is older than its own
  // counting interval. Never-counted areas are always due. This is what turns ad hoc
  // counting into an actual cycle-count program -- the app tells the counter what needs
  // doing today instead of them having to remember or guess.
  const dueAreas = [];
  for (const loc of locations) {
    for (const area of loc.areas) {
      const intervalDays = area.countIntervalDays || 7;
      const daysSince = area.lastCountedAt ? (now - new Date(area.lastCountedAt).getTime()) / 86400000 : Infinity;
      if (daysSince >= intervalDays) {
        dueAreas.push({ ...area, locationId: loc.id, locationName: loc.name, daysSince, intervalDays });
      }
    }
  }
  dueAreas.sort((a, b) => b.daysSince - a.daysSince);

  const statusLabel = { approved: "Approved", submitted: "Pending Approval", rejected: "Rejected" };
  const statusColor = { approved: C.green, submitted: C.amber, rejected: C.red };

  return (
    <div style={{ paddingBottom: 20 }}>
      <div style={{ padding: "28px 20px 22px", background: C.navy }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BrandMark size={38} />
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 400, color: "#fff", fontFamily: "'DM Serif Display', serif", letterSpacing: "-0.01em" }}>Inventory<span style={{ color: C.gold }}>IQ</span></h1>
            <p style={{ margin: "1px 0 0", fontSize: 11, color: C.goldLight, letterSpacing: "0.06em" }}>Visual counts. Smarter inventory.</p>
          </div>
        </div>

        {isOnline === false && (
          <div style={{ marginTop: 16, padding: "10px 14px", background: "#ffffff12", border: `1px solid #ffffff33`, borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>Offline{queuePending > 0 ? ` — ${queuePending} count${queuePending !== 1 ? "s" : ""} queued, will sync automatically` : ""}</span>
          </div>
        )}
      </div>

      {/* The one thing this screen is for. */}
      <div style={{ padding: "18px 16px 6px" }}>
        <button onClick={() => navigate("capture")} style={{ width: "100%", background: C.navy, border: "none", borderRadius: 16, padding: "22px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 16px rgba(13,27,42,0.18)" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="camera" size={24} color={C.navy} />
          </div>
          <div style={{ textAlign: "left", flex: 1 }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff" }}>Start Count</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#ffffffaa" }}>Photograph a shelf or scan barcodes</p>
          </div>
          <Icon name="arrow" size={18} color={C.gold} />
        </button>
      </div>

      {(queuePending > 0 || readyForReview.length > 0) && (
        <div style={{ padding: "12px 16px 0" }}>
          {queuePending > 0 && (
            <div style={{ background: C.blueBg, border: `1px solid ${C.blue}33`, borderRadius: 14, padding: 14, display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="upload" size={17} color={C.blue} /></div>
              <div>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: C.navy }}>{queuePending} count{queuePending !== 1 ? "s" : ""} waiting to sync</p>
                <p style={{ margin: "1px 0 0", fontSize: 11, color: C.textSub }}>Saved on this device — will analyse automatically once you're back online.</p>
              </div>
            </div>
          )}
          {readyForReview.map(entry => (
            <div key={entry.id} onClick={() => onOpenReady?.(entry)} style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 14, padding: 14, display: "flex", alignItems: "center", gap: 12, marginBottom: 10, cursor: "pointer" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="check" size={17} color={C.green} /></div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: C.navy }}>{entry.meta.area} — ready for review</p>
                <p style={{ margin: "1px 0 0", fontSize: 11, color: C.textSub }}>Synced automatically · {entry.results.length} item{entry.results.length !== 1 ? "s" : ""} counted</p>
              </div>
              <Icon name="arrow" size={16} color={C.green} />
            </div>
          ))}
        </div>
      )}

      {/* Due Today: what needs counting, driven by each area's own interval. */}
      <div style={{ padding: "18px 16px 4px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Due Today</p>
        {dueAreas.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 13, color: C.textSub }}>Nothing due — every area's been counted recently. Nice work.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dueAreas.map(a => (
              <div key={a.id} onClick={() => onSelectArea(a.locationId, a.id)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.daysSince === Infinity ? C.textMuted : a.daysSince > a.intervalDays * 2 ? C.red : C.amber, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.navy }}>{a.name}</p>
                  <p style={{ margin: "1px 0 0", fontSize: 11, color: C.textMuted }}>{a.locationName} · {a.daysSince === Infinity ? "never counted" : `last counted ${Math.floor(a.daysSince)}d ago`}</p>
                </div>
                <Icon name="arrow" size={15} color={C.gold} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Recent Counts */}
      {recentCounts.length > 0 && (
        <div style={{ padding: "14px 16px 4px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>My Recent Counts</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recentCounts.slice(0, 6).map(c => (
              <div key={c.countId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.areaName}</p>
                  <p style={{ margin: "1px 0 0", fontSize: 10.5, color: C.textMuted }}>{new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                </div>
                <Badge color={statusColor[c.status] || C.textMuted}>{statusLabel[c.status] || c.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SCREEN: Sites & Areas (fully user-customized) ───────────────────────────

const SitesScreen = ({ locations, setLocations, settings, role, refreshCatalog }) => {
  const isManager = role === "manager";
  const [modal, setModal] = useState(null); // null | "add" | loc
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ name: "", type: "Restaurant", areas: [] });
  const [areaInput, setAreaInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const suggestions = AREA_SUGGESTIONS[settings.industry] || AREA_SUGGESTIONS.Foodservice;
  const openAdd = () => { setSaveError(""); setForm({ name: "", type: settings.industry === "Retail" ? "Store" : "Restaurant", areas: [] }); setModal("add"); };
  const openEdit = (loc) => { setSaveError(""); setForm({ name: loc.name, type: loc.type, areas: loc.areas.map(a => ({ ...a })) }); setModal(loc); };
  const addArea = (n) => { const nm = n.trim(); if (nm && !form.areas.some(a => a.name === nm)) setForm(f => ({ ...f, areas: [...f.areas, { id: uid("area"), name: nm, countIntervalDays: 7 }] })); setAreaInput(""); };
  const remArea = (id) => setForm(f => ({ ...f, areas: f.areas.filter(a => a.id !== id) }));
  const setAreaInterval = (id, days) => setForm(f => ({ ...f, areas: f.areas.map(a => a.id === id ? { ...a, countIntervalDays: Math.max(1, Number(days) || 1) } : a) }));

  const save = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true); setSaveError("");
    try {
      const locId = modal === "add" ? uid("loc") : modal.id;
      await saveLocationToBackend({ id: locId, name: form.name, type: form.type });

      if (modal !== "add") {
        const removedAreaIds = modal.areas.filter(a => !form.areas.some(fa => fa.id === a.id)).map(a => a.id);
        for (const areaId of removedAreaIds) await deleteAreaFromBackend(areaId);
      }
      if (form.areas.length > 0) await saveAreasToBackend(locId, form.areas);

      await refreshCatalog?.();
      setModal(null);
    } catch (err) {
      setSaveError(err.message || "Failed to save site");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!confirm || deleting) return;
    setDeleting(true);
    try {
      await deleteLocationFromBackend(confirm);
      await refreshCatalog?.();
      setConfirm(null);
    } catch (err) {
      setSaveError(err.message || "Failed to delete site");
      setConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  const types = settings.industry === "Retail"
    ? ["Store","Warehouse","Distribution Center","Kiosk"]
    : ["Restaurant","Catering","Café","Hotel","Bar","Bakery","Institution","Commissary"];
  const typeEmoji = { Restaurant:"🍽", Catering:"🚚", "Café":"☕", Hotel:"🏨", Bar:"🍺", Bakery:"🥐", Institution:"🏥", Commissary:"🏭", Store:"🏪", Warehouse:"📦", "Distribution Center":"🚛", Kiosk:"🛒" };

  return (
    <div style={{ padding: "24px 16px 100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 400, color: C.navy, margin: 0, fontFamily: "'DM Serif Display', serif" }}>Sites & Areas</h1>
          <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 0" }}>Define your own locations and storage areas</p>
        </div>
        <button onClick={openAdd} disabled={!isManager} style={{ background: isManager ? C.navy : C.border, border: "none", color: isManager ? "#fff" : C.textMuted, borderRadius: 12, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: isManager ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="plus" size={16} color={isManager ? C.gold : C.textMuted} />Add Site
        </button>
      </div>

      {saveError && !modal && (
        <div style={{ padding: "10px 14px", background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{saveError}</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {locations.map(loc => (
          <div key={loc.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
            <div style={{ padding: "16px 16px 12px", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: C.goldDim, border: `1px solid ${C.goldBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{typeEmoji[loc.type] || "🏢"}</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 400, color: C.navy, fontFamily: "'DM Serif Display', serif" }}>{loc.name}</p>
                <Badge color={C.blue}>{loc.type}</Badge>
              </div>
            </div>
            <div style={{ padding: "0 16px 12px" }}>
              <p style={{ margin: "0 0 8px", fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Storage Areas ({loc.areas.length})</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {loc.areas.map(a => (
                  <span key={a.id} style={{ fontSize: 11, fontWeight: 600, color: C.navy, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 20, padding: "4px 10px" }}>{a.name} · every {a.countIntervalDays || 7}d</span>
                ))}
                {loc.areas.length === 0 && <span style={{ fontSize: 11, color: C.textMuted }}>No areas defined</span>}
              </div>
            </div>
            {isManager && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => openEdit(loc)} style={{ background: C.cardAlt, border: `1px solid ${C.border}`, color: C.textSub, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}><Icon name="edit" size={13} color={C.textSub} />Edit</button>
                <button onClick={() => setConfirm(loc.id)} style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}><Icon name="trash" size={13} color={C.red} />Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {modal !== null && (
        <Modal title={modal === "add" ? "Add New Site" : "Edit Site"} onClose={() => setModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FInput label="Site Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Main Kitchen, Store #42" />
            <FSelect label="Type" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} options={types} />
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 10 }}>Storage Areas — name them anything</label>
              {form.areas.length === 0 && <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 10px" }}>Tap a suggestion or type your own</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                {form.areas.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.goldDim, border: `1px solid ${C.goldBorder}`, borderRadius: 10, padding: "8px 10px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.navy, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
                    <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>Count every</span>
                    <input type="number" min={1} value={a.countIntervalDays ?? 7} onChange={e => setAreaInterval(a.id, e.target.value)}
                      style={{ width: 44, border: `1px solid ${C.borderDark}`, borderRadius: 6, padding: "4px 6px", fontSize: 12, fontWeight: 700, textAlign: "center", outline: "none", background: "#fff" }} />
                    <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>days</span>
                    <button onClick={() => remArea(a.id)} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, display: "flex" }}><Icon name="close" size={12} color={C.gold} /></button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {suggestions.filter(z => !form.areas.some(a => a.name === z)).map(z => (
                  <button key={z} onClick={() => addArea(z)} style={{ fontSize: 11, fontWeight: 600, color: C.textSub, background: C.card, border: `1px solid ${C.borderDark}`, borderRadius: 20, padding: "5px 10px", cursor: "pointer" }}>+ {z}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={areaInput} onChange={e => setAreaInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addArea(areaInput)} placeholder="Custom area name…"
                  style={{ flex: 1, background: C.card, border: `1px solid ${C.borderDark}`, borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 13, outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
                <button onClick={() => addArea(areaInput)} style={{ background: C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>Add</button>
              </div>
            </div>
            {saveError && <p style={{ margin: 0, fontSize: 12, color: C.red, fontWeight: 600 }}>{saveError}</p>}
            <PrimaryBtn onClick={save} disabled={!form.name.trim() || saving}>{saving ? "Saving…" : modal === "add" ? "Create Site" : "Save Changes"}</PrimaryBtn>
          </div>
        </Modal>
      )}

      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "#0d1b2a99", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: `iiqBackdropIn 200ms ${EASE}` }}>
          <div style={{ background: C.card, borderRadius: 18, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 8px 40px rgba(13,27,42,0.3)", animation: `iiqPopIn 220ms ${EASE}` }}>
            <h3 style={{ fontSize: 18, fontWeight: 400, color: C.navy, textAlign: "center", margin: "0 0 8px", fontFamily: "'DM Serif Display', serif" }}>Delete this site?</h3>
            <p style={{ fontSize: 13, color: C.textSub, textAlign: "center", margin: "0 0 20px", lineHeight: 1.6 }}>Its areas, item assignments, and count history will be permanently removed. The global item catalog is not affected.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirm(null)} disabled={deleting} style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.border}`, color: C.textSub, borderRadius: 12, padding: 14, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} style={{ flex: 1, background: C.red, border: "none", color: "#fff", borderRadius: 12, padding: 14, fontWeight: 800, cursor: "pointer" }}>{deleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SCREEN: Catalog (global master + per-area assignments) ──────────────────
const CatalogScreen = ({ items, setItems, assignments, setAssignments, locations, settings, setSettings, role, navigate }) => {
  const isManager = role === "manager";
  const [tab, setTab] = useState("master"); // master | assignments
  const [modal, setModal] = useState(null);
  const [assignModal, setAssignModal] = useState(null); // item being assigned
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState("");
  const [showInvoice, setShowInvoice] = useState(false);
  const [selLoc, setSelLoc] = useState(locations[0]?.id || "");
  const [selArea, setSelArea] = useState("");

  const blank = { sku: "", name: "", size: "", unit: settings.units[0], vendor: settings.vendors[0] || "", price: "", aliases: "" };
  const [form, setForm] = useState(blank);
  const [assignForm, setAssignForm] = useState({ locationId: "", areaId: "", par: "" });

  const q = search.toLowerCase();
  const visible = items.filter(i => !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || (i.aliases||"").toLowerCase().includes(q));

  const itemAssignments = (itemId) => assignments.filter(a => a.itemId === itemId).map(a => {
    const loc = locations.find(l => l.id === a.locationId);
    const area = loc?.areas.find(ar => ar.id === a.areaId);
    return { ...a, locName: loc?.name || "?", areaName: area?.name || "?" };
  });

  const [saveError, setSaveError] = useState("");

  // Items that keep coming back low-confidence and don't have a reference photo yet.
  const [flagged, setFlagged] = useState([]);
  const [flaggedLoading, setFlaggedLoading] = useState(false);
  const [flaggedError, setFlaggedError] = useState("");
  const [uploadingFor, setUploadingFor] = useState(null);

  const loadFlagged = () => {
    setFlaggedLoading(true); setFlaggedError("");
    fetchFlaggedItems()
      .then(setFlagged)
      .catch(e => setFlaggedError(e.message || "Could not load flagged items"))
      .finally(() => setFlaggedLoading(false));
  };

  useEffect(() => { if (tab === "flagged") loadFlagged(); }, [tab]);

  const attachReferencePhoto = (itemId, file, label = "other") => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const [header, data] = e.target.result.split(",");
      const mediaType = header.match(/data:(.*);base64/)?.[1] || "image/jpeg";
      setUploadingFor(itemId);
      try {
        const { url, images } = await saveReferenceImage(itemId, mediaType, data, label);
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, referenceImageUrl: url, referenceImages: images || i.referenceImages } : i));
        setFlagged(prev => prev.filter(f => f.itemId !== itemId));
      } catch (err) {
        setFlaggedError(err.message || "Upload failed");
      } finally {
        setUploadingFor(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeReferencePhoto = async (itemId, url) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, referenceImages: (i.referenceImages || []).filter(img => img.url !== url) } : i));
    try {
      const { images } = await deleteReferenceImage(itemId, url);
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, referenceImages: images, referenceImageUrl: images.length ? images[images.length - 1].url : null } : i));
    } catch (err) {
      setSaveError(err.message || "Failed to remove reference photo");
    }
  };

  const saveItem = async () => {
    if (!form.name.trim() || !form.sku.trim()) return;
    const entry = { ...form, price: parseFloat(form.price) || 0, id: form.id || uid("it") };
    // Optimistic local update
    if (modal === "add") setItems(prev => [...prev, entry]);
    else setItems(prev => prev.map(i => i.id === modal.id ? entry : i));
    setModal(null);
    try {
      await saveItemsToBackend([{
        id: entry.id, name: entry.name, vendor: entry.vendor, vendorItemCode: entry.sku,
        orderUom: entry.unit, packSize: entry.size, unitPrice: entry.price,
        aliases: entry.aliases ? entry.aliases.split(",").map(a => a.trim()).filter(Boolean) : [],
      }]);
    } catch (e) {
      setSaveError(`Item saved locally but failed to sync: ${e.message}`);
    }
  };

  const addAssignment = async () => {
    if (!assignForm.locationId || !assignForm.areaId) return;
    const par = parseFloat(assignForm.par) || 0;
    setAssignments(prev => [...prev, { id: uid("as"), itemId: assignModal.id, locationId: assignForm.locationId, areaId: assignForm.areaId, par }]);
    setAssignForm({ locationId: "", areaId: "", par: "" });
    try {
      await saveAssignmentToBackend(assignModal.id, assignForm.areaId, par);
    } catch (e) {
      setSaveError(`Assignment saved locally but failed to sync: ${e.message}`);
    }
  };

  const removeAssignment = async (assignmentRowId, itemId, areaId) => {
    setAssignments(prev => prev.filter(x => x.id !== assignmentRowId));
    try {
      await removeAssignmentFromBackend(itemId, areaId);
    } catch (e) {
      setSaveError(`Removed locally but failed to sync: ${e.message}`);
    }
  };

  const importInvoiceItems = async (newItems) => {
    setItems(prev => {
      const map = new Map(prev.map(i => [i.sku, i]));
      newItems.forEach(item => {
        if (map.has(item.sku)) map.set(item.sku, { ...map.get(item.sku), price: item.price, size: item.size, aliases: item.aliases, vendor: item.vendor });
        else map.set(item.sku, item);
      });
      return Array.from(map.values());
    });
    // Learn new vendors into settings
    const newVendors = newItems.map(i => i.vendor).filter(v => v && !settings.vendors.includes(v));
    if (newVendors.length) setSettings(s => ({ ...s, vendors: [...s.vendors, ...Array.from(new Set(newVendors))] }));
    try {
      await saveItemsToBackend(newItems.map(item => ({
        id: item.id, name: item.name, vendor: item.vendor, vendorItemCode: item.sku,
        orderUom: item.unit, packSize: item.size, unitPrice: item.price,
        aliases: item.aliases ? item.aliases.split(",").map(a => a.trim()).filter(Boolean) : [],
      })));
    } catch (e) {
      setSaveError(`Items imported locally but failed to sync: ${e.message}`);
    }
  };

  // Assignments-by-area view
  const areaGroups = [];
  locations.forEach(loc => loc.areas.forEach(area => {
    const rows = assignments.filter(a => a.locationId === loc.id && a.areaId === area.id)
      .map(a => ({ a, item: items.find(i => i.id === a.itemId) })).filter(r => r.item);
    if (rows.length || (selLoc === loc.id)) areaGroups.push({ loc, area, rows });
  }));

  return (
    <div style={{ padding: "24px 16px 100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 400, color: C.navy, margin: 0, fontFamily: "'DM Serif Display', serif" }}>Item Catalog</h1>
          <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 16px" }}>One global list · assigned to areas with their own pars</p>
        </div>
        <button onClick={() => navigate?.("orders")} style={{ flexShrink: 0, background: C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 10, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
          <Icon name="order" size={13} color={C.gold} />Orders & Value
        </button>
      </div>

      {saveError && (
        <div style={{ padding: "10px 14px", background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 10, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>{saveError}</span>
          <button onClick={() => setSaveError("")} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}><Icon name="close" size={14} color={C.amber} /></button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, marginBottom: 16 }}>
        {[["master","Global Master"],["assignments","Area Assignments"],["flagged","Needs Photo"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, background: tab === k ? C.navy : "transparent", border: "none", color: tab === k ? "#fff" : C.textSub, borderRadius: 9, padding: "10px", fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "all 0.15s" }}>{label}</button>
        ))}
      </div>

      {tab === "master" && (
        <>
          {isManager ? (
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button onClick={() => setShowInvoice(true)} style={{ flex: 2, background: C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 10, padding: "12px", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <Icon name="upload" size={16} color={C.gold} />Import Vendor Invoice
              </button>
              <button onClick={() => { setForm(blank); setModal("add"); }} style={{ flex: 1, background: C.navy, border: "none", color: "#fff", borderRadius: 10, padding: "12px", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Icon name="plus" size={15} color={C.gold} />Add
              </button>
            </div>
          ) : (
            <div style={{ padding: "10px 14px", background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 12, color: C.textSub }}>View-only — ask a manager to add or edit catalog items.</p>
            </div>
          )}

          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, SKU, alias…"
            style={{ width: "100%", background: C.card, border: `1px solid ${C.borderDark}`, borderRadius: 10, padding: "11px 14px", color: C.text, fontSize: 13, outline: "none", fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visible.map(item => {
              const asg = itemAssignments(item.id);
              return (
                <div key={item.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
                  <div style={{ padding: "12px 14px", display: "flex", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: C.goldDim, border: `1px solid ${C.goldBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="pkg" size={18} color={C.gold} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.navy }}>{item.name}</p>
                        {item.price > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: C.green, flexShrink: 0 }}>${item.price}</span>}
                      </div>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: C.textMuted }}>{item.sku}{item.size ? ` · ${item.size}` : ""} · {item.vendor || "No vendor"}</p>
                      <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                        {asg.length === 0
                          ? <Badge color={C.amber}>Unassigned</Badge>
                          : asg.map(a => <Badge key={a.id} color={C.blue}>{a.areaName} · par {a.par}</Badge>)}
                      </div>
                    </div>
                  </div>
                  {isManager && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 14px", display: "flex", gap: 8 }}>
                      <button onClick={() => { setAssignModal(item); setAssignForm({ locationId: locations[0]?.id || "", areaId: "", par: "" }); }} style={{ flex: 1, background: C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 8, padding: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Assign to Areas ({asg.length})</button>
                      <button onClick={() => { setForm({ ...item }); setModal(item); }} style={{ background: C.cardAlt, border: `1px solid ${C.border}`, color: C.textSub, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Icon name="edit" size={13} color={C.textSub} /></button>
                      <button onClick={() => setConfirm(item.id)} style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Icon name="trash" size={13} color={C.red} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "assignments" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {locations.map(loc => (
            <div key={loc.id}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 400, color: C.navy, fontFamily: "'DM Serif Display', serif" }}>📍 {loc.name}</p>
              {loc.areas.map(area => {
                const rows = assignments.filter(a => a.locationId === loc.id && a.areaId === area.id)
                  .map(a => ({ a, item: items.find(i => i.id === a.itemId) })).filter(r => r.item);
                return (
                  <div key={area.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: rows.length ? 8 : 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{area.name}</span>
                      <span style={{ fontSize: 11, color: C.textMuted }}>{rows.length} item{rows.length !== 1 ? "s" : ""}</span>
                    </div>
                    {rows.map(({ a, item }) => (
                      <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: `1px solid ${C.border}` }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.text }}>{item.name}</p>
                          <p style={{ margin: 0, fontSize: 10, color: C.textMuted }}>{item.sku} · par {a.par} {item.unit}</p>
                        </div>
                        <button onClick={() => removeAssignment(a.id, a.itemId, a.areaId)} style={{ background: "none", border: "none", cursor: isManager ? "pointer" : "not-allowed", padding: 4, opacity: isManager ? 1 : 0.3 }} disabled={!isManager}><Icon name="close" size={14} color={C.textMuted} /></button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {tab === "flagged" && (
        <div>
          <div style={{ padding: "12px 14px", background: C.blueBg, border: `1px solid ${C.blue}44`, borderRadius: 12, marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: C.blue, fontWeight: 600, lineHeight: 1.5 }}>
              These items have come back low-confidence in real counts at least twice. Attaching one clear reference photo per item gives Claude Vision something to visually compare against next time — most items never need this.
            </p>
          </div>

          {flaggedError && (
            <div style={{ padding: "10px 14px", background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>{flaggedError}</span>
            </div>
          )}

          {flaggedLoading ? (
            <div style={{ textAlign: "center", padding: 40 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${C.goldDim}`, borderTopColor: C.gold, animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
            </div>
          ) : flagged.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 400, color: C.navy, margin: "0 0 8px", fontFamily: "'DM Serif Display', serif" }}>Nothing flagged</p>
              <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>Items will show up here automatically if they keep coming back low-confidence in real counts.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {flagged.map(f => {
                const fullItem = items.find(i => i.id === f.itemId) || { id: f.itemId, referenceImages: [] };
                return (
                  <div key={f.itemId} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.navy }}>{f.name}</p>
                    <p style={{ margin: "2px 0 6px", fontSize: 11, color: C.textMuted }}>{f.brand || "No brand"} · flagged {f.occurrences}× in recent counts</p>
                    {isManager && (
                      <ReferenceGallery item={fullItem} uploading={uploadingFor === f.itemId} compact
                        onUpload={(file, label) => attachReferencePhoto(f.itemId, file, label)}
                        onRemove={(url) => removeReferencePhoto(f.itemId, url)} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Item add/edit modal */}
      {modal !== null && (
        <Modal title={modal === "add" ? "Add Item to Master" : "Edit Item"} onClose={() => setModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <FInput label="SKU *" value={form.sku} onChange={v => setForm(f => ({ ...f, sku: v }))} placeholder="PRO-001" />
              <FInput label="Size / Pack" value={form.size} onChange={v => setForm(f => ({ ...f, size: v }))} placeholder="40lb Case" />
            </div>
            <FInput label="Product Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Chicken Breast" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <FSelect label="Unit" value={form.unit} onChange={v => setForm(f => ({ ...f, unit: v }))} options={settings.units} />
              <FInput label="Price ($)" value={form.price} onChange={v => setForm(f => ({ ...f, price: v }))} type="number" placeholder="89.00" />
            </div>
            <FSelect label="Vendor" value={form.vendor} onChange={v => setForm(f => ({ ...f, vendor: v }))} options={["", ...settings.vendors]} />
            <FInput label="Aliases (comma-separated)" value={form.aliases} onChange={v => setForm(f => ({ ...f, aliases: v }))} placeholder="vendor codes, UPC, label text" />
            <p style={{ margin: "-6px 0 0", fontSize: 10.5, color: C.textMuted, lineHeight: 1.5 }}>For Sysco items, use the barcode from the case's yellow pic sticker (not the printed case label) — it scans more reliably than other case markings.</p>
            <PrimaryBtn onClick={saveItem} disabled={!form.name.trim() || !form.sku.trim()}>{modal === "add" ? "Add to Master" : "Save Changes"}</PrimaryBtn>
          </div>
        </Modal>
      )}

      {/* Assignment modal */}
      {assignModal && (
        <Modal title={`Assign: ${assignModal.name}`} onClose={() => setAssignModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Current assignments */}
            {itemAssignments(assignModal.id).length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>Current Areas</p>
                {itemAssignments(assignModal.id).map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.navy }}>{a.locName} → {a.areaName}</p>
                      <p style={{ margin: 0, fontSize: 11, color: C.textMuted }}>Par: {a.par} {assignModal.unit}</p>
                    </div>
                    <button onClick={() => removeAssignment(a.id, a.itemId, a.areaId)} style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer" }}><Icon name="trash" size={13} color={C.red} /></button>
                  </div>
                ))}
              </div>
            )}
            <p style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Add to Area</p>
            <select value={assignForm.locationId} onChange={e => setAssignForm(f => ({ ...f, locationId: e.target.value, areaId: "" }))}
              style={{ width: "100%", background: C.card, border: `1px solid ${C.borderDark}`, borderRadius: 10, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none", fontFamily: "'DM Sans', sans-serif", appearance: "none", cursor: "pointer" }}>
              <option value="">Select location…</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {assignForm.locationId && (
              <select value={assignForm.areaId} onChange={e => setAssignForm(f => ({ ...f, areaId: e.target.value }))}
                style={{ width: "100%", background: C.card, border: `1px solid ${C.borderDark}`, borderRadius: 10, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none", fontFamily: "'DM Sans', sans-serif", appearance: "none", cursor: "pointer" }}>
                <option value="">Select area…</option>
                {(locations.find(l => l.id === assignForm.locationId)?.areas || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <FInput label={`Par level for this area (${assignModal.unit})`} value={assignForm.par} onChange={v => setAssignForm(f => ({ ...f, par: v }))} type="number" placeholder="e.g. 8" />
            <GoldBtn onClick={addAssignment} disabled={!assignForm.locationId || !assignForm.areaId}>Add Assignment</GoldBtn>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "#0d1b2a99", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: `iiqBackdropIn 200ms ${EASE}` }}>
          <div style={{ background: C.card, borderRadius: 18, padding: 24, maxWidth: 340, width: "100%", animation: `iiqPopIn 220ms ${EASE}` }}>
            <h3 style={{ fontSize: 18, fontWeight: 400, color: C.navy, textAlign: "center", margin: "0 0 8px", fontFamily: "'DM Serif Display', serif" }}>Remove item?</h3>
            <p style={{ fontSize: 13, color: C.textSub, textAlign: "center", margin: "0 0 20px", lineHeight: 1.6 }}>Removes it from the global master and all area assignments.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.border}`, color: C.textSub, borderRadius: 12, padding: 14, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => { setItems(prev => prev.filter(i => i.id !== confirm)); setAssignments(prev => prev.filter(a => a.itemId !== confirm)); setConfirm(null); }} style={{ flex: 1, background: C.red, border: "none", color: "#fff", borderRadius: 12, padding: 14, fontWeight: 800, cursor: "pointer" }}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {showInvoice && <InvoiceModal onClose={() => setShowInvoice(false)} onImport={importInvoiceItems} existingSkus={new Set(items.map(i => i.sku))} />}
    </div>
  );
};

// ─── Invoice import modal ─────────────────────────────────────────────────────
const InvoiceModal = ({ onClose, onImport, existingSkus }) => {
  const [phase, setPhase] = useState("idle");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const fileRef = useRef(null);
  const timerRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name); setPhase("reading"); setError(""); setProgress(0);
    let p = 0;
    timerRef.current = setInterval(() => { p = Math.min(p + (p < 40 ? 4 : 1), 90); setProgress(Math.round(p)); }, 250);
    try {
      const its = await parseInvoice(file);
      clearInterval(timerRef.current); setProgress(100);
      setParsed(its); setSelected(its.map(() => true));
      setTimeout(() => setPhase("review"), 300);
    } catch (e) {
      clearInterval(timerRef.current);
      setError(e.message || "Could not read invoice."); setPhase("error");
    }
  };

  return (
    <Modal title="Import Vendor Invoice" onClose={onClose}>
      <input ref={fileRef} type="file" accept=".pdf,.csv,image/*,application/pdf,text/csv" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
      {phase === "idle" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${C.goldBorder}`, background: C.goldDim, borderRadius: 16, padding: "36px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "center" }}>
            <div style={{ width: 60, height: 60, borderRadius: 16, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="upload" size={28} color={C.gold} /></div>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 400, color: C.navy, fontFamily: "'DM Serif Display', serif" }}>Upload Invoice</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: C.textSub }}>PDF · Photo · CSV — Sysco, US Foods, any vendor</p>
            </div>
          </div>
          <div style={{ padding: "12px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: C.navy }}>Claude reads every line item and extracts:</p>
            <p style={{ margin: 0, fontSize: 11, color: C.textSub, lineHeight: 1.7 }}>Product name · pack size · vendor item codes (become AI matching aliases) · current prices. You review before anything imports.</p>
          </div>
        </div>
      )}
      {phase === "reading" && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", border: `3px solid ${C.goldDim}`, borderTopColor: C.gold, animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
          <p style={{ color: C.navy, fontWeight: 400, fontSize: 16, margin: "0 0 6px", fontFamily: "'DM Serif Display', serif" }}>Reading Invoice…</p>
          <p style={{ color: C.textSub, fontSize: 12, margin: "0 0 20px" }}>{fileName}</p>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg,#d79e2d,#efc358)", borderRadius: 3, transition: "width 0.3s" }} />
          </div>
        </div>
      )}
      {phase === "review" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: "12px 14px", background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.green }}>✓ {parsed.length} items · {selected.filter(Boolean).length} selected</p>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setSelected(parsed.map(() => true))} style={{ background: "none", border: `1px solid ${C.greenBorder}`, color: C.green, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>All</button>
              <button onClick={() => setSelected(parsed.map(() => false))} style={{ background: "none", border: `1px solid ${C.border}`, color: C.textSub, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>None</button>
            </div>
          </div>
          {parsed.map((item, idx) => (
            <div key={idx} onClick={() => setSelected(s => s.map((v, i) => i === idx ? !v : v))} style={{ background: C.card, border: `1px solid ${selected[idx] ? C.goldBorder : C.border}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer", display: "flex", gap: 10 }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: selected[idx] ? C.navy : C.cardAlt, border: `1px solid ${selected[idx] ? C.navy : C.borderDark}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                {selected[idx] && <Icon name="check" size={11} color={C.gold} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.navy }}>{item.name}</p>
                  {item.price > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: C.green, flexShrink: 0 }}>${item.price.toFixed(2)}</span>}
                </div>
                <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                  {item.size && <Badge color={C.textSub}>{item.size}</Badge>}
                  <Badge color={C.blue}>{item.sku}</Badge>
                  {existingSkus.has(item.sku) && <Badge color={C.amber}>↻ Update</Badge>}
                </div>
              </div>
            </div>
          ))}
          <PrimaryBtn onClick={() => { onImport(parsed.filter((_, i) => selected[i])); setPhase("done"); }}>Import {selected.filter(Boolean).length} Items</PrimaryBtn>
        </div>
      )}
      {phase === "done" && (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.greenBg, border: `2px solid ${C.green}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Icon name="check" size={30} color={C.green} /></div>
          <p style={{ color: C.navy, fontWeight: 400, fontSize: 18, margin: "0 0 8px", fontFamily: "'DM Serif Display', serif" }}>Import Complete</p>
          <p style={{ color: C.textSub, fontSize: 13, margin: "0 0 4px" }}>Items added to your global master.</p>
          <p style={{ color: C.textSub, fontSize: 12 }}>Next: assign them to storage areas with par levels.</p>
          <GoldBtn onClick={onClose} style={{ marginTop: 20, padding: "14px 32px" }}>Done</GoldBtn>
        </div>
      )}
      {phase === "error" && (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <p style={{ color: C.red, fontWeight: 700, fontSize: 16, margin: "0 0 8px" }}>Could not read invoice</p>
          <p style={{ color: C.textSub, fontSize: 12, margin: "0 0 20px" }}>{error}</p>
          <PrimaryBtn onClick={() => setPhase("idle")} style={{ padding: "14px 24px" }}>Try Again</PrimaryBtn>
        </div>
      )}
    </Modal>
  );
};

// ─── SCREEN: Capture ──────────────────────────────────────────────────────────
// Produces two things from a captured photo: an upload-quality Blob (what
// actually gets sent to Storage/Claude) and a small on-screen thumbnail
// (what stays in React state). Photos now go straight to Supabase Storage via
// a signed URL rather than through this app's own API body, so there's no
// 4.5MB ceiling driving the resolution choice anymore -- upload quality is
// set by what Claude Vision can actually use (Sonnet 5's high-resolution
// tier goes up to ~2576px on the long edge), not by a request-body limit.
// The thumbnail, not the full photo, is what a several-hundred-photo count
// keeps in memory across its whole capture session -- that's the difference
// that keeps a long real-world count from running the tab out of memory.
function processPhotoForCapture(file, { uploadMaxDim = 2200, uploadQuality = 0.85, thumbMaxDim = 180, thumbQuality = 0.55 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        const render = (maxDim, quality, asBlob) => new Promise((res) => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          if (asBlob) canvas.toBlob((blob) => res(blob), "image/jpeg", quality);
          else res(canvas.toDataURL("image/jpeg", quality));
        });
        Promise.all([
          render(uploadMaxDim, uploadQuality, true),
          render(thumbMaxDim, thumbQuality, false),
        ]).then(([blob, thumbDataUrl]) => resolve({ blob, mediaType: "image/jpeg", thumbDataUrl }));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Barcode / QR scanning fallback ────────────────────────────────────────
// Many cases in a walk-in still have a readable UPC/EAN, and reading one is faster and
// more reliable than asking Claude Vision to recognize a SKU visually. This runs entirely
// on-device (ZXing, no network call) and matches against the item's SKU or its
// comma-separated aliases -- the item form already documents that field as accepting
// "vendor codes, UPC, label text", so no schema change is needed to make barcodes work.
function findItemByCode(code, candidateItems) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const target = norm(code);
  if (!target) return null;
  for (const it of candidateItems) {
    if (norm(it.sku) === target) return it;
    const aliases = String(it.aliases || "").split(",").map(norm).filter(Boolean);
    if (aliases.includes(target)) return it;
  }
  return null;
}

// A barcode scan is ground truth (a human held a specific case up to the camera and got an
// exact code match) -- it never needs review, unlike a vision-inferred count. Converts the
// running scan tally into the same count-sheet row shape adaptAnalysisResults produces.
function scannedItemToResultRow(scanned) {
  return {
    key: uid("ci"), itemId: scanned.itemId, dbId: null, sku: scanned.sku || scanned.itemId, name: scanned.name,
    size: scanned.size || "", aiCount: scanned.qty,
    par: scanned.par ?? null, confidence: 1,
    unit: scanned.unit || "units", price: scanned.price || 0,
    notes: "Counted via barcode scan", matchStatus: "matched",
    override: null, confirmed: true,
    stageId: null, stageName: null, sourceRowIds: [],
  };
}

function mergeScannedIntoResults(aiResults, scannedItems) {
  if (!scannedItems.length) return aiResults;
  const scannedByItemId = new Map(scannedItems.map(s => [s.itemId, s]));
  const kept = aiResults.filter(r => !scannedByItemId.has(r.itemId));
  return [...kept, ...scannedItems.map(scannedItemToResultRow)];
}

const BarcodeScannerModal = ({ areaItems, allItems, onClose, onScan }) => {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null);
  const lastRef = useRef({ code: null, at: 0 });
  const [status, setStatus] = useState("starting"); // starting | scanning | error
  const [errorMsg, setErrorMsg] = useState("");
  const [lastResult, setLastResult] = useState(null); // { code, item, foundElsewhere }
  const [manualCode, setManualCode] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const handleCode = (code) => {
    const now = Date.now();
    // Debounce: a video stream re-decodes the same barcode many times a second while it's
    // in frame -- only accept a given code once per 1.5s so one physical case doesn't
    // register as ten scans.
    if (lastRef.current.code === code && now - lastRef.current.at < 1500) return;
    lastRef.current = { code, at: now };

    const inArea = findItemByCode(code, areaItems);
    const elsewhere = !inArea ? findItemByCode(code, allItems) : null;
    if (navigator.vibrate) navigator.vibrate(inArea ? 60 : [40, 60, 40]);
    setLastResult({ code, item: inArea, foundElsewhere: !!elsewhere && !inArea });
    if (inArea) onScan(inArea);
  };

  useEffect(() => {
    let cancelled = false;
    // Code-split: ~500KB barcode-decoding library only loads when a counter actually opens
    // the scanner, not on every page view of a mobile app that's already fighting for signal.
    import("@zxing/browser").then(({ BrowserMultiFormatReader }) => {
      if (cancelled) return;
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      return reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result && !cancelled) handleCode(result.getText());
      });
    }).then(controls => {
      if (!controls) return;
      if (cancelled) { controls.stop(); return; }
      controlsRef.current = controls;
      setStatus("scanning");
      try {
        const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
        const caps = track?.getCapabilities?.();
        if (caps && "torch" in caps) setTorchSupported(true);
      } catch { /* torch feature-detection is best-effort */ }
    }).catch(e => {
      if (!cancelled) { setStatus("error"); setErrorMsg(e.message || "Could not access the camera."); }
    });
    return () => { cancelled = true; controlsRef.current?.stop(); };
  }, []);

  const toggleTorch = async () => {
    try {
      const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(v => !v);
    } catch { /* torch not actually controllable on this device */ }
  };

  const submitManual = () => { if (manualCode.trim()) { handleCode(manualCode.trim()); setManualCode(""); } };

  return (
    <div style={{ position: "fixed", inset: 0, background: C.navy, zIndex: 500, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", flex: 1, minHeight: 0, background: "#000", overflow: "hidden" }}>
        <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline />
        {status === "scanning" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "72%", maxWidth: 320, aspectRatio: "2/1", border: `2px solid ${C.gold}`, borderRadius: 14, boxShadow: "0 0 0 2000px rgba(0,0,0,0.35)" }} />
          </div>
        )}
        {status === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", gap: 10 }}>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Camera unavailable</p>
            <p style={{ color: "#ffffffaa", fontSize: 12 }}>{errorMsg} You can still enter a code manually below.</p>
          </div>
        )}
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "#00000088", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="close" size={18} color="#fff" /></button>
        {torchSupported && (
          <button onClick={toggleTorch} style={{ position: "absolute", top: 16, left: 16, width: 36, height: 36, borderRadius: "50%", background: torchOn ? C.gold : "#00000088", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="ai" size={16} color={torchOn ? C.navy : "#fff"} /></button>
        )}
        {lastResult && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 14, background: lastResult.item ? "rgba(22,163,74,0.92)" : "rgba(192,57,43,0.92)" }}>
            <p style={{ margin: 0, color: "#fff", fontWeight: 800, fontSize: 13 }}>{lastResult.item ? `✓ ${lastResult.item.name}` : "Not in this area's catalog"}</p>
            <p style={{ margin: "2px 0 0", color: "#ffffffdd", fontSize: 11 }}>
              {lastResult.item ? `Code ${lastResult.code} · added to count` : lastResult.foundElsewhere ? `Code ${lastResult.code} matches a catalog item not assigned here.` : `Code ${lastResult.code} doesn't match any catalog item.`}
            </p>
          </div>
        )}
      </div>
      <div style={{ padding: "14px 16px 24px", background: C.navy }}>
        <p style={{ margin: "0 0 8px", fontSize: 11, color: "#ffffff88", textAlign: "center" }}>Keep scanning — each match adds one unit to the count</p>
        <p style={{ margin: "0 0 8px", fontSize: 10.5, color: "#ffffff66", textAlign: "center" }}>Sysco cases: use the yellow pic sticker barcode, not the printed case label</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={manualCode} onChange={e => setManualCode(e.target.value)} onKeyDown={e => e.key === "Enter" && submitManual()} placeholder="Or type a barcode / SKU…" style={{ flex: 1, background: "#ffffff14", border: "1px solid #ffffff33", borderRadius: 10, padding: "11px 14px", color: "#fff", fontSize: 13, outline: "none" }} />
          <button onClick={submitManual} style={{ background: C.gold, border: "none", color: C.navy, borderRadius: 10, padding: "0 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Add</button>
        </div>
        <button onClick={onClose} style={{ width: "100%", marginTop: 10, background: "#ffffff14", border: "1px solid #ffffff33", color: "#fff", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Done Scanning</button>
      </div>
    </div>
  );
};

// Merges cross-stage detections and reconciles against the full area catalog once every
// stage's results are in. Pure function -- no component state -- so both the live capture
// flow (doProcess) and the offline-sync flusher (flushOfflineQueue) can share it instead of
// duplicating this logic.
//   - an item seen in only one stage counts normally
//   - an item seen in multiple stages is flagged cross_stage_conflict for manual review
//     (may be the same stock double-counted, or genuinely stored in two places)
//   - an item assigned to the area but absent from EVERY stage's results is not_found
function mergeAndReconcileStageResults(allResults, areaItems) {
  const byItemId = new Map();
  const finalResults = [];
  for (const r of allResults) {
    if (!r.itemId) { finalResults.push({ ...r, sourceRowIds: r.dbId ? [r.dbId] : [] }); continue; } // unrecognized items never dedupe
    if (!byItemId.has(r.itemId)) byItemId.set(r.itemId, []);
    byItemId.get(r.itemId).push(r);
  }
  for (const rows of byItemId.values()) {
    if (rows.length === 1) { finalResults.push({ ...rows[0], sourceRowIds: rows[0].dbId ? [rows[0].dbId] : [] }); continue; }
    const breakdown = rows.map(r => `${r.stageName} (qty ${r.aiCount})`).join(", ");
    finalResults.push({
      ...rows[0],
      key: uid("ci"),
      aiCount: rows.reduce((s, r) => s + r.aiCount, 0),
      confidence: Math.min(...rows.map(r => r.confidence)),
      matchStatus: "cross_stage_conflict",
      stageId: null,
      stageName: rows.map(r => r.stageName).join(", "),
      notes: `Seen in multiple stages: ${breakdown} — verify total to avoid double-counting`,
      sourceRowIds: rows.map(r => r.dbId).filter(Boolean),
    });
  }

  const detectedIds = new Set(finalResults.filter(r => r.itemId).map(r => r.itemId));
  for (const item of areaItems) {
    if (!detectedIds.has(item.id)) {
      finalResults.push({
        key: uid("ci"),
        itemId: item.id,
        sku: item.sku || item.id,
        name: item.name,
        size: item.size || "",
        aiCount: 0,
        par: item.par ?? null,
        confidence: 0,
        unit: item.unit || "units",
        price: item.price || 0,
        notes: "",
        matchStatus: "not_found",
        override: null,
        confirmed: false,
        stageId: null,
        stageName: null,
        sourceRowIds: [],
      });
    }
  }
  return finalResults;
}

const CaptureScreen = ({ locations, items, assignments, stages, setStages, settings, navigate, onComplete, isOnline, onQueued, presetLocationId, presetAreaId, onPresetConsumed }) => {
  // A tap on a specific "Due Today" card (Dashboard) arrives here as presetLocationId/
  // presetAreaId, so the area picker below opens already pointed at that area instead
  // of always defaulting to the first location's first area.
  const [locId, setLocId] = useState(presetLocationId || locations[0]?.id || "");
  const [areaId, setAreaId] = useState(presetAreaId || "");
  useEffect(() => { onPresetConsumed?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [phase, setPhase] = useState("ready");
  const [stageList, setStageList] = useState([]); // [{ id, name, images: [{id, thumbDataUrl, name, sizeKB, status, storagePath}] }]
  const [preview, setPreview] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stageProgressLabel, setStageProgressLabel] = useState("");
  const [resultCount, setResultCount] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRefs = useRef({}); const camRefs = useRef({});
  const [lastCount, setLastCount] = useState(null);

  // Count-session state: created (or resumed) as soon as the first photo is captured,
  // not only at the very end -- this is what lets every stage persist as it happens.
  const [countId, setCountId] = useState(null);
  const [completedStageIds, setCompletedStageIds] = useState(new Set());
  const [resumeBanner, setResumeBanner] = useState(null); // { countId, stageCount } | null
  const [resumedResults, setResumedResults] = useState([]); // previously-persisted rows from a resumed count, adapted to row shape
  const [activeElsewhere, setActiveElsewhere] = useState(null); // { startedAt } | null -- another device is already counting this area
  const [collision, setCollision] = useState(null); // { startedAt, countId } | null -- surfaced when THIS device tries to start and loses the race
  const uploadPromisesRef = useRef({}); // imgId -> Promise<storagePath>
  const [scannedItems, setScannedItems] = useState([]); // [{itemId, sku, name, size, unit, par, price, qty}]
  const [scannerOpen, setScannerOpen] = useState(false);
  const [showPrepTips, setShowPrepTips] = useState(true);

  const loc = locations.find(l => l.id === locId) || locations[0];
  const areas = loc?.areas || [];
  const area = areas.find(a => a.id === areaId) || areas[0];
  const totalImages = stageList.reduce((s, st) => s + st.images.length, 0);
  const activeStageCount = stageList.filter(s => s.images.length > 0).length;
  const uploadingCount = stageList.reduce((s, st) => s + st.images.filter(i => i.status === "uploading").length, 0);
  const failedUploadCount = stageList.reduce((s, st) => s + st.images.filter(i => i.status === "error").length, 0);
  const canProcess = (totalImages > 0 || scannedItems.length > 0) && phase === "ready" && !!area && failedUploadCount === 0;

  const handleBarcodeMatch = (item) => {
    setScannedItems(prev => {
      const existing = prev.find(s => s.itemId === item.id);
      if (existing) return prev.map(s => s.itemId === item.id ? { ...s, qty: s.qty + 1 } : s);
      return [...prev, { itemId: item.id, sku: item.sku, name: item.name, size: item.size, unit: item.unit, par: item.par, price: item.price, qty: 1 }];
    });
  };
  const adjustScanned = (itemId, delta) => setScannedItems(prev => prev
    .map(s => s.itemId === itemId ? { ...s, qty: s.qty + delta } : s)
    .filter(s => s.qty > 0));

  useEffect(() => {
    if (!area) { setLastCount(null); return; }
    let cancelled = false;
    fetchLastCount(area.id).then(lc => { if (!cancelled) setLastCount(lc); }).catch(() => setLastCount(null));
    return () => { cancelled = true; };
  }, [area?.id]);

  // Seed stages from what was persisted for this area last time -- names stick around session to session.
  // Also check for an in-progress count left over from a dropped connection / closed tab, so a
  // several-hundred-photo count doesn't have to restart from zero after an interruption.
  useEffect(() => {
    setCountId(null); setCompletedStageIds(new Set()); setResumeBanner(null); setResumedResults([]); setActiveElsewhere(null); setCollision(null); uploadPromisesRef.current = {}; setScannedItems([]);
    if (!area) { setStageList([]); return; }
    const persisted = stages.filter(s => s.areaId === area.id).sort((a, b) => a.sortOrder - b.sortOrder);
    setStageList(persisted.length > 0
      ? persisted.map(s => ({ id: s.id, name: s.name, images: [] }))
      : [{ id: uid("stage"), name: "Stage 1", images: [] }]);

    let cancelled = false;
    resumeCount(area.id).then(r => {
      if (cancelled) return;
      if (r.activeElsewhere) { setActiveElsewhere({ startedAt: r.startedAt }); return; }
      if (!r.resumable) return;
      const stageIdsWithResults = new Set((r.completedStageResults || []).map(i => i.stage_id));
      setCountId(r.countId);
      setCompletedStageIds(stageIdsWithResults);
      // Adapt the previously-persisted rows into the row shape doProcess merges with, so
      // completing the remaining stages doesn't lose whatever earlier stages already found.
      setResumedResults(adaptResumedResults(r.completedStageResults || [], areaItems));
      if (stageIdsWithResults.size > 0) setResumeBanner({ countId: r.countId, stageCount: stageIdsWithResults.size });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [area?.id]);

  // Area-scoped reference list for Claude
  const areaItems = area ? assignments
    .filter(a => a.locationId === loc.id && a.areaId === area.id)
    .map(a => { const it = items.find(i => i.id === a.itemId); return it ? { ...it, par: a.par } : null; })
    .filter(Boolean) : [];

  const addStage = () => setStageList(prev => [...prev, { id: uid("stage"), name: `Stage ${prev.length + 1}`, images: [] }]);
  const removeStage = (stageId) => setStageList(prev => prev.length > 1 ? prev.filter(s => s.id !== stageId) : prev);
  const renameStage = (stageId, name) => setStageList(prev => prev.map(s => s.id === stageId ? { ...s, name } : s));

  const patchImage = (stageId, imgId, patch) =>
    setStageList(prev => prev.map(s => s.id === stageId ? { ...s, images: s.images.map(i => i.id === imgId ? { ...i, ...patch } : i) } : s));

  // Captures a photo, shows it immediately (via the small thumbnail), and kicks off its
  // upload to Storage in the background right away -- not batched until "Process". That's
  // what bounds memory across a long count: by the time someone's five stages deep, the
  // early stages' full-resolution photos are already off the device, only a thumbnail and
  // a storage path remain in state.
  const handleFiles = async (stageId, files) => {
    const valid = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (valid.length === 0) return;

    // Offline: skip the session/upload calls entirely and hold the photo (with its resized
    // blob, not just a thumbnail) in memory for the offline queue -- see doProcess below.
    if (isOnline === false) {
      for (const file of valid) {
        const imgId = uid("img");
        try {
          const { blob, mediaType, thumbDataUrl } = await processPhotoForCapture(file);
          const entry = { id: imgId, thumbDataUrl, name: file.name, sizeKB: Math.round(blob.size / 1024), status: "queued-offline", storagePath: null, blob, mediaType };
          setStageList(prev => prev.map(s => s.id === stageId ? { ...s, images: [...s.images, entry].slice(0, 5) } : s));
        } catch (e) {
          setStageList(prev => prev.map(s => s.id === stageId ? { ...s, images: [...s.images, { id: imgId, thumbDataUrl: null, name: file.name, sizeKB: 0, status: "error", error: e.message }].slice(0, 5) } : s));
        }
      }
      return;
    }

    // Lazily start (or resume) the count session on first photo of the whole area capture.
    let cid = countId;
    if (!cid) {
      try { const started = await startCountSession(area.id); cid = started.countId; setCountId(cid); }
      catch (e) {
        if (e.collision) { setCollision(e.collision); return; } // surfaced via the banner below, not a generic error
        setErrorMsg(e.message || "Could not start this count session."); return;
      }
    }

    for (const file of valid) {
      const imgId = uid("img");
      let entry;
      try {
        const { blob, mediaType, thumbDataUrl } = await processPhotoForCapture(file);
        entry = { id: imgId, thumbDataUrl, name: file.name, sizeKB: Math.round(blob.size / 1024), status: "uploading", storagePath: null };
        setStageList(prev => prev.map(s => s.id === stageId ? { ...s, images: [...s.images, entry].slice(0, 5) } : s));

        const uploadPromise = uploadPhotoToStorage({ areaId: area.id, stageId, countId: cid, blob, mediaType })
          .then(path => { patchImage(stageId, imgId, { status: "uploaded", storagePath: path }); return path; })
          .catch(err => { patchImage(stageId, imgId, { status: "error", error: err.message }); throw err; });
        uploadPromisesRef.current[imgId] = uploadPromise;
      } catch (e) {
        // processPhotoForCapture itself failed (unreadable file, etc).
        setStageList(prev => prev.map(s => s.id === stageId ? { ...s, images: [...s.images, { id: imgId, thumbDataUrl: null, name: file.name, sizeKB: 0, status: "error", error: e.message }].slice(0, 5) } : s));
      }
    }
  };

  // Note: a failed upload doesn't keep its original blob around (memory reasons), so
  // there's no "retry" that resends the same bytes -- recovering from a failure just means
  // removing the failed thumbnail (below) and recapturing the photo.
  const removeImage = (stageId, imgId) => {
    delete uploadPromisesRef.current[imgId];
    setStageList(prev => prev.map(s => s.id === stageId ? { ...s, images: s.images.filter(i => i.id !== imgId) } : s));
  };

  const doProcess = async () => {
    setErrorMsg("");
    const activeStages = stageList.filter(s => s.images.length > 0);
    if (activeStages.length === 0 && scannedItems.length === 0) return;

    // Offline: nothing here can reach the backend, so package everything captured so far
    // (photo blobs + scanned items) into one offline queue entry instead of trying and
    // failing. AppShell's flushOfflineQueue() replays this once the device is back online.
    if (isOnline === false) {
      setPhase("processing"); setProgress(0);
      try {
        await enqueueCapture({
          id: uid("queued"),
          locationId: loc.id, locationName: loc.name,
          areaId: area.id, areaName: area.name,
          stages: activeStages.map(s => ({
            id: s.id, name: s.name,
            images: s.images.filter(i => i.blob).map(i => ({ id: i.id, name: i.name, mediaType: i.mediaType, blob: i.blob, sizeKB: i.sizeKB })),
          })),
          scannedItems,
        });
        onQueued?.();
        setStageList(prev => prev.map(s => ({ ...s, images: [] })));
        setScannedItems([]);
        setProgress(100);
        setTimeout(() => setPhase("queued"), 300);
      } catch (e) {
        setProgress(0);
        setErrorMsg(e.message || "Could not save this count for offline sync."); setPhase("error");
      }
      return;
    }

    // Pure barcode/manual count with no photos: fully local (the catalog is already loaded
    // client-side) except for creating the count session itself, since finalize-count.js
    // requires an existing in_progress session to reconcile against.
    if (activeStages.length === 0) {
      setPhase("processing"); setProgress(0);
      try {
        let cid = countId;
        if (!cid) {
          try { const started = await startCountSession(area.id); cid = started.countId; setCountId(cid); }
          catch (e) { if (e.collision) { setCollision(e.collision); setPhase("ready"); setProgress(0); return; } throw e; }
        }
        const results = scannedItems.map(scannedItemToResultRow);
        setProgress(100); setResultCount(results.length); setPhotoCount(0);
        onComplete(results, { location: loc.name, locationId: loc.id, area: area.name, areaId: area.id, photoCount: 0, stageCount: 0, countId: cid });
        setTimeout(() => setPhase("done"), 400);
      } catch (e) {
        setProgress(0);
        setErrorMsg(e.message || "Could not save the scanned counts."); setPhase("error");
      }
      return;
    }

    if (failedUploadCount > 0) {
      setErrorMsg(`${failedUploadCount} photo(s) failed to upload. Remove them (or re-add) before analyzing.`);
      setPhase("error");
      return;
    }

    setPhase("processing"); setProgress(0);
    const totalPhotos = activeStages.reduce((s, st) => s + st.images.length, 0);
    setPhotoCount(totalPhotos);

    // Persist stage names now, so they survive even if analysis fails partway through.
    try {
      const saved = await saveStagesToBackend(area.id, activeStages.map((s, i) => ({ id: s.id, name: s.name, sortOrder: i })));
      setStages(prev => {
        const savedIds = new Set(saved.stages.map(sv => sv.id));
        const others = prev.filter(p => !savedIds.has(p.id));
        return [...others, ...saved.stages.map(sv => ({ id: sv.id, areaId: sv.area_id, name: sv.name, sortOrder: sv.sort_order }))];
      });
    } catch {
      // Non-fatal -- names just won't persist for next time, the count can still proceed.
    }

    try {
      let cid = countId;
      if (!cid) {
        try { const started = await startCountSession(area.id); cid = started.countId; setCountId(cid); }
        catch (e) { if (e.collision) { setCollision(e.collision); setPhase("ready"); setProgress(0); return; } throw e; }
      }

      // Every photo's upload was kicked off the moment it was captured -- make sure they've
      // actually landed in Storage (and been recorded) before we try to analyze them.
      // Important: `activeStages` is a snapshot of state taken above, before this await. A
      // photo still mid-upload at that moment has storagePath: null in that snapshot, and
      // React updating state once the upload finishes doesn't retroactively update this
      // already-captured array. So collect the final paths from what the upload promises
      // themselves resolve to -- not by re-reading the stale snapshot -- and analyze from
      // those; otherwise tapping Analyze while uploads are still running can silently skip
      // a stage's photos.
      setStageProgressLabel("Finishing photo uploads…");
      const resolvedPaths = {}; // imgId -> storagePath, filled in as each upload promise settles
      await Promise.all(activeStages.flatMap(s => s.images.map(img => {
        const p = uploadPromisesRef.current[img.id];
        if (!p) return null;
        return p.then(path => { resolvedPaths[img.id] = path; });
      })).filter(Boolean));

      let completed = 0;
      const stageResultsList = await runWithConcurrency(activeStages, 3, async (s) => {
        const storagePaths = s.images.map(img => resolvedPaths[img.id] || img.storagePath).filter(Boolean);
        if (storagePaths.length === 0) return [];
        const backendResults = await analysePhotosViaBackend({ storagePaths, areaId: area.id, countId: cid, stageId: s.id, stageName: s.name });
        completed++;
        setStageProgressLabel(`Analysed ${completed} of ${activeStages.length} stages…`);
        setProgress(Math.round((completed / activeStages.length) * 90));
        const adapted = adaptAnalysisResults(backendResults, areaItems);
        adapted.forEach(r => { r.stageId = s.id; r.stageName = s.name; });
        return adapted;
      });
      // Carry forward results from stages that were already analyzed in a previous browser
      // session (resumed) but aren't being redone right now -- if a stage IS in activeStages
      // (the person added new photos to it), its freshly-analyzed rows below supersede the
      // old ones instead of stacking with them.
      const activeStageIds = new Set(activeStages.map(s => s.id));
      const carriedOverResults = resumedResults.filter(r => !activeStageIds.has(r.stageId));
      const allResults = [...carriedOverResults, ...stageResultsList.flat()];
      setProgress(95);

      // Merge across stages, reconcile against the catalog (shared with the offline-sync
      // flusher -- see mergeAndReconcileStageResults above).
      const finalResults = mergeAndReconcileStageResults(allResults, areaItems);

      // Barcode counts win over AI-inferred counts for the same item -- a scanned code is a
      // direct physical read, not an inference -- so scanned rows replace any AI row for the
      // same itemId; anything AI found that wasn't also scanned is left untouched.
      const mergedResults = mergeScannedIntoResults(finalResults, scannedItems);

      setProgress(100); setResultCount(mergedResults.length);
      onComplete(mergedResults, { location: loc.name, locationId: loc.id, area: area.name, areaId: area.id, photoCount: totalPhotos, stageCount: activeStages.length, countId: cid });
      setTimeout(() => setPhase("done"), 400);
    } catch (e) {
      setProgress(0);
      setErrorMsg(e.message || "Analysis failed."); setPhase("error");
    }
  };

  return (
    <div style={{ padding: "24px 16px 100px" }}>
      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: "fixed", inset: 0, background: "#0d1b2aE6", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <img src={preview} alt="" style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 16 }} />
        </div>
      )}

      <h1 style={{ fontSize: 24, fontWeight: 400, color: C.navy, margin: 0, fontFamily: "'DM Serif Display', serif" }}>Capture Count</h1>
      <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 18px" }}>Break the area into stages (shelves, walls, bays) — up to 5 photos each</p>

      {phase === "ready" && isOnline === false && (
        <div style={{ background: C.navy, borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 12, color: "#fff", fontWeight: 600 }}>Offline — photos and scans are saved on this device and will sync automatically once you're back online.</p>
        </div>
      )}

      {phase === "ready" && showPrepTips && (
        <div style={{ background: C.goldDim, border: `1px solid ${C.goldBorder}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16, position: "relative" }}>
          <button onClick={() => setShowPrepTips(false)} style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="close" size={12} color={C.navy} /></button>
          <p style={{ margin: "0 20px 4px 0", fontSize: 11, fontWeight: 800, color: C.navy, textTransform: "uppercase", letterSpacing: ".06em" }}>Before you start</p>
          <p style={{ margin: 0, fontSize: 12, color: C.navy, lineHeight: 1.6 }}>
            Turn cases so labels face out and pic stickers/barcodes are visible, and square up items on the shelf — both the photo count and barcode scan work better on a tidy, well-lit shelf than a jumbled one.
          </p>
        </div>
      )}

      {phase === "ready" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <select value={locId} onChange={e => { setLocId(e.target.value); setAreaId(""); }}
            style={{ background: C.card, border: `1px solid ${C.borderDark}`, borderRadius: 10, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none", fontFamily: "'DM Sans', sans-serif", appearance: "none", cursor: "pointer" }}>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={area?.id || ""} onChange={e => setAreaId(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.borderDark}`, borderRadius: 10, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none", fontFamily: "'DM Sans', sans-serif", appearance: "none", cursor: "pointer" }}>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div style={{ padding: "10px 14px", background: areaItems.length ? C.blueBg : C.amberBg, border: `1px solid ${areaItems.length ? C.blue + "44" : C.amberBorder}`, borderRadius: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: areaItems.length ? C.blue : C.amber, fontWeight: 600 }}>
              {areaItems.length
                ? `🎯 ${areaItems.length} items assigned to ${area?.name} — Claude will cross-reference this list`
                : `⚠ No items assigned to ${area?.name} yet — Claude will identify from scratch`}
            </p>
          </div>
          {lastCount && (
            <div style={{ padding: "10px 14px", background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <p style={{ margin: 0, fontSize: 11, color: C.textSub }}>
                📋 Last counted <strong>{new Date(lastCount.date).toLocaleDateString()}</strong> · {lastCount.items.length} item{lastCount.items.length !== 1 ? "s" : ""} recorded — this new count will be compared against it
              </p>
            </div>
          )}
          {resumeBanner && (
            <div style={{ padding: "10px 14px", background: C.blueBg, border: `1px solid ${C.blue}44`, borderRadius: 10 }}>
              <p style={{ margin: 0, fontSize: 11, color: C.blue, fontWeight: 600 }}>
                ↻ Picked up an in-progress count for this area — {resumeBanner.stageCount} stage{resumeBanner.stageCount !== 1 ? "s" : ""} already analyzed and saved. Keep capturing the remaining stages below.
              </p>
            </div>
          )}
          {(activeElsewhere || collision) && (
            <div style={{ padding: "12px 14px", background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 10 }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: C.amber, fontWeight: 700 }}>
                ⚠ Someone else is already counting {area?.name}{(activeElsewhere?.startedAt || collision?.startedAt) ? ` — started ${new Date(activeElsewhere?.startedAt || collision?.startedAt).toLocaleTimeString()}` : ""}
              </p>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: C.textSub }}>
                Capturing here now would mix your photos into their in-progress count. Wait for them to finish, or take over if you're sure they're not still counting (this marks their session abandoned — their work stays saved for audit, but they'll need to restart if they come back).
              </p>
              <button onClick={async () => {
                try {
                  const started = await startCountSession(area.id, { force: true });
                  setCountId(started.countId);
                  setCollision(null); setActiveElsewhere(null); setResumeBanner(null); setResumedResults([]); setCompletedStageIds(new Set());
                } catch (e) { setErrorMsg(e.message || "Could not take over this count."); }
              }} style={{ background: C.amber, border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Take Over Anyway</button>
            </div>
          )}
        </div>
      )}

      {phase === "done" && (
        <div style={{ background: C.greenBg, border: `2px solid ${C.greenBorder}`, borderRadius: 18, padding: 26, textAlign: "center", marginBottom: 18 }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#fff", border: `2px solid ${C.green}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}><Icon name="check" size={28} color={C.green} /></div>
          <p style={{ color: C.navy, fontWeight: 400, margin: 0, fontSize: 18, fontFamily: "'DM Serif Display', serif" }}>Analysis Complete</p>
          <p style={{ color: C.textSub, fontSize: 13, margin: "6px 0 0" }}>Claude found <strong>{resultCount}</strong> item{resultCount !== 1 ? "s" : ""} across {photoCount} photo{photoCount !== 1 ? "s" : ""}</p>
        </div>
      )}

      {phase === "error" && (
        <div style={{ background: C.redBg, border: `2px solid ${C.redBorder}`, borderRadius: 18, padding: 26, textAlign: "center", marginBottom: 18 }}>
          <p style={{ color: C.red, fontWeight: 800, margin: 0, fontSize: 16 }}>Analysis Failed</p>
          <p style={{ color: C.textSub, fontSize: 12, margin: "8px 0 0" }}>{errorMsg}</p>
        </div>
      )}

      {phase === "processing" && (
        <div style={{ background: C.card, border: `2px solid ${C.goldBorder}`, borderRadius: 18, padding: 26, marginBottom: 18, boxShadow: "0 2px 8px rgba(13,27,42,0.08)" }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ width: 54, height: 54, borderRadius: "50%", border: `3px solid ${C.goldDim}`, borderTopColor: C.gold, animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
            <p style={{ color: C.navy, fontWeight: 400, margin: 0, fontSize: 16, fontFamily: "'DM Serif Display', serif" }}>AI Analysing…</p>
            <p style={{ color: C.textSub, fontSize: 12, margin: "6px 0 0" }}>{stageProgressLabel}</p>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg,#d79e2d,#efc358)", borderRadius: 3, transition: "width 0.4s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>{photoCount} photo{photoCount !== 1 ? "s" : ""}</span>
            <span style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>{progress}%</span>
          </div>
        </div>
      )}

      {phase === "ready" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 14 }}>
            {stageList.map((s, sidx) => (
              <div key={s.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
                <input ref={el => { if (el) fileRefs.current[s.id] = el; }} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { handleFiles(s.id, e.target.files); e.target.value = ""; }} />
                <input ref={el => { if (el) camRefs.current[s.id] = el; }} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { handleFiles(s.id, e.target.files); e.target.value = ""; }} />

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <input value={s.name} onChange={e => renameStage(s.id, e.target.value)} placeholder={`Stage ${sidx + 1}`}
                    style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.borderDark}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 700, color: C.navy, outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
                  {stageList.length > 1 && (
                    <button onClick={() => removeStage(s.id)} style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}><Icon name="trash" size={14} color={C.red} /></button>
                  )}
                </div>

                {s.images.length > 0 && (
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 10 }}>
                    {s.images.map((img, idx) => (
                      <div key={img.id} style={{ flexShrink: 0, position: "relative" }}>
                        {img.thumbDataUrl
                          ? <img src={img.thumbDataUrl} alt="" onClick={() => setPreview(img.thumbDataUrl)} style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", border: `2px solid ${img.status === "error" ? C.red : C.goldBorder}`, display: "block", cursor: "pointer", opacity: img.status === "uploading" ? 0.6 : 1 }} />
                          : <div style={{ width: 72, height: 72, borderRadius: 10, border: `2px solid ${C.red}`, background: C.redBg, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="close" size={16} color={C.red} /></div>}
                        {img.status === "uploading" && (
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #ffffff88", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
                          </div>
                        )}
                        {img.status === "error" && (
                          <div style={{ position: "absolute", bottom: -4, left: 0, right: 0, textAlign: "center" }}><span style={{ fontSize: 8, color: C.red, fontWeight: 800, background: "#fff", padding: "1px 4px", borderRadius: 4 }}>Failed</span></div>
                        )}
                        {img.status === "queued-offline" && (
                          <div style={{ position: "absolute", bottom: -4, left: 0, right: 0, textAlign: "center" }}><span style={{ fontSize: 8, color: C.navy, fontWeight: 800, background: C.goldDim, padding: "1px 4px", borderRadius: 4 }}>Queued</span></div>
                        )}
                        <button onClick={() => removeImage(s.id, img.id)} style={{ position: "absolute", top: -5, right: -5, width: 20, height: 20, borderRadius: "50%", background: C.red, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="close" size={9} color="#fff" /></button>
                        <div style={{ position: "absolute", top: 3, left: 3, width: 16, height: 16, borderRadius: "50%", background: C.navy, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 8, color: C.gold, fontWeight: 800 }}>{idx + 1}</span></div>
                      </div>
                    ))}
                  </div>
                )}
                {completedStageIds.has(s.id) && s.images.length === 0 && (
                  <p style={{ margin: "0 0 10px", fontSize: 11, color: C.green, fontWeight: 700 }}>✓ Already analyzed in this count — add photos here only to redo it</p>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => camRefs.current[s.id]?.click()} disabled={s.images.length >= 5} style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.borderDark}`, color: s.images.length >= 5 ? C.textMuted : C.textSub, borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 12, cursor: s.images.length >= 5 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="camera" size={15} color={s.images.length >= 5 ? C.textMuted : C.textSub} />Photo</button>
                  <button onClick={() => fileRefs.current[s.id]?.click()} disabled={s.images.length >= 5} style={{ flex: 1, background: s.images.length >= 5 ? C.border : C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 12, cursor: s.images.length >= 5 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="upload" size={15} color={C.gold} />{s.images.length}/5</button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={addStage} style={{ width: "100%", background: C.cardAlt, border: `1px dashed ${C.borderDark}`, color: C.textSub, borderRadius: 12, padding: 12, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12 }}>
            <Icon name="plus" size={15} color={C.textSub} />Add Stage
          </button>

          {/* Barcode scan fallback: a direct code read is ground truth and never needs
              review, unlike a vision-inferred count -- see findItemByCode/BarcodeScannerModal. */}
          <button onClick={() => setScannerOpen(true)} disabled={!area} style={{ width: "100%", background: C.navy, border: "none", color: "#fff", borderRadius: 12, padding: 13, fontWeight: 700, fontSize: 13, cursor: area ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: scannedItems.length > 0 ? 10 : 18, opacity: area ? 1 : 0.5 }}>
            <Icon name="ai" size={15} color={C.gold} />Scan Barcode{scannedItems.length > 0 ? ` (${scannedItems.reduce((s, i) => s + i.qty, 0)} scanned)` : ""}
          </button>

          {scannedItems.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
              {scannedItems.map(s => (
                <div key={s.itemId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px" }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.navy, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => adjustScanned(s.itemId, -1)} style={{ width: 22, height: 22, borderRadius: 6, background: C.cardAlt, border: `1px solid ${C.borderDark}`, cursor: "pointer", fontWeight: 800, color: C.navy }}>−</button>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.navy, minWidth: 16, textAlign: "center" }}>{s.qty}</span>
                    <button onClick={() => adjustScanned(s.itemId, 1)} style={{ width: 22, height: 22, borderRadius: 6, background: C.cardAlt, border: `1px solid ${C.borderDark}`, cursor: "pointer", fontWeight: 800, color: C.navy }}>+</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {uploadingCount > 0 && failedUploadCount === 0 && (
            <p style={{ margin: "0 0 10px", fontSize: 11, color: C.textSub, textAlign: "center" }}>Uploading {uploadingCount} photo{uploadingCount !== 1 ? "s" : ""} in the background — you can keep capturing</p>
          )}
          <PrimaryBtn onClick={doProcess} disabled={!canProcess}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Icon name="ai" size={20} color={canProcess ? C.gold : C.textMuted} />
              {isOnline === false ? (totalImages + scannedItems.reduce((s, i) => s + i.qty, 0) > 0 ? "Save — Will Sync Automatically" : "Add photos or scan a barcode")
                : failedUploadCount > 0 ? `${failedUploadCount} photo${failedUploadCount !== 1 ? "s" : ""} failed to upload`
                : totalImages > 0 ? `Analyse ${totalImages} Photo${totalImages !== 1 ? "s" : ""} Across ${activeStageCount} Stage${activeStageCount !== 1 ? "s" : ""}`
                : scannedItems.length > 0 ? `Save ${scannedItems.reduce((s, i) => s + i.qty, 0)} Scanned Item${scannedItems.reduce((s, i) => s + i.qty, 0) !== 1 ? "s" : ""}`
                : "Add photos or scan a barcode"}
            </span>
          </PrimaryBtn>
        </>
      )}

      {scannerOpen && (
        <BarcodeScannerModal
          areaItems={areaItems}
          allItems={items}
          onClose={() => setScannerOpen(false)}
          onScan={handleBarcodeMatch}
        />
      )}

      {phase === "queued" && (
        <div style={{ textAlign: "center", padding: "32px 16px" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.blueBg, border: `1px solid ${C.blue}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <Icon name="upload" size={24} color={C.blue} />
          </div>
          <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 400, color: C.navy, fontFamily: "'DM Serif Display', serif" }}>Saved — Will Sync Automatically</p>
          <p style={{ margin: "0 0 20px", fontSize: 13, color: C.textSub, lineHeight: 1.6 }}>This count is saved on your device and will upload and analyse automatically once you're back online.</p>
          <button onClick={() => setPhase("ready")} style={{ background: C.card, border: `1px solid ${C.borderDark}`, color: C.textSub, borderRadius: 12, padding: "12px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Count Another Area</button>
        </div>
      )}

      {(phase === "done" || phase === "error") && (
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={async () => {
            const cid = countId;
            setStageList(prev => prev.map(s => ({ ...s, images: [] })));
            setPhase("ready"); setProgress(0);
            setCountId(null); setCompletedStageIds(new Set()); setResumeBanner(null); setResumedResults([]);
            uploadPromisesRef.current = {};
            if (cid) { try { await abandonCount(cid); } catch { /* best-effort -- stale session just won't be resumable, not fatal */ } }
          }} style={{ flex: 1, background: C.card, border: `1px solid ${C.borderDark}`, color: C.textSub, borderRadius: 12, padding: 16, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Start Over</button>
          {phase === "done" && <GoldBtn onClick={() => navigate("review")} style={{ flex: 2 }}>Review Count Sheet →</GoldBtn>}
          {phase === "error" && <PrimaryBtn onClick={doProcess} style={{ flex: 2 }}>Retry</PrimaryBtn>}
        </div>
      )}
    </div>
  );
};

// ─── SCREEN: Review count sheet ───────────────────────────────────────────────
const ReviewScreen = ({ navigate, countItems, setCountItems, countMeta, settings, items, setItems, assignments, setAssignments }) => {
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [addingUnknown, setAddingUnknown] = useState(null); // count item being added to master
  const [reasonPickerFor, setReasonPickerFor] = useState(null); // key of item awaiting an override reason

  const list = countItems || [];
  const confirmed = list.filter(i => i.confirmed).length;
  const threshold = settings.confidenceThreshold;

  const update = (key, fn) => setCountItems(prev => prev.map(i => i.key === key ? fn(i) : i));
  const startEdit = (item) => { setEditing(item.key); setEditVal(String(item.override ?? item.aiCount)); };
  // Overriding a count doesn't confirm it immediately -- a one-tap reason picker follows
  // (see the modal below). Deliberately tiny: a manager mid-review won't fill out a form.
  const saveEdit = (key) => { update(key, i => ({ ...i, override: parseInt(editVal) || 0 })); setEditing(null); setReasonPickerFor(key); };
  const applyOverrideReason = (key, reason) => { update(key, i => ({ ...i, overrideReason: reason, confirmed: true })); setReasonPickerFor(null); };

  // Add unknown item to global master + assign to this area (respecting staffCanAddItems)
  const [reviewSaveError, setReviewSaveError] = useState("");
  const [pendingCatalogAdds, setPendingCatalogAdds] = useState(0);

  const addUnknownToMaster = async (ci) => {
    const newItem = { id: uid("it"), sku: uid("NEW").toUpperCase(), name: ci.name, size: ci.size, unit: ci.unit, vendor: "", price: 0, aliases: "" };
    setItems(prev => [...prev, newItem]);
    setAssignments(prev => [...prev, { id: uid("as"), itemId: newItem.id, locationId: countMeta.locationId, areaId: countMeta.areaId, par: 0 }]);
    update(ci.key, i => ({ ...i, itemId: newItem.id, sku: newItem.sku, matchStatus: "matched", confirmed: true }));
    setAddingUnknown(null);
    setPendingCatalogAdds(n => n + 1); // block finalize until this item actually exists in Supabase --
                                        // finalize writes item_id as a foreign key, so finalizing before
                                        // this lands would fail the constraint.
    try {
      await saveItemsToBackend([{ id: newItem.id, name: newItem.name, vendorItemCode: newItem.sku, orderUom: newItem.unit, packSize: newItem.size }]);
      await saveAssignmentToBackend(newItem.id, countMeta.areaId, 0);
    } catch (e) {
      setReviewSaveError(`Added locally but failed to sync to catalog: ${e.message}`);
    } finally {
      setPendingCatalogAdds(n => n - 1);
    }
  };

  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");

  const doFinalize = async () => {
    setFinalizing(true); setFinalizeError("");
    try {
      await finalizeCountToBackend(countMeta.countId, countMeta.areaId, settings.requireApproval, list);
      navigate("orders");
    } catch (e) {
      setFinalizeError(e.message || "Could not save this count. Your review is still here — try again.");
    } finally {
      setFinalizing(false);
    }
  };

  if (!list.length) return (
    <div style={{ padding: "48px 24px", textAlign: "center" }}>
      <p style={{ fontSize: 16, fontWeight: 400, color: C.navy, fontFamily: "'DM Serif Display', serif" }}>No count in progress</p>
      <p style={{ fontSize: 13, color: C.textSub, margin: "8px 0 20px" }}>Capture photos of a storage area to begin</p>
      <GoldBtn onClick={() => navigate("capture")} style={{ padding: "14px 28px" }}>Go to Capture</GoldBtn>
    </div>
  );

  return (
    <div style={{ padding: "24px 16px 110px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, color: C.navy, margin: 0, fontFamily: "'DM Serif Display', serif" }}>Count Sheet</h1>
          <p style={{ fontSize: 12, color: C.textSub, margin: "4px 0 0" }}>{countMeta?.area} · {countMeta?.location} · <span style={{ color: C.gold, fontWeight: 700 }}>Claude Vision</span></p>
        </div>
        {confirmed === list.length && (
          <GoldBtn onClick={doFinalize} disabled={finalizing || pendingCatalogAdds > 0} style={{ padding: "10px 16px", fontSize: 12, borderRadius: 10 }}>
            {finalizing ? "Saving…" : pendingCatalogAdds > 0 ? "Saving new item(s)…" : settings.requireApproval ? "Submit for Approval" : "Finalize ✓"}
          </GoldBtn>
        )}
      </div>

      {(finalizeError || reviewSaveError) && (
        <div style={{ padding: "10px 14px", background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{finalizeError || reviewSaveError}</span>
        </div>
      )}


      <div style={{ marginBottom: 14, padding: "12px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: C.textSub, fontWeight: 600 }}>Review progress</span>
          <span style={{ fontSize: 12, color: C.navy, fontWeight: 800 }}>{confirmed}/{list.length}</span>
        </div>
        <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${(confirmed / list.length) * 100}%`, height: "100%", background: "linear-gradient(90deg,#d79e2d,#efc358)", borderRadius: 3, transition: "width 0.3s" }} />
        </div>
        <button onClick={() => setCountItems(prev => prev.map(i => ({ ...i, confirmed: true })))} style={{ marginTop: 10, width: "100%", background: C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 8, padding: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Confirm All</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {list.map(item => {
          const count = item.override ?? item.aiCount;
          const needsReview = (item.confidence < threshold && item.matchStatus !== "not_found") || item.matchStatus === "cross_stage_conflict";
          const isEditing = editing === item.key;
          const nf = item.matchStatus === "not_found";
          return (
            <div key={item.key} style={{ background: nf ? C.cardAlt : C.card, border: `1px solid ${item.confirmed ? C.greenBorder : needsReview ? C.redBorder : C.border}`, borderRadius: 14, padding: 14, opacity: nf ? 0.75 : 1, boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.navy }}>{item.name}{item.size ? ` — ${item.size}` : ""}</p>
              {item.stageName && <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>📍 {item.stageName}</p>}
              {item.notes && <p style={{ margin: "3px 0 0", fontSize: 11, color: C.textSub, fontStyle: "italic" }}>"{item.notes}"</p>}
              <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                {item.matchStatus === "matched" && <Badge color={C.green}>✓ Label Match</Badge>}
                {item.matchStatus === "visual_match" && <Badge color={C.amber}>👁 Visual Match</Badge>}
                {item.matchStatus === "unknown" && <Badge color={C.red}>⚠ Not in Catalog</Badge>}
                {item.matchStatus === "cross_stage_conflict" && <Badge color={C.blue}>⚠ Multiple Stages</Badge>}
                {nf && <Badge color={C.textMuted}>📷 Not Seen</Badge>}
                {needsReview && <Badge color={C.red}>Verify</Badge>}
                {item.confirmed && <Badge color={C.green}>Confirmed</Badge>}
                {item.override !== null && <Badge color={C.amber}>Overridden{item.overrideReason ? ` · ${OVERRIDE_REASONS.find(([k]) => k === item.overrideReason)?.[1] || item.overrideReason}` : ""}</Badge>}
              </div>
              <div style={{ marginTop: 10 }}><ConfBar val={item.confidence} threshold={threshold} /></div>
              <div style={{ display: "grid", gridTemplateColumns: item.par !== null ? "1fr 1fr" : "1fr", gap: 8, marginTop: 12 }}>
                <div style={{ textAlign: "center", padding: "8px 4px", background: C.cardAlt, borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 22, fontWeight: 400, color: C.navy, fontFamily: "'DM Serif Display', serif" }}>{count}</div>
                  <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>On Hand ({item.unit})</div>
                </div>
                {item.par !== null && (
                  <div style={{ textAlign: "center", padding: "8px 4px", background: C.cardAlt, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 22, fontWeight: 400, color: count < item.par ? C.red : C.green, fontFamily: "'DM Serif Display', serif" }}>{item.par}</div>
                    <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>Par Level</div>
                  </div>
                )}
              </div>
              {isEditing ? (
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <input type="number" value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus style={{ flex: 1, background: C.card, border: `2px solid ${C.gold}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 16, fontWeight: 800, outline: "none" }} />
                  <button onClick={() => saveEdit(item.key)} style={{ background: C.navy, border: "none", color: "#fff", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>Save</button>
                  <button onClick={() => setEditing(null)} style={{ background: C.cardAlt, border: `1px solid ${C.border}`, color: C.textSub, borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>✕</button>
                </div>
              ) : (
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button onClick={() => startEdit(item)} style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.border}`, color: C.textSub, borderRadius: 8, padding: 9, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Override</button>
                  {item.matchStatus === "unknown" && settings.staffCanAddItems && (
                    <button onClick={() => addUnknownToMaster(item)} style={{ flex: 1, background: C.blueBg, border: `1px solid ${C.blue}44`, color: C.blue, borderRadius: 8, padding: 9, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Add to Catalog</button>
                  )}
                  {!item.confirmed && (
                    <button onClick={() => update(item.key, i => ({ ...i, confirmed: true }))} style={{ flex: 1, background: C.greenBg, border: `1px solid ${C.greenBorder}`, color: C.green, borderRadius: 8, padding: 9, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✓ Confirm</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {reasonPickerFor && (() => {
        const item = list.find(i => i.key === reasonPickerFor);
        if (!item) return null;
        return (
          <Modal title="Why the correction?" onClose={() => applyOverrideReason(reasonPickerFor, null)}>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>{item.name} — this helps flag items that need a reference photo, and areas where the review threshold should be stricter.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {OVERRIDE_REASONS.map(([k, label]) => (
                <button key={k} onClick={() => applyOverrideReason(reasonPickerFor, k)} style={{ background: C.cardAlt, border: `1px solid ${C.border}`, color: C.navy, borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{label}</button>
              ))}
            </div>
            <button onClick={() => applyOverrideReason(reasonPickerFor, null)} style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center" }}>Skip</button>
          </Modal>
        );
      })()}
    </div>
  );
};

// ─── SCREEN: Orders ────────────────────────────────────────────────────────
// IMPORTANT: countItems currently reflects a SINGLE just-counted area (CaptureScreen's
// onComplete fully replaces countItems, it doesn't accumulate across areas -- see App
// state around setCountItems). So this can only correctly operate in "area mode": compare
// what was counted in THIS area against THIS area's par, using the par already attached to
// each count item (ci.par, set from that specific area assignment in adaptAnalysisResults).
// It must NOT sum par across every area the item is assigned to -- that previously produced
// order quantities inflated by stock already sitting in areas that weren't part of this count.
// A true multi-area "full location" mode needs countItems to accumulate across every area
// counted in a session before this can safely roll up total par vs. total on-hand.
const OrdersScreen = ({ countItems, items, assignments, locations = [], role, settings, setSettings }) => {
  const isManager = role === "manager";
  const [tab, setTab] = useState("reorder");
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState("");
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [tagging, setTagging] = useState(null); // the areaItemVariance row being tagged
  const [tagSaving, setTagSaving] = useState(false);
  const [tagNote, setTagNote] = useState("");
  const [rawMaterial30, setRawMaterial30] = useState(() => {
    try { return localStorage.getItem("inventoryiq_raw_material_30d") || ""; } catch { return ""; }
  });
  const [categoryUsage30, setCategoryUsage30] = useState(() => {
    try { return JSON.parse(localStorage.getItem("inventoryiq_category_usage_30d") || "{}"); } catch { return {}; }
  });

  useEffect(() => {
    setMetricsLoading(true);
    fetchInventoryMetrics()
      .then(m => { setMetrics(m); setMetricsError(""); })
      .catch(e => setMetricsError(e.message || "Could not load reorder suggestions"))
      .finally(() => setMetricsLoading(false));
  }, []);

  // Server-computed suggestions reflect every finalized count across every area (real
  // operational data). If that's not available yet (brand-new catalog, or the metrics
  // call failed), fall back to rolling up just the count sitting in this browser session
  // right now, same as the original single-area behavior.
  const serverRows = metrics?.reorderSuggestions || [];
  const useServerRows = serverRows.length > 0 || (!metricsLoading && !metricsError);
  const localRows = (() => {
    const counted = (countItems || []).filter(i => i.sku && i.matchStatus !== "unknown");
    const bySku = new Map();
    counted.forEach(ci => {
      const cur = bySku.get(ci.sku) || { ...ci, totalOnHand: 0 };
      cur.totalOnHand += (ci.override ?? ci.aiCount);
      bySku.set(ci.sku, cur);
    });
    const out = [];
    bySku.forEach(ci => {
      const masterItem = items.find(i => i.sku === ci.sku);
      const totalPar = ci.par ?? 0; // this area's par only
      if (totalPar > ci.totalOnHand) out.push({ itemId: masterItem?.id || ci.sku, name: ci.name, sku: ci.sku, unit: ci.unit, onHand: ci.totalOnHand, totalPar, orderQty: totalPar - ci.totalOnHand, vendor: masterItem?.vendor || "—", estCost: (totalPar - ci.totalOnHand) * (ci.price || masterItem?.price || 0) });
    });
    return out;
  })();
  const rows = useServerRows ? serverRows : localRows;
  const usingLocalFallback = !useServerRows && localRows.length > 0;

  const [selected, setSelected] = useState({});
  useEffect(() => { setSelected(Object.fromEntries(rows.map(r => [r.itemId, true]))); }, [rows.length, useServerRows]);
  const total = rows.reduce((s, r) => s + (selected[r.itemId] !== false ? r.estCost : 0), 0);

  const openTagger = (row) => { setTagging(row); setTagNote(row.varianceNote || ""); };
  const saveTag = async (tagKey) => {
    if (!tagging) return;
    setTagSaving(true);
    try {
      await tagVariance(tagging.countItemId, tagKey, tagNote);
      setMetrics(m => ({ ...m, areaItemVariances: m.areaItemVariances.map(v => v.countItemId === tagging.countItemId ? { ...v, varianceTag: tagKey, varianceNote: tagNote } : v) }));
      setTagging(null);
    } catch (e) {
      setMetricsError(e.message || "Could not save tag");
    } finally {
      setTagSaving(false);
    }
  };

  const areaVariances = metrics?.areaItemVariances || [];
  const untaggedCount = areaVariances.filter(v => !v.varianceTag).length;

  const saveRawMaterial = (value) => {
    setRawMaterial30(value);
    try { localStorage.setItem("inventoryiq_raw_material_30d", value); } catch {}
  };
  const saveCategoryUsage = (key, value) => {
    const next = { ...categoryUsage30, [key]: value };
    setCategoryUsage30(next);
    try { localStorage.setItem("inventoryiq_category_usage_30d", JSON.stringify(next)); } catch {}
  };
  const usage30 = Number(rawMaterial30 || 0);
  const dailyUsage = usage30 > 0 ? usage30 / 30 : 0;
  const daysOnHand = dailyUsage > 0 ? (metrics?.currentValue || 0) / dailyUsage : null;
  const variancePositive = (metrics?.variance || 0) >= 0;

  return (
    <div style={{ padding: "24px 16px 100px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 400, color: C.navy, margin: 0, fontFamily: "'DM Serif Display', serif" }}>Purchase Orders</h1>
      <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 16px" }}>Reorder suggestions, variance review, and inventory value</p>

      <div style={{ display: "flex", background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, marginBottom: 16 }}>
        {[["reorder", "Reorder"], ["variance", `Variance${untaggedCount > 0 ? ` (${untaggedCount})` : ""}`], ["value", "Value"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, background: tab === k ? C.navy : "transparent", border: "none", color: tab === k ? "#fff" : C.textSub, borderRadius: 9, padding: "10px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {tab === "reorder" && (
        <>
          {usingLocalFallback && (
            <div style={{ padding: "10px 14px", background: C.blueBg, border: `1px solid ${C.blue}44`, borderRadius: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 11.5, color: C.blue, fontWeight: 600 }}>Showing shortfalls from the count you just finished — this will switch to suggestions across all areas' finalized counts on next load.</span>
            </div>
          )}
          {metricsError && !usingLocalFallback && (
            <div style={{ padding: "10px 14px", background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>{metricsError}</span>
            </div>
          )}
          {metricsLoading && !rows.length ? (
            <div style={{ textAlign: "center", padding: 40 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${C.goldDim}`, borderTopColor: C.gold, animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 400, color: C.navy, margin: "0 0 8px", fontFamily: "'DM Serif Display', serif" }}>Nothing to reorder</p>
              <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>Once counts are finalized, any items below their combined par levels will appear here.</p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16, padding: 16, background: C.navy, borderRadius: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 26, fontWeight: 400, color: C.gold, fontFamily: "'DM Serif Display', serif" }}>${total.toFixed(0)}</div>
                  <div style={{ fontSize: 10, color: "#ffffff99", textTransform: "uppercase", letterSpacing: "0.08em" }}>Est. Total</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 26, fontWeight: 400, color: "#fff", fontFamily: "'DM Serif Display', serif" }}>{Object.values(selected).filter(v => v !== false).length}</div>
                  <div style={{ fontSize: 10, color: "#ffffff99", textTransform: "uppercase", letterSpacing: "0.08em" }}>Line Items</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {rows.map((r) => {
                  const isSelected = selected[r.itemId] !== false;
                  return (
                    <div key={r.itemId} onClick={() => setSelected(s => ({ ...s, [r.itemId]: !isSelected }))} style={{ background: C.card, border: `1px solid ${isSelected ? C.goldBorder : C.border}`, borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", gap: 10, boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: isSelected ? C.navy : C.cardAlt, border: `1px solid ${isSelected ? C.navy : C.borderDark}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{isSelected && <Icon name="check" size={12} color={C.gold} />}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.navy }}>{r.name}</p>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>${r.estCost.toFixed(0)}</span>
                        </div>
                        <p style={{ margin: "2px 0 6px", fontSize: 11, color: C.textMuted }}>{r.vendor || "No vendor set"}</p>
                        <p style={{ margin: 0, fontSize: 12, color: C.textSub }}>On hand <strong style={{ color: C.red }}>{r.onHand}</strong> · total par <strong>{r.totalPar}</strong> → order <strong style={{ color: C.navy }}>{r.orderQty} {r.unit || ""}</strong></p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {isManager ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={{ flex: 1, background: C.card, border: `1px solid ${C.borderDark}`, color: C.textSub, borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Export PDF</button>
                  <GoldBtn style={{ flex: 2, padding: 14 }}>Submit to Vendors</GoldBtn>
                </div>
              ) : (
                <div style={{ padding: "10px 14px", background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 12, color: C.textSub }}>View-only — ask a manager to export or submit this order.</p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === "variance" && (
        <>
          <div style={{ padding: "10px 14px", background: C.blueBg, border: `1px solid ${C.blue}44`, borderRadius: 10, marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 11.5, color: C.blue, fontWeight: 600, lineHeight: 1.5 }}>Lines with a meaningful swing from the prior count in the same area, ranked by dollar impact. Tagging a cause builds a pattern over time instead of re-investigating the same SKU every cycle.</p>
          </div>
          {metricsLoading && !areaVariances.length ? (
            <div style={{ textAlign: "center", padding: 40 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${C.goldDim}`, borderTopColor: C.gold, animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
            </div>
          ) : areaVariances.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 400, color: C.navy, margin: "0 0 8px", fontFamily: "'DM Serif Display', serif" }}>No variance yet</p>
              <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>Once an area has two finalized counts, swings between them will show up here.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {areaVariances.map(v => (
                <div key={v.countItemId} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: C.textMuted }}>{v.areaName} · {v.previousQty} → {v.currentQty}</p>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: v.valueDelta < 0 ? C.red : C.green, flexShrink: 0 }}>{v.valueDelta >= 0 ? "+" : "−"}{money(Math.abs(v.valueDelta))}</span>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    {v.varianceTag ? (
                      <Badge color={C.navy}>{VARIANCE_TAGS.find(([k]) => k === v.varianceTag)?.[1] || v.varianceTag}</Badge>
                    ) : (
                      <span style={{ fontSize: 11, color: C.textMuted }}>Untagged</span>
                    )}
                    {isManager && <button onClick={() => openTagger(v)} style={{ background: C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{v.varianceTag ? "Edit Tag" : "Tag Cause"}</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "value" && (
        <>
          {metricsError && (
            <div style={{ padding: "10px 14px", background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>{metricsError}</span>
            </div>
          )}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, boxShadow: "0 2px 8px rgba(13,27,42,0.06)", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".09em" }}>Current Inventory Value</div>
                <div style={{ marginTop: 4, fontSize: 38, lineHeight: 1, color: C.navy, fontFamily: "'DM Serif Display', serif" }}>{metrics ? money(metrics.currentValue) : "—"}</div>
              </div>
              {metrics?.previousValue > 0 && <Badge color={variancePositive ? C.amber : C.green}>{variancePositive ? "+" : ""}{money(metrics.variance)} vs prior</Badge>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
              <div style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Previous Inventory</div>
                <div style={{ fontSize: 21, fontWeight: 700, color: C.navy, marginTop: 4 }}>{metrics ? money(metrics.previousValue) : "—"}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{metrics?.variancePct != null ? `${metrics.variancePct >= 0 ? "+" : ""}${(metrics.variancePct * 100).toFixed(1)}% change` : "No prior snapshot"}</div>
              </div>
              <div style={{ background: daysOnHand != null && daysOnHand > 30 ? C.amberBg : C.greenBg, border: `1px solid ${daysOnHand != null && daysOnHand > 30 ? C.amberBorder : C.greenBorder}`, borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Days on Hand</div>
                <div style={{ fontSize: 21, fontWeight: 700, color: C.navy, marginTop: 4 }}>{daysOnHand == null ? "—" : daysOnHand.toFixed(1)}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{dailyUsage > 0 ? `${money(dailyUsage)}/day avg usage` : "Enter 30-day usage below"}</div>
              </div>
            </div>

            <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.navy }}>30-day raw material usage / COGS</div>
                  <div style={{ fontSize: 10, color: C.textMuted }}>Used to calculate days on hand: inventory ÷ (30-day usage ÷ 30)</div>
                </div>
                <div style={{ position: "relative", width: 126, flexShrink: 0 }}>
                  <span style={{ position: "absolute", left: 10, top: 9, color: C.textMuted, fontWeight: 700 }}>$</span>
                  <input type="number" inputMode="decimal" value={rawMaterial30} onChange={e => saveRawMaterial(e.target.value)} placeholder="0" style={{ width: "100%", border: `1px solid ${C.borderDark}`, borderRadius: 9, padding: "9px 9px 9px 23px", fontSize: 13, fontWeight: 700, color: C.navy, outline: "none", background: "#fff" }} />
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 2 }}>Inventory Dollar Trend</div>
              <InventoryTrend snapshots={metrics?.snapshots || []} />
            </div>
            {metrics && <div style={{ marginTop: 8, fontSize: 9, color: C.textMuted }}>
              {metrics.costingBasis === "locked_historical_cost"
                ? "Historical cost locked: each count is valued at the item cost captured when that inventory was saved."
                : metrics.costingBasis === "mixed_locked_and_legacy_estimate"
                  ? `Historical cost locking is active. ${metrics.legacyEstimatedLines || 0} older line${(metrics.legacyEstimatedLines || 0) === 1 ? "" : "s"} predate cost locking and are estimated using current item-master cost.`
                  : "Legacy valuation: historical counts are using current item-master cost."}
            </div>}
          </div>

          {metrics?.activeCycle && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 15, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Count Cycle</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.navy, marginTop: 2 }}>{metrics.activeCycle.label || "Current inventory cycle"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.gold }}>{metrics.activeCycle.completedAreas}/{metrics.activeCycle.totalAreas}</div>
                  <div style={{ fontSize: 9, color: C.textMuted }}>areas complete</div>
                </div>
              </div>
              <div style={{ height: 7, background: C.border, borderRadius: 4, overflow: "hidden", marginTop: 10 }}>
                <div style={{ width: `${Math.round((metrics.activeCycle.progressPct || 0) * 100)}%`, height: "100%", background: C.gold, borderRadius: 4 }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {(metrics.activeCycle.areas || []).map(a => <Badge key={a.areaId} color={a.complete ? C.green : C.textMuted}>{a.complete ? "✓ " : "○ "}{a.areaName}</Badge>)}
              </div>
            </div>
          )}

          {metrics?.rootCause && (
            <div style={{ background: C.navy, borderRadius: 14, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: C.goldLight, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".09em" }}>Inventory Intelligence</div>
              <div style={{ marginTop: 5, fontSize: 16, color: "#fff", fontFamily: "'DM Serif Display', serif", lineHeight: 1.3 }}>{metrics.rootCause.headline}</div>
              <div style={{ marginTop: 7, fontSize: 11, color: "#ffffffb8", lineHeight: 1.55 }}>{metrics.rootCause.narrative}</div>
              {(metrics.rootCause.drivers || []).length > 0 && <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {metrics.rootCause.drivers.slice(0,5).map(d => (
                  <div key={d.itemId} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 9px", background: "#ffffff0e", borderRadius: 8 }}>
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div><div style={{ fontSize: 9, color: "#ffffff88" }}>{d.categoryName}</div></div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: d.variance >= 0 ? C.goldLight : "#8ee3b4", flexShrink: 0 }}>{d.variance >= 0 ? "+" : "−"}{money(Math.abs(d.variance))}</div>
                  </div>
                ))}
              </div>}
            </div>
          )}

          {(metrics?.categories || []).length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 15, marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Category Inventory & Days on Hand</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, marginBottom: 10 }}>Enter trailing 30-day usage by category for an accurate category DOH.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {metrics.categories.slice(0,10).map(cat => {
                  const key = cat.categoryId || "uncategorized";
                  const usage = Number(categoryUsage30[key] || 0);
                  const doh = usage > 0 ? cat.currentValue / (usage / 30) : null;
                  return <div key={key} style={{ padding: 10, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.navy }}>{cat.categoryName}</div>
                        <div style={{ fontSize: 10, color: C.textMuted }}>{money(cat.currentValue)} · {cat.variance >= 0 ? "+" : ""}{money(cat.variance)} vs prior</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 800, color: doh != null && doh > 30 ? C.amber : C.navy }}>{doh == null ? "—" : doh.toFixed(1)}</div>
                        <div style={{ fontSize: 9, color: C.textMuted }}>DOH</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                      <span style={{ fontSize: 9, color: C.textMuted, flex: 1 }}>30-day usage</span>
                      <span style={{ fontSize: 10, color: C.textMuted }}>$</span>
                      <input type="number" inputMode="decimal" value={categoryUsage30[key] || ""} onChange={e => saveCategoryUsage(key, e.target.value)} placeholder="0" style={{ width: 88, border: `1px solid ${C.borderDark}`, borderRadius: 7, padding: "6px 7px", fontSize: 11, fontWeight: 700, outline: "none", background: "#fff" }} />
                    </div>
                  </div>;
                })}
              </div>
            </div>
          )}

          {(metrics?.itemVariances || []).length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 15, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Largest SKU Dollar Variances</div>
                <Badge color={C.gold}>{Math.min(10, metrics.itemVariances.length)} shown</Badge>
              </div>
              {metrics.itemVariances.slice(0,10).map(v => <div key={v.itemId} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "8px 0", borderTop: `1px solid ${C.border}` }}>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, fontWeight: 700, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</div><div style={{ fontSize: 9, color: C.textMuted }}>{money(v.previousValue)} → {money(v.currentValue)}</div></div>
                <div style={{ fontSize: 12, fontWeight: 800, color: v.variance > 0 ? C.amber : v.variance < 0 ? C.green : C.textMuted }}>{v.variance >= 0 ? "+" : "−"}{money(Math.abs(v.variance))}</div>
              </div>)}
            </div>
          )}

          {metrics?.statusCounts && Object.keys(metrics.statusCounts).length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 14 }}>
              {[["counted","Counted"],["zero_confirmed","Zero Confirmed"],["not_seen","Not Seen"],["not_counted","Not Counted"],["needs_review","Needs Review"],["partial","Come Back Later"]].filter(([k]) => (metrics.statusCounts[k] || 0) > 0 || ["counted","zero_confirmed","not_seen","not_counted"].includes(k)).map(([k,label]) => <div key={k} style={{ background:C.card,border:`1px solid ${k==="needs_review"&&metrics.statusCounts[k]>0?C.redBorder:k==="partial"&&metrics.statusCounts[k]>0?C.amberBorder:C.border}`,borderRadius:11,padding:11 }}><div style={{ fontSize:18,fontWeight:800,color:C.navy }}>{metrics.statusCounts[k] || 0}</div><div style={{ fontSize:9,color:C.textMuted,textTransform:"uppercase",fontWeight:700 }}>{label}</div></div>)}
            </div>
          )}

          {isManager && (metrics?.areaCalibration || []).length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.amberBorder}`, borderRadius: 14, padding: 15, marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Review Threshold Suggestions</div>
              {metrics.areaCalibration.map(a => {
                const applied = settings?.areaThresholds?.[a.areaId] === a.suggestedThreshold;
                return (
                  <div key={a.areaId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.navy }}>{a.areaName}</p>
                      <p style={{ margin: "1px 0 0", fontSize: 10.5, color: C.textMuted }}>{Math.round(a.overrideRate * 100)}% of counted lines needed correction over {a.sampleSize} recent lines</p>
                    </div>
                    <button onClick={() => setSettings?.(s => ({ ...s, areaThresholds: { ...s.areaThresholds, [a.areaId]: applied ? undefined : a.suggestedThreshold } }))}
                      style={{ flexShrink: 0, background: applied ? C.navy : C.goldDim, border: `1px solid ${applied ? C.navy : C.goldBorder}`, color: applied ? "#fff" : C.navy, borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {applied ? `Applied ${Math.round(a.suggestedThreshold * 100)}%` : `Raise to ${Math.round(a.suggestedThreshold * 100)}%`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {metrics?.areas?.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Inventory by Area</p>
              {metrics.areas.slice(0, 6).map(a => <div key={a.areaId} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 7, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{a.areaName}</div><div style={{ fontSize: 10, color: C.textMuted }}>{new Date(a.date).toLocaleDateString()}</div></div>
                <div style={{ textAlign: "right" }}><div style={{ fontSize: 13, fontWeight: 800, color: C.navy }}>{money(a.value)}</div>{a.previousValue > 0 && <div style={{ fontSize: 9, color: a.value <= a.previousValue ? C.green : C.amber }}>{a.value >= a.previousValue ? "+" : ""}{money(a.value - a.previousValue)}</div>}</div>
              </div>)}
            </div>
          )}
        </>
      )}

      {tagging && (
        <Modal title={`Tag: ${tagging.name}`} onClose={() => setTagging(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>{tagging.areaName} · {tagging.previousQty} → {tagging.currentQty} ({tagging.valueDelta >= 0 ? "+" : "−"}{money(Math.abs(tagging.valueDelta))})</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {VARIANCE_TAGS.map(([k, label]) => (
                <button key={k} onClick={() => saveTag(k)} disabled={tagSaving} style={{ background: tagging.varianceTag === k ? C.navy : C.cardAlt, border: `1px solid ${tagging.varianceTag === k ? C.navy : C.border}`, color: tagging.varianceTag === k ? "#fff" : C.text, borderRadius: 9, padding: 10, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{label}</button>
              ))}
            </div>
            <FInput label="Note (optional)" value={tagNote} onChange={setTagNote} placeholder="e.g. banquet used extra cases, not on ticket" />
            {tagging.varianceTag && <button onClick={() => saveTag(null)} disabled={tagSaving} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center" }}>Clear tag</button>}
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── SCREEN: Approvals ─────────────────────────────────────────────────────────
// Closes a gap that existed even before this update: turning on "Require approval
// before finalizing" set a count's status to 'submitted' and nothing ever moved it
// forward. This is that missing approve/reject step, plus a read-only audit log of who
// did what. Actor identity comes from the caller's verified auth token (see
// finalize-count.js) -- there's no free-text "your name" field to spoof.
const EVENT_LABELS = { submitted: "Submitted", approved: "Approved", rejected: "Rejected", finalized: "Finalized" };
const EVENT_COLORS = { submitted: "amber", approved: "green", rejected: "red", finalized: "green" };

const ApprovalsScreen = () => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decidingId, setDecidingId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // pending approval row being rejected
  const [rejectReason, setRejectReason] = useState("");
  const [showLog, setShowLog] = useState(false);

  const load = () => {
    setLoading(true);
    fetchInventoryMetrics()
      .then(m => { setMetrics(m); setError(""); })
      .catch(e => setError(e.message || "Could not load approvals"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const approve = async (row) => {
    setDecidingId(row.countId);
    try {
      await decideCount("approve", row.countId);
      setMetrics(m => ({ ...m, pendingApprovals: m.pendingApprovals.filter(p => p.countId !== row.countId) }));
    } catch (e) {
      setError(e.message || "Could not approve this count");
    } finally {
      setDecidingId(null);
    }
  };

  const submitReject = async () => {
    if (!rejecting || !rejectReason.trim()) return;
    setDecidingId(rejecting.countId);
    try {
      await decideCount("reject", rejecting.countId, rejectReason);
      setMetrics(m => ({ ...m, pendingApprovals: m.pendingApprovals.filter(p => p.countId !== rejecting.countId) }));
      setRejecting(null); setRejectReason("");
    } catch (e) {
      setError(e.message || "Could not reject this count");
    } finally {
      setDecidingId(null);
    }
  };

  const pending = metrics?.pendingApprovals || [];
  const auditLog = metrics?.auditLog || [];

  return (
    <div style={{ padding: "24px 16px 100px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 400, color: C.navy, margin: 0, fontFamily: "'DM Serif Display', serif" }}>Approvals</h1>
      <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 16px" }}>Counts submitted for sign-off, and a log of who did what</p>

      {error && (
        <div style={{ padding: "10px 14px", background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{error}</span>
        </div>
      )}

      {loading && !metrics ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${C.goldDim}`, borderTopColor: C.gold, animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
        </div>
      ) : pending.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 20 }}>
          <p style={{ fontSize: 15, fontWeight: 400, color: C.navy, margin: "0 0 8px", fontFamily: "'DM Serif Display', serif" }}>Nothing waiting</p>
          <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>Counts submitted under "Require approval" will show up here.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {pending.map(row => (
            <div key={row.countId} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.navy }}>{row.areaName}</p>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{money(row.totalValue)}</span>
              </div>
              <p style={{ margin: "3px 0 12px", fontSize: 11, color: C.textMuted }}>
                {row.itemCount} item{row.itemCount !== 1 ? "s" : ""} · submitted {new Date(row.submittedAt).toLocaleString()}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setRejecting(row)} disabled={decidingId === row.countId} style={{ flex: 1, background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, borderRadius: 9, padding: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Reject</button>
                <button onClick={() => approve(row)} disabled={decidingId === row.countId} style={{ flex: 2, background: C.navy, border: "none", color: "#fff", borderRadius: 9, padding: 10, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  {decidingId === row.countId ? "Saving…" : "Approve"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => setShowLog(s => !s)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", padding: "4px 2px 8px", cursor: "pointer" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Recent Activity</span>
        <span style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>{showLog ? "Hide" : "Show"}</span>
      </button>
      {showLog && (
        auditLog.length === 0 ? (
          <p style={{ fontSize: 12, color: C.textMuted, padding: "8px 2px" }}>Nothing logged yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {auditLog.map(e => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: C.cardAlt, borderRadius: 9 }}>
                <Badge color={C[EVENT_COLORS[e.eventType]] || C.textMuted}>{EVENT_LABELS[e.eventType] || e.eventType}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 11.5, color: C.navy, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.areaName}</p>
                  {e.note && <p style={{ margin: "1px 0 0", fontSize: 10.5, color: C.textMuted, fontStyle: "italic" }}>"{e.note}"</p>}
                </div>
                <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>{new Date(e.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )
      )}

      {rejecting && (
        <Modal title={`Reject: ${rejecting.areaName}`} onClose={() => { setRejecting(null); setRejectReason(""); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>This sends the count back rather than finalizing it. A reason is required so the counter knows what to fix.</p>
            <FInput label="Reason" value={rejectReason} onChange={setRejectReason} placeholder="e.g. missing the top shelf, please recount" />
            <PrimaryBtn onClick={submitReject} disabled={!rejectReason.trim() || decidingId === rejecting.countId}>{decidingId === rejecting.countId ? "Saving…" : "Reject Count"}</PrimaryBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── SCREEN: Team (manager-only member management)
// ─── SCREEN: Team (manager-only member management) ───────────────────────────
const TeamSection = () => {
  const [members, setMembers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("counter");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [codeRole, setCodeRole] = useState("counter");
  const [makingCode, setMakingCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(null); // { code, role, expiresAt }
  const [busyUserId, setBusyUserId] = useState(null);

  const load = () => {
    setLoading(true); setError("");
    fetchOrgMembers().then(setMembers).catch(e => setError(e.message || "Could not load team")).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const doInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true); setInviteMsg("");
    try {
      await inviteMemberByEmail(inviteEmail.trim(), inviteRole);
      setInviteMsg(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      load();
    } catch (e) { setInviteMsg(e.message || "Could not send invite"); }
    finally { setInviting(false); }
  };

  const doCreateCode = async () => {
    setMakingCode(true); setGeneratedCode(null);
    try { setGeneratedCode(await createJoinCode(codeRole, 24 * 7)); }
    catch (e) { setInviteMsg(e.message || "Could not create join code"); }
    finally { setMakingCode(false); }
  };

  const doUpdateRole = async (userId, role) => {
    setBusyUserId(userId);
    try { await updateMemberRole(userId, role); load(); }
    catch (e) { setError(e.message || "Could not update role"); }
    finally { setBusyUserId(null); }
  };

  const doRemove = async (userId) => {
    setBusyUserId(userId);
    try { await removeMember(userId); load(); }
    catch (e) { setError(e.message || "Could not remove member"); }
    finally { setBusyUserId(null); }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Team</p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: C.text }}>Invite by email</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="name@company.com" style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.borderDark}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
          <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ background: C.cardAlt, border: `1px solid ${C.borderDark}`, borderRadius: 8, padding: "9px 10px", fontSize: 12, fontWeight: 700 }}>
            <option value="counter">Counter</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <PrimaryBtn onClick={doInvite} disabled={inviting || !inviteEmail.trim()} style={{ padding: 10, fontSize: 13 }}>{inviting ? "Sending…" : "Send Invite"}</PrimaryBtn>
        {inviteMsg && <p style={{ margin: "8px 0 0", fontSize: 12, color: C.textSub }}>{inviteMsg}</p>}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: C.text }}>Or share a join code</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <select value={codeRole} onChange={e => setCodeRole(e.target.value)} style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.borderDark}`, borderRadius: 8, padding: "9px 10px", fontSize: 12, fontWeight: 700 }}>
            <option value="counter">Counter</option>
            <option value="manager">Manager</option>
          </select>
          <button onClick={doCreateCode} disabled={makingCode} style={{ background: C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 8, padding: "9px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{makingCode ? "…" : "Generate Code"}</button>
        </div>
        {generatedCode && (
          <div style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.navy, letterSpacing: "0.1em" }}>{generatedCode.code}</p>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: C.textMuted }}>{generatedCode.role} · expires {new Date(generatedCode.expiresAt).toLocaleDateString()}</p>
          </div>
        )}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
        <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: C.text }}>Members</p>
        {error && <p style={{ margin: "0 0 8px", fontSize: 12, color: C.red }}>{error}</p>}
        {loading ? (
          <p style={{ fontSize: 12, color: C.textMuted }}>Loading…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(members || []).map(m => (
              <div key={m.userId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 0", borderTop: `1px solid ${C.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</p>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                  <select value={m.role} disabled={busyUserId === m.userId} onChange={e => doUpdateRole(m.userId, e.target.value)}
                    style={{ background: C.cardAlt, border: `1px solid ${C.borderDark}`, borderRadius: 6, padding: "5px 6px", fontSize: 11, fontWeight: 700 }}>
                    <option value="counter">Counter</option>
                    <option value="manager">Manager</option>
                  </select>
                  <button onClick={() => doRemove(m.userId)} disabled={busyUserId === m.userId} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Icon name="trash" size={13} color={C.red} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── SCREEN: Settings ─────────────────────────────────────────────────────────
// Wraps the browser's native "Add to Home Screen" flow. Chrome/Edge/Android fire
// `beforeinstallprompt` and let a page trigger it programmatically; iOS Safari has no such
// event (Share -> Add to Home Screen is manual there), so this card only renders its button
// where the programmatic prompt exists and otherwise falls back to written instructions.
const InstallAppCard = () => {
  const deferredPromptRef = useRef(null);
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone);

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); deferredPromptRef.current = e; setInstallable(true); };
    const onInstalled = () => { setInstalled(true); setInstallable(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (isStandalone || installed) return null;

  const promptInstall = async () => {
    const evt = deferredPromptRef.current;
    if (!evt) return;
    evt.prompt();
    await evt.userChoice;
    deferredPromptRef.current = null;
    setInstallable(false);
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: C.goldDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="upload" size={18} color={C.gold} /></div>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.navy }}>Install InventoryIQ</p>
          <p style={{ margin: "1px 0 0", fontSize: 11, color: C.textMuted }}>Faster launch, full-screen, works offline</p>
        </div>
      </div>
      {installable ? (
        <button onClick={promptInstall} style={{ width: "100%", background: C.navy, border: "none", color: "#fff", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Add to Home Screen</button>
      ) : isIOS ? (
        <p style={{ margin: 0, fontSize: 11.5, color: C.textSub, lineHeight: 1.6 }}>On iPhone/iPad: tap the Share icon in Safari, then "Add to Home Screen".</p>
      ) : (
        <p style={{ margin: 0, fontSize: 11.5, color: C.textSub, lineHeight: 1.6 }}>Open the browser menu and look for "Install app" or "Add to Home Screen".</p>
      )}
    </div>
  );
};

const SettingsScreen = ({ settings, setSettings, auth, onSignOut }) => {
  const [newUnit, setNewUnit] = useState("");
  const [newVendor, setNewVendor] = useState("");
  const isManager = auth?.role === "manager";
  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));

  return (
    <div style={{ padding: "24px 16px 100px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 400, color: C.navy, margin: 0, fontFamily: "'DM Serif Display', serif" }}>Settings</h1>
      <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 20px" }}>Customize InventoryIQ to how your operation runs</p>

      <InstallAppCard />

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auth?.email}</p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: C.textMuted }}>{auth?.orgName} · {isManager ? "Manager" : "Counter"}</p>
        </div>
        <button onClick={onSignOut} style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Sign Out</button>
      </div>

      {!isManager && (
        <div style={{ padding: "10px 14px", background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 12, color: C.textSub }}>Workflow settings and team management are manager-only.</p>
        </div>
      )}

      {isManager && <TeamSection />}

      {isManager && (
        <>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Industry</p>
          <div style={{ display: "flex", background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, marginBottom: 20 }}>
            {["Foodservice","Retail"].map(ind => (
              <button key={ind} onClick={() => set("industry", ind)} style={{ flex: 1, background: settings.industry === ind ? C.navy : "transparent", border: "none", color: settings.industry === ind ? "#fff" : C.textSub, borderRadius: 9, padding: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{ind}</button>
            ))}
          </div>

          <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Workflow Rules</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            <Toggle label="Staff can add items during counts" sub="When Claude finds an unknown item, counting staff can add it to the catalog on the spot. Off = managers only." value={settings.staffCanAddItems} onChange={v => set("staffCanAddItems", v)} />
            <Toggle label="Require approval before finalizing" sub="Counts must be submitted to a manager for sign-off before they lock and feed ordering." value={settings.requireApproval} onChange={v => set("requireApproval", v)} />
            <div style={{ padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
              <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: C.text }}>Inventory attribution</p>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: C.textSub, lineHeight: 1.5 }}>How counts are attributed when items are stored across areas</p>
              <div style={{ display: "flex", background: C.cardAlt, borderRadius: 10, padding: 3 }}>
                {[["physical","Where it sits"],["department","Department owns"]].map(([k, label]) => (
                  <button key={k} onClick={() => set("attributionRule", k)} style={{ flex: 1, background: settings.attributionRule === k ? C.gold : "transparent", border: "none", color: settings.attributionRule === k ? C.navy : C.textSub, borderRadius: 8, padding: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.text }}>AI confidence threshold</p>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.gold }}>{Math.round(settings.confidenceThreshold * 100)}%</span>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: C.textSub, lineHeight: 1.5 }}>Items below this confidence are flagged for manual verification</p>
              <input type="range" min="0.5" max="0.95" step="0.05" value={settings.confidenceThreshold} onChange={e => set("confidenceThreshold", parseFloat(e.target.value))} style={{ width: "100%", accentColor: C.gold }} />
            </div>
          </div>

          <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Units of Measure</p>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {settings.units.map(u => (
                <span key={u} onClick={() => set("units", settings.units.filter(x => x !== u))} style={{ fontSize: 12, fontWeight: 600, color: C.navy, background: C.goldDim, border: `1px solid ${C.goldBorder}`, borderRadius: 20, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>{u} <Icon name="close" size={9} color={C.gold} /></span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={newUnit} onChange={e => setNewUnit(e.target.value)} onKeyDown={e => e.key === "Enter" && newUnit.trim() && (set("units", [...settings.units, newUnit.trim()]), setNewUnit(""))} placeholder="Add unit…" style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.borderDark}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
              <button onClick={() => { if (newUnit.trim()) { set("units", [...settings.units, newUnit.trim()]); setNewUnit(""); } }} style={{ background: C.navy, border: "none", color: C.gold, borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: "pointer" }}>Add</button>
            </div>
          </div>

          <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Vendors</p>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {settings.vendors.map(v => (
                <span key={v} onClick={() => set("vendors", settings.vendors.filter(x => x !== v))} style={{ fontSize: 12, fontWeight: 600, color: C.navy, background: C.goldDim, border: `1px solid ${C.goldBorder}`, borderRadius: 20, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>{v} <Icon name="close" size={9} color={C.gold} /></span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={newVendor} onChange={e => setNewVendor(e.target.value)} onKeyDown={e => e.key === "Enter" && newVendor.trim() && (set("vendors", [...settings.vendors, newVendor.trim()]), setNewVendor(""))} placeholder="Add vendor…" style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.borderDark}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
              <button onClick={() => { if (newVendor.trim()) { set("vendors", [...settings.vendors, newVendor.trim()]); setNewVendor(""); } }} style={{ background: C.navy, border: "none", color: C.gold, borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: "pointer" }}>Add</button>
            </div>
          </div>
        </>
      )}
      <p style={{ fontSize: 10, color: C.textMuted, textAlign: "center", marginTop: 24 }}>InventoryIQ · part of the FoodSafeIQ family</p>
    </div>
  );
};

// ─── App shell ────────────────────────────────────────────────────────────────
const NAV = [
  { key: "dashboard", label: "Home",    icon: "dashboard" },
  { key: "sites",     label: "Sites",   icon: "location" },
  { key: "capture",   label: "Capture", icon: "camera" },
  { key: "catalog",   label: "Catalog", icon: "pkg" },
  { key: "settings",  label: "Settings",icon: "gear" },
];

const GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&display=swap');
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
  html { -webkit-overflow-scrolling: touch; }
  body { background: ${C.bg}; font-family: 'DM Sans', sans-serif; overscroll-behavior-y: none; }
  button, select, input { font-family: 'DM Sans', sans-serif; }
  ::-webkit-scrollbar { display: none; }
  button { transition: transform 120ms ${EASE}, opacity 120ms ${EASE}; }
  button:active { transform: scale(0.96); opacity: 0.92; }
  button:disabled:active { transform: none; opacity: 1; }
  [data-tap]:active { transform: scale(0.98); opacity: 0.94; }
  [data-tap] { transition: transform 120ms ${EASE}, opacity 120ms ${EASE}; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes iiqScreenIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes iiqSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes iiqBackdropIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes iiqPopIn { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
`;

const LoadingSplash = ({ label }) => (
  <>
    <style>{GLOBAL_STYLE}</style>
    <div style={{ minHeight: "100vh", background: C.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, fontFamily: "'DM Sans', sans-serif" }}>
      <BrandMark size={48} />
      <div style={{ width: 28, height: 28, border: `3px solid ${C.gold}33`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "#ffffffaa", fontSize: 13 }}>{label}</p>
    </div>
  </>
);

const authInputStyle = { width: "100%", background: "#ffffff12", border: "1px solid #ffffff33", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", fontFamily: "'DM Sans', sans-serif" };

// ─── SCREEN: Sign in / sign up ────────────────────────────────────────────────
// Deliberately simple, per product decision: Supabase Auth handles identity, and every
// account either signs in to an existing organization or signs up and then redeems an
// invite/join code (see JoinOrgScreen) -- there's no separate "create a new organization"
// self-serve flow. onAuthStateChange in the App root below picks up the resulting session
// automatically, so this component doesn't need to manage that transition itself.
const AuthScreen = () => {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const submit = async () => {
    setError(""); setBusy(true);
    try {
      const sb = getSupabaseBrowserClient();
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) { setConfirmSent(true); } // email confirmation required before session exists
      }
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (confirmSent) {
    return (
      <>
        <style>{GLOBAL_STYLE}</style>
        <div style={{ minHeight: "100vh", background: C.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center" }}>
          <BrandMark size={44} />
          <p style={{ color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "'DM Serif Display', serif" }}>Check your email</p>
          <p style={{ color: "#ffffffaa", fontSize: 13, maxWidth: 280, lineHeight: 1.6 }}>We sent a confirmation link to {email}. Click it, then come back here and sign in.</p>
          <button onClick={() => { setConfirmSent(false); setMode("signin"); }} style={{ background: "none", border: "none", color: C.gold, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Back to sign in</button>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{GLOBAL_STYLE}</style>
      <div style={{ minHeight: "100vh", background: C.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <BrandMark size={48} />
        <h1 style={{ margin: "14px 0 2px", fontSize: 26, fontWeight: 400, color: "#fff", fontFamily: "'DM Serif Display', serif" }}>Inventory<span style={{ color: C.gold }}>IQ</span></h1>
        <p style={{ color: "#ffffffaa", fontSize: 12, marginBottom: 28 }}>{mode === "signin" ? "Sign in to your organization" : "Create your account"}</p>
        <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
          <input type="email" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={authInputStyle} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" onKeyDown={e => e.key === "Enter" && submit()} style={authInputStyle} />
          {error && <p style={{ color: "#ff8a80", fontSize: 12, margin: 0 }}>{error}</p>}
          <GoldBtn onClick={submit} disabled={busy || !email.trim() || !password}>{busy ? "…" : mode === "signin" ? "Sign In" : "Create Account"}</GoldBtn>
          <button onClick={() => { setMode(m => m === "signin" ? "signup" : "signin"); setError(""); }} style={{ background: "none", border: "none", color: "#ffffffaa", fontSize: 12, cursor: "pointer", marginTop: 4 }}>
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </>
  );
};

// ─── SCREEN: Redeem an invite/join code (shown once signed in but not yet in an org) ──
const JoinOrgScreen = ({ email, onJoined, onSignOut }) => {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim()) return;
    setError(""); setBusy(true);
    try {
      await redeemJoinCode(code.trim());
      onJoined();
    } catch (e) {
      setError(e.message || "Could not join that organization");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{GLOBAL_STYLE}</style>
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <BrandMark size={44} />
        <p style={{ color: C.navy, fontWeight: 700, fontSize: 17, margin: "14px 0 4px", fontFamily: "'DM Serif Display', serif" }}>One more step</p>
        <p style={{ color: C.textSub, fontSize: 13, textAlign: "center", maxWidth: 300, marginBottom: 20, lineHeight: 1.6 }}>
          Signed in as {email}. Enter the join code a manager shared with you to get into their organization.
        </p>
        <div style={{ width: "100%", maxWidth: 300, display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && submit()} placeholder="JOIN CODE"
            style={{ width: "100%", background: C.card, border: `1px solid ${C.borderDark}`, borderRadius: 10, padding: "12px 14px", color: C.text, fontSize: 16, fontWeight: 700, letterSpacing: "0.1em", textAlign: "center", outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
          {error && <p style={{ color: C.red, fontSize: 12, margin: 0, textAlign: "center" }}>{error}</p>}
          <PrimaryBtn onClick={submit} disabled={busy || !code.trim()}>{busy ? "Joining…" : "Join Organization"}</PrimaryBtn>
          <button onClick={onSignOut} style={{ background: "none", border: "none", color: C.textSub, fontSize: 12, cursor: "pointer" }}>Sign out</button>
        </div>
      </div>
    </>
  );
};

// ─── Offline queue sync ───────────────────────────────────────────────────────
// Replays a queued offline capture using the exact same backend calls the live capture flow
// uses (startCountSession, saveStagesToBackend, uploadPhotoToStorage, analysePhotosViaBackend)
// -- this is not a separate sync path, just the same one driven from stored blobs instead of
// a live file input. Stops and leaves the entry queued on the first failure (network blip,
// still offline, etc.) rather than partially syncing -- it'll cleanly retry whole on the next
// online event. Returns the finished result (for the "ready for review" list) or null if it
// couldn't be synced yet.
async function flushOneQueuedCapture(entry, items, assignments, locations) {
  const loc = locations.find(l => l.id === entry.locationId);
  const areaItems = assignments
    .filter(a => a.locationId === entry.locationId && a.areaId === entry.areaId)
    .map(a => { const it = items.find(i => i.id === a.itemId); return it ? { ...it, par: a.par } : null; })
    .filter(Boolean);

  const started = await startCountSession(entry.areaId);
  const cid = started.countId;

  try {
    await saveStagesToBackend(entry.areaId, entry.stages.map((s, i) => ({ id: s.id, name: s.name, sortOrder: i })));
  } catch { /* non-fatal -- stage names just won't persist for next time */ }

  const stageResultsList = await runWithConcurrency(entry.stages, 3, async (s) => {
    const storagePaths = [];
    for (const img of s.images) {
      const path = await uploadPhotoToStorage({ areaId: entry.areaId, stageId: s.id, countId: cid, blob: img.blob, mediaType: img.mediaType });
      storagePaths.push(path);
    }
    if (storagePaths.length === 0) return [];
    const backendResults = await analysePhotosViaBackend({ storagePaths, areaId: entry.areaId, countId: cid, stageId: s.id, stageName: s.name });
    const adapted = adaptAnalysisResults(backendResults, areaItems);
    adapted.forEach(r => { r.stageId = s.id; r.stageName = s.name; });
    return adapted;
  });

  const allResults = stageResultsList.flat();
  const finalResults = mergeAndReconcileStageResults(allResults, areaItems);
  const mergedResults = mergeScannedIntoResults(finalResults, entry.scannedItems || []);
  const photoCount = entry.stages.reduce((s, st) => s + st.images.length, 0);

  return {
    id: entry.id,
    results: mergedResults,
    meta: { location: loc?.name || entry.locationName, locationId: entry.locationId, area: entry.areaName, areaId: entry.areaId, photoCount, stageCount: entry.stages.length, countId: cid },
  };
}

async function flushOfflineQueue(items, assignments, locations) {
  const queued = (await listQueuedCaptures()).filter(c => c.status === "pending" || c.status === "syncing");
  const readyEntries = [];
  for (const entry of queued) {
    try {
      await updateQueuedCapture(entry.id, { status: "syncing" });
      const ready = await flushOneQueuedCapture(entry, items, assignments, locations);
      await removeQueuedCapture(entry.id);
      readyEntries.push(ready);
    } catch (e) {
      await updateQueuedCapture(entry.id, { status: "pending", error: e.message });
      break; // stop on first failure so a flaky connection doesn't process the queue out of order
    }
  }
  return readyEntries;
}

const AppShell = ({ auth, onSignOut }) => {
  const [screen, setScreen] = useState("dashboard");
  // Set when a specific area is chosen from outside Capture itself (e.g. tapping a
  // "Due Today" card on the Dashboard) so CaptureScreen opens straight into that area
  // instead of always defaulting to the first location's first area. Cleared once
  // CaptureScreen has consumed it, so a later plain "Start Count" / bottom-nav tap
  // into Capture goes back to normal default behavior.
  const [pendingArea, setPendingArea] = useState(null); // {locationId, areaId} | null
  const goToArea = (locationId, areaId) => { setPendingArea({ locationId, areaId }); setScreen("capture"); };
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [locations, setLocations] = useState([]);
  const [items, setItems] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [stages, setStages] = useState([]);
  const [recentCounts, setRecentCounts] = useState([]);
  const [countItems, setCountItems] = useState([]);
  const [countMeta, setCountMeta] = useState(null);
  const [catalogState, setCatalogState] = useState("loading"); // loading | ready | error
  const [catalogError, setCatalogError] = useState("");

  // ── Connectivity + offline capture queue ──────────────────────────────────
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [queuePending, setQueuePending] = useState(0);
  const [readyForReview, setReadyForReview] = useState(() => {
    try { return JSON.parse(localStorage.getItem("inventoryiq_ready_for_review") || "[]"); } catch { return []; }
  });

  const refreshQueuePending = () => { pendingCount().then(setQueuePending).catch(() => {}); };

  const saveReadyForReview = (next) => {
    setReadyForReview(next);
    // Only the JSON-safe parts persist (results/meta) -- photo blobs are gone by this point
    // anyway, everything left is plain data, safe for localStorage.
    try { localStorage.setItem("inventoryiq_ready_for_review", JSON.stringify(next)); } catch {}
  };

  const runFlush = () => {
    flushOfflineQueue(dataRef.current.items, dataRef.current.assignments, dataRef.current.locations)
      .then(newlyReady => {
        refreshQueuePending();
        if (newlyReady.length) saveReadyForReview([...dataRef.current.readyForReview, ...newlyReady]);
      })
      .catch(() => {}); // best-effort -- entries stay queued and retry on the next online event
  };

  // The online-event listener below is registered once on mount, so it would otherwise close
  // over stale (initial, empty) items/assignments/locations/readyForReview -- this ref keeps
  // it reading the current values without re-registering the listener on every render.
  const dataRef = useRef({ items, assignments, locations, readyForReview });
  useEffect(() => { dataRef.current = { items, assignments, locations, readyForReview }; });

  useEffect(() => {
    const goOnline = () => { setIsOnline(true); runFlush(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    refreshQueuePending();
    if (navigator.onLine) runFlush(); // catch anything left queued from a prior session
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openReadyForReview = (entry) => {
    setCountItems(entry.results);
    setCountMeta(entry.meta);
    saveReadyForReview(readyForReview.filter(e => e.id !== entry.id));
    setScreen("review");
  };

  const fetchCatalog = () => {
    setCatalogState("loading");
    return loadCatalog()
      .then(({ locations, items, assignments, stages, recentCounts }) => {
        setLocations(locations); setItems(items); setAssignments(assignments); setStages(stages); setRecentCounts(recentCounts || []);
        setCatalogState("ready");
      })
      .catch(e => { setCatalogError(e.message || "Could not load catalog"); setCatalogState("error"); });
  };

  useEffect(() => { fetchCatalog(); }, []);

  if (catalogState === "loading") return <LoadingSplash label="Loading your catalog…" />;

  if (catalogState === "error") {
    return (
      <>
        <style>{GLOBAL_STYLE}</style>
        <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
          <BrandMark size={44} />
          <p style={{ color: C.navy, fontWeight: 700, fontSize: 16 }}>Couldn't load your catalog</p>
          <p style={{ color: C.textSub, fontSize: 13, maxWidth: 300 }}>{catalogError}</p>
          <button onClick={fetchCatalog} style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 9, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>Retry</button>
        </div>
      </>
    );
  }

  const screens = {
    dashboard: <Dashboard locations={locations} navigate={(s) => { setPendingArea(null); setScreen(s); }} onSelectArea={goToArea} recentCounts={recentCounts} isOnline={isOnline} queuePending={queuePending} readyForReview={readyForReview} onOpenReady={openReadyForReview} />,
    sites:     <SitesScreen locations={locations} setLocations={setLocations} settings={settings} role={auth.role} refreshCatalog={fetchCatalog} />,
    catalog:   <CatalogScreen items={items} setItems={setItems} assignments={assignments} setAssignments={setAssignments} locations={locations} settings={settings} setSettings={setSettings} role={auth.role} navigate={setScreen} />,
    capture:   <CaptureScreen locations={locations} items={items} assignments={assignments} stages={stages} setStages={setStages} settings={settings} navigate={setScreen} onComplete={(r, m) => { setCountItems(r); setCountMeta(m); }} isOnline={isOnline} onQueued={refreshQueuePending} presetLocationId={pendingArea?.locationId} presetAreaId={pendingArea?.areaId} onPresetConsumed={() => setPendingArea(null)} />,
    review:    <ReviewScreen navigate={setScreen} countItems={countItems} setCountItems={setCountItems} countMeta={countMeta} settings={settings} items={items} setItems={setItems} assignments={assignments} setAssignments={setAssignments} />,
    orders:    <OrdersScreen countItems={countItems} items={items} assignments={assignments} locations={locations} role={auth.role} settings={settings} setSettings={setSettings} />,
    approvals: <ApprovalsScreen />,
    settings:  <SettingsScreen settings={settings} setSettings={setSettings} auth={auth} onSignOut={onSignOut} />,
  };

  const activeNavIndex = NAV.findIndex(n =>
    screen === n.key || (n.key === "capture" && screen === "review") || (n.key === "catalog" && screen === "orders")
  );

  return (
    <>
      <style>{GLOBAL_STYLE}</style>
      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: C.bg }}>
        <div key={screen} style={{ overflowY: "auto", height: "100vh", paddingBottom: 80, animation: `iiqScreenIn 260ms ${EASE}` }}>{screens[screen]}</div>
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: C.navy, display: "flex", padding: "10px 0 22px", zIndex: 100, boxShadow: "0 -2px 12px rgba(13,27,42,0.15)" }}>
          {activeNavIndex >= 0 && (
            <div style={{
              position: "absolute", top: 0, height: 2.5, width: `${100 / NAV.length}%`,
              left: `${(100 / NAV.length) * activeNavIndex}%`,
              transition: `left 280ms ${EASE}`,
              display: "flex", justifyContent: "center",
            }}>
              <div style={{ width: 28, height: 2.5, background: C.gold, borderRadius: "0 0 3px 3px" }} />
            </div>
          )}
          {NAV.map((n, i) => {
            const active = i === activeNavIndex;
            return (
              <button key={n.key} onClick={() => { setPendingArea(null); setScreen(n.key); }} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "6px 0", position: "relative" }}>
                <Icon name={n.icon} size={22} color={active ? C.gold : "#ffffff77"} />
                <span style={{ fontSize: 10, fontWeight: 700, color: active ? C.gold : "#ffffff77", letterSpacing: "0.04em" }}>{n.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

// ─── App root: auth gate ──────────────────────────────────────────────────────
// Nothing in AppShell renders until there's both a live Supabase Auth session AND
// confirmed organization membership -- "full auth gate on everything", per product
// decision, rather than rolling this out screen-by-screen.
export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | signedOut | needsOrg | ready
  const [me, setMe] = useState(null); // { userId, email, orgId, orgName, role }

  const refreshWhoAmI = () => {
    fetchWhoAmI()
      .then(m => { setMe(m); setPhase(m.orgId ? "ready" : "needsOrg"); })
      .catch(() => setPhase("signedOut"));
  };

  useEffect(() => {
    const sb = getSupabaseBrowserClient();
    let cancelled = false;

    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) refreshWhoAmI(); else setPhase("signedOut");
    });

    // Covers sign-in, sign-out, and token refresh from anywhere (including the AuthScreen
    // and JoinOrgScreen components below, which don't call back into this component directly).
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (session) refreshWhoAmI(); else { setMe(null); setPhase("signedOut"); }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  if (phase === "loading") return <LoadingSplash label="Signing you in…" />;
  if (phase === "signedOut") return <AuthScreen />;
  if (phase === "needsOrg") return <JoinOrgScreen email={me?.email} onJoined={refreshWhoAmI} onSignOut={() => getSupabaseBrowserClient().auth.signOut()} />;

  return <AppShell auth={me} onSignOut={() => getSupabaseBrowserClient().auth.signOut()} />;
}
