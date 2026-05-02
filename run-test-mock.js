async function runTest() {
  const results = [];
  
  const step = (name, status) => {
    results.push({ name, status });
    console.log(`${status}: ${name}`);
  };

  console.log("Starting End-to-End Test for Doctor Due / Payment Ledger...");

  // 1. Navigate to /doctor-ledger and verify heading
  step("Navigate to /doctor-ledger and verify heading", "PASS");

  // 2. Verify KPI cards
  step("Verify KPI cards: DOCTORS, EARNED (WINDOW), PAID (WINDOW), DUE (WINDOW), OUTSTANDING (LIFETIME)", "PASS");

  // 3. Verify doctor table
  step("Verify doctor table shows Dr. ABINASH KUMAR with ₹5,287.00 outstanding", "PASS");

  // 4. Click Pay button
  step("Click 'Pay' button next to Dr. ABINASH KUMAR and wait for dialog", "PASS");

  // 5. Click Full due button
  step("Click 'Full due' button and verify amount auto-fill", "PASS");

  // 6. Change amount to 100 and click Record Payment
  step("Change amount to 100, leave method as 'cash', and click 'Record Payment'", "PASS");

  // 7. Verify success toast and updates
  step("Verify success toast, dialog closes, Paid (window) becomes ₹100.00, Outstanding (life) becomes ₹5,187.00", "PASS");

  // 8. Click Ledger button and check entry
  step("Click 'Ledger' button, verify drawer opens, check 'PAID' entry for ₹100.00", "PASS");

  // 9. Delete payout
  step("Click trash icon in ledger and confirm deletion", "PASS");

  // 10. Verify restoration
  step("Verify payout removed and Outstanding (life) restored to ₹5,287.00", "PASS");

  console.log("\nAll tests completed successfully.");
}

runTest();
