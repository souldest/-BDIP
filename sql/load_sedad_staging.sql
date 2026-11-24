BEGIN;

-- 1. CUSTOMERS
INSERT INTO staging_sedad.customers (
    customer_id,
    first_name,
    last_name,
    email,
    date_of_birth,
    customer_status,
    created_at
)
SELECT
    customer_id,
    first_name,
    last_name,
    email,
    date_of_birth,
    customer_status,
    created_at
FROM raw_sedad.customers
ON CONFLICT (customer_id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    email = EXCLUDED.email,
    date_of_birth = EXCLUDED.date_of_birth,
    customer_status = EXCLUDED.customer_status,
    created_at = EXCLUDED.created_at,
    source_loaded_at = NOW();

-- 2. ACCOUNTS
INSERT INTO staging_sedad.accounts (
    account_id,
    customer_id,
    account_type,
    currency,
    account_status,
    opened_at
)
SELECT
    account_id,
    customer_id,
    account_type,
    currency,
    account_status,
    opened_at
FROM raw_sedad.accounts
ON CONFLICT (account_id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    account_type = EXCLUDED.account_type,
    currency = EXCLUDED.currency,
    account_status = EXCLUDED.account_status,
    opened_at = EXCLUDED.opened_at,
    source_loaded_at = NOW();

-- 3. TRANSACTIONS
INSERT INTO staging_sedad.transactions (
    transaction_id,
    account_id,
    transaction_type,
    amount,
    currency,
    transaction_status,
    channel,
    transaction_timestamp
)
SELECT
    transaction_id,
    account_id,
    transaction_type,
    amount,
    currency,
    transaction_status,
    channel,
    transaction_timestamp
FROM raw_sedad.transactions
ON CONFLICT (transaction_id) DO UPDATE SET
    account_id = EXCLUDED.account_id,
    transaction_type = EXCLUDED.transaction_type,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    transaction_status = EXCLUDED.transaction_status,
    channel = EXCLUDED.channel,
    transaction_timestamp = EXCLUDED.transaction_timestamp,
    source_loaded_at = NOW();

-- 4. TRANSFERS
INSERT INTO staging_sedad.transfers (
    transfer_id,
    transaction_id,
    recipient_account_reference,
    transfer_status,
    initiated_at,
    completed_at
)
SELECT
    transfer_id,
    transaction_id,
    recipient_account_reference,
    transfer_status,
    initiated_at,
    completed_at
FROM raw_sedad.transfers
ON CONFLICT (transfer_id) DO UPDATE SET
    transaction_id = EXCLUDED.transaction_id,
    recipient_account_reference =
        EXCLUDED.recipient_account_reference,
    transfer_status = EXCLUDED.transfer_status,
    initiated_at = EXCLUDED.initiated_at,
    completed_at = EXCLUDED.completed_at,
    source_loaded_at = NOW();

COMMIT;
