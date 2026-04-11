import fs from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

const STUDIO_STATE_FILE_NAME = "studio-state.json";

function getStudioStateFilePath(): string {
  return path.join(app.getPath("userData"), STUDIO_STATE_FILE_NAME);
}

export async function loadStudioStateFile(): Promise<unknown> {
  const filePath = getStudioStateFilePath();

  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as unknown;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

export async function saveStudioStateFile(payload: unknown): Promise<void> {
  const filePath = getStudioStateFilePath();
  const directoryPath = path.dirname(filePath);

  await fs.mkdir(directoryPath, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT",
  );
}
