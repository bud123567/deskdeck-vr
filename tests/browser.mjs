import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("docs/verification", { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("console:", m.text());
});
await page.goto(process.env.BASE_URL || "http://localhost:3443");
await page
  .getByRole("heading", { name: "Your desk. Without the desk." })
  .waitFor();
await page.waitForTimeout(2000);
console.log(
  "runtime",
  await page.locator(".toast").innerText(),
  "canvas",
  await page.locator("canvas").count(),
  errors,
);
await page.screenshot({
  path: "docs/verification/desktop.png",
  fullPage: true,
});
await page
  .getByRole("button", { name: "Connect your Mac", exact: true })
  .click();
await page.getByRole("button", { name: "Pair with Mac", exact: true }).click();
await page.getByText("Enter the six-digit code shown on your Mac.").waitFor();
await page.keyboard.press("Escape");
assert.equal(await page.locator("dialog[open]").count(), 0);
await page.getByRole("button", { name: "Displays", exact: true }).click();
await page.getByLabel("Workspace name").fill("Coding");
await page.getByRole("button", { name: "Save workspace", exact: true }).click();
await page.getByRole("button", { name: "Coding", exact: false }).waitFor();
await page.reload();
await page.getByRole("button", { name: "Coding", exact: false }).waitFor();
await page
  .getByRole("button", { name: "Find an action", exact: false })
  .click();
await page.getByRole("textbox", { name: "Search actions" }).fill("nothere");
await page.getByText("No matching actions.").waitFor();
await page.getByRole("button", { name: "Clear search" }).click();
await page.getByRole("button", { name: "Toggle focus mode" }).click();
assert.equal(await page.locator("dialog[open]").count(), 0);
const axe = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
  .analyze();
writeFileSync(
  "docs/verification/accessibility.json",
  JSON.stringify(axe.violations, null, 2),
);
console.log(
  "Accessibility violations:",
  axe.violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.map((n) => n.target),
  })),
);
assert.equal(axe.violations.length, 0);
await page.getByRole("combobox", { name: "Environment" }).selectOption("Void");
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "docs/verification/mobile.png", fullPage: true });
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  "mobile overflow",
);
await page.getByRole("button", { name: "Pair a computer" }).click();
await page.screenshot({
  path: "docs/verification/pairing.png",
  fullPage: true,
});
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Displays", exact: true }).click();
await page.getByRole("heading", { name: "Display arrangement" }).waitFor();
await page.getByRole("button", { name: "Shortcuts", exact: true }).click();
await page.getByRole("heading", { name: "Mac shortcuts" }).waitFor();
assert.deepEqual(errors, []);
await browser.close();
console.log("Browser flows passed");
