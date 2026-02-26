from asyncio import timeout
from fastapi import FastAPI, UploadFile, File, Body
from fastapi.middleware.cors import CORSMiddleware
import requests
import pyodbc
import pandas as pd 
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import re


load_dotenv()

DB_SERVER = "LAPTOP-2IFF2C09"
DB_NAME = "MyDB"
DB_DRIVER = "ODBC Driver 17 for SQL Server"

DATABASE_URL = (
    f"mssql+pyodbc://@{DB_SERVER}/{DB_NAME}"
    f"?driver={DB_DRIVER.replace(' ', '+')}"
    f"&trusted_connection=yes"
)

engine = create_engine(DATABASE_URL)


app = FastAPI(title="GenAI SQL Chatbot")

@app.on_event("startup")
def warm_up_llm():
    try:
        print("Warming up LLM...")
        requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "qwen2.5:3b",
                "prompt": "SELECT 1",
                "stream": False,
                "options": {"num_predict": 5}
            },
            timeout=30  # 👈 longer for cold start
        )
        print("LLM warmed up")
    except Exception as e:
        print("LLM warmup failed:", repr(e))


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- shared in-memory dataset ----
active_dataframe = None
active_filename = None



@app.get("/")
def root():
    return {"status": "backend running"}

@app.get("/tables")
def list_tables():
    try:
        query = """
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
        """
        with engine.connect() as conn:
            result = conn.execute(text(query))
            tables = [row[0] for row in result]

        return {"tables": tables}

    except Exception as e:
        return {"error": str(e)}
    


# ---- upload endpoint ----
@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    global active_dataframe, active_filename

    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(file.file)
        elif file.filename.endswith(".xlsx"):
            df = pd.read_excel(file.file)
        else:
            return {"error": "Only CSV or XLSX allowed"}

        active_dataframe = df
        active_filename = file.filename

        return {
            "message": "Upload successful",
            "rows": len(df),
            "columns": list(df.columns),
        }

    except Exception as e:
        return {"error": str(e)}
    
@app.get("/load-table/{table}")
def load_table(table: str):
    global active_dataframe, active_filename

    try:
        query = f"SELECT TOP 100 * FROM [{table}]"
        df = pd.read_sql(query, engine)

        active_dataframe = df
        active_filename = table

        return {
            "message": "Table loaded",
            "rows": len(df),
            "columns": list(df.columns)
        }

    except Exception as e:
        return {"error": str(e)}



# -------------------------
# AI SQL AGENT HELPERS
# -------------------------

def get_table_schema(table_name: str):
    query = """
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = :table
    """
    with engine.connect() as conn:
        result = conn.execute(text(query), {"table": table_name})
        return [(row[0], row[1]) for row in result]






def enforce_schema(sql: str, schema: list, table_name: str):
    # Ensure table name is bracketed
    sql = re.sub(
        rf"\b{re.escape(table_name)}\b",
        f"[{table_name}]",
        sql,
        flags=re.IGNORECASE
    )

    return sql







def generate_sql(question: str, table_name: str, schema: list):
    # Build column list from schema
    columns = [col for col, _ in schema]

    prompt = f"""
Generate a valid Microsoft SQL Server SELECT query.

STRICT DIALECT RULES:
- Table: [{table_name}]
- Use ONLY these exact column names:
  {columns}
- Column names MUST match exactly as written above.
- If a column has spaces, it MUST be wrapped in square brackets.
  Example: [Restaurant Name]
- Never partially wrap column names.
- Never split multi-word column names.
- Do NOT rename or invent columns.

SYNTAX RULES:
- SQL Server syntax only.
- SELECT statements only.
- Use TOP for limiting results.
- TOP must appear immediately after SELECT.
- Use GROUP BY when TOP is included.
- Never place TOP after ORDER BY.
- DO NOT use LIMIT.
- DO NOT use FETCH.
- DO NOT use OFFSET.
- If limiting results, use SELECT TOP N.
- The SELECT clause must include at least one column or *.

AGGREGATION RULES:
- If the question asks for "top", "highest", "lowest", or ranking,
  you MUST use GROUP BY and an appropriate aggregation function.
- For totals, use SUM().
- For counts, use COUNT().
- If using aggregation, the aggregated value MUST appear in the SELECT clause
  with an alias.
  Example: SUM([Rating Count]) AS TotalRatingCount
- When ordering by aggregation, use the alias in ORDER BY.


FORMATTING RULES:
- All column references in SELECT, WHERE, GROUP BY, and ORDER BY
  must be wrapped correctly if they contain spaces.
- Output SQL only.
- No explanations.
- No markdown.
- No comments.

Question:
{question}

SQL:

"""

    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "qwen2.5:3b",
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0,
                "num_predict": 120
            }
        },
        timeout=120
    )

    return response.json().get("response", "").strip()



