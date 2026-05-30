const isDev = process.env.NODE_ENV === "development" || __DEV__;

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (isDev) {
    console.log(`[Telemetry] ${name}`, props ?? {});
  }
}
