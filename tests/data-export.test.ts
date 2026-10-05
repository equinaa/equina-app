import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ID_BATCH_SIZE, idBatches, readInBatches } from "../supabase/functions/_shared/id-batches";
import { openBackendDatabase } from "./backend-database";

// The account export has to carry every table that holds a rider's data.
// Nothing lists those tables, so they are found the way the erasure test finds
// them: every public table with a foreign key to auth.users.
//
// Tables left out of the export on purpose, and why. A new table that
// references auth.users must either be read by request-data-export or be added
// here with its reason. The reasons are the ones backend-migrations.test.ts
// gives for keeping these tables after erasure: in them the account appears
// as the staff member who acted, or the row is a trust and safety assessment
// rather than something the rider wrote or owns.
const notExported: Record<string, string> = {
  app_feature_flags: "staff attribution on a global flag",
  club_spaces: "space attribution",
  coach_credit_policies: "staff attribution on a policy",
  coach_safety_events: "trust and safety record",
  listing_risk_signals: "trust and safety record",
  moderation_actions: "trust and safety record"
};

const db = await openBackendDatabase();

const riderReferences = await db.query<{ table_name: string; column_name: string }>(`
  select c.conrelid::regclass::text as table_name, a.attname as column_name
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.contype = 'f'
    and c.confrelid = 'auth.users'::regclass
    and c.connamespace = 'public'::regnamespace
`);
const parentReferences = await db.query<{ table_name: string; column_name: string }>(`
  select c.conrelid::regclass::text as table_name, a.attname as column_name
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  join pg_class parent on parent.oid = c.confrelid
  where c.contype = 'f'
    and c.connamespace = 'public'::regnamespace
    and parent.relnamespace = 'public'::regnamespace
`);
const columnsByTable = (rows: Array<{ table_name: string; column_name: string }>) => {
  const columns = new Map<string, Set<string>>();
  for (const { table_name, column_name } of rows) {
    const table = table_name.replace(/^public\./, "");
    columns.set(table, (columns.get(table) ?? new Set()).add(column_name));
  }
  return columns;
};
// The columns that name an account, and the columns that point at another
// table's rows.
const riderColumns = columnsByTable(riderReferences.rows);
const parentColumns = columnsByTable(parentReferences.rows);

// The export reads the rider's own rows with own("table", "column") or
// own("table", ["column", "column"]), a single row with ownRow(), and the rows
// that belong to those with under("table", "parent_column", parentIds).
const exportSource = readFileSync(
  join(process.cwd(), "supabase", "functions", "request-data-export", "index.ts"),
  "utf8"
);
const ownReads = [...exportSource.matchAll(/\bown(?:Row)?\(\s*"(\w+)",\s*(?:"(\w+)"|\[([^\]]*)\])(?:,\s*"([\w,]+)")?/g)]
  .map(([, table, column, columnList, select]) => ({
    table: table ?? "",
    by: column ? [column] : [...(columnList ?? "").matchAll(/"(\w+)"/g)].map((match) => match[1] ?? ""),
    select: select ?? "*"
  }));
