# Radiology Module — Phase-Wise Implementation Roadmap

## Care Diagnostics ERP — Consolidation & Productivity Enhancement Plan

**Prepared:** 2026-06-05
**Architect:** Senior RIS/PACS Product Architect
**Status:** Ready for review — no code changes yet

---

## Executive Summary

This roadmap converts the audit findings into an executable plan. The goal is to consolidate 7 competing report pages into 1 unified workflow, reducing report time from 3-5 minutes to under 30 seconds for normal studies. Each phase is self-contained with its own rollback plan. Phases build on each other but can be paused or skipped independently.

**Estimated total effort:** 7-8 weeks (1 developer)
**Risk level:** Low (no schema changes, no API deletions, no breaking changes)
**Rollback strategy:** Every change is reversible within 5 minutes

---

## Phase 0: Foundation & Safety (Day 1-2)

### Objective
Establish baseline safety, fix known bugs, and create a feature-flag system so subsequent phases can be toggled on/off without redeployment.

### Files Affected

| File | Action | Lines |
|------|--------|-------|
| `artifacts/diagnostic-erp/src/App.tsx` | Fix duplicate `/radiology/command-center` route | Lines 294, 303 |
| `artifacts/diagnostic-erp/src/components/Layout.tsx` | Add `featureFlags` helper to `staffSession.ts` | New function |
| `artifacts/diagnostic-erp/src/lib/staffSession.ts` | Add `getFeatureFlags()` | ~10 lines |
| `artifacts/diagnostic-erp/src/components/Layout.tsx` | Add `featureFlag` prop to `NavLeaf` type | ~5 lines |

### Detailed Steps

1. **Fix duplicate route in App.tsx**
   - Remove the duplicate `<Route path="/radiology/command-center" ...>` at line 303
   - Keep the one at line 294 (the correct one)
   - This is a zero-risk bugfix — no functionality change

2. **Add feature-flag system**
   - Add `getFeatureFlags()` to `staffSession.ts` that reads from `localStorage` or a new `/api/staff/feature-flags` endpoint
   - Add `featureFlag?: string` to `NavLeaf` type in `Layout.tsx`
   - When rendering nav items, skip items whose `featureFlag` is not enabled
   - Default all new items to disabled (opt-in)

3. **Create flag definitions**
   - `showUnifiedReporting` — enables new unified reporting UI
   - `showMeasurementPanel` — enables measurement auto-insert panel
   - `showAiDraftPanel` — enables AI draft inline panel
   - `showSplitWorklist` — enables worklist + report split view
   - `hideDeprecatedNav` — hides old nav items (for gradual rollout)

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Route fix breaks Command Center | Very Low | Medium | Both routes point to same component; removing one is safe |
| Feature flag logic has bugs | Low | Low | Flags default to OFF; no change in current behavior |
| StaffSession.ts changes break auth | Low | High | Add function, don't modify existing functions |

### Dependencies
- None (self-contained)

### Rollback Plan
- Route fix: revert the deletion in App.tsx
- Feature flags: remove `featureFlag` prop from NavLeaf; all items return to default visibility
- `staffSession.ts` change: revert to previous commit

### Expected Productivity Gain
- None (this is infrastructure)
- **Value:** Enables zero-risk rollout of all subsequent phases

### Testing Checklist
- [ ] Command Center still loads at `/radiology/command-center`
- [ ] All existing nav items still visible
- [ ] Feature flags can be toggled in localStorage
- [ ] Flagged items hide/show correctly

---

## Phase 1: Menu Consolidation (Week 1)

### Objective
Reduce sidebar from 18 items to 12, merge USG/DOPPLER into Radiology, hide deprecated pages, and move admin items to Settings group. All old routes remain functional for bookmarks/back-compat.

### Files Affected

| File | Action | Complexity |
|------|--------|------------|
| `artifacts/diagnostic-erp/src/components/Layout.tsx` | Restructure `navItems` array | Medium |
| `artifacts/diagnostic-erp/src/App.tsx` | Add `ownerOnly` to admin routes | Low |
| `artifacts/diagnostic-erp/src/lib/staffSession.ts` | Add permission aliases for moved items | Low |

### Detailed Steps

