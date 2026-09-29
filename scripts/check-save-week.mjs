import assert from "node:assert/strict";
import { saveWeek } from "./save-week.mjs";

function scenario(changed, failure) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (failure?.(command, args)) throw new Error("simulated failure");
    if (args[0] === "diff") return changed;
    if (args[0] === "rev-parse") return "verified-head";
    if (command === "gh" && args[1] === "create") return "https://github.com/example/site/pull/1";
    return "";
  };
  return { calls, run };
}

const env = { GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "2" };
const unchanged = scenario("");
assert.equal(saveWeek(3, "snapshot", unchanged.run, env), "Weekly data already saved.");
assert.equal(unchanged.calls.some(call => call[0] === "gh" || call[1] === "push"), false);

for (const kind of ["snapshot", "blurb"]) {
  const update = scenario("lib/weeks/3.json\nlib/weeks/index.ts");
  saveWeek(3, kind, update.run, env);
  assert.deepEqual(update.calls.find(call => call[1] === "push"),
    ["git", "push", "--set-upstream", "origin", `weekly/3-${kind}-123-2`]);
  assert.deepEqual(update.calls.find(call => call[2] === "merge"), ["gh", "pr", "merge", "https://github.com/example/site/pull/1",
    "--squash", "--match-head-commit", "verified-head"]);
}

const unrelated = scenario("lib/weeks/3.json\napp/page.tsx");
assert.throws(() => saveWeek(3, "blurb", unrelated.run, env), /outside this week's data/);
assert.equal(unrelated.calls.some(call => call[1] === "commit"), false);
const failed = scenario("lib/weeks/3.json", (command, args) => command === "gh" && args[1] === "create");
assert.throws(() => saveWeek(3, "snapshot", failed.run, env), /simulated failure/);
assert.equal(failed.calls.some(call => call[2] === "merge"), false);
const cleanup = scenario("lib/weeks/3.json", (command, args) => command === "git" && args.includes("--delete"));
assert.match(saveWeek(3, "snapshot", cleanup.run, env), /^Saved through /);
assert.throws(() => saveWeek("3; echo unsafe", "snapshot", unchanged.run, env), /Usage/);
console.log("weekly save checks passed");
