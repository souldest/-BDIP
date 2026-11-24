BEGIN;

-- =====================================================
-- 0. DATA QUALITY GUARDS
-- =====================================================

DO $$
BEGIN

    IF (SELECT COUNT(*) FROM raw_sedad.customers)
       <> (SELECT COUNT(*) FROM staging_sedad.customers) THEN
        RAISE EXCEPTION 'Customer counts differ between raw and staging';
    END IF;

    IF (SELECT COUNT(*) FROM raw_sedad.accounts)
       <> (SELECT COUNT(*) FROM staging_sedad.accounts) THEN
        RAISE EXCEPTION 'Account counts differ between raw and staging';
    END IF;

    IF (SELECT COUNT(*) FROM raw_sedad.transactions)
       <> (SELECT COUNT(*) FROM staging_sedad.transactions) THEN
        RAISE EXCEPTION 'Transaction counts differ between raw and staging';
    END IF;

    IF (SELECT COUNT(*) FROM raw_sedad.transfers)
       <> (SELECT COUNT(*) FROM staging_sedad.transfers) THEN
        RAISE EXCEPTION 'Transfer counts differ between raw and staging';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM staging_sedad.transactions
        WHERE transaction_type NOT IN (
            'deposit', 'withdrawal', 'transfer'
        )
    ) THEN
        RAISE EXCEPTION 'Unknown transaction type detected';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM staging_sedad.transactions
        WHERE transaction_type = 'transfer'
    ) <> (
        SELECT COUNT(*)
        FROM staging_sedad.transfers
    ) THEN
        RAISE EXCEPTION
            'Transfer transactions and transfer records do not match';
    END IF;

END $$;

-- =====================================================
-- 1. CUSTOMER DIMENSION
-- =====================================================

INSERT INTO analytics_sedad.dim_customer (
    source_customer_id,
    first_name,
    last_name,
    email,
    date_of_birth,
    customer_status,
    created_at,
    synthetic_record
)
SELECT
    customer_id,
    first_name,
    last_name,
    email,
    date_of_birth,
    customer_status,
    created_at,
    TRUE
FROM staging_sedad.customers

