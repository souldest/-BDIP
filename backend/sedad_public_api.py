import json
import os
import re
from pathlib import Path
from uuid import UUID

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError

from backend.endpoints.churn_prevention import router as churn_router


# ---------------------------------------------------------
# Database configuration
# ---------------------------------------------------------

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

ENV_DATABASE_URL = os.getenv("DATABASE_URL")

if not ENV_DATABASE_URL and not all(
    (DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME)
):
    raise RuntimeError("Database environment variables are incomplete.")

DATABASE_URL = ENV_DATABASE_URL or URL.create(
    "postgresql+psycopg2",
    username=DB_USER,
    password=DB_PASSWORD,
    host=DB_HOST,
    port=int(DB_PORT),
    database=DB_NAME,
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=3,
    max_overflow=2,
    connect_args={"options": "-c statement_timeout=10000"},
)


# ---------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------

app = FastAPI(
    title="SEDAD Retention API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://bdip-two.vercel.app"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type"],
)


# ---------------------------------------------------------
# Allowed retention values
# ---------------------------------------------------------

ALLOWED_ACTIONS = {
    "Persönlicher Anruf",
    "Beratungsgespräch",
    "Individuelles Angebot",
    "Gebühren- oder Konditionenprüfung",
    "Kundenstatus prüfen",
    "Weitere Action",
}

ALLOWED_STATUSES = {
    "Offen",
    "Kontakt aufgenommen",
    "Kunde interessiert",
    "Erfolgreich zurückgewonnen",
    "Nicht zurückgewonnen",
}

ALLOWED_TEAMS = {
    "Customer Relationship Management",
    "Retail Banking & Advisory",
    "Pricing & Product Management",
    "Customer Operations",
    "Retention Management",
}


# ---------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------

@app.get("/health")
def health():
    try:
        with engine.connect() as connection:
            database = connection.execute(
                text("SELECT current_database()")
            ).scalar_one()

        return {
            "status": "connected",
            "database": database,
            "scope": "sedad",
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database unavailable.",
        )


# ---------------------------------------------------------
# Restrict API to SEDAD
# ---------------------------------------------------------

@app.middleware("http")
async def restrict_to_sedad(request: Request, call_next):
    path = request.url.path
    match = re.match(r"^/api/([^/]+)(/|$)", path)

    if path.startswith("/api/"):
        if not match or match.group(1).lower() != "sedad":
            return JSONResponse(
                status_code=404,
                content={"detail": "Not found."},
            )

        # Normalize casing so every database query uses "sedad".
        request.scope["path"] = (
            "/api/sedad" + path[match.end(1):]
        )

    return await call_next(request)


# ---------------------------------------------------------
# Validate customer IDs and customer existence
# ---------------------------------------------------------

@app.middleware("http")
async def validate_sedad_writes(request: Request, call_next):
    path = request.url.path
    parts = path.strip("/").split("/")

    is_action_update = (
        request.method == "PUT"
        and len(parts) == 4
        and parts[0] == "api"
        and parts[1].lower() == "sedad"
        and parts[2] == "churn-prevention"
    )

    is_contact_request = (
        request.method == "POST"
        and len(parts) == 5
        and parts[0] == "api"
        and parts[1].lower() == "sedad"
        and parts[2] == "churn-prevention"
        and parts[4] == "contact"
    )

    if is_action_update or is_contact_request:
        try:
            customer_id = str(UUID(parts[3]))

        except ValueError:
            return JSONResponse(
                status_code=400,
                content={"detail": "Invalid customer ID."},
            )

        try:
            with engine.connect() as connection:
                exists = connection.execute(
                    text("""
                        SELECT 1
                        FROM raw_sedad.customers
                        WHERE customer_id = :customer_id
                    """),
                    {"customer_id": customer_id},
                ).first()

            if exists is None:
                return JSONResponse(
                    status_code=404,
                    content={"detail": "SEDAD customer not found."},
                )

        except SQLAlchemyError:
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "Customer validation unavailable."
                },
            )

    return await call_next(request)


# ---------------------------------------------------------
# Validate retention action payload
# ---------------------------------------------------------

@app.middleware("http")
async def validate_churn_payload(request: Request, call_next):
    path = request.url.path
    parts = path.strip("/").split("/")

    is_action_update = (
        request.method == "PUT"
        and len(parts) == 4
        and parts[0] == "api"
        and parts[1].lower() == "sedad"
        and parts[2] == "churn-prevention"
    )

    if not is_action_update:
        return await call_next(request)

    try:
        body = await request.body()
        payload = json.loads(body)

        if not isinstance(payload, dict):
            return JSONResponse(
                status_code=422,
                content={"detail": "Invalid request payload."},
            )

        if payload.get("action") not in ALLOWED_ACTIONS:
            return JSONResponse(
                status_code=422,
                content={"detail": "Invalid retention action."},
            )

        if payload.get("status") not in ALLOWED_STATUSES:
            return JSONResponse(
                status_code=422,
                content={"detail": "Invalid retention status."},
            )

        team = payload.get("assigned_team")

        if team not in (None, "") and team not in ALLOWED_TEAMS:
            return JSONResponse(
                status_code=422,
                content={"detail": "Invalid SEDAD retention team."},
            )

        if team not in (None, ""):
            try:
                with engine.connect() as connection:
                    active_team = connection.execute(
                        text("""
                            SELECT 1
                            FROM public.retention_teams
                            WHERE bank = 'sedad'
                              AND team_name = :team
                              AND is_active = TRUE
                        """),
                        {"team": team},
                    ).first()

                if active_team is None:
                    return JSONResponse(
                        status_code=422,
                        content={
                            "detail": (
                                "This SEDAD retention team is not active."
                            )
                        },
                    )

            except SQLAlchemyError:
                return JSONResponse(
                    status_code=503,
                    content={
                        "detail": (
                            "Retention team validation unavailable."
                        )
                    },
                )

        # Restore the request body for FastAPI/Pydantic.
        async def receive_body():
            return {
                "type": "http.request",
                "body": body,
                "more_body": False,
            }

        request._receive = receive_body

    except (ValueError, TypeError):
        return JSONResponse(
            status_code=400,
            content={"detail": "Invalid JSON payload."},
        )

    return await call_next(request)


# ---------------------------------------------------------
# Database engines available to endpoints
# ---------------------------------------------------------

app.state.db_engine = engine
app.state.db_write_engine = engine


# ---------------------------------------------------------
# Register API routes
# ---------------------------------------------------------

app.include_router(
    churn_router,
    prefix="/api",
)

# ---------------------------------------------------------
# Serve the Vite frontend
# ---------------------------------------------------------

app.frontend(
    "/",
    directory="dashboard-public/dist",
    fallback="index.html",
)
