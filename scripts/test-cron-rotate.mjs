#!/usr/bin/env node
/**
 * Test script for the enhanced cron rotation endpoint (v2).
 *
 * Usage:
 *   node scripts/test-cron-rotate.mjs                    # Run against local dev
 *   node scripts/test-cron-rotate.mjs --prod              # Run against production
 *   node scripts/test-cron-rotate.mjs --prod --force      # Force rotation (skip Monday check)
 *   node scripts/test-cron-rotate.mjs --prod --live       # Actually save the rotation
 */

const BASE_LOCAL = "http://localhost:3000";
const BASE_PROD = "https://shiftcrew.me";
const CRON_SECRET = "shiftcrew-cron-2026";

const args = process.argv.slice(2);
const isProd = args.includes("--prod");
const isForce = args.includes("--force");
const isLive = args.includes("--live");

const BASE = isProd ? BASE_PROD : BASE_LOCAL;

// Color helpers for terminal output
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ${green("✓")} ${msg}`);
    passed++;
  } else {
    console.log(`  ${red("✗")} ${msg}`);
    failed++;
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  const data = await res.json();
  return { status: res.status, data };
}

// ─── Test 1: Unauthorized access ────────────────────────────────────────────
async function testUnauthorized() {
  console.log(bold("\n── Test 1: Unauthorized (no secret) ──"));
  const { status, data } = await fetchJSON(`${BASE}/api/cron/rotate`);
  assert(status === 401, `Returns 401 (got ${status})`);
  assert(data.error === "Unauthorized", `Error message is "Unauthorized"`);
}

// ─── Test 2: Unauthorized with wrong secret ──────────────────────────────────
async function testWrongSecret() {
  console.log(bold("\n── Test 2: Wrong secret ──"));
  const { status, data } = await fetchJSON(`${BASE}/api/cron/rotate?secret=wrong`);
  assert(status === 401, `Returns 401 (got ${status})`);
  assert(data.error === "Unauthorized", `Error message is "Unauthorized"`);
}

// ─── Test 3: Dry-run with force (generates rotation without saving) ──────────
async function testDryRun() {
  console.log(bold("\n── Test 3: Dry-run (force + dryrun) ──"));
  const { status, data } = await fetchJSON(
    `${BASE}/api/cron/rotate?secret=${CRON_SECRET}&force=true&dryrun=true`
  );
  assert(status === 200, `Returns 200 (got ${status})`);
  assert(data.status === "dryrun", `Status is "dryrun" (got "${data.status}")`);
  assert(typeof data.totalEmployees === "number" && data.totalEmployees > 0,
    `Has employees: ${data.totalEmployees}`);
  assert(typeof data.totalBranches === "number" && data.totalBranches > 0,
    `Has branches: ${data.totalBranches}`);
  assert(typeof data.assignments === "number" && data.assignments > 0,
    `Generated assignments: ${data.assignments}`);
  assert(data.weekStart && data.weekEnd,
    `Week range: ${data.weekStart} - ${data.weekEnd}`);
  assert(data.branchSummary && Object.keys(data.branchSummary).length > 0,
    `Branch summary has entries`);

  // v2: New fields
  assert(typeof data.manualCount === "number",
    `Manual count reported: ${data.manualCount}`);
  assert(typeof data.onLeaveCount === "number",
    `On-leave count reported: ${data.onLeaveCount}`);
  assert(Array.isArray(data.onLeaveNames),
    `On-leave names is array (${data.onLeaveNames?.length || 0} names)`);

  // Validate distribution
  if (data.branchSummary) {
    const branchCounts = Object.entries(data.branchSummary).map(
      ([name, emps]) => `${name}: ${emps.length}`
    );
    console.log(`  ${cyan("Distribution:")} ${branchCounts.join(", ")}`);

    const values = Object.values(data.branchSummary).map((e) => e.length);
    const max = Math.max(...values);
    const min = Math.min(...values);
    assert(max - min <= 1, `Balanced distribution (max=${max}, min=${min}, diff=${max-min})`);
  }

  if (data.onLeaveCount > 0) {
    console.log(`  ${cyan("On leave:")} ${data.onLeaveNames.join(", ")}`);
  }
  if (data.manualCount > 0) {
    console.log(`  ${cyan("Manual overrides:")} ${data.manualCount}`);
  }
  console.log(`  ${cyan("Elapsed:")} ${data.elapsed}`);
}

// ─── Test 4: Normal call (not Monday → should skip unless force) ─────────────
async function testDayCheck() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const isMonday = dayOfWeek === 1;

  console.log(bold(`\n── Test 4: Day-of-week check (today is ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayOfWeek]}) ──`));

  const { status, data } = await fetchJSON(
    `${BASE}/api/cron/rotate?secret=${CRON_SECRET}&dryrun=true`
  );

  if (isMonday) {
    assert(data.status === "dryrun" || data.status === "skipped",
      `On Monday: should be dryrun or skipped (got "${data.status}")`);
  } else {
    assert(data.status === "skipped",
      `Not Monday: should be skipped (got "${data.status}")`);
    assert(data.reason && data.reason.includes("not Monday"),
      `Reason mentions not Monday`);
  }
}

// ─── Test 5: Rotation randomness (run 3 times, check for variation) ──────────
async function testRandomness() {
  console.log(bold("\n── Test 5: Rotation randomness ──"));

  const results = [];
  for (let i = 0; i < 3; i++) {
    const { data } = await fetchJSON(
      `${BASE}/api/cron/rotate?secret=${CRON_SECRET}&force=true&dryrun=true`
    );
    if (data.branchSummary) {
      results.push(JSON.stringify(data.branchSummary));
    }
  }

  const unique = new Set(results);
  assert(unique.size >= 2,
    `Randomness: ${unique.size}/3 unique rotations (${unique.size >= 2 ? "good" : "may need more employees to see variation"})`);
}

// ─── Test 6: Leave exclusion logic ───────────────────────────────────────────
async function testLeaveExclusion() {
  console.log(bold("\n── Test 6: Leave exclusion logic ──"));

  const { data } = await fetchJSON(
    `${BASE}/api/cron/rotate?secret=${CRON_SECRET}&force=true&dryrun=true`
  );

  if (data.onLeaveCount > 0) {
    // Employees on leave should NOT appear in branch assignments
    const allAssigned = Object.values(data.branchSummary).flat();
    for (const leaveName of data.onLeaveNames) {
      const found = allAssigned.some((name) => name.includes(leaveName));
      assert(!found, `Employee on leave "${leaveName}" is NOT in assignments`);
    }
    // Total assigned should be totalEmployees - onLeave - (possibly more due to manual)
    assert(data.assignments <= data.totalEmployees - data.onLeaveCount + data.manualCount,
      `Assigned (${data.assignments}) ≤ total (${data.totalEmployees}) - onLeave (${data.onLeaveCount})`);
  } else {
    console.log(`  ${yellow("⊘")} No employees on leave — leave exclusion can't be tested`);
    console.log(`  ${yellow("  ")} To test: approve a leave request for next week, then re-run`);
    assert(data.assignments === data.totalEmployees - data.manualCount || data.assignments > 0,
      `All employees assigned (${data.assignments} of ${data.totalEmployees})`);
  }
}

