import fs from "node:fs";
import path from "node:path";

const root = path.resolve("..", "vorlagen", "vault");
const dest = path.resolve("bundled");

const keep = ["anleitungen", "toolset.yaml", "AGENTS.md"];

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

for (const name of keep) {
  const from = path.join(root, name);
  const to = path.join(dest, name);
  fs.cpSync(from, to, { recursive: true });
}
