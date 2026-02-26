import React from "react";

function Sidebar({
  chats,
  activeChatId,
  setActiveChatId,
  createNewChat,
  collapsed
}) {
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      
      <div className="logo">⚡ GenAI</div>

      {/* New Chat Button */}
      <button
        className="new-chat-btn"
        onClick={createNewChat}
      >
        + New Chat
      </button>

      {/* Chat List */}
      <div className="chat-list">
        {chats.map(chat => (
          <div
            key={chat.id}
            onClick={() => setActiveChatId(chat.id)}
            className={
              chat.id === activeChatId
                ? "chat-item active"
                : "chat-item"
            }
          >
            {chat.title}
          </div>
        ))}
      </div>

    </aside>
  );
}

export default Sidebar;