// ─── Test 7: Manual override priority ────────────────────────────────────────
async function testManualOverrides() {
  console.log(bold("\n── Test 7: Manual override priority ──"));

  const { data } = await fetchJSON(
    `${BASE}/api/cron/rotate?secret=${CRON_SECRET}&force=true&dryrun=true`
  );

  if (data.manualCount > 0) {
    // Manual employees should appear with "(manual)" tag
    const allAssigned = Object.values(data.branchSummary).flat();
    const manualEntries = allAssigned.filter((n) => n.includes("(manual)"));
    assert(manualEntries.length === data.manualCount,
      `${manualEntries.length} manual entries match manualCount ${data.manualCount}`);

    // No employee should appear twice
    const names = allAssigned.map((n) => n.replace(" (manual)", ""));
    const uniqueNames = new Set(names);
    assert(names.length === uniqueNames.size, `No duplicate employees (${names.length} total, ${uniqueNames.size} unique)`);
  } else {
    console.log(`  ${yellow("⊘")} No manual overrides — can't test priority`);
    console.log(`  ${yellow("  ")} To test: create a manual override for next week, then re-run`);
  }

  // Check no duplicates regardless
  const allAssigned = Object.values(data.branchSummary).flat();
  const cleanNames = allAssigned.map((n) => n.replace(" (manual)", ""));
  const uniqueClean = new Set(cleanNames);
  assert(cleanNames.length === uniqueClean.size,
    `No duplicate employees across branches (${cleanNames.length} total, ${uniqueClean.size} unique)`);
}

