CREATE SCHEMA IF NOT EXISTS staging_corn;

CREATE TABLE IF NOT EXISTS staging_corn.branches (
    branch_id SMALLINT PRIMARY KEY,
    branch_code VARCHAR(20) NOT NULL,
    branch_name VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL,
    source_loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging_corn.customers (
    customer_id BIGINT PRIMARY KEY,
    customer_type VARCHAR(20) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    customer_status VARCHAR(20) NOT NULL,
    branch_id SMALLINT,
    created_at TIMESTAMPTZ NOT NULL,
    synthetic_record BOOLEAN NOT NULL,
    source_loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging_corn.accounts (
    account_id BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    account_type VARCHAR(30) NOT NULL,
    currency CHAR(3) NOT NULL,
    account_status VARCHAR(20) NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL,
    source_loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging_corn.transactions (
    transaction_id BIGINT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    branch_id SMALLINT,
    transaction_type VARCHAR(30) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    amount NUMERIC(18,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    transaction_status VARCHAR(20) NOT NULL,
    channel VARCHAR(30),
    transaction_timestamp TIMESTAMPTZ NOT NULL,
    synthetic_record BOOLEAN NOT NULL,
    source_loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging_corn.transfers (
    transfer_id BIGINT PRIMARY KEY,
    transaction_id BIGINT NOT NULL,
    recipient_bank VARCHAR(100),
    recipient_account_reference VARCHAR(100) NOT NULL,
    transfer_status VARCHAR(20) NOT NULL,
    initiated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    source_loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stg_corn_customers_branch
    ON staging_corn.customers(branch_id);

CREATE INDEX IF NOT EXISTS idx_stg_corn_accounts_customer
    ON staging_corn.accounts(customer_id);

CREATE INDEX IF NOT EXISTS idx_stg_corn_transactions_account
    ON staging_corn.transactions(account_id);

CREATE INDEX IF NOT EXISTS idx_stg_corn_transactions_timestamp
    ON staging_corn.transactions(transaction_timestamp);

CREATE INDEX IF NOT EXISTS idx_stg_corn_transfers_transaction
    ON staging_corn.transfers(transaction_id);
