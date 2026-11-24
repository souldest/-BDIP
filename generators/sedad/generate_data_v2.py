#!/usr/bin/env python3

import os
import sys
import logging
import random

from pathlib import Path
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, NAMESPACE_URL, uuid5

from dotenv import load_dotenv
from faker import Faker
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

# ==========================================================
# CONFIGURATION
# ==========================================================

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")

TARGET_CUSTOMERS = int(os.getenv("TARGET_CUSTOMERS", "10000"))
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "2000"))
SEED = int(os.getenv("SEED", "20261122"))

TRANSACTIONS_PER_CUSTOMER = 10

GENERATOR_NAME = "sedad_generate_data_v2"

STATE_TABLE = "raw_sedad._generator_v2_state"

ADVISORY_LOCK_CLASS = 731904
ADVISORY_LOCK_OBJECT = 2

# ==========================================================
# LOGGING
# ==========================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

logger = logging.getLogger("sedad_v2")

# ==========================================================
# DATABASE
# ==========================================================

def create_database_engine():

    if not os.getenv("DB_USER") or not os.getenv("DB_NAME"):
        raise RuntimeError(
            "DB_USER und DB_NAME fehlen in der .env-Datei."
        )

    database_url = URL.create(
        drivername="postgresql+psycopg2",
        username=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "55441")),
        database=os.getenv("DB_NAME"),
    )

    return create_engine(
        database_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10}
    )

# ==========================================================
# CHECKPOINT TABLE
# ==========================================================

CREATE_STATE_TABLE = text("""
    CREATE TABLE IF NOT EXISTS raw_sedad._generator_v2_state (
        generator_name VARCHAR(100) PRIMARY KEY,
        seed BIGINT NOT NULL,
        next_customer_index BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
""")