1. **Restructure Radiology group in Layout.tsx**

   **Current (18 items):**
   ```
   Radiology & Imaging
   |-- Worklist Hub
   |-- Reporting Workspace
   |-- PACS Viewer
   |-- Normal Templates
   |-- AI Reporting
   |-- DICOM Query/Retrieve
   |-- MWL Dashboard
   |-- Teleradiology
   |-- Echo Cardiology
   |-- Fetal USG
   |-- Fetal Echo
   |-- Voice Dictation
   |-- Critical Findings
   |-- AI Extraction Review
   |-- PACS Settings (ownerOnly)
   |-- Modality Management (ownerOnly)
   |-- DICOM Agent (ownerOnly)
   |-- Watchdog (ownerOnly)
   ```

   **New (12 items):**
   ```
   Radiology & Imaging
   |-- Worklist Hub
   |-- Reporting Workspace
   |-- PACS Viewer
   |-- Normal Templates
   |-- Critical Findings
   |-- DICOM Query/Retrieve
   |-- MWL Dashboard
   |-- Teleradiology
   |-- Echo Cardiology
   |-- Fetal USG
   |-- Fetal Echo
   |-- Voice Dictation
   ```

   **Removed from Radiology group:**
   - `AI Reporting` -> move to Settings > Radiology
   - `AI Extraction Review` -> hide (integrated later)
   - `PACS Settings` -> move to Settings > PACS
   - `Modality Management` -> move to Settings > Devices
   - `DICOM Agent` -> move to Settings > Agents
   - `Watchdog` -> move to Settings > Monitoring

2. **Remove `/usg` top-level item**
   - Delete line 173 in Layout.tsx: `{ path: "/usg", icon: Waves, label: "USG / DOPPLER" }`
   - USG studies are already visible in Radiology Worklist (modality = US/USG)
   - Old routes `/usg/*` remain in App.tsx for back-compat

3. **Add moved items to Settings group**
   - Add to Settings children:
     - `{ path: "/radiology/pacs-settings", icon: Server, label: "PACS & DICOM", ownerOnly: true }`
     - `{ path: "/radiology/modality-management", icon: Monitor, label: "Modality Management", ownerOnly: true }`
     - `{ path: "/radiology/dicom-agent-dashboard", icon: Server, label: "DICOM Agent", ownerOnly: true }`
     - `{ path: "/radiology/watchdog", icon: ShieldAlert, label: "Watchdog", ownerOnly: true }`
     - `{ path: "/radiology/ai-reporting-settings", icon: BrainCircuit, label: "AI Reporting", ownerOnly: true }`

4. **Add `ownerOnly` to admin routes in App.tsx**
   - Wrap admin route components with `ownerOnly` permission check
   - Currently these routes exist but are only gated by sidebar visibility
   - Adding route-level protection is defense-in-depth

5. **Hide deprecated nav items (not delete)**
   - Add `featureFlag: "hideDeprecatedNav"` to the removed items
   - When `hideDeprecatedNav` is NOT set, items still appear
   - This allows gradual rollout — staff can toggle back if needed

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Staff can't find moved items | Medium | Medium | Items are in Settings, not deleted; announce changes |
| `/usg` bookmark breaks | Low | Low | Route still works, just not in sidebar |
| Permission alias missing | Low | High | Add aliases before deploying; test all roles |
| Settings group becomes too long | Medium | Low | Settings group is already long; this adds 5 items |

### Dependencies
- Phase 0 (feature-flag system)

### Rollback Plan
1. Revert `navItems` array in `Layout.tsx` to previous version
2. Re-add `/usg` item to top-level nav
3. Remove new items from Settings group
4. Toggle `hideDeprecatedNav` flag OFF

**Rollback time:** 2 minutes (single file revert)

### Expected Productivity Gain
| Metric | Before | After | Gain |
|--------|--------|-------|------|
| Sidebar items | 18 | 12 | 33% reduction |
| Decision time (which page?) | 3-5s | 1-2s | 60% faster |
| Menu confusion | High | Low | Substantial |
| USG/DOPPLER separation | Confusing | Unified | Clearer |

