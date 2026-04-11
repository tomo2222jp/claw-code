const ANSI_ESCAPE_REGEX =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~])|(?:].*?(?:\u0007|\u001B\\)))/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_ESCAPE_REGEX, "");
}

export function normalizeTerminalText(input: string): string {
  return stripAnsi(input).replace(/\r\n/g, "\n").trim();
}

export function classifyStderrLine(line: string): "meta" | "error" {
  const normalized = normalizeTerminalText(line);

  if (
    normalized.startsWith("[active-model]") ||
    normalized.includes("claw process exited successfully")
  ) {
    return "meta";
  }

  return "error";
}
