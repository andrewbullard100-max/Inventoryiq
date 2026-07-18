import { useState, useRef, useEffect } from "react";

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

// ─── Backend proxy: Claude Vision photo analysis (area-scoped) ──────────────
// Calls YOUR backend (/api/analyze-photos), never Anthropic directly -- the
// backend holds the item list for this area itself, keyed by areaId.
async function analysePhotosViaBackend(images, areaId) {
  const imagePayload = images.map(img => {
    const [header, data] = img.src.split(",");
    return { mediaType: header.match(/data:(.*);base64/)?.[1] || "image/jpeg", data };
  });

  const res = await fetch("/api/analyze-photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ areaId, images: imagePayload }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Analysis failed (${res.status})`);
  }
  return res.json(); // { areaId, results: [{itemId,name,aiCount,confidence,matchStatus}], unrecognizedItems, model }
}

// Adapts the backend's response into the count-sheet row shape the Review
// screen already expects, filling in sku/size/unit/price/par from the area's
// already-loaded item list (the backend only returns id/count/confidence).
function adaptAnalysisResults(backendResults, areaItems) {
  const byId = new Map(areaItems.map(i => [i.id, i]));
  return backendResults.results.map(r => {
    const it = byId.get(r.itemId);
    return {
      key: uid("ci"), itemId: r.itemId, sku: it?.sku || r.itemId, name: r.name || it?.name || "Unknown item",
      size: it?.size || "", aiCount: Math.max(0, Math.round(r.aiCount || 0)),
      par: it?.par ?? null, confidence: Math.min(1, Math.max(0, r.confidence || 0)),
      unit: it?.unit || "units", price: it?.price || 0,
      notes: "", matchStatus: r.matchStatus || "unknown",
      override: null, confirmed: false,
    };
  });
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

  const res = await fetch("/api/parse-invoice", {
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
  const res = await fetch("/api/catalog");
  if (!res.ok) throw new Error(`Failed to load catalog (${res.status})`);
  const { locations: rawLocations, areas: rawAreas, items: rawItems, assignments: rawAssignments, stages: rawStages } = await res.json();

  const areasByLocation = {};
  for (const a of rawAreas) (areasByLocation[a.location_id] ||= []).push({ id: a.id, name: a.name });

  const locations = rawLocations.map(l => ({
    id: l.id, name: l.name, type: "Foodservice",
    areas: (areasByLocation[l.id] || []).sort((a, b) => a.name.localeCompare(b.name)),
  }));

  const items = rawItems.map(i => ({
    id: i.id, sku: i.vendor_item_code || i.id, name: i.name, size: i.pack_size || "",
    unit: i.order_uom || "units", vendor: i.vendor || "", price: i.unit_price || 0,
    aliases: Array.isArray(i.aliases) ? i.aliases.join(",") : "",
    referenceImageUrl: i.reference_image_url || null,
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

  return { locations, items, assignments, stages };
}

// ─── Backend proxy: persist named stages for an area (persists across sessions) ─
async function saveStagesToBackend(areaId, stagesToSave) {
  const res = await fetch("/api/upsert-stages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ areaId, stages: stagesToSave.map(s => ({ id: s.id, name: s.name, sortOrder: s.sortOrder })) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Saving stages failed (${res.status})`);
  }
  return res.json(); // { stages: [{id, area_id, name, sort_order}] }
}

async function removeStageFromBackend(stageId) {
  const res = await fetch("/api/upsert-stages", {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: stageId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Removing stage failed (${res.status})`);
  }
  return res.json();
}

// ─── Backend proxy: reference photos for hard-to-identify items ─────────────
async function saveReferenceImage(itemId, mediaType, data) {
  const res = await fetch("/api/upload-reference-image", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, mediaType, data }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Uploading reference photo failed (${res.status})`);
  }
  return res.json(); // { url }
}

async function fetchFlaggedItems() {
  const res = await fetch("/api/flagged-items");
  if (!res.ok) throw new Error(`Failed to load flagged items (${res.status})`);
  const { items } = await res.json();
  return items;
}

// ─── Backend proxy: persist item master changes ──────────────────────────────
// Invoice import, manual add/edit, and "+Add to Catalog" all funnel through
// here so the item master actually grows in Supabase, not just in memory.
async function saveItemsToBackend(itemsToSave) {
  const res = await fetch("/api/upsert-items", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: itemsToSave }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Saving items failed (${res.status})`);
  }
  return res.json(); // { items: [{id, name}] }
}

// ─── Backend proxy: persist area assignment changes (add/update par, remove) ─
async function saveAssignmentToBackend(itemId, areaId, parLevel) {
  const res = await fetch("/api/upsert-assignments", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignments: [{ itemId, areaId, parLevel }] }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Saving assignment failed (${res.status})`);
  }
  return res.json();
}

async function removeAssignmentFromBackend(itemId, areaId) {
  const res = await fetch("/api/upsert-assignments", {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, areaId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Removing assignment failed (${res.status})`);
  }
  return res.json();
}

// ─── Backend proxy: finalize a count session (this is what actually saves it) ─
async function finalizeCountToBackend(areaId, requireApproval, items) {
  const res = await fetch("/api/finalize-count", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      areaId, requireApproval,
      items: items.map(i => ({ itemId: i.itemId || i.sku, aiCount: i.aiCount, confidence: i.confidence, matchStatus: i.matchStatus, override: i.override, stageId: i.stageId, stageName: i.stageName })),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Finalizing count failed (${res.status})`);
  }
  return res.json(); // { countId, status, itemCount }
}

// ─── Backend proxy: last finalized count for an area (starting reference) ────
async function fetchLastCount(areaId) {
  const res = await fetch(`/api/last-count?areaId=${encodeURIComponent(areaId)}`);
  if (!res.ok) return null;
  const { lastCount } = await res.json();
  return lastCount;
}

// ─── SCREEN: Dashboard ────────────────────────────────────────────────────────
const Dashboard = ({ locations, items, assignments, navigate }) => {
  const areaCount = locations.reduce((s, l) => s + l.areas.length, 0);
  return (
    <div style={{ paddingBottom: 20 }}>
      {/* Brand header */}
      <div style={{ padding: "28px 20px 22px", background: C.navy }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BrandMark size={38} />
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 400, color: "#fff", fontFamily: "'DM Serif Display', serif", letterSpacing: "-0.01em" }}>
              Inventory<span style={{ color: C.gold }}>IQ</span>
            </h1>
            <p style={{ margin: "1px 0 0", fontSize: 11, color: C.goldLight, letterSpacing: "0.06em" }}>Visual counts. Smarter inventory.</p>
          </div>
        </div>
        <div style={{ marginTop: 16, padding: "10px 14px", background: "#ffffff12", border: `1px solid ${C.gold}55`, borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="ai" size={15} color={C.gold} />
          <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>Claude Vision ready — photograph any area to count</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: "18px 16px 8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { label: "Locations", value: locations.length, icon: "location" },
          { label: "Storage Areas", value: areaCount, icon: "dashboard" },
          { label: "Master Items", value: items.length, icon: "pkg" },
          { label: "Area Assignments", value: assignments.length, icon: "list" },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.label}</span>
              <Icon name={s.icon} size={15} color={C.gold} />
            </div>
            <div style={{ fontSize: 30, fontWeight: 400, color: C.navy, fontFamily: "'DM Serif Display', serif", lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ padding: "12px 16px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Quick Actions</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "Start Count", icon: "camera", screen: "capture", featured: true },
            { label: "Item Catalog", icon: "pkg", screen: "catalog" },
            { label: "Purchase Orders", icon: "order", screen: "orders" },
            { label: "Sites & Areas", icon: "location", screen: "sites" },
          ].map(a => (
            <button key={a.label} onClick={() => navigate(a.screen)} style={{ background: a.featured ? C.navy : C.card, border: `1px solid ${a.featured ? C.navy : C.border}`, borderRadius: 14, padding: "16px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left", boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: a.featured ? C.gold : C.goldDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={a.icon} size={19} color={a.featured ? C.navy : C.gold} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: a.featured ? "#fff" : C.navy, lineHeight: 1.3 }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sites overview */}
      <div style={{ padding: "8px 16px 0" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Your Sites</p>
        {locations.map(loc => (
          <div key={loc.id} onClick={() => navigate("capture")} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.navy }}>{loc.name}</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: C.textMuted }}>{loc.areas.length} areas · {loc.type}</p>
            </div>
            <Icon name="arrow" size={15} color={C.gold} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── SCREEN: Sites & Areas (fully user-customized) ───────────────────────────
const SitesScreen = ({ locations, setLocations, settings }) => {
  const [modal, setModal] = useState(null); // null | "add" | loc
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ name: "", type: "Restaurant", areas: [] });
  const [areaInput, setAreaInput] = useState("");

  const suggestions = AREA_SUGGESTIONS[settings.industry] || AREA_SUGGESTIONS.Foodservice;
  const openAdd = () => { setForm({ name: "", type: settings.industry === "Retail" ? "Store" : "Restaurant", areas: [] }); setModal("add"); };
  const openEdit = (loc) => { setForm({ name: loc.name, type: loc.type, areas: loc.areas.map(a => ({ ...a })) }); setModal(loc); };
  const addArea = (n) => { const nm = n.trim(); if (nm && !form.areas.some(a => a.name === nm)) setForm(f => ({ ...f, areas: [...f.areas, { id: uid("ar"), name: nm }] })); setAreaInput(""); };
  const remArea = (id) => setForm(f => ({ ...f, areas: f.areas.filter(a => a.id !== id) }));

  const save = () => {
    if (!form.name.trim()) return;
    if (modal === "add") setLocations(prev => [...prev, { id: uid("loc"), ...form }]);
    else setLocations(prev => prev.map(l => l.id === modal.id ? { ...l, ...form } : l));
    setModal(null);
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
        <button onClick={openAdd} style={{ background: C.navy, border: "none", color: "#fff", borderRadius: 12, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="plus" size={16} color={C.gold} />Add Site
        </button>
      </div>

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
                  <span key={a.id} style={{ fontSize: 11, fontWeight: 600, color: C.navy, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 20, padding: "4px 10px" }}>{a.name}</span>
                ))}
                {loc.areas.length === 0 && <span style={{ fontSize: 11, color: C.textMuted }}>No areas defined</span>}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => openEdit(loc)} style={{ background: C.cardAlt, border: `1px solid ${C.border}`, color: C.textSub, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}><Icon name="edit" size={13} color={C.textSub} />Edit</button>
              <button onClick={() => setConfirm(loc.id)} style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}><Icon name="trash" size={13} color={C.red} />Delete</button>
            </div>
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 32, marginBottom: 10 }}>
                {form.areas.length === 0 && <span style={{ fontSize: 12, color: C.textMuted, padding: "4px 0" }}>Tap a suggestion or type your own</span>}
                {form.areas.map(a => (
                  <span key={a.id} onClick={() => remArea(a.id)} style={{ fontSize: 12, fontWeight: 600, color: C.navy, background: C.goldDim, border: `1px solid ${C.goldBorder}`, borderRadius: 20, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>{a.name} <Icon name="close" size={10} color={C.gold} /></span>
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
            <PrimaryBtn onClick={save} disabled={!form.name.trim()}>{modal === "add" ? "Create Site" : "Save Changes"}</PrimaryBtn>
          </div>
        </Modal>
      )}

      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "#0d1b2a99", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: `iiqBackdropIn 200ms ${EASE}` }}>
          <div style={{ background: C.card, borderRadius: 18, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 8px 40px rgba(13,27,42,0.3)", animation: `iiqPopIn 220ms ${EASE}` }}>
            <h3 style={{ fontSize: 18, fontWeight: 400, color: C.navy, textAlign: "center", margin: "0 0 8px", fontFamily: "'DM Serif Display', serif" }}>Delete this site?</h3>
            <p style={{ fontSize: 13, color: C.textSub, textAlign: "center", margin: "0 0 20px", lineHeight: 1.6 }}>Its areas and item assignments will be removed. The global item catalog is not affected.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.border}`, color: C.textSub, borderRadius: 12, padding: 14, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => { setLocations(prev => prev.filter(l => l.id !== confirm)); setConfirm(null); }} style={{ flex: 1, background: C.red, border: "none", color: "#fff", borderRadius: 12, padding: 14, fontWeight: 800, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SCREEN: Catalog (global master + per-area assignments) ──────────────────
const CatalogScreen = ({ items, setItems, assignments, setAssignments, locations, settings, setSettings }) => {
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
  const refFileRef = useRef(null);
  const [uploadingFor, setUploadingFor] = useState(null);

  const loadFlagged = () => {
    setFlaggedLoading(true); setFlaggedError("");
    fetchFlaggedItems()
      .then(setFlagged)
      .catch(e => setFlaggedError(e.message || "Could not load flagged items"))
      .finally(() => setFlaggedLoading(false));
  };

  useEffect(() => { if (tab === "flagged") loadFlagged(); }, [tab]);

  const attachReferencePhoto = (itemId, file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const [header, data] = e.target.result.split(",");
      const mediaType = header.match(/data:(.*);base64/)?.[1] || "image/jpeg";
      setUploadingFor(itemId);
      try {
        const { url } = await saveReferenceImage(itemId, mediaType, data);
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, referenceImageUrl: url } : i));
        setFlagged(prev => prev.filter(f => f.itemId !== itemId));
      } catch (err) {
        setFlaggedError(err.message || "Upload failed");
      } finally {
        setUploadingFor(null);
      }
    };
    reader.readAsDataURL(file);
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
      <h1 style={{ fontSize: 24, fontWeight: 400, color: C.navy, margin: 0, fontFamily: "'DM Serif Display', serif" }}>Item Catalog</h1>
      <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 16px" }}>One global list · assigned to areas with their own pars</p>

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
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button onClick={() => setShowInvoice(true)} style={{ flex: 2, background: C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 10, padding: "12px", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <Icon name="upload" size={16} color={C.gold} />Import Vendor Invoice
            </button>
            <button onClick={() => { setForm(blank); setModal("add"); }} style={{ flex: 1, background: C.navy, border: "none", color: "#fff", borderRadius: 10, padding: "12px", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Icon name="plus" size={15} color={C.gold} />Add
            </button>
          </div>

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
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 14px", display: "flex", gap: 8 }}>
                    <button onClick={() => { setAssignModal(item); setAssignForm({ locationId: locations[0]?.id || "", areaId: "", par: "" }); }} style={{ flex: 1, background: C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 8, padding: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Assign to Areas ({asg.length})</button>
                    <button onClick={() => { setForm({ ...item }); setModal(item); }} style={{ background: C.cardAlt, border: `1px solid ${C.border}`, color: C.textSub, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Icon name="edit" size={13} color={C.textSub} /></button>
                    <button onClick={() => setConfirm(item.id)} style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Icon name="trash" size={13} color={C.red} /></button>
                  </div>
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
                        <button onClick={() => removeAssignment(a.id, a.itemId, a.areaId)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Icon name="close" size={14} color={C.textMuted} /></button>
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
          <input ref={refFileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { const f = e.target.files[0]; if (f && refFileRef.current.dataset.forItem) attachReferencePhoto(refFileRef.current.dataset.forItem, f); e.target.value = ""; }} />

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
              {flagged.map(f => (
                <div key={f.itemId} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.navy }}>{f.name}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: C.textMuted }}>{f.brand || "No brand"} · flagged {f.occurrences}× in recent counts</p>
                  </div>
                  <button
                    onClick={() => { refFileRef.current.dataset.forItem = f.itemId; refFileRef.current.click(); }}
                    disabled={uploadingFor === f.itemId}
                    style={{ background: C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <Icon name="camera" size={14} color={C.gold} />
                    {uploadingFor === f.itemId ? "Uploading…" : "Add Photo"}
                  </button>
                </div>
              ))}
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
// Resizes + compresses a photo client-side before it's base64-encoded and
// sent to the backend. Claude Vision doesn't benefit from anything larger
// than ~1568px on the long edge, and Vercel serverless functions hard-cap
// request bodies at 4.5MB -- full-res phone photos (esp. multiple at once)
// blow past that and get rejected with a 413 before our code even runs.
function resizeImageFile(file, maxDim = 1568, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const CaptureScreen = ({ locations, items, assignments, stages, setStages, settings, navigate, onComplete }) => {
  const [locId, setLocId] = useState(locations[0]?.id || "");
  const [areaId, setAreaId] = useState("");
  const [phase, setPhase] = useState("ready");
  const [stageList, setStageList] = useState([]); // [{ id, name, images: [] }]
  const [preview, setPreview] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stageProgressLabel, setStageProgressLabel] = useState("");
  const [resultCount, setResultCount] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRefs = useRef({}); const camRefs = useRef({});
  const [lastCount, setLastCount] = useState(null);

  const loc = locations.find(l => l.id === locId) || locations[0];
  const areas = loc?.areas || [];
  const area = areas.find(a => a.id === areaId) || areas[0];
  const totalImages = stageList.reduce((s, st) => s + st.images.length, 0);
  const activeStageCount = stageList.filter(s => s.images.length > 0).length;
  const canProcess = totalImages > 0 && phase === "ready" && !!area;

  useEffect(() => {
    if (!area) { setLastCount(null); return; }
    let cancelled = false;
    fetchLastCount(area.id).then(lc => { if (!cancelled) setLastCount(lc); }).catch(() => setLastCount(null));
    return () => { cancelled = true; };
  }, [area?.id]);

  // Seed stages from what was persisted for this area last time -- names stick around session to session.
  useEffect(() => {
    if (!area) { setStageList([]); return; }
    const persisted = stages.filter(s => s.areaId === area.id).sort((a, b) => a.sortOrder - b.sortOrder);
    setStageList(persisted.length > 0
      ? persisted.map(s => ({ id: s.id, name: s.name, images: [] }))
      : [{ id: uid("stage"), name: "Stage 1", images: [] }]);
  }, [area?.id]);

  // Area-scoped reference list for Claude
  const areaItems = area ? assignments
    .filter(a => a.locationId === loc.id && a.areaId === area.id)
    .map(a => { const it = items.find(i => i.id === a.itemId); return it ? { ...it, par: a.par } : null; })
    .filter(Boolean) : [];

  const addStage = () => setStageList(prev => [...prev, { id: uid("stage"), name: `Stage ${prev.length + 1}`, images: [] }]);
  const removeStage = (stageId) => setStageList(prev => prev.length > 1 ? prev.filter(s => s.id !== stageId) : prev);
  const renameStage = (stageId, name) => setStageList(prev => prev.map(s => s.id === stageId ? { ...s, name } : s));

  const handleFiles = (stageId, files) => {
    const valid = Array.from(files).filter(f => f.type.startsWith("image/"));
    Promise.all(valid.map(async file => {
      try {
        const dataUrl = await resizeImageFile(file);
        const approxBytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
        return { id: uid("img"), src: dataUrl, name: file.name, size: (approxBytes / 1024).toFixed(0) + " KB" };
      } catch {
        return new Promise(res => {
          const r = new FileReader();
          r.onload = e => res({ id: uid("img"), src: e.target.result, name: file.name, size: (file.size / 1024).toFixed(0) + " KB" });
          r.readAsDataURL(file);
        });
      }
    })).then(imgs => setStageList(prev => prev.map(s => s.id === stageId ? { ...s, images: [...s.images, ...imgs].slice(0, 5) } : s)));
  };

  const removeImage = (stageId, imgId) => setStageList(prev => prev.map(s => s.id === stageId ? { ...s, images: s.images.filter(i => i.id !== imgId) } : s));

  const doProcess = async () => {
    setErrorMsg("");
    const activeStages = stageList.filter(s => s.images.length > 0);
    if (activeStages.length === 0) return;

    for (const s of activeStages) {
      const bytes = s.images.reduce((sum, img) => sum + Math.round((img.src.length - img.src.indexOf(",") - 1) * 0.75), 0);
      if (bytes > 4 * 1024 * 1024) {
        setErrorMsg(`Photos in "${s.name}" are too large to send together (${(bytes / 1024 / 1024).toFixed(1)}MB). Remove a photo from that stage.`);
        setPhase("error");
        return;
      }
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
      const allResults = [];
      for (let i = 0; i < activeStages.length; i++) {
        const s = activeStages[i];
        setStageProgressLabel(`Analysing "${s.name}" (${i + 1} of ${activeStages.length})…`);
        setProgress(Math.round((i / activeStages.length) * 90));
        const backendResults = await analysePhotosViaBackend(s.images, area.id);
        const adapted = adaptAnalysisResults(backendResults, areaItems);
        adapted.forEach(r => { r.stageId = s.id; r.stageName = s.name; });
        allResults.push(...adapted);
      }
      setProgress(95);

      // Merge across stages: an item seen in only one stage counts normally. An item seen in
      // multiple stages gets flagged for manual review instead of auto-summed -- it may be the
      // same physical stock double-counted, or genuinely be stored in two places.
      const byItemId = new Map();
      const finalResults = [];
      for (const r of allResults) {
        if (!r.itemId) { finalResults.push(r); continue; } // unrecognized items never dedupe
        if (!byItemId.has(r.itemId)) byItemId.set(r.itemId, []);
        byItemId.get(r.itemId).push(r);
      }
      for (const rows of byItemId.values()) {
        if (rows.length === 1) { finalResults.push(rows[0]); continue; }
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
        });
      }

      setProgress(100); setResultCount(finalResults.length);
      onComplete(finalResults, { location: loc.name, locationId: loc.id, area: area.name, areaId: area.id, photoCount: totalPhotos, stageCount: activeStages.length });
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
                        <img src={img.src} alt="" onClick={() => setPreview(img.src)} style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", border: `2px solid ${C.goldBorder}`, display: "block", cursor: "pointer" }} />
                        <button onClick={() => removeImage(s.id, img.id)} style={{ position: "absolute", top: -5, right: -5, width: 20, height: 20, borderRadius: "50%", background: C.red, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="close" size={9} color="#fff" /></button>
                        <div style={{ position: "absolute", top: 3, left: 3, width: 16, height: 16, borderRadius: "50%", background: C.navy, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 8, color: C.gold, fontWeight: 800 }}>{idx + 1}</span></div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => camRefs.current[s.id]?.click()} disabled={s.images.length >= 5} style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.borderDark}`, color: s.images.length >= 5 ? C.textMuted : C.textSub, borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 12, cursor: s.images.length >= 5 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="camera" size={15} color={s.images.length >= 5 ? C.textMuted : C.textSub} />Photo</button>
                  <button onClick={() => fileRefs.current[s.id]?.click()} disabled={s.images.length >= 5} style={{ flex: 1, background: s.images.length >= 5 ? C.border : C.goldDim, border: `1px solid ${C.goldBorder}`, color: C.navy, borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 12, cursor: s.images.length >= 5 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="upload" size={15} color={C.gold} />{s.images.length}/5</button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={addStage} style={{ width: "100%", background: C.cardAlt, border: `1px dashed ${C.borderDark}`, color: C.textSub, borderRadius: 12, padding: 12, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 18 }}>
            <Icon name="plus" size={15} color={C.textSub} />Add Stage
          </button>

          <PrimaryBtn onClick={doProcess} disabled={!canProcess}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Icon name="ai" size={20} color={canProcess ? C.gold : C.textMuted} />
              {canProcess ? `Analyse ${totalImages} Photo${totalImages !== 1 ? "s" : ""} Across ${activeStageCount} Stage${activeStageCount !== 1 ? "s" : ""}` : "Add photos to continue"}
            </span>
          </PrimaryBtn>
        </>
      )}

      {(phase === "done" || phase === "error") && (
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setStageList(prev => prev.map(s => ({ ...s, images: [] }))); setPhase("ready"); setProgress(0); }} style={{ flex: 1, background: C.card, border: `1px solid ${C.borderDark}`, color: C.textSub, borderRadius: 12, padding: 16, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Start Over</button>
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

  const list = countItems || [];
  const confirmed = list.filter(i => i.confirmed).length;
  const threshold = settings.confidenceThreshold;

  const update = (key, fn) => setCountItems(prev => prev.map(i => i.key === key ? fn(i) : i));
  const startEdit = (item) => { setEditing(item.key); setEditVal(String(item.override ?? item.aiCount)); };
  const saveEdit = (key) => { update(key, i => ({ ...i, override: parseInt(editVal) || 0, confirmed: true })); setEditing(null); };

  // Add unknown item to global master + assign to this area (respecting staffCanAddItems)
  const [reviewSaveError, setReviewSaveError] = useState("");

  const addUnknownToMaster = async (ci) => {
    const newItem = { id: uid("it"), sku: uid("NEW").toUpperCase(), name: ci.name, size: ci.size, unit: ci.unit, vendor: "", price: 0, aliases: "" };
    setItems(prev => [...prev, newItem]);
    setAssignments(prev => [...prev, { id: uid("as"), itemId: newItem.id, locationId: countMeta.locationId, areaId: countMeta.areaId, par: 0 }]);
    update(ci.key, i => ({ ...i, itemId: newItem.id, sku: newItem.sku, matchStatus: "matched", confirmed: true }));
    setAddingUnknown(null);
    try {
      await saveItemsToBackend([{ id: newItem.id, name: newItem.name, vendorItemCode: newItem.sku, orderUom: newItem.unit, packSize: newItem.size }]);
      await saveAssignmentToBackend(newItem.id, countMeta.areaId, 0);
    } catch (e) {
      setReviewSaveError(`Added locally but failed to sync to catalog: ${e.message}`);
    }
  };

  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");

  const doFinalize = async () => {
    setFinalizing(true); setFinalizeError("");
    try {
      await finalizeCountToBackend(countMeta.areaId, settings.requireApproval, list);
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
          <GoldBtn onClick={doFinalize} disabled={finalizing} style={{ padding: "10px 16px", fontSize: 12, borderRadius: 10 }}>
            {finalizing ? "Saving…" : settings.requireApproval ? "Submit for Approval" : "Finalize ✓"}
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
                {item.override !== null && <Badge color={C.amber}>Overridden</Badge>}
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
    </div>
  );
};

// ─── SCREEN: Orders (rolls counts up across areas) ────────────────────────────
const OrdersScreen = ({ countItems, items, assignments }) => {
  // Roll up: total par across all assignments per item vs counted on hand
  const counted = (countItems || []).filter(i => i.sku && i.matchStatus !== "unknown");
  const rows = [];
  const bySku = new Map();
  counted.forEach(ci => {
    const cur = bySku.get(ci.sku) || { ...ci, totalOnHand: 0 };
    cur.totalOnHand += (ci.override ?? ci.aiCount);
    bySku.set(ci.sku, cur);
  });
  bySku.forEach(ci => {
    const masterItem = items.find(i => i.sku === ci.sku);
    const totalPar = masterItem ? assignments.filter(a => a.itemId === masterItem.id).reduce((s, a) => s + a.par, 0) : (ci.par || 0);
    if (totalPar > ci.totalOnHand) rows.push({ ...ci, totalPar, orderQty: totalPar - ci.totalOnHand, vendor: masterItem?.vendor || "—", cost: (totalPar - ci.totalOnHand) * (ci.price || masterItem?.price || 0) });
  });
  const [selected, setSelected] = useState(rows.map(() => true));
  const total = rows.reduce((s, r, i) => s + (selected[i] ? r.cost : 0), 0);

  return (
    <div style={{ padding: "24px 16px 100px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 400, color: C.navy, margin: 0, fontFamily: "'DM Serif Display', serif" }}>Purchase Orders</h1>
      <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 18px" }}>Counts roll up across all areas vs. total par</p>

      {rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16 }}>
          <p style={{ fontSize: 15, fontWeight: 400, color: C.navy, margin: "0 0 8px", fontFamily: "'DM Serif Display', serif" }}>Nothing to reorder</p>
          <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>Run a count and any items below their combined par levels will appear here.</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16, padding: 16, background: C.navy, borderRadius: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 400, color: C.gold, fontFamily: "'DM Serif Display', serif" }}>${total.toFixed(0)}</div>
              <div style={{ fontSize: 10, color: "#ffffff99", textTransform: "uppercase", letterSpacing: "0.08em" }}>Est. Total</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 400, color: "#fff", fontFamily: "'DM Serif Display', serif" }}>{selected.filter(Boolean).length}</div>
              <div style={{ fontSize: 10, color: "#ffffff99", textTransform: "uppercase", letterSpacing: "0.08em" }}>Line Items</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {rows.map((r, i) => (
              <div key={r.sku} onClick={() => setSelected(s => s.map((v, x) => x === i ? !v : v))} style={{ background: C.card, border: `1px solid ${selected[i] ? C.goldBorder : C.border}`, borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", gap: 10, boxShadow: "0 1px 3px rgba(13,27,42,0.05)" }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: selected[i] ? C.navy : C.cardAlt, border: `1px solid ${selected[i] ? C.navy : C.borderDark}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{selected[i] && <Icon name="check" size={12} color={C.gold} />}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.navy }}>{r.name}</p>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>${r.cost.toFixed(0)}</span>
                  </div>
                  <p style={{ margin: "2px 0 6px", fontSize: 11, color: C.textMuted }}>{r.vendor}</p>
                  <p style={{ margin: 0, fontSize: 12, color: C.textSub }}>On hand <strong style={{ color: C.red }}>{r.totalOnHand}</strong> · total par <strong>{r.totalPar}</strong> → order <strong style={{ color: C.navy }}>{r.orderQty} {r.unit}</strong></p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ flex: 1, background: C.card, border: `1px solid ${C.borderDark}`, color: C.textSub, borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Export PDF</button>
            <GoldBtn style={{ flex: 2, padding: 14 }}>Submit to Vendors</GoldBtn>
          </div>
        </>
      )}
    </div>
  );
};

// ─── SCREEN: Settings ─────────────────────────────────────────────────────────
const SettingsScreen = ({ settings, setSettings }) => {
  const [newUnit, setNewUnit] = useState("");
  const [newVendor, setNewVendor] = useState("");
  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));

  return (
    <div style={{ padding: "24px 16px 100px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 400, color: C.navy, margin: 0, fontFamily: "'DM Serif Display', serif" }}>Settings</h1>
      <p style={{ fontSize: 13, color: C.textSub, margin: "4px 0 20px" }}>Customize InventoryIQ to how your operation runs</p>

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

export default function App() {
  const [screen, setScreen] = useState("dashboard");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [locations, setLocations] = useState([]);
  const [items, setItems] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [stages, setStages] = useState([]);
  const [countItems, setCountItems] = useState([]);
  const [countMeta, setCountMeta] = useState(null);
  const [catalogState, setCatalogState] = useState("loading"); // loading | ready | error
  const [catalogError, setCatalogError] = useState("");

  const fetchCatalog = () => {
    setCatalogState("loading");
    loadCatalog()
      .then(({ locations, items, assignments, stages }) => {
        setLocations(locations); setItems(items); setAssignments(assignments); setStages(stages);
        setCatalogState("ready");
      })
      .catch(e => { setCatalogError(e.message || "Could not load catalog"); setCatalogState("error"); });
  };

  useEffect(() => { fetchCatalog(); }, []);

  if (catalogState === "loading") {
    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,700&display=swap'); * { margin:0; padding:0; box-sizing:border-box; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ minHeight: "100vh", background: C.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, fontFamily: "'DM Sans', sans-serif" }}>
          <BrandMark size={48} />
          <div style={{ width: 28, height: 28, border: `3px solid ${C.gold}33`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <p style={{ color: "#ffffffaa", fontSize: 13 }}>Loading your catalog…</p>
        </div>
      </>
    );
  }

  if (catalogState === "error") {
    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap'); * { margin:0; padding:0; box-sizing:border-box; }`}</style>
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
    dashboard: <Dashboard locations={locations} items={items} assignments={assignments} navigate={setScreen} />,
    sites:     <SitesScreen locations={locations} setLocations={setLocations} settings={settings} />,
    catalog:   <CatalogScreen items={items} setItems={setItems} assignments={assignments} setAssignments={setAssignments} locations={locations} settings={settings} setSettings={setSettings} />,
    capture:   <CaptureScreen locations={locations} items={items} assignments={assignments} stages={stages} setStages={setStages} settings={settings} navigate={setScreen} onComplete={(r, m) => { setCountItems(r); setCountMeta(m); }} />,
    review:    <ReviewScreen navigate={setScreen} countItems={countItems} setCountItems={setCountItems} countMeta={countMeta} settings={settings} items={items} setItems={setItems} assignments={assignments} setAssignments={setAssignments} />,
    orders:    <OrdersScreen countItems={countItems} items={items} assignments={assignments} />,
    settings:  <SettingsScreen settings={settings} setSettings={setSettings} />,
  };

  const activeNavIndex = NAV.findIndex(n =>
    screen === n.key || (n.key === "capture" && screen === "review") || (n.key === "catalog" && screen === "orders")
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
        html { -webkit-overflow-scrolling: touch; }
        body { background: ${C.bg}; font-family: 'DM Sans', sans-serif; overscroll-behavior-y: none; }
        button, select, input { font-family: 'DM Sans', sans-serif; }
        ::-webkit-scrollbar { display: none; }

        /* Native-feel tap response: every button compresses slightly on press. */
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
      `}</style>
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
              <button key={n.key} onClick={() => setScreen(n.key)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "6px 0", position: "relative" }}>
                <Icon name={n.icon} size={22} color={active ? C.gold : "#ffffff77"} />
                <span style={{ fontSize: 10, fontWeight: 700, color: active ? C.gold : "#ffffff77", letterSpacing: "0.04em" }}>{n.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
