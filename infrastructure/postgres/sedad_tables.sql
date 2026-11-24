-- SEDAD: synthetic source data model
-- All records are fictional and generated for the BDIP PoC.

CREATE TABLE IF NOT EXISTS raw_sedad.customers (
    customer_id UUID PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    date_of_birth DATE,
    customer_status VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_sedad.accounts (
    account_id UUID PRIMARY KEY,
    customer_id UUID NOT NULL
        REFERENCES raw_sedad.customers(customer_id),
    account_type VARCHAR(30) NOT NULL,
    currency CHAR(3) NOT NULL,
    account_status VARCHAR(30) NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_sedad.transactions (
    transaction_id UUID PRIMARY KEY,
    account_id UUID NOT NULL
        REFERENCES raw_sedad.accounts(account_id),
    transaction_type VARCHAR(30) NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    currency CHAR(3) NOT NULL,
    transaction_status VARCHAR(30) NOT NULL,
    channel VARCHAR(30),
    transaction_timestamp TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_sedad.transfers (
    transfer_id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL UNIQUE
        REFERENCES raw_sedad.transactions(transaction_id),
    recipient_account_reference VARCHAR(100) NOT NULL,
    transfer_status VARCHAR(30) NOT NULL,
    initiated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

-- Indexes for common joins and time-based analysis

CREATE INDEX IF NOT EXISTS idx_sedad_accounts_customer
    ON raw_sedad.accounts(customer_id);

CREATE INDEX IF NOT EXISTS idx_sedad_transactions_account
    ON raw_sedad.transactions(account_id);

CREATE INDEX IF NOT EXISTS idx_sedad_transactions_timestamp
    ON raw_sedad.transactions(transaction_timestamp);

CREATE INDEX IF NOT EXISTS idx_sedad_transfers_transaction
    ON raw_sedad.transfers(transaction_id);
