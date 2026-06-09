import { COLORS, MOCK_EVENTS, MOCK_DATES, MOCK_GOALS, mergeCountdown } from "./mockData";
import { CalendarComponent } from "./Calendar";
import { CountdownStrip } from "./Countdown";
import { ThisWeekList } from "./ThisWeek";

const countdownItems = mergeCountdown(MOCK_DATES, MOCK_GOALS, MOCK_EVENTS);

export function PlanScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "#2D2A26", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 32, boxSizing: "border-box" }}>
      <div style={{ width: 390, background: COLORS.bg, borderRadius: 40, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.45)", position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", height: 844 }}>
          <StatusBar />
          <PlanHeader />
          <div style={{ flex: 1, overflowY: "auto", background: COLORS.bg }}>
            {/* Calendar — hero */}
            <div style={{ background: COLORS.white, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 12 }}>
              <CalendarComponent events={MOCK_EVENTS} />
            </div>
            {/* Countdown strip */}
            <div style={{ paddingTop: 6, paddingBottom: 16 }}>
              <CountdownStrip items={countdownItems} />
            </div>
            {/* This week */}
            <div style={{ background: COLORS.white, borderTop: `1px solid ${COLORS.border}`, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 100 }}>
              <div style={{ paddingTop: 14, paddingBottom: 8 }}>
                <ThisWeekList events={MOCK_EVENTS} />
              </div>
            </div>
          </div>
          <BottomNav />
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div style={{ background: COLORS.white, padding: "14px 24px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>9:41</span>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <svg width="16" height="10" viewBox="0 0 16 10" fill={COLORS.text}>
          <rect x="0" y="6" width="3" height="4" rx="0.5"/>
          <rect x="4.5" y="3.5" width="3" height="6.5" rx="0.5"/>
          <rect x="9" y="1.5" width="3" height="8.5" rx="0.5"/>
          <rect x="13.5" y="0" width="2.5" height="10" rx="0.5"/>
        </svg>
        <svg width="22" height="11" viewBox="0 0 22 11" fill="none">
          <rect x="0.5" y="0.5" width="18" height="10" rx="2" stroke={COLORS.text} strokeWidth="1"/>
          <rect x="2" y="2" width="14" height="7" rx="1" fill={COLORS.text}/>
          <path d="M19.5 3.5v4" stroke={COLORS.text} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}

function PlanHeader() {
  return (
    <div style={{
      background: COLORS.white,
      padding: "6px 20px 12px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: `1px solid ${COLORS.border}`,
    }}>
      <span style={{ fontSize: 21, fontWeight: 800, color: COLORS.text, letterSpacing: "0.08em" }}>VALO</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* Library/agenda icon */}
        <button style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8 }} title="Open Library">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.muted} strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <circle cx="3.5" cy="6" r="1" fill={COLORS.muted} stroke="none"/>
            <circle cx="3.5" cy="12" r="1" fill={COLORS.muted} stroke="none"/>
            <circle cx="3.5" cy="18" r="1" fill={COLORS.muted} stroke="none"/>
          </svg>
        </button>
        {/* Add to calendar */}
        <button
          style={{
            background: COLORS.terracotta, border: "none", cursor: "pointer",
            width: 30, height: 30, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          title="Add event"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.white} strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function BottomNav() {
  return (
    <div style={{
      background: COLORS.white,
      borderTop: `1px solid ${COLORS.border}`,
      display: "flex",
      alignItems: "center",
      paddingBottom: 22,
      paddingTop: 6,
      flexShrink: 0,
    }}>
      <NavItem icon={<HomeIcon color={COLORS.muted} />} label="Home" active={false} />
      <NavItem icon={<PlanIcon color={COLORS.terracotta} />} label="Plan" active={true} />
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <div style={{
          width: 52, height: 52, borderRadius: "50%",
          background: "#B06050", marginTop: -20,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 14px rgba(176,96,80,0.35)",
          cursor: "pointer",
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={COLORS.white} strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
      </div>
      <NavItem icon={<HealthIcon color={COLORS.muted} />} label="Health" active={false} />
      <NavItem icon={<ProfileIcon color={COLORS.muted} />} label="Profile" active={false} />
    </div>
  );
}

function NavItem({ icon, label, active }: { icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
      {icon}
      <span style={{ fontSize: 10, color: active ? COLORS.terracotta : COLORS.muted, fontWeight: active ? 600 : 400 }}>
        {label}
      </span>
    </div>
  );
}

function HomeIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}
function PlanIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}
function HealthIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}
function ProfileIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}
