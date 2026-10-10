// Runs initdb once, creates the roles + auth shim, and writes the data dir to public/pg-template.tar.gz.
// The browser loads it instead of paying ~4s for initdb on every visit. Re-run after upgrading @electric-sql/pglite.
import { writeFileSync } from "node:fs";
import { buildTemplate } from "../src/engine/db";

const blob = await buildTemplate();
writeFileSync("public/pg-template.tar.gz", Buffer.from(await blob.arrayBuffer()));
console.log("wrote public/pg-template.tar.gz", blob.size, "bytes");
process.exit(0);
