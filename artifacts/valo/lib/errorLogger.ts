const BUFFER_SIZE = 30;

interface LogEntry {
  level: "error" | "warn";
  message: string;
  timestamp: string;
}

const buffer: LogEntry[] = [];
let installed = false;

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      if (typeof a === "object" && a !== null) {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");
}

function push(level: LogEntry["level"], args: unknown[]): void {
  const entry: LogEntry = {
    level,
    message: formatArgs(args),
    timestamp: new Date().toISOString(),
  };
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) {
    buffer.shift();
  }
}

export function installErrorLogger(): void {
  if (installed) return;
  installed = true;

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    push("error", args);
    originalError(...args);
  };

  console.warn = (...args: unknown[]) => {
    push("warn", args);
    originalWarn(...args);
  };
}

export function getRecentErrorLogs(): string {
  if (buffer.length === 0) return "None";
  return buffer
    .map((e) => `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.message}`)
    .join("\n");
}
