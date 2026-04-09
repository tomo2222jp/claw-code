import type { SettingsService } from "../services/settings-service.js";
import type { RunService } from "../services/run-service.js";

export type AppContext = {
  settingsService: SettingsService;
  runService: RunService;
};
