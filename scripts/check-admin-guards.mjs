import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const adminDir = resolve(root, "functions/api/admin");

function listAdminFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) return listAdminFiles(full);
      if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) return [full];
      return [];
    });
}

const files = listAdminFiles(adminDir);
const violations = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const hasAdminRequestGuard = /requireAdminRequest\s*\(/.test(text);
  if (!hasAdminRequestGuard) {
    violations.push(file.replace(root + "\\", "").replaceAll("\\", "/"));
  }
}

if (violations.length) {
  console.error("Admin guard check failed. Every /api/admin/* handler must call requireAdminRequest(...).");
  for (const file of violations) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log(`Admin guard check passed for ${files.length} file(s).`);
