import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { supportEmail, supportMailto } from "../src/config/support-contact";

// The app has no over-the-air updates: the address a build ships with is the
// one its riders write to for as long as that build is installed.
assert.equal(supportEmail, "contact@equina.ai", "The address published on equina.ai.");
assert.equal(supportMailto, "mailto:contact@equina.ai?subject=Equina%20support");

const root = process.cwd();
const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx|json|html)$/.test(name) ? [path] : [];
  });
const shipped = ["src", join("admin", "src"), join("supabase", "functions"), join("supabase", "templates")]
  .flatMap((directory) => sourceFiles(join(root, directory)))
  .concat(join(root, "app.json"), join(root, "index.ts"))
  .map((path) => ({ path: relative(root, path), source: readFileSync(path, "utf8") }));
assert.ok(shipped.length > 100, "The scan found the sources.");

// The company's domain is equina.ai. equina.app is a look-alike the app once
// wrote to; mail sent there does not reach the team. Nothing that ships -- the
// app, the Admin, the functions, the emails -- may point at it.
for (const { path, source } of shipped) {
  assert.doesNotMatch(source, /equina\.app\b/i, `${path} must not point at equina.app.`);
}

// In the app the address is typed once: one typed a second time is the one
// that gets forgotten when the mailbox changes.
const app = shipped.filter(({ path }) => path.startsWith(`src${sep}`) || path === "app.json" || path === "index.ts");
const addressed = app
  .filter(({ source }) => /mailto:|[\w.+-]+@equina\.[a-z]+/i.test(source))
  .map(({ path }) => path);
assert.deepEqual(addressed, [join("src", "config", "support-contact.ts")],
  "Only support-contact.ts may spell out an Equina address.");

console.log("Support contact passed.");