### Testing Checklist
- [ ] All 12 Radiology items render correctly
- [ ] Settings group shows moved items
- [ ] `/usg` route still works when typed directly
- [ ] Owner-only items hidden for non-owner roles
- [ ] Mobile sidebar shows correct items
- [ ] `ERP_NAV_ORDER` in App.tsx still valid for permission checks

---

## Phase 2: Unified Reporting Enhancement (Week 2-3)

### Objective
Port missing features from the 6 deprecated report pages into `RadiologyReportUnified.tsx`, making it the single page for all radiology reporting. Add measurement panel, AI draft panel, and normal template integration.

### Files Affected

| File | Action | Complexity |
|------|--------|------------|
| `artifacts/diagnostic-erp/src/pages/RadiologyReportUnified.tsx` | Major enhancement | High |
| `artifacts/diagnostic-erp/src/pages/RadiologyReportGenerator.tsx` | Reference (read-only) | — |
| `artifacts/diagnostic-erp/src/pages/RadiologyReportingWorkspace.tsx` | Reference (read-only) | — |
| `artifacts/diagnostic-erp/src/pages/UsgReporting.tsx` | Reference (read-only) | — |
| `artifacts/api-server/src/routes/usgExtraction.ts` | Add new endpoint (if needed) | Low |

### Detailed Steps

#### Step 2.1: Add Measurement Auto-Insert Panel (3 days)

1. **Add measurement fetch logic**
   - In `RadiologyReportUnified.tsx`, add `useQuery` to poll `/api/usg-extraction/study/:studyInstanceUID`
   - Poll interval: 5 seconds (when study is active)
   - Show panel only when `modality` is US/USG/Echo/Fetal

2. **Create measurement panel UI**
   - Collapsible side panel (right side, below AI draft)
   - Shows extracted measurements as a table:
     ```
     | Measurement | Value | Confidence | Action |
     | BPD         | 3.2cm | High       | [Insert] |
     | HC          | 12.1cm| High       | [Insert] |
     | ...
     ```
   - "Insert All" button at top
   - Each row has "Insert" button that appends formatted text to report textarea

3. **Format insertion text**
   - Template: `BPD: 3.2 cm (High confidence)`
   - Group by category (Fetal, Pelvic, Abdominal)
   - Insert at cursor position or append to end

4. **Add approval shortcut**
   - "Approve & Insert" button that calls `PATCH /api/usg-extraction/measurements/:id/approve` then inserts
   - This skips the separate review page entirely

#### Step 2.2: Add AI Draft Inline Panel (2 days)

1. **Reuse existing AI draft fetch**
   - `RadiologyReportUnified.tsx` already has `aiDraftStatus` and `aiDraftJson` in the `WorklistEntry` type
   - Add `useQuery` to fetch the actual draft text when status is "READY"

2. **Create AI draft panel**
   - Collapsible panel below measurements
   - Shows AI-generated report text with yellow "AI Draft" banner
   - "Insert AI Draft" button -> inserts into report textarea
   - "Discard" button -> clears the draft
   - Always show the safety label: "AI Draft — Requires Radiologist Review"

3. **Add AI trigger button**
   - "Generate AI Draft" button that calls `POST /api/usg-extraction/extract` or existing AI endpoint
   - Shows loading state while generating
   - Auto-refreshes when complete

#### Step 2.3: Integrate Normal Templates (1 day)

1. **Add template fetch**
   - `useQuery` to `/api/radiology/normal-templates` (or equivalent)
   - Filter by current modality and body part

2. **Create template picker**
   - Inline dropdown or quick-access bar above report textarea
   - Shows 5-10 most relevant templates
   - "More templates..." link opens full template page
   - Click -> inserts template text into report
   - Keyboard shortcut: `N` (when focus is not in textarea)

3. **Template categorization**
   - Auto-suggest based on modality + study description
   - Example: modality = US, description = "Abdomen" -> show "Normal Abdomen" template first

#### Step 2.4: Port Missing Features from Deprecated Pages (3 days)

1. **From `RadiologyReportGenerator.tsx` (93K):**
   - Voice dictation button (microphone icon)
   - Print settings dialog (page size, margins, header)
   - PDF export button
   - Report parameters (structured data entry)

2. **From `RadiologyReportingWorkspace.tsx` (58K):**
   - Better embedded viewer integration (iframe sizing)
   - Study comparison (prior studies panel)
   - Key images gallery

