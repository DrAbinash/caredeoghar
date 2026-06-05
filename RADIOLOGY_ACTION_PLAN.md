# Radiology Module — Action Plan: From Bloat to Useful

## What the User Actually Needs

- **All modalities**: X-ray, CT, MRI, USG, Doppler, Echo, Fetal
- **PACS**: Conquest + Weasis running, DICOM puller from Windows PC working
- **Pain point**: USG reports take too long to type with all measurements
- **Real workflow**: Book → Scan → Report → Deliver

## Current State: The Problem

The radiology module has **425+ items** but the core workflow is **broken or disconnected**:

1. **Billing Desk** creates a bill → study may or may not appear in worklist
2. **Worklist** is not the first thing the radiologist sees — it loads from a separate menu
3. **USG Measurements** auto-extract from DICOM (good), but the radiologist must manually navigate to them
4. **Report Writing** is a textarea — no auto-fill from measurements, no keyboard shortcuts
5. **Report Delivery** is not integrated — the radiologist doesn't know if patient got the report
6. **PACS Viewer** (Weasis) is separate from the ERP — the radiologist clicks between two apps

### What Actually Wastes Time in a Real USG Clinic:

1. **Typing measurements** — BPD, HC, AC, FL, FHR, EFW, GA, AFI, Placenta position, Liquor volume
2. **Writing the same text** — "Liver shows normal echotexture, no focal lesion..."
3. **Typing findings** — "Uterus is anteverted, normal size..."
4. **Copy-pasting** from the ultrasound machine display
5. **Re-typing** the same normal findings every time
6. **Formatting** — making it look professional for patients

### The Real Solution: One-Click Normal Reports

The fastest radiologist workflow is:
1. **See the patient** in the worklist
2. **Click "Normal"** → Report auto-fills with a normal template
3. **Edit only the abnormal parts** (or add measurements)
4. **Click "Done"** → Report is finalized and delivered
5. **Total time**: 10 seconds for a normal scan, 30 seconds for a complex one

## Step-by-Step Implementation Plan

### Phase 1: Fix the Core Worklist (Week 1)
**Goal**: Make the radiology worklist the first and only thing the radiologist needs.

**Current**: Worklist is at `/radiology/worklist` → separate menu, needs to be opened
**Target**: Worklist appears on the **Dashboard** or as a **pinned sidebar** for radiologist role

**Tasks**:
1.1. **Auto-populate worklist from billing** — when a bill is created with a radiology test, the study must appear in the worklist with status "PENDING" immediately
1.2. **Worklist dashboard card** — radiologist sees a card on their daily summary showing "12 USG pending, 3 in progress"
1.3. **One-click "Start Reporting"** — from the worklist, one click opens the reporting page
1.4. **Auto-fill demographics** — patient name, age, sex, doctor, bill number — no re-typing

**Why this matters**: The radiologist shouldn't have to navigate menus. The patient should appear in front of them.

---

### Phase 2: USG Measurement Auto-Insert (Week 1-2)
**Goal**: Stop typing measurements. Extract from DICOM and insert into the report.

**Current**: Measurements extract from DICOM but sit in a separate review page. The radiologist must copy-paste.
**Target**: Measurements auto-insert into the report template.

**Tasks**:
2.1. **One-click "Fill from Measurements"** — in the USG report page, a button fills the template with extracted measurements
2.2. **Smart template matching** — if the DICOM says "Growth Scan", the system picks "OB_GROWTH" template
2.3. **Measurement inline editing** — in the report, the radiologist can edit measurements inline (not in a separate page)
2.4. **Confidence flags** — low-confidence measurements are highlighted but still inserted

**Why this matters**: A USG report has 20+ measurements. Auto-inserting them saves 2-3 minutes per report.

---

### Phase 3: Normal Template Shortcuts (Week 2)
**Goal**: 80% of reports are normal. Make them one-click.

**Current**: 13 templates exist but they are complex. The radiologist still types most of the text.
**Target**: Every template has a "Normal" button that pre-fills normal findings.

**Tasks**:
3.1. **"Normal" button per template** — "OB_GROWTH" → "Normal" button → fills "Biometry is appropriate for gestational age, AFI is normal, placenta is anterior, liquor is adequate..."
3.2. **Keyboard shortcuts** — F1 = Normal, F2 = Insert Measurements, F3 = Finalize
3.3. **Quick findings** — common phrases as buttons: "Normal", "No abnormality detected", "FHR is normal", "AFI is adequate"
3.4. **Impression templates** — "Normal study", "Grossly normal study", "No significant abnormality detected"

