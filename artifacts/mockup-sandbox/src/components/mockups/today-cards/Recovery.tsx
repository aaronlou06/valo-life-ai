export function Recovery() {
  const card = {
    icon: "battery-charging",
    label: "Strong recovery",
    body: "HRV 72 · 7h 30m sleep — body is ready.",
    accent: true,
    progress: undefined as number | undefined,
    primaryAction: { label: "Talk to Valo about recovery", actionType: "start_checkin" },
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F7F5F2" }}>
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 12,
          padding: 20,
          width: 340,
          borderWidth: 1.5,
          borderStyle: "solid",
          borderColor: "#C17B3F",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C17B3F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="6" width="16" height="12" rx="2" />
            <path d="M23 13v-2" />
            <path d="M7 10l3 4 3-4" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 500, color: "#C17B3F", letterSpacing: "0.03em", textTransform: "uppercase" as const }}>
            {card.label}
          </span>
        </div>
        <p style={{ fontSize: 14, color: "#1A1814", lineHeight: 1.55, margin: 0, marginBottom: 16 }}>
          {card.body}
        </p>
        <button
          style={{
            width: "100%",
            background: "#C17B3F",
            color: "#FFFFFF",
            border: "none",
            borderRadius: 8,
            padding: "11px 0",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {card.primaryAction.label}
        </button>
      </div>
    </div>
  );
}
