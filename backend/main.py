import json
import urllib.request
import urllib.error
from pydantic import BaseModel, Field

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError

# Projekt-Root und .env laden
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# Datenbankverbindung
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_PORT = os.getenv("DB_PORT")
DB_HOST = os.getenv("DB_HOST", "localhost")

if not all([DB_NAME, DB_USER, DB_PASSWORD, DB_PORT]):
    raise RuntimeError("Datenbank-Konfiguration in .env ist unvollständig.")

DATABASE_URL = (
    f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}"
    f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"options": "-c default_transaction_read_only=on"},
)

# Separate Schreibverbindung ausschließlich für Kundenbindungsmaßnahmen
WRITE_DATABASE_URL = URL.create(
    "postgresql+psycopg2",
    username=DB_USER,
    password=DB_PASSWORD,
    host=DB_HOST,
    port=int(DB_PORT),
    database=DB_NAME,
)

write_engine = create_engine(
    WRITE_DATABASE_URL,
    pool_pre_ping=True,
)

app = FastAPI(
    title="BDIP Banking Dashboard API",
    description="Lokale Demo-API für das BDIP Banking Dashboard",
    version="1.0.0",
)

# Lokale React-Entwicklung erlauben
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "BDIP Banking Dashboard API",
        "status": "online",
    }


@app.get("/api/health")
def health():
    try:
        with engine.connect() as connection:
            result = connection.execute(
                text("SELECT current_database(), current_user")
            ).fetchone()

        return {
            "status": "connected",
            "database": result[0],
            "user": result[1],
        }
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Datenbankverbindung fehlgeschlagen.",
        )


@app.get("/api/customers")
def customers():
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT customer_type,
                           customer_status,
                           total_customers,
                           total_transactions,
                           total_amount,
                           average_transaction_amount
                    FROM analytics.v_customer_summary
                    ORDER BY customer_type, customer_status
                """)
            ).mappings().all()

        return [dict(row) for row in rows]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Kundendaten konnten nicht geladen werden.",
        )


@app.get("/api/branches")
def branches():
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT branch_id,
                           branch_name,
                           city,
                           total_customers,
                           active_customers,
                           total_transactions,
                           total_amount
                    FROM analytics.v_branch_performance
                    ORDER BY total_amount DESC
                """)
            ).mappings().all()

        return [dict(row) for row in rows]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Filialdaten konnten nicht geladen werden.",
        )


@app.get("/api/transfers")
def transfers():
    try:
        with engine.connect() as connection:
            row = connection.execute(
                text("""
                    SELECT total_transfers,
                           completed_transfers,
                           failed_transfers,
                           pending_transfers,
                           overall_success_rate
                    FROM analytics.v_transfer_kpis
                """)
            ).mappings().one()

        return dict(row)

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Transfer-KPIs konnten nicht geladen werden.",
        )


