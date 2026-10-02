import "dotenv/config";
import { OllamaProvider } from "./ai.js";
import { buildApp } from "./app.js";
import { JournalDatabase } from "./database.js";

const database = new JournalDatabase();
const app = buildApp({ database, ai: new OllamaProvider() });
const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