3. **From `UsgReporting.tsx` (55K):**
   - USG-specific measurement layouts (fetal biometry table)
   - Doppler measurement integration
   - USG-specific normal templates

4. **From `RadiologyReportEditor.tsx` (21K):**
   - Simple text editor features (if any missing)
   - Rich text formatting (if needed)

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Unified page becomes too large | Medium | High | Split into sub-components; lazy-load panels |
| Measurement panel shows wrong data | Low | High | Use existing `usgExtraction.ts` endpoints; same data |
| AI draft quality degrades | Medium | Medium | Not changing AI logic; just moving UI location |
| Normal template fetch fails | Low | Medium | Graceful fallback: show "No templates available" |
| Old report pages break | Very Low | High | Not modifying them; just hiding from sidebar |

### Dependencies
- Phase 0 (feature flags)
- Phase 1 (menu consolidation)
- `usgExtraction.ts` endpoints already exist
- Normal templates API already exists

### Rollback Plan
1. Toggle `showUnifiedReporting` flag OFF
2. Old sidebar items reappear (if `hideDeprecatedNav` is also OFF)
3. Staff can use old report pages again
4. Unified page changes are preserved but not the default

**Rollback time:** 1 minute (toggle flag)

### Expected Productivity Gain
| Metric | Before | After | Gain |
|--------|--------|-------|------|
| Report pages to choose from | 7 | 1 | 86% reduction |
| Measurement insertion time | 30-60s | 5s | 90% faster |
| AI draft access | 2 clicks + new tab | 1 click | Inline |
| Normal template access | 3 clicks + copy/paste | 1 click | 80% faster |
| Tab switching | 3-4 times | 0 | Eliminated |

### Testing Checklist
- [ ] Unified page loads for all study types
- [ ] Measurement panel shows for US/USG studies
- [ ] Measurement "Insert" button works
- [ ] AI draft panel shows when ready
- [ ] AI draft insert works
- [ ] Normal templates filter by modality
- [ ] Template insert works
- [ ] Voice dictation button works
- [ ] Print settings work
- [ ] PDF export works
- [ ] Page size stays under 200KB (code-split if needed)

---

## Phase 3: Worklist Integration (Week 4-5)

### Objective
Add action buttons to worklist rows and create a split-view mode where worklist + report appear side-by-side. This eliminates the need to navigate away from the worklist for 80% of studies.

### Files Affected

| File | Action | Complexity |
|------|--------|------------|
| `artifacts/diagnostic-erp/src/pages/RadiologyWorklist.tsx` | Major enhancement | High |
| `artifacts/diagnostic-erp/src/pages/RadiologyReportUnified.tsx` | Add "embedded" mode | Medium |
| `artifacts/diagnostic-erp/src/App.tsx` | Add new route for split view | Low |

### Detailed Steps

#### Step 3.1: Add Action Buttons to Worklist Rows (2 days)

1. **Add action buttons to each study row**
   - Current row: Patient | Modality | Status | Date
   - New row: Patient | Modality | Status | **[Report] [View] [AI] [Final]** | Date
   - Buttons:
     - **Report** (primary) -> opens unified report
     - **View** -> opens embedded viewer (or PACS)
     - **AI** -> shows AI draft status / generates if not ready
     - **Final** -> one-click finalize (with confirmation for non-normal)

2. **Button visibility rules**
   - `Report` always visible
   - `View` visible when `studyInstanceUID` exists
   - `AI` visible when modality supports AI (US, CT, MR)
   - `Final` visible when status is "REPORT_IN_PROGRESS" or "AI_DRAFT_READY"
   - `Final` hidden when status is "REPORT_FINAL" or "DELIVERED"

3. **Add status color coding**
   - Current status badges are already color-coded
   - Add pulsing animation for "AI_DRAFT_READY" to draw attention
   - Add "New" badge for studies received in last 5 minutes

#### Step 3.2: Create Split-View Mode (3 days)

1. **Add route for split view**
   - `/radiology/worklist-split` or modify existing `/radiology/worklist` to support split mode
   - Detect via query param: `?mode=split` or localStorage preference

