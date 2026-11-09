import { readFile } from 'node:fs/promises';
// Needs Playwright; pass its module path, e.g. an octos-learn checkout's node_modules/playwright/index.mjs.
// Usage: node render-images.mjs OUT_DIR PLAYWRIGHT_MODULE
const { chromium } = await import(process.argv[3]);
const suite = JSON.parse(await readFile(new URL('../../eval/subject-routing-cases.json', import.meta.url), 'utf8'));
const out = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
for (const c of suite.cases.filter(c => c.image)) {
  const hand = c.image.kind === 'handwriting', blurred = c.image.content.startsWith('(blurred');
  const text = blurred ? 'Exercise 4. A train leaves the station at 9:15 and travels 180 km at a steady speed. If it arrives at 11:45, find its average speed and then the distance after 40 minutes.' : c.image.content;
  const css = hand
    ? "font-family:'Bradley Hand','Marker Felt',cursive;font-size:64px;color:#1d3b8f;transform:rotate(-2deg)"
    : "font-family:Georgia,'Songti SC',serif;font-size:34px;color:#222";
  await page.setContent(`<style>body{margin:0;background:${hand ? '#fdfdfb' : '#f4f1ea'};display:flex;align-items:center;justify-content:center;height:540px}
    div{max-width:820px;line-height:1.4;${css};${blurred ? 'filter:blur(9px)' : ''}}</style><div>${text.replace(/[<>&]/g, '')}</div>`);
  await page.screenshot({ path: `${out}/${c.id}.png` });
  console.log(c.id, c.request_source, c.image.kind, blurred ? '(blurred)' : '');
}
await browser.close();
