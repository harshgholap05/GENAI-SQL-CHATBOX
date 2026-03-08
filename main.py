from fastapi import FastAPI, UploadFile, File, Body, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
import requests
import pyodbc
import pandas as pd 
import os
import smtplib
import random
import string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import re
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext

load_dotenv()

DB_SERVER = "HARSHGHOLAP04"
DB_NAME = "retailDB"
DB_DRIVER = "ODBC Driver 17 for SQL Server"

DATABASE_URL = (
    f"mssql+pyodbc://@{DB_SERVER}/{DB_NAME}"
    f"?driver={DB_DRIVER.replace(' ', '+')}"
    f"&trusted_connection=yes"
)

engine = create_engine(DATABASE_URL)

# ---- Auth Config ----
SECRET_KEY = "genai-sql-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

# ---- Email Config ----
EMAIL_USER = os.getenv("EMAIL_USER", "")
EMAIL_PASS = os.getenv("EMAIL_PASS", "")

# In-memory OTP store: { email: { otp, expires_at, username, password_hash } }
otp_store = {}

# System/auth tables — always excluded from SQL generation and JOINs
SYSTEM_TABLES = ["Users", "ChatHistory", "ChangeLog"]

def system_tables_sql():
    """Returns SQL exclusion clause like: AND TABLE_NAME NOT IN ('Users','ChatHistory')"""
    placeholders = ",".join([f"'{t}'" for t in SYSTEM_TABLES])
    return f"AND TABLE_NAME NOT IN ({placeholders})"

def get_data_tables():
    """Fetch all non-system tables dynamically from DB."""
    try:
        placeholders = ",".join([f"'{t}'" for t in SYSTEM_TABLES])
        query = f"SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME NOT IN ({placeholders}) ORDER BY TABLE_NAME"
        with engine.connect() as conn:
            return [row[0] for row in conn.execute(text(query))]
    except:
        return []

def generate_otp() -> str:
    return ''.join(random.choices(string.digits, k=6))

def send_otp_email(to_email: str, otp: str, username: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your GenAI SQL Assistant Verification Code"
    msg["From"] = EMAIL_USER
    msg["To"] = to_email

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
        <h2 style="color:#4f46e5;margin-bottom:8px;">GenAI SQL Assistant</h2>
        <p style="color:#475569;">Hi <b>{username}</b>, verify your email to activate your account.</p>
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
            <p style="color:#0369a1;font-size:13px;margin:0 0 8px;">Your verification code</p>
            <div style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#4f46e5;">{otp}</div>
        </div>
        <p style="color:#94a3b8;font-size:12px;">This code expires in <b>10 minutes</b>. Do not share it with anyone.</p>
    </div>
    """
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(EMAIL_USER, EMAIL_PASS)
        server.sendmail(EMAIL_USER, to_email, msg.as_string())


def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None

def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    email = decode_token(token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    return email


app = FastAPI(title="GenAI SQL Chatbot")

@app.on_event("startup")
def warm_up_llm():
    try:
        print("Warming up LLM...")
        requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3",
                "prompt": "SELECT 1",
                "stream": False,
                "options": {"num_predict": 5}
            },
            timeout=30
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

# ---- Per-user sessions (replaces global active_filename) ----
user_sessions = {}
# Structure: { "email": { "active_filename": "Orders", "active_dataframe": df } }

def get_session(email: str) -> dict:
    if email not in user_sessions:
        user_sessions[email] = {"active_filename": None, "active_dataframe": None}
    return user_sessions[email]



@app.get("/")
def root():
    return {"status": "backend running"}

@app.get("/tables")
def list_tables():
    try:
        excl = system_tables_sql()
        tables_query = f"""
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
          {excl}
        ORDER BY TABLE_NAME
        """

        count_query = f"""
        SELECT COUNT(*)
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
          {excl}
        """

        size_query = """
        SELECT
            SUM(size) * 8 / 1024
        FROM sys.database_files
        """

        db_query = "SELECT DB_NAME()"

        with engine.connect() as conn:
            result = conn.execute(text(tables_query))
            tables = [row[0] for row in result]

            table_count = conn.execute(text(count_query)).scalar()
            db_size = conn.execute(text(size_query)).scalar()
            db_name = conn.execute(text(db_query)).scalar()

        return {
            "database": db_name,
            "total_tables": table_count,
            "tables": tables,
            "size_mb": round(db_size, 2) if db_size else 0
        }

    except Exception as e:
        return {"error": str(e)}
    
    


# ---- upload endpoint ----
@app.post("/upload")
async def upload(file: UploadFile = File(...), current_user: str = Depends(get_current_user)):
    session = get_session(current_user)
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(file.file)
        elif file.filename.endswith(".xlsx"):
            df = pd.read_excel(file.file)
        else:
            return {"error": "Only CSV or XLSX allowed"}

        session["active_dataframe"] = df
        session["active_filename"] = file.filename

        return {
            "message": "Upload successful",
            "rows": len(df),
            "columns": list(df.columns),
        }

    except Exception as e:
        return {"error": str(e)}

@app.get("/load-table/{table}")
def load_table(table: str, current_user: str = Depends(get_current_user)):
    session = get_session(current_user)
    try:
        query = f"SELECT TOP 100 * FROM [{table}]"
        df = pd.read_sql(query, engine)

        session["active_dataframe"] = df
        session["active_filename"] = table

        return {
            "message": "Table loaded",
            "rows": len(df),
            "columns": list(df.columns),
            "active_table": table
        }

    except Exception as e:
        return {"error": str(e)}


@app.post("/clear-table")
def clear_table(current_user: str = Depends(get_current_user)):
    session = get_session(current_user)
    session["active_dataframe"] = None
    session["active_filename"] = None
    return {"message": "Cleared — Full DB Mode active"}


# -------------------------
# AUTH ENDPOINTS
# -------------------------

@app.post("/register")
async def register(body: dict = Body(...)):
    username = body.get("username", "").strip()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "").strip()

    if not username or not email or not password:
        raise HTTPException(status_code=400, detail="All fields are required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    hashed = hash_password(password)

    try:
        with engine.connect() as conn:
            existing = conn.execute(
                text("SELECT id FROM Users WHERE email = :email"),
                {"email": email}
            ).fetchone()
            if existing:
                raise HTTPException(status_code=400, detail="Email already registered")

        # Generate OTP and store temporarily
        otp = generate_otp()
        otp_store[email] = {
            "otp": otp,
            "expires_at": datetime.utcnow() + timedelta(minutes=10),
            "username": username,
            "hashed_password": hashed
        }

        # Send OTP email
        try:
            send_otp_email(email, otp, username)
        except Exception as mail_err:
            raise HTTPException(status_code=500, detail=f"Failed to send OTP email: {str(mail_err)}")

        return {"message": "OTP sent to your email", "email": email}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/verify-otp")
async def verify_otp(body: dict = Body(...)):
    email = body.get("email", "").strip().lower()
    otp_input = body.get("otp", "").strip()

    if not email or not otp_input:
        raise HTTPException(status_code=400, detail="Email and OTP required")

    entry = otp_store.get(email)
    if not entry:
        raise HTTPException(status_code=400, detail="No OTP found. Please register again.")

    if datetime.utcnow() > entry["expires_at"]:
        del otp_store[email]
        raise HTTPException(status_code=400, detail="OTP expired. Please register again.")

    if entry["otp"] != otp_input:
        raise HTTPException(status_code=400, detail="Invalid OTP. Please try again.")

    # OTP correct — create user in DB
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO Users (username, email, hashed_password, auth_provider, created_at)
                VALUES (:username, :email, :hashed, 'local', GETDATE())
            """), {
                "username": entry["username"],
                "email": email,
                "hashed": entry["hashed_password"]
            })

        del otp_store[email]  # cleanup

        token = create_access_token({"sub": email})
        return {"token": token, "username": entry["username"], "email": email}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/resend-otp")
