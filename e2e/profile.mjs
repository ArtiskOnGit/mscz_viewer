// "My instrument" profile E2E: set the profile in the settings, import a score, check the preselected part, the
// default transposition and the toast on first opening, and that an explicit choice is kept afterwards
// (headless Chromium, Pixel 7). Usage: node e2e/profile.mjs "$PWD" [screenshot-dir]
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';

const root = process.argv[2];
const shots = process.argv[3] ?? '/tmp';
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { port: 5189, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => {
  if (!cond) {
    console.log('FAIL:', msg, '| errors:', errors);
    process.exitCode = 1;
  } else console.log('ok:', msg);
};
const visible = '.ion-page:not(.ion-page-hidden)';
const partsButton = () => page.locator(`${visible} [data-testid=parts-button]`).last().innerText();
const badge = () => page.locator(`${visible} [data-testid=transpose-button]`).last().innerText();

// 1. Settings: quick pick "Trumpet" (Trumpet, Trompette, Tpt) and B♭ default transposition.
await page.goto('http://127.0.0.1:5189/settings');
await page.waitForSelector('[data-testid=pick-trumpet]');
await page.locator('[data-testid=pick-trumpet]').click();
await page.waitForTimeout(300);
const names = await page.locator('[data-testid=my-instrument-names] input').inputValue();
check(names === 'Trumpet, Trompette, Tpt', `quick pick fills the names: "${names}"`);
await page.locator('[data-testid=default-transpose]').click();
await page.locator('ion-popover ion-item', { hasText: 'B♭ instrument' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/settings-profile.png` });
// Free text: add a name by typing (committed on blur).
await page.locator('[data-testid=my-instrument-names] input').fill('Trumpet, Trompette, Tpt, Cornet');
await page.locator('[data-testid=my-instrument-names] input').blur();
await page.waitForTimeout(300);
check(!(await page.locator('[data-testid=pick-cornet]').getAttribute('class')).includes('chip-outline'), 'typed name selects its quick pick');

// 2. Import Toccata (7 parts, "Trompette en Si♭") and open it: only the trumpet, +2.
await page.goto('http://127.0.0.1:5189/library');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('ion-fab-button').click()]);
await chooser.setFiles(`${root}/test-scores/Toccata_v2.mscz`);
await page.waitForSelector('ion-item-sliding', { timeout: 120000 });
await page.waitForTimeout(500);
await page.locator('ion-item-sliding ion-item').first().click();
const toast = page.waitForSelector('ion-toast.my-part-toast', { timeout: 30000 }).then((t) => t.evaluate((el) => el.message)).catch(() => undefined);
await page.waitForSelector(`${visible} .score-page svg`, { timeout: 60000 });
check((await partsButton()).includes('1/7'), `my part preselected: ${await partsButton()}`);
check((await badge()).includes('+2'), `default transposition applied: ${await badge()}`);
const message = await toast;
check(message?.includes('Showing your part: Trompette en Si♭'), `toast: ${message}`);
await page.screenshot({ path: `${shots}/profile-viewer.png` });

// 3. Explicit choice: show all parts, back to the library, reopen: the choice is kept, no toast.
await page.getByRole('button', { name: 'Instruments' }).last().click();
await page.locator('ion-modal ion-checkbox').first().click(); // all
await page.locator('ion-modal ion-footer ion-button').click();
await page.waitForFunction(() => !document.querySelector('ion-modal.show-modal'));
await page.waitForTimeout(1500);
check((await partsButton()).includes('7/7'), `all parts chosen: ${await partsButton()}`);
await page.goto('http://127.0.0.1:5189/library');
await page.waitForSelector('ion-item-sliding', { timeout: 30000 });
await page.locator('ion-item-sliding ion-item').first().click();
await page.waitForSelector(`${visible} .score-page svg`, { timeout: 60000 });
await page.waitForTimeout(800);
check((await partsButton()).includes('7/7'), `explicit choice kept on reopening: ${await partsButton()}`);
check((await page.locator('ion-toast.my-part-toast').count()) === 0, 'no toast on reopening');
check(errors.length === 0, `no JS errors ${JSON.stringify(errors)}`);
await browser.close();
await server.close();
