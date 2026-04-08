import { Router } from "express";
import { db } from "@workspace/db";
import { accountsTable, vouchersTable } from "@workspace/db/schema";
import { eq, desc, and, gte, lte, like } from "drizzle-orm";

const router = Router();

// ─── Tally voucher type mapping ──────────────────────────────────────────────
const TALLY_VOUCHER_TYPE: Record<string, string> = {
  payment:       "Payment",
  receipt:       "Receipt",
  contra:        "Contra",
  journal:       "Journal",
  bank_transfer: "Contra",
  sales:         "Sales",
  purchase:      "Purchase",
};

// ─── Tally group → parent group mapping (double-entry group hierarchy) ────────
const TALLY_PARENT: Record<string, string> = {
  "Current Assets":           "Assets",
  "Fixed Assets":             "Assets",
  "Investments":              "Assets",
  "Loans & Advances (Asset)": "Assets",
  "Misc. Expenses (Asset)":   "Assets",
  "Current Liabilities":      "Liabilities",
  "Loans (Liability)":        "Liabilities",
  "Unsecured Loans":          "Liabilities",
  "Capital Account":          "Capital Account",
  "Reserves & Surplus":       "Capital Account",
  "Direct Income":            "Income",
  "Indirect Income":          "Income",
  "Direct Expenses":          "Expenses",
  "Indirect Expenses":        "Expenses",
  "Cash-in-Hand":             "Current Assets",
  "Bank Accounts":            "Current Assets",
  "Bank OD Accounts":         "Bank OD Accounts",
  "Duties & Taxes":           "Current Liabilities",
  "Sundry Creditors":         "Current Liabilities",
  "Sundry Debtors":           "Current Assets",
};

// ─── Accounts ────────────────────────────────────────────────────────────────

router.get("/accounts", async (_req, res) => {
  const rows = await db.select().from(accountsTable).orderBy(accountsTable.name);
  res.json(rows.map(r => ({ ...r, openingBalance: Number(r.openingBalance || 0) })));
});

router.post("/accounts", async (req, res) => {
  const { name, type, code, bankName, accountNumber, ifscCode, tallyGroup, openingBalance, openingBalanceType, gstApplicable, gstNumber, pan } = req.body;
  const [account] = await db
    .insert(accountsTable)
    .values({
      name, type, code, bankName, accountNumber, ifscCode,
      tallyGroup: tallyGroup || null,
      openingBalance: openingBalance != null ? String(openingBalance) : "0",
      openingBalanceType: openingBalanceType || "Dr",
      gstApplicable: !!gstApplicable,
      gstNumber: gstNumber || null,
      pan: pan || null,
    })
    .returning();
  res.status(201).json({ ...account, openingBalance: Number(account.openingBalance || 0) });
});

router.patch("/accounts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const allowed = ["name", "type", "code", "bankName", "accountNumber", "ifscCode", "isActive",
    "tallyGroup", "openingBalance", "openingBalanceType", "gstApplicable", "gstNumber", "pan"];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      updates[k] = k === "openingBalance" ? String(req.body[k]) : req.body[k];
    }
  }
  const [row] = await db.update(accountsTable).set(updates).where(eq(accountsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Account not found" });
  res.json({ ...row, openingBalance: Number(row.openingBalance || 0) });
});

// ─── Vouchers ────────────────────────────────────────────────────────────────

async function nextVoucherNumber(type: string): Promise<string> {
  const count = await db.select().from(vouchersTable);
  const prefix = type === "payment" ? "PV"
    : type === "receipt" ? "RV"
    : type === "contra" || type === "bank_transfer" ? "BT"
    : type === "sales" ? "SV"
    : type === "purchase" ? "PUR"
    : "JV";
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  return `${prefix}-${year}${month}-${String(count.length + 1).padStart(4, "0")}`;
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
  const { type, date, creditAccountId, debitAccountId, amount, particular, remark, performedBy, reference, narration } = req.body;
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
      narration,
    })
    .returning();
  res.status(201).json({ ...voucher, amount: Number(voucher.amount) });
});

