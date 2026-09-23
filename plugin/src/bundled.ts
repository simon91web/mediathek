function nodeRequire<T>(id: string): T {
  const req = (window as unknown as { require?: (moduleId: string) => T }).require;
  if (typeof req !== "function") {
    throw new Error("Dateizugriff gibt es nur in der Desktop-App.");
  }
  return req(id);
}

/** Relative Pfade unter `root`, mit Schrägstrich. */
export function listRelativeFiles(root: string): string[] {
  const fs = nodeRequire<typeof import("fs")>("fs");
  const path = nodeRequire<typeof import("path")>("path");
  const out: string[] = [];

  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.name !== ".gitkeep") {
        out.push(rel);
      }
    }
  };

  walk(root, "");
  return out;
}

export function copyIfMissing(fromRoot: string, toRoot: string, relative: string): void {
  const fs = nodeRequire<typeof import("fs")>("fs");
  const path = nodeRequire<typeof import("path")>("path");
  const from = path.join(fromRoot, relative);
  const to = path.join(toRoot, relative);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

export function vaultHas(vaultDir: string, relative: string): boolean {
  const fs = nodeRequire<typeof import("fs")>("fs");
  const path = nodeRequire<typeof import("path")>("path");
  return fs.existsSync(path.join(vaultDir, relative));
}
