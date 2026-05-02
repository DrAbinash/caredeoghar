import path from "node:path";
import { existsSync } from "node:fs";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// =============================================================================
// Production single-port static serving (Windows .exe / portable build)
//
// When SERVE_STATIC_DIR points at a folder that contains:
//   <dir>/erp/                  — diagnostic-erp Vite build (BASE_PATH=/)
//   <dir>/super-admin-portal/   — super-admin-portal build (BASE_PATH=/super-admin-portal/)
//
// the API server will also serve those static frontends with SPA fallback.
// This avoids needing nginx in the Windows desktop build — one Node process
// serves the API and both web UIs. Has zero effect when SERVE_STATIC_DIR is
// unset (Replit dev / Docker compose / etc. where nginx or Vite handles it).
// =============================================================================
const staticDir = process.env["SERVE_STATIC_DIR"];
if (staticDir) {
  const erpDir = path.join(staticDir, "erp");
  const adminDir = path.join(staticDir, "super-admin-portal");

  if (!existsSync(erpDir) || !existsSync(adminDir)) {
    logger.warn(
      { staticDir, erpDir, adminDir },
      "SERVE_STATIC_DIR is set but expected sub-folders are missing; static serving disabled",
    );
  } else {
    logger.info({ erpDir, adminDir }, "Serving frontends from disk");

    // Super Admin Portal (built with BASE_PATH=/super-admin-portal/)
    app.use("/super-admin-portal", express.static(adminDir, { index: false, fallthrough: true }));
    app.get(/^\/super-admin-portal(\/.*)?$/, (_req: Request, res: Response, next: NextFunction) => {
      res.sendFile(path.join(adminDir, "index.html"), (err) => {
        if (err) next(err);
      });
    });

    // Main Diagnostic ERP (built with BASE_PATH=/) — catch-all SPA last
    app.use(express.static(erpDir, { index: false, fallthrough: true }));
    app.get(/^\/(?!api\/).*/, (_req: Request, res: Response, next: NextFunction) => {
      res.sendFile(path.join(erpDir, "index.html"), (err) => {
        if (err) next(err);
      });
    });
  }
}

export default app;