async def resend_otp(body: dict = Body(...)):
    email = body.get("email", "").strip().lower()
    entry = otp_store.get(email)

    if not entry:
        raise HTTPException(status_code=400, detail="No pending registration. Please register again.")

    # Generate new OTP
    otp = generate_otp()
    otp_store[email]["otp"] = otp
    otp_store[email]["expires_at"] = datetime.utcnow() + timedelta(minutes=10)

    try:
        send_otp_email(email, otp, entry["username"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to resend OTP: {str(e)}")

    return {"message": "New OTP sent to your email"}


# -------------------------
# FORGOT PASSWORD ENDPOINTS
# -------------------------

# Separate store for password reset OTPs
reset_otp_store = {}

@app.post("/forgot-password")
async def forgot_password(body: dict = Body(...)):
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email required")

    try:
        with engine.connect() as conn:
            user = conn.execute(
                text("SELECT id, username FROM Users WHERE email = :email AND auth_provider = 'local'"),
                {"email": email}
            ).fetchone()

        if not user:
            # Don't reveal if email exists — security best practice
            return {"message": "If this email is registered, you will receive an OTP"}

        otp = generate_otp()
        reset_otp_store[email] = {
            "otp": otp,
            "expires_at": datetime.utcnow() + timedelta(minutes=10),
            "username": user[1]
        }

        # Send reset OTP email
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Reset Your GenAI SQL Assistant Password"
        msg["From"] = EMAIL_USER
        msg["To"] = email

        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
            <h2 style="color:#4f46e5;">GenAI SQL Assistant</h2>
            <p style="color:#475569;">Hi <b>{user[1]}</b>, you requested a password reset.</p>
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
                <p style="color:#c2410c;font-size:13px;margin:0 0 8px;">Your password reset code</p>
                <div style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#ea580c;">{otp}</div>
            </div>
            <p style="color:#94a3b8;font-size:12px;">This code expires in <b>10 minutes</b>. If you didn't request this, ignore this email.</p>
        </div>
        """
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, email, msg.as_string())

        return {"message": "If this email is registered, you will receive an OTP"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/verify-reset-otp")
async def verify_reset_otp(body: dict = Body(...)):
    email = body.get("email", "").strip().lower()
    otp_input = body.get("otp", "").strip()

    if not email or not otp_input:
        raise HTTPException(status_code=400, detail="Email and OTP required")

    entry = reset_otp_store.get(email)
    if not entry:
        raise HTTPException(status_code=400, detail="No reset request found. Please try again.")

    if datetime.utcnow() > entry["expires_at"]:
        del reset_otp_store[email]
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")

    if entry["otp"] != otp_input:
        raise HTTPException(status_code=400, detail="Invalid OTP. Please try again.")

    # OTP correct — mark as verified (don't delete yet, needed for reset)
    reset_otp_store[email]["verified"] = True
    return {"message": "OTP verified", "email": email}


@app.post("/reset-password")
async def reset_password(body: dict = Body(...)):
    email = body.get("email", "").strip().lower()
    new_password = body.get("new_password", "").strip()

    if not email or not new_password:
        raise HTTPException(status_code=400, detail="Email and new password required")

    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    entry = reset_otp_store.get(email)
    if not entry or not entry.get("verified"):
        raise HTTPException(status_code=400, detail="Please verify OTP first")

    try:
        hashed = hash_password(new_password)
        with engine.begin() as conn:
            result = conn.execute(
                text("UPDATE Users SET hashed_password = :hashed WHERE email = :email AND auth_provider = 'local'"),
                {"hashed": hashed, "email": email}
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="User not found")

        del reset_otp_store[email]  # cleanup
        return {"message": "Password reset successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
async def login(body: dict = Body(...)):
    email = body.get("email", "").strip().lower()
    password = body.get("password", "").strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")

    try:
        with engine.begin() as conn:
            user = conn.execute(
                text("SELECT id, username, hashed_password FROM Users WHERE email = :email AND auth_provider = 'local'"),
                {"email": email}
            ).fetchone()

            if not user or not verify_password(password, user[2]):
                raise HTTPException(status_code=401, detail="Invalid email or password")

            # Update last login
            conn.execute(
                text("UPDATE Users SET last_login = GETDATE() WHERE email = :email"),
                {"email": email}
            )

        token = create_access_token({"sub": email})
        return {"token": token, "username": user[1], "email": email}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/me")
async def get_me(current_user: str = Depends(get_current_user)):
    try:
        with engine.connect() as conn:
            user = conn.execute(
                text("SELECT username, email, created_at, last_login FROM Users WHERE email = :email"),
                {"email": current_user}
            ).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "username": user[0],
            "email": user[1],
            "created_at": str(user[2]),
            "last_login": str(user[3])
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------
# ADMIN ENDPOINTS
# -------------------------

ADMIN_EMAIL = "harshgholap117@gmail.com"  # Change to your email

def require_admin(current_user: str = Depends(get_current_user)):
    if current_user != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin access only")
    return current_user


@app.get("/admin/users")
async def admin_get_users(admin: str = Depends(require_admin)):
    """Get all users — password hidden."""
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT id, username, email, auth_provider, 
                       created_at, last_login
                FROM Users
                ORDER BY created_at DESC
            """)).fetchall()

        users = [
            {
                "id": r[0],
                "username": r[1],
                "email": r[2],
                "auth_provider": r[3],
                "created_at": str(r[4]),
                "last_login": str(r[5]) if r[5] else "Never",
            }
            for r in rows
        ]
        return {"total": len(users), "users": users}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/reset-password")
