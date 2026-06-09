import { COLORS, MOCK_DATES, MOCK_GOALS, MOCK_EVENTS, mergeCountdown, formatCountdown } from "./mockData";
import type { CountdownItem } from "./mockData";

const TYPE_COLOR: Record<CountdownItem["type"], string> = {
  birthday: COLORS.date,
  anniversary: COLORS.date,
  deadline: COLORS.terracotta,
  event: COLORS.event,
};

const TYPE_LABEL: Record<CountdownItem["type"], string> = {
  birthday: "birthday",
  anniversary: "anniversary",
  deadline: "deadline",
  event: "event",
};

interface CountdownStripProps {
  items?: CountdownItem[];
}

export function CountdownStrip({ items }: CountdownStripProps) {
  const data = items ?? mergeCountdown(MOCK_DATES, MOCK_GOALS, MOCK_EVENTS);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 16, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, letterSpacing: "0.01em" }}>Coming up</span>
        <button style={{ background: "none", border: "none", fontSize: 12, color: COLORS.terracotta, fontWeight: 500, cursor: "pointer", padding: 0 }}>
          See all
        </button>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingLeft: 16, paddingRight: 16, paddingBottom: 4, scrollbarWidth: "none" }}>
        {data.map((item) => {
          const { value, unit } = formatCountdown(item.date);
          const accent = TYPE_COLOR[item.type];
          return (
            <div
              key={item.id}
              style={{
                flex: "0 0 auto",
                width: 110,
                background: COLORS.white,
                borderRadius: 12,
                padding: "12px 12px 10px 12px",
                borderLeftWidth: 3,
                borderLeftStyle: "solid",
                borderLeftColor: accent,
                borderTopWidth: 1,
                borderTopStyle: "solid",
                borderTopColor: COLORS.border,
                borderRightWidth: 1,
                borderRightStyle: "solid",
                borderRightColor: COLORS.border,
                borderBottomWidth: 1,
                borderBottomStyle: "solid",
                borderBottomColor: COLORS.border,
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginBottom: 4 }}>
                {unit === "today" ? (
                  <span style={{ fontSize: 15, fontWeight: 700, color: accent }}>Today</span>
                ) : (
                  <>
                    <span style={{ fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: accent }}>{unit}</span>
                  </>
                )}
              </div>
              <p style={{ fontSize: 11, color: COLORS.text, margin: 0, marginBottom: 6, lineHeight: 1.35, fontWeight: 500, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {item.label}
              </p>
              <span style={{ fontSize: 10, color: accent, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {TYPE_LABEL[item.type]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Countdown() {
  const items = mergeCountdown(MOCK_DATES, MOCK_GOALS, MOCK_EVENTS);
  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: 24 }}>
      <CountdownStrip items={items} />
    </div>
  );
}
