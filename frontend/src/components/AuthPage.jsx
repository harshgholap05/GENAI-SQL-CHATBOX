import React, { useState } from "react";

function AuthPage({ onLogin, darkMode }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const bg = darkMode ? "#0f172a" : "#f1f5f9";
  const cardBg = darkMode ? "#1e293b" : "#ffffff";
  const textColor = darkMode ? "#f1f5f9" : "#1e293b";
  const subColor = darkMode ? "#94a3b8" : "#64748b";
  const inputBg = darkMode ? "#0f172a" : "#f8fafc";
  const inputBorder = darkMode ? "#334155" : "#e2e8f0";

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    const endpoint = mode === "login" ? "/login" : "/register";
    const payload = mode === "login"
      ? { email: form.email, password: form.password }
      : { username: form.username, email: form.email, password: form.password };

    try {
      const res = await fetch(`http://localhost:8000${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.detail || "Something went wrong";
        if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exist")) {
          setError("This email is already registered. Please sign in instead.");
        } else {
          setError(msg);
        }
      } else if (mode === "register") {
        // Show success message then redirect to login
        setSuccess(`✅ Account created successfully! Welcome, ${data.username}. Please sign in.`);
        setForm({ username: "", email: "", password: "" });
        setTimeout(() => {
          setMode("login");
          setSuccess("");
        }, 2500);
      } else {
        localStorage.setItem("token", data.token);
        localStorage.setItem("username", data.username);
        localStorage.setItem("email", data.email);
        onLogin({ token: data.token, username: data.username, email: data.email });
      }
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{
        background: cardBg,
        borderRadius: "16px",
        padding: "40px",
        width: "100%",
        maxWidth: "400px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ fontSize: "32px", marginBottom: "6px" }}>⚡</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: textColor }}>GenAI SQL Assistant</div>
          <div style={{ fontSize: "13px", color: subColor, marginTop: "4px" }}>
            {mode === "login" ? "Sign in to your account" : "Create a new account"}
          </div>
        </div>

        {/* Toggle */}
        <div style={{
          display: "flex",
          background: inputBg,
          borderRadius: "10px",
          padding: "4px",
          marginBottom: "24px",
          border: `1px solid ${inputBorder}`,
        }}>
          {["login", "register"].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(""); }}
              style={{
                flex: 1, padding: "8px", borderRadius: "8px", border: "none",
                cursor: "pointer", fontWeight: 600, fontSize: "13px",
                background: mode === m ? "#4f46e5" : "transparent",
                color: mode === m ? "#fff" : subColor,
                transition: "all 0.2s"
              }}>
              {m === "login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {mode === "register" && (
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: subColor, display: "block", marginBottom: "6px" }}>
                Username
              </label>
              <input
                placeholder="Your name"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: "8px",
                  border: `1px solid ${inputBorder}`, background: inputBg,
                  color: textColor, fontSize: "14px", outline: "none",
                  boxSizing: "border-box"
                }}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: subColor, display: "block", marginBottom: "6px" }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: "8px",
                border: `1px solid ${inputBorder}`, background: inputBg,
                color: textColor, fontSize: "14px", outline: "none",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: subColor, display: "block", marginBottom: "6px" }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: "8px",
                border: `1px solid ${inputBorder}`, background: inputBg,
                color: textColor, fontSize: "14px", outline: "none",
                boxSizing: "border-box"
              }}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginTop: "14px", padding: "10px 14px",
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: "8px", color: "#dc2626", fontSize: "13px"
          }}>
            ❌ {error}
            {error.includes("already registered") && (
              <span
                onClick={() => { setMode("login"); setError(""); }}
                style={{ marginLeft: "6px", color: "#4f46e5", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}
              >
                Sign In →
              </span>
            )}
          </div>
        )}

        {/* Success */}
        {success && (
          <div style={{
            marginTop: "14px", padding: "10px 14px",
            background: "#f0fdf4", border: "1px solid #bbf7d0",
            borderRadius: "8px", color: "#16a34a", fontSize: "13px",
            fontWeight: 500
          }}>
            {success}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%", marginTop: "20px", padding: "12px",
            background: loading ? "#a5b4fc" : "#4f46e5",
            color: "white", border: "none", borderRadius: "10px",
            fontWeight: 700, fontSize: "15px", cursor: loading ? "not-allowed" : "pointer",
            transition: "all 0.2s"
          }}
        >
          {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
        </button>

        <div style={{ textAlign: "center", marginTop: "16px", fontSize: "12px", color: subColor }}>
          {mode === "login"
            ? <>Don't have an account? <span onClick={() => { setMode("register"); setError(""); }} style={{ color: "#4f46e5", cursor: "pointer", fontWeight: 600 }}>Register</span></>
            : <>Already have an account? <span onClick={() => { setMode("login"); setError(""); }} style={{ color: "#4f46e5", cursor: "pointer", fontWeight: 600 }}>Sign In</span></>
          }
        </div>
      </div>
    </div>
  );
}

export default AuthPage;