async def admin_reset_password(body: dict = Body(...), admin: str = Depends(require_admin)):
    """Reset any user's password."""
    email = body.get("email", "").strip().lower()
    new_password = body.get("new_password", "").strip()

    if not email or not new_password:
        raise HTTPException(status_code=400, detail="Email and new_password required")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    try:
        hashed = hash_password(new_password)
        with engine.begin() as conn:
            result = conn.execute(
                text("UPDATE Users SET hashed_password = :hashed WHERE email = :email"),
                {"hashed": hashed, "email": email}
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail=f"User '{email}' not found")

        return {"message": f"Password reset successfully for {email}"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/admin/delete-user")
async def admin_delete_user(body: dict = Body(...), admin: str = Depends(require_admin)):
    """Delete a user by email."""
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    if email == ADMIN_EMAIL:
        raise HTTPException(status_code=400, detail="Cannot delete admin account")

    try:
        with engine.begin() as conn:
            result = conn.execute(
                text("DELETE FROM Users WHERE email = :email"),
                {"email": email}
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail=f"User '{email}' not found")

        return {"message": f"User '{email}' deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------
# CHAT HISTORY ENDPOINTS
# -------------------------

@app.get("/history")
async def get_history(current_user: str = Depends(get_current_user)):
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT chat_id, chat_title, messages, updated_at
                FROM ChatHistory
                WHERE user_email = :email
                ORDER BY updated_at DESC
            """), {"email": current_user}).fetchall()
        import json
        chats = []
        for row in rows:
            try:
                messages = json.loads(row[2]) if row[2] else []
            except:
                messages = []
            chats.append({"id": row[0], "title": row[1], "messages": messages, "loading": False})
        return {"chats": chats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/history/save")
async def save_chat(body: dict = Body(...), current_user: str = Depends(get_current_user)):
    import json
    chat_id = str(body.get("chat_id", ""))
    chat_title = body.get("chat_title", "New Chat")
    messages = body.get("messages", [])
    if not chat_id:
        raise HTTPException(status_code=400, detail="chat_id required")
    try:
        messages_json = json.dumps(messages)
        with engine.begin() as conn:
            existing = conn.execute(text("SELECT id FROM ChatHistory WHERE user_email = :email AND chat_id = :chat_id"), {"email": current_user, "chat_id": chat_id}).fetchone()
            if existing:
                conn.execute(text("UPDATE ChatHistory SET chat_title = :title, messages = :messages, updated_at = GETDATE() WHERE user_email = :email AND chat_id = :chat_id"), {"email": current_user, "chat_id": chat_id, "title": chat_title, "messages": messages_json})
            else:
                conn.execute(text("INSERT INTO ChatHistory (user_email, chat_id, chat_title, messages) VALUES (:email, :chat_id, :title, :messages)"), {"email": current_user, "chat_id": chat_id, "title": chat_title, "messages": messages_json})
        return {"message": "Saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/history/delete")
async def delete_chat_endpoint(body: dict = Body(...), current_user: str = Depends(get_current_user)):
    chat_id = str(body.get("chat_id", ""))
    if not chat_id:
        raise HTTPException(status_code=400, detail="chat_id required")
    try:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM ChatHistory WHERE user_email = :email AND chat_id = :chat_id"), {"email": current_user, "chat_id": chat_id})
        return {"message": "Deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/history/clear")
async def clear_all_history(current_user: str = Depends(get_current_user)):
    try:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM ChatHistory WHERE user_email = :email"), {"email": current_user})
        return {"message": "All chats cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def get_table_schema(table_name: str, schema: str = "dbo"):

    query = """
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = :table
      AND TABLE_SCHEMA = :schema
    ORDER BY ORDINAL_POSITION
    """

    with engine.connect() as conn:
        result = conn.execute(
            text(query),
            {"table": table_name, "schema": schema}
        )

        return [
            (row[0], row[1])
            for row in result
        ]


def find_common_keys(schema1: list, schema2: list):
    """
    Find common join keys between two schemas.
    Strategy 1: exact lowercase match (e.g. customer_id = customer_id)
    Strategy 2: one table has 'x_id', other table has 'id' column named 'x' (e.g. Order_id ↔ OrderItemID via Orders)
    Strategy 3: partial suffix match — col in table1 ends with _id and matches a col in table2
    """
    cols1 = {col.lower(): col for col, _ in schema1}
    cols2 = {col.lower(): col for col, _ in schema2}

    common = []

    # Strategy 1: exact match
    for key in cols1:
        if key in cols2:
            common.append((cols1[key], cols2[key]))

    if common:
        return common

    # Strategy 2: cross-suffix match
    # e.g. table1 has "order_id", table2 has "orderitemid" or "order_item_id"
    for k1 in cols1:
        for k2 in cols2:
            # strip underscores and compare
            if k1.replace("_", "") == k2.replace("_", ""):
                common.append((cols1[k1], cols2[k2]))

    if common:
        return common

    # Strategy 3: if table1 has 'order_id', check if table2 has any col containing 'order'
    for k1 in cols1:
        if k1.endswith("_id") or k1.endswith("id"):
            base = k1.replace("_id", "").replace("id", "")
            for k2 in cols2:
                if base and base in k2:
                    common.append((cols1[k1], cols2[k2]))
                    break

    return common


def get_foreign_keys(table_name: str):
    """Get foreign key relationships for a table from DB metadata."""
    query = """
    SELECT
        fk.name AS fk_name,
        tp.name AS parent_table,
        cp.name AS parent_column,
        tr.name AS referenced_table,
        cr.name AS referenced_column
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
    INNER JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
    INNER JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
    INNER JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
    WHERE tp.name = :table OR tr.name = :table
    """
    with engine.connect() as conn:
        result = conn.execute(text(query), {"table": table_name})
        return [
            {
                "parent_table": row[1],
                "parent_column": row[2],
                "referenced_table": row[3],
                "referenced_column": row[4]
            }
            for row in result
        ]


def find_join_key_via_fk(table1: str, table2: str):
    """
    Try to find join key using actual foreign key constraints in the DB.
    Returns (col1, col2) or None.
    """
    fks = get_foreign_keys(table1)
    for fk in fks:
        if fk["parent_table"].lower() == table1.lower() and fk["referenced_table"].lower() == table2.lower():
            return fk["parent_column"], fk["referenced_column"]
        if fk["referenced_table"].lower() == table1.lower() and fk["parent_table"].lower() == table2.lower():
            return fk["referenced_column"], fk["parent_column"]
    return None


def detect_join_intent(question: str):
    """
    Detect if the user wants a JOIN.
    STRICT: only matches explicit 'join X to Y', 'combine X and Y', 'merge X with Y'
    Does NOT match analytical queries like 'max price from products with name'
    """
    patterns = [
        r"^join\s+(\w+)\s+(?:to|with)\s+(\w+)",
        r"^combine\s+(\w+)\s+(?:and|with)\s+(\w+)",
        r"^merge\s+(\w+)\s+(?:with|and)\s+(\w+)",
    ]

    q = question.strip()
    for pattern in patterns:
        match = re.search(pattern, q, re.IGNORECASE)
        if match:
            return match.group(1), match.group(2)

    return None


def generate_join_sql(table1: str, table2: str, schema1: list, schema2: list,
                       join_key1: str, join_key2: str, question: str):
    """Build JOIN SQL directly — no LLM for structure, LLM only picks SELECT columns."""

    cols1 = [col for col, _ in schema1]
    cols2 = [col for col, _ in schema2]

    # Build the fixed JOIN structure
    join_structure = f"""FROM [{table1}] AS t1
INNER JOIN [{table2}] AS t2 ON t1.[{join_key1}] = t2.[{join_key2}]"""

    prompt = f"""You are a Microsoft SQL Server expert.

Write ONLY the SELECT clause (columns) for this JOIN query.

Table 1: [{table1}] alias t1
Columns: {", ".join(cols1)}

Table 2: [{table2}] alias t2
Columns: {", ".join(cols2)}

The FROM and JOIN are already written:
{join_structure}

User question: {question}

STRICT RULES:
- Write ONLY the SELECT line, starting with SELECT TOP 100
- Use ONLY t1.[ColumnName] or t2.[ColumnName] format
- No FROM, no JOIN, no WHERE unless needed for filtering
- No explanation, no markdown, no semicolons

Example output:
SELECT TOP 100 t1.[Order_id], t1.[OrderDate], t2.[FirstName], t2.[LastName]

SELECT clause:"""

    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "llama3",
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0, "num_predict": 400}
        },
        timeout=120
    )

    select_clause = response.json().get("response", "").strip()
    select_clause = clean_sql_output(select_clause)

    # If LLM didn't give SELECT, build default
    if not select_clause.upper().startswith("SELECT"):
        select_cols1 = ", ".join(f"t1.[{c}]" for c in cols1)
        select_cols2 = ", ".join(f"t2.[{c}]" for c in cols2)
        select_clause = f"SELECT TOP 100 {select_cols1}, {select_cols2}"

    # Always append the correct FROM + JOIN
    sql = f"{select_clause}\n{join_structure}"
    return sql


def enforce_schema(sql: str, schema: list, table_name: str):

    valid_cols = [col.lower() for col, _ in schema]

    # Extract aliases defined in the SQL (AS alias) so we don't reject them
    aliases = set(
        m.lower() for m in re.findall(r"\bAS\s+\[?(\w+)\]?", sql, re.IGNORECASE)
    )

    # Get all table names and column names from entire DB
    try:
        with engine.connect() as conn:
            all_tables = set(
                row[0].lower() for row in conn.execute(text(
                    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' " + system_tables_sql() + ""
                ))
            )
            all_db_columns = set(
                row[0].lower() for row in conn.execute(text(
                    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS"
                ))
            )
    except Exception:
        all_tables = set()
        all_db_columns = set()

    used_cols = re.findall(r"\[([^\]]+)\]", sql)

    for col in used_cols:
        col_lower = col.lower()
        # Allow if: valid col, table name, alias, any DB table, any DB column across all tables
        if (col_lower not in valid_cols
                and col_lower != table_name.lower()
                and col_lower not in aliases
                and col_lower not in all_tables
                and col_lower not in all_db_columns):
            raise Exception(f"Invalid column used: {col}")

    sql = re.sub(r"\[\[", "[", sql)
    sql = re.sub(r"\]\]", "]", sql)

    return sql


def generate_sql(question: str, table_name: str, schema: list):
    columns = ", ".join(col for col, _ in schema)

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
- Never place TOP after ORDER BY.
- DO NOT use LIMIT.
- DO NOT use FETCH.
- DO NOT use OFFSET.
- Use GROUP BY ONLY when aggregation functions (COUNT, SUM, AVG, MAX, MIN) are used.
- Do NOT use GROUP BY for simple listing queries.
- If limiting results, use SELECT TOP N.
- The SELECT clause must include at least one column or *.

AGGREGATION RULES:
- Use GROUP BY ONLY when aggregation functions (COUNT, SUM, AVG, MIN, MAX) are used.
- Do NOT use GROUP BY for simple SELECT or listing queries.
- If the question asks for "top", "highest", "lowest", or ranking:
  • Use aggregation ONLY if totals or counts are required.
  • Otherwise, order by the relevant column and use TOP without GROUP BY.
- If using aggregation, the aggregated value MUST appear in the SELECT clause
  with an alias.
- When ordering by aggregation, use the alias in ORDER BY.
- Never use column aliases in GROUP BY.
- Do not use GROUP BY for simple COUNT(*) queries.
- For counting rows or tables, use COUNT(*) without GROUP BY.

FORMATTING RULES:
- All column references in SELECT, WHERE, GROUP BY, and ORDER BY
  must be wrapped correctly if they contain spaces.
- Output SQL only.
- No explanations.
- No markdown.
- No comments.
- Never double-wrap table names.
- Use exactly one pair of square brackets.

Question:
{question}

Respond with ONLY the SQL query. Start your response with SELECT. No preamble, no explanation, no text before SELECT.

SQL:
"""

    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "llama3",
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

    if "ORDER BY" in sql.upper() and "TOP" in sql.upper():

        match = re.search(r"TOP\s+(\d+)", sql, re.IGNORECASE)
        if match:
            top_n = match.group(1)

            sql = re.sub(r"TOP\s+\d+", "", sql, flags=re.IGNORECASE)

            sql = re.sub(
                r"SELECT",
                f"SELECT TOP {top_n}",
                sql,
                flags=re.IGNORECASE
            )

    return sql




def fix_offset_syntax(sql: str) -> str:
    """
    Fix OFFSET without FETCH NEXT — invalid in SQL Server.
    Also removes TOP if combined with OFFSET (TOP + OFFSET is invalid in SQL Server).
    Converts: SELECT TOP 1 ... ORDER BY x DESC OFFSET 1 ROW
    To:        SELECT ... ORDER BY x DESC OFFSET 1 ROWS FETCH NEXT 1 ROWS ONLY
    """
    if not re.search(r'\bOFFSET\b', sql, re.IGNORECASE):
        return sql

    # Already has FETCH NEXT — just normalize ROW → ROWS
    if re.search(r'\bFETCH\s+NEXT\b', sql, re.IGNORECASE):
        sql = re.sub(r'\bOFFSET\s+(\d+)\s+ROW\b', r'OFFSET \1 ROWS', sql, flags=re.IGNORECASE)
        return sql

    # Has OFFSET but no FETCH NEXT — fix it
    offset_match = re.search(r'\bOFFSET\s+(\d+)\s+ROWS?\b', sql, re.IGNORECASE)
    if offset_match:
        offset_n = int(offset_match.group(1))
        # Remove TOP N since it conflicts with OFFSET/FETCH
        sql = re.sub(r'\bTOP\s+\d+\s+', '', sql, flags=re.IGNORECASE)
        # Normalize OFFSET line and add FETCH NEXT
        sql = re.sub(
            r'\bOFFSET\s+\d+\s+ROWS?\b.*',
            f'OFFSET {offset_n} ROWS FETCH NEXT 1 ROWS ONLY',
            sql,
            flags=re.IGNORECASE
        )

    return sql


def fix_bracket_dot_notation(sql: str):
    """
    Fix incorrect bracket+dot patterns:
    1. [TableName].[ColumnName] → TableName.[ColumnName]
    2. [alias].ColumnName → alias.[ColumnName]  (e.g. [c].LastName → c.[LastName])
    """
    # Fix [TableName].[ColumnName] → TableName.[ColumnName]
    sql = re.sub(r'\[(\w+)\]\.\[(\w+)\]', r'\1.[\2]', sql)
    # Fix [alias].ColumnName → alias.[ColumnName]
    sql = re.sub(r'\[(\w+)\]\.(\w+)', r'\1.[\2]', sql)
    return sql


def fix_missing_from(sql: str, table_name: str):
    """If LLM forgot the FROM clause, add it."""
    if "FROM" not in sql.upper():
        sql = re.sub(
            r"(SELECT\b[\s\S]+?)(\s*WHERE|\s*ORDER|\s*GROUP|\s*HAVING|$)",
            rf"\1 FROM [{table_name}]\2",
            sql,
            count=1,
            flags=re.IGNORECASE
        )
    return sql


def clean_sql_output(raw_sql: str):
    # Remove markdown fences
    raw_sql = re.sub(r"```sql", "", raw_sql, flags=re.IGNORECASE)
    raw_sql = raw_sql.replace("```", "")

    # Remove common LLM preambles before SELECT
    raw_sql = re.sub(r"(?i)^(here is|here's|the sql|sql query|query)[^S]*", "", raw_sql.strip())

    # Find the FIRST real SELECT keyword and cut everything before it
    select_match = re.search(r"\bSELECT\b", raw_sql, re.IGNORECASE)
    if select_match:
        raw_sql = raw_sql[select_match.start():]

    # Fix "SELECT TOP 100 Here is the SQL query:\n\nSELECT..." — remove text between first SELECT and second SELECT
    raw_sql = re.sub(r"(SELECT\s+(?:TOP\s+\d+\s+)?)[^\n]*\n+\s*(SELECT\b)", r"\2", raw_sql, flags=re.IGNORECASE)

    # Fix double SELECT SELECT
    raw_sql = re.sub(r"SELECT\s+SELECT\b", "SELECT", raw_sql, flags=re.IGNORECASE)

    # Find first complete SELECT statement ending at semicolon
    match = re.search(r"(SELECT[\s\S]+?;)", raw_sql, re.IGNORECASE)
    if match:
        sql = match.group(1).strip()
    else:
        match = re.search(r"(SELECT[\s\S]+?)(\n\n|$)", raw_sql, re.IGNORECASE)
        sql = match.group(1).strip() if match else raw_sql.strip()

    # Strip trailing natural language after SQL
    lines = sql.splitlines()
    sql_lines = []
    for line in lines:
        stripped = line.strip()
        if sql_lines and stripped and not any(
            kw in stripped.upper() for kw in [
                "SELECT", "FROM", "WHERE", "JOIN", "ON", "GROUP", "ORDER",
                "HAVING", "INNER", "LEFT", "RIGHT", "OUTER", "TOP", "AS",
                "AND", "OR", "BY", "DESC", "ASC", "COUNT", "SUM", "AVG",
                "MAX", "MIN", "DISTINCT", "WITH", "UNION", "[", ")", "("
            ]
        ) and re.match(r'^[A-Z][a-z]', stripped):
            break
        sql_lines.append(line)

    return "\n".join(sql_lines).strip()


def convert_limit_to_top(sql: str):
    match = re.search(r"LIMIT\s+(\d+)", sql, re.IGNORECASE)
    if match:
        limit_value = match.group(1)

        sql = re.sub(r"LIMIT\s+\d+;", "", sql, flags=re.IGNORECASE)
        sql = re.sub(r"LIMIT\s+\d+", "", sql, flags=re.IGNORECASE)

        sql = re.sub(
            r"SELECT",
            f"SELECT TOP {limit_value}",
            sql,
            count=1,
            flags=re.IGNORECASE
        )

    return sql

def is_safe_sql(sql: str):
    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "EXEC", "TRUNCATE"]
    sql_stripped = sql.strip().upper()
    return sql_stripped.startswith("SELECT") and not any(f in sql_stripped for f in forbidden)


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

    if chart_pref:
        return {
            "type": chart_pref,
            "labels": df[category_col].astype(str).tolist(),
            "values": pd.to_numeric(df[numeric_col], errors="coerce").round(2).fillna(0).tolist()
        }

    unique_count = df[category_col].nunique()

    if unique_count <= 8:
        chart_type = "pie"
    else:
        chart_type = "bar"

    return {
        "type": chart_type,
        "labels": df[category_col].astype(str).tolist(),
        "values": pd.to_numeric(df[numeric_col], errors="coerce").round(2).fillna(0).tolist()
    }

def suggest_chart(df: pd.DataFrame, question: str):
    """
    Use actual data to suggest a chart — no hallucination.
    Returns suggestion dict or None if chart not appropriate.
    """
    # Hard rules first — no LLM needed
    if df.shape[1] < 2 or len(df) < 2:
        return None

    numeric_cols = list(df.select_dtypes(include="number").columns)
    non_numeric_cols = list(df.select_dtypes(exclude="number").columns)

    if not numeric_cols or not non_numeric_cols:
        return None

    # Build a small sample to show LLM — max 5 rows, real data
    sample = df.head(5).to_string(index=False)
    columns_info = ", ".join(
        f"{col} ({'numeric' if col in numeric_cols else 'text'})"
        for col in df.columns
    )

    prompt = f"""You are a data visualization expert. Look at this query result and suggest the best chart.

Question asked: {question}

Columns: {columns_info}

Sample data (first 5 rows):
{sample}

Rules:
- Only suggest a chart if data has at least 1 numeric and 1 text/category column
- chart_type must be ONLY one of: bar, pie, line
- Use pie only if there are 8 or fewer unique categories
- Use line only if data has time/date or sequential ordering
- Use bar for comparisons and rankings
- x_column must be an EXACT column name from the data
- y_column must be an EXACT numeric column name from the data
- reason must be 1 short sentence explaining why

Respond ONLY with valid JSON like this (no markdown, no explanation):
{{"should_suggest": true, "chart_type": "bar", "x_column": "ProductName", "y_column": "Price", "reason": "Comparing prices across products"}}

If chart is not appropriate respond with:
{{"should_suggest": false}}"""

    try:
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3",
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0, "num_predict": 100}
            },
            timeout=30
        )
        raw = response.json().get("response", "").strip()

        # Clean JSON — remove markdown fences if any
        raw = re.sub(r"```json|```", "", raw).strip()

        # Find first JSON object
        match = re.search(r'\{.*?\}', raw, re.DOTALL)
        if not match:
            return None

        result = __import__('json').loads(match.group(0))

        if not result.get("should_suggest"):
            return None

        chart_type = result.get("chart_type", "").lower()
        if chart_type not in ["bar", "pie", "line"]:
            return None

        x_col = result.get("x_column")
        y_col = result.get("y_column")

        # Validate columns actually exist in dataframe
        if x_col not in df.columns or y_col not in df.columns:
            return None

        # Validate y_col is actually numeric
        if y_col not in numeric_cols:
            return None

        labels = df[x_col].astype(str).tolist()
        values = pd.to_numeric(df[y_col], errors="coerce").round(2).fillna(0).tolist()
        return {
            "chart_type": chart_type,
            "x_column": x_col,
            "y_column": y_col,
            "reason": result.get("reason", ""),
            "labels": labels,
            "values": values
        }

    except Exception as e:
        print("Chart suggestion error:", repr(e))
        return None


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
Do not add extra information.
Keep it concise.
"""

    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "llama3",
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.3,
                "num_predict": 400
            }
        },
        timeout=120
    )

    return response.json().get("response", "").strip()


def is_meta_question(question: str):
    """Detect if user is asking ABOUT the loaded table, not querying it."""
    q = question.lower()
    return any(phrase in q for phrase in [
        "what is this", "what is the table", "what is this table",
        "describe", "tell me about", "what does this table",
        "about this data", "about the data", "what columns",
        "what fields", "table structure", "what data", "what kind",
        "what type", "explain this", "explain the table",
        "overview of", "what info", "what information",
        "show all column", "show columns", "column names",
        "all columns", "list columns", "list fields"
    ])


def answer_meta_question(table_name: str, schema: list):
    """Answer meta questions directly from schema — no SQL needed."""
    col_lines = "\n".join(
        f"  - {col} ({dtype})" for col, dtype in schema
    )
    return (
        f"The **{table_name}** table has {len(schema)} columns:\n\n"
        f"{col_lines}\n\n"
        f"This table appears to store **{table_name.lower()}** related records. "
        f"You can ask me things like:\n"
        f"  - Show top 10 rows\n"
        f"  - Count total records\n"
        f"  - Show summary / overview"
    )


def is_db_question(question: str):
    """Detect if user is asking about the DATABASE itself (not a specific table)."""
    q = question.lower()
    return any(phrase in q for phrase in [
        "how many tables", "total tables", "number of tables",
        "list all tables", "show all tables", "what tables",
        "which tables", "tables in db", "tables in database",
        "tables in this db", "tables in this database",
        "database size", "db size", "size of db", "size of database",
        "size of the db", "size of the database", "what is the size",
        "how big is", "how large is",
        "database name", "db name", "what is the db", "what is the database",
        "what db", "tell me about the db", "tell me about the database",
        "database info", "db info", "database overview", "db overview",
        "what tables are", "show tables", "list tables",
        "show me table", "show me all table", "table name", "all table name",
        "show table name", "show all table", "tell me table",
        "summary of all", "summarize all", "overview of all",
        "explain all tables", "tell me about all", "describe all",
        "what do these tables", "about all tables", "about the tables",
        "what does each table",
        "what join", "which join", "possible join", "join functions",
        "what can i join", "how can i join", "joins possible",
        "what queries", "what can i ask", "what questions can",
        "what can this db", "what insights", "what analysis"
    ])


def answer_db_question(question: str):
    """Answer DB-level questions directly from INFORMATION_SCHEMA — no LLM needed."""
    q = question.lower()

    with engine.connect() as conn:
        db_name = conn.execute(text("SELECT DB_NAME()")).scalar()
        table_count = conn.execute(text(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' " + system_tables_sql() + ""
        )).scalar()
        tables = [
            row[0] for row in conn.execute(text(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                "WHERE TABLE_TYPE='BASE TABLE' " + system_tables_sql() + " ORDER BY TABLE_NAME"
            ))
        ]
        db_size = conn.execute(text(
            "SELECT SUM(size) * 8 / 1024 FROM sys.database_files"
        )).scalar()

    table_list = "\n".join(f"  - {t}" for t in tables)

    # Answer based on what they asked
    if any(p in q for p in ["how many", "total", "number of"]):
        return (
            f"The **{db_name}** database has **{table_count} tables**:\n\n"
            f"{table_list}"
        )

    if any(p in q for p in ["size", "how big"]):
        return f"The **{db_name}** database is **{round(db_size, 2)} MB** in size."

    if any(p in q for p in ["list", "show", "what tables", "which tables"]):
        return (
            f"The **{db_name}** database contains **{table_count} tables**:\n\n"
            f"{table_list}"
        )

    # Summary — explain each table with columns + row count
    if any(p in q for p in ["summary", "summarize", "overview", "explain", "tell me about", "describe", "what do", "what does", "about"]):
        lines = [f"## 🗄️ {db_name} Database Summary\n"]
        lines.append(f"**{table_count} tables** | **{round(db_size, 2)} MB**\n")
        lines.append("---")

        for table in tables:
            try:
                schema = get_table_schema(table)
                with engine.connect() as conn:
                    row_count = conn.execute(text(f"SELECT COUNT(*) FROM [{table}]")).scalar()
                col_names = ", ".join(f"`{col}`" for col, _ in schema[:6])
                if len(schema) > 6:
                    col_names += f" +{len(schema)-6} more"

                # Simple rule-based description
                t_lower = table.lower()
                if "customer" in t_lower:
                    desc = "Stores customer personal details like name, email, phone, and address."
                elif "order_item" in t_lower or "orderitem" in t_lower:
                    desc = "Links orders to products — tracks which products were in each order with quantity and price."
                elif "order" in t_lower:
                    desc = "Records each purchase transaction with date, total amount, and customer reference."
                elif "product" in t_lower:
                    desc = "Catalog of all products with name, price, stock, and category."
                elif "categor" in t_lower:
                    desc = "Product categories — groups products into logical sections."
                elif "changelog" in t_lower or "log" in t_lower:
                    desc = "Tracks system or data changes over time."
                else:
                    desc = f"Contains {row_count} records with {len(schema)} columns."

                lines.append(f"\n### 📋 {table}")
                lines.append(f"{desc}")
                lines.append(f"- **Rows:** {row_count:,}")
                lines.append(f"- **Columns ({len(schema)}):** {col_names}")
            except:
                lines.append(f"\n### 📋 {table}\n- Could not fetch details.")

        return "\n".join(lines)

    # JOIN possibilities / general DB questions — use LLM
    if any(p in q for p in [
        "join", "what can", "what queries", "what questions",
        "insights", "analysis", "what can i ask", "possible"
    ]):
        # Build schema context for LLM
        schema_lines = []
        for table in tables:
            try:
                schema = get_table_schema(table)
                cols = ", ".join(f"{col}" for col, _ in schema)
                with engine.connect() as conn:
                    row_count = conn.execute(text(f"SELECT COUNT(*) FROM [{table}]")).scalar()
                schema_lines.append(f"- {table} ({row_count} rows): {cols}")
            except:
                schema_lines.append(f"- {table}")

        schema_text = "\n".join(schema_lines)

        if any(p in q for p in ["insight", "analysis", "what can i get", "what can i do", "what can i ask", "what questions"]):
            prompt = f"""You are a helpful data analyst. A user has a SQL database called '{db_name}' with these tables:

