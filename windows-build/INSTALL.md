# DiagnoCenter Offline Desktop Installation Guide

## What You Need

- One main computer (Windows PC) to act as the server
- Other computers on the same Wi-Fi / LAN (can be any computer with Chrome or Edge)
- The installer file from this folder

## Step 1: Download the Installer

1. In the **Files** panel on the left, click `windows-build` → `dist`
2. Right-click `DiagnoCenter-Setup.exe` and choose **Download**
3. Save it to your computer (e.g., Desktop or Downloads)

## Step 2: Install on the Main Server PC

1. Double-click `DiagnoCenter-Setup.exe`
2. Follow the installer wizard (Next → Next → Install → Finish)
3. It will install to `C:\Program Files\DiagnoCenter\`

## Step 3: Start the Server

1. Go to `C:\Program Files\DiagnoCenter\`
2. Double-click `DiagnoCenter.exe`
3. A black console window will open — **do not close it**
4. Wait about 30 seconds for "Launcher ready"
5. Look for a box showing:
   ```
   LAN ACCESS -- Other computers can reach this server at:
     http://192.168.1.50:8888/
   ```
   (The IP will be different for your clinic)

> **Important:** Keep this window open all day. If you close it, the server stops.

## Step 4: Open Firewall (if needed)

If other computers can't connect:

1. Press `Win + R`, type `cmd`, press Enter
2. Copy-paste this exact command and press Enter:
   ```
   netsh advfirewall firewall add rule name="DiagnoCenter" dir=in action=allow protocol=TCP localport=8888
   ```
3. You should see "Ok." — done!

## Step 5: Use on Other Computers

No installation needed on other PCs!

1. Open **Google Chrome** or **Microsoft Edge**
2. In the address bar, type the LAN URL from Step 3, e.g.:
   ```
   http://192.168.1.50:8888/
   ```
3. Press Enter
4. The login screen appears — log in as normal

## Daily Routine

| Task | How |
|------|-----|
| **Start the server** | Double-click `DiagnoCenter.exe` on the main PC |
| **Stop the server** | Close the black console window (or press Ctrl+C) |
| **Print reports** | Works from any computer that has a printer installed |

## Tips

- **Pin to taskbar:** Right-click `DiagnoCenter.exe` → Pin to taskbar for one-click start
- **Auto-start:** Press `Win + R`, type `shell:startup`, drag `DiagnoCenter.exe` into that folder
- **Backup:** The database is in `C:\Program Files\DiagnoCenter\data\pgsql\`. Copy the `data` folder regularly to a USB drive
- **Updates:** Use `DiagnoCenter-Update.zip` inside the ERP (Settings → System Update) to patch without reinstalling

## Optional: Electron Desktop App

If you prefer a desktop window instead of a browser:

- Download `dist/electron/DiagnoCenter-Desktop-Setup.exe`
- Install it on the main PC
- It runs in the system tray — right-click the tray icon to see LAN URLs

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Cannot GET /" in browser | Server not ready yet — wait 30 more seconds |
| Other PC says "This site can't be reached" | Check Step 4 (firewall) or verify both PCs are on same Wi-Fi |
| Forgot the LAN IP | On the server PC, press `Win + R`, type `cmd`, type `ipconfig`, look for "IPv4 Address" under Wi-Fi or Ethernet |
| Slow on client PCs | The server PC should be the fastest computer in the clinic |

## Need Help?

Contact your software support with:
1. The LAN URL (e.g., `http://192.168.1.50:8888/`)
2. A screenshot of any error message
3. Whether the black console window shows "Launcher ready"
