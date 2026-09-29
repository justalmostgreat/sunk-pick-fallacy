// Save only weekly data through the repository's required pull-request process.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function saveWeek(week, kind, run = (command, args) =>
  execFileSync(command, args, { encoding: "utf8" }).trim(), env = process.env) {
  if (!/^(?:[1-9]|1[0-8])$/.test(String(week)) || !["snapshot", "blurb"].includes(kind)) {
    throw new Error("Usage: node scripts/save-week.mjs <week 1-18> <snapshot|blurb>");
  }
  const paths = [`lib/weeks/${week}.json`, "lib/weeks/index.ts"];
  run("git", ["add", "--", ...paths]);
  const changed = run("git", ["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
  if (!changed.length) return "Weekly data already saved.";
  if (changed.some(path => !paths.includes(path))) {
    throw new Error("Refusing to merge changes outside this week's data.");
  }
  if (!/^\d+$/.test(env.GITHUB_RUN_ID ?? "") || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? "")) {
    throw new Error("Saving weekly data requires a GitHub Actions run ID and attempt.");
  }
  const branch = `weekly/${week}-${kind}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const title = `Week ${week} ${kind}`;
  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run("git", ["switch", "-c", branch]);
  run("git", ["commit", "-m", title]);
  const head = run("git", ["rev-parse", "HEAD"]);
  run("git", ["push", "--set-upstream", "origin", branch]);
  const pr = run("gh", ["pr", "create", "--base", "main", "--head", branch,
    "--title", title, "--body", "Automated weekly data update. Model and parser checks passed before saving. No application or workflow code changes."]);
  run("gh", ["pr", "merge", pr, "--squash", "--match-head-commit", head]);
  try {
    run("git", ["push", "origin", "--delete", branch]);
  } catch {
    console.warn(`Saved successfully; branch ${branch} can be cleaned up later.`);
  }
  return `Saved through ${pr}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(saveWeek(process.argv[2], process.argv[3]));
}
