import { useState, useEffect } from "react";
import Sidebar from "./components/SIdebar";
import "./index.css";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import { Bar, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

function App() {
  const [tableName, setTableName] = useState("");
  const [tables, setTables] = useState([]);
  const [chats, setChats] = useState([
  {
    id: Date.now(),
    title: "New Chat",
    messages: [],
    loading:false
  }
  ]);
  const [activeChatId, setActiveChatId] = useState(Date.now());
  const [input, setInput] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const activeChat = chats.find(chat => chat.id === activeChatId);

  useEffect(() => {
    fetch("http://localhost:8000/tables")
      .then(res => res.json())
      .then(data => {
        if (data.tables) setTables(data.tables);
      })
      .catch(() => console.error("Failed to load tables"));
  }, []);


  function createNewChat() {
  const newChat = {
    id: Date.now(),
    title: "New Chat",
    messages: [],
    loading:false
  };

  setChats(prev => [newChat, ...prev]);
  setActiveChatId(newChat.id);
}

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://localhost:8000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.error) {
        setUploadStatus(`❌ ${data.error}`);
      } else {
        setUploadStatus(
          `✅ Using uploaded dataset: ${file.name} (${data.rows} rows)`
        );
      }
    } catch {
      setUploadStatus("❌ Upload failed");
    }
  }

  
  async function handleLoadTable() {
    if (!tableName.trim()) {
      setUploadStatus("❌ Please select a table");
      return;
    }

    try {
      const res = await fetch(
        `http://localhost:8000/load-table/${tableName}`
      );
      const data = await res.json();

      if (data.error) {
        setUploadStatus(`❌ ${data.error}`);
      } else {
        setUploadStatus(
          `✅ Using DB table: ${tableName} (${data.rows} rows)`
        );
      }
    } catch {
      setUploadStatus("❌ Failed to load DB table");
    }
  }

  async function sendMessage() {
  if (!input.trim()) return;

  const currentInput = input;

  // Add user message
  setChats(prevChats =>
    prevChats.map(chat =>
      chat.id === activeChatId
        ? {
            ...chat,
            messages: [
              ...chat.messages,
              { sender: "user", text: currentInput }
            ],
            title:
              chat.messages.length === 0
                ? currentInput.slice(0, 25)
                : chat.title
          }
        : chat
    )
  );

  setInput("");

  setChats(prevChats =>
    prevChats.map(chat =>
      chat.id === activeChatId
        ? { ...chat, loading: true }
        : chat
    )
  );

  try {
    const res = await fetch("http://localhost:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: currentInput }),
    });

    const data = await res.json();

    setChats(prevChats =>
      prevChats.map(chat =>
        chat.id === activeChatId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                {
                  sender: "bot",
                  text: data.reply || "",
                  chart: data.chart || null
                }
              ]
            }
          : chat
      )
    );

  } catch {
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.id === activeChatId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                { sender: "bot", text: "Backend error" }
              ]
            }
          : chat
      )
    );
  } finally {
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.id === activeChatId
          ? { ...chat, loading: false }
          : chat
      )
    );
  }
}

  return (
    <div className="app">

      {/* Sidebar */}
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        chats={chats}
        activeChatId={activeChatId}
        setActiveChatId={setActiveChatId}
        createNewChat={createNewChat}
      />

      {/* Main Chat Area */}
      <main className="chat-container">

        {/* Header */}
        <header className="topbar">
          <div className="model-name">GenAI SQL Assistant</div>
          <button className="login-btn">Login</button>
        </header>

        {/* Chat Window */}
        <div className="chat-window">

          {activeChat?.messages.length === 0 && (
            <div className="empty">
              Upload data and start chatting 👇
            </div>
          )}

          {activeChat?.messages.map((msg, index) => (
            <div key={index} className={`message ${msg.sender}`}>
    
              {/* Text */}
              {msg.text && <div>{msg.text}</div>}

              {/* Chart */}
              {msg.chart && (
                <div style={{ marginTop: "12px" }}>
                  {msg.chart.type === "bar" ? (
                    <Bar
                      data={{
                        labels: msg.chart.labels,
                        datasets: [
                          {
                            label: "Value",
                            data: msg.chart.values,
                            backgroundColor: "#4f46e5",
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        plugins: {
                          legend: { display: false },
                        },
                      }}
                    />
                  ) : (
                    <Line
                      data={{
                        labels: msg.chart.labels,
                        datasets: [
                          {
                            label: "Value",
                            data: msg.chart.values,
                            borderColor: "#4f46e5",
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        plugins: {
                        legend: { display: false },
                        },
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          ))}

          {activeChat?.loading && (
            <div className="message bot">
              AI is thinking...
            </div>
          )}

        </div>

        {/* Status */}
        {uploadStatus && (
          <div className="status">
            {uploadStatus}
          </div>
        )}

        {/* Input Bar */}
        <div className="input-bar">

          {/* Data Controls */}
          <div className="data-controls">

            <div className="custom-select">
              <select
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
              >
                <option value="">Select DB Table</option>
                {tables.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <button className="load-btn" onClick={handleLoadTable}>
                     Load
            </button>


            <label className="upload-pill">
              Upload
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileUpload}
                hidden
              />
            </label>

          </div>

          {/* Chat Input */}
          <input
            type="text"
            placeholder="Ask something about your data..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />

          {/* Send Button */}
          <button
              className="chat-send-btn"
              onClick={sendMessage}
              disabled={activeChat?.loading}
            >
            {activeChat?.loading ? "Sending..." : "Send"}
            </button>

        </div>

      </main>

    </div>
  );
}

export default App;
