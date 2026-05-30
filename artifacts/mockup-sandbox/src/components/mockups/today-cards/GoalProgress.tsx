export function GoalProgress() {
  const card = {
    label: "Goal deadline",
    body: "Run a half marathon · 3 days left",
    accent: true,
    progress: 45,
    primaryAction: { label: "Update progress", actionType: "open_goals" },
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
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 500, color: "#C17B3F", letterSpacing: "0.03em", textTransform: "uppercase" as const }}>
            {card.label}
          </span>
        </div>
        <p style={{ fontSize: 14, color: "#1A1814", lineHeight: 1.55, margin: 0, marginBottom: 12 }}>
          {card.body}
        </p>
        <div style={{ background: "#E8E4DE", borderRadius: 4, height: 4, marginBottom: 16, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${card.progress}%`,
              background: "#C17B3F",
              borderRadius: 4,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: "#8B8780" }}>{card.progress}% complete</span>
          <span style={{ fontSize: 12, color: "#C17B3F", fontWeight: 500 }}>3 days left</span>
        </div>
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
