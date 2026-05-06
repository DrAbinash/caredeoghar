/**
 * Client-side helpers for the super-admin USB pen-drive gate.
 *
 * Flow:
 *   1. User plugs in their pen drive containing `superadmin.key` (a single
 *      file holding the same secret as the SUPER_ADMIN_USB_KEY env var).
 *   2. User clicks "Insert USB key" in the billing UI sidebar.
 *   3. We open a file picker, read the file contents, POST them to
 *      /api/super-admin/usb/verify.
 *   4. On 200 OK we stash the key in sessionStorage. The super-admin nav
 *      link becomes visible. The key is sent as X-SA-USB-Key on later
 *      super-admin-portal requests.
 *   5. Closing the tab / browser clears the key (sessionStorage scope).
 */

const USB_KEY_STORAGE_KEY = "sa_usb_key_v1";

export function getStoredUsbKey(): string | null {
  try {
    const v = sessionStorage.getItem(USB_KEY_STORAGE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function storeUsbKey(key: string): void {
  try { sessionStorage.setItem(USB_KEY_STORAGE_KEY, key); } catch { /* ignore */ }
  notifyChange();
}

export function clearUsbKey(): void {
  try { sessionStorage.removeItem(USB_KEY_STORAGE_KEY); } catch { /* ignore */ }
  notifyChange();
}

export async function verifyUsbKey(key: string): Promise<boolean> {
  try {
    const res = await fetch("/api/super-admin/usb/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchUsbGateEnforced(): Promise<boolean> {
  try {
    const res = await fetch("/api/super-admin/usb/status");
    if (!res.ok) return false;
    const body = await res.json() as { enforced?: boolean };
    return Boolean(body.enforced);
  } catch {
    return false;
  }
}

// Tiny event bus so the sidebar can re-render when the key state changes
// (storage events don't fire in the same tab).
type Listener = () => void;
const listeners = new Set<Listener>();
function notifyChange(): void { listeners.forEach((l) => { try { l(); } catch { /* ignore */ } }); }
export function onUsbKeyChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Reads a File (from <input type=file>) and returns its trimmed text body. */
export async function readKeyFile(file: File): Promise<string> {
  const text = await file.text();
  return text.replace(/\s+$/g, "").replace(/^\s+/g, "");
}
