// Seeded generator for the four synthetic projects. Run once (`npm run seed`) and commit public/fixtures/*.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { USER_A, USER_B } from "../src/engine/ids";
import type { Project } from "../src/engine/types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ["Avel Brask", "Nora Quillet", "Joss Penhale", "Dara Vexley", "Orrin Vasko", "Tessa Hollin", "Bram Eskild", "Ilsa Dunmore", "Corwin Pell", "Lumi Aldous", "Hale Ferrow", "Sunny Marrow"];
const TODO_TITLES = ["Water the plants", "Book dentist", "Draft release notes", "Fix flaky test", "Order coffee", "Plan offsite", "Renew domain", "Review pull request", "Write changelog", "Call the plumber"];
const TENANTS = ["Harbor Bakery", "Northwind Cycles", "Lantern Books", "Tidepool Studio", "Granite Labs", "Juniper Dental"];
const BODIES = ["See you at noon", "Can you send the file?", "Running ten minutes late", "Thanks, that works", "Let's move the call", "Shipping tomorrow"];
const ACTIONS = ["login", "logout", "export", "update_profile", "delete_item", "invite_sent"];
const STATUSES = ["queued", "running", "done", "failed"];

function makeRng(seed: number) {
  const r = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("");
  const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(r() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  return { pick, hex, uuid, int };
}

const esc = (v: string | number | boolean) => (typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v));
const ROWS = 40;

type Cell = string | number | boolean;
function inserts(table: string, cols: string[], rows: Cell[][]): string {
  return `insert into public.${table} (${cols.join(", ")}) values\n${rows
    .map((r) => `  (${r.map(esc).join(", ")})`)
    .join(",\n")};`;
}

function build(seed: number) {
  const g = makeRng(seed);
  const owner = (i: number) => (i % 2 === 0 ? USER_A : USER_B); // 20 rows each
  const gen = (n: number, f: (i: number) => Cell[]) => Array.from({ length: n }, (_, i) => f(i));
  const email = (i: number) => `user${i + 1}@example.test`;
  return {
    profiles: () => inserts("profiles", ["id", "user_id", "email", "display_name"],
      gen(ROWS, (i) => [g.uuid(), owner(i), email(i), g.pick(NAMES)])),
    todos: () => inserts("todos", ["id", "user_id", "title", "done"],
      gen(ROWS, (i) => [g.uuid(), owner(i), g.pick(TODO_TITLES), g.int(0, 1) === 1])),
    invites: () => inserts("invites", ["id", "email", "token"],
      gen(ROWS, (i) => [g.uuid(), email(i), `tok_${g.hex(24)}`])),
    tenants: () => inserts("tenants", ["id", "name", "contact_email"],
      gen(ROWS, (i) => [g.uuid(), `${g.pick(TENANTS)} ${i + 1}`, email(i)])),
    orders: () => inserts("orders", ["id", "user_id", "amount", "card_last4"],
      gen(ROWS, (i) => [g.uuid(), owner(i), g.int(5, 500), String(g.int(0, 9999)).padStart(4, "0")])),
    customer_notes: () => inserts("customer_notes", ["id", "user_id", "note"],
      gen(ROWS, (i) => [g.uuid(), owner(i), `Follow up ${i + 1}: ${g.pick(BODIES)}`])),
    messages: () => inserts("messages", ["id", "user_id", "body"],
      gen(ROWS, (i) => [g.uuid(), owner(i), g.pick(BODIES)])),
    sessions: () => inserts("sessions", ["id", "user_id", "token"],
      gen(ROWS, (i) => [g.uuid(), owner(i), `tok_${g.hex(24)}`])),
    audit_log: () => inserts("audit_log", ["id", "actor", "action"],
      gen(ROWS, (i) => [g.uuid(), owner(i), g.pick(ACTIONS)])),
    exports: () => inserts("exports", ["id", "user_id", "email", "phone"],
      gen(ROWS, (i) => [g.uuid(), owner(i), email(i), `+1-555-01${String(g.int(0, 99)).padStart(2, "0")}`])),
    export_jobs: () => inserts("export_jobs", ["id", "user_id", "status"],
      gen(ROWS, (i) => [g.uuid(), owner(i), g.pick(STATUSES)])),
  };
}

