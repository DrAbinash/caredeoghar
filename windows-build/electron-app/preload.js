// Preload runs in the renderer with Node access but no global pollution.
// We don't expose anything yet — the renderer just talks to the same HTTP API
// it would in the browser. Reserved for future native integrations
// (e.g. fingerprint device, printing, OS file picker).
"use strict";
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("diagnosticERP", {
  isDesktop: true,
  platform: process.platform,
});
