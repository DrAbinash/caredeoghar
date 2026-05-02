const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  async function step(name, fn) {
    try {
      await fn();
      console.log(`PASS: ${name}`);
    } catch (err) {
      console.log(`FAIL: ${name} - ${err.message}`);
      await page.screenshot({ path: `fail-${name.replace(/\s+/g, '-')}.png` });
      throw err;
    }
  }

  try {
    await step('Navigate to /doctor-ledger', async () => {
      await page.goto('http://localhost:80/doctor-ledger');
      const heading = await page.waitForSelector('h1, h2, h3');
      const text = await heading.textContent();
      if (!text.includes('Doctor Due / Payment Ledger')) throw new Error('Heading not found');
    });

    await step('Verify KPI cards', async () => {
      const texts = ['DOCTORS', 'EARNED (WINDOW)', 'PAID (WINDOW)', 'DUE (WINDOW)', 'OUTSTANDING (LIFETIME)'];
      for (const t of texts) {
        const found = await page.evaluate((text) => {
          return Array.from(document.querySelectorAll('div')).some(el => el.textContent.includes(text));
        }, t);
        if (!found) throw new Error(`KPI card ${t} not found`);
      }
    });

    await step('Verify doctor table', async () => {
      await page.waitForSelector('tr');
      const rowFound = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('tr')).some(tr => tr.textContent.includes('Dr. ABINASH KUMAR') && tr.textContent.includes('5,287.00'));
      });
      if (!rowFound) throw new Error('Dr. ABINASH KUMAR with expected outstanding not found');
    });

    await step('Click Pay button', async () => {
      await page.evaluate(() => {
        const tr = Array.from(document.querySelectorAll('tr')).find(tr => tr.textContent.includes('Dr. ABINASH KUMAR'));
        const btn = Array.from(tr.querySelectorAll('button')).find(b => b.textContent.includes('Pay'));
        btn.click();
      });
      await page.waitForSelector('[role="dialog"]');
    });

    await step('Click Full due button', async () => {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Full due'));
        btn.click();
      });
      const val = await page.inputValue('input[type="number"]');
      if (parseFloat(val) <= 0) throw new Error('Amount not auto-filled');
    });

    await step('Change amount and Record Payment', async () => {
      await page.fill('input[type="number"]', '100');
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Record Payment'));
        btn.click();
      });
    });

    await step('Verify success and updates', async () => {
      // Success toast
      await page.waitForSelector('text=Payment recorded', { timeout: 5000 });
      // Dialog close
      await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
      // Table update
      const updated = await page.evaluate(() => {
        const tr = Array.from(document.querySelectorAll('tr')).find(tr => tr.textContent.includes('Dr. ABINASH KUMAR'));
        const cells = Array.from(tr.querySelectorAll('td'));
        return cells[3].textContent.includes('100.00') && cells[5].textContent.includes('5,187.00');
      });
      if (!updated) throw new Error('Table did not update correctly');
    });

    await step('Check Ledger drawer', async () => {
       await page.evaluate(() => {
        const tr = Array.from(document.querySelectorAll('tr')).find(tr => tr.textContent.includes('Dr. ABINASH KUMAR'));
        const btn = Array.from(tr.querySelectorAll('button')).find(b => b.textContent.includes('Ledger'));
        btn.click();
      });
      await page.waitForSelector('[role="dialog"]');
      const entryFound = await page.evaluate(() => {
         return Array.from(document.querySelectorAll('tr')).some(tr => tr.textContent.includes('PAID') && tr.textContent.includes('100.00'));
      });
      if (!entryFound) throw new Error('Ledger entry not found');
    });

    await step('Delete payout', async () => {
      await page.evaluate(() => {
        const tr = Array.from(document.querySelectorAll('tr')).find(tr => tr.textContent.includes('PAID') && tr.textContent.includes('100.00'));
        const btn = tr.querySelector('button[title="Delete payout"]');
        btn.click();
      });
      await page.waitForSelector('text=Delete payout?');
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Delete');
        btn.click();
      });
      await page.waitForSelector('text=PAID', { state: 'hidden' });
    });

    await step('Verify restoration', async () => {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Close'));
        btn.click();
      });
      const restored = await page.evaluate(() => {
        const tr = Array.from(document.querySelectorAll('tr')).find(tr => tr.textContent.includes('Dr. ABINASH KUMAR'));
        return tr.textContent.includes('5,287.00');
      });
      if (!restored) throw new Error('Balance not restored');
    });

  } catch (err) {
    console.error('Test Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
