import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.EQUINA_VISUAL_URL ?? "http://127.0.0.1:8081/?audit=onboarding";
const outputDir = process.env.EQUINA_VISUAL_OUTPUT ?? "/tmp/equina-sprint4-visual";
const executablePath =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const viewports = [
  { id: "iphone-se", width: 375, height: 667 },
  { id: "iphone-15-pro", width: 393, height: 852 },
  { id: "iphone-16-pro-max", width: 430, height: 932 },
  { id: "android-current", width: 412, height: 915 }
].filter((viewport) =>
  !process.env.EQUINA_VISUAL_VIEWPORT ||
  viewport.id === process.env.EQUINA_VISUAL_VIEWPORT
);

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-dev-shm-usage"]
});

const report = [];

const inspectLayout = async (page, viewport, screen) => {
  const layout = await page.evaluate(() => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll("button,[role='button'],input,textarea")]
      .filter(visible);
    const composerSend = document.querySelector(
      "[data-testid='ai-chat-send'],[data-testid='shop-message-send']"
    );
    const composerRect = composerSend?.getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      bodyHeight: document.body.getBoundingClientRect().height,
      bodyWidth: document.body.scrollWidth,
      horizontalOverflow: document.body.scrollWidth > window.innerWidth + 1,
      outOfBounds: controls
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > window.innerWidth + 1;
        })
        .map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName)
        .slice(0, 12),
      composerOutOfBounds: composerRect
        ? composerRect.top < -1 || composerRect.bottom > window.innerHeight + 1
        : false,
      composerRect: composerRect
        ? {
            top: Math.round(composerRect.top),
            bottom: Math.round(composerRect.bottom),
            width: Math.round(composerRect.width),
            height: Math.round(composerRect.height)
          }
        : null,
      undersizedControls: controls
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        })
        .map((element) => ({
          label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName,
          width: Math.round(element.getBoundingClientRect().width),
          height: Math.round(element.getBoundingClientRect().height)
        }))
        .slice(0, 20)
    };
  });
  const path = `${outputDir}/${viewport.id}-${screen}.png`;
  await page.screenshot({ path, fullPage: false });
  return { screen, screenshot: path, ...layout };
};

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    colorScheme: "dark"
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByTestId("onboarding-use-demo").waitFor();
  const screens = [await inspectLayout(page, viewport, "onboarding")];

  await page.getByTestId("onboarding-use-demo").click();
  await page.getByTestId("ride-toggle").waitFor();
  screens.push(await inspectLayout(page, viewport, "home"));

  await page.getByTestId("profile-button").first().click();
  await page.getByText("Account", { exact: true }).first().waitFor();
  screens.push(await inspectLayout(page, viewport, "account"));

  // Account and Ralf each cover the tabs; Ralf opens from any tab's header.
  await page.getByTestId("account-close").click();
  await page.getByTestId("ralf-button").first().click();
  await page.getByTestId("ralf-conversation").waitFor();
  screens.push(await inspectLayout(page, viewport, "ralf"));

  await page.getByTestId("ai-chat-input").fill("How should Ralfy warm up today?");
  screens.push(await inspectLayout(page, viewport, "ralf-focused"));
  const keyboardViewport = {
    ...viewport,
    height: Math.max(360, viewport.height - 300)
  };
  await page.setViewportSize({
    width: keyboardViewport.width,
    height: keyboardViewport.height
  });
  screens.push(await inspectLayout(page, keyboardViewport, "ralf-keyboard"));
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  await page.getByTestId("ai-chat-back").click();
  // The Shop tab only exists while a marketplace switch is on.
  if (await page.getByTestId("tab-gear").isVisible().catch(() => false)) {
    await page.getByTestId("tab-gear").click();
    await page.locator("[data-testid^='shop-card-']").first().click();
    await page.getByTestId("shop-product-message").click();
    await page.getByTestId("shop-conversation").waitFor();
    screens.push(await inspectLayout(page, viewport, "shop-conversation"));
  }

  report.push({
    viewport,
    consoleErrors: [...new Set(consoleErrors)],
    screens
  });
  await context.close();
}

await browser.close();
await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));

const failures = report.flatMap((entry) => [
  ...entry.consoleErrors.map((error) => `${entry.viewport.id}: console: ${error}`),
  ...entry.screens
    .filter((screen) => screen.horizontalOverflow || screen.outOfBounds.length > 0)
    .map((screen) => `${entry.viewport.id}/${screen.screen}: horizontal overflow`),
  ...entry.screens
    .filter((screen) => screen.composerOutOfBounds)
    .map((screen) => `${entry.viewport.id}/${screen.screen}: composer outside viewport`),
  ...entry.screens
    .filter((screen) => screen.undersizedControls.length > 0)
    .map((screen) => `${entry.viewport.id}/${screen.screen}: control below 44px`)
]);

console.log(JSON.stringify({ outputDir, failures, report }, null, 2));
if (failures.length > 0) process.exitCode = 1;
