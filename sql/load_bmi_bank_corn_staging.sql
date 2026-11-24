BEGIN;

INSERT INTO staging_corn.branches (
    branch_id, branch_code, branch_name, city, is_active
)
SELECT
    branch_id, branch_code, branch_name, city, is_active
FROM raw_corn.branches
ON CONFLICT (branch_id) DO UPDATE SET
    branch_code = EXCLUDED.branch_code,
    branch_name = EXCLUDED.branch_name,
    city = EXCLUDED.city,
    is_active = EXCLUDED.is_active,
    source_loaded_at = NOW();

INSERT INTO staging_corn.customers (
    customer_id, customer_type, first_name, last_name,
    date_of_birth, customer_status, branch_id, created_at,
    synthetic_record
)
SELECT
    customer_id, customer_type, first_name, last_name,
    date_of_birth, customer_status, branch_id, created_at,
    synthetic_record
FROM raw_corn.customers
ON CONFLICT (customer_id) DO UPDATE SET
    customer_type = EXCLUDED.customer_type,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    date_of_birth = EXCLUDED.date_of_birth,
    customer_status = EXCLUDED.customer_status,
    branch_id = EXCLUDED.branch_id,
    created_at = EXCLUDED.created_at,
    synthetic_record = EXCLUDED.synthetic_record,
    source_loaded_at = NOW();

INSERT INTO staging_corn.accounts (
    account_id, customer_id, account_type, currency,
    account_status, opened_at
)
SELECT
    account_id, customer_id, account_type, currency,
    account_status, opened_at
FROM raw_corn.accounts
ON CONFLICT (account_id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    account_type = EXCLUDED.account_type,
    currency = EXCLUDED.currency,
    account_status = EXCLUDED.account_status,
    opened_at = EXCLUDED.opened_at,
    source_loaded_at = NOW();

INSERT INTO staging_corn.transactions (
    transaction_id, account_id, branch_id, transaction_type,
    direction, amount, currency, transaction_status,
    channel, transaction_timestamp, synthetic_record
)
SELECT
    transaction_id, account_id, branch_id, transaction_type,
    direction, amount, currency, transaction_status,
    channel, transaction_timestamp, synthetic_record
FROM raw_corn.transactions
ON CONFLICT (transaction_id) DO UPDATE SET
    account_id = EXCLUDED.account_id,
    branch_id = EXCLUDED.branch_id,
    transaction_type = EXCLUDED.transaction_type,
    direction = EXCLUDED.direction,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    transaction_status = EXCLUDED.transaction_status,
    channel = EXCLUDED.channel,
    transaction_timestamp = EXCLUDED.transaction_timestamp,
    synthetic_record = EXCLUDED.synthetic_record,
    source_loaded_at = NOW();

INSERT INTO staging_corn.transfers (
    transfer_id, transaction_id, recipient_bank,
    recipient_account_reference, transfer_status,
    initiated_at, completed_at
)
SELECT
    transfer_id, transaction_id, recipient_bank,
    recipient_account_reference, transfer_status,
    initiated_at, completed_at
FROM raw_corn.transfers
ON CONFLICT (transfer_id) DO UPDATE SET
    transaction_id = EXCLUDED.transaction_id,
    recipient_bank = EXCLUDED.recipient_bank,
    recipient_account_reference = EXCLUDED.recipient_account_reference,
    transfer_status = EXCLUDED.transfer_status,
    initiated_at = EXCLUDED.initiated_at,
    completed_at = EXCLUDED.completed_at,
    source_loaded_at = NOW();

COMMIT;
