import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.EQUINA_VISUAL_URL ?? "http://localhost:8081/?audit=product-polish";
const outputDir = process.env.EQUINA_VISUAL_OUTPUT ?? "/tmp/equina-product-polish";
const executablePath =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const viewport = {
  width: Number(process.env.EQUINA_VIEWPORT_WIDTH ?? 393),
  height: Number(process.env.EQUINA_VIEWPORT_HEIGHT ?? 852)
};
const exerciseVideo = process.env.EQUINA_EXERCISE_VIDEO !== "0";

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-dev-shm-usage"]
});
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 1,
  reducedMotion: "no-preference",
  colorScheme: "dark"
});
const page = await context.newPage();
page.setDefaultTimeout(12_000);

const consoleErrors = [];
const failedRequests = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("requestfailed", (request) => {
  if (request.failure()?.errorText === "net::ERR_ABORTED") return;
  failedRequests.push({
    url: request.url(),
    error: request.failure()?.errorText ?? "unknown"
  });
});

const settle = (duration = 700) => page.waitForTimeout(duration);
const visible = async (testID) =>
  page.getByTestId(testID).isVisible().catch(() => false);

const inspect = async (name) => {
  await settle();
  const metrics = await page.evaluate(() => {
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const all = [...document.querySelectorAll("body *")].filter(isVisible);
    const controls = all.filter((element) =>
      element.matches("button,input,textarea,[role='button'],[role='tab'],[role='radio'],[role='switch']")
    );
    const unique = (values) => [...new Set(values)].sort();
    const readRadius = (element) => {
      const value = getComputedStyle(element).borderTopLeftRadius;
      return Number.parseFloat(value);
    };

    return {
      bodyWidth: document.body.scrollWidth,
      horizontalOverflow: document.body.scrollWidth > innerWidth + 1,
      visibleControls: controls.length,
      undersizedControls: controls
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            testID: element.getAttribute("data-testid"),
            label: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        })
        .filter((control) => control.width < 44 || control.height < 44),
      fontWeights: unique(
        all
          .filter((element) => element.textContent?.trim())
          .map((element) => getComputedStyle(element).fontWeight)
      ),
      radii: unique(
        all
          .map(readRadius)
          .filter((radius) => Number.isFinite(radius) && radius > 0)
          .map((radius) => Math.round(radius * 10) / 10)
      ),
      irregularRadii: all
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            testID: element.getAttribute("data-testid"),
            label: element.getAttribute("aria-label") ?? element.textContent?.trim().replace(/\s+/g, " ").slice(0, 64),
            radius: Math.round(readRadius(element) * 10) / 10,
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        })
        .filter(({ radius, width, height }) => {
          const geometricCircle = Math.abs(width - height) <= 2 && radius >= Math.min(width, height) / 2 - 1;
          const tinyGeometry = Math.min(width, height) <= 8;
          return radius > 0 && ![8, 14, 18].includes(radius) && !geometricCircle && !tinyGeometry;
        })
        .slice(0, 30),
      borderedSurfaces: all.filter((element) => {
        const style = getComputedStyle(element);
        return Number.parseFloat(style.borderTopWidth) > 0;
      }).length,
      dockItems: [...document.querySelectorAll("[data-testid^='tab-']")]
        .filter(isVisible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            id: element.getAttribute("data-testid"),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        }),
      dockAncestors: (() => {
        const dockItem = document.querySelector("[data-testid='tab-community']");
        const rows = [];
        let element = dockItem;
        for (let index = 0; element && index < 4; index += 1, element = element.parentElement) {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          rows.push({
            tag: element.tagName,
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            overflow: style.overflow,
            position: style.position,
            zIndex: style.zIndex
          });
        }
        return rows;
      })()
    };
  });
  const screenshot = `${outputDir}/${name}.png`;
  await page.screenshot({ path: screenshot, fullPage: false });
  return { name, screenshot, ...metrics };
};

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.getByTestId("onboarding-use-demo").waitFor();
await page.getByTestId("onboarding-use-demo").click();
await page.getByTestId("ride-toggle").waitFor();

const screens = [await inspect("home")];

await page.getByTestId("ride-toggle").click();
screens.push(await inspect("ride-mode"));
await page.getByTestId("ride-next-phase").click();
await page.getByTestId("ride-next-phase").click();
await page.getByTestId("ride-toggle").click();
screens.push(await inspect("ride-recap"));
await page.getByTestId("ride-recap-home-top").click();
screens.push(await inspect("home-after-ride"));

for (const [tab, name] of [
  ["stable", "horse"],
  ["assistant", "academy"],
  ["community", "club"],
  ["gear", "shop"]
]) {
  // The Shop tab only exists while a marketplace switch is on.
  if (!(await visible(`tab-${tab}`))) continue;
  await page.getByTestId(`tab-${tab}`).click();
  screens.push(await inspect(name));
}

