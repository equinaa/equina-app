import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.EQUINA_VISUAL_URL ?? "http://127.0.0.1:8081/?audit=auth";
const outputDir = process.env.EQUINA_VISUAL_OUTPUT ?? "/tmp/equina-onboarding-auth";
const executablePath =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const viewports = [
  { id: "iphone-se", width: 375, height: 667 },
  { id: "iphone-15-pro", width: 393, height: 852 }
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-dev-shm-usage"]
});
const results = [];

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "dark"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByTestId("onboarding-name").fill("Alexandria Montgomery");
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-horse-mode-none").click();
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-create-account").click();
  await page.getByTestId("onboarding-auth-google").waitFor();
  await page.waitForTimeout(420);

  const choicePath = `${outputDir}/${viewport.id}-account-methods.png`;
  await page.screenshot({ path: choicePath });
  await page.getByTestId("onboarding-auth-email").click();
  await page.getByTestId("onboarding-email").fill("alexandria@example.com");
  await page.waitForTimeout(180);
  const emailPath = `${outputDir}/${viewport.id}-email-code.png`;
  await page.screenshot({ path: emailPath });
  await page.setViewportSize({ width: viewport.width, height: 420 });
  await page.getByTestId("onboarding-email").click();
  await page.getByTestId("onboarding-auth-send-code").scrollIntoViewIfNeeded();
  const emailKeyboardPath = `${outputDir}/${viewport.id}-email-keyboard.png`;
  await page.screenshot({ path: emailKeyboardPath });
  await page.setViewportSize(viewport);

  await page.getByTestId("onboarding-auth-use-password").click();
  await page.getByTestId("onboarding-auth-password").fill("correct-horse-battery");
  await page.waitForTimeout(180);
  const passwordPath = `${outputDir}/${viewport.id}-password.png`;
  await page.screenshot({ path: passwordPath });
  await page.setViewportSize({ width: viewport.width, height: 420 });
  await page.getByTestId("onboarding-auth-password").click();
  await page.getByTestId("onboarding-auth-create-password").scrollIntoViewIfNeeded();
  const passwordKeyboardPath = `${outputDir}/${viewport.id}-password-keyboard.png`;
  await page.screenshot({ path: passwordKeyboardPath });
  await page.setViewportSize(viewport);

  const audit = await page.evaluate(() => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll("button,[role='button'],input")].filter(visible);
    const fontWeights = [...document.querySelectorAll("body *")]
      .filter((element) => visible(element) && element.textContent?.trim())
      .map((element) => window.getComputedStyle(element).fontWeight);
    return {
      horizontalOverflow: document.body.scrollWidth > window.innerWidth + 1,
      undersizedControls: controls
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        })
        .map((element) => element.getAttribute("data-testid") ?? element.textContent?.trim()),
      invalidFontWeights: [...new Set(fontWeights)].filter((weight) => !["400", "600"].includes(weight))
    };
  });

  results.push({
    viewport,
    errors: [...new Set(errors)],
    screenshots: [
      choicePath,
      emailPath,
      emailKeyboardPath,
      passwordPath,
      passwordKeyboardPath
    ],
    ...audit
  });
  await context.close();
}

await browser.close();
await writeFile(`${outputDir}/report.json`, JSON.stringify(results, null, 2));

const failures = results.flatMap((result) => [
  ...result.errors,
  ...(result.horizontalOverflow ? [`${result.viewport.id}: horizontal overflow`] : []),
  ...result.undersizedControls.map((control) => `${result.viewport.id}: undersized ${control}`),
  ...result.invalidFontWeights.map((weight) => `${result.viewport.id}: invalid font weight ${weight}`)
]);
console.log(JSON.stringify({ outputDir, failures, results }, null, 2));
if (failures.length) process.exitCode = 1;