2. **Implement split-view layout**
   - Desktop: Left 40% = worklist, Right 60% = unified report
   - Mobile: Full-screen worklist, tap study -> full-screen report (back button returns)
   - Resizable divider between panels

3. **Study selection logic**
   - Click study row -> loads report in right panel
   - No page navigation (same URL, different query param)
   - Selected row highlighted
   - Keyboard navigation: Up/Down arrows move selection

4. **Auto-save coordination**
   - Report auto-saves every 30 seconds
   - Worklist auto-refreshes every 60 seconds
   - When a study is finalized, it disappears from worklist (smooth animation)
   - Next study auto-selects

#### Step 3.3: Add Keyboard Shortcuts (1 day)

1. **Global shortcuts (when worklist has focus)**
   - `R` -> Report selected study
   - `F` -> Finalize selected study (with confirmation)
   - `N` -> Insert normal template
   - `V` -> Toggle voice dictation
   - `Esc` -> Close report panel (split view)
   - `Enter` -> Open report for selected study

2. **Global shortcuts (when report has focus)**
   - `Ctrl+S` -> Save draft
   - `Ctrl+Shift+F` -> Finalize
   - `Ctrl+N` -> Insert normal template
   - `Ctrl+M` -> Insert measurements
   - `Ctrl+A` -> Insert AI draft

3. **Shortcut help panel**
   - `?` key shows overlay with all shortcuts
   - Dismiss with `Esc` or click

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Split view breaks on mobile | Medium | Medium | Mobile falls back to single-page flow |
| Keyboard shortcuts conflict | Medium | Low | Use `Shift+` or `Ctrl+` modifiers; avoid browser defaults |
| Auto-refresh loses selected study | Low | Medium | Remember selection by study ID, not index |
| One-click finalize causes accidents | Medium | High | Confirmation dialog for non-normal studies |
| Split view performance degrades | Medium | Medium | Lazy-load report panel; unmount when closed |

### Dependencies
- Phase 0 (feature flags)
- Phase 1 (menu consolidation)
- Phase 2 (unified reporting enhancement)

### Rollback Plan
1. Toggle `showSplitWorklist` flag OFF
2. Worklist reverts to current single-page mode
3. Report button still opens in full page (Phase 2 behavior)
4. Keyboard shortcuts: remove event listeners

**Rollback time:** 1 minute (toggle flag) + page refresh

### Expected Productivity Gain
| Metric | Before | After | Gain |
|--------|--------|-------|------|
| Clicks: worklist -> report | 3-4 | 1 | 75% reduction |
| Page loads per report | 2-3 | 0-1 | 67% reduction |
| Navigation time | 5-10s | 1s | 90% faster |
| Studies per hour (normal) | ~12 | ~20 | 67% increase |
| Keyboard vs mouse usage | 100% mouse | 50% keyboard | Faster for power users |

### Testing Checklist
- [ ] Action buttons appear on all rows
- [ ] Report button opens unified report
- [ ] View button opens images
- [ ] AI button triggers/generates draft
- [ ] Finalize button works with confirmation
- [ ] Split view loads on desktop
- [ ] Mobile falls back to single-page
- [ ] Keyboard shortcuts work
- [ ] Shortcut help panel shows
- [ ] Auto-refresh preserves selection
- [ ] Finalized studies animate out smoothly

---

## Phase 4: Measurement Auto-Insert (Week 6)

### Objective
Eliminate the separate measurement review page. Extracted measurements should flow directly into the unified report with one click. Only go to review for corrections.

### Files Affected

| File | Action | Complexity |
|------|--------|------------|
| `artifacts/api-server/src/routes/usgExtraction.ts` | Add `directInsert` endpoint (optional) | Low |
| `artifacts/diagnostic-erp/src/pages/RadiologyReportUnified.tsx` | Enhance measurement panel | Medium |
| `artifacts/diagnostic-erp/src/pages/UsgMeasurementReview.tsx` | Keep but demote | None |

### Detailed Steps

#### Step 4.1: Streamline Measurement Flow (3 days)

1. **Auto-extract on study arrival**
   - When a new USG study appears in worklist, auto-trigger `POST /api/usg-extraction/extract`
   - Current behavior: manual trigger only
   - New behavior: auto-trigger + background processing
   - Show "Extracting..." status in worklist row

