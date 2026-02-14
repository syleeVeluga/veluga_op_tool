import { Db, MongoClient, ReadPreference } from "mongodb";
import { env } from "./env";

let mongoClient: MongoClient | null = null;
let connectPromise: Promise<MongoClient> | null = null;
let shutdownHooksRegistered = false;

const mongoOptions = {
  appName: "veluga-ops-tool-backend",
  maxPoolSize: 20,
  minPoolSize: 0,
  retryReads: true,
  readPreference: ReadPreference.SECONDARY_PREFERRED,
  serverSelectionTimeoutMS: 5000,
};

function assertMongoUri(): string {
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required to connect to MongoDB");
  }

  return env.MONGODB_URI;
}

export async function connectToMongo(): Promise<MongoClient> {
  if (mongoClient) {
    return mongoClient;
  }

  if (connectPromise) {
    return connectPromise;
  }

  const uri = assertMongoUri();
  const nextClient = new MongoClient(uri, mongoOptions);

  connectPromise = nextClient
    .connect()
    .then((connectedClient) => {
      mongoClient = connectedClient;
      connectPromise = null;

      return connectedClient;
    })
    .catch(async (error: unknown) => {
      connectPromise = null;

      try {
        await nextClient.close();
      } catch {
      }

      throw error;
    });

  return connectPromise;
}

export async function getMongoClient(): Promise<MongoClient> {
  return connectToMongo();
}

export async function getDb(dbName: string = env.MONGODB_DB_NAME): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName);
}

export async function getOpsToolDb(): Promise<Db> {
  return getDb(env.OPS_TOOL_DB_NAME);
}

export async function checkMongoConnection(): Promise<{
  ok: boolean;
  latencyMs: number;
  dbName: string;
  readPreference: string;
}> {
  const startedAt = Date.now();
  const db = await getDb(env.MONGODB_DB_NAME);
  await db.command({ ping: 1 });

  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    dbName: env.MONGODB_DB_NAME,
    readPreference: "secondaryPreferred",
  };
}

export async function closeMongoConnection(): Promise<void> {
  if (connectPromise) {
    await connectPromise.catch(() => undefined);
  }

  if (!mongoClient) {
    return;
  }

  const clientToClose = mongoClient;
  mongoClient = null;
  await clientToClose.close();
}

export function getMongoConnectionStatus(): {
  connected: boolean;
  uriConfigured: boolean;
  dataDbName: string;
  opsToolDbName: string;
} {
  return {
    connected: mongoClient !== null,
    uriConfigured: Boolean(env.MONGODB_URI),
    dataDbName: env.MONGODB_DB_NAME,
    opsToolDbName: env.OPS_TOOL_DB_NAME,
  };
}

export function registerMongoShutdownHooks(): void {
  if (shutdownHooksRegistered) {
    return;
  }

  shutdownHooksRegistered = true;

  const shutdown = async (signal: string): Promise<void> => {
    try {
      await closeMongoConnection();
      console.log(`[mongo] connection closed on ${signal}`);
    } catch (error) {
      console.error(`[mongo] failed to close connection on ${signal}`, error);
    } finally {
      process.exit(0);
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}