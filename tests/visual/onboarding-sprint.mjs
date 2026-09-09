import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.EQUINA_VISUAL_URL ?? "http://127.0.0.1:8081/?audit=onboarding";
const outputDir = process.env.EQUINA_VISUAL_OUTPUT ?? "/tmp/equina-onboarding-sprint";
const executablePath =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const viewports = [
  { id: "iphone-se", width: 375, height: 667 },
  { id: "iphone-15-pro", width: 393, height: 852 },
  { id: "iphone-16-pro-max", width: 430, height: 932 }
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
const settle = (page, duration = 360) => page.waitForTimeout(duration);

const inspectLayout = async (page, viewport, screen) => {
  const layout = await page.evaluate(() => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const root = document.querySelector("[data-testid='onboarding-screen']");
    const rootRect = root?.getBoundingClientRect();
    const controls = [...document.querySelectorAll(
      "[data-testid='onboarding-screen'] button,[data-testid='onboarding-screen'] [role='button'],[data-testid='onboarding-screen'] input"
    )].filter(visible);
    const primary = document.querySelector(
      "[data-testid='onboarding-create-account'],[data-testid='onboarding-continue']"
    );
    const primaryRect = primary?.getBoundingClientRect();
    const focusedInput = document.activeElement?.matches?.("input,textarea")
      ? document.activeElement
      : null;
    const focusedRect = focusedInput?.getBoundingClientRect();
    const fontWeights = [...document.querySelectorAll("[data-testid='onboarding-screen'] *")]
      .filter((element) => visible(element) && element.textContent?.trim())
      .map((element) => window.getComputedStyle(element).fontWeight)
      .filter((weight, index, values) => values.indexOf(weight) === index)
      .sort();

    return {
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      horizontalOverflow: document.body.scrollWidth > window.innerWidth + 1,
      rootOutOfBounds: rootRect
        ? rootRect.left < -1 || rootRect.right > window.innerWidth + 1
        : true,
      primaryOutOfBounds: primaryRect
        ? primaryRect.top < -1 || primaryRect.bottom > window.innerHeight + 1
        : true,
      primaryRect: primaryRect
        ? {
            top: Math.round(primaryRect.top),
            bottom: Math.round(primaryRect.bottom),
            height: Math.round(primaryRect.height)
          }
        : null,
      focusedInputOutOfBounds: focusedRect
        ? focusedRect.top < -1 ||
          focusedRect.bottom > window.innerHeight + 1 ||
          Boolean(primaryRect && focusedRect.bottom > primaryRect.top - 4)
        : false,
      focusedRect: focusedRect
        ? {
            top: Math.round(focusedRect.top),
            bottom: Math.round(focusedRect.bottom),
            height: Math.round(focusedRect.height)
          }
        : null,
      fontWeights,
      undersizedControls: controls
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        })
        .map((element) => ({
          testID: element.getAttribute("data-testid"),
          label: element.getAttribute("aria-label") ?? element.textContent?.trim(),
          width: Math.round(element.getBoundingClientRect().width),
          height: Math.round(element.getBoundingClientRect().height)
        }))
    };
  });

  const screenshot = `${outputDir}/${viewport.id}-${screen}.png`;
  await page.screenshot({ path: screenshot, fullPage: false });
  return { screen, screenshot, ...layout };
};

const fillYou = async (page) => {
  await page.getByTestId("onboarding-name").fill("Alexandria Montgomery");
  await page.getByTestId("onboarding-discipline-trail").click();
  await page.getByTestId("onboarding-level-pro").click();
};

const fillHorse = async (page) => {
  await page.getByTestId("onboarding-horse-name").fill("Ralfy's Competition Name");
};

