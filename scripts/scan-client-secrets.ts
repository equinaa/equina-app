import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const outputDirectory = join(process.cwd(), "dist");
if (!existsSync(outputDirectory)) {
  throw new Error("dist does not exist. Run the client export before scanning it.");
}

const textExtensions = new Set([".html", ".js", ".json", ".map", ".txt"]);
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
const visit = (directory: string) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) visit(path);
    else if (textExtensions.has(extname(path))) files.push(path);
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

if (findings.length) {
  console.error("Client secret scan failed.");
  for (const finding of findings) {
    console.error(`- ${finding.rule}: ${finding.file}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Client secret scan passed across ${files.length} exported text files.`);
}