**Why this matters**: Most scans are normal. A normal USG report should take 10 seconds.

---

### Phase 4: Report Delivery Integration (Week 2-3)
**Goal**: When the radiologist clicks "Done", the patient gets the report.

**Current**: Report is finalized but delivery is manual (separate page, manual send).
**Target**: Auto-delivery on finalization.

**Tasks**:
4.1. **Auto-delivery on finalize** — "Send to patient" checkbox (default on) → sends WhatsApp/email on finalize
4.2. **Delivery status in worklist** — the worklist shows ✓ for delivered, ✗ for not delivered
4.3. **Patient portal auto-update** — report appears immediately in the patient portal
4.4. **Print & hand** — option to print directly for walk-in patients

**Why this matters**: The radiologist shouldn't have to think about delivery. The patient should get it automatically.

---

### Phase 5: PACS + ERP Unified (Week 3)
**Goal**: Don't make the radiologist switch between ERP and Weasis.

**Current**: PACS is at `/pacs`, Weasis is separate. The radiologist must open two apps.
**Target**: DICOM viewer is embedded in the report page.

**Tasks**:
5.1. **Inline PACS viewer** — in the report page, a small window shows the DICOM image
5.2. **Weasis launch** — "Open in Weasis" button for detailed viewing
5.3. **Key image capture** — in the report page, capture a key image to include in the report
5.4. **Mobile viewer** — patients can view images on mobile

**Why this matters**: The radiologist writes the report while looking at the image. Switching apps wastes time.

---

### Phase 6: AI That Actually Helps (Week 3-4)
**Goal**: AI should speed up the report, not add a dashboard.

**Current**: AI is on separate pages (AI Reporting, AI Prompt Templates, AI Model Routing).
**Target**: AI is inline in the report page.

**Tasks**:
6.1. **Inline AI draft** — in the report page, "AI Draft" button fills the report with AI suggestions
6.2. **Voice dictation** — the radiologist speaks, text appears
6.3. **AI suggestions** — "Did you mean: Normal study?" — one click to accept
6.4. **Smart macros** — radiologist types ".liver" → "Liver shows normal echotexture..."

**Why this matters**: AI should be invisible. The radiologist doesn't want to go to an "AI Dashboard".

---

### What to Remove/Deprioritize

These are **not useful for daily work** and should be hidden or moved to admin:
- AI Audit Log
- AI Quality Scores
- AI Prompt Effectiveness
- RAG Vector Store
- AI Search & Retrieval
- Anomaly Alerts
- Feedback Loop Analytics
- Training Data Export
- Report Diff Viewer
- Peer Review Assignments
- Billing Suggestions
- Provider Health Monitor
- Template Versions
- Quality Gates (keep as auto-check, don't show UI)
- AI Inference Settings
- AI Model Routing
- AI DICOM Findings
- Storage Lifecycle
- Archive Lifecycle
- Watchdog
- RIS Monitoring
- Enterprise Analytics
- DICOM Agent Dashboard

These should be **admin-only** or **removed from the sidebar**.

---

## Implementation Order

**Week 1**: Phase 1 (Worklist) + Phase 2 (Measurement Auto-Insert)
**Week 2**: Phase 3 (Normal Templates) + Phase 4 (Delivery)
**Week 3**: Phase 5 (PACS Unified) + Phase 6 (AI Inline)
**Week 4**: Testing + Cleanup + Remove bloat

---

## How to Proceed

**Option A**: Share screenshots of the current pages (Billing Desk, Worklist, USG Reporting, PACS Viewer)
**Option B**: I implement Phase 1 directly (auto-populate worklist from billing)
**Option C**: We start with a clean "USG Reporting" page redesign — one page that does everything

**My recommendation**: Start with **Option C** — redesign the USG Reporting page to be a single-page workflow:
1. Patient info auto-filled (from billing)
2. DICOM image visible (from Conquest)
3. Measurements extracted and inserted (from DICOM)
4. Normal template buttons (one-click)
5. Text editor with macros
6. Finalize button (auto-delivers)

This is the page the radiologist will spend 90% of their time on. Make it fast.

---

*End of Action Plan*