2. **Show measurements inline (no review page)**
   - In unified report panel, show extracted measurements as soon as available
   - Format: `BPD: 3.2 cm (confidence: High)`
   - "Approve & Insert" button -> approves + inserts in one action
   - "Edit" button -> opens measurement review page (for corrections)
   - "Reject" button -> marks as rejected, removes from panel

3. **Add batch insert**
   - "Insert All Measurements" button -> inserts all approved measurements at once
   - Formats as a structured block:
     ```
     FETAL BIOMETRY:
     BPD: 3.2 cm
     HC: 12.1 cm
     AC: 10.5 cm
     FL: 2.1 cm
     EFW: 150 g
     GA: 14 weeks
     ```

#### Step 4.2: Smart Formatting (2 days)

1. **Modality-aware formatting**
   - Fetal: Biometry table with GA/EDD calculation
   - Pelvic: Uterus, ovaries, endometrium
   - Abdominal: Liver, spleen, kidneys, CBD
   - Doppler: Flow velocities, resistance indices

2. **Confidence indicators**
   - High confidence: normal text
   - Medium confidence: italic text with "(verify)" note
   - Low confidence: red text, requires manual verification

3. **Unit normalization**
   - Convert all measurements to standard units (cm, g, mm)
   - Add units if missing from extraction

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Auto-extract floods API | Low | Medium | Debounce: max 1 extraction per study per 5 minutes |
| Wrong measurements inserted | Medium | High | Confidence threshold: medium+ auto-insert, low requires review |
| Review page still needed | Low | Medium | Keep review page accessible via "Edit" button |
| Formatting looks unprofessional | Low | Medium | Templates for each modality; radiologist can edit |

### Dependencies
- Phase 0 (feature flags)
- Phase 2 (unified reporting)
- `usgExtractor.ts` already exists
- `usgExtraction.ts` endpoints already exist

### Rollback Plan
1. Toggle `showMeasurementPanel` flag OFF
2. Measurements no longer show in unified report
3. Staff uses existing `/usg/measurements/:uid` review page
4. Auto-extract: disable the trigger in worklist

**Rollback time:** 2 minutes

### Expected Productivity Gain
| Metric | Before | After | Gain |
|--------|--------|-------|------|
| Measurement typing time | 30-60s | 5s | 90% faster |
| Review page visits | Every study | Only for corrections | 90% reduction |
| Measurement accuracy | Human error | Extracted + verified | Higher |
| Normal study time | 3-5 min | 30-60s | 80% faster |

### Testing Checklist
- [ ] Auto-extract triggers on study arrival
- [ ] Measurements appear in unified report panel
- [ ] "Approve & Insert" works
- [ ] "Insert All" works
- [ ] Formatting is correct per modality
- [ ] Low-confidence items flagged red
- [ ] "Edit" button opens review page
- [ ] Review page still works independently

---

## Phase 5: Polish & Optimization (Week 7-8)

### Objective
Add finishing touches: batch operations, status indicators, delivery integration, and performance optimization. Gather feedback and iterate.

### Files Affected

| File | Action | Complexity |
|------|--------|------------|
| `artifacts/diagnostic-erp/src/pages/RadiologyWorklist.tsx` | Batch operations, status indicators | Medium |
| `artifacts/diagnostic-erp/src/pages/RadiologyReportUnified.tsx` | Delivery integration, preview | Medium |
| `artifacts/diagnostic-erp/src/components/Layout.tsx` | Feedback banner | Low |

### Detailed Steps

#### Step 5.1: Batch Operations (2 days)

1. **Add checkboxes to worklist rows**
   - Checkbox in first column
   - "Select All" checkbox in header
   - Selected count shown in toolbar

2. **Batch actions toolbar**
   - "Batch Finalize" -> finalizes all selected normal studies
   - "Batch Print" -> prints all selected reports
   - "Batch Email" -> emails all selected reports
   - "Batch WhatsApp" -> sends WhatsApp for all selected
   - Confirmation dialog with count and patient list

