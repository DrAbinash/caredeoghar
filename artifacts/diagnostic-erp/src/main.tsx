import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import { ERP_SESSION_KEY, type StaffSession } from "./lib/staffSession";
import "./index.css";

setAuthTokenGetter(() => {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(ERP_SESSION_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffSession;
    return parsed?.token ?? null;
  } catch {
    return null;
  }
});

createRoot(document.getElementById("root")!).render(<App />);
