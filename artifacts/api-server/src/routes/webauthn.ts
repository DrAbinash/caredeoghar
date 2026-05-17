/**
 * webauthn.ts
 * FIDO2 / WebAuthn / YubiKey staff authentication routes.
 *
 * Registration: POST /api/auth/webauthn/register/begin -> /api/auth/webauthn/register/complete
 * Authentication: POST /api/auth/webauthn/authenticate/begin -> /api/auth/webauthn/authenticate/complete
 * Credentials: GET /api/auth/webauthn/credentials (staff auth required)
 */
import { Router } from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { db } from "@workspace/db";
import { webauthnCredentialsTable, usersTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import type { StaffAuthRequest } from "../middleware/requireStaffAuth";
import {
  storeChallenge,
  consumeChallenge,
  getCredentialsForUser,
  saveCredential,
  deleteCredential,
  updateCredentialCounter,
  createWebAuthnSession,
  rpFromReq,
} from "../lib/webauthnService";

const router = Router();

// ── Registration ──

// POST /api/auth/webauthn/register/begin
router.post("/register/begin", async (req: StaffAuthRequest, res) => {
  const staff = req.staffSession;
  if (!staff) { res.status(401).json({ error: "Staff authentication required" }); return; }

  const { rpID } = rpFromReq(req);
  const existing = await getCredentialsForUser(staff.subjectId);

  const opts = await generateRegistrationOptions({
    rpName: "Diagnostic Center ERP",
    rpID,
    userName: staff.subjectName,
    userDisplayName: staff.subjectName,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: {
      authenticatorAttachment: undefined, // accept both platform and cross-platform (YubiKey)
      userVerification: "required",
      residentKey: "discouraged",
    },
  });
  storeChallenge(opts.challenge, staff.subjectId);
  res.json(opts);
});

// POST /api/auth/webauthn/register/complete
router.post("/register/complete", async (req, res) => {
  const body = req.body as { response?: unknown; expectedChallenge?: string; deviceName?: string };
  if (!body.response || !body.expectedChallenge) { res.status(400).json({ error: "Missing response or challenge" }); return; }

  const consumed = consumeChallenge(body.expectedChallenge);
  if (!consumed || !consumed.userId) { res.status(400).json({ error: "Invalid or expired challenge" }); return; }

  const { rpID, origin } = rpFromReq(req);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
      expectedChallenge: body.expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "Verification failed" });
  }
  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: "Registration not verified" });
  }

  const info = verification.registrationInfo as unknown as {
    credential?: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] };
    credentialID?: Uint8Array | string;
    credentialPublicKey?: Uint8Array;
    counter?: number;
  };
  const credentialId = info.credential?.id
    ?? (typeof info.credentialID === "string" ? info.credentialID : Buffer.from(info.credentialID ?? new Uint8Array()).toString("base64url"));
  const publicKey = info.credential?.publicKey ?? info.credentialPublicKey ?? new Uint8Array();
  const counter = info.credential?.counter ?? info.counter ?? 0;
  const transports = info.credential?.transports;

  const [row] = await saveCredential(
    consumed.userId,
    credentialId,
    Buffer.from(publicKey).toString("base64url"),
    counter,
    body.deviceName || "Security Key",
    transports,
  ).then((rows) => [rows]);

  res.status(201).json({ ok: true, id: row.id, credentialId });
});

// ── Authentication ──

// POST /api/auth/webauthn/authenticate/begin
router.post("/authenticate/begin", async (req, res) => {
  const { rpID } = rpFromReq(req);
  const allCreds = await db.select().from(webauthnCredentialsTable);
  const opts = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: allCreds.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (JSON.parse(c.transports) as Array<"usb" | "nfc" | "ble" | "internal" | "hybrid">) : undefined,
    })),
  });
  storeChallenge(opts.challenge);
  res.json(opts);
});

// POST /api/auth/webauthn/authenticate/complete
router.post("/authenticate/complete", async (req, res) => {
  const body = req.body as { response?: unknown; expectedChallenge?: string };
  if (!body.response || !body.expectedChallenge) { res.status(400).json({ error: "Missing response or challenge" }); return; }
  if (!consumeChallenge(body.expectedChallenge)) { res.status(400).json({ error: "Invalid or expired challenge" }); return; }

  const credentialId = (body.response as { id?: string }).id;
  if (!credentialId) { res.status(400).json({ error: "Missing credentialId" }); return; }

  const cred = await db
    .select()
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.credentialId, credentialId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!cred) { res.status(404).json({ error: "Credential not found" }); return; }

  const { rpID, origin } = rpFromReq(req);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge: body.expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credentialId,
        publicKey: new Uint8Array(Buffer.from(cred.publicKey, "base64url")),
        counter: cred.counter,
      },
    });
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "Verification failed" });
  }
  if (!verification.verified) { res.status(400).json({ error: "Authentication failed" }); return; }

  const newCounter = verification.authenticationInfo?.newCounter ?? cred.counter;
  await updateCredentialCounter(cred.id, newCounter);

  // Lookup user and create session
  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, cred.userId))
    .limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const token = await createWebAuthnSession(user.id, user.name);
  res.json({ token, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), user: { id: user.id, name: user.name, role: user.role } });
});

// ── Credential management ──

// GET /api/auth/webauthn/credentials
router.get("/credentials", async (req: StaffAuthRequest, res) => {
  const staff = req.staffSession;
  if (!staff) { res.status(401).json({ error: "Staff authentication required" }); return; }
  const rows = await getCredentialsForUser(staff.subjectId);
  res.json(rows);
});

// DELETE /api/auth/webauthn/credentials/:id
router.delete("/credentials/:id", async (req: StaffAuthRequest, res) => {
  const staff = req.staffSession;
  if (!staff) { res.status(401).json({ error: "Staff authentication required" }); return; }
  const credId = Number(req.params.id);
  if (!Number.isFinite(credId)) { res.status(400).json({ error: "Invalid id" }); return; }
  // Verify ownership
  const [cred] = await db.select().from(webauthnCredentialsTable).where(eq(webauthnCredentialsTable.id, credId)).limit(1);
  if (!cred) { res.status(404).json({ error: "Credential not found" }); return; }
  if (cred.userId !== staff.subjectId) { res.status(403).json({ error: "Not your credential" }); return; }
  await deleteCredential(credId);
  res.json({ ok: true });
});

export const webauthnRouter = router;
