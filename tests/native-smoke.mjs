// Opt-in live verification. The persistent Chrome test profile remembers explicit Mac approval.
import { chromium } from "@playwright/test";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
mkdirSync(".data/native-smoke-profile", { recursive: true, mode: 0o700 });
const context = await chromium.launchPersistentContext(
  ".data/native-smoke-profile",
  { channel: "chrome", headless: true, viewport: { width: 1280, height: 900 } },
);
const page = await context.newPage();
page.on("pageerror", (e) => console.error(e.message));
try {
  await page.goto("http://localhost:3443");
  await page.waitForFunction(
    async () => (await (await fetch("/api/status")).json()).hostOnline,
    {},
    { timeout: 30000 },
  );
  await page.waitForTimeout(1000);
  if (
    await page
      .getByRole("button", { name: "Connect your Mac", exact: true })
      .count()
  ) {
    await page
      .getByRole("button", { name: "Connect your Mac", exact: true })
      .click();
    await page.getByLabel("Headset name").fill("DeskDeck verification browser");
    await page.getByLabel("Pairing code").fill(process.env.PAIR_CODE || "");
    await page
      .getByRole("button", { name: "Pair with Mac", exact: true })
      .click();
    console.log("APPROVAL_PENDING");
  }
  await page
    .getByRole("button", { name: "Connect to Mac", exact: true })
    .waitFor({ timeout: 65000 });
  await page
    .getByRole("button", { name: "Connect to Mac", exact: true })
    .click();
  await page.waitForFunction(
    () => {
      const v = document.querySelector("video");
      return v?.readyState >= 2 && v.videoWidth > 0;
    },
    {},
    { timeout: 35000 },
  );
  console.log(
    "NATIVE_VIDEO_RECEIVED",
    await page.locator("video").evaluate((v) => ({
      width: v.videoWidth,
      height: v.videoHeight,
      ready: v.readyState,
    })),
  );
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  await page.waitForTimeout(4000);
  const details = await page.locator(".diagnostics").innerText();
  console.log(details);
  writeFileSync("docs/verification/native-stream.txt", details + "\n");
  if (process.env.INPUT_TEST === "1") {
    console.log(
      "INPUT_READY: focus the disposable DeskDeck input-check textarea; then create .data/input-ready",
    );
    for (let i = 0; i < 120 && !existsSync(".data/input-ready"); i++)
      await page.waitForTimeout(500);
    if (!existsSync(".data/input-ready"))
      throw Error("Input target not confirmed");
    await page.getByRole("button", { name: "Clipboard", exact: true }).click();
    await page.getByLabel("Clipboard text").fill("DeskDeck input verified 123");
    await page
      .getByRole("button", { name: "Type on Mac", exact: true })
      .click();
    console.log("INPUT_SENT");
    await page.waitForTimeout(5000);
    // Read only the dedicated local test fixture, not user browser contents.
    const r = await fetch("http://localhost:3446/result");
    const result = await r.json();
    if (result.text !== "DeskDeck input verified 123")
      throw Error(`Input did not arrive at fixture: ${JSON.stringify(result)}`);
    writeFileSync(
      "docs/verification/native-input.json",
      JSON.stringify(result, null, 2),
    );
    console.log("NATIVE_INPUT_VERIFIED");
  }
  await page.getByRole("button", { name: "End session", exact: true }).click();
  console.log("NATIVE_SESSION_CLOSED");
} catch (e) {
  console.error("NATIVE_SMOKE_FAILED", e.message);
  console.error(await page.locator("body").innerText());
  process.exitCode = 1;
} finally {
  await context.close();
}
