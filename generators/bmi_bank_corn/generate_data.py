import os
import random
import time
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from faker import Faker

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

# --------------------------------------------------
# Configuration
# --------------------------------------------------

load_dotenv()

CUSTOMER_COUNT = int(os.getenv("BMI_CUSTOMER_COUNT", "10000"))
BATCH_SIZE = int(os.getenv("BMI_BATCH_SIZE", "5000"))
SEED = 42
BRANCH_COUNT = 8

if CUSTOMER_COUNT < 1 or BATCH_SIZE < 1:
    raise ValueError("CUSTOMER_COUNT und BATCH_SIZE müssen positiv sein.")

rng = random.Random(SEED)
fake = Faker("fr_FR")
Faker.seed(SEED)

REFERENCE_TIME = datetime(2026, 1, 1, tzinfo=timezone.utc)

# --------------------------------------------------
# Database connection
# --------------------------------------------------

url = URL.create(
    "postgresql+psycopg2",
    username=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    host="127.0.0.1",
    port=int(os.getenv("DB_PORT", "55441")),
    database=os.getenv("DB_NAME", "bdip"),
)

engine = create_engine(
    url,
    pool_pre_ping=True,
)

# --------------------------------------------------
# Synthetic branches
# --------------------------------------------------

BRANCHES = [
    {
        "branch_id": i,
        "branch_code": f"SIM-BR-{i:03d}",
        "branch_name": f"Synthetic Branch {i:03d}",
        "city": "Nouakchott" if i <= 5 else "Synthetic City",
        "is_active": True,
    }
    for i in range(1, BRANCH_COUNT + 1)
]

# --------------------------------------------------
# Helpers
# --------------------------------------------------

def random_timestamp(max_days=365):
    seconds = rng.randint(0, max_days * 86400)
    return REFERENCE_TIME - timedelta(seconds=seconds)


def generate_customer(customer_id):
    birth_year = rng.randint(1940, 2005)
    birth_date = date(
        birth_year,
        rng.randint(1, 12),
        rng.randint(1, 28),
    )

    return {
        "customer_id": customer_id,
        "customer_type": rng.choices(
            ["individual", "corporate"],
            weights=[95, 5],
        )[0],
        "first_name": fake.first_name()[:100],
        "last_name": fake.last_name()[:100],
        "date_of_birth": birth_date,
        "customer_status": rng.choices(
            ["active", "inactive", "blocked"],
            weights=[90, 8, 2],
        )[0],
        "branch_id": rng.randint(1, BRANCH_COUNT),
        "created_at": random_timestamp(3650),
        "synthetic_record": True,
    }


def generate_account(account_id, customer_id):
    return {
        "account_id": account_id,
        "customer_id": customer_id,
        "account_type": rng.choice(
            ["current", "savings", "business"]
        ),
        "currency": "MRU",
        "account_status": rng.choices(
            ["active", "inactive", "closed"],
            weights=[90, 7, 3],
        )[0],
        "opened_at": random_timestamp(2500),
    }


def generate_transaction(transaction_id, account_id):
    transaction_type = rng.choice(
        ["deposit", "withdrawal", "transfer", "bill_payment"]
    )

    return {
        "transaction_id": transaction_id,
        "account_id": account_id,
        "branch_id": rng.randint(1, BRANCH_COUNT),
        "transaction_type": transaction_type,
        "direction": (
            "credit" if transaction_type == "deposit" else "debit"
        ),
        "amount": Decimal(
            str(round(rng.uniform(100, 250000), 2))
        ),
        "currency": "MRU",
        "transaction_status": rng.choices(
            ["completed", "pending", "failed"],
            weights=[94, 3, 3],
        )[0],
        "channel": rng.choice(
            ["branch", "mobile", "online", "atm"]
        ),
        "transaction_timestamp": random_timestamp(365),
        "synthetic_record": True,
    }


def insert_batches(connection, sql, rows):
    for start in range(0, len(rows), BATCH_SIZE):
        connection.execute(
            text(sql),
            rows[start:start + BATCH_SIZE],
        )