{schema_text}

The user asked: "{question}"

Give a friendly, practical answer in this format:
1. Briefly explain what kind of data this database contains (1-2 sentences)
2. List 5-7 specific and interesting questions/insights the user can get, like:
   - "Which customer has placed the most orders?"
   - "What is the total revenue per product category?"
   - "Which products are running low on stock?"
   - "Show me all orders placed by a specific customer"
3. Mention 2-3 JOIN combinations that unlock powerful insights

Be specific, practical, and use the actual table and column names."""
        else:
            prompt = f"""You are a helpful data analyst. The user has a SQL database called '{db_name}' with these tables:

{schema_text}

User question: "{question}"

Answer helpfully and specifically using the actual table names and columns. List possible JOIN combinations with the actual column names used to join them."""

        try:
            resp = requests.post(
                "http://localhost:11434/api/generate",
                json={"model": "llama3", "prompt": prompt, "stream": False,
                      "options": {"temperature": 0.3, "num_predict": 400}},
                timeout=60
            )
            answer = resp.json().get("response", "").strip()
            if answer:
                return answer
        except:
            pass

        # Fallback — rule-based JOIN list
        lines = [f"## 🔗 Possible JOINs in **{db_name}**\n"]
        try:
            all_schemas = {t: get_table_schema(t) for t in tables}
            for i, t1 in enumerate(tables):
                for t2 in tables[i+1:]:
                    fk = find_join_key_via_fk(t1, t2) or find_join_key_via_fk(t2, t1)
                    if not fk:
                        common = find_common_keys(all_schemas[t1], all_schemas[t2])
                        fk = common[0] if common else None
                    if fk:
                        lines.append(f"- **{t1}** ⟷ **{t2}** on `{fk[0]}`")
        except:
            pass
        return "\n".join(lines) if len(lines) > 1 else f"Try: `join Orders to Customers`, `join Products to Categories`"

    # General DB overview
    return (
        f"**Database:** {db_name}\n"
        f"**Total Tables:** {table_count}\n"
        f"**Size:** {round(db_size, 2)} MB\n\n"
        f"**Tables:**\n{table_list}"
    )


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


def is_row_query(question: str):
    """Returns True when user is simply fetching rows — no explanation needed."""
    q = question.lower()
    return any(phrase in q for phrase in [
        "show me", "show top", "show all", "get top", "get me",
        "top ", "fetch", "list all", "display", "give me",
        "first ", "last ", "select", "rows", "records",
        "per order", "per customer", "per product", "per category",
        "each order", "each customer", "each product", "each category",
        "all orders", "all customers", "all products"
    ])


def user_wants_chart(question: str):
    """Returns True ONLY if user explicitly asks for a chart/graph/plot."""
    q = question.lower()
    return any(word in q for word in [
        "chart", "plot", "graph", "visualize", "visualization",
        "pie chart", "bar chart", "line chart", "scatter",
        "show chart", "draw", "diagram"
    ])


def _join_all_tables_sql():
    """Build a JOIN-all-tables SQL directly from FK relationships — no LLM, no truncation."""
    try:
        # Get all data tables
        with engine.connect() as conn:
            data_tables = [row[0] for row in conn.execute(text(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' " + system_tables_sql()
            ))]

            # Get FK relationships
            fk_rows = conn.execute(text("""
                SELECT tp.name, cp.name, tr.name, cr.name
                FROM sys.foreign_keys fk
                INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
                INNER JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
                INNER JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
                INNER JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
                INNER JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
            """)).fetchall()

        # Build alias map
        alias_map = {}
        for t in data_tables:
            words = re.split(r'[_\s]', t.lower())
            base = "".join(w[0] for w in words if w)
            alias_map[t] = base

        # Build FK lookup: (child_table, parent_table) -> (child_col, parent_col)
        fk_lookup = {}
        for r in fk_rows:
            child, child_col, parent, parent_col = r[0], r[1], r[2], r[3]
            if child in data_tables and parent in data_tables:
                fk_lookup[(child, parent)] = (child_col, parent_col)

        # Find root table (referenced most = likely Customers or Products)
        ref_count = {t: 0 for t in data_tables}
        for (child, parent) in fk_lookup:
            ref_count[parent] = ref_count.get(parent, 0) + 1
        root = max(ref_count, key=ref_count.get) if ref_count else data_tables[0]

        # BFS to build join order
        joined = [root]
        joins = []
        remaining = [t for t in data_tables if t != root]

        for _ in range(len(remaining)):
            for t in remaining[:]:
                for j in joined:
                    if (t, j) in fk_lookup:
                        tc, jc = fk_lookup[(t, j)]
                        joins.append(f"JOIN [{t}] AS {alias_map[t]} ON {alias_map[t]}.[{tc}] = {alias_map[j]}.[{jc}]")
                        joined.append(t)
                        remaining.remove(t)
                        break
                    elif (j, t) in fk_lookup:
                        jc, tc = fk_lookup[(j, t)]
                        joins.append(f"JOIN [{t}] AS {alias_map[t]} ON {alias_map[j]}.[{jc}] = {alias_map[t]}.[{tc}]")
                        joined.append(t)
                        remaining.remove(t)
                        break

        from_clause = f"FROM [{root}] AS {alias_map[root]}"
        join_clause = "\n".join(joins)
        sql = "SELECT TOP 100 *\n" + from_clause + "\n" + join_clause

        df = execute_sql(sql)
        if df is None or df.empty:
            return {"reply": "No results found.", "chart": None, "table_data": None}

        table_data = {
            "columns": list(df.columns),
            "rows": df.head(100).fillna("").values.tolist()
        }
        reply = f"Joined all {len(data_tables)} tables: {', '.join(data_tables)}. Showing {len(df)} rows."
        return {"reply": reply, "sql": sql, "chart": None, "table_data": table_data}

    except Exception as e:
        print("join_all_tables error:", e)
        return None


def generate_sql_all_tables(question: str):
    """Generate SQL using full DB schema — simple and reliable approach."""
    try:
        # Special case: join all tables → build SQL directly, no LLM needed
        q_lower = question.lower().strip()
        join_all_phrases = ["join all", "all tables", "combine all", "merge all", "full join",
                            "show everything", "show all data", "full database", "complete data",
                            "display all", "get everything", "fetch all"]
        if any(p in q_lower for p in join_all_phrases):
            return _join_all_tables_sql()

        with engine.connect() as conn:
            all_tables = [row[0] for row in conn.execute(text(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' " + system_tables_sql() + ""
            ))]

        # Build schema
        all_schemas = {}
        schema_lines = []
        for table in all_tables:
            schema = get_table_schema(table)
            all_schemas[table] = schema
            cols = ", ".join(f"{col}" for col, _ in schema)
            schema_lines.append(f"[{table}]: {cols}")
        schema_text = "\n".join(schema_lines)

        # Build FK info
        fk_lines = []
        try:
            with engine.connect() as conn:
                fk_rows = conn.execute(text("""
                    SELECT tp.name, cp.name, tr.name, cr.name
                    FROM sys.foreign_keys fk
                    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
                    INNER JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
                    INNER JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
                    INNER JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
                    INNER JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
                """)).fetchall()
                for r in fk_rows:
                    fk_lines.append(f"[{r[0]}].{r[1]} -> [{r[2]}].{r[3]}")
        except:
            pass
        fk_text = "\n".join(fk_lines) if fk_lines else "None"

        prompt = f"""You are a Microsoft SQL Server expert. Write ONE complete SQL SELECT query.