ON CONFLICT (source_customer_id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    email = EXCLUDED.email,
    date_of_birth = EXCLUDED.date_of_birth,
    customer_status = EXCLUDED.customer_status,
    created_at = EXCLUDED.created_at,
    synthetic_record = EXCLUDED.synthetic_record;

-- =====================================================
-- 2. ACCOUNT DIMENSION
-- =====================================================

INSERT INTO analytics_sedad.dim_account (
    source_account_id,
    customer_key,
    account_type,
    currency,
    account_status,
    opened_at
)
SELECT
    a.account_id,
    c.customer_key,
    a.account_type,
    a.currency,
    a.account_status,
    a.opened_at
FROM staging_sedad.accounts a
JOIN analytics_sedad.dim_customer c
    ON c.source_customer_id = a.customer_id

ON CONFLICT (source_account_id) DO UPDATE SET
    customer_key = EXCLUDED.customer_key,
    account_type = EXCLUDED.account_type,
    currency = EXCLUDED.currency,
    account_status = EXCLUDED.account_status,
    opened_at = EXCLUDED.opened_at;

-- =====================================================
-- 3. DATE DIMENSION
-- =====================================================

WITH date_bounds AS (
    SELECT
        MIN(event_date) AS min_date,
        MAX(event_date) AS max_date
    FROM (
        SELECT transaction_timestamp::date AS event_date
        FROM staging_sedad.transactions

        UNION ALL

        SELECT initiated_at::date AS event_date
        FROM staging_sedad.transfers
    ) events
),
calendar AS (
    SELECT series_date::date AS calendar_date
    FROM date_bounds b
    CROSS JOIN LATERAL generate_series(
        b.min_date::timestamp,
        b.max_date::timestamp,
        INTERVAL '1 day'
    ) AS series_date
    WHERE b.min_date IS NOT NULL
)

INSERT INTO analytics_sedad.dim_date (
    date_key,
    full_date,
    day_of_month,
    day_of_week,
    day_name,
    week_of_year,
    month_number,
    month_name,
    quarter_number,
    year_number,
    is_weekend
)
SELECT
    TO_CHAR(calendar_date, 'YYYYMMDD')::integer,
    calendar_date,
    EXTRACT(DAY FROM calendar_date)::integer,
    EXTRACT(DOW FROM calendar_date)::integer,
    TO_CHAR(calendar_date, 'FMDay'),
    EXTRACT(WEEK FROM calendar_date)::integer,
    EXTRACT(MONTH FROM calendar_date)::integer,
    TO_CHAR(calendar_date, 'FMMonth'),
    EXTRACT(QUARTER FROM calendar_date)::integer,
    EXTRACT(YEAR FROM calendar_date)::integer,
    EXTRACT(ISODOW FROM calendar_date) IN (6, 7)
FROM calendar

ON CONFLICT (full_date) DO UPDATE SET
    day_of_month = EXCLUDED.day_of_month,
    day_of_week = EXCLUDED.day_of_week,
    day_name = EXCLUDED.day_name,
    week_of_year = EXCLUDED.week_of_year,
    month_number = EXCLUDED.month_number,
    month_name = EXCLUDED.month_name,
    quarter_number = EXCLUDED.quarter_number,
    year_number = EXCLUDED.year_number,
    is_weekend = EXCLUDED.is_weekend;

-- =====================================================
-- 4. TRANSACTION FACT
-- =====================================================

INSERT INTO analytics_sedad.fact_transactions (
    source_transaction_id,
    customer_key,
    account_key,
    date_key,
    transaction_type,
    direction,
    amount,
    currency,
    transaction_status,
    channel,
    transaction_timestamp
)
SELECT
    t.transaction_id,
    da.customer_key,
    da.account_key,
    dd.date_key,
    t.transaction_type,

    CASE
        WHEN t.transaction_type = 'deposit'
            THEN 'credit'
        ELSE 'debit'
    END,

    t.amount,
    t.currency,
    t.transaction_status,
    t.channel,
    t.transaction_timestamp

FROM staging_sedad.transactions t

JOIN analytics_sedad.dim_account da
    ON da.source_account_id = t.account_id

JOIN analytics_sedad.dim_date dd
    ON dd.full_date = t.transaction_timestamp::date

ON CONFLICT (source_transaction_id) DO UPDATE SET
    customer_key = EXCLUDED.customer_key,
    account_key = EXCLUDED.account_key,
    date_key = EXCLUDED.date_key,
    transaction_type = EXCLUDED.transaction_type,
    direction = EXCLUDED.direction,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    transaction_status = EXCLUDED.transaction_status,
    channel = EXCLUDED.channel,
    transaction_timestamp = EXCLUDED.transaction_timestamp;

-- =====================================================
-- 5. TRANSFER FACT
-- =====================================================

INSERT INTO analytics_sedad.fact_transfers (
    source_transfer_id,
    source_transaction_id,
    transaction_key,
    customer_key,
    account_key,
    date_key,
    recipient_account_reference,
    transfer_status,
    initiated_at,
    completed_at
)
SELECT
    tr.transfer_id,
    tr.transaction_id,
    ft.transaction_key,
    ft.customer_key,
    ft.account_key,
    dd.date_key,
    tr.recipient_account_reference,
    tr.transfer_status,
    tr.initiated_at,
    tr.completed_at

FROM staging_sedad.transfers tr

JOIN analytics_sedad.fact_transactions ft
    ON ft.source_transaction_id = tr.transaction_id

JOIN analytics_sedad.dim_date dd
    ON dd.full_date = tr.initiated_at::date

ON CONFLICT (source_transfer_id) DO UPDATE SET
    source_transaction_id = EXCLUDED.source_transaction_id,
    transaction_key = EXCLUDED.transaction_key,
    customer_key = EXCLUDED.customer_key,
    account_key = EXCLUDED.account_key,
    date_key = EXCLUDED.date_key,
    recipient_account_reference =
        EXCLUDED.recipient_account_reference,
    transfer_status = EXCLUDED.transfer_status,
    initiated_at = EXCLUDED.initiated_at,
    completed_at = EXCLUDED.completed_at;

COMMIT;
