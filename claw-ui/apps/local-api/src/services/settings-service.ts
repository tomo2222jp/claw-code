import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AppSettings } from "../../../../shared/contracts/index.js";

const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: "openrouter",
  activeModel: "openai/gpt-oss-120b:free",
  retryCount: 2,
  openaiBaseUrl: "https://openrouter.ai/api/v1",
  apiKey: "",
  enableTools: false,
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

  async saveSettings(incoming: AppSettings): Promise<AppSettings> {
    await this.ensureStorageDir();
    // Preserve apiKey: claw-studio doesn't know about this field, so it may
    // send an empty string when the user only changes the model. Keep the
    // stored key in that case.
    const existing = await this.getSettings().catch(() => DEFAULT_SETTINGS);
    const merged: AppSettings = {
      ...incoming,
      apiKey: incoming.apiKey || existing.apiKey,
    };
    await writeFile(this.filePath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
    return merged;
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
