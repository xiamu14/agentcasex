import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  accountId: "02a2c288100920738d77d936cae9a23e",
  worker: {
    name: "agentcasex-api",
    compatibilityDate: "2026-11-01",
    entrypoint,
    triggers: [triggers.scheduled({ schedule: "*/30 * * * *" })],
    env: {
      CACHE: bindings.kv({ id: "8badd0e7a93547b5976f7bdbb7a168b2" }),
    },
  },
});
