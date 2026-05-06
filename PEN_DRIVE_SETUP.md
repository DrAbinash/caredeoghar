# Super-Admin USB Pen Drive — Setup Guide

The Super Admin Portal is gated by a physical USB pen drive. Without the pen
drive, the Super Admin link does not appear in the billing UI and the
super-admin login endpoint refuses every request — regardless of who you are
or whether you know the PIN.

This works the same way on:

- the cloud deploy (e.g. `caredeoghar.replit.app`)
- the Windows portable / desktop build that runs from the pen drive itself

## One-time setup (do this once)

1. **Generate a strong random key** on any computer:
   ```bash
   openssl rand -hex 32
   ```
   This produces a 64-character string. Treat it like a password — do not
   share it, do not paste it into chat.

2. **Save the same value in TWO places, exactly identical:**

   a. **As the Replit secret `SUPER_ADMIN_USB_KEY`** in your project (Tools →
      Secrets). The api-server reads this at startup. If unset, the USB gate
      stays disabled and super-admin works on PIN alone (back-compat).

   b. **As a plain text file named `superadmin.key` on your USB pen drive.**
      Just the value — no quotes, no newline tricks needed. Notepad / nano
      will work fine.

3. **Plug the pen drive into the computer you bill from.**

## Daily use — billing UI (cloud or local)

1. Plug in the pen drive.
2. In the billing app sidebar, scroll to the bottom — there is a small
   dashed **"Insert USB key"** button. (You will only see it if the gate is
   enforced on the server.)
3. Click it → file picker opens → pick `superadmin.key` from the pen drive.
4. The button turns into an amber **"Super Admin"** link with a `KEY` badge.
5. Click "Super Admin" → opens the Super Admin Portal in a new tab. Log in
   with PIN as usual.
6. When done, click **"Eject USB key"** below the Super Admin link to clear
   the key from this browser session, OR just close the tab — the key only
   lives in `sessionStorage`, which dies with the tab.

## Direct super-admin portal access

If you open `/super-admin-portal/` directly (without going through the billing
UI), you'll be greeted by the **"Insert USB Key"** unlock screen first. Same
file picker — pick `superadmin.key`, then the PIN screen appears.

## What happens if someone steals the cloud URL

Nothing. Without the `superadmin.key` file content, every super-admin
endpoint returns `401 USB key required`. The PIN form on the portal won't
even submit. The Super Admin link in the billing UI is invisible.

## Rotating the key

If a pen drive is lost or you suspect the key leaked:

1. Generate a new value (`openssl rand -hex 32`).
2. Update the Replit secret `SUPER_ADMIN_USB_KEY`.
3. Restart the api-server workflow (it reads the env at startup).
4. Re-write `superadmin.key` on a fresh pen drive with the new value.
5. Old pen drives stop working immediately.

## Disabling the gate (NOT recommended)

Delete the `SUPER_ADMIN_USB_KEY` secret. The api-server will log a warning at
startup and let super-admin requests through with PIN-only auth (legacy
behavior). The "Insert USB key" button disappears from the billing UI sidebar.
