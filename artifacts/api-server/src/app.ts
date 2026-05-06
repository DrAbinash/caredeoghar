import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

// Serve user-uploaded site assets (favicon, photos, hero images, etc.)
// from data/uploads. Path matches what /api/website/photos returns.
//
// X-Content-Type-Options: nosniff prevents browsers from MIME-sniffing a
// response away from the declared Content-Type. Combined with the upload
// handler enforcing a safe extension derived from the validated MIME type
// (never from the client-supplied filename), this ensures uploaded files
// cannot be served as HTML or JavaScript even if an attacker tried to
// smuggle active content through the photo upload endpoint.
app.use("/uploads", (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
}, express.static(path.resolve(artifactDir, "data/uploads")));

// =============================================================================
// Production single-port static serving (Windows .exe / portable build /
// Replit Autoscale Cloud Run deployment)
//
// When SERVE_STATIC_DIR points at a folder that contains:
//   <dir>/site/                 — clinic-site Vite build    (BASE_PATH=/)        ← root
//   <dir>/erp/                  — diagnostic-erp Vite build (BASE_PATH=/erp/)    ← staff
//   <dir>/super-admin-portal/   — super-admin-portal build  (BASE_PATH=/super-admin-portal/)
//
// the API server will also serve those static frontends with SPA fallback.
// This avoids needing nginx in the Windows desktop build — one Node process
// serves the API and all three web UIs. The same mechanism powers Replit
// Autoscale (Cloud Run = single container, single port) where the deploy
// build script (scripts/build-deploy.mjs) stages these folders into
// artifacts/api-server/dist/web. Has zero effect when SERVE_STATIC_DIR is
// unset (Replit dev workflows, where each artifact runs its own Vite server).
// =============================================================================
const rawStaticDir = process.env["SERVE_STATIC_DIR"];
// res.sendFile requires absolute paths; resolve relative values against cwd.
const staticDir = rawStaticDir ? path.resolve(rawStaticDir) : undefined;
if (staticDir) {
  const erpDir = path.join(staticDir, "erp");
  const siteDir = path.join(staticDir, "site");
  const adminDir = path.join(staticDir, "super-admin-portal");

  if (!existsSync(erpDir) || !existsSync(adminDir)) {
    logger.warn(
      { staticDir, erpDir, adminDir },
      "SERVE_STATIC_DIR is set but expected sub-folders are missing; static serving disabled",
    );
  } else {
    const hasSite = existsSync(siteDir);
    logger.info({ erpDir, siteDir, adminDir, hasSite }, "Serving frontends from disk");

    // Super Admin Portal (built with BASE_PATH=/super-admin-portal/)
    app.use("/super-admin-portal", express.static(adminDir, { index: false, fallthrough: true }));
    app.get(/^\/super-admin-portal(\/.*)?$/, (_req: Request, res: Response, next: NextFunction) => {
      res.sendFile(path.join(adminDir, "index.html"), (err) => {
        if (err) next(err);
      });
    });

    // Diagnostic ERP — staff app, mounted under /erp (built with BASE_PATH=/erp/).
    // The patient/staff portal lives at /erp/portal as a route inside this SPA.
    app.use("/erp", express.static(erpDir, { index: false, fallthrough: true }));
    app.get(/^\/erp(\/.*)?$/, (_req: Request, res: Response, next: NextFunction) => {
      res.sendFile(path.join(erpDir, "index.html"), (err) => {
        if (err) next(err);
      });
    });

    // Public Clinic Website (built with BASE_PATH=/) — catch-all SPA last.
    // Excludes /api/, /erp, /uploads, and /super-admin-portal so those routes
    // are handled by their own handlers above (and not swallowed by the SPA).
    if (hasSite) {
      app.use(express.static(siteDir, { index: false, fallthrough: true }));
      app.get(
        /^\/(?!api\/|erp\/|erp$|uploads\/|super-admin-portal\/|super-admin-portal$).*/,
        (_req: Request, res: Response, next: NextFunction) => {
          res.sendFile(path.join(siteDir, "index.html"), (err) => {
            if (err) next(err);
          });
        },
      );
    }
  }
}

export default app;
