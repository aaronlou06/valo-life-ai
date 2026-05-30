import * as Crypto from "expo-crypto";

let _userId: string | null = null;
let _sessionId: string = "";
let _getToken: (() => Promise<string | null>) | null = null;

function generateSessionId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

export function initTelemetrySession(
  userId: string | null,
  getToken: () => Promise<string | null>,
): string {
  _userId = userId;
  _sessionId = generateSessionId();
  _getToken = getToken;
  return _sessionId;
}

export function getSessionId(): string {
  return _sessionId;
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  const sessionId = _sessionId;
  const userId = _userId;

  const fullProps = { ...props, timestamp: new Date().toISOString() };

  if (__DEV__) {
    console.log(`[Telemetry] ${name}`, fullProps);
  }

  void (async () => {
    try {
      const token = _getToken ? await _getToken() : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const base = domain ? `https://${domain}` : "";
      await fetch(`${base}/api/telemetry`, {
        method: "POST",
        headers,
        body: JSON.stringify({ event: name, userId, sessionId, props: fullProps }),
      });
    } catch {
      // telemetry must never throw or affect the user
    }
  })();
}
