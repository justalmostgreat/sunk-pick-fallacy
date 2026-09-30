// The Tuesday routine: freeze the latest finished week and scout it. GitHub runs this weekly (.github/workflows/tuesday.yml).
//   npm run tuesday          latest finished week; reuses an existing snapshot and prepares its report for retry
//   npm run tuesday -- 3     that week, even if it was done before
// With REPORT_FILE set, the scout's report is also written there (the workflow posts it as a GitHub issue).
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { feeds } from "../lib/sleeper.ts";

const asked = process.argv[2];
const week = Number(asked || (await feeds.league()).settings.last_scored_leg);
if (!Number.isInteger(week) || week < 1 || week > 18) throw new Error("Expected a week from 1 to 18.");
const saved = existsSync(new URL(`../lib/weeks/${week}.json`, import.meta.url));

const run = script => execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), String(week)], { encoding: "utf8" }).trim();
if (asked || !saved) console.log(run("./snapshot.mjs"));
else console.log(`Week ${week} is already saved. Preparing its report in case notification needs a retry.`);
const report = [
  `Week ${week} is final and saved. The scout's ranking of every game, most talked-about first:`,
  "",
  run("./scout.mjs"),
  "",
  "---",
  "**Reply to this issue with your blurb, pasted as-is, and it goes on the site.** One paragraph per game, starting with the ALL-CAPS hook, like the group-chat version.",
  "Optional lines: `meme: Jag - caption` puts the reaction photo on that game; `cover: meme` puts it on this week's cover.",
  "",
  "**New picture? Send the picture and blurb together in Codex or Claude. GitHub drops pictures attached to email replies.** Text-only email replies can reuse a picture already saved for that week.",
  "",
  "Copy this format (replace the example text):",
  "```text",
  `WEEK ${week} RECAP`,
  "",
  "FIRST ALL-CAPS HOOK. Coach name, opponent name, and your story.",
  "",
  "SECOND ALL-CAPS HOOK. Coach name, opponent name, and your story.",
  "",
  "meme: Jag - Your caption",
  "cover: meme",
  "```",
].join("\n");
console.log(`\n${report}`);
if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, `${week}\n${report}\n`);
