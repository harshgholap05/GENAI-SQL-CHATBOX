import React, { useState, useRef, useEffect } from "react";
import API_URL from "../config";

// ---- Shared components — defined OUTSIDE AuthPage to prevent remount on render ----
const Card = ({ bg, cardBg, children }) => (
  <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={{ background: cardBg, borderRadius: "16px", padding: "40px", width: "100%", maxWidth: "400px", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
      {children}
    </div>
  </div>
);

function AuthPage({ onLogin, darkMode }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [pendingEmail, setPendingEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const otpRefs = useRef([]);

  const bg = darkMode ? "#0f172a" : "#f1f5f9";
  const cardBg = darkMode ? "#1e293b" : "#ffffff";
  const textColor = darkMode ? "#f1f5f9" : "#1e293b";
  const subColor = darkMode ? "#94a3b8" : "#64748b";
  const inputBg = darkMode ? "#0f172a" : "#f8fafc";
  const inputBorder = darkMode ? "#334155" : "#e2e8f0";

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: "8px",
    border: `1px solid ${inputBorder}`, background: inputBg,
    color: textColor, fontSize: "14px", outline: "none", boxSizing: "border-box"
  };

  const resetOtp = () => {
    setOtp(["", "", "", "", "", ""]);
    setTimeout(() => otpRefs.current[0]?.focus(), 100);
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === "Enter") mode === "otp" ? handleVerifyOtp() : handleVerifyResetOtp();
  };

  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) { setOtp(pasted.split("")); otpRefs.current[5]?.focus(); }
  };

  const handleSubmit = async () => {
    setError(""); setLoading(true);
    const endpoint = mode === "login" ? "/login" : "/register";
    const payload = mode === "login"
      ? { email: form.email, password: form.password }
      : { username: form.username, email: form.email, password: form.password };
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.detail || "Something went wrong";
        if (msg.toLowerCase().includes("already registered")) {
          setError("This email is already registered. Please sign in instead.");
        } else { setError(msg); }
      } else if (mode === "register") {
        setPendingEmail(form.email);
        setMode("otp"); resetOtp(); setResendTimer(30);
      } else {
        localStorage.setItem("token", data.token);
        localStorage.setItem("username", data.username);
        localStorage.setItem("email", data.email);
        onLogin({ token: data.token, username: data.username, email: data.email });
      }
    } catch { setError("Cannot connect to server"); }
    finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    const otpValue = otp.join("");
    if (otpValue.length < 6) { setError("Please enter the complete 6-digit OTP"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/verify-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, otp: otpValue }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Invalid OTP"); resetOtp(); }
      else {
        localStorage.setItem("token", data.token);
        localStorage.setItem("username", data.username);
        localStorage.setItem("email", data.email);
        onLogin({ token: data.token, username: data.username, email: data.email });
      }
    } catch { setError("Cannot connect to server"); }
    finally { setLoading(false); }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/resend-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Failed to resend OTP"); }
      else { setSuccess("✅ New OTP sent!"); resetOtp(); setResendTimer(30); setTimeout(() => setSuccess(""), 3000); }
    } catch { setError("Cannot connect to server"); }
    finally { setLoading(false); }
  };

  const handleForgotPassword = async () => {
    if (!pendingEmail.trim()) { setError("Please enter your email"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/forgot-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Something went wrong"); }
      else { setMode("forgot-otp"); resetOtp(); setResendTimer(30); }
    } catch { setError("Cannot connect to server"); }
    finally { setLoading(false); }
  };

  const handleVerifyResetOtp = async () => {
    const otpValue = otp.join("");
    if (otpValue.length < 6) { setError("Please enter the complete 6-digit OTP"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/verify-reset-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, otp: otpValue }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Invalid OTP"); resetOtp(); }
      else { setMode("new-password"); setError(""); }
    } catch { setError("Cannot connect to server"); }
    finally { setLoading(false); }
  };

  const handleResendResetOtp = async () => {
    if (resendTimer > 0) return;
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/forgot-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      if (res.ok) { setSuccess("✅ New OTP sent!"); resetOtp(); setResendTimer(30); setTimeout(() => setSuccess(""), 3000); }
    } catch { setError("Cannot connect to server"); }
    finally { setLoading(false); }
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim()) { setError("Please enter a new password"); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/reset-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Failed to reset password"); }
      else {
        setSuccess("✅ Password reset successfully!");
        setTimeout(() => { setMode("login"); setSuccess(""); setNewPassword(""); setConfirmPassword(""); }, 2000);
      }
    } catch { setError("Cannot connect to server"); }
    finally { setLoading(false); }
  };

  // ---- Reusable inline UI ----
  const errorBox = error ? (
    <div style={{ marginTop: "14px", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#dc2626", fontSize: "13px" }}>
      ❌ {error}
      {error.includes("already registered") && (
        <span onClick={() => { setMode("login"); setError(""); }} style={{ marginLeft: "6px", color: "#4f46e5", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>Sign In →</span>
      )}
    </div>
  ) : null;

  const successBox = success ? (
    <div style={{ marginTop: "14px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", color: "#16a34a", fontSize: "13px", fontWeight: 500 }}>{success}</div>
  ) : null;

  const otpBoxes = (
    <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginBottom: "24px" }}>
      {otp.map((digit, i) => (
        <input key={i} ref={el => otpRefs.current[i] = el}
          type="text" inputMode="numeric" maxLength={1} value={digit}
          onChange={e => handleOtpChange(i, e.target.value)}
          onKeyDown={e => handleOtpKeyDown(i, e)}
          onPaste={i === 0 ? handleOtpPaste : undefined}
          style={{
            width: "46px", height: "54px", textAlign: "center",
            fontSize: "22px", fontWeight: 700, borderRadius: "10px",
            border: `2px solid ${digit ? "#4f46e5" : inputBorder}`,
            background: inputBg, color: textColor, outline: "none", transition: "border-color 0.2s"
          }} />
      ))}
    </div>
  );

  const primaryBtn = (label, onClick, disabled = false) => (
    <button onClick={onClick} disabled={disabled || loading}
      style={{ width: "100%", marginTop: "14px", padding: "12px", background: disabled || loading ? "#a5b4fc" : "#4f46e5", color: "white", border: "none", borderRadius: "10px", fontWeight: 700, fontSize: "15px", cursor: disabled || loading ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
      {loading ? "Please wait..." : label}
    </button>
  );

  // ============ OTP Screen (Register) ============
  if (mode === "otp") return (
    <Card bg={bg} cardBg={cardBg}>
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <div style={{ fontSize: "40px", marginBottom: "8px" }}>📧</div>
        <div style={{ fontSize: "20px", fontWeight: 700, color: textColor }}>Verify your email</div>
        <div style={{ fontSize: "13px", color: subColor, marginTop: "6px" }}>We sent a 6-digit code to</div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "#4f46e5", marginTop: "2px" }}>{pendingEmail}</div>
      </div>
      {otpBoxes}
      {errorBox}{successBox}
      {primaryBtn("Verify Email ✓", handleVerifyOtp, otp.join("").length < 6)}
      <div style={{ textAlign: "center", marginTop: "14px", fontSize: "13px", color: subColor }}>
        Didn't receive the code?{" "}
        <span onClick={handleResendOtp} style={{ color: resendTimer > 0 ? subColor : "#4f46e5", cursor: resendTimer > 0 ? "default" : "pointer", fontWeight: 600 }}>
          {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
        </span>
      </div>
      <div style={{ textAlign: "center", marginTop: "10px", fontSize: "12px" }}>
        <span onClick={() => { setMode("register"); setError(""); }} style={{ color: "#4f46e5", cursor: "pointer", fontWeight: 600 }}>← Back to Register</span>
      </div>
    </Card>
  );

  // ============ Forgot — Enter Email ============
  if (mode === "forgot") return (
    <Card bg={bg} cardBg={cardBg}>
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <div style={{ fontSize: "40px", marginBottom: "8px" }}>🔑</div>
        <div style={{ fontSize: "20px", fontWeight: 700, color: textColor }}>Forgot Password?</div>
        <div style={{ fontSize: "13px", color: subColor, marginTop: "6px" }}>Enter your registered email — we'll send a reset code</div>
      </div>
      <label style={{ fontSize: "12px", fontWeight: 600, color: subColor, display: "block", marginBottom: "6px" }}>Email</label>
      <input type="email" placeholder="you@example.com" value={pendingEmail}
        onChange={e => setPendingEmail(e.target.value)}
        onKeyDown={e => e.key === "Enter" && handleForgotPassword()}
        style={inputStyle} />
      {errorBox}{successBox}
      {primaryBtn("Send Reset Code →", handleForgotPassword)}
      <div style={{ textAlign: "center", marginTop: "14px", fontSize: "12px" }}>
        <span onClick={() => { setMode("login"); setError(""); setPendingEmail(""); }} style={{ color: "#4f46e5", cursor: "pointer", fontWeight: 600 }}>← Back to Sign In</span>
      </div>
    </Card>
  );

  // ============ Forgot — Verify OTP ============
  if (mode === "forgot-otp") return (
    <Card bg={bg} cardBg={cardBg}>
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <div style={{ fontSize: "40px", marginBottom: "8px" }}>🔐</div>
        <div style={{ fontSize: "20px", fontWeight: 700, color: textColor }}>Enter Reset Code</div>
        <div style={{ fontSize: "13px", color: subColor, marginTop: "6px" }}>We sent a 6-digit code to</div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "#ea580c", marginTop: "2px" }}>{pendingEmail}</div>
      </div>
      {otpBoxes}
      {errorBox}{successBox}
      {primaryBtn("Verify Code ✓", handleVerifyResetOtp, otp.join("").length < 6)}
      <div style={{ textAlign: "center", marginTop: "14px", fontSize: "13px", color: subColor }}>
        Didn't receive the code?{" "}
        <span onClick={handleResendResetOtp} style={{ color: resendTimer > 0 ? subColor : "#4f46e5", cursor: resendTimer > 0 ? "default" : "pointer", fontWeight: 600 }}>
          {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend Code"}
        </span>
      </div>
      <div style={{ textAlign: "center", marginTop: "10px", fontSize: "12px" }}>
        <span onClick={() => { setMode("forgot"); setError(""); }} style={{ color: "#4f46e5", cursor: "pointer", fontWeight: 600 }}>← Back</span>
      </div>
    </Card>
  );

  // ============ New Password ============
  if (mode === "new-password") return (
    <Card bg={bg} cardBg={cardBg}>
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <div style={{ fontSize: "40px", marginBottom: "8px" }}>🔒</div>
        <div style={{ fontSize: "20px", fontWeight: 700, color: textColor }}>Set New Password</div>
        <div style={{ fontSize: "13px", color: subColor, marginTop: "6px" }}>Choose a strong new password</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <label style={{ fontSize: "12px", fontWeight: 600, color: subColor, display: "block", marginBottom: "6px" }}>New Password</label>
          <input type="password" placeholder="••••••••" value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleResetPassword()}
            style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: "12px", fontWeight: 600, color: subColor, display: "block", marginBottom: "6px" }}>Confirm Password</label>
          <input type="password" placeholder="••••••••" value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleResetPassword()}
            style={inputStyle} />
        </div>
      </div>
      {errorBox}{successBox}
      {primaryBtn("Reset Password ✓", handleResetPassword)}
    </Card>
  );

  // ============ Login / Register ============
  return (
    <Card bg={bg} cardBg={cardBg}>
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <div style={{ fontSize: "32px", marginBottom: "6px" }}>⚡</div>
        <div style={{ fontSize: "22px", fontWeight: 700, color: textColor }}>GenAI SQL Assistant</div>
        <div style={{ fontSize: "13px", color: subColor, marginTop: "4px" }}>
          {mode === "login" ? "Sign in to your account" : "Create a new account"}
        </div>
      </div>

      <div style={{ display: "flex", background: inputBg, borderRadius: "10px", padding: "4px", marginBottom: "24px", border: `1px solid ${inputBorder}` }}>
        {["login", "register"].map(m => (
          <button key={m} onClick={() => { setMode(m); setError(""); setSuccess(""); }}
            style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "13px", background: mode === m ? "#4f46e5" : "transparent", color: mode === m ? "#fff" : subColor, transition: "all 0.2s" }}>
            {m === "login" ? "Sign In" : "Register"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {mode === "register" && (
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: subColor, display: "block", marginBottom: "6px" }}>Username</label>
            <input placeholder="Your name" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              style={inputStyle} />
          </div>
        )}
        <div>
          <label style={{ fontSize: "12px", fontWeight: 600, color: subColor, display: "block", marginBottom: "6px" }}>Email</label>
          <input type="email" placeholder="you@example.com" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: "12px", fontWeight: 600, color: subColor, display: "block", marginBottom: "6px" }}>Password</label>
          <input type="password" placeholder="••••••••" value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            style={inputStyle} />
          {mode === "login" && (
            <div style={{ textAlign: "right", marginTop: "6px" }}>
              <span onClick={() => { setMode("forgot"); setError(""); setPendingEmail(form.email); }}
                style={{ fontSize: "12px", color: "#4f46e5", cursor: "pointer", fontWeight: 600 }}>
                Forgot password?
              </span>
            </div>
          )}
        </div>
      </div>

      {errorBox}{successBox}

      {primaryBtn(mode === "login" ? "Sign In" : "Send Verification Code →", handleSubmit)}

      <div style={{ textAlign: "center", marginTop: "16px", fontSize: "12px", color: subColor }}>
        {mode === "login"
          ? <>Don't have an account? <span onClick={() => { setMode("register"); setError(""); }} style={{ color: "#4f46e5", cursor: "pointer", fontWeight: 600 }}>Register</span></>
          : <>Already have an account? <span onClick={() => { setMode("login"); setError(""); }} style={{ color: "#4f46e5", cursor: "pointer", fontWeight: 600 }}>Sign In</span></>
        }
      </div>
    </Card>
  );
}

export default AuthPage;