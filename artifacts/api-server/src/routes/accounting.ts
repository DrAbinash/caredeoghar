import { Router } from "express";
import { db } from "@workspace/db";
import { accountsTable, vouchersTable } from "@workspace/db/schema";
import { eq, desc, and, gte, lte, like } from "drizzle-orm";

const router = Router();

// ─── Accounts ────────────────────────────────────────────────

router.get("/accounts", async (_req, res) => {
  const rows = await db.select().from(accountsTable).orderBy(accountsTable.name);
  res.json(rows);
});

router.post("/accounts", async (req, res) => {
  const { name, type, code, bankName, accountNumber, ifscCode } = req.body;
  const [account] = await db
    .insert(accountsTable)
    .values({ name, type, code, bankName, accountNumber, ifscCode })
    .returning();
  res.status(201).json(account);
});

router.patch("/accounts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const allowed = ["name", "type", "code", "bankName", "accountNumber", "ifscCode", "isActive"];
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  const [row] = await db.update(accountsTable).set(updates).where(eq(accountsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Account not found" });
  res.json(row);
});

// ─── Vouchers ────────────────────────────────────────────────

// Voucher number counter
let voucherCounter = 0;
async function nextVoucherNumber(type: string): Promise<string> {
  const count = await db.select().from(vouchersTable);
  voucherCounter = count.length;
  const prefix = type === "payment" ? "PV" : type === "receipt" ? "RV" : type === "bank_transfer" ? "BT" : "JV";
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  return `${prefix}-${year}${month}-${String(++voucherCounter).padStart(4, "0")}`;
}

router.get("/vouchers", async (req, res) => {
  const { type, from, to, q } = req.query as Record<string, string>;

  let query = db.select().from(vouchersTable).$dynamic();
  const conditions = [];

  if (type && type !== "all") conditions.push(eq(vouchersTable.type, type));
  if (from) conditions.push(gte(vouchersTable.date, from));
  if (to) conditions.push(lte(vouchersTable.date, to));
  if (q) conditions.push(like(vouchersTable.particular, `%${q}%`));

  if (conditions.length) query = query.where(and(...conditions));

  const rows = await query.orderBy(desc(vouchersTable.createdAt));
  res.json(rows.map(v => ({ ...v, amount: Number(v.amount) })));
});

router.post("/vouchers", async (req, res) => {
  const { type, date, creditAccountId, debitAccountId, amount, particular, remark, performedBy, reference } = req.body;
  const voucherNumber = await nextVoucherNumber(type);
  const [voucher] = await db
    .insert(vouchersTable)
    .values({
      voucherNumber,
      type,
      date,
      creditAccountId: creditAccountId.toString(),
      debitAccountId: debitAccountId.toString(),
      amount: amount.toString(),
      particular,
      remark,
      performedBy,
      reference,
    })
    .returning();
  res.status(201).json({ ...voucher, amount: Number(voucher.amount) });
});

router.delete("/vouchers/:id", async (req, res) => {
  await db.delete(vouchersTable).where(eq(vouchersTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

// ─── Ledger ──────────────────────────────────────────────────

router.get("/ledger", async (req, res) => {
  const { accountId, from, to } = req.query as Record<string, string>;

  const allAccounts = await db.select().from(accountsTable);
  const allVouchers = await db.select().from(vouchersTable).orderBy(vouchersTable.date, vouchersTable.createdAt);

  const ledger = allAccounts.map((account) => {
    const accIdStr = account.id.toString();
    let dr = 0, cr = 0;
    const entries: { date: string; particular: string; dr: number; cr: number; balance: number; voucherNumber: string }[] = [];
    let runningBalance = 0;

    for (const v of allVouchers) {
      const afterFrom = !from || v.date >= from;
      const beforeTo = !to || v.date <= to;
      if (accountId && accountId !== accIdStr) continue;
      if (!afterFrom || !beforeTo) continue;

      const amt = Number(v.amount);
      const isDebit = v.debitAccountId === accIdStr;
      const isCredit = v.creditAccountId === accIdStr;

      if (!isDebit && !isCredit) continue;

      if (isDebit) { dr += amt; runningBalance += amt; }
      if (isCredit) { cr += amt; runningBalance -= amt; }

      entries.push({
        date: v.date,
        particular: v.particular,
        voucherNumber: v.voucherNumber,
        dr: isDebit ? amt : 0,
        cr: isCredit ? amt : 0,
        balance: runningBalance,
      });
    }

    return { account, dr, cr, balance: dr - cr, entries };
  });

  const filtered = accountId ? ledger.filter(l => l.account.id.toString() === accountId) : ledger;
  res.json(filtered);
});

// ─── Tally Export ────────────────────────────────────────────

router.get("/export/tally", async (_req, res) => {
  const accounts = await db.select().from(accountsTable);
  const vouchers = await db.select().from(vouchersTable).orderBy(vouchersTable.date);

  const accountMap = new Map(accounts.map(a => [a.id.toString(), a.name]));

  const masterXml = accounts
    .map(
      a => `  <LEDGER NAME="${a.name}" RESERVEDNAME="">
    <PARENT>${a.type.toUpperCase()}</PARENT>
    <ISBILLWISEON>No</ISBILLWISEON>
  </LEDGER>`
    )
    .join("\n");

  const voucherXml = vouchers
    .map(v => {
      const drName = accountMap.get(v.debitAccountId) || v.debitAccountId;
      const crName = accountMap.get(v.creditAccountId) || v.creditAccountId;
      const amt = Number(v.amount);
      const dateStr = v.date.replace(/-/g, "");
      return `  <VOUCHER VCHTYPE="${v.type.toUpperCase()}" ACTION="Create">
    <DATE>${dateStr}</DATE>
    <VOUCHERNUMBER>${v.voucherNumber}</VOUCHERNUMBER>
    <NARRATION>${v.particular}${v.remark ? " - " + v.remark : ""}</NARRATION>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${drName}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <AMOUNT>-${amt.toFixed(2)}</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${crName}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <AMOUNT>${amt.toFixed(2)}</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
  </VOUCHER>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
${masterXml}
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
${voucherXml}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Disposition", "attachment; filename=tally-export.xml");
  res.send(xml);
});

export default router;
