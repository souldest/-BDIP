
import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from faker import Faker
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
import os


# --------------------------------------------------
# Configuration
# --------------------------------------------------

SEED = 42

CUSTOMER_COUNT = 500
ACCOUNT_COUNT = 650
TRANSACTION_COUNT = 5000

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")

rng = random.Random(SEED)
fake = Faker()
fake.seed_instance(SEED)


def make_uuid():
    """Create reproducible UUIDs for this synthetic dataset."""
    return UUID(int=rng.getrandbits(128), version=4)


def make_timestamp(days_back=365):
    now = datetime.now(timezone.utc)
    return now - timedelta(
        days=rng.randint(0, days_back),
        seconds=rng.randint(0, 86400),
    )


# --------------------------------------------------
# Database connection
# --------------------------------------------------

database_url = URL.create(
    drivername="postgresql+psycopg2",
    username=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    host="127.0.0.1",
    port=int(os.getenv("DB_PORT", "55441")),
    database=os.getenv("DB_NAME"),
)

engine = create_engine(database_url)


# --------------------------------------------------
# Generate customers
# --------------------------------------------------

customers = []

for _ in range(CUSTOMER_COUNT):
    customers.append({
        "customer_id": make_uuid(),
        "first_name": fake.first_name(),
        "last_name": fake.last_name(),
        "email": fake.unique.email(),
        "date_of_birth": fake.date_of_birth(
            minimum_age=18,
            maximum_age=85,
        ),
        "customer_status": rng.choices(
            ["active", "inactive", "blocked"],
            weights=[85, 12, 3],
        )[0],
        "created_at": make_timestamp(),
    })


# --------------------------------------------------
# Generate accounts
# --------------------------------------------------

accounts = []
customer_account_ids = []

for customer in customers:
    number_of_accounts = 1

    if len(accounts) < ACCOUNT_COUNT - CUSTOMER_COUNT:
        number_of_accounts += 1

    for _ in range(number_of_accounts):
        account_id = make_uuid()

        accounts.append({
            "account_id": account_id,
            "customer_id": customer["customer_id"],
            "account_type": rng.choice(
                ["current", "savings"]
            ),
            "currency": rng.choice(["EUR", "USD", "GBP"]),
            "account_status": rng.choice(
                ["active", "inactive"]
            ),
            "opened_at": make_timestamp(),
        })

        customer_account_ids.append(account_id)

# Add accounts to randomly selected customers until target is reached
while len(accounts) < ACCOUNT_COUNT:
    customer = rng.choice(customers)

    accounts.append({
        "account_id": make_uuid(),
        "customer_id": customer["customer_id"],
        "account_type": rng.choice(["current", "savings"]),
        "currency": rng.choice(["EUR", "USD", "GBP"]),
        "account_status": "active",
        "opened_at": make_timestamp(),
    })


# --------------------------------------------------
# Generate transactions and transfers
# --------------------------------------------------

transactions = []
transfers = []

for _ in range(TRANSACTION_COUNT):
    transaction_id = make_uuid()
    account = rng.choice(accounts)

    transaction_type = rng.choices(
        ["deposit", "withdrawal", "transfer"],
        weights=[35, 30, 35],
    )[0]

    status = rng.choices(
        ["completed", "pending", "failed"],
        weights=[90, 4, 6],
    )[0]

    timestamp = make_timestamp()

    transactions.append({
        "transaction_id": transaction_id,
        "account_id": account["account_id"],
        "transaction_type": transaction_type,
        "amount": Decimal(
            str(round(rng.uniform(5, 2500), 2))
        ),
        "currency": account["currency"],
        "transaction_status": status,
        "channel": rng.choice(
            ["mobile_app", "web", "atm"]
        ),
        "transaction_timestamp": timestamp,
    })

    if transaction_type == "transfer":
        completed_at = None

        if status == "completed":
            completed_at = timestamp + timedelta(
                minutes=rng.randint(1, 30)
            )

        transfers.append({
            "transfer_id": make_uuid(),
            "transaction_id": transaction_id,
            "recipient_account_reference": (
                f"EXT-{rng.randint(10000000, 99999999)}"
            ),
            "transfer_status": status,
            "initiated_at": timestamp,
            "completed_at": completed_at,
        })


# --------------------------------------------------
# Insert into PostgreSQL
# --------------------------------------------------

try:
    with engine.begin() as connection:

        # Protect against accidental duplicate generation
        existing_counts = {}

        for table in [
            "customers",
            "accounts",
            "transactions",
            "transfers",
        ]:
            existing_counts[table] = connection.execute(
                text(f"SELECT COUNT(*) FROM raw_sedad.{table}")
            ).scalar_one()

        if any(existing_counts.values()):
            raise RuntimeError(
                "raw_sedad already contains data. "
                "No records were inserted. "
                "Inspect the tables before running again."
            )

        connection.execute(
            text("""
                INSERT INTO raw_sedad.customers (
                    customer_id, first_name, last_name,
                    email, date_of_birth,
                    customer_status, created_at
                )
                VALUES (
                    :customer_id, :first_name, :last_name,
                    :email, :date_of_birth,
                    :customer_status, :created_at
                )
            """),
            customers,
        )

        connection.execute(
            text("""
                INSERT INTO raw_sedad.accounts (
                    account_id, customer_id, account_type,
                    currency, account_status, opened_at
                )
                VALUES (
                    :account_id, :customer_id, :account_type,
                    :currency, :account_status, :opened_at
                )
            """),
            accounts,
        )

        connection.execute(
            text("""
                INSERT INTO raw_sedad.transactions (
                    transaction_id, account_id,
                    transaction_type, amount, currency,
                    transaction_status, channel,
                    transaction_timestamp
                )
                VALUES (
                    :transaction_id, :account_id,
                    :transaction_type, :amount, :currency,
                    :transaction_status, :channel,
                    :transaction_timestamp
                )
            """),
            transactions,
        )

        connection.execute(
            text("""
                INSERT INTO raw_sedad.transfers (
                    transfer_id, transaction_id,
                    recipient_account_reference,
                    transfer_status, initiated_at, completed_at
                )
                VALUES (
                    :transfer_id, :transaction_id,
                    :recipient_account_reference,
                    :transfer_status, :initiated_at, :completed_at
                )
            """),
            transfers,
        )

    print("SEDAD synthetic data generated successfully!")
    print(f"Customers:     {len(customers)}")
    print(f"Accounts:      {len(accounts)}")
    print(f"Transactions:  {len(transactions)}")
    print(f"Transfers:     {len(transfers)}")

except Exception as error:
    print("Generation failed:")
    print(error)
    raise

finally:
    engine.dispose()
