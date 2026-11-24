import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

// The export to scan: `dist` unless a directory is named
// (npm run security:bundle-scan -- some/export). `npm run build` puts the web
// export there. To scan the iOS and Android bundles too, export all three as
// JavaScript first:
//   npx expo export --platform all --no-bytecode
const outputName = process.argv[2] ?? "dist";
const outputDirectory = resolve(process.cwd(), outputName);
if (!existsSync(outputDirectory)) {
  throw new Error(`${outputName} does not exist. Run the client export before scanning it.`);
}

const textExtensions = new Set([".html", ".js", ".json", ".map", ".txt"]);
// Hermes bytecode, what a native export holds by default. It packs its strings
// back to back and lets them overlap, so these patterns cannot be trusted on
// it: "sb_secret_" from the Supabase client runs straight into the next string
// and looks like a key, while a real key loses the word boundary in front of
// it. Bytecode is therefore never counted as scanned.
const bytecodeExtensions = new Set([".hbc"]);
const patterns = [
  {
    name: "Supabase secret key value",
    expression: /sb_secret_[A-Za-z0-9_-]{20,}/
  },
  {
    name: "Stripe secret value",
    expression: /\b(?:sk_(?:live|test)|whsec)_[A-Za-z0-9]{16,}/
  },
  {
    // RevenueCat secret keys read every customer's purchases. Public SDK keys
    // (appl_, goog_, test_) belong in the app and are not matched.
    name: "RevenueCat secret value",
    expression: /\bsk_[A-Za-z0-9]{24,}/
  },
  {
    name: "server-only environment name",
    expression: /\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|EQUINA_AI_API_KEY|ORDER_AUTOMATION_SECRET|ACCOUNT_AUTOMATION_SECRET|NOTIFICATION_AUTOMATION_SECRET|MODERATION_AUTOMATION_SECRET|STORAGE_AUTOMATION_SECRET|CONTENT_MODERATION_TOKEN|TAX_QUOTE_TOKEN|MALWARE_SCAN_URL|MALWARE_SCAN_TOKEN|MALWARE_SCAN_REQUIRED|SENTRY_DSN|REVENUECAT_SECRET_API_KEY|REVENUECAT_WEBHOOK_AUTHORIZATION)\b/
  }
] as const;

const files: string[] = [];
const bytecode: string[] = [];
const visit = (directory: string) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) visit(path);
    else if (textExtensions.has(extname(path))) files.push(path);
    else if (bytecodeExtensions.has(extname(path))) bytecode.push(path);
  }
};
visit(outputDirectory);

const findings: Array<{ rule: string; file: string }> = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const pattern of patterns) {
    if (pattern.expression.test(source)) {
      findings.push({
        rule: pattern.name,
        file: relative(process.cwd(), file)
      });
    }
  }
}

if (findings.length || bytecode.length) {
  console.error("Client secret scan failed.");
  for (const finding of findings) {
    console.error(`- ${finding.rule}: ${finding.file}`);
  }
  for (const file of bytecode) {
    console.error(`- not scanned, Hermes bytecode: ${relative(process.cwd(), file)}`);
  }
  if (bytecode.length) {
    console.error("Export the native bundles as JavaScript to scan them: npx expo export --platform all --no-bytecode");
  }
  process.exitCode = 1;
} else {
  console.log(`Client secret scan passed across ${files.length} exported text files.`);
}
