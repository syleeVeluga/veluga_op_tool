import { Db, MongoClient, ReadPreference } from "mongodb";
import { env, type BatchDbConfig } from "./env";

let mongoClient: MongoClient | null = null;
let connectPromise: Promise<MongoClient> | null = null;
let shutdownHooksRegistered = false;

// Extra clients for batch DBs that have their own URI (different Atlas cluster)
const extraClients = new Map<string, MongoClient>();
const extraConnectPromises = new Map<string, Promise<MongoClient>>();

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

async function getClientForUri(uri: string): Promise<MongoClient> {
  const cached = extraClients.get(uri);
  if (cached) {
    return cached;
  }

  const pending = extraConnectPromises.get(uri);
  if (pending) {
    return pending;
  }

  const nextClient = new MongoClient(uri, mongoOptions);
  const promise = nextClient
    .connect()
    .then((connectedClient) => {
      extraClients.set(uri, connectedClient);
      extraConnectPromises.delete(uri);
      return connectedClient;
    })
    .catch(async (error: unknown) => {
      extraConnectPromises.delete(uri);
      try {
        await nextClient.close();
      } catch {
      }
      throw error;
    });

  extraConnectPromises.set(uri, promise);
  return promise;
}

export async function getDbForBatchConfig(batchConfig: BatchDbConfig): Promise<Db> {
  if (batchConfig.uri) {
    const client = await getClientForUri(batchConfig.uri);
    return client.db(batchConfig.dbName);
  }

  return getDb(batchConfig.dbName);
}

export async function getDbByUri(uri: string, dbName: string): Promise<Db> {
  const client = await getClientForUri(uri);
  return client.db(dbName);
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

  if (mongoClient) {
    const clientToClose = mongoClient;
    mongoClient = null;
    await clientToClose.close();
  }

  // Close extra clients for batch DBs on different clusters
  await Promise.all([
    ...Array.from(extraConnectPromises.values()).map((p) => p.catch(() => undefined)),
    ...Array.from(extraClients.values()).map((c) => c.close().catch(() => undefined)),
  ]);
  extraConnectPromises.clear();
  extraClients.clear();
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