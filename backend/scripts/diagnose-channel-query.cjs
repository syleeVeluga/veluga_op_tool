/**
 * Diagnostic script: check what prod.chats looks like for a specific creator
 * and verify the channel query logic.
 *
 * Usage: node backend/scripts/diagnose-channel-query.cjs [customerId]
 */
const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId, ReadPreference } = require("mongodb");

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
  const customerId = process.argv[2] || "65965c32ee6de0ec4c44d183";
  console.log(`\n=== Channel Query Diagnostic ===`);
  console.log(`Target customerId: ${customerId}`);

  const envFile = pickEnvFile();
  if (!envFile) {
    console.error("No env file found");
    process.exit(1);
  }
  console.log(`Using env file: ${envFile}`);
  const envVars = parseDotEnv(fs.readFileSync(envFile, "utf8"));
  const uri = envVars.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in env file");
    process.exit(1);
  }

  const client = new MongoClient(uri, {
    readPreference: ReadPreference.secondaryPreferred,
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await client.connect();
    console.log("Connected to MongoDB\n");

    const db = client.db("prod");

    // 1. Check a sample doc from chats to see field types
    console.log("--- Step 1: Sample document from prod.chats ---");
    const sampleDoc = await db.collection("chats").findOne({}, { projection: { _id: 1, creator: 1, channel: 1, createdAt: 1, creatorType: 1 } });
    if (sampleDoc) {
      console.log("Sample doc:", JSON.stringify(sampleDoc, null, 2));
      console.log(`  creator type: ${typeof sampleDoc.creator} (constructor: ${sampleDoc.creator?.constructor?.name})`);
      console.log(`  channel type: ${typeof sampleDoc.channel} (constructor: ${sampleDoc.channel?.constructor?.name})`);
    } else {
      console.log("  No documents found in prod.chats!");
    }

    // 2. Check the BSON type of creator field
    console.log("\n--- Step 2: BSON type distribution of 'creator' field (sample 100) ---");
    const typeAgg = await db.collection("chats").aggregate([
      { $limit: 1000 },
      { $group: { _id: { $type: "$creator" }, count: { $sum: 1 } } },
    ]).toArray();
    console.log("Creator field types:", JSON.stringify(typeAgg, null, 2));

    // 3. Check BSON type of channel field
    console.log("\n--- Step 3: BSON type distribution of 'channel' field (sample 100) ---");
    const channelTypeAgg = await db.collection("chats").aggregate([
      { $limit: 1000 },
      { $group: { _id: { $type: "$channel" }, count: { $sum: 1 } } },
    ]).toArray();
    console.log("Channel field types:", JSON.stringify(channelTypeAgg, null, 2));

    // 4. Try to find docs with the specific customerId
    console.log(`\n--- Step 4: Query with creator as string '${customerId}' ---`);
    const byString = await db.collection("chats").find(
      { creator: customerId },
      { projection: { _id: 1, creator: 1, channel: 1, createdAt: 1 }, limit: 3 }
    ).toArray();
    console.log(`  Found ${byString.length} docs (string match)`);
    if (byString.length > 0) console.log("  First:", JSON.stringify(byString[0]));

    // 5. Try with ObjectId
    if (ObjectId.isValid(customerId)) {
      console.log(`\n--- Step 5: Query with creator as ObjectId('${customerId}') ---`);
      const byOid = await db.collection("chats").find(
        { creator: new ObjectId(customerId) },
        { projection: { _id: 1, creator: 1, channel: 1, createdAt: 1 }, limit: 3 }
      ).toArray();
      console.log(`  Found ${byOid.length} docs (ObjectId match)`);
      if (byOid.length > 0) console.log("  First:", JSON.stringify(byOid[0]));
    }

    // 6. Try $in with both
    console.log(`\n--- Step 6: Query with $in [string, ObjectId] ---`);
    const inValues = [customerId];
    if (ObjectId.isValid(customerId)) inValues.push(new ObjectId(customerId));
    const byIn = await db.collection("chats").find(
      { creator: { $in: inValues } },
      { projection: { _id: 1, creator: 1, channel: 1, createdAt: 1 }, limit: 3 }
    ).toArray();
    console.log(`  Found ${byIn.length} docs ($in match)`);
    if (byIn.length > 0) console.log("  First:", JSON.stringify(byIn[0]));

    // 7. Try to find this customer in prod.users
    console.log(`\n--- Step 7: Look up customer in prod.users ---`);
    const userById = await db.collection("users").findOne(
      { $or: [
        { _id: ObjectId.isValid(customerId) ? new ObjectId(customerId) : customerId },
        { _id: customerId },
      ]},
      { projection: { _id: 1, name: 1, email: 1, members: 1 } }
    );
    if (userById) {
      console.log("  User found:", JSON.stringify({ _id: userById._id, name: userById.name, email: userById.email, membersCount: userById.members?.length }));
    } else {
      console.log("  User NOT found in prod.users");
    }

    // 8. Check if maybe we need to search by channel field instead
    console.log(`\n--- Step 8: Check if customerId matches a 'channel' value ---`);
    const byChannel = await db.collection("chats").find(
      { channel: { $in: [customerId, ...(ObjectId.isValid(customerId) ? [new ObjectId(customerId)] : [])] } },
      { projection: { _id: 1, creator: 1, channel: 1, createdAt: 1 }, limit: 3 }
    ).toArray();
    console.log(`  Found ${byChannel.length} docs (channel field match)`);
    if (byChannel.length > 0) console.log("  First:", JSON.stringify(byChannel[0]));

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.close();
    console.log("\nDone.");
  }
}

main();
