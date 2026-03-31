# 🧠 GenAI Data Agent

An AI-powered full-stack web application that lets users upload datasets or connect to a live Microsoft SQL Server database and analyze data through natural language conversation.

Unlike static demos with hardcoded data, this system dynamically adapts to any uploaded file or database, auto-detects table relationships, generates SQL queries, executes them safely, and visualizes results intelligently.

---

## 🚀 Key Features

### 📁 Data Sources
- Upload CSV / XLSX files
- Connect to Microsoft SQL Server
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

---

  <img width="449" height="471" alt="image" src="https://github.com/user-attachments/assets/12f7f953-1901-443c-939d-8204bf8a7398" />
  
---
> ✅ Email received looks like:
> ```
> Subject: Your GenAI SQL Assistant Verification Code
>
> Hi Harsh, verify your email to activate your account.
> ┌─────────────────────────┐
> │  Your verification code  │
> │       4 8 2 1 9 3        │  ← 6-digit OTP
> └─────────────────────────┘
> This code expires in 10 minutes.
> ```

**Login**
- Email + password login with JWT Bearer token
- Token stored in `localStorage` — persists across reloads
- `last_login` updated in SQL Server on every successful login

---
> ```
> ![WhatsApp Image 2026-03-31 at 3 07 26 PM](https://github.com/user-attachments/assets/3413a971-990b-4e84-84f2-76e881953b3d)
> ```
---

**Forgot Password Flow (OTP-based)**
- "Forgot password?" link on login page — pre-fills email if already typed
- A **6-digit OTP is sent to the user's email** (orange-themed HTML email, separate from registration OTP)
- User enters OTP → verified → new password screen appears
- On submit: `hashed_password` is **automatically updated in SQL Server** via `UPDATE Users SET hashed_password`
- Auto-redirect to login page after successful reset
- Security best practice: email existence is never revealed in the response

> ✅ Email received looks like:
> ```
> Subject: Reset Your GenAI SQL Assistant Password
>
> Hi Harsh, you requested a password reset.
> ┌─────────────────────────────┐
> │  Your password reset code   │
> │       7 3 9 1 4 6           │  ← 6-digit OTP (orange theme)
> └─────────────────────────────┘
> This code expires in 10 minutes.
> ```

> ✅ SQL Server update on reset:
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

### 🔗 Intelligent JOIN Engine (Auto-Relationship Detection)

This is the core intelligence of the system. The JOIN engine automatically detects how tables relate to each other using a 3-strategy pipeline — **no hardcoding, no manual configuration needed**.

**Strategy 1 — Foreign Key Detection (`sys.foreign_keys`)**
- Queries actual FK constraints defined in SQL Server
- Most reliable — uses the database's own relationship definitions
- Example: `Orders.Customer_id → Customers.customer_id`

**Strategy 2 — Column Name Matching**
- If no FK exists, scans column names across both tables
- Exact lowercase match first (e.g. `category_id = category_id`)
- Then strips underscores and compares (e.g. `orderid = order_id`)
- Then partial suffix match (e.g. `order_id` matches `orderitemid`)

**Strategy 3 — Full DB Column Scan (`INFORMATION_SCHEMA.COLUMNS`)**
- `enforce_schema` validates all column references against every column in the entire database
- Prevents false "invalid column" errors when querying across tables

**Multi-step JOIN Chain Builder (`build_join_chain`)**
- Automatically builds the longest connected chain of joinable tables
- Detects relationships by checking FK + column name matching between every table pair
- Example chain auto-detected: `Categories → Products → Order_items → Orders → Customers`
- Supports 2, 3, 4, and 5-table JOINs automatically
- Table names with spaces/underscores both matched (e.g. `order items` → `Order_items`)
- Frontend shows: 🔗 **5-Table JOIN** badge with full chain visualization

**No Table Selected → Full DB Mode (`generate_sql_all_tables`)**
- When no table is loaded, the system provides the LLM with:
  - All table schemas dynamically from `INFORMATION_SCHEMA`
  - All actual FK relationships from `sys.foreign_keys`
  - Explicit alias map: `t1 = [Orders]`, `t2 = [Customers]` etc.
- LLM decides which tables to query and how to JOIN them
- No hardcoding — works with any database structure automatically

**Join All Tables (`_join_all_tables_sql`)**
- Trigger phrases: `join all`, `all tables`, `show everything`, `full database`, etc.
- Builds SQL directly from FK relationships — no LLM, no truncation
- BFS chain from most-referenced (root) table
- Returns `SELECT TOP 100 *` across all data tables

