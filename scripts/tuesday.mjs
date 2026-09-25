// The Tuesday routine: freeze the latest finished week and scout it. GitHub runs this weekly (.github/workflows/tuesday.yml).
//   npm run tuesday          latest finished week; does nothing if it's already done, so it's safe to schedule
//   npm run tuesday -- 3     that week, even if it was done before
// With REPORT_FILE set, the scout's report is also written there (the workflow posts it as a GitHub issue).
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { feeds } from "../lib/sleeper.ts";

const asked = process.argv[2];
const week = Number(asked || (await feeds.league()).settings.last_scored_leg);
if (!asked && existsSync(new URL(`../lib/weeks/${week}.json`, import.meta.url))) {
  console.log(`Week ${week} is already done. Nothing new.`);
  process.exit(0);
}

const run = script => execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), String(week)], { encoding: "utf8" }).trim();
console.log(run("./snapshot.mjs"));
const report = [
  `Week ${week} is final and saved. The scout's ranking of every game, most talked-about first:`,
  "",
  run("./scout.mjs"),
  "",
  `The top three are on the site with receipts. Add your blurb to lib/weeks/${week}.json, or paste it to Claude.`,
].join("\n");
console.log(`\n${report}`);
if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, `${week}\n${report}\n`);