@app.get("/api/monthly-transactions")
def monthly_transactions():
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT year_number,
                           month_number,
                           month_name,
                           total_transactions,
                           total_amount,
                           average_amount
                    FROM analytics.v_monthly_transactions
                    ORDER BY year_number, month_number
                """)
            ).mappings().all()

        return [dict(row) for row in rows]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Monatliche Transaktionsdaten konnten nicht geladen werden.",
        )


# --------------------------------------------------
# Sedad Bank – separate, schreibgeschützte API
# --------------------------------------------------

@app.get("/api/sedad/overview")
def sedad_overview():
    try:
        with engine.connect() as connection:
            customers_rows = connection.execute(
                text("""
                    SELECT customer_status, COUNT(*) AS total
                    FROM raw_sedad.customers
                    GROUP BY customer_status
                    ORDER BY customer_status
                """)
            ).mappings().all()

            accounts_rows = connection.execute(
                text("""
                    SELECT account_type, account_status, currency,
                           COUNT(*) AS total
                    FROM raw_sedad.accounts
                    GROUP BY account_type, account_status, currency
                    ORDER BY account_type, account_status, currency
                """)
            ).mappings().all()

            transactions_rows = connection.execute(
                text("""
                    SELECT transaction_status, COUNT(*) AS total
                    FROM raw_sedad.transactions
                    GROUP BY transaction_status
                    ORDER BY transaction_status
                """)
            ).mappings().all()

            transfers_rows = connection.execute(
                text("""
                    SELECT transfer_status, COUNT(*) AS total
                    FROM raw_sedad.transfers
                    GROUP BY transfer_status
                    ORDER BY transfer_status
                """)
            ).mappings().all()

        customers = [dict(row) for row in customers_rows]
        accounts = [dict(row) for row in accounts_rows]
        transactions = [dict(row) for row in transactions_rows]
        transfers = [dict(row) for row in transfers_rows]

        return {
            "bank": "Sedad Bank",
            "data_type": "synthetic_demo_data",
            "customers": {
                "total": sum(row["total"] for row in customers),
                "by_status": customers,
            },
            "accounts": {
                "total": sum(row["total"] for row in accounts),
                "by_type_status_currency": accounts,
            },
            "transactions": {
                "total": sum(row["total"] for row in transactions),
                "by_status": transactions,
            },
            "transfers": {
                "total": sum(row["total"] for row in transfers),
                "by_status": transfers,
            },
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Sedad-Übersicht konnte nicht geladen werden.",
        )


@app.get("/api/sedad/currencies")
def sedad_currencies():
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT currency,
                           COUNT(*) AS total_transactions,
                           SUM(amount) AS total_amount,
                           ROUND(AVG(amount), 2) AS average_amount
                    FROM raw_sedad.transactions
                    GROUP BY currency
                    ORDER BY currency
                """)
            ).mappings().all()

        return [dict(row) for row in rows]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Sedad-Währungsdaten konnten nicht geladen werden.",
        )


