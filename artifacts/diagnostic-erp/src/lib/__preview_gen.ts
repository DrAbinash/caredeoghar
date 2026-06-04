
  import { buildBillPrintHtml } from "./printBill.ts";
  import { buildPremiumBillPrintHtml } from "./premiumBillPrint.ts";

  const clinic = {"name":"Care Diagnostics","tagline":"Advanced Diagnostic & Imaging Centre","address":"123 Health Street, Deoghar, Jharkhand 814112","phone":"+91 98765 43210","email":"care@diagnostics.com","website":"www.carediagnostics.com","gstin":"20ABCDE1234F1Z5","logoDataUrl":null,"footerNote":"Thank you for choosing Care Diagnostics","billPrintCopies":1,"qrOnBillEnabled":true,"billShowCode":true,"billShowCategory":true};
  const bill1 = {"billNumber":"2026050001","subtotal":500,"discount":0,"taxAmount":0,"totalAmount":500,"paidAmount":500,"balanceAmount":0,"status":"paid","createdAt":"2026-05-15T10:30:00Z","patient":{"firstName":"Ramesh","lastName":"Kumar","patientId":"CD-2026-001","phone":"+91 98765 12345","gender":"Male","dateOfBirth":"1985-03-15"},"order":{"doctor":{"name":"Dr. S. Sharma"},"tests":[{"price":500,"status":"active","test":{"code":"CBC001","name":"Complete Blood Count (CBC)","category":"Pathology"}}]},"payments":[{"method":"cash","amount":500,"referenceNumber":null,"createdAt":"2026-05-15T10:30:00Z"}],"testTokens":null,"tokenNo":42};
  const bill2 = {"billNumber":"2026050002","subtotal":1200,"discount":200,"taxAmount":0,"totalAmount":1000,"paidAmount":1000,"balanceAmount":0,"status":"paid","createdAt":"2026-05-15T14:20:00Z","patient":{"firstName":"Priya","lastName":"Singh","patientId":"CD-2026-002","phone":"+91 87654 32109","gender":"Female","dateOfBirth":"1992-07-20"},"order":{"doctor":{"name":"Dr. A. Gupta"},"tests":[{"price":800,"status":"active","test":{"code":"USG001","name":"Whole Abdomen USG","category":"Radiology"}},{"price":400,"status":"active","test":{"code":"THY001","name":"Thyroid Function Test","category":"Pathology"}}]},"payments":[{"method":"upi","amount":1000,"referenceNumber":"UPI-1234567890","createdAt":"2026-05-15T14:20:00Z"}],"testTokens":[{"department":"Radiology","roomNumber":"USG-1","tokenNo":15},{"department":"Pathology","roomNumber":"LAB-2","tokenNo":28}],"tokenNo":15};
  const qrDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  // Preview 1: Classic format, 1 test
  const html1 = buildBillPrintHtml({
    bill: bill1,
    clinic,
    paperSize: "A5",
    isBW: false,
    qrDataUrl,
    format: "classic",
    showQr: true,
    showAmountInWords: false,
    showSignatureLine: true,
    showComputerGenerated: true,
    showReportMessage: true,
    showServiceFooter: true,
    showBrandingFooter: true,
  });

  // Preview 2: Premium A5 format, 1 test
  const html2 = buildBillPrintHtml({
    bill: bill1,
    clinic,
    paperSize: "A5",
    isBW: false,
    qrDataUrl,
    format: "premium-a5",
    showQr: true,
    showAmountInWords: false,
    showSignatureLine: true,
    showComputerGenerated: true,
    showReportMessage: true,
    showServiceFooter: true,
    showBrandingFooter: true,
  });

  // Preview 3: Premium A5 format, 2 tests, discount, UPI
  const html3 = buildBillPrintHtml({
    bill: bill2,
    clinic,
    paperSize: "A5",
    isBW: false,
    qrDataUrl,
    format: "premium-a5",
    showQr: true,
    showAmountInWords: true,
    showSignatureLine: true,
    showComputerGenerated: true,
    showReportMessage: true,
    showServiceFooter: true,
    showBrandingFooter: true,
  });

  import fs from "fs";
  fs.mkdirSync("/home/runner/workspace/artifacts/diagnostic-erp/src/lib/__preview_html", { recursive: true });
  fs.writeFileSync("/home/runner/workspace/artifacts/diagnostic-erp/src/lib/__preview_html/preview_1_classic_1test.html", html1);
  fs.writeFileSync("/home/runner/workspace/artifacts/diagnostic-erp/src/lib/__preview_html/preview_2_premium_1test.html", html2);
  fs.writeFileSync("/home/runner/workspace/artifacts/diagnostic-erp/src/lib/__preview_html/preview_3_premium_2test_discount_upi.html", html3);
  console.log("Done");
  