3. **Safety checks**
   - Batch finalize: only for studies with status "REPORT_IN_PROGRESS" or "AI_DRAFT_READY"
   - Skip studies with "Critical Findings" flag
   - Require confirmation: "You are about to finalize 12 reports. Continue?"

#### Step 5.2: Status Indicators & Notifications (2 days)

1. **Enhanced status badges**
   - Add "Extraction in Progress" status
   - Add "AI Draft Generating" status
   - Add "Review Required" status (for low-confidence measurements)
   - Add "Critical Finding" status (red, pulsing)

2. **Toast notifications**
   - "New study arrived: Patient Name (USG)"
   - "AI draft ready for Patient Name"
   - "Measurements extracted for Patient Name"
   - "Report finalized for Patient Name"
   - Auto-dismiss after 5 seconds

3. **Sound notifications** (optional)
   - Soft chime for new studies
   - Different chime for critical findings
   - Toggle in settings

#### Step 5.3: Delivery Integration (2 days)

1. **Add delivery buttons to report page**
   - Print (existing)
   - Email -> opens email dialog with patient email pre-filled
   - WhatsApp -> opens WhatsApp dialog with patient phone pre-filled
   - SMS -> if SMS integration exists
   - Patient Portal -> marks as available in portal

2. **Delivery tracking**
   - Show delivery status in worklist
   - "Delivered" badge when email/WhatsApp sent
   - "Viewed" badge when patient opens portal

#### Step 5.4: Performance Optimization (2 days)

1. **Code splitting**
   - Split unified report page into lazy-loaded sub-components:
     - `MeasurementPanel` (lazy)
     - `AiDraftPanel` (lazy)
     - `TemplatePicker` (lazy)
     - `ViewerPanel` (lazy)
   - Reduces initial bundle size

2. **Virtual scrolling for worklist**
   - If worklist has >100 studies, use virtual scrolling
   - Currently all rows render at once

3. **Debounce auto-save**
   - Current: auto-save every 30 seconds (good)
   - Add debounce on typing: save 2 seconds after typing stops
   - Prevents save conflicts

4. **Prefetch next study**
   - When radiologist is on study N, prefetch study N+1 data
   - Reduces perceived load time

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Batch finalize causes mass errors | Medium | High | Safety checks; only normal studies; confirmation |
| Toast notifications become annoying | Medium | Low | Toggle in settings; auto-dismiss |
| Delivery integration breaks | Low | Medium | Use existing delivery APIs; no new endpoints |
| Code splitting breaks lazy loading | Low | Medium | Test all lazy components load correctly |

### Dependencies
- All previous phases

### Rollback Plan
- Batch operations: remove checkboxes and toolbar
- Notifications: disable toast system
- Delivery: hide delivery buttons
- Performance: revert to non-lazy components

**Rollback time:** 5-10 minutes (multiple files)

### Expected Productivity Gain
| Metric | Before | After | Gain |
|--------|--------|-------|------|
| Batch finalize | 1 by 1 | 12 at once | 12x faster |
| Delivery time | 3-5 min per report | 1 click | 90% faster |
| Notification awareness | Manual checking | Auto alerts | Higher |
| Page load time | 3-5s | 1-2s | 60% faster |
| Studies per hour (batch) | ~12 | ~30 | 150% increase |

### Testing Checklist
- [ ] Checkboxes appear and work
- [ ] Batch finalize with safety checks
- [ ] Toast notifications show correctly
- [ ] Delivery buttons work (print, email, WhatsApp)
- [ ] Lazy components load correctly
- [ ] Virtual scrolling works for large lists
- [ ] Auto-save debounce works
- [ ] Performance metrics improved (Lighthouse score)

---

## Cross-Phase Dependencies Diagram

```
Phase 0: Foundation
    |
    v
Phase 1: Menu Consolidation
    |
    v
Phase 2: Unified Reporting  <----+
    |                             |
    v                             |
Phase 3: Worklist Integration     |
    |                             |
    v                             |
Phase 4: Measurement Auto-Insert  |
    |                             |
    v                             |
Phase 5: Polish & Optimization  --+
```

**Critical path:** 0 -> 1 -> 2 -> 3 -> 4 -> 5
**Parallel work:** Phases 2 and 3 can overlap slightly (Phase 3 Step 3.1 can start while Phase 2 is finishing)

---