**Explicit JOIN syntax:**
```
join Orders to Customers
join Order_items to Products
join Products to Categories
join orders, products, order_items and categories
```

**Natural language — auto-detected, no keyword needed:**
```
show customer name with product name they ordered
show full order details with customer name and category
which customer ordered the most
show category name with total quantity ordered
```

**When JOIN is impossible (no common key):**
- Both tables' column names and data types shown side by side in the UI
- User can see exactly why the JOIN isn't possible

### 🗄️ System Tables Exclusion

- `SYSTEM_TABLES = ["Users", "ChatHistory", "ChangeLog"]` — defined once, applied everywhere
- `system_tables_sql()` — generates `AND TABLE_NAME NOT IN ('Users','ChatHistory','ChangeLog')`
- Applied to all `INFORMATION_SCHEMA` queries automatically
- LLM prompts explicitly instructed to never use system tables
- Dynamic `semantic_map`, `data_subjects`, and `per_keywords` built from actual DB — no hardcoding

### 📊 Smart Visualization Engine
- **Auto chart suggestion** — AI analyzes actual result data (real column names + sample rows) and suggests the best chart
- Suggestion shown as a dismissible banner: *"📊 Comparing prices across products"*
- One-click **"Show bar chart"** button to render inline
- **✕ Close chart** button to go back to table view — suggestion banner restores
- **⬇️ Download PNG** — each chart downloadable as PNG with white background + data labels
- Each chart has its own `ref` — multiple open charts download independently (no cross-download bug)
- Supports: Bar charts, Line charts, Pie charts
- Intent-aware — no charts for text-only results unless explicitly requested
- **Zero hallucination** — column names validated against actual DataFrame before suggesting
- Data labels shown on bars/slices using `chartjs-plugin-datalabels`

### 📤 Export Results
- **⬇️ CSV** — one-click export of any result table to `.csv` file
- **📊 Excel** — one-click export to `.xlsx` with auto column widths via SheetJS
- Row + column count shown inline: `5 rows · 4 cols`
- Available on every result table across all query types

### 🧠 AI SQL Agent (Local LLM)
- Uses **Llama3 via Ollama** — fully local, no external API, no cost
- Generates valid Microsoft SQL Server syntax
- Warms up automatically on startup for faster first response
- All SQL passes through a multi-step correction pipeline before execution
- Retry logic — if LLM returns explanation instead of SQL, strict retry prompt issued automatically

### 🛡️ SQL Safety & Correction Pipeline

Every generated SQL passes through these steps in order:

| Step | Function | What it does |
|------|----------|-------------|
| 1 | `clean_sql_output` | Strips markdown fences, extracts pure SQL, fixes double SELECT |
| 2 | `fix_top_position` | Moves TOP clause to correct position after SELECT |
| 3 | `fix_bracket_dot_notation` | Fixes `[Table].[Col]` → `alias.[Col]` and `[alias].Col` → `alias.[Col]` |
| 4 | `fix_missing_from` | Adds missing FROM clause if LLM omitted it |
| 5 | `convert_limit_to_top` | Converts MySQL LIMIT → SQL Server TOP |
| 6 | `enforce_schema` | Validates all `[column]` refs against full DB schema |
| 7 | `is_safe_sql` | Blocks INSERT, UPDATE, DELETE, DROP, ALTER, EXEC, TRUNCATE |

**Early safety check** — dangerous keywords (`alter`, `delete`, `drop`, `insert`, `update`, `truncate`, `exec`) are blocked immediately before any SQL generation even starts.

### 🧠 RAG Contextual Memory
- Last 6 messages used as context for follow-up questions
- Pronoun detection: `their`, `these`, `those`, `them` → resolved to actual subject
- Action-word detection: `now show`, `also add`, `filter by`, `sort by`, `add their`, etc.
- LLM rewrites ambiguous questions into complete standalone SQL-ready queries
- 7-guard rejection system — rejects SQL, explanations, proper names, too-long or unchanged resolves
- Dynamic `data_subjects` — all table names + all column names from DB (no hardcoding)
- RAG follow-up questions always treated as data queries

### 💡 Special Keyword Info Panel
- **ℹ button** in topbar — click to open/close keyword reference panel
- Shows all supported keyword categories with badges:
  - 📊 Charts, 🔢 Aggregation, 📋 Listing, 📝 Summary, 🔗 JOIN, 🗄️ DB Info, 🧠 Follow-up (RAG), ⛔ Blocked
- Adapts to light/dark mode automatically
- ✕ close button inside panel

