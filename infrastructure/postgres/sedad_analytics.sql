CREATE SCHEMA IF NOT EXISTS analytics_sedad;

-- CUSTOMER DIMENSION

CREATE TABLE IF NOT EXISTS analytics_sedad.dim_customer (
    customer_key BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_customer_id UUID NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    date_of_birth DATE,
    customer_status VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    synthetic_record BOOLEAN NOT NULL DEFAULT TRUE
);

-- ACCOUNT DIMENSION

CREATE TABLE IF NOT EXISTS analytics_sedad.dim_account (
    account_key BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_account_id UUID NOT NULL UNIQUE,
    customer_key BIGINT NOT NULL
        REFERENCES analytics_sedad.dim_customer(customer_key),
    account_type VARCHAR(30) NOT NULL,
    currency CHAR(3) NOT NULL,
    account_status VARCHAR(30) NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL
);

-- DATE DIMENSION

CREATE TABLE IF NOT EXISTS analytics_sedad.dim_date (
    date_key INTEGER PRIMARY KEY,
    full_date DATE NOT NULL UNIQUE,
    day_of_month INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL,
    day_name VARCHAR(20) NOT NULL,
    week_of_year INTEGER NOT NULL,
    month_number INTEGER NOT NULL,
    month_name VARCHAR(20) NOT NULL,
    quarter_number INTEGER NOT NULL,
    year_number INTEGER NOT NULL,
    is_weekend BOOLEAN NOT NULL
);

-- TRANSACTION FACT

CREATE TABLE IF NOT EXISTS analytics_sedad.fact_transactions (
    transaction_key BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_transaction_id UUID NOT NULL UNIQUE,
    customer_key BIGINT NOT NULL
        REFERENCES analytics_sedad.dim_customer(customer_key),
    account_key BIGINT NOT NULL
        REFERENCES analytics_sedad.dim_account(account_key),
    date_key INTEGER NOT NULL
        REFERENCES analytics_sedad.dim_date(date_key),
    transaction_type VARCHAR(30) NOT NULL,
    direction VARCHAR(10) NOT NULL
        CHECK (direction IN ('credit', 'debit')),
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    currency CHAR(3) NOT NULL,
    transaction_status VARCHAR(30) NOT NULL,
    channel VARCHAR(30),
    transaction_timestamp TIMESTAMPTZ NOT NULL
);

-- TRANSFER FACT

CREATE TABLE IF NOT EXISTS analytics_sedad.fact_transfers (
    transfer_key BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_transfer_id UUID NOT NULL UNIQUE,
    source_transaction_id UUID NOT NULL UNIQUE,
    transaction_key BIGINT NOT NULL UNIQUE
        REFERENCES analytics_sedad.fact_transactions(transaction_key),
    customer_key BIGINT NOT NULL
        REFERENCES analytics_sedad.dim_customer(customer_key),
    account_key BIGINT NOT NULL
        REFERENCES analytics_sedad.dim_account(account_key),
    date_key INTEGER NOT NULL
        REFERENCES analytics_sedad.dim_date(date_key),
    recipient_account_reference VARCHAR(100) NOT NULL,
    transfer_status VARCHAR(30) NOT NULL,
    initiated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

-- INDEXES

CREATE INDEX IF NOT EXISTS idx_sedad_analytics_account_customer
    ON analytics_sedad.dim_account(customer_key);

CREATE INDEX IF NOT EXISTS idx_sedad_analytics_transactions_customer
    ON analytics_sedad.fact_transactions(customer_key);

CREATE INDEX IF NOT EXISTS idx_sedad_analytics_transactions_account
    ON analytics_sedad.fact_transactions(account_key);

CREATE INDEX IF NOT EXISTS idx_sedad_analytics_transactions_date
    ON analytics_sedad.fact_transactions(date_key);

CREATE INDEX IF NOT EXISTS idx_sedad_analytics_transfers_customer
    ON analytics_sedad.fact_transfers(customer_key);

CREATE INDEX IF NOT EXISTS idx_sedad_analytics_transfers_date
    ON analytics_sedad.fact_transfers(date_key);