## Risk Matrix (All Phases)

| Risk | Phase | Likelihood | Impact | Overall Score |
|------|-------|-----------|--------|---------------|
| Staff resistance to change | 1 | High | Medium | 6/10 |
| Unified page becomes too complex | 2 | Medium | High | 6/10 |
| Measurement extraction accuracy | 4 | Medium | High | 6/10 |
| Batch finalize mass errors | 5 | Medium | High | 6/10 |
| Mobile experience degrades | 3 | Medium | Medium | 4/10 |
| Keyboard shortcut conflicts | 3 | Medium | Low | 3/10 |
| Feature flag bugs | 0 | Low | Low | 2/10 |
| Route fix breaks something | 0 | Very Low | Medium | 1/10 |

**Overall project risk: LOW (4/10)**
- No database schema changes
- No API route deletions
- No breaking changes to existing workflows
- Every phase has a 1-2 minute rollback
- Feature flags allow gradual rollout

---

## Rollback Strategy Summary

| Phase | Rollback Time | Method | Data Loss |
|-------|--------------|--------|-----------|
| 0 | 2 min | Revert file | None |
| 1 | 2 min | Revert navItems | None |
| 2 | 1 min | Toggle flag | None |
| 3 | 1 min | Toggle flag | None (auto-save preserves) |
| 4 | 2 min | Toggle flag + disable trigger | None |
| 5 | 5 min | Hide UI elements | None |

**Worst case:** Revert all phases -> 15 minutes -> return to current state

---

## Expected Productivity Gain Summary

| Metric | Current | After All Phases | Improvement |
|--------|---------|-----------------|-------------|
| Report pages | 7 | 1 | 86% |
| Sidebar items | 18 | 12 | 33% |
| Clicks per report | 15-20 | 3-5 | 75% |
| Page loads per report | 5-7 | 1 | 86% |
| Measurement typing | 30-60s | 5s | 90% |
| Normal report time | 3-5 min | 30-60s | 80% |
| Studies per hour | ~12 | ~30 | 150% |
| Tab switching | 3-4 times | 0 | 100% |
| Decision fatigue | High | None | Substantial |

---

## Implementation Order (Recommended)

1. **Start with Phase 0** (Day 1-2) — establishes safety net
2. **Phase 1** (Week 1) — immediate UX improvement, low risk
3. **Phase 2** (Week 2-3) — core feature, highest impact
4. **Phase 3** (Week 4-5) — workflow integration, builds on Phase 2
5. **Phase 4** (Week 6) — measurement automation, builds on Phase 2
6. **Phase 5** (Week 7-8) — polish, can be deferred if needed

**Minimum viable improvement:** Phases 0 + 1 + 2 (3 weeks) -> reduces report time by 50%
**Full implementation:** All phases (8 weeks) -> reduces report time by 80%

---

## Success Metrics to Track

After each phase, measure:

1. **Average time from worklist to finalized report** (target: <2 min for normal)
2. **Number of clicks per report** (target: <5)
3. **Percentage of reports using normal templates** (target: >80%)
4. **Percentage of measurements auto-inserted** (target: >90%)
5. **Percentage of AI drafts used** (target: >60%)
6. **Radiologist satisfaction** (weekly survey, 1-5 scale)
7. **Studies per radiologist per hour** (target: >20)
8. **Error rate** (target: no increase)

---

## Resource Requirements

| Resource | Need | Available |
|----------|------|-----------|
| Developer | 1 full-time | You (or assign) |
| Tester | 1 radiologist | On-site staff |
| DICOM test data | 50 studies | Existing PACS |
| Staging environment | 1 instance | Replit preview |
| Rollback window | 2 hours | After-hours |

---

## Communication Plan

| Phase | Communication | Audience |
|-------|--------------|----------|
| 0 | "Feature flags added, no changes" | All staff |
| 1 | "Menu simplified, USG merged into Radiology" | All staff |
| 2 | "New unified reporting page available" | Radiologists |
| 3 | "Worklist now has split view and shortcuts" | Radiologists |
| 4 | "Measurements auto-insert, no more typing" | Radiologists |
| 5 | "Batch finalize and delivery integration" | All staff |

---

*End of Implementation Roadmap*