const firstProduct = page.locator("[data-testid^='shop-card-']").first();
if (await firstProduct.isVisible().catch(() => false)) {
  await firstProduct.click();
  screens.push(await inspect("shop-product"));
  await page.getByTestId("shop-product-back").click().catch(() => page.getByTestId("shop-route-back").click());
}

await page.getByTestId("tab-assistant").click();
if (await visible("academy-open-ai")) {
  await page.getByTestId("academy-open-ai").first().click();
  screens.push(await inspect("ralf"));
  await page.getByTestId("ai-chat-more").click();
  screens.push(await inspect("ralf-options"));
  const adjustContext = page.getByRole("button", { name: "This conversation" });
  if (await adjustContext.isVisible().catch(() => false)) {
    await adjustContext.click();
    screens.push(await inspect("ralf-context"));
    await page.getByTestId("ralf-context-save").click();
  }
  await page.getByTestId("ai-chat-input").fill("Give me one calm rhythm exercise");
  screens.push(await inspect("ralf-composer-focused"));
  await page.getByTestId("ai-chat-send").click();
  screens.push(await inspect("ralf-after-message"));
  await page.getByTestId("ai-chat-history").click();
  screens.push(await inspect("ralf-history"));
  await page.getByRole("button", { name: "Close" }).last().click();
}

if (await visible("ai-chat-back")) {
  await page.getByTestId("ai-chat-back").click();
}
await page.getByTestId("tab-home").click();
if (await visible("profile-button")) {
  await page.getByTestId("profile-button").first().click();
  screens.push(await inspect("account"));
}

if (await visible("account-edit-profile")) {
  await page.getByTestId("account-edit-profile").click();
  screens.push(await inspect("account-profile"));
  await page.getByTestId("account-name-input").focus();
  screens.push(await inspect("account-profile-focused"));
  await page.getByTestId("account-route-back").click();
}
if (await visible("account-close")) {
  await page.getByTestId("account-close").click();
}

await page.getByTestId("tab-stable").click();
for (const view of ["care", "documents"]) {
  await page.getByTestId(`stable-view-${view}`).click();
  screens.push(await inspect(`horse-${view}`));
}

// All lessons sit at the end of the Academy page itself.
await page.getByTestId("tab-assistant").click();
await page.getByTestId("academy-search-input").scrollIntoViewIfNeeded();
screens.push(await inspect("academy-directory"));
await page.getByTestId("academy-search-input").fill("zzzz-no-lesson");
screens.push(await inspect("academy-directory-empty"));
const clearAcademySearch = page.getByRole("button", { name: "Clear lesson search" });
if (await clearAcademySearch.isVisible().catch(() => false)) {
  await clearAcademySearch.click();
}
const firstLesson = page.locator("[data-testid^='academy-lesson-']").first();
if (await firstLesson.isVisible().catch(() => false)) {
  await firstLesson.click();
  screens.push(await inspect("academy-video"));
  if (exerciseVideo) {
    await page.getByTestId("academy-video-start").click();
    screens.push(await inspect("academy-video-playing"));
    await page.getByTestId("academy-video-complete").click();
    screens.push(await inspect("academy-video-completed"));
    await page.evaluate(() => {
      document.querySelectorAll("video").forEach((video) => video.pause());
    });
  }
  await page.getByTestId("academy-video-back").click();
}

if (!(await visible("tab-gear"))) {
  console.log("Shop is switched off in this build; skipping the Shop screens.");
} else {
await page.getByTestId("tab-gear").click();
await page.getByTestId("shop-mode-sell").click();
screens.push(await inspect("shop-seller"));
await page.getByTestId("shop-mode-browse").click();
const checkoutProduct = page.locator("[data-testid^='shop-card-']").first();
if (await checkoutProduct.isVisible().catch(() => false)) {
  await checkoutProduct.click();
  await page.getByTestId("shop-product-buy").click();
  screens.push(await inspect("shop-checkout"));
  await page.getByTestId("shop-route-back").click();
  await page.getByTestId("shop-product-back").click();
}
}

await writeFile(
  `${outputDir}/report.json`,
  JSON.stringify({ viewport, consoleErrors: [...new Set(consoleErrors)], failedRequests, screens }, null, 2)
);

console.log(JSON.stringify({
  outputDir,
  consoleErrors: [...new Set(consoleErrors)],
  failedRequests,
  screens: screens.map(({ name, horizontalOverflow, visibleControls, undersizedControls, fontWeights, radii, irregularRadii, borderedSurfaces, dockItems, dockAncestors }) => ({
    name,
    horizontalOverflow,
    visibleControls,
    undersizedControls,
    fontWeights,
    radii,
    irregularRadii,
    borderedSurfaces,
    dockItems,
    dockAncestors
  }))
}, null, 2));

await page.goto("about:blank", { waitUntil: "commit", timeout: 2_000 }).catch(() => undefined);
await Promise.race([
  browser.close(),
  new Promise((resolve) => setTimeout(resolve, 2_000))
]);
process.exit(0);
