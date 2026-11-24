import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// scripts/scan-client-secrets.ts (npm run security:bundle-scan) fails when a
// server secret would ship in an exported bundle: the web export, and the iOS
// and Android bundles when they are exported as JavaScript.

const root = process.cwd();
const scan = (directory: string) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/scan-client-secrets.ts", directory], {
    cwd: root,
    encoding: "utf8"
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

// Shaped like the real things, built here so no file in the repository holds one.
const supabaseSecret = ["sb", "secret", "x".repeat(24)].join("_");
const stripeSecret = ["sk", "test", "x".repeat(20)].join("_");
const serverOnlyName = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
const publicValues = `const key = "sb_publishable_${"p".repeat(24)}"; const store = "appl_${"p".repeat(24)}";`;

const work = mkdtempSync(join(tmpdir(), "equina-secret-scan-"));
const exportTo = (name: string, files: Record<string, string | Buffer>) => {
  const directory = join(work, name);
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(join(directory, file, ".."), { recursive: true });
    writeFileSync(join(directory, file), contents);
  }
  return directory;
};

try {
  const web = scan(exportTo("web", { "index.html": "<html></html>", "_expo/static/js/web/index.js": publicValues }));
  assert.equal(web.status, 0, "Public keys belong in the app.");
  assert.match(web.output, /passed across 2 exported text files\./);

  const leakedWeb = scan(exportTo("web-leak", { "_expo/static/js/web/index.js": `${publicValues} const admin = "${supabaseSecret}";` }));
  assert.equal(leakedWeb.status, 1, "A secret key in the web bundle fails the scan.");
  assert.match(leakedWeb.output, /Supabase secret key value: .*web.index\.js/);
  assert.ok(!leakedWeb.output.includes(supabaseSecret), "The scan names the file, not the secret.");

  // The native bundles, exported with --no-bytecode, are JavaScript like the web one.
  const native = scan(
    exportTo("native", {
      "metadata.json": "{}",
      "_expo/static/js/ios/index.js": publicValues,
      "_expo/static/js/android/index.js": publicValues
    })
  );
  assert.equal(native.status, 0);
  assert.match(native.output, /passed across 3 exported text files\./);

  const leakedNative = scan(
    exportTo("native-leak", {
      "_expo/static/js/ios/index.js": `${publicValues} const stripe = "${stripeSecret}";`,
      "_expo/static/js/android/index.js": `${publicValues} const role = process.env.${serverOnlyName};`
    })
  );
  assert.equal(leakedNative.status, 1, "A secret in a native bundle fails the scan.");
  assert.match(leakedNative.output, /Stripe secret value: .*ios.index\.js/);
  assert.match(leakedNative.output, /server-only environment name: .*android.index\.js/);
  assert.ok(!leakedNative.output.includes(stripeSecret));

  // Hermes bytecode is what a native export holds by default. The patterns
  // cannot be trusted on it, so it is never counted as scanned: before, the
  // scan skipped it and still said it passed.
  const hermes = Buffer.concat([Buffer.from([0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f]), Buffer.from(publicValues, "latin1")]);
  const bytecodeOnly = scan(exportTo("bytecode", { "metadata.json": "{}", "_expo/static/js/ios/index.hbc": hermes }));
  assert.equal(bytecodeOnly.status, 1, "An export the scan cannot read is not a pass.");
  assert.match(bytecodeOnly.output, /not scanned, Hermes bytecode: .*ios.index\.hbc/);
  assert.match(bytecodeOnly.output, /npx expo export --platform all --no-bytecode/, "It says how to get bundles it can read.");

  const missing = scan(join(work, "never-exported"));
  assert.notEqual(missing.status, 0);
  assert.match(missing.output, /does not exist\. Run the client export before scanning it\./);
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log("Client secret scan passed its own checks.");