SCHEMA:
{schema_text}

FOREIGN KEYS (use for JOINs):
{fk_text}

RULES:
1. Use actual table names in brackets: FROM [TableName] AS x
2. Use short aliases: Customers=c, Orders=o, Products=p, Categories=cat, Order_items=oi
3. Always write complete FROM clause: FROM [TableName] AS alias
4. JOIN syntax: JOIN [TableName] AS alias ON a.[col] = b.[col]
5. Use exact column names from SCHEMA above
6. If COUNT/SUM/AVG used → add GROUP BY all non-aggregated columns
7. Use TOP 100, never LIMIT
8. Return ONLY the SQL query, nothing else
9. ONLY use tables listed in SCHEMA above — do NOT use Users, ChatHistory or any system table not in SCHEMA
10. If asked to join ALL tables, only join the tables listed in SCHEMA above — nothing else

Question: {question}

SQL (start with SELECT, write complete query):"""

        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3",
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0, "num_predict": 800, "stop": ["\n\n\n", "Note:", "This query"]}
            },
            timeout=120
        )

        raw_sql = response.json().get("response", "").strip()
        if not raw_sql.upper().startswith("SELECT"):
            raw_sql = "SELECT " + raw_sql
        
        sql = clean_sql_output(raw_sql)
        sql = fix_top_position(sql)
        sql = fix_offset_syntax(sql)
        sql = convert_limit_to_top(sql)
        sql = sql.rstrip(";").strip()
        sql = sql.replace("[[", "[").replace("]]", "]")
        sql = auto_fix_group_by(sql)

        print("All-tables SQL:", sql[:200])

        # Validate complete FROM clause
        if not re.search(r'\bFROM\s+\[', sql, re.IGNORECASE):
            print("SQL missing proper FROM clause")
            return {"reply": "❌ Could not generate a valid query. Please select a specific table first or rephrase your question.", "chart": None, "table_data": None}

        if not is_safe_sql(sql):
            return {"error": "Unsafe SQL blocked"}

        try:
            df = execute_sql(sql)
        except Exception as e1:
            print("SQL error:", repr(e1))
            return {"reply": f"❌ Query failed: {str(e1)[:200]}", "chart": None, "table_data": None}

        if df.empty:
            return {"reply": "No results found.", "chart": None, "table_data": None}

        table_preview = {
            "columns": list(df.columns),
            "rows": df.head(100).fillna("").values.tolist()
        }

        intent = detect_intent(question)
        explanation = "" if is_row_query(question) else explain_result(question, df, intent)
        chart_data = auto_detect_chart(df, detect_chart_preference(question)) if user_wants_chart(question) else None
        chart_suggestion = None
        if not user_wants_chart(question):
            chart_suggestion = suggest_chart(df, question)

        return {
            "reply": explanation,
            "chart": chart_data,
            "table_data": table_preview,
            "chart_suggestion": chart_suggestion
        }

    except Exception as e:
        print("All-tables error:", repr(e))
        return {"error": str(e)}


def auto_fix_group_by(sql: str) -> str:
    """
    Auto-add GROUP BY if SQL has aggregation (COUNT/SUM/AVG/MAX/MIN)
    but missing GROUP BY clause.
    """
    sql_upper = sql.upper()

    # Only fix if aggregation present but GROUP BY missing
    has_agg = any(f in sql_upper for f in ["COUNT(", "SUM(", "AVG(", "MAX(", "MIN("])
    has_group_by = "GROUP BY" in sql_upper

    if not has_agg or has_group_by:
        return sql  # Nothing to fix

    # Extract SELECT clause columns
    select_match = re.search(r"SELECT\s+(?:TOP\s+\d+\s+)?(.*?)\s+FROM\b", sql, re.IGNORECASE | re.DOTALL)
    if not select_match:
        return sql

    select_cols_raw = select_match.group(1)

    # Split by comma but respect parentheses
    cols = []
    depth = 0
    current = ""
    for ch in select_cols_raw:
        if ch == "(": depth += 1
        elif ch == ")": depth -= 1
        if ch == "," and depth == 0:
            cols.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        cols.append(current.strip())

    # Keep only non-aggregated columns (no function calls)
    non_agg_cols = []
    agg_pattern = re.compile(r"(COUNT|SUM|AVG|MAX|MIN)\s*\(", re.IGNORECASE)
    for col in cols:
        if not agg_pattern.search(col):
            # Remove alias (AS ...) from the column
            col_clean = re.sub(r"\s+AS\s+\w+$", "", col, flags=re.IGNORECASE).strip()
            non_agg_cols.append(col_clean)

    if not non_agg_cols:
        return sql

    group_by_clause = ", ".join(non_agg_cols)

    # Insert GROUP BY before ORDER BY if exists, otherwise append
    if "ORDER BY" in sql_upper:
        sql = re.sub(
            r"(ORDER\s+BY\b)",
            f"GROUP BY {group_by_clause}\n\\1",
            sql,
            count=1,
            flags=re.IGNORECASE
        )
    else:
        sql = sql.rstrip() + f"\nGROUP BY {group_by_clause}"

    return sql


def build_join_chain(relevant_tables: list, table_schemas: dict):
    """Build a chain of JOINable tables using FK relationships."""
    if not relevant_tables:
        return []

    def get_link(t1, t2):
        fk = find_join_key_via_fk(t1, t2)
        if fk:
            return fk
        common = find_common_keys(table_schemas[t1], table_schemas[t2])
        return common[0] if common else None

    best_chain = []
    for start in relevant_tables:
        chain = [start]
        remaining = [t for t in relevant_tables if t != start]
        while remaining:
            found = False
            for t in remaining:
                for existing in chain:
                    if get_link(existing, t):
                        chain.append(t)
                        remaining.remove(t)
                        found = True
                        break
                if found:
                    break
            if not found:
                break
        if len(chain) > len(best_chain):
            best_chain = chain
    return best_chain


def generate_multistep_join_sql(chain: list, table_schemas: dict, question: str):
    """Generate SQL for a multi-table JOIN chain."""
    if len(chain) < 2:
        return None

    alias_map = {}
    schema_parts = []
    for i, table in enumerate(chain):
        alias = f"t{i+1}"
        alias_map[table] = alias
        cols = ", ".join(col for col, _ in table_schemas[table])
        schema_parts.append(f"[{table}] alias={alias}: {cols}")

    join_conditions = []
    for i in range(len(chain) - 1):
        t1, t2 = chain[i], chain[i+1]
        a1, a2 = alias_map[t1], alias_map[t2]
        fk = find_join_key_via_fk(t1, t2)
        if not fk:
            common = find_common_keys(table_schemas[t1], table_schemas[t2])
            if common:
                fk = common[0]
        if fk:
            join_conditions.append(
                f"JOIN [{t2}] AS {a2} ON {a1}.[{fk[0]}] = {a2}.[{fk[1]}]"
            )

    tables_info = "\n".join(schema_parts)
    joins_info = "\n".join(join_conditions)
    alias_info = "\n".join(f"  {alias} = [{table}]" for table, alias in alias_map.items())

    prompt = f"""You are a Microsoft SQL Server expert. Write a SQL query using multiple JOINs.