def fix_top_position(sql: str):

    # If TOP appears after ORDER BY, fix it
    if "ORDER BY" in sql.upper() and "TOP" in sql.upper():

        match = re.search(r"TOP\s+(\d+)", sql, re.IGNORECASE)
        if match:
            top_n = match.group(1)

            # Remove existing TOP
            sql = re.sub(r"TOP\s+\d+", "", sql, flags=re.IGNORECASE)

            # Add TOP after SELECT
            sql = re.sub(
                r"SELECT",
                f"SELECT TOP {top_n}",
                sql,
                flags=re.IGNORECASE
            )

    return sql




def clean_sql_output(raw_sql: str):
    # Remove markdown fences
    raw_sql = re.sub(r"```sql", "", raw_sql, flags=re.IGNORECASE)
    raw_sql = raw_sql.replace("```", "")

    # Extract only the FIRST SELECT statement up to the first semicolon
    match = re.search(r"(SELECT[\s\S]+?;)", raw_sql, re.IGNORECASE)

    if match:
        return match.group(1).strip()

    # If no semicolon, extract until first double newline
    match = re.search(r"(SELECT[\s\S]+?)(\n\n|$)", raw_sql, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    return raw_sql.strip()

def convert_limit_to_top(sql: str):
    match = re.search(r"LIMIT\s+(\d+)", sql, re.IGNORECASE)
    if match:
        limit_value = match.group(1)

        # Remove LIMIT clause
        sql = re.sub(r"LIMIT\s+\d+;", "", sql, flags=re.IGNORECASE)
        sql = re.sub(r"LIMIT\s+\d+", "", sql, flags=re.IGNORECASE)

        # Insert TOP after SELECT
        sql = re.sub(
            r"SELECT",
            f"SELECT TOP {limit_value}",
            sql,
            count=1,
            flags=re.IGNORECASE
        )

    return sql

def is_safe_sql(sql: str):
    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER"]
    sql_upper = sql.upper()
    return sql_upper.startswith("SELECT") and not any(f in sql_upper for f in forbidden)


def execute_sql(sql: str):
    with engine.connect() as conn:
        return pd.read_sql(sql, conn)




def auto_detect_chart(df: pd.DataFrame, chart_pref=None):

    if df.shape[1] < 2:
        return None

    numeric_cols = df.select_dtypes(include="number").columns
    non_numeric_cols = df.select_dtypes(exclude="number").columns

    if len(numeric_cols) == 0 or len(non_numeric_cols) == 0:
        return None

    numeric_col = numeric_cols[0]
    category_col = non_numeric_cols[0]

    # 🔥 If user explicitly requested chart type
    if chart_pref:
        return {
            "type": chart_pref,
            "labels": df[category_col].astype(str).tolist(),
            "values": df[numeric_col].round(2).tolist()
        }

    # 🔥 Otherwise auto decide
    unique_count = df[category_col].nunique()

    if unique_count <= 8:
        chart_type = "pie"
    else:
        chart_type = "bar"

    return {
        "type": chart_type,
        "labels": df[category_col].astype(str).tolist(),
        "values": df[numeric_col].round(2).tolist()
    }

def explain_result(question: str, df: pd.DataFrame, intent: str):

    total_rows = len(df)
    sample_text = df.head(10).to_string(index=False)

    if intent == "list" or intent == "ranking":
        prompt = f"""
User question:
{question}

Result rows:
{sample_text}

Return ONLY the list in structured format.
Do not add commentary.
Do not add explanations.
Do not add introductory sentences.
"""

    elif intent == "summary":
        prompt = f"""
User question:
{question}

Total rows: {total_rows}

Result preview:
{sample_text}

Provide a high-level analytical summary.
Do not repeat rows.
Identify patterns, highest and lowest values,
and relationships between columns.
Be concise and insightful.
"""

    else:
        prompt = f"""
User question:
{question}

Result preview:
{sample_text}

Answer clearly and naturally.
Base the answer strictly on the result data.
"""

    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "qwen2.5:3b",
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.6,
                "num_predict": 250
            }
        },
        timeout=300
    )

    return response.json().get("response", "").strip()