const ownerPolicy = (t: string, col = "user_id", to = "authenticated") =>
  `create policy ${t}_owner on public.${t} for all to ${to} using (auth.uid() = ${col}) with check (auth.uid() = ${col});`;

const P1_BASELINE = `create table public.profiles (
  id uuid primary key,
  user_id uuid not null,
  email text not null,
  display_name text
);

create table public.todos (
  id uuid primary key,
  user_id uuid not null,
  title text not null,
  done boolean not null default false
);
alter table public.todos enable row level security;
${ownerPolicy("todos")}
`;

export function buildProjects(): Project[] {
  const s1 = build(1001), s2 = build(1002), s3 = build(1003), s4 = build(1004);
  return [
    {
      id: "p1",
      title: "Todo app built with a coding agent",
      blurb: "A coding agent scaffolded profiles and todos, then added an invites table with one bare CREATE TABLE and no security thinking.",
      baselineSql: P1_BASELINE,
      releaseSql: `-- added by the agent in a later release: one bare create table, nothing else
create table public.invites (
  id uuid primary key,
  email text not null,
  token text not null
);
`,
      seedSql: [s1.profiles(), s1.todos(), s1.invites()].join("\n\n") + "\n",
    },
    {
      id: "p2",
      title: "Per-customer provisioning script",
      blurb: "A provisioning script stamps out tenant tables. The latest one ships with RLS on, no policy and no grants.",
      baselineSql: `create table public.tenants (
  id uuid primary key,
  name text not null,
  contact_email text not null
);

create table public.orders (
  id uuid primary key,
  user_id uuid not null,
  amount integer not null,
  card_last4 text not null
);
alter table public.orders enable row level security;
${ownerPolicy("orders")}
`,
      releaseSql: `-- provisioning script, release 2: RLS on, no policy, no grants
create table public.customer_notes (
  id uuid primary key,
  user_id uuid not null,
  note text not null
);
alter table public.customer_notes enable row level security;
`,
      seedSql: [s2.tenants(), s2.orders(), s2.customer_notes()].join("\n\n") + "\n",
    },
    {
      id: "p3",
      title: "Mixed hygiene",
      blurb: "Some tables are careful, some are not: a public-read policy, a sessions table with RLS off, and a tidy audit log.",
      baselineSql: `create table public.messages (
  id uuid primary key,
  user_id uuid not null,
  body text not null
);
alter table public.messages enable row level security;
create policy messages_read on public.messages for select to public using (true);

create table public.sessions (
  id uuid primary key,
  user_id uuid not null,
  token text not null
);
`,
      releaseSql: `create table public.audit_log (
  id uuid primary key,
  actor uuid not null,
  action text not null
);
alter table public.audit_log enable row level security;
${ownerPolicy("audit_log", "actor")}
`,
      seedSql: [s3.messages(), s3.sessions(), s3.audit_log()].join("\n\n") + "\n",
    },
    {
      id: "p4",
      title: "Release with an export table",
      blurb: "Same app as project 1, but the next release adds a contact export table with RLS off and a jobs table with RLS on and no policy.",
      baselineSql: P1_BASELINE,
      releaseSql: `-- release adds a contact export and its job queue. No blanket grant line here; the UI toggle adds one.
create table public.exports (
  id uuid primary key,
  user_id uuid not null,
  email text not null,
  phone text not null
);

create table public.export_jobs (
  id uuid primary key,
  user_id uuid not null,
  status text not null
);
alter table public.export_jobs enable row level security;
`,
      seedSql: [s4.profiles(), s4.todos(), s4.exports(), s4.export_jobs()].join("\n\n") + "\n",
    },
  ];
}

if (process.argv[1]?.endsWith("seed.ts")) {
  mkdirSync("public/fixtures", { recursive: true });
  for (const p of buildProjects()) {
    writeFileSync(`public/fixtures/${p.id}.json`, JSON.stringify(p, null, 2) + "\n");
    console.log("wrote", p.id);
  }
}