@app.get("/api/sedad/monthly-transactions")
def sedad_monthly_transactions():
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT
                        EXTRACT(YEAR FROM transaction_timestamp)::integer
                            AS year_number,
                        EXTRACT(MONTH FROM transaction_timestamp)::integer
                            AS month_number,
                        TO_CHAR(
                            transaction_timestamp, 'Mon'
                        ) AS month_name,
                        currency,
                        COUNT(*) AS total_transactions,
                        SUM(amount) AS total_amount,
                        ROUND(AVG(amount), 2) AS average_amount
                    FROM raw_sedad.transactions
                    GROUP BY
                        EXTRACT(YEAR FROM transaction_timestamp),
                        EXTRACT(MONTH FROM transaction_timestamp),
                        TO_CHAR(transaction_timestamp, 'Mon'),
                        currency
                    ORDER BY year_number, month_number, currency
                """)
            ).mappings().all()

        return [dict(row) for row in rows]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Monatliche Sedad-Daten konnten nicht geladen werden.",
        )

# ==========================================
# BDIP LOCAL AI AGENT - Ollama Integration
# ==========================================

OLLAMA_URL = os.getenv(
    "OLLAMA_URL",
    "http://localhost:11434"
)

OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "qwen2.5:3b"
)


class AIChatRequest(BaseModel):
    message: str = Field(
        min_length=1,
        max_length=4000
    )


@app.post("/api/ai/chat")
def ai_chat(request: AIChatRequest):
    """
    Lokaler BDIP AI Chat.
    Keine Datenbankabfragen und keine Cloud-API.
    """

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Du bist BDIP AI, ein lokaler Banking- "
                    "und Business-Intelligence-Assistent. "
                    "Antworte auf Deutsch, klar und professionell. "
                    "Erfinde keine Bankkennzahlen. "
                    "Wenn dir Daten fehlen, sage das ausdrücklich. "
                    "Unterscheide echte Daten, Demo-Daten und Prognosen."
                ),
            },
            {
                "role": "user",
                "content": request.message,
            },
        ],
        "stream": False,
    }

    try:
        data = json.dumps(payload).encode("utf-8")

        ollama_request = urllib.request.Request(
            f"{OLLAMA_URL}/api/chat",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(
            ollama_request,
            timeout=180,
        ) as response:
            result = json.loads(response.read().decode("utf-8"))

        return {
            "status": "success",
            "agent": "BDIP Local AI",
            "model": OLLAMA_MODEL,
            "local": True,
            "response": result.get("message", {}).get("content", ""),
        }

    except urllib.error.URLError:
        raise HTTPException(
            status_code=503,
            detail="Ollama ist momentan nicht erreichbar.",
        )

    except TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Die lokale KI hat zu lange benötigt.",
        )

    except (json.JSONDecodeError, KeyError):
        raise HTTPException(
            status_code=502,
            detail="Ungültige Antwort vom lokalen KI-Modell.",
        )


# ==========================================
# CUSTOMER INTELLIGENCE - SEDAD BANK
# ==========================================

@app.get("/api/sedad/customer-intelligence")
def sedad_customer_intelligence():
    try:
        with engine.connect() as connection:
            status_rows = connection.execute(text("""
                SELECT customer_status, COUNT(*) AS total
                FROM raw_sedad.customers
                GROUP BY customer_status
                ORDER BY customer_status
            """)).mappings().all()

            monthly_rows = connection.execute(text("""
                SELECT
                    TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM')
                        AS month,
                    COUNT(*) AS new_customers
                FROM raw_sedad.customers
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY DATE_TRUNC('month', created_at)
            """)).mappings().all()

        status = [dict(row) for row in status_rows]
        monthly = [dict(row) for row in monthly_rows]

        return {
            "bank": "Sedad Bank",
            "data_type": "synthetic_demo_data",
            "customers": {
                "total": sum(row["total"] for row in status),
                "by_status": status,
                "new_customers_by_month": monthly,
            },
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Sedad Customer Intelligence konnte nicht geladen werden.",
        )


@app.get("/api/sedad/customer-activity")
def sedad_customer_activity():
    try:
        with engine.connect() as connection:
            account_rows = connection.execute(text("""
                SELECT account_type, account_status, currency,
                       COUNT(*) AS total
                FROM raw_sedad.accounts
                GROUP BY account_type, account_status, currency
                ORDER BY account_type, account_status, currency
            """)).mappings().all()

            transaction_rows = connection.execute(text("""
                SELECT transaction_type, transaction_status, currency,
                       COUNT(*) AS total,
                       SUM(amount) AS total_amount
                FROM raw_sedad.transactions
                GROUP BY transaction_type, transaction_status, currency
                ORDER BY transaction_type, transaction_status, currency
            """)).mappings().all()

        accounts = [dict(row) for row in account_rows]
        transactions = [dict(row) for row in transaction_rows]

        return {
            "bank": "Sedad Bank",
            "data_type": "synthetic_demo_data",
            "accounts": {
                "total": sum(row["total"] for row in accounts),
                "by_type_status_currency": accounts,
            },
            "transactions": {
                "total": sum(row["total"] for row in transactions),
                "by_type_status_currency": transactions,
            },
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Sedad Customer Activity konnte nicht geladen werden.",
        )


# ==========================================
# CUSTOMER INTELLIGENCE - BMI CORN
# ==========================================

@app.get("/api/corn/customer-intelligence")
def corn_customer_intelligence():
    try:
        with engine.connect() as connection:
            status_rows = connection.execute(text("""
                SELECT
                    customer_status,
                    synthetic_record,
                    COUNT(*) AS total
                FROM raw_corn.customers
                GROUP BY customer_status, synthetic_record
                ORDER BY customer_status, synthetic_record
            """)).mappings().all()

            monthly_rows = connection.execute(text("""
                SELECT
                    TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM')
                        AS month,
                    synthetic_record,
                    COUNT(*) AS new_customers
                FROM raw_corn.customers
                GROUP BY DATE_TRUNC('month', created_at), synthetic_record
                ORDER BY DATE_TRUNC('month', created_at), synthetic_record
            """)).mappings().all()

        status = [dict(row) for row in status_rows]
        monthly = [dict(row) for row in monthly_rows]

        return {
            "bank": "Bank BMI Corn",
            "data_type": "synthetic_demo_data",
            "customers": {
                "total": sum(row["total"] for row in status),
                "by_status": status,
                "new_customers_by_month": monthly,
            },
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="BMI Corn Customer Intelligence konnte nicht geladen werden.",
        )





@app.get("/api/sedad/customer-segmentation")
def sedad_customer_segmentation():
    try:
        with engine.connect() as connection:
            age_rows = connection.execute(text("""
                SELECT
                    CASE
                        WHEN age < 25 THEN 'Under 25'
                        WHEN age < 35 THEN '25-34'
                        WHEN age < 45 THEN '35-44'
                        WHEN age < 60 THEN '45-59'
                        ELSE '60+'
                    END AS age_group,
                    COUNT(*) AS total
                FROM (
                    SELECT EXTRACT(
                        YEAR FROM AGE(CURRENT_DATE, date_of_birth)
                    ) AS age
                    FROM raw_sedad.customers
                    WHERE date_of_birth IS NOT NULL
                ) customer_ages
                GROUP BY age_group
                ORDER BY MIN(age)
            """)).mappings().all()

            status_rows = connection.execute(text("""
                SELECT customer_status, COUNT(*) AS total
                FROM raw_sedad.customers
                GROUP BY customer_status
                ORDER BY customer_status
            """)).mappings().all()

        return {
            "bank": "Sedad Bank",
            "data_type": "synthetic_demo_data",
            "age_groups": [dict(row) for row in age_rows],
            "by_status": [dict(row) for row in status_rows],
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Sedad Customer Segmentation konnte nicht geladen werden.",
        )


@app.get("/api/corn/customer-segmentation")
def corn_customer_segmentation():
    try:
        with engine.connect() as connection:
            type_rows = connection.execute(text("""
                SELECT customer_type, COUNT(*) AS total
                FROM raw_corn.customers
                GROUP BY customer_type
                ORDER BY customer_type
            """)).mappings().all()

            age_rows = connection.execute(text("""
                SELECT
                    CASE
                        WHEN age < 25 THEN 'Under 25'
                        WHEN age < 35 THEN '25-34'
                        WHEN age < 45 THEN '35-44'
                        WHEN age < 60 THEN '45-59'
                        ELSE '60+'
                    END AS age_group,
                    COUNT(*) AS total
                FROM (
                    SELECT EXTRACT(
                        YEAR FROM AGE(CURRENT_DATE, date_of_birth)
                    ) AS age
                    FROM raw_corn.customers
                    WHERE date_of_birth IS NOT NULL
                ) customer_ages
                GROUP BY age_group
                ORDER BY MIN(age)
            """)).mappings().all()

            status_rows = connection.execute(text("""
                SELECT customer_status, COUNT(*) AS total
                FROM raw_corn.customers
                GROUP BY customer_status
                ORDER BY customer_status
            """)).mappings().all()

            branch_rows = connection.execute(text("""
                SELECT
                    c.branch_id,
                    COALESCE(b.branch_name, 'Unassigned') AS branch_name,
                    COALESCE(b.city, 'Unknown') AS city,
                    COUNT(*) AS total
                FROM raw_corn.customers c
                LEFT JOIN raw_corn.branches b
                    ON c.branch_id = b.branch_id
                GROUP BY c.branch_id, b.branch_name, b.city
                ORDER BY total DESC
            """)).mappings().all()

        customer_types = [dict(row) for row in type_rows]
        age_groups = [dict(row) for row in age_rows]
        statuses = [dict(row) for row in status_rows]
        branches = [dict(row) for row in branch_rows]

        return {
            "bank": "Bank BMI Corn",
            "data_type": "synthetic_demo_data",
            "customer_types": customer_types,
            "age_groups": age_groups,
            "by_status": statuses,
            "by_branch": branches,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="BMI Corn Customer Segmentation konnte nicht geladen werden.",
        )


@app.get("/api/corn/customer-activity")
def corn_customer_activity():
    try:
        with engine.connect() as connection:
            account_rows = connection.execute(text("""
                SELECT account_type, account_status, currency,
                       COUNT(*) AS total
                FROM raw_corn.accounts
                GROUP BY account_type, account_status, currency
                ORDER BY account_type, account_status, currency
            """)).mappings().all()

            transaction_rows = connection.execute(text("""
                SELECT
                    transaction_type,
                    direction,
                    transaction_status,
                    currency,
                    COUNT(*) AS total,
                    SUM(amount) AS total_amount
                FROM raw_corn.transactions
                GROUP BY
                    transaction_type,
                    direction,
                    transaction_status,
                    currency
                ORDER BY
                    transaction_type,
                    direction,
                    transaction_status,
                    currency
            """)).mappings().all()

        accounts = [dict(row) for row in account_rows]
        transactions = [dict(row) for row in transaction_rows]

        return {
            "bank": "Bank BMI Corn",
            "data_type": "synthetic_demo_data",
            "accounts": {
                "total": sum(row["total"] for row in accounts),
                "by_type_status_currency": accounts,
            },
            "transactions": {
                "total": sum(row["total"] for row in transactions),
                "by_type_direction_status_currency": transactions,
            },
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="BMI Corn Customer Activity konnte nicht geladen werden.",
        )


# ==========================================
# CUSTOMER CHURN SIMULATION - DEMO
# ==========================================

@app.get("/api/{bank}/churn-analysis")
def customer_churn_analysis(bank: str):
    bank_config = {
        "corn": {
            "schema": "raw_corn",
            "synthetic_filter": "WHERE c.synthetic_record = TRUE",
            "transaction_filter": "AND t.synthetic_record = TRUE",
            "name": "Bank BMI Corn",
        },
        "sedad": {
            "schema": "raw_sedad",
            "synthetic_filter": "",
            "transaction_filter": "",
            "name": "Sedad Bank",
        },
    }

    if bank not in bank_config:
        raise HTTPException(
            status_code=404,
            detail="Unbekannte Bank. Erlaubt sind corn und sedad.",
        )

    config = bank_config[bank]
    schema = config["schema"]

    query = f"""
        WITH reference AS (
            SELECT COALESCE(
                MAX(t.transaction_timestamp),
                CURRENT_TIMESTAMP
            ) AS reference_timestamp
            FROM {schema}.transactions t
            WHERE 1 = 1
            {config["transaction_filter"]}
        )
        SELECT
            r.reference_timestamp,
            c.customer_id::text AS customer_id,
            c.first_name,
            c.last_name,
            c.created_at,
            c.customer_status,
            COUNT(DISTINCT a.account_id) FILTER (
                WHERE LOWER(a.account_status) = 'active'
            ) AS active_accounts,
            COUNT(DISTINCT t.transaction_id) AS transaction_count,
            COUNT(DISTINCT t.transaction_id) FILTER (
                WHERE LOWER(t.transaction_status) = 'completed'
            ) AS completed_transactions,
            COUNT(DISTINCT t.transaction_id) FILTER (
                WHERE LOWER(t.transaction_status) = 'completed'
                  AND t.transaction_timestamp >=
                      r.reference_timestamp - INTERVAL '90 days'
            ) AS completed_transactions_90d,
            MAX(t.transaction_timestamp) FILTER (
                WHERE LOWER(t.transaction_status) = 'completed'
            ) AS last_completed_transaction,
            (
                SELECT COALESCE(
                    json_agg(volume_row),
                    '[]'::json
                )
                FROM (
                    SELECT
                        t2.currency,
                        COUNT(*) AS transaction_count,
                        SUM(t2.amount) AS transaction_volume
                    FROM {schema}.transactions t2
                    JOIN {schema}.accounts a2
                        ON a2.account_id = t2.account_id
                    WHERE a2.customer_id = c.customer_id
                      AND LOWER(t2.transaction_status) = 'completed'
                      {config["transaction_filter"].replace("AND t.", "AND t2.")}
                    GROUP BY t2.currency
                ) volume_row
            ) AS transaction_volume_by_currency,
            MAX(t.transaction_timestamp) AS last_transaction,
            CASE
                WHEN MAX(t.transaction_timestamp) IS NULL THEN NULL
                ELSE FLOOR(
                    EXTRACT(EPOCH FROM (
                        CURRENT_TIMESTAMP - MAX(t.transaction_timestamp)
                    )) / 86400
                )::int
            END AS days_inactive
        FROM {schema}.customers c
        CROSS JOIN reference r
        LEFT JOIN {schema}.accounts a
            ON a.customer_id = c.customer_id
        LEFT JOIN {schema}.transactions t
            ON t.account_id = a.account_id
            {config["transaction_filter"]}
        {config["synthetic_filter"]}
        GROUP BY
            c.customer_id,
            c.first_name,
            c.last_name,
            c.created_at,
            c.customer_status,
            r.reference_timestamp
        ORDER BY c.customer_id
    """

    try:
        with engine.connect() as connection:
            rows = connection.execute(text(query)).mappings().all()

        # BMI Corn: relative Inaktivität innerhalb des Demo-Datensatzes.
        # Sedad: weiterhin Berechnung anhand des aktuellen Datums.
        reference_date = None
        if bank == "corn":
            transaction_dates = [
                row["last_transaction"]
                for row in rows
                if row["last_transaction"] is not None
            ]
            reference_date = max(transaction_dates) if transaction_dates else None

        reference_timestamp = (
            rows[0]["reference_timestamp"] if rows else None
        )

        customers = []
        risk_counts = {
            "low": 0,
            "medium": 0,
            "high": 0,
        }

        for row in rows:
            status = str(row["customer_status"]).lower()
            last_transaction = row["last_transaction"]

            if bank == "corn":
                if last_transaction is not None and reference_date is not None:
                    days = max(
                        0,
                        int((reference_date - last_transaction).total_seconds() // 86400)
                    )
                else:
                    days = row["days_inactive"]
            else:
                last_completed = row["last_completed_transaction"]
                customer_reference = row["reference_timestamp"]

                if last_completed is None or customer_reference is None:
                    days = None
                else:
                    days = max(
                        0,
                        int(
                            (customer_reference - last_completed).total_seconds()
                            // 86400
                        )
                    )

            if status in ("blocked", "inactive"):
                risk = "high"
                reason = "Customer status is not active"
                recommendation = "Review customer status and relationship"
            elif days is None:
                risk = "high"
                reason = "No successful transaction recorded"
                recommendation = "Contact the customer and review account activity"
            elif days >= 90:
                risk = "high"
                reason = f"No successful transaction in the last {days} days"
                recommendation = "Initiate a personalized retention intervention"
            elif days >= 45:
                risk = "medium"
                reason = f"No successful transaction in the last {days} days"
                recommendation = "Contact the customer and present a tailored offer"
            else:
                risk = "low"
                reason = "Kunde war kürzlich aktiv"
                recommendation = "Kundenbindung weiter stärken"

            # Engagement Score: transparente PoC-Heuristik (0-100).
            last_completed = row["last_completed_transaction"]
            if last_completed is not None and reference_timestamp is not None:
                days_since_completed = max(
                    0,
                    int(
                        (reference_timestamp - last_completed).total_seconds()
                        // 86400
                    ),
                )
            else:
                days_since_completed = None

            # Recency: maximal 40 Punkte
            if days_since_completed is not None and days_since_completed <= 30:
                recency_points = 40
            elif days_since_completed is not None and days_since_completed <= 60:
                recency_points = 30
            elif days_since_completed is not None and days_since_completed <= 90:
                recency_points = 15
            else:
                recency_points = 0

            # Häufigkeit abgeschlossener Transaktionen der letzten 90 Tage:
            # maximal 40 Punkte
            recent_count = int(row["completed_transactions_90d"] or 0)
            if recent_count >= 10:
                frequency_points = 40
            elif recent_count >= 5:
                frequency_points = 30
            elif recent_count >= 1:
                frequency_points = 20
            else:
                frequency_points = 0

            # Aktive Konten: maximal 20 Punkte
            active_accounts = int(row["active_accounts"] or 0)
            if active_accounts >= 2:
                account_points = 20
            elif active_accounts == 1:
                account_points = 15
            else:
                account_points = 0

            engagement_score = (
                recency_points + frequency_points + account_points
            )

            if engagement_score >= 70:
                engagement_segment = "high"
            elif engagement_score >= 40:
                engagement_segment = "medium"
            else:
                engagement_segment = "low"

            # Betreuungspriorität kombiniert Churn-Risiko und Engagement.
            if risk == "high" and engagement_segment == "high":
                retention_priority = "critical"
            elif risk == "high" and engagement_segment == "medium":
                retention_priority = "high"
            elif risk == "high":
                retention_priority = "medium"
            elif risk == "medium" and engagement_segment == "high":
                retention_priority = "high"
            elif risk == "medium":
                retention_priority = "medium"
            else:
                retention_priority = "low"

            risk_counts[risk] += 1

            last_transaction = row["last_transaction"]

            customers.append({
                "customer_id": row["customer_id"],
                "first_name": row["first_name"],
                "last_name": row["last_name"],
                "created_at": (
                    row["created_at"].isoformat()
                    if row["created_at"] else None
                ),
                "customer_status": row["customer_status"],
                "active_accounts": row["active_accounts"],
                "transaction_count": row["transaction_count"],
                "completed_transactions": row["completed_transactions"],
                "completed_transactions_90d": recent_count,
                "last_completed_transaction": (
                    last_completed.isoformat() if last_completed else None
                ),
                "engagement_score": engagement_score,
                "engagement_segment": engagement_segment,
                "engagement_score_components": {
                    "recency": recency_points,
                    "frequency_90d": frequency_points,
                    "active_accounts": account_points,
                },
                "retention_priority": retention_priority,
                "transaction_volume_by_currency": row["transaction_volume_by_currency"] or [],
                "days_inactive": days,
                "last_transaction": (
                    last_transaction.isoformat()
                    if last_transaction else None
                ),
                "risk": risk,
                "risk_reason": reason,
                "recommendation": recommendation,
            })

        return {
            "bank": config["name"],
            "data_type": "synthetic_demo_data",
            "simulation": True,
            "method": "rule_based_demo_simulation",
            "reference_date": (
                reference_date.isoformat() if reference_date else None
            ),
            "thresholds_days": {
                "low": "0-44",
                "medium": "45-89",
                "high": "90+",
            },
            "total_customers": len(customers),
            "risk_counts": risk_counts,
            "engagement_segments": {
                "high": sum(
                    1 for c in customers if c["engagement_segment"] == "high"
                ),
                "medium": sum(
                    1 for c in customers if c["engagement_segment"] == "medium"
                ),
                "low": sum(
                    1 for c in customers if c["engagement_segment"] == "low"
                ),
            },
            "retention_priorities": {
                "critical": sum(
                    1 for c in customers if c["retention_priority"] == "critical"
                ),
                "high": sum(
                    1 for c in customers if c["retention_priority"] == "high"
                ),
                "medium": sum(
                    1 for c in customers if c["retention_priority"] == "medium"
                ),
                "low": sum(
                    1 for c in customers if c["retention_priority"] == "low"
                ),
            },
            "engagement_method": {
                "type": "rule_based_demo_score",
                "max_score": 100,
                "segments": {
                    "high": "70-100",
                    "medium": "40-69",
                    "low": "0-39",
                },
                "note": (
                    "PoC-Heuristik auf Basis abgeschlossener Transaktionen "
                    "und aktiver Konten; kein finanzieller Kundenwert."
                ),
            },
            "customers": customers,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Churn-Analyse konnte nicht geladen werden.",
        )


from backend.endpoints.customer_360 import router as customer_360_router
from backend.endpoints.churn_prevention import router as churn_prevention_router
from backend.endpoints.sedad_analytics import router as sedad_analytics_router

app.state.db_engine = engine
app.state.db_write_engine = write_engine

app.include_router(customer_360_router, prefix="/api")
app.include_router(churn_prevention_router, prefix="/api")
app.include_router(sedad_analytics_router, prefix="/api/sedad/analytics")