const childReads = [...exportSource.matchAll(/\bunder\(\s*"(\w+)",\s*"(\w+)"/g)]
  .map(([, table, column]) => ({ table: table ?? "", by: [column ?? ""], select: "*" }));
// Rows that exist before the account does are kept by email: byEmail("table",
// "columns") reads them by the account's own address.
const emailReads = [...exportSource.matchAll(/\bbyEmail\(\s*"(\w+)",\s*"([\w,]+)"/g)]
  .map(([, table, select]) => ({ table: table ?? "", by: ["email"], select: select ?? "*" }));
const reads = [...ownReads, ...childReads, ...emailReads];
assert.ok(ownReads.length >= 30 && childReads.length >= 5, "Expected to find the reads of request-data-export.");
assert.ok(emailReads.some((read) => read.table === "beta_invites"), "Expected the export to read the rider's beta invite.");

// Only the rider's rows: an own read filters on a column that references
// auth.users, and a nested read on a column that points at its parent table.
for (const { table, by } of ownReads) {
  for (const column of by) {
    assert.ok(
      riderColumns.get(table)?.has(column),
      `request-data-export reads ${table} by ${column}, which is not one of its references to auth.users.`
    );
  }
}
for (const { table, by } of childReads) {
  assert.ok(
    parentColumns.get(table)?.has(by[0] ?? ""),
    `request-data-export reads ${table} by ${by[0]}, which does not point at another table's rows.`
  );
}
// An email read is the account's own address, normalized the way the table
// stores it, never an address from the request.
assert.match(
  exportSource,
  /const byEmail = [\s\S]{0,200}\.eq\("email", user\.email\.trim\(\)\.toLowerCase\(\)\)/,
  "request-data-export must read email-keyed rows by the account's own normalized address."
);
for (const { table } of emailReads) {
  await assert.doesNotReject(
    db.query(`select email from public.${table} limit 0`),
    `request-data-export reads ${table} by email, but it has no email column.`
  );
}
// A column list is only checked when the function runs; a typo would fail
// every export.
for (const { table, select } of reads) {
  if (select === "*") continue;
  await assert.doesNotReject(
    db.query(`select ${select} from public.${table} limit 0`),
    `request-data-export selects columns ${table} does not have: ${select}`
  );
}

const exported = new Set(reads.map((read) => read.table));
for (const table of riderColumns.keys()) {
  assert.ok(
    exported.has(table) || table in notExported,
    `${table} references auth.users but request-data-export neither exports it nor is it listed as left out on purpose.`
  );
}
for (const table of Object.keys(notExported)) {
  assert.ok(riderColumns.has(table), `${table} is listed as left out of the export but does not reference auth.users.`);
  assert.ok(!exported.has(table), `${table} is listed as left out of the export, but request-data-export reads it.`);
}

// The export is a file the rider downloads and may pass on, so it carries no
// credentials: a push token in it would let whoever holds the file send
// notifications to the rider's phone. Lease tokens are worker bookkeeping, not
// credentials; they only work through functions the service role alone may
// call.
const publicColumns = await db.query<{ table_name: string; column_name: string }>(`
  select table_name, column_name from information_schema.columns where table_schema = 'public'
`);
for (const { table, select } of reads) {
  const columns = select === "*"
    ? publicColumns.rows.filter((row) => row.table_name === table).map((row) => row.column_name)
    : select.split(",");
  for (const column of columns) {
    assert.ok(
      !/token|secret|password/.test(column) || /lease_token$/.test(column),
      `request-data-export exports ${table}.${column}, which holds a credential.`
    );
  }
}

await db.close();

// Child rows are read by a list of parent ids, and the ids travel in the URL.
// A yard with a few hundred records, or a seller with a few hundred orders,
// would otherwise send a request line past the gateway's 8 KB and lose the
// whole export.
assert.match(
  exportSource,
  /const under = [^;]*readInBatches\(/,
  "request-data-export must read child rows in batches of parent ids."
);
const parentIds = Array.from({ length: 250 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
assert.deepEqual(idBatches(parentIds).map((batch) => batch.length), [100, 100, 50]);
const requested: string[][] = [];
const rows = await readInBatches(parentIds, async (batch) => {
  requested.push(batch);
  return batch.map((id) => ({ id }));
});
assert.equal(requested.length, 3);
assert.deepEqual(rows.map((row) => row.id), parentIds);
assert.deepEqual(await readInBatches([], async () => {
  throw new Error("No ids, no request.");
}), []);
const batchQuery = createClient("https://abcdefghijklmnopqrst.supabase.co", "test-key", {
  auth: { persistSession: false, autoRefreshToken: false }
})
  .from("horse_record_files")
  .select("*")
  .in("record_id", parentIds.slice(0, ID_BATCH_SIZE));
const batchUrl = (batchQuery as unknown as { url: URL }).url.toString();
assert.ok(batchUrl.length < 8000, `A batch of ${ID_BATCH_SIZE} ids makes a ${batchUrl.length}-character URL.`);

console.log("Account export covers every table that holds a rider's data.");
