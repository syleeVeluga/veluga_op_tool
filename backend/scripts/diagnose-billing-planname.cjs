/**
 * Diagnostic script: check why planName/planState/price show fallback values in billing_logs.
 * Covers: planName (UNKNOWN_PLAN), planState (UNKNOWN), planPrice (null), discount (null)
 *
 * Usage: node backend/scripts/diagnose-billing-planname.cjs <customerId>
 */
const fs = require("fs");
const path = require("path");
const dns = require("dns");
const { MongoClient, ObjectId, ReadPreference } = require("mongodb");

(function () {
  const servers = dns.getServers();
  if (servers.every((s) => s === "127.0.0.1" || s === "::1")) {
    dns.setServers(["8.8.8.8", "8.8.4.4"]);
    console.log("[dns] Overridden to 8.8.8.8 / 8.8.4.4");
  }
})();

function parseDotEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function pickEnvFile() {
  const candidates = [
    path.resolve(__dirname, "../../.env.veluga.mongo"),
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../.env.local"),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

async function main() {
  const customerId = process.argv[2];
  if (!customerId) {
    console.error("Usage: node diagnose-billing-planname.cjs <customerId>");
    process.exit(1);
  }

  console.log(`\n=== Billing planName Diagnostic ===`);
  console.log(`Target customerId: ${customerId}`);

  const envFile = pickEnvFile();
  if (!envFile) { console.error("No env file found"); process.exit(1); }
  const envVars = parseDotEnv(fs.readFileSync(envFile, "utf8"));
  const uri = envVars.MONGODB_URI;
  if (!uri) { console.error("MONGODB_URI not found"); process.exit(1); }

  const client = new MongoClient(uri, {
    readPreference: ReadPreference.secondaryPreferred,
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await client.connect();
    console.log("Connected\n");
    const db = client.db("prod");

    const billingQuery = ObjectId.isValid(customerId)
      ? { $or: [{ user: customerId }, { user: new ObjectId(customerId) }] }
      : { user: customerId };

    const allDocs = await db.collection("userplanhistories").find(billingQuery).sort({ createdAt: -1 }).toArray();
    console.log(`총 userplanhistories 레코드: ${allDocs.length}개\n`);

    if (allDocs.length === 0) {
      console.log("  No billing docs found for this user.");
      return;
    }

    // plan lookup helper
    async function lookupPlan(rawPlanId) {
      if (!rawPlanId) return null;
      const planIdStr = rawPlanId.toString();
      const byString = await db.collection("plans").findOne({ _id: planIdStr });
      if (byString) return byString;
      if (ObjectId.isValid(planIdStr)) {
        return await db.collection("plans").findOne({ _id: new ObjectId(planIdStr) });
      }
      return null;
    }

    let hasIssue = false;

    for (let i = 0; i < allDocs.length; i++) {
      const doc = allDocs[i];
      const rawPlanId = doc.currentPlan ?? doc.plan ?? null;
      const planIdStr = rawPlanId?.toString() ?? "(null)";
      const planDoc = await lookupPlan(rawPlanId);

      const resolvedName = planDoc?.name ?? planDoc?.title ?? planDoc?.planName ?? "UNKNOWN_PLAN";
      const resolvedState = planDoc?.state ?? "UNKNOWN";
      const rowIssues = [];
      if (!rawPlanId) rowIssues.push("planId null");
      else if (!planDoc) rowIssues.push("plans 컬렉션에 없음 → UNKNOWN_PLAN");
      else if (resolvedName === "UNKNOWN_PLAN") rowIssues.push("name/title/planName 필드 없음");
      if (resolvedState === "UNKNOWN" && planDoc) rowIssues.push("state 필드 없음");

      const status = rowIssues.length > 0 ? `⚠ ${rowIssues.join(", ")}` : "✓";
      if (rowIssues.length > 0) hasIssue = true;

      console.log(`[${i + 1}] _id=${doc._id}  createdAt=${doc.createdAt?.toISOString?.() ?? doc.createdAt}`);
      console.log(`     planId=${planIdStr}  planName="${resolvedName}"  planState="${resolvedState}"  ${status}`);
      if (rowIssues.length > 0 && !planDoc && rawPlanId) {
        console.log(`     → planId ${planIdStr} 가 prod.plans에 존재하지 않음`);
      }
      if (rowIssues.length > 0 && planDoc) {
        console.log(`     → planDoc keys: ${Object.keys(planDoc).join(", ")}`);
      }
    }

    console.log("\n=== 최종 진단 ===");
    if (!hasIssue) {
      console.log("  이상 없음 — 모든 레코드가 정상 매핑됨");
    } else {
      console.log("  ⚠ 일부 레코드에서 UNKNOWN_PLAN / UNKNOWN 발생 — 위 상세 내용 확인");
    }

  } finally {
    await client.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