TABLE ALIASES (use ONLY these):
{alias_info}

TABLE COLUMNS:
{tables_info}

JOIN STRUCTURE (use exactly this):
FROM [{chain[0]}] AS t1
{joins_info}

STRICT RULES:
- Use ONLY the aliases listed (t1, t2, t3 etc)
- ALWAYS use alias.[ColumnName] — e.g. t1.[FirstName]
- NEVER use table names directly — only aliases
- Use TOP N instead of LIMIT
- Wrap all column names in square brackets
- If using COUNT/SUM/AVG/MAX/MIN — MUST add GROUP BY for all non-aggregated SELECT columns
- GROUP BY must come before ORDER BY
- Return ONLY the SQL query starting with SELECT. No explanation.
- NEVER use Users, ChatHistory or any system table not listed in the schema above
- Data tables are ONLY the ones listed in the schema above — nothing else

Example with aggregation:
SELECT TOP 5 t1.[FirstName], t1.[LastName], COUNT(t2.[Order_id]) AS TotalOrders
FROM [Customers] AS t1
JOIN [Orders] AS t2 ON t1.[customer_id] = t2.[Customer_id]
GROUP BY t1.[FirstName], t1.[LastName]
ORDER BY TotalOrders DESC

Question: {question}
SQL:"""

    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "llama3",
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0, "num_predict": 800}
        },
        timeout=120
    )
    return response.json().get("response", "").strip()


def try_smart_multitable(question: str):
    """
    Detects if a question needs data from multiple tables.
    Supports 2, 3, 4, or 5 table JOINs automatically.
    """
    # Special case: join all tables → use direct SQL builder
    q_lower = question.lower().strip()
    # Generic join-all phrases (language-based, intentionally kept)
    join_all_phrases = ["join all", "all tables", "combine all", "merge all", "full join",
                        "show everything", "show all data", "full database", "complete data",
                        "display all", "get everything", "fetch all"]
    if any(p in q_lower for p in join_all_phrases):
        return _join_all_tables_sql()

    try:
        with engine.connect() as conn:
            all_tables = [
                row[0] for row in conn.execute(text(
                    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' " + system_tables_sql() + ""
                ))
            ]

        q = question.lower()
        q_normalized = q.replace(" ", "_").replace("-", "_")
        table_schemas = {t: get_table_schema(t) for t in all_tables}

        # Dynamic semantic map — built from actual table/column names in DB
        # No hardcoding — works with any DB schema
        semantic_map = {}
        for table, schema in table_schemas.items():
            t_lower = table.lower().rstrip("s")  # singular form: customers→customer
            # Table name itself as keyword
            semantic_map.setdefault(t_lower, [])
            if table.lower() not in semantic_map[t_lower]:
                semantic_map[t_lower].append(table.lower())
            # Each column name as keyword → maps to its table
            for col, _ in schema:
                col_lower = col.lower().rstrip("s")  # singular: orders→order
                semantic_map.setdefault(col_lower, [])
                if table.lower() not in semantic_map[col_lower]:
                    semantic_map[col_lower].append(table.lower())
                # Also add full col name
                semantic_map.setdefault(col.lower(), [])
                if table.lower() not in semantic_map[col.lower()]:
                    semantic_map[col.lower()].append(table.lower())

        # Find relevant tables by name, column, or semantic keyword
        relevant_tables = []
        for table, schema in table_schemas.items():
            col_names = [col.lower() for col, _ in schema]
            table_lower = table.lower()
            table_normalized = table_lower.replace("_", " ")

            # Direct table name match
            direct_match = (table_lower in q or
                table_normalized in q or
                table_lower in q_normalized or
                any(col in q for col in col_names))

            # Semantic keyword match — using dynamic map
            semantic_match = False
            for keyword, related_tables in semantic_map.items():
                if keyword in q and any(rt in table_lower for rt in related_tables):
                    semantic_match = True
                    break

            if direct_match or semantic_match:
                if table not in relevant_tables:
                    relevant_tables.append(table)

        if len(relevant_tables) < 2:
            return None

        # Build best possible JOIN chain
        chain = build_join_chain(relevant_tables, table_schemas)

        if len(chain) < 2:
            return None

        print(f"Multi-step JOIN chain: {' → '.join(chain)}")

        # Generate SQL for the chain
        if len(chain) == 2:
            # Simple 2-table JOIN
            t1, t2 = chain[0], chain[1]
            fk = find_join_key_via_fk(t1, t2)
            if not fk:
                common = find_common_keys(table_schemas[t1], table_schemas[t2])
                fk = common[0] if common else None
            if not fk:
                return None
            raw_sql = generate_join_sql(t1, t2, table_schemas[t1], table_schemas[t2], fk[0], fk[1], question)
        else:
            # Multi-step JOIN (3+ tables)
            raw_sql = generate_multistep_join_sql(chain, table_schemas, question)

        if not raw_sql:
            return None

        sql = clean_sql_output(raw_sql)
        sql = fix_top_position(sql)
        sql = fix_offset_syntax(sql)
        sql = fix_bracket_dot_notation(sql)
        sql = convert_limit_to_top(sql)
        sql = sql.rstrip(";")
        sql = sql.replace("[[", "[").replace("]]", "]")
        sql = auto_fix_group_by(sql)

        print(f"Multi-step SQL: {sql}")

        if not is_safe_sql(sql):
            return None

        df = execute_sql(sql)

        if df.empty:
            return {"reply": "No results found.", "chart": None, "table_data": None}

        table_preview = {
            "columns": list(df.columns),
            "rows": df.head(100).fillna("").values.tolist()
        }

        explanation = "" if is_row_query(question) else explain_result(question, df, detect_intent(question))
        chart_data = auto_detect_chart(df, detect_chart_preference(question)) if user_wants_chart(question) else None

        # Chart suggestion
        chart_suggestion = None
        if not user_wants_chart(question):
            chart_suggestion = suggest_chart(df, question)

        join_key_str = " → ".join(chain)
        table1 = chain[0]
        table2 = chain[-1]

        return {
            "reply": explanation,
            "chart": chart_data,
            "table_data": table_preview,
            "sql": sql,
            "isJoin": True,
            "join_key": join_key_str,
            "table1": table1,
            "table2": table2,
            "rows": len(df),
            "all_common_keys": chain,
            "chart_suggestion": chart_suggestion
        }

    except Exception as e:
        print("Smart multitable error:", repr(e))
        return None


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
    return None


def is_data_query(question: str) -> bool:
    """
    Uses LLM to classify if question needs SQL execution or is conversational.
    Falls back to keyword heuristics if LLM is unavailable.
    """
    q = question.lower().strip()

    # Fast-path: obvious conversational — skip LLM call entirely
    obvious_conversational = [
        "hello", "hi ", "hey ", "thanks", "thank you", "bye",
        "what is your name", "who are you", "how are you"
    ]
    if any(q.startswith(p) or p == q for p in obvious_conversational):
        return False

    # Fast-path: obvious data signals — skip LLM call entirely
    obvious_data = [
        "show ", "list ", "get ", "fetch ", "display ", "give me",
        "top ", "count ", "sum ", "total ", "average ", "avg ",
        "chart", "plot", "graph", "join ", "per order", "per customer",
        "per product", "per category", "now show", "also show",
        "filter by", "sort by", "order by",
    ]
    if any(signal in q for signal in obvious_data):
        return True

    # LLM classifier for ambiguous questions
    try:
        prompt = (
            f'You are a classifier. Does this question require running a SQL query on a retail database to answer it? '
            f'Answer ONLY "yes" or "no".\n'
            f'Question: {question}'
        )
        resp = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3",
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0, "num_predict": 3, "stop": ["\n", "."]}
            },
            timeout=15
        )
        answer = resp.json().get("response", "").strip().lower()
        print(f"is_data_query LLM: '{question[:60]}' → '{answer}'")
        return answer.startswith("yes")
    except Exception:
        # Fallback if LLM unavailable — default to True (run SQL) for unknown questions
        return True


def answer_with_llm(question: str, context: str = "") -> str:
    """Use Llama3 to answer general/conversational questions with DB context."""
    try:
        with engine.connect() as conn:
            db_name = conn.execute(text("SELECT DB_NAME()")).scalar()
            all_tables = [row[0] for row in conn.execute(text(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' " + system_tables_sql() + ""
            ))]

        schema_lines = []
        for table in all_tables:
            try:
                schema = get_table_schema(table)
                cols = ", ".join(col for col, _ in schema)
                schema_lines.append(f"- {table}: {cols}")
            except:
                schema_lines.append(f"- {table}")

        schema_text = "\n".join(schema_lines)

        context_section = f"\nConversation so far:\n{context}\n" if context else ""

        prompt = f"""You are a helpful AI data assistant for a retail database called '{db_name}'.

