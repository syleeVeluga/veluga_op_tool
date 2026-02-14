const fs = require("fs");
const path = require("path");
const dns = require("dns");
const { MongoClient, ReadPreference } = require("mongodb");

function parseDotEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function getDbNameFromUri(uri) {
  try {
    const url = new URL(uri);
    return (url.pathname || "").replace(/^\//, "") || "admin";
  } catch {
    return "admin";
  }
}

function pickEnvFile() {
  const candidates = [
    path.resolve(__dirname, "../../.env.veluga.mongo"),
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../.env.local"),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

async function profileTarget(label, uri, options) {
  const dbName = getDbNameFromUri(uri);
  const client = new MongoClient(uri, {
    readPreference: ReadPreference.secondaryPreferred,
    serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
  });

  const result = {
    label,
    dbName,
    collections: [],
    error: null,
  };

  try {
    await client.connect();
    const db = client.db(dbName);

    const collections = await db
      .listCollections({}, { nameOnly: true })
      .toArray();

    for (const collInfo of collections.slice(0, options.maxCollections)) {
      const collection = db.collection(collInfo.name);
      let estCount = null;
      try {
        estCount = await collection.estimatedDocumentCount({
          maxTimeMS: options.maxTimeMS,
        });
      } catch {
        estCount = null;
      }

      let sampleKeys = [];
      try {
        const sampleDocs = await collection
          .find({}, { projection: { _id: 0 }, limit: options.sampleDocsPerCollection })
          .maxTimeMS(options.maxTimeMS)
          .toArray();

        const keySet = new Set();
        for (const doc of sampleDocs) {
          if (doc && typeof doc === "object") {
            for (const key of Object.keys(doc)) {
              keySet.add(key);
            }
          }
        }
        sampleKeys = Array.from(keySet).slice(0, 40);
      } catch {
        sampleKeys = [];
      }

      result.collections.push({
        name: collInfo.name,
        estimatedDocumentCount: estCount,
        sampleKeys,
      });
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await client.close();
  }

  return result;
}

(async () => {
  const envPath = pickEnvFile();
  if (!envPath) {
    console.error("No env file found. Checked: ../../.env.veluga.mongo, ../.env, ../.env.local");
    process.exit(1);
  }

  const env = parseDotEnv(fs.readFileSync(envPath, "utf8"));
  const targets = [
    ["MONGO_CLUSTER", env.MONGO_CLUSTER],
    ["MONGO_LOGDB", env.MONGO_LOGDB],
    ["MONGODB_URI", env.MONGODB_URI],
  ].filter(([, uri]) => !!uri);

  if (targets.length === 0) {
    console.error("No Mongo URI found in env file.");
    process.exit(1);
  }

  const options = {
    maxCollections: Number(process.env.MONGO_PROFILE_MAX_COLLECTIONS || 50),
    sampleDocsPerCollection: Number(process.env.MONGO_PROFILE_SAMPLE_DOCS || 5),
    maxTimeMS: Number(process.env.MONGO_PROFILE_MAX_TIME_MS || 3000),
    serverSelectionTimeoutMS: Number(process.env.MONGO_PROFILE_SERVER_SELECT_TIMEOUT_MS || 12000),
  };

  const dnsServers = (process.env.MONGO_PROFILE_DNS_SERVERS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (dnsServers.length > 0) {
    dns.setServers(dnsServers);
  }

  const startedAt = new Date().toISOString();
  const report = {
    safety: {
      mode: "read-only",
      notes: [
        "No insert/update/delete commands",
        "No index creation/deletion",
        "No schema modification",
        "Read preference: secondaryPreferred",
      ],
    },
    sourceEnvFile: envPath,
    startedAt,
    options,
    dnsServers,
    targets: [],
  };

  for (const [label, uri] of targets) {
    const item = await profileTarget(label, uri, options);
    report.targets.push(item);
  }

  const outDir = path.resolve(__dirname, "../reports");
  fs.mkdirSync(outDir, { recursive: true });
  const timestamp = startedAt.replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `mongo-profile-${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log("Mongo read-only profiling finished.");
  console.log(`Report: ${outPath}`);
})();