@app.post("/chart")
async def generate_chart(body: dict = Body(...)):
    question = body.get("message")

    if not question:
        return {"error": "Empty question"}

    if not active_filename:
        return {"error": "No table loaded"}

    # 1️⃣ Generate SQL
    schema = get_table_schema(active_filename)
    sql = generate_sql(question, active_filename, schema)

    if not is_safe_sql(sql):
        return {"error": "Unsafe SQL blocked", "sql": sql}

    # 2️⃣ Execute SQL
    df = execute_sql(sql)

    if df.empty:
        return {"error": "No data returned"}

    # 3️⃣ Auto-detect chart type
    
    intent = detect_intent(question)
    chart = auto_detect_chart(df, intent)
    

    return {
        "sql": sql,
        "chart": chart
    }


def detect_intent(question: str):
    q = question.lower()

    if any(word in q for word in ["chart", "plot", "graph", "visual", "visualize"]):
        return "chart"

    if any(word in q for word in ["top", "highest", "lowest", "rank"]):
        return "ranking"

    if any(word in q for word in ["list", "show", "give me"]):
        return "listing"

    if any(word in q for word in ["summary", "summarize", "overview"]):
        return "summary"

    return "general"



# ---- chat endpoint (TEMP, no Gemini yet) ----


def detect_chart_preference(question: str):
    q = question.lower()

    if "pie" in q:
        return "pie"
    if "line" in q:
        return "line"
    if "bar" in q:
        return "bar"
    if "scatter" in q:
        return "scatter"

    return None  # no specific preference
    

@app.post("/chat")
async def chat(body: dict = Body(...)):
    try:
        question = body.get("message")

        if not question:
            return {"error": "Empty question"}

        if not active_filename:
            return {"error": "No table loaded"}

        schema = get_table_schema(active_filename)

        raw_sql = generate_sql(question, active_filename, schema)
        sql = clean_sql_output(raw_sql)
        sql= fix_top_position(sql)
        sql = convert_limit_to_top(sql)
        sql = enforce_schema(sql, schema, active_filename)
        sql = sql.rstrip(";")
        




        print("Generated SQL:", sql)
        
        chart_data = None

        if not is_safe_sql(sql):
            return {"error": "Unsafe SQL blocked", "sql": sql}

        df = execute_sql(sql)
        print("Rows returned:", len(df))

        # Explanation
        intent = detect_intent(question)

        if len(df) == 0:
            explanation = "No results found."
        elif len(df) <= 50:
            explanation = explain_result(question, df, intent)
        else:
            explanation = f"I found {len(df)} matching records.\n\n"
            explanation += explain_result(question, df.head(10), intent)

        # Chart
        chart_data = None

        if intent in["chart", "ranking", "listing"]:
            chart_pref = detect_chart_preference(question)
            chart_data = auto_detect_chart(df, chart_pref)
        

        return {
            "reply": explanation,
            "chart": chart_data
        }

    except Exception as e:
        print("CHAT ERROR:", repr(e))
        return {"error": str(e)}