for (const viewport of viewports) {
  console.log(`Checking ${viewport.id}...`);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    colorScheme: "dark"
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByTestId("onboarding-use-demo").waitFor();
  await settle(page);

  const screens = [await inspectLayout(page, viewport, "you-empty")];
  console.log(`${viewport.id}: You`);
  await fillYou(page);
  await settle(page);
  screens.push(await inspectLayout(page, viewport, "you-ready"));

  const keyboardViewport = {
    ...viewport,
    height: Math.max(420, viewport.height - 280)
  };
  await page.setViewportSize({ width: keyboardViewport.width, height: keyboardViewport.height });
  await page.getByTestId("onboarding-name").click();
  await settle(page, 120);
  screens.push(await inspectLayout(page, keyboardViewport, "you-keyboard"));
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-horse-photo-upload").waitFor();
  await settle(page);
  screens.push(await inspectLayout(page, viewport, "horse-empty"));
  console.log(`${viewport.id}: Horse`);

  await page.getByTestId("onboarding-horse-mode-none").click();
  await page.getByTestId("onboarding-rider-first").waitFor();
  await settle(page);
  screens.push(await inspectLayout(page, viewport, "horse-rider-first"));
  if (await page.getByTestId("onboarding-horse-name").count()) {
    throw new Error("Rider-first onboarding still renders required horse fields.");
  }
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-create-account").waitFor();
  await settle(page);
  screens.push(await inspectLayout(page, viewport, "preview-rider-first"));
  await page.getByTestId("onboarding-back").click();
  await page.getByTestId("onboarding-horse-mode-own").click();
  await page.getByTestId("onboarding-horse-photo-upload").waitFor();

  await page.getByTestId("onboarding-horse-photo-upload").click();
  await page.getByTestId("onboarding-horse-photo-library").waitFor();
  await settle(page, 480);
  screens.push(await inspectLayout(page, viewport, "horse-photo-sheet"));
  await page.getByTestId("onboarding-horse-photo-action").click();

  await page.getByTestId("onboarding-horse-breed").click();
  await page.getByTestId("onboarding-horse-breed-belgian-warmblood").waitFor();
  await settle(page);
  screens.push(await inspectLayout(page, viewport, "horse-breed-sheet"));
  await page.getByTestId("onboarding-horse-breed-belgian-warmblood").click();

  await fillHorse(page);
  await settle(page, 120);
  screens.push(await inspectLayout(page, viewport, "horse-ready"));

  await page.setViewportSize({ width: keyboardViewport.width, height: keyboardViewport.height });
  await page.getByTestId("onboarding-horse-name").click();
  await settle(page, 120);
  screens.push(await inspectLayout(page, keyboardViewport, "horse-keyboard"));
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-create-account").waitFor();
  await settle(page);
  screens.push(await inspectLayout(page, viewport, "preview"));
  const previewText = await page.locator("body").innerText();
  if (!previewText.includes("YOUR STARTER PACK")) {
    throw new Error("Onboarding preview does not explain the personalized starter pack.");
  }
  console.log(`${viewport.id}: Preview`);

  await page.getByTestId("onboarding-back").click();
  await page.getByTestId("onboarding-horse-photo-upload").waitFor();
  if (await page.getByRole("alert").count()) {
    throw new Error("Onboarding error state was not cleared when navigating back.");
  }
  await settle(page);
  await page.getByTestId("onboarding-back").click();
  await page.getByTestId("onboarding-name").waitFor();
  await settle(page);
  screens.push(await inspectLayout(page, viewport, "back-to-you"));

  if (viewport.id === "iphone-se") {
    await page.getByTestId("onboarding-continue").click();
    await page.getByTestId("onboarding-horse-photo-upload").waitFor();
    await page.getByTestId("onboarding-continue").click();
    await page.getByTestId("onboarding-create-account").click();
    await page.getByTestId("onboarding-screen").waitFor({ state: "detached" });
    await page.getByTestId("ride-toggle").waitFor();
    const personalizedHome = await page.locator("body").innerText();
    if (!personalizedHome.includes("Ralfy's Competition Name")) {
      throw new Error("Local preview did not preserve the personalized horse profile.");
    }
    await page.screenshot({
      path: `${outputDir}/${viewport.id}-home-after-local-preview.png`,
      fullPage: false
    });
  } else {
    await page.getByTestId("onboarding-use-demo").click();
  }
  await page.getByTestId("ride-toggle").waitFor();

  report.push({
    viewport,
    consoleErrors: [...new Set(consoleErrors)],
    screens
  });
  await context.close();
}

const reducedContext = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
  colorScheme: "dark"
});
const reducedPage = await reducedContext.newPage();
reducedPage.setDefaultTimeout(12_000);
await reducedPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
await reducedPage.getByTestId("onboarding-use-demo").waitFor();
await settle(reducedPage);
await fillYou(reducedPage);
await reducedPage.getByTestId("onboarding-continue").click();
await fillHorse(reducedPage);
await reducedPage.getByTestId("onboarding-continue").click();
await settle(reducedPage);
const reducedMotionScreen = await inspectLayout(
  reducedPage,
  { id: "iphone-15-pro-reduced", width: 393, height: 852 },
  "preview"
);
await reducedContext.close();

await browser.close();
await writeFile(
  `${outputDir}/report.json`,
  JSON.stringify({ report, reducedMotionScreen }, null, 2)
);

const failures = report.flatMap((entry) => [
  ...entry.consoleErrors.map((error) => `${entry.viewport.id}: console: ${error}`),
  ...entry.screens
    .filter((screen) => screen.horizontalOverflow || screen.rootOutOfBounds)
    .map((screen) => `${entry.viewport.id}/${screen.screen}: horizontal overflow`),
  ...entry.screens
    .filter((screen) => screen.primaryOutOfBounds)
    .map((screen) => `${entry.viewport.id}/${screen.screen}: primary action outside viewport`),
  ...entry.screens
    .filter((screen) => screen.focusedInputOutOfBounds)
    .map((screen) => `${entry.viewport.id}/${screen.screen}: focused input outside usable viewport`),
  ...entry.screens
    .filter((screen) => screen.undersizedControls.length > 0)
    .map((screen) => `${entry.viewport.id}/${screen.screen}: control below 44px`),
  ...entry.screens
    .filter((screen) => screen.fontWeights.some((weight) => !["400", "600"].includes(weight)))
    .map((screen) => `${entry.viewport.id}/${screen.screen}: unsupported font weight`)
]);

console.log(JSON.stringify({ outputDir, failures, report, reducedMotionScreen }, null, 2));
if (failures.length > 0) process.exitCode = 1;