router.delete("/vouchers/:id", async (req, res) => {
  await db.delete(vouchersTable).where(eq(vouchersTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

// ─── Ledger ──────────────────────────────────────────────────────────────────

router.get("/ledger", async (req, res) => {
  const { accountId, from, to } = req.query as Record<string, string>;

  const allAccounts = await db.select().from(accountsTable);
  const allVouchers = await db.select().from(vouchersTable).orderBy(vouchersTable.date, vouchersTable.createdAt);

  const ledger = allAccounts.map((account) => {
    const accIdStr = account.id.toString();
    // Opening balance
    const openBal = Number(account.openingBalance || 0);
    const openType = account.openingBalanceType || "Dr";
    let dr = openType === "Dr" ? openBal : 0;
    let cr = openType === "Cr" ? openBal : 0;
    let runningBalance = openType === "Dr" ? openBal : -openBal;

    const entries: {
      date: string; particular: string; dr: number; cr: number; balance: number; voucherNumber: string;
    }[] = [];

    // Opening balance entry (if non-zero)
    if (openBal > 0) {
      entries.push({
        date: "Opening",
        particular: "Opening Balance",
        voucherNumber: "OB",
        dr: openType === "Dr" ? openBal : 0,
        cr: openType === "Cr" ? openBal : 0,
        balance: runningBalance,
      });
    }

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

    return { account: { ...account, openingBalance: Number(account.openingBalance || 0) }, dr, cr, balance: dr - cr, entries };
  });

  const filtered = accountId ? ledger.filter(l => l.account.id.toString() === accountId) : ledger;
  res.json(filtered);
});

// ─── Trial Balance ────────────────────────────────────────────────────────────

router.get("/trial-balance", async (req, res) => {
  const { from, to } = req.query as Record<string, string>;

  const allAccounts = await db.select().from(accountsTable);
  const allVouchers = await db.select().from(vouchersTable).orderBy(vouchersTable.date);

  const rows = allAccounts.map((account) => {
    const accIdStr = account.id.toString();
    const openBal = Number(account.openingBalance || 0);
    const openType = account.openingBalanceType || "Dr";
    let dr = openType === "Dr" ? openBal : 0;
    let cr = openType === "Cr" ? openBal : 0;

    for (const v of allVouchers) {
      if (from && v.date < from) continue;
      if (to && v.date > to) continue;
      const amt = Number(v.amount);
      if (v.debitAccountId === accIdStr) dr += amt;
      if (v.creditAccountId === accIdStr) cr += amt;
    }

    const balance = dr - cr;
    const tallyGroup = account.tallyGroup || account.type;
    const parent = TALLY_PARENT[tallyGroup] || account.type;

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      tallyGroup,
      parent,
      dr,
      cr,
      balance,
      balanceDr: balance > 0 ? balance : 0,
      balanceCr: balance < 0 ? Math.abs(balance) : 0,
    };
  }).filter(r => r.dr > 0 || r.cr > 0);

  const totalDr = rows.reduce((s, r) => s + r.balanceDr, 0);
  const totalCr = rows.reduce((s, r) => s + r.balanceCr, 0);

  res.json({ rows, totalDr, totalCr, balanced: Math.abs(totalDr - totalCr) < 0.01 });
});

// ─── Profit & Loss ────────────────────────────────────────────────────────────

router.get("/profit-loss", async (req, res) => {
  const { from, to } = req.query as Record<string, string>;

  const allAccounts = await db.select().from(accountsTable);
  const allVouchers = await db.select().from(vouchersTable).orderBy(vouchersTable.date);

  const compute = (account: typeof allAccounts[0]) => {
    const accIdStr = account.id.toString();
    let dr = 0, cr = 0;
    for (const v of allVouchers) {
      if (from && v.date < from) continue;
      if (to && v.date > to) continue;
      const amt = Number(v.amount);
      if (v.debitAccountId === accIdStr) dr += amt;
      if (v.creditAccountId === accIdStr) cr += amt;
    }
    return { dr, cr, balance: dr - cr };
  };

  const income: { name: string; group: string; amount: number }[] = [];
  const expenses: { name: string; group: string; amount: number }[] = [];

  for (const account of allAccounts) {
    const grp = account.tallyGroup || "";
    const isIncome = grp.includes("Income") || account.type === "income";
    const isExpense = grp.includes("Expense") || account.type === "expense";
    if (!isIncome && !isExpense) continue;

    const { dr, cr } = compute(account);
    if (isIncome) {
      const amount = cr - dr; // Income is credit-positive
      if (amount !== 0) income.push({ name: account.name, group: grp || "Income", amount });
    } else {
      const amount = dr - cr; // Expense is debit-positive
      if (amount !== 0) expenses.push({ name: account.name, group: grp || "Expenses", amount });
    }
  }

  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
  const netProfit = totalIncome - totalExpenses;

  res.json({ income, expenses, totalIncome, totalExpenses, netProfit });
});

// ─── Balance Sheet ─────────────────────────────────────────────────────────────

router.get("/balance-sheet", async (req, res) => {
  const { asOf } = req.query as Record<string, string>;

  const allAccounts = await db.select().from(accountsTable);
  const allVouchers = await db.select().from(vouchersTable).orderBy(vouchersTable.date);

  const compute = (account: typeof allAccounts[0]) => {
    const accIdStr = account.id.toString();
    const openBal = Number(account.openingBalance || 0);
    const openType = account.openingBalanceType || "Dr";
    let dr = openType === "Dr" ? openBal : 0;
    let cr = openType === "Cr" ? openBal : 0;

    for (const v of allVouchers) {
      if (asOf && v.date > asOf) continue;
      const amt = Number(v.amount);
      if (v.debitAccountId === accIdStr) dr += amt;
      if (v.creditAccountId === accIdStr) cr += amt;
    }
    return { dr, cr, balance: dr - cr };
  };

  const assets: { name: string; group: string; amount: number }[] = [];
  const liabilities: { name: string; group: string; amount: number }[] = [];

  for (const account of allAccounts) {
    const grp = account.tallyGroup || "";
    const { dr, cr } = compute(account);
    const balance = dr - cr;
    if (balance === 0) continue;

    const isAsset = grp.includes("Asset") || grp.includes("Debtors") || grp === "Cash-in-Hand" || grp === "Bank Accounts" || account.type === "asset" || account.type === "cash" || account.type === "bank";
    const isLiability = grp.includes("Liabilities") || grp.includes("Creditors") || grp.includes("Capital") || grp.includes("Reserves") || account.type === "liability";

    if (isAsset && balance > 0) {
      assets.push({ name: account.name, group: grp || account.type, amount: balance });
    } else if (isLiability && balance < 0) {
      liabilities.push({ name: account.name, group: grp || account.type, amount: Math.abs(balance) });
    }
  }

  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);

  res.json({ assets, liabilities, totalAssets, totalLiabilities });
});

// ─── Tally XML Export ─────────────────────────────────────────────────────────

router.get("/export/tally", async (req, res) => {
  const { from, to } = req.query as Record<string, string>;

  const accounts = await db.select().from(accountsTable);
  let voucherQuery = db.select().from(vouchersTable).$dynamic();
  const conditions = [];
  if (from) conditions.push(gte(vouchersTable.date, from));
  if (to) conditions.push(lte(vouchersTable.date, to));
  if (conditions.length) voucherQuery = voucherQuery.where(and(...conditions));
  const vouchers = await voucherQuery.orderBy(vouchersTable.date);

  const accountMap = new Map(accounts.map(a => [a.id.toString(), a.name]));

  // Ledger masters XML
  const masterXml = accounts
    .map(a => {
      const parent = a.tallyGroup || (
        a.type === "cash" ? "Cash-in-Hand" :
        a.type === "bank" ? "Bank Accounts" :
        a.type === "income" ? "Direct Income" :
        a.type === "expense" ? "Indirect Expenses" :
        a.type === "liability" ? "Current Liabilities" :
        "Current Assets"
      );
      const openBal = Number(a.openingBalance || 0);
      const openType = a.openingBalanceType || "Dr";
      const openBalXml = openBal > 0
        ? `\n    <OPENINGBALANCE>${openType === "Dr" ? openBal.toFixed(2) : (-openBal).toFixed(2)}</OPENINGBALANCE>`
        : "";
      const gstXml = a.gstNumber
        ? `\n    <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>\n    <TAXREGISTRATIONNO>${a.gstNumber}</TAXREGISTRATIONNO>`
        : "";
      const panXml = a.pan ? `\n    <INCOMETAXNUMBER>${a.pan}</INCOMETAXNUMBER>` : "";

      return `  <LEDGER NAME="${escapeXml(a.name)}" RESERVEDNAME="">
    <PARENT>${escapeXml(parent)}</PARENT>
    <ISBILLWISEON>No</ISBILLWISEON>
    <ISACTIVE>${a.isActive ? "Yes" : "No"}</ISACTIVE>${openBalXml}${gstXml}${panXml}
    <LEDGERCODE>${a.code || ""}</LEDGERCODE>
  </LEDGER>`;
    })
    .join("\n");

  // Vouchers XML
  const voucherXml = vouchers
    .map(v => {
      const drName = accountMap.get(v.debitAccountId) || v.debitAccountId;
      const crName = accountMap.get(v.creditAccountId) || v.creditAccountId;
      const amt = Number(v.amount);
      const dateStr = v.date.replace(/-/g, "");
      const tallyType = TALLY_VOUCHER_TYPE[v.type] || "Journal";
      const narration = v.narration || v.particular + (v.remark ? " - " + v.remark : "");
      const refXml = v.reference ? `\n    <BILLALLOCATIONS.LIST>\n      <NAME>${escapeXml(v.reference)}</NAME>\n      <BILLTYPE>On Account</BILLTYPE>\n      <AMOUNT>-${amt.toFixed(2)}</AMOUNT>\n    </BILLALLOCATIONS.LIST>` : "";

      return `  <VOUCHER VCHTYPE="${tallyType}" ACTION="Create">
    <DATE>${dateStr}</DATE>
    <VOUCHERNUMBER>${escapeXml(v.voucherNumber)}</VOUCHERNUMBER>
    <REFERENCE>${escapeXml(v.reference || "")}</REFERENCE>
    <NARRATION>${escapeXml(narration)}</NARRATION>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${escapeXml(drName)}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <AMOUNT>-${amt.toFixed(2)}</AMOUNT>${refXml}
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${escapeXml(crName)}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <AMOUNT>${amt.toFixed(2)}</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
  </VOUCHER>`;
    })
    .join("\n");

  const dateRange = from && to
    ? `<!-- Date Range: ${from} to ${to} -->`
    : `<!-- All dates -->`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
${dateRange}
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY></SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
${masterXml}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY></SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
${voucherXml}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Disposition", `attachment; filename=tally-export${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.xml`);
  res.send(xml);
});

function escapeXml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default router;
