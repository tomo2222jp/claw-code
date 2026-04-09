import type { RunRecord } from "../../../../shared/contracts/index.js";

export type TabId = "run" | "settings" | "logs";

export type RunStatusResponse = Pick<
  RunRecord,
  "id" | "status" | "startedAt" | "finishedAt" | "finalOutput" | "errorMessage"
>;
