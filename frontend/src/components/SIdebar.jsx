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
        <button onClick={() => setCollapsed(false)} title="Open sidebar" style={{
          background: "none", border: "1px solid #e5e7eb", borderRadius: "6px",
          cursor: "pointer", fontSize: "14px", padding: "4px 7px", color: "#6b7280",
        }}>▶</button>
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
        <div className="logo" style={{ margin: 0 }}>⚡ GenAI</div>
        <button onClick={() => setCollapsed(true)} title="Close sidebar" style={{
          background: "none", border: "1px solid #e5e7eb", borderRadius: "6px",
          cursor: "pointer", fontSize: "14px", padding: "4px 7px", color: "#6b7280",
        }}>◀</button>
      </div>

      {/* DB Info */}
      {dbInfo && (
        <div className="db-info">
          <p>📊 Tables: {dbInfo.total_tables}</p>
        </div>
      )}

      {/* New Chat */}
      <button className="new-chat-btn" onClick={createNewChat}>+ New Chat</button>

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
            {hoveredId === chat.id && (
              <button
                onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                style={{
                  background: "none", border: "none", color: "#ef4444",
                  cursor: "pointer", fontSize: "14px", padding: "0 4px", flexShrink: 0,
                }}
                title="Delete chat"
              >🗑️</button>
            )}
          </div>
        ))}
      </div>

      {/* Clear History */}
      {chats.length > 0 && (
        <div style={{ paddingTop: "12px" }}>
          {!showClearConfirm ? (
            <button onClick={() => setShowClearConfirm(true)} style={{
              width: "100%", padding: "8px", borderRadius: "8px",
              border: "1px solid #ef4444", background: "transparent",
              color: "#ef4444", fontSize: "12px", cursor: "pointer",
            }}>🗑️ Clear All History</button>
          ) : (
            <div style={{ fontSize: "12px", textAlign: "center" }}>
              <div style={{ marginBottom: "8px", color: "#ef4444" }}>Are you sure?</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => { clearHistory(); setShowClearConfirm(false); }} style={{
                  flex: 1, padding: "6px", borderRadius: "6px",
                  background: "#ef4444", color: "white", border: "none", cursor: "pointer", fontSize: "12px"
                }}>Yes</button>
                <button onClick={() => setShowClearConfirm(false)} style={{
                  flex: 1, padding: "6px", borderRadius: "6px",
                  background: "#e5e7eb", color: "#111827", border: "none", cursor: "pointer", fontSize: "12px"
                }}>No</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Bottom: Profile + Download + Logout ---- */}
      {authUser && (
        <div style={{
          borderTop: "1px solid #e5e7eb",
          marginTop: "12px",
          paddingTop: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}>
          {/* Avatar + name */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
            <div style={{
              width: "34px", height: "34px", borderRadius: "50%",
              background: "#4f46e5", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "14px", fontWeight: 700, color: "white"
            }}>
              {authUser.username?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: "13px", fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
              }}>
                {authUser.username}
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>Free plan</div>
            </div>
          </div>

          {/* Download chat button */}
          <button
            onClick={downloadChat}
            title="Download this chat"
            disabled={!activeChat?.messages?.length}
            style={{
              background: "none", border: "1px solid #e5e7eb", borderRadius: "8px",
              padding: "6px 8px", cursor: activeChat?.messages?.length ? "pointer" : "not-allowed",
              fontSize: "15px", color: "#64748b", flexShrink: 0,
              opacity: activeChat?.messages?.length ? 1 : 0.4,
              position: "relative",
            }}
          >
            ⬇️
            {activeChat?.messages?.length > 0 && (
              <span style={{
                position: "absolute", top: "3px", right: "3px",
                width: "6px", height: "6px", borderRadius: "50%",
                background: "#3b82f6",
              }} />
            )}
          </button>

          {/* Logout button */}
          <button
            onClick={onLogout}
            title="Logout"
            style={{
              background: "none", border: "1px solid #e5e7eb", borderRadius: "8px",
              padding: "6px 8px", cursor: "pointer", fontSize: "15px",
              color: "#ef4444", flexShrink: 0,
            }}
          >
            ⏻
          </button>
        </div>
      )}

    </aside>
  );
}

export default Sidebar;