import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Password fields (tester feedback, 2026-11-27): an eye to show the password,
// and the iPhone's Passwords app able to fill a saved one with Face ID.
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

{
  // Every EquinaField marked secureTextEntry gets the eye; it shows and hides
  // the text by flipping secureTextEntry, and says which it will do.
  const primitives = read("src/ui/primitives/EquinaPrimitives.tsx");
  assert.match(primitives, /const revealable = secureTextEntry === true;/);
  assert.match(primitives, /secureTextEntry=\{revealable \? !revealed : secureTextEntry\}/);
  assert.match(primitives, /accessibilityLabel=\{revealed \? "Hide password" : "Show password"\}/);
  assert.match(primitives, /onPress=\{\(\) => setRevealed\(\(value\) => !value\)\}/);
  assert.match(primitives, /\{revealed \? \(\s+<EyeOff /);
  // The text never runs under the eye.
  assert.match(primitives, /revealable && primitiveStyles\.inputWithReveal/);
}

{
  // The account sheet's email is the login's username, so iOS can pair the
  // saved password with it; the password keeps its new/current roles.
  const onboarding = read("src/features/onboarding/OnboardingScreen.tsx");
  assert.match(onboarding, /testID="onboarding-email"[\s\S]{0,700}textContentType="username"/);
  assert.doesNotMatch(onboarding, /textContentType="emailAddress"/);
  assert.match(onboarding, /textContentType=\{method === "password" \? "newPassword" : "password"\}/);
  // Both password fields in recovery are new passwords, with the eye.
  const recovery = read("src/features/account/PasswordRecoveryScreen.tsx");
  assert.equal(recovery.match(/textContentType="newPassword"/g)?.length, 2);
  assert.equal(recovery.match(/secureTextEntry/g)?.length, 2);
}

{
  // The app claims the web domains whose saved passwords it may fill; the
  // file those domains must serve is kept with the app, for the site.
  const app = JSON.parse(read("app.json")) as { expo: { ios: { associatedDomains?: string[]; bundleIdentifier: string } } };
  assert.deepEqual(app.expo.ios.associatedDomains, ["webcredentials:www.equina.ai", "webcredentials:equina.ai"]);
  const association = JSON.parse(read("docs/apple-app-site-association/apple-app-site-association")) as {
    webcredentials: { apps: string[] };
  };
  assert.deepEqual(association.webcredentials.apps, [`3F67G37DN8.${app.expo.ios.bundleIdentifier}`]);
}

console.log("Password fields passed.");
