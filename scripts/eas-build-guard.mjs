// Stops an EAS build that would ship without a backend.
//
// The app reads EXPO_PUBLIC_* when it is bundled. On EAS those values come from
// two places: the switches committed in eas.json (the "env" of the build
// profile) and the EAS environment variables of the profile's environment (the
// Supabase URL and publishable key). When one is missing nothing fails by
// itself: the build succeeds and the app opens on "Sign-in is not available in
// this build."
//
// EAS runs this first, before npm install (package.json, "eas-build-pre-install"),
// so it may only import from Node itself. A failure here fails the build.
// `eas build --local` runs it the same way on this computer, and is checked
// like a build on EAS. Outside an EAS build it does nothing. It prints variable
// names, never values.
//
// To check a profile from this computer before spending a build, let EAS CLI
// hand over the variables it holds:
//   npx eas-cli@latest env:exec production "node scripts/eas-build-guard.mjs --rehearse production"
// A rehearsal also asks the project itself whether the address and the key are
// its own, which no rule can tell from their shape. Add --offline to skip that.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { backendAnswer, isEasBuild, isStoreBuild, reviewedSwitches, setTwice, storeBuildProblems } from "./store-build-rules.mjs";

const say = (line) => console.log(`eas-build-guard: ${line}`);
const complain = (line) => console.error(`eas-build-guard: ${line}`);

const check = async () => {
  const onEas = isEasBuild(process.env);
  const rehearsing = !onEas && process.argv[2] === "--rehearse";
  if (!onEas && !rehearsing) {
    say("not an EAS build, nothing to check.");
    return 0;
  }

  const profile = onEas ? process.env.EAS_BUILD_PROFILE : process.argv[3];
  if (rehearsing && !profile) {
    complain("name the build profile to rehearse: --rehearse production");
    return 1;
  }
  const build = profile ? `"${profile}" build` : "build with no profile name";
  if (!isStoreBuild(profile)) {
    say(`the ${build} is the development client. Store build checks skipped.`);
    return 0;
  }

  const problems = [];
  let switches = {};
  try {
    const easJson = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "eas.json"), "utf8"));
    switches = reviewedSwitches(easJson, profile, process.env.EAS_BUILD_PLATFORM);
  } catch {
    problems.push("eas.json could not be read, so the switches it gives this build were not checked.");
  }

  // On EAS the build machine has already put the two sources together. In a
  // rehearsal this computer only has the EAS variables, so the switches are
  // laid over them here, after making sure no name is in both.
  let env = process.env;
  if (rehearsing) {
    const twice = setTwice(env, switches);
    if (twice.length > 0) {
      problems.push(
        `Set outside eas.json as well as in it: ${twice.join(", ")}. ` +
          "Delete the EAS environment variable (or unset it in this shell): the switches live in eas.json."
      );
    }
    env = { ...env, ...switches };
  }
  problems.push(...storeBuildProblems({ profile, env, switches }));

  // The values have the right shape. Whether they are a live project's own is
  // asked of the project, from this computer only and never from a build.
  const backendLooksRight = !problems.some((problem) => problem.startsWith("EXPO_PUBLIC_SUPABASE_"));
  if (rehearsing && backendLooksRight && !process.argv.includes("--offline")) {
    const answer = await backendAnswer(env);
    if (answer) problems.push(answer);
    else say("the project answered with these two values.");
  }

  const names = Object.keys(env)
    .filter((name) => name.startsWith("EXPO_PUBLIC_"))
    .sort();
  say(`EXPO_PUBLIC_ names ${rehearsing ? "a" : "this"} ${build} sees, without their values: ${names.join(", ") || "none"}.`);

  if (problems.length > 0) {
    complain(rehearsing ? `the ${build} would be stopped.` : `the ${build} was stopped.`);
    for (const problem of problems) complain(`- ${problem}`);
    complain('how these are set is in README.md, "Store builds".');
    return 1;
  }

  say(`the ${build} has a backend, signs in by email code and carries the ${Object.keys(switches).length} switches reviewed in eas.json.`);
  return 0;
};

process.exitCode = await check();