The database has these tables:
{schema_text}
{context_section}
User question: {question}

Answer in a friendly, helpful and practical way. Be specific — mention actual table names and column names where relevant. If the user seems to want data, suggest what they can ask."""

        resp = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3",
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.4, "num_predict": 400}
            },
            timeout=60
        )
        answer = resp.json().get("response", "").strip()
        return answer if answer else "I'm not sure how to answer that. Try asking for specific data like 'show all customers' or 'total revenue per category'."
    except Exception as e:
        return "I couldn't process that question. Try asking for specific data like 'show top 5 products by price'."


# -------------------------
# JOIN ENDPOINT
# -------------------------

@app.post("/join")
async def join_tables(body: dict = Body(...), current_user: str = Depends(get_current_user)):
    try:
        question = body.get("message", "")

        # --- If it's a DB-level/general question, redirect to chat logic ---
        if is_db_question(question):
            return {"reply": answer_db_question(question), "chart": None}

        # --- Try multi-table smart JOIN first (3+ tables or natural language) ---
        multi_result = try_smart_multitable(question)
        if multi_result:
            return multi_result

        # 1. Detect table names from the question
        join_pair = detect_join_intent(question)
        if not join_pair:
            # Fallback — send to generate_sql_all_tables instead of error
            return generate_sql_all_tables(question)

        table1_raw, table2_raw = join_pair

        # 2. Validate tables exist in DB
        with engine.connect() as conn:
            existing = [
                row[0].lower()
                for row in conn.execute(text(
                    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' " + system_tables_sql() + ""
                ))
            ]

        def resolve_table(name):
            for t in existing:
                if t == name.lower():
                    # Return actual cased name
                    break
            # get actual casing
            with engine.connect() as conn:
                result = conn.execute(text(
                    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                    "WHERE LOWER(TABLE_NAME) = :name AND TABLE_TYPE='BASE TABLE'"
                ), {"name": name.lower()})
                row = result.fetchone()
                return row[0] if row else None

        table1 = resolve_table(table1_raw)
        table2 = resolve_table(table2_raw)

        if not table1:
            return {"error": f"Table '{table1_raw}' not found in database."}
        if not table2:
            return {"error": f"Table '{table2_raw}' not found in database."}

        # 3. Get schemas
        schema1 = get_table_schema(table1)
        schema2 = get_table_schema(table2)

        # 4. Find join key — try FK first, then column name matching
        join_key1, join_key2 = None, None

        # Strategy 1: actual foreign key constraints in DB
        fk_result = find_join_key_via_fk(table1, table2)
        if fk_result:
            join_key1, join_key2 = fk_result
            all_common_keys = [f"{join_key1} = {join_key2}"]
            print(f"JOIN via FK: {table1}.{join_key1} = {table2}.{join_key2}")
        else:
            # Strategy 2: common column name matching
            common_keys = find_common_keys(schema1, schema2)
            if common_keys:
                join_key1, join_key2 = common_keys[0]
                all_common_keys = [f"{k1} = {k2}" for k1, k2 in common_keys]
                print(f"JOIN via column match: {table1}.{join_key1} = {table2}.{join_key2}")
            else:
                all_common_keys = []

        if not join_key1:
            return {
                "error": f"No common columns found between '{table1}' and '{table2}'. Cannot auto-detect JOIN key.",
                "table1_name": table1,
                "table2_name": table2,
                "table1_columns": [f"{col} ({dtype})" for col, dtype in schema1],
                "table2_columns": [f"{col} ({dtype})" for col, dtype in schema2],
            }

        # 5. Generate SQL via LLM
        raw_sql = generate_join_sql(table1, table2, schema1, schema2,
                                     join_key1, join_key2, question)
        sql = clean_sql_output(raw_sql)
        sql = fix_top_position(sql)
        sql = fix_offset_syntax(sql)
        sql = convert_limit_to_top(sql)
        sql = sql.rstrip(";")
        sql = sql.replace("[[", "[").replace("]]", "]")

        print("JOIN SQL:", sql)

        if not is_safe_sql(sql):
            return {"error": "Unsafe SQL blocked", "sql": sql}

        # 6. Execute
        df = execute_sql(sql)

        if df.empty:
            return {
                "reply": f"JOIN executed but returned no rows.",
                "sql": sql,
                "join_key": f"{table1}.{join_key1} = {table2}.{join_key2}",
                "table_data": None,
                "chart": None
            }

        # 7. Build table preview (first 50 rows)
        table_preview = {
            "columns": list(df.columns),
            "rows": df.head(50).fillna("").values.tolist()
        }

        # 8. Chart
        intent = detect_intent(question)
        chart_pref = detect_chart_preference(question)
        chart_data = auto_detect_chart(df, chart_pref)

        # 9. Explanation
        explanation = explain_result(question, df, intent)

        return {
            "reply": explanation,
            "sql": sql,
            "join_key": f"{table1}.{join_key1} = {table2}.{join_key2}",
            "table1": table1,
            "table2": table2,
            "rows": len(df),
            "table_data": table_preview,
            "chart": chart_data,
            "all_common_keys": all_common_keys
        }

    except Exception as e:
        print("JOIN ERROR:", repr(e))
        return {"error": str(e)}


@app.post("/chart")
async def generate_chart(body: dict = Body(...), current_user: str = Depends(get_current_user)):
    question = body.get("message")
    session = get_session(current_user)
    active_filename = session["active_filename"]

    if not question:
        return {"error": "Empty question"}

    if not active_filename:
        return {"error": "No table loaded"}

    schema = get_table_schema(active_filename)
    sql = generate_sql(question, active_filename, schema)

    if not is_safe_sql(sql):
        return {"error": "Unsafe SQL blocked", "sql": sql}

    df = execute_sql(sql)

    if df.empty:
        return {"error": "No data returned"}

    intent = detect_intent(question)
    chart = auto_detect_chart(df, intent)

    return {
        "sql": sql,
        "chart": chart
    }


# ---- chat endpoint ----

@app.post("/chat")
async def chat(body: dict = Body(...), current_user: str = Depends(get_current_user)):
    try:
        question = body.get("message")
        history = body.get("history", [])  # last N messages from frontend
        session = get_session(current_user)
        active_filename = session["active_filename"]
        active_dataframe = session["active_dataframe"]

        if not question:
            return {"error": "Empty question"}

        # ---- BUILD CONTEXT from history ----
        context = ""
        if history:
            context_lines = []
            for m in history[-6:]:
                role = "User" if m.get("sender") == "user" else "Assistant"
                msg_text = m.get("text", "")
                if msg_text:
                    context_lines.append(f"{role}: {msg_text}")
            context = "\n".join(context_lines)

        # ---- RESOLVE follow-up question using context ----
        q_lower_rag = question.lower().strip()

        # Check if question has a clear subject (table name or data keyword)
        with engine.connect() as conn:
            all_table_names = [row[0].lower() for row in conn.execute(text(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' " + system_tables_sql() + ""
            ))]
        # Dynamic data_subjects — table names + ALL column names from DB
        dynamic_subjects = list(all_table_names)
        for tname in all_table_names:
            try:
                schema = get_table_schema(tname)
                for col, _ in schema:
                    c = col.lower()
                    dynamic_subjects.append(c)
                    dynamic_subjects.append(c.rstrip("s"))  # singular form
            except:
                pass
        data_subjects = list(set(dynamic_subjects))
        has_clear_subject = any(s in q_lower_rag for s in data_subjects)

        pronoun_words = ["their", "those", "these", "them"]
        action_starters = ["now ", "also ", "add ", "include ", "filter ",
                          "sort ", "show only", "just show", "only show",
                          "what about", "how about", "and also"]

        has_pronoun = any(w in q_lower_rag for w in pronoun_words)
        has_action_start = any(q_lower_rag.startswith(w) for w in action_starters)

        # RAG trigger: has pronoun/action BUT no clear subject in question
        needs_context = context and (
            (has_pronoun and not has_clear_subject) or
            (has_action_start and not has_clear_subject)
        )

        if needs_context:
            try:
                resolve_prompt = f"""Rewrite the latest question as a complete standalone SQL-ready question using the conversation history.

