/**
 * Electron main process for Care Diagnostics Windows Desktop App.
 * Loads the bundled Expo web build as a standalone desktop window.
 */

const { app, BrowserWindow, Menu, ipcMain, shell, Tray, nativeImage, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// Disable default menu (we build our own)
Menu.setApplicationMenu(null);

// Keep a global reference to prevent GC
let mainWindow;
let tray;

// Window state persistence
const STATE_FILE = path.join(app.getPath("userData"), "window-state.json");
function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {}
  return { width: 420, height: 780, x: undefined, y: undefined, maximized: false };
}
function saveWindowState() {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const state = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: mainWindow.isMaximized(),
  };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {}
}

// Load API domain from config or env
function getApiDomain() {
  // 1. Check config.json next to the app
  const configPath = path.join(__dirname, "..", "config.json");
  try {
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (cfg.apiDomain) return cfg.apiDomain;
    }
  } catch {}
  // 2. Check environment variable
  if (process.env.CARE_DIAGNOSTICS_API_DOMAIN) {
    return process.env.CARE_DIAGNOSTICS_API_DOMAIN;
  }
  // 3. Default to localhost for development
  return "localhost";
}

function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width || 420,
    height: state.height || 780,
    x: state.x,
    y: state.y,
    minWidth: 375,
    minHeight: 600,
    title: "Care Diagnostics",
    icon: path.join(__dirname, "..", "static-build", "assets", "images", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    frame: true,
    resizable: true,
    maximizable: true,
    center: !state.x,
    show: false,
    backgroundColor: "#ffffff",
  });

  if (state.maximized) {
    mainWindow.maximize();
  }

  // Load the bundled Expo web app
  const indexPath = path.join(__dirname, "..", "static-build", "index.html");
  if (fs.existsSync(indexPath)) {
    mainWindow.loadFile(indexPath);
  } else {
    console.error("Build not found:", indexPath);
    dialog.showErrorBox("Care Diagnostics", "App files not found. Please reinstall.");
    app.quit();
    return;
  }

  // Inject API domain and electron detection into the web app
  mainWindow.webContents.on("dom-ready", () => {
    const apiDomain = getApiDomain();
    mainWindow.webContents.executeJavaScript(`
      window.__CARE_DESKTOP__ = true;
      window.__CARE_API_DOMAIN__ = "${apiDomain}";
      localStorage.setItem("__care_api_domain__", "${apiDomain}");
    `);
  });

  // Show when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (!state.maximized && process.platform === "win32") {
      mainWindow.setSize(state.width || 420, state.height || 780);
    }
  });

  // Handle external links: open in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Save window state on close
  mainWindow.on("close", () => {
    saveWindowState();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Create tray icon
  createTray();
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "static-build", "assets", "images", "icon.png");
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) throw new Error("Icon empty");
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch {
    // Fallback: create a simple colored square
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip("Care Diagnostics");
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Open Care Diagnostics",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]));

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });
}

// App lifecycle
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep tray running; don't quit
    // app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// IPC handlers
ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("get-platform", () => process.platform);
ipcMain.handle("get-api-domain", () => getApiDomain());
ipcMain.on("toggle-devtools", () => {
  if (mainWindow) mainWindow.webContents.toggleDevTools();
});
ipcMain.on("minimize-to-tray", () => {
  if (mainWindow) mainWindow.hide();
});
ipcMain.handle("show-save-dialog", async (_event, options) => {
  if (!mainWindow) return { canceled: true };
  return dialog.showSaveDialog(mainWindow, options);
});
