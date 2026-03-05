import { useState, useEffect } from "react";
import Sidebar from "./components/SIdebar";
import ReactMarkdown from "react-markdown";
import "./index.css";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import { Bar, Line, Pie } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// ---- Detect JOIN intent on frontend ----
// Only triggers when user EXPLICITLY says join/combine/merge + two table names
function isJoinQuery(text) {
  // Must have explicit join/combine/merge keyword AND two word-like table names
  return /\b(join|combine|merge)\s+\w+\s+(to|with|and)\s+\w+/i.test(text);
}

// ---- Renders a result table ----
function ResultTable({ tableData }) {
  if (!tableData) return null;
  const { columns, rows } = tableData;

  return (
    <div style={{
      overflowX: "auto",
      marginTop: "12px",
      borderRadius: "8px",
      border: "1px solid #e2e8f0",
      maxHeight: "320px",
      overflowY: "auto"
    }}>
      <table style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "13px",
      }}>
        <thead>
          <tr style={{ background: "#4f46e5", color: "#fff", position: "sticky", top: 0 }}>
            {columns.map((col, i) => (
              <th key={i} style={{
                padding: "8px 12px",
                textAlign: "left",
                fontWeight: 600,
                whiteSpace: "nowrap"
              }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{
              background: ri % 2 === 0 ? "#fff" : "#f8fafc",
              borderBottom: "1px solid #e2e8f0"
            }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: "7px 12px",
                  whiteSpace: "nowrap",
                  color: "#334155"
                }}>{String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- JOIN Badge ----
function JoinBadge({ joinKey, table1, table2, rows, allCommonKeys }) {
  const [showKeys, setShowKeys] = useState(false);

  // Check if it's a multi-step chain (allCommonKeys contains table names)
  const isChain = allCommonKeys && allCommonKeys.length > 1 &&
    !allCommonKeys[0].includes("=");

  return (
    <div style={{
      display: "inline-flex",
      flexDirection: "column",
      gap: "4px",
      marginBottom: "10px",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap"
      }}>
        <span style={{
          background: "#eef2ff",
          color: "#4f46e5",
          borderRadius: "6px",
          padding: "4px 10px",
          fontSize: "12px",
          fontWeight: 600,
          border: "1px solid #c7d2fe"
        }}>
          🔗 {isChain ? `${allCommonKeys.length}-Table JOIN` : "JOIN"}
        </span>

        {isChain ? (
          // Show chain: Table1 → Table2 → Table3
          <span style={{ fontSize: "13px", color: "#475569" }}>
            {allCommonKeys.map((t, i) => (
              <span key={i}>
                <b>{t}</b>
                {i < allCommonKeys.length - 1 && <span style={{ color: "#94a3b8" }}> → </span>}
              </span>
            ))}
          </span>
        ) : (
          <span style={{ fontSize: "13px", color: "#475569" }}>
            <b>{table1}</b> ⟷ <b>{table2}</b>
          </span>
        )}

        <span style={{
          background: "#f0fdf4",
          color: "#16a34a",
          borderRadius: "6px",
          padding: "4px 10px",
          fontSize: "12px",
          border: "1px solid #bbf7d0"
        }}>
          {rows} rows
        </span>

        {!isChain && (
          <span style={{
            background: "#fef9c3",
            color: "#92400e",
            borderRadius: "6px",
            padding: "4px 10px",
            fontSize: "12px",
            border: "1px solid #fde68a",
            cursor: "pointer"
          }} onClick={() => setShowKeys(v => !v)}>
            🔑 Key: {joinKey} {allCommonKeys?.length > 1 ? `(+${allCommonKeys.length - 1} more)` : ""}
          </span>
        )}
      </div>

      {showKeys && allCommonKeys && allCommonKeys.length > 1 && !isChain && (
        <div style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "6px",
          padding: "8px 12px",
          fontSize: "12px",
          color: "#475569"
        }}>
          <b>All common keys:</b>
          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
            {allCommonKeys.map((k, i) => <li key={i}>{k}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- SQL Snippet display ----
function SqlSnippet({ sql }) {
  const [show, setShow] = useState(false);

  return (
    <div style={{ marginTop: "8px" }}>
      <button
        onClick={() => setShow(v => !v)}
        style={{
          background: "none",
          border: "1px solid #cbd5e1",
          borderRadius: "5px",
          padding: "3px 10px",
          fontSize: "11px",
          color: "#64748b",
          cursor: "pointer"
        }}
      >
        {show ? "Hide SQL ▲" : "Show SQL ▼"}
      </button>
      {show && (
        <pre style={{
          marginTop: "6px",
          background: "#1e293b",
          color: "#7dd3fc",
          borderRadius: "8px",
          padding: "12px",
          fontSize: "12px",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        }}>{sql}</pre>
      )}
    </div>
  );
}


// ---- No Common Key — show both tables' columns ----
function NoMatchColumns({ table1Name, table2Name, table1Columns, table2Columns }) {
  if (!table1Columns || !table2Columns) return null;

  return (
    <div style={{ marginTop: "12px" }}>
      <div style={{
        fontSize: "13px",
        color: "#92400e",
        background: "#fef9c3",
        border: "1px solid #fde68a",
        borderRadius: "8px",
        padding: "10px 14px",
        marginBottom: "12px"
      }}>
        ⚠️ No common column found between <b>{table1Name}</b> and <b>{table2Name}</b> — cannot auto-detect JOIN key.
      </div>

      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>

        {/* Table 1 columns */}
        <div style={{
          flex: 1,
          minWidth: "180px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "12px"
        }}>
          <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "8px", color: "#4f46e5" }}>
            📋 {table1Name}
          </div>
          {table1Columns.map((col, i) => (
            <div key={i} style={{ fontSize: "12px", color: "#475569", padding: "3px 0", borderBottom: "1px solid #f1f5f9" }}>
              {col}
            </div>
          ))}
        </div>

        {/* Table 2 columns */}
        <div style={{
          flex: 1,
          minWidth: "180px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "12px"
        }}>
          <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "8px", color: "#4f46e5" }}>
            📋 {table2Name}
          </div>
          {table2Columns.map((col, i) => (
            <div key={i} style={{ fontSize: "12px", color: "#475569", padding: "3px 0", borderBottom: "1px solid #f1f5f9" }}>
              {col}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

// ---- Chart Suggestion Banner ----
function ChartSuggestion({ suggestion, onAccept }) {
  const [dismissed, setDismissed] = useState(false);
  if (!suggestion || dismissed) return null;

  const icons = { bar: "📊", pie: "🥧", line: "📈" };

  return (
    <div style={{
      marginTop: "10px",
      background: "#f0f9ff",
      border: "1px solid #bae6fd",
      borderRadius: "10px",
      padding: "10px 14px",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      flexWrap: "wrap"
    }}>
      <span style={{ fontSize: "18px" }}>{icons[suggestion.chart_type] || "📊"}</span>
      <div style={{ flex: 1, fontSize: "13px", color: "#0369a1" }}>
        <b>Chart suggestion:</b> {suggestion.reason}
      </div>
      <button
        onClick={() => onAccept(suggestion)}
        style={{
          background: "#0284c7",
          color: "white",
          border: "none",
          borderRadius: "8px",
          padding: "6px 14px",
          fontSize: "12px",
          cursor: "pointer",
          fontWeight: 600
        }}
      >
        Show {suggestion.chart_type} chart
      </button>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: "none",
          border: "none",
          color: "#94a3b8",
          cursor: "pointer",
          fontSize: "16px"
        }}
      >
        ✕
      </button>
    </div>
  );
}

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("darkMode") === "true";
  });
  const [tableName, setTableName] = useState("");
  const [tables, setTables] = useState([]);
  const [dbInfo, setDbInfo] = useState(null);

  const [chats, setChats] = useState(() => {
    try {
      const saved = localStorage.getItem("chatHistory");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Reset loading state on reload
        return parsed.map(c => ({ ...c, loading: false }));
      }
    } catch {}
    const firstChatId = Date.now();
    return [{ id: firstChatId, title: "New Chat", messages: [], loading: false }];
  });

  const [activeChatId, setActiveChatId] = useState(() => {
    try {
      const saved = localStorage.getItem("chatHistory");
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed[0]?.id || Date.now();
      }
    } catch {}
    return Date.now();
  });
  const [input, setInput] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const activeChat = chats.find(chat => chat.id === activeChatId);

  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  // Save chat history to localStorage whenever chats change
  useEffect(() => {
    try {
      // Don't save loading state
      const toSave = chats.map(c => ({ ...c, loading: false }));
      localStorage.setItem("chatHistory", JSON.stringify(toSave));
    } catch {}
  }, [chats]);

  useEffect(() => {
    fetch("http://localhost:8000/tables")
      .then(res => res.json())
      .then(data => {
        setTables(data.tables);
        setDbInfo(data);
      })
      .catch(err => console.error(err));
  }, []);


  function createNewChat() {
    const newChat = {
      id: Date.now(),
      title: "New Chat",
      messages: [],
      loading: false
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
    const isJoin = isJoinQuery(currentInput);

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
      const endpoint = isJoin
        ? "http://localhost:8000/join"
        : "http://localhost:8000/chat";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentInput }),
      });

      const data = await res.json();
      console.log("RESPONSE:", data);

      if (data.error) {
        // Truncate long SQL errors to keep UI clean
        const rawError = data.error;
        const shortError = rawError.length > 120
          ? rawError.substring(0, 120) + "..."
          : rawError;

        setChats(prevChats =>
          prevChats.map(chat =>
            chat.id === activeChatId
              ? {
                  ...chat,
                  messages: [
                    ...chat.messages,
                    {
                      sender: "bot",
                      text: `❌ ${shortError}`,
                      table1Columns: data.table1_columns || null,
                      table2Columns: data.table2_columns || null,
                      table1Name: data.table1_name || null,
                      table2Name: data.table2_name || null,
                    }
                  ]
                }
              : chat
          )
        );
      } else {
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
                      chart: data.chart || null,
                      // JOIN-specific fields
                      isJoin: isJoin,
                      sql: data.sql || null,
                      joinKey: data.join_key || null,
                      table1: data.table1 || null,
                      table2: data.table2 || null,
                      rows: data.rows || null,
                      tableData: data.table_data || null,
                      allCommonKeys: data.all_common_keys || null,
                      chartSuggestion: data.chart_suggestion || null,
                    }
                  ]
                }
              : chat
          )
        );
      }

    } catch {
      setChats(prevChats =>
        prevChats.map(chat =>
          chat.id === activeChatId
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  { sender: "bot", text: "❌ Backend error" }
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

  const CHART_COLORS = [
    "#4f46e5","#7c3aed","#db2777","#ea580c","#16a34a",
    "#0891b2","#d97706","#dc2626","#9333ea","#0284c7"
  ];

  function renderChart(chart) {
    if (!chart) return null;

    const commonOptions = {
      responsive: true,
      plugins: { legend: { display: chart.type === "pie" } },
    };

    if (chart.type === "bar") {
      return (
        <Bar
          data={{
            labels: chart.labels,
            datasets: [{
              label: "Value",
              data: chart.values,
              backgroundColor: CHART_COLORS,
            }],
          }}
          options={commonOptions}
        />
      );
    }

    if (chart.type === "line") {
      return (
        <Line
          data={{
            labels: chart.labels,
            datasets: [{
              label: "Value",
              data: chart.values,
              borderColor: "#4f46e5",
              backgroundColor: "rgba(79,70,229,0.1)",
              fill: true,
              tension: 0.3,
            }],
          }}
          options={commonOptions}
        />
      );
    }

    if (chart.type === "pie") {
      return (
        <Pie
          data={{
            labels: chart.labels,
            datasets: [{
              data: chart.values,
              backgroundColor: CHART_COLORS,
            }],
          }}
          options={commonOptions}
        />
      );
    }

    return null;
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
        dbInfo={dbInfo}
        deleteChat={(id) => {
          const remaining = chats.filter(c => c.id !== id);
          if (remaining.length === 0) {
            const newChat = { id: Date.now(), title: "New Chat", messages: [], loading: false };
            setChats([newChat]);
            setActiveChatId(newChat.id);
          } else {
            setChats(remaining);
            if (activeChatId === id) setActiveChatId(remaining[0].id);
          }
        }}
        clearHistory={() => {
          const newChat = { id: Date.now(), title: "New Chat", messages: [], loading: false };
          setChats([newChat]);
          setActiveChatId(newChat.id);
          localStorage.removeItem("chatHistory");
        }}
      />

      {/* Main Chat Area */}
      <main className="chat-container">

        {/* Header */}
        <header className="topbar">
          <div className="model-name">
            GenAI SQL Assistant
            {dbInfo && (
              <span style={{ marginLeft: "12px", fontSize: "12px", color: "#aaa" }}>
                | DB: {dbInfo.database || "N/A"}
                | Tables: {dbInfo.total_tables || 0}
                | Size: {dbInfo.size_mb || "N/A"} MB
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode(v => !v)}
              style={{
                background: darkMode ? "#374151" : "#f3f4f6",
                border: "1px solid " + (darkMode ? "#4b5563" : "#d1d5db"),
                borderRadius: "20px",
                padding: "6px 14px",
                cursor: "pointer",
                fontSize: "14px",
                color: darkMode ? "#f9fafb" : "#111827",
                transition: "all 0.2s",
              }}
            >
              {darkMode ? "☀️ Light" : "🌙 Dark"}
            </button>
            <button className="login-btn">Login</button>
          </div>
        </header>

        {/* Chat Window */}
        <div className="chat-window">

          {activeChat?.messages.length === 0 && (
            <div className="empty">
              <div>Upload data and start chatting 👇</div>
              <div style={{
                marginTop: "12px",
                fontSize: "13px",
                color: "#94a3b8",
                background: "#f8fafc",
                borderRadius: "8px",
                padding: "12px 16px",
                border: "1px solid #e2e8f0",
                maxWidth: "420px",
                textAlign: "left"
              }}>
                <b>💡 Try JOIN queries:</b>
                <ul style={{ margin: "6px 0 0 16px", padding: 0, lineHeight: "1.8" }}>
                  <li>join Orders to Customers</li>
                  <li>join Order_items with Products</li>
                  <li>combine Orders and Customers</li>
                  <li>merge Products with Categories</li>
                </ul>
              </div>
            </div>
          )}

          {activeChat?.messages.map((msg, index) => (
            <div key={index} className={`message ${msg.sender}`}>

              {/* JOIN result */}
              {msg.isJoin && msg.sender === "bot" ? (
                <div>
                  {/* JOIN badge */}
                  {msg.joinKey && (
                    <JoinBadge
                      joinKey={msg.joinKey}
                      table1={msg.table1}
                      table2={msg.table2}
                      rows={msg.rows}
                      allCommonKeys={msg.allCommonKeys}
                    />
                  )}

                  {/* AI explanation */}
                  {msg.text && (
                    <div style={{ marginBottom: "10px", lineHeight: "1.7" }}>
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  )}

                  {/* Data table */}
                  {msg.tableData && (
                    <ResultTable tableData={msg.tableData} />
                  )}

                  {/* Chart */}
                  {msg.chart && (
                    <div style={{ marginTop: "16px", maxWidth: "520px" }}>
                      {renderChart(msg.chart)}
                    </div>
                  )}

                  {/* SQL toggle */}
                  {msg.sql && <SqlSnippet sql={msg.sql} />}
                </div>

              ) : (
                /* Regular chat result */
                <div>
                  {msg.text && (
                    <div style={{ lineHeight: "1.7", marginBottom: msg.tableData ? "10px" : "0" }}>
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  )}
                  {/* Show both tables' columns when JOIN has no common key */}
                  {msg.table1Columns && msg.table2Columns && (
                    <NoMatchColumns
                      table1Name={msg.table1Name}
                      table2Name={msg.table2Name}
                      table1Columns={msg.table1Columns}
                      table2Columns={msg.table2Columns}
                    />
                  )}
                  {/* Table preview for row queries */}
                  {msg.tableData && !msg.chart && (
                    <ResultTable tableData={msg.tableData} />
                  )}
                  {msg.chart && (
                    <div style={{ marginTop: "12px", maxWidth: "520px" }}>
                      {/* Close chart button */}
                      <button
                        onClick={() => {
                          setChats(prev => prev.map(chat =>
                            chat.id === activeChatId
                              ? {
                                  ...chat,
                                  messages: chat.messages.map((m, i) =>
                                    i === index
                                      ? { ...m, chart: null, chartSuggestion: m._savedSuggestion || null }
                                      : m
                                  )
                                }
                              : chat
                          ));
                        }}
                        style={{
                          background: "none",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          padding: "4px 10px",
                          fontSize: "12px",
                          color: "#64748b",
                          cursor: "pointer",
                          marginBottom: "8px"
                        }}
                      >
                        ✕ Close chart
                      </button>
                      {renderChart(msg.chart)}
                    </div>
                  )}
                  {/* Chart suggestion banner */}
                  {msg.chartSuggestion && !msg.chart && (
                    <ChartSuggestion
                      suggestion={msg.chartSuggestion}
                      onAccept={(s) => {
                        setChats(prev => prev.map(chat =>
                          chat.id === activeChatId
                            ? {
                                ...chat,
                                messages: chat.messages.map((m, i) =>
                                  i === index
                                    ? {
                                        ...m,
                                        chart: { type: s.chart_type, labels: s.labels, values: s.values },
                                        chartSuggestion: null,
                                        _savedSuggestion: s  // save for restore
                                      }
                                    : m
                                )
                              }
                            : chat
                        ));
                      }}
                    />
                  )}
                </div>
              )}

            </div>
          ))}

          {activeChat?.loading && (
            <div className="message bot" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                display: "inline-block",
                width: "8px", height: "8px",
                borderRadius: "50%",
                background: "#4f46e5",
                animation: "pulse 1s infinite"
              }} />
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
            placeholder='Ask a question or try "join Orders to Customers"...'
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