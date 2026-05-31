// Windows Image Acquisition (WIA) adapter.
// Uses an embedded PowerShell script to trigger scanning via the WIA COM API.
// Works with any WIA-compatible flatbed or document-feeder scanner.
//
// REAL DEPLOYMENT:
// 1. Ensure the scanner driver is installed and visible in Windows Fax and Scan.
// 2. Run the bridge with BRIDGE_SCAN_VENDOR=wia
// 3. If you have multiple scanners, set WIA_DEVICE_INDEX (1-based) to pick one.
//
// TROUBLESHOOTING:
// - "No WIA devices found": Install the scanner driver or check USB connection.
// - "Access is denied": Run PowerShell with appropriate execution policy; the
//   bridge already uses -ExecutionPolicy Bypass.
// - Wrong scanner selected: Set WIA_DEVICE_INDEX env var.

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEVICE_INDEX = Number(process.env.WIA_DEVICE_INDEX ?? "1");
const DPI = Number(process.env.WIA_DPI ?? "300");
const COLOR_MODE = Number(process.env.WIA_COLOR_MODE ?? "1"); // 1 = Color, 2 = Grayscale, 4 = B&W

const PS_SCRIPT = `param(
  [string]$OutputPath,
  [int]$DeviceIndex = 1,
  [int]$DPI = 300,
  [int]$ColorMode = 1
)
try {
  $deviceManager = New-Object -ComObject WIA.DeviceManager
  if ($deviceManager.DeviceInfos.Count -eq 0) {
    Write-Error "No WIA devices found"
    exit 1
  }
  if ($DeviceIndex -gt $deviceManager.DeviceInfos.Count) {
    Write-Error "Device index $DeviceIndex exceeds available devices ($($deviceManager.DeviceInfos.Count))"
    exit 1
  }
  $deviceInfo = $deviceManager.DeviceInfos.Item($DeviceIndex)
  $device = $deviceInfo.Connect()
  $item = $device.Items.Item(1)
  $props = $item.Properties
  try { $props["6147"].Value = $ColorMode } catch {}
  try { $props["6148"].Value = $DPI } catch {}
  try { $props["6149"].Value = $DPI } catch {}
  $imageFile = $item.Transfer()
  $imageFile.SaveFile($OutputPath)
  Write-Output "OK"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}`;

function execAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || stdout || err.message));
      else resolve({ stdout, stderr });
    });
  });
}

export default {
  name: "wia",
  async status() {
    try {
      const { stdout } = await execAsync("powershell", [
        "-ExecutionPolicy", "Bypass",
        "-Command",
        `try { $d = New-Object -ComObject WIA.DeviceManager; $d.DeviceInfos.Count } catch { Write-Output 0 }`,
      ]);
      const count = parseInt(stdout.trim(), 10) || 0;
      return {
        deviceConnected: count > 0,
        deviceCount: count,
        deviceIndex: DEVICE_INDEX,
        type: "wia",
        dpi: DPI,
      };
    } catch (e) {
      return { deviceConnected: false, error: e.message, type: "wia" };
    }
  },

  async scan() {
    const outPath = join(tmpdir(), `scan-${Date.now()}.jpg`);
    try {
      await execAsync("powershell", [
        "-ExecutionPolicy", "Bypass",
        "-Command",
        PS_SCRIPT,
        "-OutputPath", outPath,
        "-DeviceIndex", String(DEVICE_INDEX),
        "-DPI", String(DPI),
        "-ColorMode", String(COLOR_MODE),
      ]);
      const buffer = await fs.readFile(outPath);
      await fs.unlink(outPath).catch(() => {});
      return {
        imageBase64: buffer.toString("base64"),
        mimeType: "image/jpeg",
      };
    } catch (e) {
      const msg = e.message || "";
      // Detect common "device busy" errors from WIA COM
      if (msg.includes("busy") || msg.includes("in use") || msg.includes("0x80210006") || msg.includes("0x8021000A") || msg.includes("already in use") || msg.includes("another app")) {
        const err = new Error(msg);
        err.code = "WIA_DEVICE_BUSY";
        throw err;
      }
      throw new Error(`WIA scan failed: ${msg}`);
    }
  },
};
