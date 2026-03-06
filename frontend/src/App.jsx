import React, { useState, useEffect } from "react";
import Sidebar from "./components/SIdebar";
import AuthPage from "./components/AuthPage";
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
import ChartDataLabels from "chartjs-plugin-datalabels";

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

// ---- Global Constants ----
const CHART_COLORS = [
  "#4f46e5","#7c3aed","#db2777","#ea580c","#16a34a",
  "#0891b2","#d97706","#dc2626","#9333ea","#0284c7"
];

// ---- Detect JOIN intent on frontend ----
// Only triggers when user EXPLICITLY says join/combine/merge + two table names
// Authenticated fetch helper — auto adds Bearer token
function authFetch(url, options = {}) {
  const token = localStorage.getItem("token");
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "Authorization": `Bearer ${token}`,
      "Content-Type": options.body && typeof options.body === "string"
        ? "application/json"
        : (options.headers?.["Content-Type"] || undefined),
    },
  });
}

function isJoinQuery(text) {
  const q = text.toLowerCase();
  // Block informational/meta questions — these go to /chat
  if (/\b(what|which|how|can|possible|insight|analysis|tell|explain|describe)\b/.test(q) &&
      !/\b(join\s+\w+\s+(to|with|and)\s+\w+)\b/.test(q)) return false;
  // Explicit join/combine/merge with table names
  if (/\b(join|combine|merge)\s+\w/.test(q)) return true;
  // Comma-separated multi-table with join keyword
  if (/\bjoin\b/.test(q) && (q.match(/,/g) || []).length >= 1) return true;
  return false;
}

