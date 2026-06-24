import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const outFile = resolve(root, "build-info.generated.ts");

function git(args) {
  try {
    const result = execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return String(result || "").trim();
  } catch {
    return "";
  }
}

function gitQuiet(args) {
  try {
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function ensureFullHistory() {
  if (git(["rev-parse", "--is-shallow-repository"]) !== "true") {
    return;
  }

  const fetchAttempts = [
    ["fetch", "--unshallow", "--tags", "--quiet"],
    ["fetch", "--deepen=1000", "--tags", "--quiet"],
    ["fetch", "--deepen=1000", "--quiet"],
  ];

  for (const attempt of fetchAttempts) {
    if (gitQuiet(attempt)) {
      break;
    }
  }
}

function pickBranch() {
  const branch = (
    git(["rev-parse", "--abbrev-ref", "HEAD"]) ||
    process.env.GITHUB_REF_NAME ||
    process.env.CF_PAGES_BRANCH ||
    "unknown"
  );
  if (branch === "HEAD") {
    return process.env.GITHUB_REF_NAME || process.env.CF_PAGES_BRANCH || "main";
  }
  return branch;
}

function pickSha() {
  return (
    git(["rev-parse", "HEAD"]) ||
    process.env.GITHUB_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    "unknown"
  );
}

function pickCommitCount() {
  const value = git(["rev-list", "--count", "HEAD"]);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickRecentCommits(limit = 20) {
  const raw = git(["log", `-${limit}`, "--pretty=format:%s"]);
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function pickRecentBuilds(limit = 20) {
  const raw = git(["log", `-${limit}`, "--date=iso-strict", "--pretty=format:%H|%h|%cI|%s"]);
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, committedAt, subject] = line.split("|");
      return {
        sha: sha || "",
        shortSha: shortSha || "",
        committedAt: committedAt || "",
        subject: subject || "",
      };
    })
    .slice(0, limit);
}

const branch = pickBranch();
const sha = pickSha();
const shortSha = sha === "unknown" ? "unknown" : sha.slice(0, 8);
ensureFullHistory();
const commitCount = pickCommitCount();
const builtAt = new Date().toISOString();
const recentCommits = pickRecentCommits();
const recentBuilds = pickRecentBuilds();

const file = `export const BUILD_SOURCE = ${JSON.stringify(
  {
    branch,
    sha,
    shortSha,
    commitCount,
    builtAt,
    recentCommits,
    recentBuilds,
  },
  null,
  2
)} as const;
`;

writeFileSync(outFile, file, "utf8");
console.log(`Generated ${outFile}`);
