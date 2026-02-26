🧠 GenAI Data Agent

An AI-powered full-stack web application that allows users to upload datasets or connect to a Microsoft SQL Server database and interactively analyze data using a conversational AI agent.

Unlike static demos with hardcoded data, this system dynamically adapts to uploaded files and live database tables, generates SQL queries automatically, executes them safely, and optionally visualizes the results.

🚀 Key Features
-📁 Data Sources

 -Upload CSV / XLSX files
 -Connect to Microsoft SQL Server
 -Dynamically load database tables
 -Schema-aware query generation

-💬 Conversational AI Interface

 -Ask questions in natural language
 -AI automatically generates valid SQL Server queries
 -Dynamic schema enforcement (no hardcoded columns)
 -Context-aware responses

 -Multi-chat support (like ChatGPT-style sessions)

-📊 Smart Visualization Engine

 -Automatic chart detection
 -Supports:
  -Bar charts
  -Line charts
  -Pie charts
 -Intent-aware chart generation
 -No charts for summaries unless explicitly requested

-🧠 AI SQL Agent (Local LLM Powered)

 -Uses Llama3 via Ollama
 -Generates SQL using Microsoft SQL Server syntax
 -Converts invalid clauses (LIMIT → TOP)
 -Enforces correct schema usage
 -Blocks unsafe queries (INSERT, DELETE, DROP, etc.)
 -Fully local inference (no external API dependency)

-🛡️ Safety & Stability

 -SELECT-only execution
 -Schema enforcement
 -SQL sanitization
 -Intent-based visualization control
 -Graceful error handling

-🏗️ Tech Stack

 -Frontend

 -React (Vite)
 -Chart.js
 -react-chartjs-2
 -JavaScript
 -CSS

-Backend

 -FastAPI
 -Pandas
 -SQLAlchemy
 -PyODBC
 -Ollama (Llama3/qwen2.5b)
 -Microsoft SQL Server

-📂 Project Structure
genai-sql-app/
├── main.py                # FastAPI backend
├── requirements.txt
├── .env                   # Environment variables
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   └── ...
│   │   └── index.css
│   ├── package.json
│
└── README.md

⚙️ Setup Instructions

1️⃣ Clone the Repository
git clone <repository-url>
cd genai-sql-app

2️⃣ Install & Setup Ollama (Required)

Install Ollama from:
https://ollama.com

Pull Llama3:
ollama pull llama3

Run Ollama server:
ollama run llama3

Or simply keep Ollama running in background.

3️⃣ Backend Setup

Install dependencies:
pip install -r requirements.txt

Make sure you have:

SQL Server running
ODBC Driver 17 installed

Update database config in main.py:
DB_SERVER = "YOUR_SERVER_NAME"
DB_NAME = "YOUR_DATABASE_NAME"

Run backend:

uvicorn main:app --reload

Backend runs at:

http://localhost:8000

Swagger Docs:

http://localhost:8000/docs
4️⃣ Frontend Setup
cd frontend
npm install
npm run dev

Frontend runs at:

http://localhost:5173

-🧠 How the System Works

 -CSV/XLSX Mode
 -User uploads dataset
 -Backend loads into Pandas DataFrame
 -AI agent generates logic over in-memory data
 -Returns explanation + optional chart

-SQL Server Mode

 -User selects a DB table
 -Backend fetches schema dynamically
 -AI generates SQL Server query
 -Query is sanitized and validated
 -SQL executes
 -Results returned conversationally
 -Chart generated if intent requires

-📊 Chart Intelligence

 Charts are generated only when:
 -User asks for chart / plot / visualize
 -User asks for ranking (top / highest / lowest)

 Chart types auto-detected based on:
 -Numeric vs categorical columns
 -Aggregated results
 -User preference (bar / line / pie)

-🔥 Advanced Capabilities

 -Dynamic schema enforcement
 -LIMIT → TOP conversion
 -TOP clause correction
 -SQL aggregation correction
 -Multi-chat memory system
 -Per-chat loading state
 -Intent detection engine
 -Automatic chart preference detection

-⚠️ Notes & Limitations

 -Uploaded datasets are stored in memory
 -Restarting backend clears session data
 -Designed for single-user environment
 -LLM inference speed depends on local hardware
 -Large result sets may be summarized automatically

-🔮 Future Enhancements

 -Persistent chat storage
 -Authentication system
 -Multi-user support
 -Role-based database access
 -Advanced chart customization
 -Export to CSV / Excel
 -Download charts as PNG
 -Vector database memory
 -RAG-based contextual history

-🎯 Purpose

 This project demonstrates how a local LLM can be combined with:
 -Live databases
 -User-uploaded datasets
 -Dynamic SQL generation
 -Intelligent visualization
 -Conversational UI
 to create a production-style AI Data Analyst system.

 This is not just a chatbot.
 It is a dynamic AI-powered data exploration engine.