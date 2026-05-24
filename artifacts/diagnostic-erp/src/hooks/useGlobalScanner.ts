/**
 * useGlobalScanner — Global keyboard-emulating QR/barcode scanner hook
 *
 * Captures fast keyboard input globally, detects scanner by speed (not normal
 * typing), parses KEY:VALUE format, and routes accordingly.
 *
 * Test QR values (for developer reference):
 *   PATIENT:P12345
 *   BILL:BILL12345
 *   STUDY:1.2.840.113619
 *   REPORT:RPT1001
 *   PAYMENT:PAY9001
 *   ACCESSION:ACC7788
 */
import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";

// Routes that have their own dedicated scanner input (global scanner defers)
const OWN_SCANNER_PATHS = new Set([
  "/scan-station",
  "/report-delivery",
  "/report-generator",
  "/report-hub",
  "/reports",
  "/radiology/report-generator",
  "/radiology/reporting-workspace",
  "/radiology/report",
  "/usg/reporting",
  "/usg/doppler",
]);

// Default route mapping for QR prefixes
const DEFAULT_ROUTES: Record<string, (value: string) => string> = {
  PATIENT: (v) => `/patients/${encodeURIComponent(v)}`,
  BILL: (v) => `/billing/${encodeURIComponent(v)}`,
  STUDY: (v) => `/radiology/viewer/${encodeURIComponent(v)}`,
  REPORT: (v) => `/reports`, // list view — can deep-link later
  PAYMENT: (v) => `/payments`, // list view
  ACCESSION: (v) => `/radiology/dicom-study-worklist`,
};

const SCAN_SPEED_THRESHOLD_MS = 50; // keystrokes <50ms apart = scanner
const SCAN_DEBOUNCE_MS = 500;       // ignore duplicate scans within 500ms
const SCAN_MAX_IDLE_MS = 150;       // max idle between chars before reset

export interface ScannerRouteMap {
  [prefix: string]: (value: string) => string;
}

export interface UseGlobalScannerOptions {
  /** Enable/disable scanner listening (default: true) */
  enabled?: boolean;
  /** Custom route mappings (merged over defaults) */
  routeMap?: ScannerRouteMap;
  /** Milliseconds between keystrokes to classify as scanner (default: 50) */
  speedThresholdMs?: number;
  /** Debounce window to prevent double-navigation (default: 500) */
  debounceMs?: number;
  /** Called before navigation; return false to cancel */
  onBeforeNavigate?: (prefix: string, value: string, target: string) => boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  const editable =
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable ||
    target.closest("[contenteditable='true']") !== null;
  return editable;
}

function parseScannedText(raw: string): { prefix: string; value: string } | null {
  const trimmed = raw.trim();
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0) {
    const prefix = trimmed.slice(0, colonIdx).toUpperCase().trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (!prefix || !value) return null;
    return { prefix, value };
  }
  // No prefix → treat as ACCESSION fallback
  if (trimmed.length > 0) {
    return { prefix: "ACCESSION", value: trimmed };
  }
  return null;
}

export function useGlobalScanner(options: UseGlobalScannerOptions = {}) {
  const [location, navigate] = useLocation();
  const {
    enabled = true,
    routeMap = {},
    speedThresholdMs = SCAN_SPEED_THRESHOLD_MS,
    debounceMs = SCAN_DEBOUNCE_MS,
    onBeforeNavigate,
  } = options;

  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const lastScanTimeRef = useRef(0);
  const isScannerRef = useRef(false);
  const routesRef = useRef({ ...DEFAULT_ROUTES, ...routeMap });

  // Keep route map current
  useEffect(() => {
    routesRef.current = { ...DEFAULT_ROUTES, ...routeMap };
  }, [routeMap]);

  const performNavigation = useCallback(
    (prefix: string, value: string) => {
      const resolver = routesRef.current[prefix];
      if (!resolver) {
        toast({
          title: "Invalid QR format",
          description: `Unknown prefix "${prefix}". Expected PATIENT, BILL, STUDY, REPORT, PAYMENT, or ACCESSION.`,
          variant: "destructive",
        });
        return;
      }

      const target = resolver(value);
      if (onBeforeNavigate && !onBeforeNavigate(prefix, value, target)) {
        return;
      }

      toast({
        title: `Scanned ${prefix}: ${value}`,
        description: `Navigating to ${target}`,
      });

      navigate(target, { replace: false });
    },
    [navigate, onBeforeNavigate]
  );

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Skip if on a page with its own scanner
      if (OWN_SCANNER_PATHS.has(location)) return;

      // Ignore when user is typing in a field
      if (isEditableTarget(e.target)) {
        // Still reset scanner state so typing doesn't bleed into next scan
        bufferRef.current = "";
        lastKeyTimeRef.current = 0;
        isScannerRef.current = false;
        return;
      }

      const now = performance.now();
      const elapsed = now - lastKeyTimeRef.current;

      // Reset if idle too long
      if (elapsed > SCAN_MAX_IDLE_MS) {
        bufferRef.current = "";
        isScannerRef.current = false;
      }

      // Detect scanner speed on second character
      if (bufferRef.current.length === 1 && elapsed < speedThresholdMs) {
        isScannerRef.current = true;
      }

      lastKeyTimeRef.current = now;

      // Enter completes the scan
      if (e.key === "Enter") {
        if (!isScannerRef.current || bufferRef.current.length < 2) {
          bufferRef.current = "";
          isScannerRef.current = false;
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        // Debounce duplicate scans
        if (now - lastScanTimeRef.current < debounceMs) {
          bufferRef.current = "";
          isScannerRef.current = false;
          return;
        }
        lastScanTimeRef.current = now;

        const parsed = parseScannedText(bufferRef.current);
        bufferRef.current = "";
        isScannerRef.current = false;

        if (!parsed) {
          toast({
            title: "Invalid QR format",
            description: "Scanned code was empty or malformed.",
            variant: "destructive",
          });
          return;
        }

        performNavigation(parsed.prefix, parsed.value);
        return;
      }

      // Ignore control keys
      if (e.key.length > 1) return;

      // Buffer printable characters
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        bufferRef.current += e.key;
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, location, speedThresholdMs, debounceMs, performNavigation]);

  return {
    isActive: enabled && !OWN_SCANNER_PATHS.has(location),
    currentPath: location,
  };
}
