# Care Diagnostics - Windows Desktop App

A standalone Electron desktop wrapper for the Care Diagnostics mobile web app.

## Folder Structure

```
care-diagnostics-windows/
  src/
    main.js       # Electron main process (window, tray, IPC)
    preload.js    # Secure bridge between web and desktop
  static-build/   # Expo web build (bundled React Native app)
    index.html
    _expo/
    assets/
  config.json     # API domain + clinic settings
  package.json    # Electron + builder config
  WINDOWS_GUIDE.md # Full build & distribution guide
```

## What's Different from Mobile

| Feature | Mobile | Windows Desktop |
|---------|--------|-----------------|
| Window | Full-screen | Resizable 420x780 (phone-like) |
| Icons | Native font rendering | Same (bundled in static build) |
| API calls | Direct to HTTPS domain | Same (via config.json) |
| Navigation | Touch/swipe | Mouse + keyboard |
| External links | In-app browser | Opens in system browser |
| Dev tools | Shake gesture | Ctrl+Shift+I |
| Minimize | App switcher | System tray icon |
| Updates | App Store / Play Store | Replace installer EXE |

## Quick Build

```bash
cd care-diagnostics-windows
npm install
npm run build:win    # Creates installer + portable EXE
```

## Outputs

- `dist/Care Diagnostics Setup 1.0.0.exe` — Installer
- `dist/CareDiagnostics-Portable-1.0.0.exe` — Portable
- `dist/win-unpacked/` — Raw files for manual deployment

## Configuring API Domain

Edit `config.json` before distributing:

```json
{
  "apiDomain": "your-clinic-domain.com",
  "clinicName": "Care Diagnostics",
  "clinicAddress": "Subhash Chowk, Deoghar"
}
```

The app will call `https://your-clinic-domain.com/api/public/booking/...`
