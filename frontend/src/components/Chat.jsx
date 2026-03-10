import { useState } from "react";
import API_URL from "../config";

function Chat() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);

  const sendMessage = async () => {
    if (!message.trim()) return;

    setChat(prev => [...prev, { role: "user", text: message }]);
    setMessage("");

    const res = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const data = await res.json();

    setChat(prev => [
      ...prev,
      { role: "assistant", text: data.reply }
    ]);
  };

  return (
    <div>
      <div style={{ minHeight: 200 }}>
        {chat.map((c, i) => (
          <p key={i}>
            <b>{c.role}:</b> {c.text}
          </p>
        ))}
      </div>

      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask about the data..."
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}

export default Chat;