---
  <img width="381" height="809" alt="image" src="https://github.com/user-attachments/assets/5c5324c5-066d-47f5-a707-ecbc964164d4" />
  
---

### Multiple Mode (Dark, Light, Cyber, Purple)
- One-click dark/light/Cyber/Purple) toggle in topbar (🌙 Dark / ☀️ Light/ ⚡ Cyber/ 🌸 Purple)
- Preference saved in `localStorage` — persists across reloads
- Full UI coverage: sidebar, chat window, messages, input bar, buttons, badges, tables

## 🌙 Dark Mode Theme View

![WhatsApp Image 2026-03-31 at 3 00 43 PM](https://github.com/user-attachments/assets/6b456377-dfcb-4bbf-a304-bfae9bc543e6)

---

## ☀️ Light Mode Theme View

![WhatsApp Image 2026-03-31 at 3 00 57 PM](https://github.com/user-attachments/assets/b7d5971b-c999-4f23-9830-b6f2a65d6f4a)

---

## ⚡ Cyber Mode Theme View

![WhatsApp Image 2026-03-31 at 3 01 16 PM](https://github.com/user-attachments/assets/7b4c2923-53df-42c0-87b3-95cfcfa59b4f)

---

## ⚡ Purple Mode Theme View

![WhatsApp Image 2026-03-31 at 3 01 31 PM](https://github.com/user-attachments/assets/6e80b3d9-5a3e-41e2-b3e6-b49999fdc055)

---

### 📱 Persistent Chat History
- All chats auto-saved to **SQL Server** (`ChatHistory` table) on every message
- Normalized on load — `table_data`/`tableData` mismatch handled automatically
- Fully restored on page reload — tables, charts, JOIN badges all preserved
- Delete individual chats on hover (🗑️ per chat) — removes from SQL Server too
- Clear all history with confirmation prompt
- Same history accessible from any device (cross-device via SQL Server)

### 🗂️ Collapsible Sidebar
- **◀ button** — collapse sidebar to slim 48px rail
- **▶ button** — expand sidebar back to full width
- Smooth `0.25s` width transition animation

### ⬇️ Auto-Scroll Button
- When scrolled up 150px+ from bottom, a **↓ purple button** appears
- Click to smoothly scroll to latest message
- Auto-hides when already at bottom
- New messages auto-scroll the window

### 📊 Result Table UI
- Horizontal scroll inside message bubble — page never scrolls horizontally
- `table-scroll-wrapper` CSS class — always-visible styled scrollbar (purple thumb)
- `tableLayout: auto` with `minWidth: 120px` per column — natural overflow triggers scroll
- Sticky header row — stays visible while scrolling down long results
- Alternating row colors for readability
- Hover tooltip on truncated cell values

---

## Choose Model 

![WhatsApp Image 2026-03-31 at 3 02 19 PM](https://github.com/user-attachments/assets/e2ea6828-bb74-4bc6-9e2f-d8245d9e6b46)

---
## 🏗️ Tech Stack

### Frontend
- React (Vite)
- Chart.js + react-chartjs-2
- chartjs-plugin-datalabels
- SheetJS (xlsx) — Excel export
- react-markdown
- JavaScript / CSS

### Backend
- FastAPI
- Pandas
- SQLAlchemy
- PyODBC
- Ollama (Llama3)
- Microsoft SQL Server
- python-jose (JWT)
- passlib + bcrypt (password hashing)
- smtplib / Gmail SMTP (OTP emails)
- python-dotenv (.env config)

---

## 📂 Project Structure

```
genai-sql-app/
├── main.py                    # FastAPI backend — all AI + DB + auth logic
├── requirements.txt
├── .env                       # EMAIL_USER, EMAIL_PASS (Gmail SMTP)
├── test_admin.py              # Admin panel test script
│
└── frontend/
    ├── src/
    │   ├── App.jsx            # Main app — chat, JOIN badge, chart, export, scroll
    │   ├── index.css          # Global styles + dark mode + table scroll
    │   ├── main.jsx
    │   └── components/
    │       ├── SIdebar.jsx    # Chat history, collapse toggle, delete, clear all
    │       └── AuthPage.jsx   # Login, Register, OTP verify, Forgot password flow
    ├── package.json
    └── vite.config.js
```

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

Keep Ollama running in the background before starting the backend.

### 3️⃣ Backend Setup

```bash
pip install -r requirements.txt
```

Requirements:
- SQL Server running locally
- ODBC Driver 17 for SQL Server installed

Create a `.env` file in the root directory:
```env
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password
```

> **Note:** Use a Gmail App Password, not your regular Gmail password. Enable 2FA on Gmail, then generate an App Password at https://myaccount.google.com/apppasswords

Update database config in `main.py`:
```python
DB_SERVER = "YOUR_SERVER_NAME"
DB_NAME   = "YOUR_DATABASE_NAME"
```

Also update the admin email:
```python
ADMIN_EMAIL = "your_admin_email@gmail.com"
```

```bash
uvicorn main:app --reload
```

Backend: `http://localhost:8000`  
Swagger Docs: `http://localhost:8000/docs`

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

Frontend: `http://localhost:5173`

---

## 🧠 How the System Works

### Mode 1 — Table Selected
1. User loads a DB table from the dropdown
2. Schema fetched from `INFORMATION_SCHEMA`
3. Dangerous keywords blocked immediately before any processing
4. Meta/DB/schema questions handled separately without SQL
5. Smart multitable detection runs — if question spans multiple tables, auto-JOIN chain built
6. Otherwise single-table SQL generated → cleaned → validated → executed
7. Result returned with explanation + optional chart suggestion + export buttons

### Mode 2 — No Table Selected (Full DB Mode)
1. All tables + all FK relationships fetched dynamically
2. Full schema + FK map + alias map passed to LLM as context
3. LLM writes any SQL — single table, JOIN, subquery, aggregation
4. Same 7-step cleaning + safety pipeline applied
5. Chart suggestion generated from result data

### Mode 3 — Explicit JOIN
1. User types: `join Orders to Customers` or `join orders, products, order_items and categories`
2. FK checked first → column name match as fallback
3. JOIN SQL generated with correct t1/t2 aliases and exact JOIN conditions
4. Result shown with JOIN badge + detected chain

### Mode 4 — Auth Flow
1. Register → OTP email sent → verify OTP → account created → auto login
2. Login → JWT token issued → stored in localStorage
3. All API calls include `Authorization: Bearer <token>`
4. Forgot password → OTP email → verify → new password → SQL Server updated

---

## 🔗 JOIN Chain Example

Given this database:
```
Categories  (CategoryID, CategoryName, Description)
    ↓ CategoryID
Products    (product_id, ProductName, CategoryID, Price, Stock)
    ↓ product_id
Order_items (OrderItemID, Order_id, Product_id, Quantity, Price)
    ↓ Order_id
Orders      (Order_id, Customer_id, OrderDate, TotalAmount)
    ↓ Customer_id
Customers   (customer_id, FirstName, LastName, Email, ...)
```

Query: *"show customer name with product name and category they bought"*

Auto-detected chain:
```
Customers → Orders → Order_items → Products → Categories
```

Frontend badge: **🔗 5-Table JOIN** `Customers → Orders → Order_items → Products → Categories`

---

## 📊 Chart Suggestion Logic

1. Result must have ≥ 2 rows AND ≥ 1 numeric + 1 categorical column — hard check, no LLM
2. LLM receives actual column names + data types + 5 real sample rows
3. LLM returns strict JSON: `{ should_suggest, chart_type, x_column, y_column, reason }`
4. `chart_type` validated — only `bar`, `pie`, `line` accepted
5. `x_column` and `y_column` validated against actual DataFrame columns
6. `y_column` validated as numeric — hallucination structurally impossible

---

## ⚠️ Notes & Limitations

- Uploaded datasets stored in memory — backend restart clears them
- Chat history saved in SQL Server — persists across devices and sessions
- Multi-user supported — each user has isolated sessions and history
- LLM speed depends on hardware (GPU strongly recommended for Llama3)
- Result previews capped at 100 rows
- RAG context limited to last 6 messages — deeper context requires Vector DB
- OTP store (`otp_store`, `reset_otp_store`) is in-memory — backend restart clears pending OTPs

---

## 🔮 Feature Status

|                   Feature                                    |           Status          |
|--------------------------------------------------------------|---------------------------|
| Persistent chat history (SQL Server)                         |          ✅ Done          |
| Dark / Light mode toggle                                     |          ✅ Done          |
| 2+ table JOIN with FK detection                              |          ✅ Done          |
| 2+ table JOIN with column name matching                      |          ✅ Done          |
| Multi-step JOIN chain (3–5 tables)                           |          ✅ Done          |
| Join all tables — direct FK SQL builder (no LLM)             |          ✅ Done          |
| Auto chart suggestion (zero hallucination)                   |          ✅ Done          |
| Close chart → restore table + suggestion                     |          ✅ Done          |
| Full DB mode (no table selected)                             |          ✅ Done          |
| FK + column auto-relationship detection                      |          ✅ Done          |
| SQL correction pipeline (7 steps)                            |          ✅ Done          |
| Unsafe SQL blocking (early + pipeline)                       |          ✅ Done          |
| Meta / DB-level question handling                            |          ✅ Done          |
| Schema questions (multi-table)                               |          ✅ Done          |
| Download charts as PNG (with data labels)                    |          ✅ Done          |
| Export results to CSV / Excel                                |          ✅ Done          |
| Auto-scroll button (↓)                                       |          ✅ Done          |
| Special Keyword Info panel (ℹ) with RAG keywords             |          ✅ Done          |
| Collapsible sidebar (◀ ▶)                                    |          ✅ Done          |
| SQL retry on LLM explanation response                        |          ✅ Done          |
| Select All Tables (Full DB) button near Load in sidebar      |          ✅ Done          |
| System tables excluded from all queries (dynamic)            |          ✅ Done          |
| Dynamic semantic_map, data_subjects, per_keywords            |          ✅ Done          |
| Table horizontal scroll (in-bubble, page fixed)              |          ✅ Done          |
| Authentication system (SQL Server + Local)                   |          ✅ Done          |
| - User ID, email, password (hashed), created_at, last_login  |          ✅ Done          |
| - Auth_Provider (local / google)                             |          ✅ Done          |
| - Auto-detect duplicate email on register                    |          ✅ Done          |
| - Logout button in sidebar                                   |          ✅ Done          |
| - Download chat history button in sidebar                    |          ✅ Done          |
| - Admin panel (list users, reset password, delete user)      |          ✅ Done          |
| Email OTP verification on register                           |          ✅ Done          |
| Forgot password with OTP reset flow                          |          ✅ Done          |
| - Forgot password → OTP email → verify → new password        |          ✅ Done          |
| - Password updated in SQL Server (hashed)                    |          ✅ Done          |
| - Auto-redirect to login after reset                         |          ✅ Done          |
| Multi-user support                                           |          ✅ Done          |
| - Per-user backend sessions (no table conflict)              |          ✅ Done          |
| - All API calls authenticated with JWT Bearer token          |          ✅ Done          |
| Chat history saved per email in SQL Server                   |          ✅ Done          |
| - View chat history in SQL Server ChatHistory table          |          ✅ Done          |
| - Delete chat from frontend → deletes from SQL Server too    |          ✅ Done          |
| - Same history accessible from any device (cross-device)     |          ✅ Done          |
| RAG-based contextual memory                                  |          ✅ Done          |
| - Last 6 messages used as context for follow-up questions    |          ✅ Done          |
| - Pronoun/action-word detection (their, these, now, filter)  |          ✅ Done          |
| - SQL injection & proper-name hallucination guard            |          ✅ Done          |
| - Semantic keyword → table detection (revenue, spent, sales) |          ✅ Done          |
| - Dynamic data_subjects from actual DB schema                |          ✅ Done          |
|--------------------------------------------------------------|---------------------------|

---

## 🛠️ Tools Used

- **Python** — Backend language
- **FastAPI** — REST API framework
- **SQLAlchemy + PyODBC** — Database connection and query execution
- **Pandas** — Data processing and CSV/XLSX handling
- **Ollama (Llama3)** — Local LLM for SQL generation and explanations
- **Microsoft SQL Server** — Primary database + user/chat storage
- **JWT (python-jose)** — Token-based authentication
- **bcrypt (passlib)** — Secure password hashing
- **smtplib + Gmail SMTP** — OTP email delivery
- **python-dotenv** — Environment variable management
- **React (Vite)** — Frontend framework
- **Chart.js + react-chartjs-2** — Data visualization
- **chartjs-plugin-datalabels** — Data labels on charts
- **SheetJS (xlsx)** — Excel export
- **react-markdown** — Markdown rendering in chat
- **JavaScript / CSS** — UI logic and styling
- **VS Code** — Development environment
- **Git + GitHub** — Version control

---

## 🎯 Purpose

This project demonstrates how a local LLM can be combined with:
- Live SQL Server databases with real FK + unique key relationships
- User-uploaded datasets
- Dynamic multi-table SQL generation with fully automatic relationship detection
- Intelligent visualization with zero-hallucination chart suggestions
- Conversational UI with persistent chat history and dark mode
- Full authentication system with email OTP verification and password reset

**This is not just a chatbot.**  
It is a dynamic AI-powered data exploration engine that understands your database structure automatically — no configuration, no hardcoding.
