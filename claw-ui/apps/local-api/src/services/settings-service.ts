import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AppSettings } from "../../../../shared/contracts/index.js";

const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: "openrouter",
  activeModel: "openai/gpt-oss-120b:free",
  retryCount: 2,
  openaiBaseUrl: "https://openrouter.ai/api/v1",
};

export class SettingsService {
  constructor(private readonly filePath: string) {}

  async getSettings(): Promise<AppSettings> {
    await this.ensureStorageDir();
    try {
      const raw = await readFile(this.filePath, "utf8");
      return {
        ...DEFAULT_SETTINGS,
        ...(JSON.parse(raw) as Partial<AppSettings>),
      };
    } catch (error) {
      if (isMissingFileError(error)) {
        await this.saveSettings(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      }
      throw error;
    }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    await this.ensureStorageDir();
    await writeFile(this.filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    return settings;
  }

  private async ensureStorageDir(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export function resolveSettingsFilePath(): string {
  return path.resolve(process.cwd(), "data", "settings.json");
}