// ---- Renders a result table ----
function ResultTable({ tableData }) {
  if (!tableData) return null;
  const { columns, rows } = tableData;

  const exportCSV = () => {
    const header = columns.join(",");
    const body = rows.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `export-${Date.now()}.csv`;
    link.click();
  };

  const exportExcel = () => {
    import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs").then(XLSX => {
      const wsData = [columns, ...rows.map(r => r.map(c => String(c)))];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Style header row bold
      columns.forEach((_, i) => {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
        if (cell) cell.s = { font: { bold: true } };
      });

      // Auto column width
      ws["!cols"] = columns.map((col, i) => ({
        wch: Math.max(col.length, ...rows.map(r => String(r[i] ?? "").length), 10)
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Results");
      XLSX.writeFile(wb, `export-${Date.now()}.xlsx`);
    });
  };

  return (
    <div>
      {/* Export buttons */}
      <div style={{ display: "flex", gap: "8px", marginTop: "10px", marginBottom: "4px" }}>
        <button onClick={exportCSV} style={{
          background: "none", border: "1px solid #16a34a", borderRadius: "6px",
          padding: "3px 10px", fontSize: "11px", color: "#16a34a", cursor: "pointer",
          display: "flex", alignItems: "center", gap: "4px"
        }}>
          ⬇️ CSV
        </button>
        <button onClick={exportExcel} style={{
          background: "none", border: "1px solid #0891b2", borderRadius: "6px",
          padding: "3px 10px", fontSize: "11px", color: "#0891b2", cursor: "pointer",
          display: "flex", alignItems: "center", gap: "4px"
        }}>
          📊 Excel
        </button>
        <span style={{ fontSize: "11px", color: "#94a3b8", alignSelf: "center" }}>
          {rows.length} rows · {columns.length} cols
        </span>
      </div>

      <div style={{
        overflowX: "auto",
        borderRadius: "8px",
        border: "1px solid #e2e8f0",
        maxHeight: "320px",
        overflowY: "auto"
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#4f46e5", color: "#fff", position: "sticky", top: 0 }}>
              {columns.map((col, i) => (
                <th key={i} style={{
                  padding: "8px 12px", textAlign: "left",
                  fontWeight: 600, whiteSpace: "nowrap"
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
                    padding: "7px 12px", whiteSpace: "nowrap", color: "#334155"
                  }}>{String(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

// ---- Chart with its own ref for correct download ----
function ChartWithDownload({ chart, onClose }) {
  const chartRef = React.useRef(null);

  const downloadPNG = () => {
    const chartInstance = chartRef.current;
    if (!chartInstance) return;

    // chart.js v4 — ref.current IS the chart instance, canvas is chart.canvas
    const canvas = chartInstance.canvas;
    if (!canvas) return;

    try {
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const ctx = exportCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      ctx.drawImage(canvas, 0, 0);

      const link = document.createElement("a");
      link.download = `chart-${Date.now()}.png`;
      link.href = exportCanvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const commonOptions = {
    responsive: true,
    plugins: {
      legend: { display: chart.type === "pie" },
      datalabels: {
        display: true,
        color: chart.type === "pie" ? "#fff" : "#333",
        font: { weight: "bold", size: 12 },
        anchor: chart.type === "pie" ? "center" : "end",
        align: chart.type === "pie" ? "center" : "top",
        formatter: (value) =>
          typeof value === "number"
            ? value % 1 === 0 ? value : value.toFixed(2)
            : value
      }
    }
  };

  const data = {
    labels: chart.labels,
    datasets: chart.type === "pie"
      ? [{ data: chart.values, backgroundColor: CHART_COLORS }]
      : chart.type === "line"
      ? [{ label: "Value", data: chart.values, borderColor: "#4f46e5", backgroundColor: "rgba(79,70,229,0.1)", fill: true, tension: 0.3 }]
      : [{ label: "Value", data: chart.values, backgroundColor: CHART_COLORS }]
  };

  return (
    <div style={{ marginTop: "12px", maxWidth: "520px" }}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        <button onClick={onClose} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "4px 10px", fontSize: "12px", color: "#64748b", cursor: "pointer" }}>
          ✕ Close chart
        </button>
        <button onClick={downloadPNG} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "4px 10px", fontSize: "12px", color: "#4f46e5", cursor: "pointer" }}>
          ⬇️ Download PNG
        </button>
      </div>

      {chart.type === "bar" && <Bar ref={chartRef} data={data} options={commonOptions} plugins={[ChartDataLabels]} />}
      {chart.type === "line" && <Line ref={chartRef} data={data} options={commonOptions} plugins={[ChartDataLabels]} />}
      {chart.type === "pie" && <Pie ref={chartRef} data={data} options={commonOptions} plugins={[ChartDataLabels]} />}
    </div>
  );
}

// ---- Info Tooltip Component ----
function InfoTooltip({ darkMode }) {
  const [show, setShow] = React.useState(false);

  const keywords = [
    { category: "📊 Charts", items: ["plot", "chart", "graph", "visualize", "bar chart", "pie chart", "line chart"] },
    { category: "🔢 Aggregation", items: ["top", "highest", "lowest", "average", "total", "count", "sum", "max", "min"] },
    { category: "📋 Listing", items: ["show", "list", "display", "give me", "fetch", "get me"] },
    { category: "📝 Summary", items: ["summary", "summarize", "overview", "analyze"] },
    { category: "🔗 JOIN", items: ["join X to Y", "combine X and Y", "merge X with Y"] },
    { category: "🗄️ DB Info", items: ["what tables", "schema of", "columns in", "describe", "how many tables", "db size"] },
    { category: "🧠 Follow-up (RAG)", items: ["their", "these", "those", "them", "now show", "also show", "filter", "sort", "add", "include"] },
    { category: "⛔ Blocked", items: ["alter", "delete", "drop", "insert", "update", "truncate"] },
  ];

  const bg = darkMode ? "#1e293b" : "#ffffff";
  const border = darkMode ? "#334155" : "#e2e8f0";
  const titleColor = darkMode ? "#f1f5f9" : "#1e293b";
  const categoryColor = darkMode ? "#94a3b8" : "#64748b";
  const tagBg = darkMode ? "#334155" : "#f1f5f9";
  const tagColor = darkMode ? "#e2e8f0" : "#334155";
  const footerColor = darkMode ? "#64748b" : "#94a3b8";
  const footerBorder = darkMode ? "#334155" : "#e2e8f0";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setShow(v => !v)}
        style={{
          background: show ? "#6366f1" : "none",
          border: "1.5px solid #6366f1",
          borderRadius: "50%",
          width: "28px",
          height: "28px",
          cursor: "pointer",
          fontSize: "13px",
          color: show ? "#ffffff" : "#6366f1",
          fontWeight: "bold",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
        }}
      >
        ℹ
      </button>

      {show && (
        <div style={{
          position: "absolute",
          top: "36px",
          right: "0",
          width: "320px",
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: "12px",
          padding: "14px",
          zIndex: 9999,
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: titleColor }}>
              💡 Supported Keywords
            </div>
            <button onClick={() => setShow(false)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: categoryColor, fontSize: "16px", lineHeight: 1, padding: "0 2px"
            }}>✕</button>
          </div>
          {keywords.map((group, i) => (
            <div key={i} style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: categoryColor, marginBottom: "4px" }}>
                {group.category}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {group.items.map((kw, j) => (
                  <span key={j} style={{
                    background: tagBg,
                    color: tagColor,
                    borderRadius: "6px",
                    padding: "2px 8px",
                    fontSize: "11px",
                  }}>
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div style={{ fontSize: "10px", color: footerColor, marginTop: "8px", borderTop: `1px solid ${footerBorder}`, paddingTop: "8px" }}>
            Ask in natural language — AI handles the rest!
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("darkMode") === "true";
  });

  const [authUser, setAuthUser] = useState(() => {
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");
    const email = localStorage.getItem("email");
    return token ? { token, username, email } : null;
  });

  const handleLogin = (userData) => {
    setAuthUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("email");
    setAuthUser(null);
  };

  const [tableName, setTableName] = useState("");
  const [tables, setTables] = useState([]);
  const [dbInfo, setDbInfo] = useState(null);

  // Per-user chat history key (localStorage fallback)
  const chatKey = `chatHistory_${authUser?.email || "guest"}`;

  const [chats, setChats] = useState([
    { id: Date.now(), title: "New Chat", messages: [], loading: false }
  ]);

  const [activeChatId, setActiveChatId] = useState(() => Date.now());

  const [input, setInput] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const activeChat = chats.find(chat => chat.id === activeChatId);

  // Load chat history from server when user logs in
  useEffect(() => {
    if (!authUser?.email) return;
    authFetch("http://localhost:8000/history")
      .then(res => res.json())
      .then(data => {
        if (data.chats && data.chats.length > 0) {
          setChats(data.chats);
          setActiveChatId(data.chats[0].id);
        } else {
          const newId = Date.now();
          setChats([{ id: newId, title: "New Chat", messages: [], loading: false }]);
          setActiveChatId(newId);
        }
      })
      .catch(() => {});
  }, [authUser?.email]);

  // Save chat to server whenever chats change
  useEffect(() => {
    if (!authUser?.email || !chats.length) return;
    chats.forEach(chat => {
      if (chat.messages.length === 0) return; // don't save empty chats
      authFetch("http://localhost:8000/history/save", {
        method: "POST",
        body: JSON.stringify({
          chat_id: String(chat.id),
          chat_title: chat.title,
          messages: chat.messages.map(m => ({
            sender: m.sender,
            text: m.text || "",
            table_data: m.table_data || null,
            chart: m.chart || null,
          }))
        })
      }).catch(() => {});
    });
  }, [chats]);

  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    authFetch("http://localhost:8000/tables")
      .then(res => res.json())
      .then(data => {
        setTables(data.tables);
        setDbInfo(data);
      })
      .catch(err => console.error(err));
  }, [authUser?.email]);

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
      const res = await authFetch("http://localhost:8000/upload", {
        method: "POST",
        headers: {},
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

    if (tableName === "__all__") {
      try {
        await authFetch("http://localhost:8000/clear-table", { method: "POST" });
        setUploadStatus("✅ Full DB Mode — all tables active. Ask anything!");
      } catch {
        setUploadStatus("✅ Full DB Mode active");
      }
      return;
    }

    try {
      const res = await authFetch(`http://localhost:8000/load-table/${tableName}`);
      const data = await res.json();
      if (data.error) {
        setUploadStatus(`❌ ${data.error}`);
      } else {
        setUploadStatus(`✅ Using DB table: ${tableName} (${data.rows} rows)`);
      }
    } catch {
      setUploadStatus("❌ Failed to load DB table");
    }
  }

  async function sendMessage() {
    if (!input.trim()) return;

    const currentInput = input;
    const isJoin = isJoinQuery(currentInput);

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

      const res = await authFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          message: currentInput,
          history: (activeChat?.messages || []).slice(-6).map(m => ({
            sender: m.sender,
            text: m.text || ""
          }))
        }),
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

  const chatWindowRef = React.useRef(null);
  const [showScrollBtn, setShowScrollBtn] = React.useState(false);

  const scrollToBottom = () => {
    chatWindowRef.current?.scrollTo({ top: chatWindowRef.current.scrollHeight, behavior: "smooth" });
  };

  const handleScroll = () => {
    const el = chatWindowRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [chats, activeChatId]);

  // Auth gate — after all hooks
  if (!authUser) {
    return <AuthPage onLogin={handleLogin} darkMode={darkMode} />;
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
        authUser={authUser}
        onLogout={handleLogout}
        activeChat={activeChat}
        deleteChat={(id) => {
          // Delete from server
          authFetch("http://localhost:8000/history/delete", {
            method: "DELETE",
            body: JSON.stringify({ chat_id: String(id) })
          }).catch(() => {});
          // Update UI
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
          // Clear from server
          authFetch("http://localhost:8000/history/clear", {
            method: "DELETE"
          }).catch(() => {});
          // Update UI
          const newChat = { id: Date.now(), title: "New Chat", messages: [], loading: false };
          setChats([newChat]);
          setActiveChatId(newChat.id);
        }}
      />

      {/* Main Chat Area */}
      <main className="chat-container" style={{ position: "relative" }}>

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
            {/* Info tooltip */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{
                fontSize: "12px",
                color: darkMode ? "#94a3b8" : "#64748b",
                fontWeight: 500,
                whiteSpace: "nowrap"
              }}>
                Special Keyword Info
              </span>
              <InfoTooltip darkMode={darkMode} />
            </div>
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
          </div>
        </header>

        {/* Chat Window */}
        <div className="chat-window" ref={chatWindowRef} onScroll={handleScroll}>

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
                    <ChartWithDownload
                      chart={msg.chart}
                      onClose={() => {
                        setChats(prev => prev.map(chat =>
                          chat.id === activeChatId
                            ? {
                                ...chat,
                                messages: chat.messages.map((m, i) =>
                                  i === index
                                    ? { ...m, chart: null }
                                    : m
                                )
                              }
                            : chat
                        ));
                      }}
                    />
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
                    <ChartWithDownload
                      chart={msg.chart}
                      onClose={() => {
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
                    />
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

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            style={{
              position: "absolute",
              bottom: "100px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "#4f46e5",
              color: "white",
              border: "none",
              borderRadius: "50%",
              width: "36px",
              height: "36px",
              cursor: "pointer",
              fontSize: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(79,70,229,0.4)",
              zIndex: 100,
            }}
            title="Scroll to bottom"
          >
            ↓
          </button>
        )}

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
                <option value="__all__">🗄️ All Tables (Full DB Mode)</option>
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