Conversation history:
{context}

Latest question: {question}

Rules:
- Use the EXACT table and column context from history
- Replace pronouns like "their", "these", "them" with the actual subject from history
- Keep it short and specific — one sentence
- Example: if history shows "top 5 customers by orders" and question is "now show their email too"
  → rewrite as: "show top 5 customers by total orders including their email"

Rewritten question (one line only, no explanation):"""

                resp = requests.post(
                    "http://localhost:11434/api/generate",
                    json={"model": "llama3", "prompt": resolve_prompt, "stream": False,
                          "options": {"temperature": 0, "num_predict": 60,
                                      "stop": ["\n", "Note:", "This"]}},
                    timeout=30
                )
                resolved = resp.json().get("response", "").strip()
                # Take only first line — reject multi-line explanations
                resolved = resolved.split("\n")[0].strip().strip('"').strip("'")

                # Reject guards
                is_sql = any(resolved.upper().startswith(w) for w in ["SELECT", "WITH", "INSERT", "UPDATE"])
                has_sql_keywords = "FROM" in resolved.upper() and "SELECT" in resolved.upper()
                has_proper_names = bool(re.search(r'\b[A-Z][a-z]+ [A-Z][a-z]+\b', resolved))
                not_better = len(resolved) <= len(question) + 5
                too_long = len(resolved) > 200
                has_explanation = any(w in resolved.lower() for w in [
                    "i can", "i'll", "i will", "to do this", "the query", "this query",
                    "select c.", "join ", "group by", "order by", "limit ", "sql query"
                ])

                if (resolved and not is_sql and not has_sql_keywords and
                        not has_proper_names and not not_better and
                        not too_long and not has_explanation):
                    print(f"RAG resolved: '{question}' → '{resolved}'")
                    question = resolved
                else:
                    print(f"RAG resolve skipped: '{resolved[:80]}'")
            except:
                pass

        # ---- EARLY SAFETY CHECK — block dangerous keywords immediately ----
        danger_keywords = ["alter", "drop", "delete", "truncate", "insert", "update", "exec", "execute"]
        q_lower = question.lower().strip()
        if any(re.search(rf'\b{kw}\b', q_lower) for kw in danger_keywords):
            return {
                "reply": "⛔ This action is not allowed. Only SELECT queries are permitted.",
                "chart": None,
                "table_data": None
            }

        # ---- DB-level question: answer from INFORMATION_SCHEMA, no table needed ----
        if is_db_question(question):
            return {
                "reply": answer_db_question(question),
                "chart": None
            }

        if not active_filename:
            # Handle schema/structure questions about specific tables
            if any(p in question.lower() for p in [
                "what columns", "what fields", "show columns", "describe",
                "schema of", "structure of", "columns in", "fields in",
                "schema", "structure", "columns", "fields"
            ]):
                with engine.connect() as conn:
                    all_tables = [row[0] for row in conn.execute(text(
                        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' " + system_tables_sql() + ""
                    ))]
                mentioned_tables = [
                    t for t in all_tables if t.lower() in question.lower()
                ]
                if mentioned_tables:
                    reply = ""
                    for mentioned_table in mentioned_tables:
                        schema = get_table_schema(mentioned_table)
                        col_list = "\n".join(f"  - **{col}** ({dtype})" for col, dtype in schema)
                        reply += f"**{mentioned_table}** table has {len(schema)} columns:\n\n{col_list}\n\n---\n\n"
                    return {"reply": reply.strip(), "chart": None}

            # If it's a general/conversational question — answer with LLM directly
            if not is_data_query(question):
                return {
                    "reply": answer_with_llm(question, context=context),
                    "chart": None,
                    "table_data": None
                }

            # Data query — try smart multi-table JOIN first (FK-based, best quality)
            multi_result = try_smart_multitable(question)
            if multi_result and not multi_result.get("error"):
                return multi_result

            # Fallback — generate SQL using full DB schema
            return generate_sql_all_tables(question)

        schema = get_table_schema(active_filename)

        print("Using table:", active_filename)
        print("Columns:", schema)

        # ---- Meta question: user is asking ABOUT the table, not querying it ----
        if is_meta_question(question):
            return {
                "reply": answer_meta_question(active_filename, schema),
                "chart": None
            }

        # ---- General/conversational question — answer with LLM ----
        if not is_data_query(question):
            return {
                "reply": answer_with_llm(question, context=context),
                "chart": None,
                "table_data": None
            }

        # ---- Smart multi-table detection ----
        multi_table_result = try_smart_multitable(question)
        if multi_table_result:
            return multi_table_result

        raw_sql = generate_sql(question, active_filename, schema)
        sql = clean_sql_output(raw_sql)
        sql = fix_top_position(sql)
        sql = fix_offset_syntax(sql)
        sql = fix_missing_from(sql, active_filename)
        sql = convert_limit_to_top(sql)
        sql = enforce_schema(sql, schema, active_filename)
        sql = re.sub(
            r"TABLE_CATALOG\s*=\s*'your_database_name'",
            f"TABLE_CATALOG = '{DB_NAME}'",
            sql,
            flags=re.IGNORECASE
        )
        sql = sql.rstrip(";")
        sql = sql.replace("[[", "[").replace("]]", "]")

        # Fix: if question asks "per X" or "each X", don't limit to TOP 1
        # Dynamic per_keywords — built from actual table names in DB
        try:
            with engine.connect() as _conn:
                _tbls = [r[0].lower() for r in _conn.execute(text(
                    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' " + system_tables_sql()
                ))]
            # Generate "per X" and "each X" for each table name and singular form
            per_keywords = []
            for t in _tbls:
                singular = t.rstrip("s")
                per_keywords += [f"per {t}", f"per {singular}", f"each {t}", f"each {singular}"]
            per_keywords += ["per month", "per day", "per year", "per week", "per date"]
        except:
            per_keywords = ["per month", "per day", "per year"]
        if any(kw in question.lower() for kw in per_keywords):
            sql = re.sub(r"SELECT\s+TOP\s+1\b", "SELECT TOP 100", sql, flags=re.IGNORECASE)

        print("Generated SQL:", sql)

        if not is_safe_sql(sql):
            return {"error": "Unsafe SQL blocked", "sql": sql}

        df = execute_sql(sql)
        print("Rows returned:", len(df))

        intent = detect_intent(question)

        if len(df) == 0:
            explanation = "No results found."
        elif user_wants_chart(question):
            explanation = ""  # chart request — no text needed
        elif is_row_query(question):
            explanation = ""  # just showing rows — no text needed, table speaks for itself
        elif len(df) <= 50:
            explanation = explain_result(question, df, intent)
        else:
            explanation = f"Found {len(df)} records."

        chart_data = None

        # Only generate chart if user EXPLICITLY asked for one
        if user_wants_chart(question):
            chart_pref = detect_chart_preference(question)
            chart_data = auto_detect_chart(df, chart_pref)

        # Always return table preview so frontend renders rows as a table
        table_preview = {
            "columns": list(df.columns),
            "rows": df.head(100).fillna("").values.tolist()
        } if not df.empty else None

        # Auto chart suggestion — only if user didn't ask for chart
        chart_suggestion = None
        if not user_wants_chart(question) and not df.empty:
            chart_suggestion = suggest_chart(df, question)

        return {
            "reply": explanation if not user_wants_chart(question) else "",
            "chart": chart_data,
            "table_data": table_preview,
            "chart_suggestion": chart_suggestion
        }

    except Exception as e:
        print("CHAT ERROR:", repr(e))
        return {"error": str(e)}