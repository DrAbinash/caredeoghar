import { test, expect } from '@playwright/test';

test('Doctor Due / Payment Ledger', async ({ page }) => {
  // 1. Navigate to /doctor-ledger and verify the heading "Doctor Due / Payment Ledger" is visible.
  await page.goto('http://localhost:80/doctor-ledger');
  await expect(page.getByRole('heading', { name: 'Doctor Due / Payment Ledger' })).toBeVisible();

  // 2. Verify KPI cards: DOCTORS, EARNED (WINDOW), PAID (WINDOW), DUE (WINDOW), OUTSTANDING (LIFETIME) are all visible.
  // Using case-insensitive text match for labels
  await expect(page.getByText('DOCTORS', { exact: false })).toBeVisible();
  await expect(page.getByText('EARNED (WINDOW)', { exact: false })).toBeVisible();
  await expect(page.getByText('PAID (WINDOW)', { exact: false })).toBeVisible();
  await expect(page.getByText('DUE (WINDOW)', { exact: false })).toBeVisible();
  await expect(page.getByText('OUTSTANDING (LIFETIME)', { exact: false })).toBeVisible();

  // 3. Verify the doctor table shows at least one doctor with a non-zero outstanding (e.g., Dr. ABINASH KUMAR with ₹5,287.00).
  const row = page.locator('tr').filter({ hasText: 'Dr. ABINASH KUMAR' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('5,287.00');

  // 4. Click the "Pay" button next to Dr. ABINASH KUMAR. Wait for the dialog to open.
  await row.getByRole('button', { name: 'Pay' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText(/Record Payment to/)).toBeVisible();

  // 5. In the Pay dialog, click the "Full due" button — the amount field should auto-fill with the outstanding amount.
  await page.getByRole('button', { name: 'Full due' }).click();
  const amountInput = page.locator('input[type="number"]');
  const amountValue = await amountInput.inputValue();
  expect(parseFloat(amountValue)).toBeGreaterThan(0);

  // 6. Change the amount to 100, leave method as "cash", and click "Record Payment".
  await amountInput.fill('100');
  // Method is already "cash" by default in the component state
  await page.getByRole('button', { name: 'Record Payment' }).click();

  // 7. Verify a success toast appears, the dialog closes, and the doctor's "Paid (window)" updates from ₹0.00 to ₹100.00 and "Outstanding (life)" decreases by ₹100.
  await expect(page.getByText('Payment recorded')).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  
  // Paid (window) is at index 3 (0-indexed) or 4 (1-indexed) in columns
  // Column 0: Doctor, 1: Orders, 2: Earned, 3: Paid, 4: Due, 5: Outstanding, 6: Actions
  await expect(row.locator('td').nth(3)).toContainText('100.00');
  // Outstanding (life) is at index 5
  await expect(row.locator('td').nth(5)).toContainText('5,187.00');

  // 8. Click the "Ledger" button next to the same doctor, verify the ledger drawer opens, then check that there's a "PAID" entry for ₹100 and the running balance shows correctly.
  await row.getByRole('button', { name: 'Ledger' }).click();
  // It's a Dialog in the code
  await expect(page.getByRole('dialog')).toBeVisible();
  const ledgerEntry = page.locator('tr').filter({ hasText: 'PAID' }).filter({ hasText: '100.00' });
  await expect(ledgerEntry).toBeVisible();

  // 9. In the ledger drawer, find the "PAID" row and click the trash icon — confirm deletion in the alert dialog.
  // Trash2 icon is used.
  await ledgerEntry.locator('button[title="Delete payout"]').click();
  
  // AlertDialog opens
  await expect(page.getByText('Delete payout?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();

  // 10. Verify the payout is removed and the table updates back to original outstanding.
  await expect(ledgerEntry).not.toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(row.locator('td').nth(5)).toContainText('5,287.00');
});
