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

// ---- Renders a result table — fully themed ----
function ResultTable({ tableData }) {
  if (!tableData) return null;
  const { columns, rows } = tableData;

  const isNumeric = (val) => !isNaN(parseFloat(val)) && isFinite(val);

  const isDateStr = (val) => {
    if (typeof val !== "string") return false;
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val) || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(val);
  };

  const formatDate = (val) => {
    try {
      const d = new Date(val);
      if (isNaN(d)) return val;
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    } catch { return val; }
  };

  const formatCell = (val) => {
    const s = String(val);
    if (isDateStr(s)) return formatDate(s);
    return s;
  };

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
      ws["!cols"] = columns.map((col, i) => ({
        wch: Math.max(col.length, ...rows.map(r => String(r[i] ?? "").length), 10)
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Results");
      XLSX.writeFile(wb, `export-${Date.now()}.xlsx`);
    });
  };

  return (
    <div className="result-table-wrap">
      {/* Top bar: row count + export buttons */}
      <div className="result-table-topbar">
        <span className="result-table-meta">
          <span className="result-dot" />
          {rows.length} rows · {columns.length} cols
        </span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={exportCSV} className="export-btn csv-btn">📋 CSV</button>
          <button onClick={exportExcel} className="export-btn xls-btn">📊 Excel</button>
        </div>
      </div>

      <div className="result-table-scroll">
        <table className="result-table">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} title={col}>{col.replace(/_/g, " ").toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? "row-even" : "row-odd"}>
                {row.map((cell, ci) => (
                  <td key={ci} className={isNumeric(cell) ? "td-num" : ""} title={String(cell)}>
                    {formatCell(cell)}
                  </td>
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
function highlightSQL(sql) {
  const keywords = /\b(SELECT|FROM|WHERE|JOIN|ON|GROUP BY|ORDER BY|HAVING|INNER|LEFT|RIGHT|OUTER|AS|AND|OR|NOT|IN|IS|NULL|TOP|DISTINCT|WITH|UNION|BY|DESC|ASC|COUNT|SUM|AVG|MAX|MIN|CASE|WHEN|THEN|ELSE|END)\b/g;
  const tables   = /\b([A-Z][a-z_]+(?:_[a-z]+)*)\b(?=\s+(?:AS\s+\w+|\w+)?\s*(?:JOIN|ON|WHERE|GROUP|ORDER|INNER|LEFT|RIGHT|,|$))/g;
  const aliases  = /\b(t\d+|[a-z]{1,3})\./g;
  const funcs    = /\b(GETDATE|COALESCE|ISNULL|CAST|CONVERT|LEN|UPPER|LOWER|TRIM|ROUND|FLOOR|CEIL|ABS)\s*\(/g;
  const nums     = /\b(\d+(\.\d+)?)\b/g;

  return sql
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(keywords, '<span class="sql-kw">$1</span>')
    .replace(funcs,    '<span class="sql-fn">$1</span>(')
    .replace(aliases,  '<span class="sql-alias">$1</span>.')
    .replace(nums,     '<span class="sql-num">$1</span>');
}

function SqlSnippet({ sql }) {
  const [show, setShow] = useState(false);

  return (
    <div style={{ marginTop: "8px" }}>
      <button
        onClick={() => setShow(v => !v)}
        className="sql-toggle-btn"
      >
        {show ? "Hide SQL ▲" : "Show SQL ▼"}
      </button>
      {show && (
        <pre
          className="sql-block"
          dangerouslySetInnerHTML={{ __html: highlightSQL(sql) }}
        />
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
    { category: "Charts",        dot: "var(--accent)",  items: ["plot", "chart", "graph", "visualize", "bar chart", "pie chart", "line chart"] },
    { category: "Aggregation",   dot: "var(--green)",   items: ["top", "highest", "lowest", "average", "total", "count", "sum", "max", "min"] },
    { category: "Listing",       dot: "var(--amber)",   items: ["show", "list", "display", "give me", "fetch", "get me"] },
    { category: "Summary",       dot: "var(--accent2)", items: ["summary", "summarize", "overview", "analyze"] },
    { category: "JOIN",          dot: "var(--accent3)", items: ["join X to Y", "combine X and Y", "merge X with Y"] },
    { category: "DB Info",       dot: "var(--accent)",  items: ["what tables", "schema of", "columns in", "describe", "how many tables", "db size"] },
    { category: "Follow-up",     dot: "var(--accent2)", items: ["their", "these", "those", "them", "now show", "also show", "filter", "sort", "add", "include"] },
    { category: "🚫 Blocked",   dot: "var(--red)",     items: ["alter", "delete", "drop", "insert", "update", "truncate"] },
  ];

  const bg = "var(--surface2)";
  const border = "var(--border2)";
  const titleColor = "var(--text)";
  const categoryColor = "var(--muted2)";
  const tagBg = "var(--surface3)";
  const tagColor = "var(--text)";
  const footerColor = "var(--muted)";
  const footerBorder = "var(--border2)";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setShow(v => !v)}
        className={"keyword-btn" + (show ? " active" : "")}
      >
        💡 Keywords
      </button>

      {show && (
        <div style={{
          position: "absolute",
          top: "42px",
          right: "0",
          width: "300px",
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: "12px",
          padding: "14px",
          zIndex: 9999,
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
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
            <div key={i} style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: categoryColor, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: group.dot, display: "inline-block", flexShrink: 0 }} />
                {group.category}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {group.items.map((kw, j) => (
                  <span key={j} style={{
                    background: group.category.includes("Blocked") ? "rgba(239,68,68,0.08)" : tagBg,
                    color: group.category.includes("Blocked") ? "rgba(248,113,113,0.5)" : tagColor,
                    border: group.category.includes("Blocked") ? "1px solid rgba(248,113,113,0.2)" : "1px solid var(--border)",
                    borderRadius: "5px",
                    padding: "3px 8px",
                    fontSize: "11px",
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: group.category.includes("Blocked") ? "not-allowed" : "default",
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
  const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "dark";
  });
  const darkMode = theme === "dark" || theme === "cyber";

  // ── Model selection ──
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem("selectedModel") || "ollama";
  });
  const [modelToast, setModelToast] = useState(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Persist model choice
  React.useEffect(() => {
    localStorage.setItem("selectedModel", selectedModel);
  }, [selectedModel]);

  function switchModel(modelId) {
    if (modelId === selectedModel) return;
    setSelectedModel(modelId);
    const label = modelId === "groq" ? "⚡ Groq Cloud (llama-3.3-70b)" : "🖥️ Ollama Local (llama3)";
    setModelToast(label);
    setTimeout(() => setModelToast(null), 2500);
  }

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

  const [tableName, setTableName] = useState("__all__");
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
    authFetch(`${API}/history`)
      .then(res => res.json())
      .then(data => {
        if (data.chats && data.chats.length > 0) {
          // Normalize messages — handle both table_data and tableData
          const normalized = data.chats.map(chat => ({
            ...chat,
            loading: false,
            messages: (chat.messages || []).map(m => ({
              ...m,
              tableData: m.tableData || m.table_data || null,
              chartSuggestion: m.chartSuggestion || null,
              isJoin: m.isJoin || false,
              joinKey: m.joinKey || null,
            }))
          }));
          setChats(normalized);
          setActiveChatId(normalized[0].id);
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
      authFetch(`${API}/history/save`, {
        method: "POST",
        body: JSON.stringify({
          chat_id: String(chat.id),
          chat_title: chat.title,
          messages: chat.messages.map(m => ({
            sender: m.sender,
            text: m.text || "",
            tableData: m.tableData || m.table_data || null,
            chart: m.chart || null,
            chartSuggestion: m.chartSuggestion || null,
            isJoin: m.isJoin || false,
            joinKey: m.joinKey || null,
          }))
        })
      }).catch(() => {});
    });
  }, [chats]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    // keep body.dark for any legacy CSS
    document.body.classList.toggle("dark", theme === "dark" || theme === "cyber");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    authFetch(`${API}/tables`)
      .then(res => res.json())
      .then(data => {
        setTables(data.tables);
        setDbInfo(data);
        // Auto-activate Full DB mode on login
        authFetch(`${API}/clear-table`, { method: "POST" }).catch(() => {});
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
      const res = await authFetch(`${API}/upload`, {
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
        await authFetch(`${API}/clear-table`, { method: "POST" });
        setUploadStatus("✅ Full DB Mode — all tables active. Ask anything!");
      } catch {
        setUploadStatus("✅ Full DB Mode active");
      }
      return;
    }

    try {
      const res = await authFetch(`${API}/load-table/${tableName}`);
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
        ? `${API}/join`
        : `${API}/chat`;

      const res = await authFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          message: currentInput,
          model: selectedModel,
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
          authFetch(`${API}/history/delete`, {
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
          authFetch(`${API}/history/clear`, {
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
          <div className="topbar-left">
            <div className="topbar-title">SQL Assistant</div>
          </div>
          <div className="topbar-right">
            {/* Theme Switcher */}
            <div className="theme-switcher">
              {[
                { id: "dark",   icon: "🌑", label: "Dark"   },
                { id: "light",  icon: "☀️", label: "Light"  },
                { id: "cyber",  icon: "⚡", label: "Cyber"  },
                { id: "purple", icon: "🌸", label: "Purple" },
              ].map(t => (
                <button
                  key={t.id}
                  className={"theme-btn" + (theme === t.id ? " active" : "")}
                  data-t={t.id}
                  data-label={t.label}
                  onClick={() => setTheme(t.id)}
                >
                  {t.icon}
                </button>
              ))}
            </div>
            {/* Keywords button */}
            <InfoTooltip darkMode={darkMode} />
            {/* Avatar */}
            {authUser && (
              <div className="avatar">{(authUser.username || "U")[0].toUpperCase()}</div>
            )}
          </div>
        </header>

        {/* Chat Window */}
        <div className="chat-window" ref={chatWindowRef} onScroll={handleScroll}>

          {activeChat?.messages.length === 0 && (
            <div className="empty">
              <div className="empty-title">Upload data and start chatting 👇</div>
              <div className="join-hint-card">
                <div className="join-hint-heading">💡 Try JOIN queries:</div>
                <ul className="join-hint-list">
                  <li>join Orders to Customers</li>
                  <li>join Order_items with Products</li>
                  <li>combine Orders and Customers</li>
                  <li>merge Products with Categories</li>
                </ul>
              </div>
            </div>
          )}

          {activeChat?.messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.sender}`}>
              {/* Avatar */}
              {msg.sender === "bot" && (
                <div className="msg-avatar bot-avatar">
                  <span>⚡</span>
                </div>
              )}
              {msg.sender === "user" && authUser && (
                <div className="msg-avatar user-avatar">
                  {(authUser.username || "U")[0].toUpperCase()}
                </div>
              )}

              <div className="msg-col">
                {/* Timestamp + sender name — OUTSIDE bubble */}
                <div className="msg-meta">
                  {msg.sender === "user" ? (
                    <>
                      <span className="msg-time">{new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</span>
                      <span className="msg-sender">{authUser?.username || "You"}</span>
                    </>
                  ) : (
                    <>
                      <span className="msg-sender">GenAI Assistant</span>
                      <span className="msg-time">{new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</span>
                    </>
                  )}
                </div>

              <div className={`message ${msg.sender}`}>

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

              </div>{/* end .message */}
              </div>{/* end .msg-col */}
            </div>
          ))}

          {activeChat?.loading && (
            <div className="message-wrapper bot">
              <div className="msg-avatar bot-avatar"><span>⚡</span></div>
              <div className="msg-col">
                <div className="msg-meta">
                  <span className="msg-sender">GenAI Assistant</span>
                  <span className="msg-time">now</span>
                </div>
                <div className="message bot thinking-bubble">
                  <div className="thinking-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
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
        {/* Input Bar */}
        <div className="input-bar" style={{ flexDirection: "column", alignItems: "stretch", gap: "8px" }}>

          {/* Top row: input + send */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="text"
              placeholder='Ask a question or try "join Orders to Customers"...'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button
              className="chat-send-btn"
              onClick={sendMessage}
              disabled={activeChat?.loading}
            >
              ➤
            </button>
          </div>

          {/* Bottom row: Claude.ai style model pill + dropdown */}
          <div style={{ position: "relative", display: "inline-block", paddingLeft: "4px" }}>

            {/* Pill trigger button */}
            <button
              onClick={() => setShowModelDropdown(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "5px 14px 5px 10px",
                borderRadius: "20px",
                border: "1px solid var(--border2)",
                background: "transparent",
                color: "var(--text)",
                fontSize: "13px", fontWeight: 600,
                fontFamily: "Syne, sans-serif",
                cursor: "pointer", transition: "all 0.2s",
              }}
            >
              <span>{selectedModel === "groq" ? "⚡" : "🖥️"}</span>
              <span>{selectedModel === "groq" ? "Groq" : "Ollama"}</span>
              <span style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 500 }}>
                {selectedModel === "groq" ? "Cloud · Fast" : "Local"}
              </span>
              <span style={{ fontSize: "10px", color: "var(--muted)", marginLeft: "2px" }}>▾</span>
            </button>

            {/* Dropdown popup — Claude.ai style */}
            {showModelDropdown && (
              <>
                {/* Backdrop to close */}
                <div
                  onClick={() => setShowModelDropdown(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 998 }}
                />
                <div style={{
                  position: "absolute",
                  bottom: "calc(100% + 10px)",
                  left: 0,
                  zIndex: 999,
                  background: "var(--surface)",
                  border: "1px solid var(--border2)",
                  borderRadius: "16px",
                  padding: "8px",
                  minWidth: "260px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}>
                  <p style={{ fontSize: "11px", color: "var(--muted)", padding: "6px 10px 4px", margin: 0, fontWeight: 600, letterSpacing: "0.05em" }}>
                    SELECT MODEL
                  </p>

                  {[
                    { id: "ollama", icon: "🖥️", label: "Ollama (Local)", sub: "Llama3 · Runs on your PC", free: true },
                    { id: "groq",   icon: "⚡", label: "Groq Cloud",      sub: "llama-3.3-70b · Ultra fast", free: true },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => { switchModel(m.id); setShowModelDropdown(false); }}
                      style={{
                        width: "100%", display: "flex", alignItems: "center",
                        gap: "12px", padding: "10px 12px", borderRadius: "10px",
                        border: "none", background: selectedModel === m.id ? "var(--hover)" : "transparent",
                        color: "var(--text)", cursor: "pointer", textAlign: "left",
                        transition: "background 0.15s",
                      }}
                    >
                      <span style={{ fontSize: "20px" }}>{m.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: 700, fontFamily: "Syne, sans-serif" }}>
                          {m.label}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "1px" }}>
                          {m.sub}
                        </div>
                      </div>
                      {selectedModel === m.id && (
                        <span style={{ color: "var(--accent)", fontSize: "16px" }}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>

        {/* Model Switch Toast */}
        {modelToast && (
          <div style={{
            position: "fixed",
            bottom: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--surface)",
            border: "1px solid var(--accent)",
            borderRadius: "12px",
            padding: "10px 20px",
            fontSize: "14px",
            fontWeight: 700,
            color: "var(--accent)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            animation: "fadeUp 0.3s ease",
            whiteSpace: "nowrap",
          }}>
            ✅ Switched to {modelToast}
          </div>
        )}

      </main>

    </div>
  );
}

export default App;