def get_counts(connection):

    result = connection.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM raw_sedad.customers) AS customers,
            (SELECT COUNT(*) FROM raw_sedad.accounts) AS accounts,
            (SELECT COUNT(*) FROM raw_sedad.transactions) AS transactions,
            (SELECT COUNT(*) FROM raw_sedad.transfers) AS transfers
    """)).mappings().one()

    return {key: int(value) for key, value in result.items()}

def initialize_checkpoint(connection):

    connection.execute(CREATE_STATE_TABLE)

    counts = get_counts(connection)

    connection.execute(
        text("""
            INSERT INTO raw_sedad._generator_v2_state (
                generator_name,
                seed,
                next_customer_index
            )
            VALUES (:name, :seed, :next_index)
            ON CONFLICT (generator_name) DO NOTHING
        """),
        {
            "name": GENERATOR_NAME,
            "seed": SEED,
            "next_index": counts["customers"],
        }
    )

    state = connection.execute(
        text("""
            SELECT seed, next_customer_index
            FROM raw_sedad._generator_v2_state
            WHERE generator_name = :name
            FOR UPDATE
        """),
        {"name": GENERATOR_NAME}
    ).mappings().one()

    if int(state["seed"]) != SEED:
        raise RuntimeError(
            "Seed stimmt nicht mit dem gespeicherten Fortschritt überein."
        )

    if int(state["next_customer_index"]) != counts["customers"]:
        raise RuntimeError(
            "Checkpoint und Kundenzahl stimmen nicht überein. "
            "Aus Sicherheitsgründen wird abgebrochen."
        )

    return counts

# ==========================================================
# DETERMINISTIC UUID
# ==========================================================

NAMESPACE = uuid5(
    NAMESPACE_URL,
    f"bdip:raw_sedad:generate_data_v2:{SEED}"
)

def make_uuid(entity, customer_index, item_index=0):

    return uuid5(
        NAMESPACE,
        f"{entity}:{customer_index}:{item_index}"
    )

# ==========================================================
# TIMESTAMPS
# ==========================================================

def make_timestamp(rng, now):

    return now - timedelta(
        days=rng.randint(0, 365),
        seconds=rng.randint(0, 86400)
    )

# ==========================================================
# GENERATE ONE BATCH
# ==========================================================

def generate_batch(start_index, customer_count):

    customers = []
    accounts = []
    transactions = []
    transfers = []

    now = datetime.now(timezone.utc)

    fake = Faker()

    for customer_index in range(
        start_index,
        start_index + customer_count
    ):

        local_seed = SEED * 1_000_003 + customer_index

        rng = random.Random(local_seed)
        fake.seed_instance(local_seed)

        # -------------------------
        # CUSTOMER
        # -------------------------

        customer_id = make_uuid(
            "customer",
            customer_index
        )

        customers.append({
            "customer_id": customer_id,
            "first_name": fake.first_name(),
            "last_name": fake.last_name(),
            "email": (
                f"{fake.user_name()}-"
                f"{customer_id.hex[:16]}@example.test"
            ),
            "date_of_birth": fake.date_of_birth(
                minimum_age=18,
                maximum_age=85
            ),
            "customer_status": rng.choices(
                ["active", "inactive", "blocked"],
                weights=[85, 12, 3]
            )[0],
            "created_at": make_timestamp(rng, now),
        })

        # -------------------------
        # ACCOUNTS
        # -------------------------

        number_of_accounts = (
            2 if customer_index % 10 < 3 else 1
        )

        customer_accounts = []

        account_currencies = {}

        for account_index in range(number_of_accounts):

            account_id = make_uuid(
                "account",
                customer_index,
                account_index
            )

            currency = rng.choice(
                ["EUR", "USD", "GBP"]
            )

            customer_accounts.append(account_id)
            account_currencies[account_id] = currency

            accounts.append({
                "account_id": account_id,
                "customer_id": customer_id,
                "account_type": rng.choice(
                    ["current", "savings"]
                ),
                "currency": currency,
                "account_status": rng.choice(
                    ["active", "inactive"]
                ),
                "opened_at": make_timestamp(rng, now),
            })

        # -------------------------
        # TRANSACTIONS
        # -------------------------

        for transaction_index in range(
            TRANSACTIONS_PER_CUSTOMER
        ):

            transaction_id = make_uuid(
                "transaction",
                customer_index,
                transaction_index
            )

            account_id = rng.choice(customer_accounts)

            transaction_type = rng.choices(
                ["deposit", "withdrawal", "transfer"],
                weights=[35, 30, 35]
            )[0]

            status = rng.choices(
                ["completed", "pending", "failed"],
                weights=[90, 4, 6]
            )[0]

            timestamp = make_timestamp(rng, now)

            currency = account_currencies[account_id]

            amount = Decimal(
                f"{rng.uniform(5, 2500):.2f}"
            )

            transactions.append({
                "transaction_id": transaction_id,
                "account_id": account_id,
                "transaction_type": transaction_type,
                "amount": amount,
                "currency": currency,
                "transaction_status": status,
                "channel": rng.choice(
                    ["mobile_app", "web", "atm"]
                ),
                "transaction_timestamp": timestamp,
            })

            # -------------------------
            # TRANSFERS
            # -------------------------

            if transaction_type == "transfer":

                completed_at = None

                if status == "completed":
                    completed_at = timestamp + timedelta(
                        minutes=rng.randint(1, 30)
                    )

                transfers.append({
                    "transfer_id": make_uuid(
                        "transfer",
                        customer_index,
                        transaction_index
                    ),
                    "transaction_id": transaction_id,
                    "recipient_account_reference": (
                        f"EXT-{rng.randint(10000000, 99999999)}"
                    ),
                    "transfer_status": status,
                    "initiated_at": timestamp,
                    "completed_at": completed_at,
                })

    return customers, accounts, transactions, transfers

# ==========================================================
# SQL INSERT STATEMENTS
# ==========================================================

INSERT_CUSTOMERS = text("""
    INSERT INTO raw_sedad.customers (
        customer_id,
        first_name,
        last_name,
        email,
        date_of_birth,
        customer_status,
        created_at
    )
    VALUES (
        :customer_id,
        :first_name,
        :last_name,
        :email,
        :date_of_birth,
        :customer_status,
        :created_at
    )
""")

INSERT_ACCOUNTS = text("""
    INSERT INTO raw_sedad.accounts (
        account_id,
        customer_id,
        account_type,
        currency,
        account_status,
        opened_at
    )
    VALUES (
        :account_id,
        :customer_id,
        :account_type,
        :currency,
        :account_status,
        :opened_at
    )
""")

INSERT_TRANSACTIONS = text("""
    INSERT INTO raw_sedad.transactions (
        transaction_id,
        account_id,
        transaction_type,
        amount,
        currency,
        transaction_status,
        channel,
        transaction_timestamp
    )
    VALUES (
        :transaction_id,
        :account_id,
        :transaction_type,
        :amount,
        :currency,
        :transaction_status,
        :channel,
        :transaction_timestamp
    )
""")

INSERT_TRANSFERS = text("""
    INSERT INTO raw_sedad.transfers (
        transfer_id,
        transaction_id,
        recipient_account_reference,
        transfer_status,
        initiated_at,
        completed_at
    )
    VALUES (
        :transfer_id,
        :transaction_id,
        :recipient_account_reference,
        :transfer_status,
        :initiated_at,
        :completed_at
    )
