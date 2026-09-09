import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.EQUINA_VISUAL_URL ?? "http://localhost:8081/?audit=secondary-polish";
const outputDir = process.env.EQUINA_VISUAL_OUTPUT ?? "/tmp/equina-secondary-polish";
const executablePath =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const viewport = {
  width: Number(process.env.EQUINA_VIEWPORT_WIDTH ?? 393),
  height: Number(process.env.EQUINA_VIEWPORT_HEIGHT ?? 852)
};

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-dev-shm-usage"]
});
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 1,
  colorScheme: "dark"
});
const page = await context.newPage();
page.setDefaultTimeout(12_000);

const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

const settle = (duration = 500) => page.waitForTimeout(duration);
const visible = async (testID) => page.getByTestId(testID).isVisible().catch(() => false);
const clickTestID = async (testID) => {
  await page.getByTestId(testID).click();
  await settle();
};

const inspect = async (name) => {
  await settle();
  const metrics = await page.evaluate(() => {
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const all = [...document.querySelectorAll("body *")].filter(isVisible);
    const controls = all.filter((element) => {
      const style = getComputedStyle(element);
      return element.matches("button,input,textarea,[role='button'],[role='tab'],[role='radio'],[role='switch']") &&
        style.pointerEvents !== "none" &&
        element.getAttribute("aria-hidden") !== "true";
    });
    const weights = [...new Set(
      all
        .filter((element) => element.textContent?.trim())
        .map((element) => getComputedStyle(element).fontWeight)
    )].sort();
    const readRadius = (element) =>
      Number.parseFloat(getComputedStyle(element).borderTopLeftRadius);

    return {
      horizontalOverflow: document.body.scrollWidth > innerWidth + 1,
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
        .filter(({ width, height }) => width < 44 || height < 44),
      fontWeights: weights,
      irregularRadii: all
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            radius: Math.round(readRadius(element) * 10) / 10,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            label: element.getAttribute("aria-label") ?? element.textContent?.trim().replace(/\s+/g, " ").slice(0, 60)
          };
        })
        .filter((entry, index) => {
          const element = all[index];
          const nativeSwitchGeometry =
            element !== element.closest("[role='switch']") &&
            Boolean(element.closest("[role='switch']"));
          if (nativeSwitchGeometry) return false;
          const { radius, width, height } = entry;
          const circle = Math.abs(width - height) <= 2 && radius >= Math.min(width, height) / 2 - 1;
          const tinyGeometry = Math.min(width, height) <= 8;
          return radius > 0 && ![8, 14, 18].includes(radius) && !circle && !tinyGeometry;
        })
        .slice(0, 20)
    };
  });
  const screenshot = `${outputDir}/${name}.png`;
  await page.screenshot({ path: screenshot, fullPage: false });
  return { name, screenshot, ...metrics };
};

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.getByTestId("onboarding-use-demo").waitFor();
await clickTestID("onboarding-use-demo");
await page.getByTestId("ride-toggle").waitFor();

const screens = [];

await clickTestID("profile-button");
for (const [testID, name, focusTestID] of [
  ["account-open-personalization", "account-personalization", "account-academy-focus"],
  ["account-open-notifications", "account-notifications", ""],
  ["account-open-privacy", "account-privacy", ""],
  ["account-open-security", "account-security", ""],
  ["account-open-help", "account-help", ""]
]) {
  await clickTestID(testID);
  screens.push(await inspect(name));
  if (focusTestID && await visible(focusTestID)) {
    await page.getByTestId(focusTestID).focus();
    screens.push(await inspect(`${name}-focused`));
  }
  if (name === "account-security") {
    const blockedButton = page.getByRole("button", { name: "Blocked accounts" });
    if (await blockedButton.isVisible().catch(() => false)) {
      await blockedButton.click();
      screens.push(await inspect("account-blocked"));
    }
  }
  await clickTestID("account-route-back");
}

await clickTestID("account-sign-out");
screens.push(await inspect("account-sign-out-confirmation"));
await page.getByRole("button", { name: "Close confirmation" }).click();
await settle();

await clickTestID("tab-gear");
await page.getByTestId("shop-search").focus();
screens.push(await inspect("shop-search-focused"));
await page.getByTestId("shop-search").fill("zzzz-no-result");
screens.push(await inspect("shop-search-empty"));
await clickTestID("market-clear-filters");

const firstProduct = page.locator("[data-testid^='shop-card-']").first();
await firstProduct.click();
await settle();
await clickTestID("shop-product-save");

await clickTestID("shop-product-fit");
screens.push(await inspect("shop-fit"));
await clickTestID("shop-route-back");

await clickTestID("shop-product-protection");
screens.push(await inspect("shop-protection"));
await clickTestID("shop-route-back");

await clickTestID("shop-product-message");
screens.push(await inspect("shop-conversation-unavailable"));
await clickTestID("shop-route-back");
await clickTestID("shop-product-back");

for (const [testID, name] of [
  ["shop-open-orders", "shop-orders"],
  ["shop-open-saved", "shop-saved"],
  ["shop-open-messages", "shop-messages"]
]) {
  await clickTestID(testID);
  screens.push(await inspect(name));
  await clickTestID("shop-route-back");
}

await clickTestID("shop-mode-sell");
for (const [label, name] of [
  ["Orders", "seller-orders"],
  ["Revenue", "seller-revenue"],
  ["Messages", "seller-messages"]
]) {
  const action = page.getByRole("button").filter({ hasText: label }).first();
  await action.click();
  await settle();
  screens.push(await inspect(name));
  await clickTestID("shop-route-back");
}

const firstSellerListing = page.locator("[data-testid^='seller-listing-']").first();
if (await firstSellerListing.isVisible().catch(() => false)) {
  await firstSellerListing.click();
  screens.push(await inspect("seller-listing"));
  if (await visible("seller-view-public-listing")) {
    await clickTestID("seller-view-public-listing");
    screens.push(await inspect("seller-public-listing"));
    await clickTestID("shop-product-back");
  } else {
    await clickTestID("shop-route-back");
  }
}

await writeFile(
  `${outputDir}/report.json`,
  JSON.stringify({ viewport, consoleErrors: [...new Set(consoleErrors)], screens }, null, 2)
);

console.log(JSON.stringify({
  outputDir,
  consoleErrors: [...new Set(consoleErrors)],
  screens: screens.map((screen) => ({
    name: screen.name,
    horizontalOverflow: screen.horizontalOverflow,
    undersizedControls: screen.undersizedControls,
    fontWeights: screen.fontWeights,
    irregularRadii: screen.irregularRadii
  }))
}, null, 2));

await context.close();
await browser.close();