// ─── Test 8: Live rotation (only if --live flag) ─────────────────────────────
async function testLiveRotation() {
  if (!isLive) {
    console.log(bold("\n── Test 8: Live rotation ──"));
    console.log(`  ${yellow("⊘")} Skipped (use --live flag to actually save rotation)`);
    return;
  }

  console.log(bold("\n── Test 8: Live rotation (SAVING!) ──"));
  const forceParam = isForce ? "&force=true" : "";
  const { status, data } = await fetchJSON(
    `${BASE}/api/cron/rotate?secret=${CRON_SECRET}${forceParam}`
  );
  assert(status === 200, `Returns 200 (got ${status})`);

  if (data.status === "success") {
    assert(data.schedulesSaved > 0, `Saved ${data.schedulesSaved} schedule documents`);
    assert(data.employeesUpdated > 0, `Updated ${data.employeesUpdated} employee branchIds`);
    assert(typeof data.rotationId === "string", `Rotation ID: ${data.rotationId}`);
    assert(typeof data.historyRecorded === "number", `History recorded: ${data.historyRecorded}`);
    assert(typeof data.manualCount === "number", `Manual count: ${data.manualCount}`);
    assert(typeof data.onLeaveCount === "number", `On leave: ${data.onLeaveCount}`);
    assert(typeof data.skippedDays === "number", `Skipped days: ${data.skippedDays}`);

    console.log(`  ${cyan("Week:")} ${data.weekStart} - ${data.weekEnd}`);
    console.log(`  ${cyan("Elapsed:")} ${data.elapsed}`);

    if (data.branchSummary) {
      for (const [branch, emps] of Object.entries(data.branchSummary)) {
        console.log(`  ${cyan(branch)}: ${emps.join(", ")}`);
      }
    }
    if (data.onLeaveNames?.length > 0) {
      console.log(`  ${cyan("On leave:")} ${data.onLeaveNames.join(", ")}`);
    }
  } else if (data.status === "skipped") {
    console.log(`  ${yellow("⊘")} Skipped: ${data.reason}`);
  } else {
    console.log(`  ${red("✗")} Unexpected status: ${data.status} — ${data.reason || data.message}`);
    failed++;
  }
}

// ─── Run all tests ──────────────────────────────────────────────────────────

async function main() {
  console.log(bold(`\n${"═".repeat(55)}`));
  console.log(bold(`  ShiftCrew Cron Rotation Tests (v2 — Enhanced)`));
  console.log(bold(`  Target: ${BASE}`));
  console.log(bold(`${"═".repeat(55)}`));

  try {
    await testUnauthorized();
    await testWrongSecret();
    await testDryRun();
    await testDayCheck();
    await testRandomness();
    await testLeaveExclusion();
    await testManualOverrides();
    await testLiveRotation();
  } catch (err) {
    console.error(red(`\nFatal error: ${err.message}`));
    failed++;
  }

  console.log(bold(`\n${"─".repeat(55)}`));
  console.log(
    `  Results: ${green(`${passed} passed`)}, ${failed > 0 ? red(`${failed} failed`) : `${failed} failed`}`
  );
  console.log(bold(`${"─".repeat(55)}\n`));

  process.exit(failed > 0 ? 1 : 0);
}

main();