""")

# ==========================================================
# MAIN
# ==========================================================

def run():

    if TARGET_CUSTOMERS < 0:
        raise ValueError("TARGET_CUSTOMERS muss >= 0 sein.")

    if BATCH_SIZE < 1:
        raise ValueError("BATCH_SIZE muss mindestens 1 sein.")

    engine = create_database_engine()

    connection = None
    lock_acquired = False

    try:

        connection = engine.connect()

        # Prevent parallel generator executions.
        connection.execute(
            text("""
                SELECT pg_advisory_lock(:lock_class, :lock_object)
            """),
            {
                "lock_class": ADVISORY_LOCK_CLASS,
                "lock_object": ADVISORY_LOCK_OBJECT,
            }
        )

        connection.commit()
        lock_acquired = True

        # Initialize or validate checkpoint.
        with connection.begin():
            counts = initialize_checkpoint(connection)

        if counts["customers"] > TARGET_CUSTOMERS:
            raise RuntimeError(
                f"Current customer count ({counts['customers']}) "
                f"exceeds target ({TARGET_CUSTOMERS})."
            )

        logger.info("======================================")
        logger.info("SEDAD GENERATOR V2")
        logger.info("======================================")

        logger.info("Existing customers: %s", counts["customers"])
        logger.info("Target customers:   %s", TARGET_CUSTOMERS)
        logger.info("Batch size:         %s", BATCH_SIZE)
        logger.info("Seed:               %s", SEED)

        while True:

            summary = None

            # Every batch and its checkpoint commit atomically.
            with connection.begin():

                before = get_counts(connection)

                state = connection.execute(
                    text("""
                        SELECT seed, next_customer_index
                        FROM raw_sedad._generator_v2_state
                        WHERE generator_name = :name
                        FOR UPDATE
                    """),
                    {"name": GENERATOR_NAME}
                ).mappings().one()

                if int(state["seed"]) != SEED:
                    raise RuntimeError("Checkpoint seed mismatch.")

                start_index = int(
                    state["next_customer_index"]
                )

                if start_index != before["customers"]:
                    raise RuntimeError(
                        "Checkpoint/customer count mismatch. "
                        "Generation stopped."
                    )

                remaining = (
                    TARGET_CUSTOMERS - before["customers"]
                )

                if remaining <= 0:
                    final_counts = before
                else:

                    current_batch = min(
                        BATCH_SIZE,
                        remaining
                    )

                    end_index = start_index + current_batch

                    batch_customers, batch_accounts, batch_transactions, batch_transfers = (
                        generate_batch(
                            start_index,
                            current_batch
                        )
                    )

                    # Insert in foreign-key dependency order.
                    connection.execute(
                        INSERT_CUSTOMERS,
                        batch_customers
                    )

                    connection.execute(
                        INSERT_ACCOUNTS,
                        batch_accounts
                    )

                    connection.execute(
                        INSERT_TRANSACTIONS,
                        batch_transactions
                    )

                    if batch_transfers:
                        connection.execute(
                            INSERT_TRANSFERS,
                            batch_transfers
                        )

                    # Update checkpoint in the same transaction.
                    connection.execute(
                        text("""
                            UPDATE raw_sedad._generator_v2_state
                            SET next_customer_index = :next_index,
                                updated_at = NOW()
                            WHERE generator_name = :name
                        """),
                        {
                            "next_index": end_index,
                            "name": GENERATOR_NAME,
                        }
                    )

                    after = get_counts(connection)

                    summary = {
                        "new_customers": after["customers"] - before["customers"],
                        "new_accounts": after["accounts"] - before["accounts"],
                        "new_transactions": after["transactions"] - before["transactions"],
                        "new_transfers": after["transfers"] - before["transfers"],
                        "totals": after,
                    }

                    final_counts = after

            # The batch has now committed successfully.

            if summary is None:
                break

            logger.info(
                "BATCH COMMITTED | +%s customers | +%s accounts | "
                "+%s transactions | +%s transfers",
                summary["new_customers"],
                summary["new_accounts"],
                summary["new_transactions"],
                summary["new_transfers"],
            )

            logger.info(
                "CURRENT TOTALS | customers=%s accounts=%s "
                "transactions=%s transfers=%s",
                summary["totals"]["customers"],
                summary["totals"]["accounts"],
                summary["totals"]["transactions"],
                summary["totals"]["transfers"],
            )

        logger.info("======================================")
        logger.info("GENERATION FINISHED")
        logger.info("======================================")

        logger.info("Customers:    %s", final_counts["customers"])
        logger.info("Accounts:     %s", final_counts["accounts"])
        logger.info("Transactions: %s", final_counts["transactions"])
        logger.info("Transfers:    %s", final_counts["transfers"])

    except Exception:

        logger.exception(
            "Generation failed. The current batch was rolled back."
        )

        raise

    finally:

        if connection is not None:

            if lock_acquired:
                try:
                    connection.execute(
                        text("""
                            SELECT pg_advisory_unlock(
                                :lock_class,
                                :lock_object
                            )
                        """),
                        {
                            "lock_class": ADVISORY_LOCK_CLASS,
                            "lock_object": ADVISORY_LOCK_OBJECT,
                        }
                    )

                    connection.commit()

                except Exception:
                    logger.exception(
                        "Could not explicitly release advisory lock."
                    )

            connection.close()

        engine.dispose()

if __name__ == "__main__":

    try:
        run()

    except Exception:
        sys.exit(1)
