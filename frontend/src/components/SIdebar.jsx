import React, { useState } from "react";

function Sidebar({
  chats,
  activeChatId,
  setActiveChatId,
  createNewChat,
  collapsed,
  dbInfo,
  deleteChat,
  clearHistory
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>

      <div className="logo">⚡ GenAI</div>

      {/* Database Info */}
      {dbInfo && (
        <div className="db-info">
          <p>📊 Tables: {dbInfo.total_tables}</p>
        </div>
      )}

      {/* New Chat Button */}
      <button className="new-chat-btn" onClick={createNewChat}>
        + New Chat
      </button>

      {/* Chat List */}
      <div className="chat-list">
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
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              fontSize: "13px"
            }}>
              {chat.title}
            </span>

            {/* Delete button — show on hover */}
            {hoveredId === chat.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(chat.id);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: "14px",
                  padding: "0 4px",
                  flexShrink: 0,
                }}
                title="Delete chat"
              >
                🗑️
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Clear all history */}
      {chats.length > 0 && (
        <div style={{ marginTop: "auto", paddingTop: "16px" }}>
          {!showClearConfirm ? (
            <button
              onClick={() => setShowClearConfirm(true)}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "8px",
                border: "1px solid #ef4444",
                background: "transparent",
                color: "#ef4444",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              🗑️ Clear All History
            </button>
          ) : (
            <div style={{ fontSize: "12px", textAlign: "center" }}>
              <div style={{ marginBottom: "8px", color: "#ef4444" }}>Are you sure?</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => { clearHistory(); setShowClearConfirm(false); }}
                  style={{
                    flex: 1, padding: "6px", borderRadius: "6px",
                    background: "#ef4444", color: "white",
                    border: "none", cursor: "pointer", fontSize: "12px"
                  }}
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  style={{
                    flex: 1, padding: "6px", borderRadius: "6px",
                    background: "#e5e7eb", color: "#111827",
                    border: "none", cursor: "pointer", fontSize: "12px"
                  }}
                >
                  No
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </aside>
  );
}

export default Sidebar;