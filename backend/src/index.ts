import {
  connectToMongo,
  registerMongoShutdownHooks,
} from "./config/database";
import { env } from "./config/env";
import { createApp } from "./app";

const app = createApp();

const port = env.PORT;

async function bootstrap(): Promise<void> {
  registerMongoShutdownHooks();
  await connectToMongo();

  app.listen(port, "0.0.0.0", () => {
    console.log(`API server listening on port ${port}`);
  });
}

void bootstrap().catch((error) => {
  console.error("Failed to start API server", error);
  process.exit(1);
});