# --------------------------------------------------
# Main generation
# --------------------------------------------------

def main():
    start_time = time.perf_counter()

    print("Starting BMI Bank Corn synthetic data generation")
    print(f"Customers: {CUSTOMER_COUNT:,}")
    print(f"Batch size: {BATCH_SIZE:,}")

    with engine.begin() as connection:

        # Safety: refuse to mix with existing data
        existing = connection.execute(text("""
            SELECT
                (SELECT COUNT(*) FROM raw_corn.customers) +
                (SELECT COUNT(*) FROM raw_corn.accounts) +
                (SELECT COUNT(*) FROM raw_corn.transactions) +
                (SELECT COUNT(*) FROM raw_corn.transfers) +
                (SELECT COUNT(*) FROM raw_corn.branches)
        """)).scalar_one()

        if existing > 0:
            raise RuntimeError(
                "raw_corn enthält bereits Daten. "
                "Generator wurde aus Sicherheitsgründen abgebrochen."
            )

        connection.execute(
            text("""
                INSERT INTO raw_corn.branches
                (branch_id, branch_code, branch_name, city, is_active)
                VALUES
                (:branch_id, :branch_code, :branch_name, :city, :is_active)
            """),
            BRANCHES,
        )

        customer_sql = """
            INSERT INTO raw_corn.customers
            (customer_id, customer_type, first_name, last_name,
             date_of_birth, customer_status, branch_id, created_at,
             synthetic_record)
            VALUES
            (:customer_id, :customer_type, :first_name, :last_name,
             :date_of_birth, :customer_status, :branch_id, :created_at,
             :synthetic_record)
        """

        account_sql = """
            INSERT INTO raw_corn.accounts
            (account_id, customer_id, account_type, currency,
             account_status, opened_at)
            VALUES
            (:account_id, :customer_id, :account_type, :currency,
             :account_status, :opened_at)
        """

        transaction_sql = """
            INSERT INTO raw_corn.transactions
            (transaction_id, account_id, branch_id, transaction_type,
             direction, amount, currency, transaction_status,
             channel, transaction_timestamp, synthetic_record)
            VALUES
            (:transaction_id, :account_id, :branch_id, :transaction_type,
             :direction, :amount, :currency, :transaction_status,
             :channel, :transaction_timestamp, :synthetic_record)
        """

        # Customers and accounts: one account per customer initially
        for start in range(1, CUSTOMER_COUNT + 1, BATCH_SIZE):
            end = min(start + BATCH_SIZE, CUSTOMER_COUNT + 1)

            customers = [
                generate_customer(customer_id)
                for customer_id in range(start, end)
            ]

            accounts = [
                generate_account(customer_id, customer_id)
                for customer_id in range(start, end)
            ]

            insert_batches(connection, customer_sql, customers)
            insert_batches(connection, account_sql, accounts)

            print(f"Customers/accounts generated: {end - 1:,}")

        # Transactions: three per customer in the initial test
        transaction_count = CUSTOMER_COUNT * 3

        for start in range(1, transaction_count + 1, BATCH_SIZE):
            end = min(start + BATCH_SIZE, transaction_count + 1)

            transactions = [
                generate_transaction(
                    transaction_id,
                    rng.randint(1, CUSTOMER_COUNT),
                )
                for transaction_id in range(start, end)
            ]

            insert_batches(connection, transaction_sql, transactions)
            print(f"Transactions generated: {end - 1:,}")

    elapsed = time.perf_counter() - start_time

    print("\nGeneration completed successfully.")
    print(f"Customers:     {CUSTOMER_COUNT:,}")
    print(f"Accounts:      {CUSTOMER_COUNT:,}")
    print(f"Transactions:  {CUSTOMER_COUNT * 3:,}")
    print(f"Branches:      {BRANCH_COUNT}")
    print(f"Elapsed time:  {elapsed:.2f} seconds")
    print(f"Throughput:    {(CUSTOMER_COUNT * 5) / elapsed:,.0f} rows/sec")


if __name__ == "__main__":
    try:
        main()
    finally:
        engine.dispose()
