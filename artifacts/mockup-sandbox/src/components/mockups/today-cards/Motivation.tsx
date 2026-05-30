export function Motivation() {
  const card = {
    label: "What drives you",
    body: "I want to show up for the people I love and be someone my future self is proud of.",
    accent: false,
    primaryAction: { label: "Talk to Valo", actionType: "open_voice" },
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F7F5F2" }}>
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 12,
          padding: 20,
          width: 340,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: "#E8E4DE",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B8780" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 500, color: "#8B8780", letterSpacing: "0.03em", textTransform: "uppercase" as const }}>
            {card.label}
          </span>
        </div>
        <p style={{ fontSize: 14, color: "#1A1814", lineHeight: 1.65, margin: 0, marginBottom: 16, fontStyle: "italic" }}>
          "{card.body}"
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
