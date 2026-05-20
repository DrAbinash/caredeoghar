# Care Diagnostics - Windows Desktop Distribution

## What You Get

| Output | File | Purpose |
|--------|------|---------|
| **Installer** | `Care Diagnostics Setup 1.0.0.exe` | One-click installer for users |
| **Portable** | `CareDiagnostics-Portable-1.0.0.exe` | No install needed — run directly |
| **Folder** | `win-unpacked/` | Raw files (for manual distribution) |

## Prerequisites

1. **Windows 10/11** PC (for building and running)
2. **Node.js 20+** installed
3. **npm** or **pnpm**

## Quick Start (Build)

```bash
cd care-diagnostics-windows
npm install
npm run build:win
```

Outputs go to `dist/` folder.

## Changes from Mobile App

The Windows desktop version includes these desktop-specific enhancements:

### Window Features
- **Fixed mobile aspect ratio** (420x780) that scales up on larger screens
- **Resizable window** with minimum size of 375x600
- **System title bar** with minimize, maximize, close
- **Centered on launch**
- **Desktop icon** using the clinic logo

### UX Enhancements
- **External links open in browser** — payment gateways, maps, etc.
- **Keyboard shortcut** `Ctrl+Shift+I` toggles developer tools
- **No browser address bar** — feels like a native app
- **Menu bar removed** — clean, app-like experience

### Desktop-Specific APIs
The preload script exposes `window.careDesktop`:
```js
window.careDesktop.getAppVersion()  // "1.0.0"
window.careDesktop.getPlatform()    // "win32"
window.careDesktop.toggleDevTools() // Toggle dev tools
```

## Distribution Options

### Option A: Installer (Recommended)
```bash
npm run build:win
```
Produces `dist/Care Diagnostics Setup 1.0.0.exe`
- Users double-click → Next → Install → Done
- Creates desktop shortcut + Start Menu entry
- Uninstalls cleanly via Control Panel

### Option B: Portable EXE
```bash
npm run build:portable
```
Produces `dist/CareDiagnostics-Portable-1.0.0.exe`
- No installation required
- Copy to USB stick, desktop, anywhere
- No registry entries, no admin rights needed
- Perfect for clinic reception computers

### Option C: Unpacked Folder
```bash
npm run build
```
Produces `dist/win-unpacked/` folder
- Copy entire folder to target PC
- Run `Care Diagnostics.exe` inside
- Good for enterprise deployment (Group Policy, etc.)

## Installing on Clinic Reception Computers

1. Copy the **installer** or **portable EXE** to the reception PC
2. If using installer: double-click → follow prompts
3. If using portable: double-click to run directly
4. The app auto-connects to your backend at `EXPO_PUBLIC_DOMAIN`
5. Patients can use it on the reception tablet/PC to book tests

## Configuring the Backend Domain

Before building, set your live domain so the app knows where your API is:

Edit `static-build/index.html` or build the Expo web app with:
```bash
EXPO_PUBLIC_DOMAIN=your-clinic.com npm run build
```

Or, for a quick manual fix after building:
1. Open `static-build/_expo/static/js/web/entry-*.js`
2. Search for `https://localhost`
3. Replace with `https://your-clinic.com`

## Auto-Start with Windows (Optional)

To have the app start when Windows boots:

1. After installation, find `Care Diagnostics` in Start Menu
2. Right-click → More → Open file location
3. Copy the shortcut
4. Press `Win+R` → type `shell:startup` → paste shortcut

## Updating the App

1. Build new version with updated `version` in `package.json`
2. Distribute new installer
3. Users run the new installer — it auto-replaces the old version
4. Portable users just replace the EXE file

## Troubleshooting

### App shows white screen
- Check that `static-build/index.html` exists
- Verify the `static-build` folder has `_expo/static/js/` and `_expo/static/css/`

### Can't connect to API
- The web build hardcodes `https://localhost` as fallback
- Set `EXPO_PUBLIC_DOMAIN` before building, or manually edit the JS bundle

### Icons show as boxes
- On desktop, icons render correctly via the bundled font files
- If still showing boxes, the `__node_modules` fonts weren't copied — rebuild with `npm run build`

### Window is too small/big
- Resize by dragging the window edges (min 375x600)
- The app is designed for a phone-like viewport but works at any size

## Security Notes

- The app uses `contextIsolation: true` — renderer can't access Node.js APIs
- External links open in the system browser, not inside the app
- No file system access from the web content
- All API calls go through normal HTTPS (same as mobile app)

## Support

- For app issues: Check `dist/win-unpacked/` logs or press `Ctrl+Shift+I` for dev tools
- For backend issues: Check your ERP server logs
- For build issues: Ensure Node.js 20+ and latest `electron-builder`
