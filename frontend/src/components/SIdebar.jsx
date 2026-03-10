import React, { useState } from "react";

function Sidebar({
  chats,
  activeChatId,
  setActiveChatId,
  createNewChat,
  collapsed,
  setCollapsed,
  dbInfo,
  deleteChat,
  clearHistory,
  authUser,
  onLogout,
  activeChat,
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const downloadChat = () => {
    const msgs = activeChat?.messages || [];
    if (msgs.length === 0) return;
    const text = msgs.map(m =>
      `[${m.sender === "user" ? "You" : "AI"}]\n${m.text || ""}\n`
    ).join("\n---\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `chat-${activeChat?.title || "export"}-${Date.now()}.txt`;
    link.click();
  };

  if (collapsed) {
    return (
      <aside className="sidebar collapsed" style={{
        width: "48px", minWidth: "48px", padding: "16px 8px",
        display: "flex", flexDirection: "column", alignItems: "center",
        transition: "width 0.25s ease",
      }}>
        <button onClick={() => setCollapsed(false)} title="Open sidebar" className="collapse-btn">▶</button>
      </aside>
    );
  }

  return (
    <aside className="sidebar" style={{
      transition: "width 0.25s ease",
      display: "flex", flexDirection: "column", height: "100%"
    }}>

      {/* Logo + collapse */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div className="logo" style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
          <div className="logo-icon">⚡</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="logo-name">GenAI</span>
            <span className="logo-sub">SQL</span>
          </div>
        </div>
        <button onClick={() => setCollapsed(true)} title="Close sidebar" className="collapse-btn">◀</button>
      </div>



      {/* New Chat */}
      <button className="new-chat-btn" onClick={createNewChat}>+ New Chat</button>

      {/* Recent Chats label */}
      <div style={{
        fontSize: "10px", fontWeight: 700, letterSpacing: "1px",
        textTransform: "uppercase", color: "var(--muted, #94a3b8)",
        marginBottom: "8px", paddingLeft: "4px"
      }}>Recent Chats</div>

      {/* Chat List */}
      <div className="chat-list" style={{ flex: 1, overflowY: "auto" }}>
        {chats.map(chat => (
          <div
            key={chat.id}
            onMouseEnter={() => setHoveredId(chat.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => setActiveChatId(chat.id)}
            className={chat.id === activeChatId ? "chat-item active" : "chat-item"}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <span style={{
              overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", flex: 1, fontSize: "13px"
            }}>
              {chat.title}
            </span>
            {hoveredId === chat.id ? (
              <button
                onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                style={{
                  background: "none", border: "none", color: "#ef4444",
                  cursor: "pointer", fontSize: "14px", padding: "0 4px", flexShrink: 0,
                }}
                title="Delete chat"
              >🗑️</button>
            ) : chat.messages?.length > 0 ? (
              <span className="chat-count">{chat.messages.length}</span>
            ) : null}
          </div>
        ))}
      </div>

      {/* Clear History */}
      {chats.length > 0 && (
        <div style={{ paddingTop: "12px" }}>
          {!showClearConfirm ? (
            <button onClick={() => setShowClearConfirm(true)} className="clear-history-btn">
              🗑️ Clear All History
            </button>
          ) : (
            <div style={{ fontSize: "12px", textAlign: "center" }}>
              <div style={{ marginBottom: "8px", color: "#ef4444" }}>Are you sure?</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => { clearHistory(); setShowClearConfirm(false); }} style={{
                  flex: 1, padding: "6px", borderRadius: "6px",
                  background: "#ef4444", color: "white", border: "none", cursor: "pointer", fontSize: "12px"
                }}>Yes</button>
                <button onClick={() => setShowClearConfirm(false)} className="confirm-no-btn">No</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bottom: Profile + Download + Logout ── */}
      {authUser && (
        <div className="sidebar-profile">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
            <div className="profile-avatar">
              {authUser.username?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: "13px", fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                color: "var(--text, #1a1b2e)"
              }}>
                {authUser.username}
              </div>
              <div style={{ fontSize: "11px", color: "var(--muted, #94a3b8)" }}>Free plan</div>
            </div>
          </div>

          <button
            onClick={downloadChat}
            title="Download this chat"
            disabled={!activeChat?.messages?.length}
            className="icon-btn"
            style={{ opacity: activeChat?.messages?.length ? 1 : 0.4 }}
          >
            ⬇️
            {activeChat?.messages?.length > 0 && (
              <span style={{
                position: "absolute", top: "3px", right: "3px",
                width: "6px", height: "6px", borderRadius: "50%",
                background: "var(--accent, #4f46e5)",
              }} />
            )}
          </button>

          <button onClick={onLogout} title="Logout" className="icon-btn logout-btn">⏻</button>
        </div>
      )}

    </aside>
  );
}

export default Sidebar;