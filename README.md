```markdown
<div align="center">

# 🧠 GenAI Data Agent

An AI-powered full-stack web application that lets users upload datasets or connect to a live Microsoft SQL Server database and analyze data through natural language conversation.

*Unlike static demos with hardcoded data, this system dynamically adapts to any uploaded file or database, auto-detects table relationships, generates SQL queries, executes them safely, and visualizes results intelligently.*

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)]()
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)]()
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)]()
[![SQL Server](https://img.shields.io/badge/SQL_Server-CC2927?style=for-the-badge&logo=microsoft-sql-server&logoColor=white)]()
[![Ollama](https://img.shields.io/badge/Ollama-White?style=for-the-badge&logo=ollama&logoColor=black)]()

</div>

---

## 🚀 Key Features

### 📁 Data Sources
- **Upload CSV / XLSX files**
- **Connect to Microsoft SQL Server**
- Dynamically load any database table
- Schema-aware query generation — no hardcoded columns ever

### 💬 Conversational AI Interface
- Ask questions in plain natural language
- AI automatically generates valid SQL Server queries
- Context-aware responses with markdown rendering
- Multi-chat support with persistent chat history
- ChatGPT-style sidebar with per-chat sessions
- Each chat has its own loading state and message history

### 🔐 Authentication System

**Registration with Email OTP Verification**
- User registers with username, email, password
- A **6-digit OTP is sent to the user's email** via Gmail SMTP (blue-themed HTML email)
- OTP screen with 6 individual input boxes — auto-focus on next box, paste support, 30s resend timer
- Account is created in SQL Server **only after OTP is verified** — no unverified users stored
- Duplicate email detection happens before OTP is sent
- OTP expires in **10 minutes** — resend generates a fresh OTP

<div align="center">
  <img width="449" height="471" alt="image" src="https://github.com/user-attachments/assets/12f7f953-1901-443c-939d-8204bf8a7398" />
</div>

> ✅ **Email received looks like:**
> ```text
> Subject: Your GenAI SQL Assistant Verification Code
>
> Hi Harsh, verify your email to activate your account.
> ┌─────────────────────────┐
> │  Your verification code │
> │       4 8 2 1 9 3       │  ← 6-digit OTP
> └─────────────────────────┘
> This code expires in 10 minutes.
> ```

**Login**
- Email + password login with JWT Bearer token
- Token stored in `localStorage` — persists across reloads
- `last_login` updated in SQL Server on every successful login

<div align="center">
  <img src="https://github.com/user-attachments/assets/3413a971-990b-4e84-84f2-76e881953b3d" alt="Login Screen" />
</div>

**Forgot Password Flow (OTP-based)**
- "Forgot password?" link on login page — pre-fills email if already typed
- A **6-digit OTP is sent to the user's email** (orange-themed HTML email, separate from registration OTP)
- User enters OTP → verified → new password screen appears
- On submit: `hashed_password` is **automatically updated in SQL Server** via `UPDATE Users SET hashed_password`
- Auto-redirect to login page after successful reset
- Security best practice: email existence is never revealed in the response

> ✅ **Email received looks like:**
> ```text
> Subject: Reset Your GenAI SQL Assistant Password
>
> Hi Harsh, you requested a password reset.
> ┌─────────────────────────────┐
> │  Your password reset code   │
> │       7 3 9 1 4 6           │  ← 6-digit OTP (orange theme)
> └─────────────────────────────┘
> This code expires in 10 minutes.
> ```

> ✅ **SQL Server update on reset:**
> ```sql
> UPDATE Users
> SET hashed_password = '<bcrypt_hash>'
> WHERE email = 'user@example.com'
> AND auth_provider = 'local'
> ```

**JWT Authentication**
- All API endpoints protected with `Bearer` token
- `ACCESS_TOKEN_EXPIRE_HOURS = 24`
- Token decoded via `python-jose` on every request

**Admin Panel** (`/admin/*` — admin email only)
- `GET /admin/users` — list all users (password hidden)
- `POST /admin/reset-password` — reset any user's password
- `DELETE /admin/delete-user` — delete a user (admin account protected)

---

### 🔗 Intelligent JOIN Engine (Auto-Relationship Detection)

This is the core intelligence of the system. The JOIN engine automatically detects how tables relate to each other using a 3-strategy pipeline — **no hardcoding, no manual configuration needed**.

1. **Strategy 1 — Foreign Key Detection (`sys.foreign_keys`)**
   - Queries actual FK constraints defined in SQL Server. Most reliable.
2. **Strategy 2 — Column Name Matching**
   - If no FK exists, scans column names across both tables (exact match, strip underscores, partial suffix match).
3. **Strategy 3 — Full DB Column Scan (`INFORMATION_SCHEMA.COLUMNS`)**
   - `enforce_schema` validates all column references against every column in the entire database.

**Multi-step JOIN Chain Builder (`build_join_chain`)**
- Automatically builds the longest connected chain of joinable tables.
- Supports 2, 3, 4, and 5-table JOINs automatically.
- Frontend shows: 🔗 **5-Table JOIN** badge with full chain visualization.

**No Table Selected → Full DB Mode (`generate_sql_all_tables`)**
- When no table is loaded, the system provides the LLM with all table schemas dynamically and all actual FK relationships. No hardcoding — works with any database structure automatically.

**Join All Tables (`_join_all_tables_sql`)**
- Trigger phrases: `join all`, `all tables`, `show everything`, `full database`, etc.
- Builds SQL directly from FK relationships — no LLM, no truncation.

<details>
<summary><b>View JOIN Syntax Examples</b></summary>

**Explicit JOIN syntax:**
```text
join Orders to Customers
join Order_items to Products
join Products to Categories
join orders, products, order_items and categories
```

**Natural language (auto-detected):**
```text
show customer name with product name they ordered
show full order details with customer name and category
which customer ordered the most
show category name with total quantity ordered
```
</details>

---

### 🗄️ System Tables Exclusion
- `SYSTEM_TABLES = ["Users", "ChatHistory", "ChangeLog"]` — defined once, applied everywhere.
- LLM prompts explicitly instructed to never use system tables.

### 📊 Smart Visualization Engine
- **Auto chart suggestion** — AI analyzes actual result data and suggests the best chart (e.g., *"📊 Comparing prices across products"*).
- **Zero hallucination** — column names validated against actual DataFrame before suggesting.
- Supports: Bar charts, Line charts, Pie charts.
- **⬇️ Download PNG** — each chart downloadable as PNG with white background + data labels.

### 📤 Export Results
- **⬇️ CSV** — one-click export of any result table to `.csv`.
- **📊 Excel** — one-click export to `.xlsx` with auto column widths via SheetJS.

### 🧠 AI SQL Agent (Local LLM)
- Uses **Llama3 via Ollama** — fully local, no external API, no cost.
- Generates valid Microsoft SQL Server syntax and warms up automatically on startup.

### 🛡️ SQL Safety & Correction Pipeline
Every generated SQL passes through these steps in order:

| Step | Function | What it does |
|:---:|:---|:---|
| 1 | `clean_sql_output` | Strips markdown fences, extracts pure SQL, fixes double SELECT |
| 2 | `fix_top_position` | Moves TOP clause to correct position after SELECT |
| 3 | `fix_bracket_dot_notation` | Fixes `[Table].[Col]` → `alias.[Col]` |
| 4 | `fix_missing_from` | Adds missing FROM clause if LLM omitted it |
| 5 | `convert_limit_to_top` | Converts MySQL LIMIT → SQL Server TOP |
| 6 | `enforce_schema` | Validates all `[column]` refs against full DB schema |
| 7 | `is_safe_sql` | Blocks INSERT, UPDATE, DELETE, DROP, ALTER, EXEC, TRUNCATE |

### 🧠 RAG Contextual Memory
- Last 6 messages used as context for follow-up questions.
- Pronoun detection: `their`, `these`, `those`, `them` → resolved to actual subject.
- 7-guard rejection system — rejects SQL, explanations, proper names, too-long or unchanged resolves.

---

## 🎨 Themes & UI Features

**Multiple Mode (Dark, Light, Cyber, Purple)**
One-click toggle in topbar (🌙 Dark / ☀️ Light/ ⚡ Cyber/ 🌸 Purple). Preference saved in `localStorage`.

| 🌙 Dark Mode | ☀️ Light Mode |
|:---:|:---:|
| <img src="https://github.com/user-attachments/assets/6b456377-dfcb-4bbf-a304-bfae9bc543e6" width="300"/> | <img src="https://github.com/user-attachments/assets/b7d5971b-c999-4f23-9830-b6f2a65d6f4a" width="300"/> |

| ⚡ Cyber Mode | 🌸 Purple Mode |
|:---:|:---:|
| <img src="https://github.com/user-attachments/assets/7b4c2923-53df-42c0-87b3-95cfcfa59b4f" width="300"/> | <img src="https://github.com/user-attachments/assets/6e80b3d9-5a3e-41e2-b3e6-b49999fdc055" width="300"/> |

### 📱 Persistent Chat History
All chats auto-saved to **SQL Server** (`ChatHistory` table) on every message. Fully restored on page reload.

### 🗂️ Collapsible Sidebar & Auto-Scroll
- Sidebar collapses to slim 48px rail with a smooth `0.25s` animation.
- A **↓ purple button** appears to smoothly scroll to the latest message.

### 📊 Result Table UI
- Horizontal scroll inside message bubble.
- `table-scroll-wrapper` CSS class with sticky header row.

---

## 🏗️ Tech Stack

**Frontend**
`React (Vite)` `Chart.js` `SheetJS` `react-markdown`

**Backend**
`FastAPI` `Pandas` `SQLAlchemy` `PyODBC` `Ollama (Llama3)` `Microsoft SQL Server` `JWT` `bcrypt`

---

## ⚙️ Setup Instructions

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/harshgholap05/GENAI-SQL-CHATBOX-
cd genai-sql-app
```

### 2️⃣ Install & Setup Ollama (Required)
Install from: https://ollama.com
```bash
ollama pull llama3
ollama run llama3
```
*Keep Ollama running in the background before starting the backend.*

### 3️⃣ Backend Setup
```bash
pip install -r requirements.txt
```
Create a `.env` file in the root directory:
```env
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password
```
Update database config in `main.py`:
```python
DB_SERVER = "YOUR_SERVER_NAME"
DB_NAME   = "YOUR_DATABASE_NAME"
ADMIN_EMAIL = "your_admin_email@gmail.com"
```
Run the server:
```bash
uvicorn main:app --reload
```
*Backend: `http://localhost:8000` | Swagger Docs: `http://localhost:8000/docs`*

### 4️⃣ SQL Server — Required Tables
Run these in SQL Server to create the auth + history tables:
```sql
CREATE TABLE Users (
    id INT IDENTITY PRIMARY KEY,
    username NVARCHAR(100),
    email NVARCHAR(255) UNIQUE,
    hashed_password NVARCHAR(255),
    auth_provider NVARCHAR(50) DEFAULT 'local',
    created_at DATETIME DEFAULT GETDATE(),
    last_login DATETIME
);

CREATE TABLE ChatHistory (
    id INT IDENTITY PRIMARY KEY,
    user_email NVARCHAR(255),
    chat_id NVARCHAR(100),
    chat_title NVARCHAR(255),
    messages NVARCHAR(MAX),
    updated_at DATETIME DEFAULT GETDATE()
);

CREATE TABLE ChangeLog (
    id INT IDENTITY PRIMARY KEY,
    changed_by NVARCHAR(255),
    change_type NVARCHAR(100),
    change_detail NVARCHAR(MAX),
    changed_at DATETIME DEFAULT GETDATE()
);
```

### 5️⃣ Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Frontend: `http://localhost:5173`*

---

## 🔮 Feature Status

| Feature | Status |
|:---|:---:|
| Persistent chat history (SQL Server) & Dark/Light mode toggle | ✅ Done |
| Multi-step JOIN chain (2-5 tables) & FK detection | ✅ Done |
| Auto chart suggestion (zero hallucination) & Download PNG | ✅ Done |
| SQL correction pipeline (7 steps) & Unsafe SQL blocking | ✅ Done |
| Export results to CSV / Excel | ✅ Done |
| Authentication system (SQL Server + Local JWT) | ✅ Done |
| Forgot password with OTP reset flow | ✅ Done |
| RAG-based contextual memory & Follow-up questions | ✅ Done |

---

## 🎯 Purpose
This project demonstrates how a local LLM can be combined with live SQL Server databases, dynamic multi-table SQL generation, intelligent visualization, and a conversational UI. 

**This is not just a chatbot. It is a dynamic AI-powered data exploration engine.**
```
