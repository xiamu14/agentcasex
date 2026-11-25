import { runFullSync } from "./api-handler.mjs";

const status = await runFullSync("cli");
console.log(JSON.stringify(status, null, 2));
if (status.lastError) {
  process.exitCode = 1;
}
