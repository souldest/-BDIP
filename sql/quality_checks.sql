-- =====================================================
-- BMI Bank Corn - Data Quality Checks
-- Schema: raw_corn
-- =====================================================

\echo '========================================'
\echo '1. ROW COUNTS'
\echo '========================================'

SELECT 'branches' AS table_name, COUNT(*) FROM raw_corn.branches
UNION ALL
SELECT 'customers', COUNT(*) FROM raw_corn.customers
UNION ALL
SELECT 'accounts', COUNT(*) FROM raw_corn.accounts
UNION ALL
SELECT 'transactions', COUNT(*) FROM raw_corn.transactions
UNION ALL
SELECT 'transfers', COUNT(*) FROM raw_corn.transfers;


\echo '========================================'
\echo '2. CUSTOMER AND ACCOUNT RELATIONSHIPS'
\echo '========================================'

-- Customers without accounts
SELECT COUNT(*) AS customers_without_account
FROM raw_corn.customers c
LEFT JOIN raw_corn.accounts a
    ON a.customer_id = c.customer_id
WHERE a.customer_id IS NULL;

-- Customers with multiple accounts
SELECT COUNT(*) AS customers_with_multiple_accounts
FROM (
    SELECT customer_id
    FROM raw_corn.accounts
    GROUP BY customer_id
    HAVING COUNT(*) > 1
) duplicates;

-- Accounts without customers
SELECT COUNT(*) AS accounts_without_customer
FROM raw_corn.accounts a
LEFT JOIN raw_corn.customers c
    ON c.customer_id = a.customer_id
WHERE c.customer_id IS NULL;


\echo '========================================'
\echo '3. BRANCH RELATIONSHIPS'
\echo '========================================'

-- Customers without valid branches
SELECT COUNT(*) AS customers_without_branch
FROM raw_corn.customers c
LEFT JOIN raw_corn.branches b
    ON b.branch_id = c.branch_id
WHERE b.branch_id IS NULL;

-- Transactions without valid branches
SELECT
    COUNT(*) FILTER (
        WHERE t.branch_id IS NULL
    ) AS transactions_without_branch,
    COUNT(*) FILTER (
        WHERE t.branch_id IS NOT NULL
          AND b.branch_id IS NULL
    ) AS transactions_with_invalid_branch
FROM raw_corn.transactions t
LEFT JOIN raw_corn.branches b
    ON b.branch_id = t.branch_id;


\echo '========================================'
\echo '4. TRANSACTION RELATIONSHIPS'
\echo '========================================'

-- Transactions without valid accounts
SELECT COUNT(*) AS transactions_without_account
FROM raw_corn.transactions t
LEFT JOIN raw_corn.accounts a
    ON a.account_id = t.account_id
WHERE a.account_id IS NULL;


\echo '========================================'
\echo '5. TRANSACTION DATA QUALITY'
\echo '========================================'

-- Invalid amounts
SELECT COUNT(*) AS invalid_amounts
FROM raw_corn.transactions
WHERE amount <= 0 OR amount IS NULL;

-- Transaction direction distribution
SELECT direction, COUNT(*)
FROM raw_corn.transactions
GROUP BY direction
ORDER BY direction;

-- Transaction types
SELECT transaction_type, COUNT(*)
FROM raw_corn.transactions
GROUP BY transaction_type
ORDER BY transaction_type;

-- Direction/type consistency
SELECT COUNT(*) AS inconsistent_transaction_directions
FROM raw_corn.transactions
WHERE direction <> CASE
    WHEN transaction_type = 'deposit' THEN 'credit'
    ELSE 'debit'
END;


\echo '========================================'
\echo '6. UNIQUE IDENTIFIERS'
\echo '========================================'

SELECT
    COUNT(*) AS total_customers,
    COUNT(DISTINCT customer_id) AS unique_customer_ids
FROM raw_corn.customers;

SELECT
    COUNT(*) AS total_accounts,
    COUNT(DISTINCT account_id) AS unique_account_ids
FROM raw_corn.accounts;

SELECT
    COUNT(*) AS total_transactions,
    COUNT(DISTINCT transaction_id) AS unique_transaction_ids
FROM raw_corn.transactions;


\echo '========================================'
\echo '7. TRANSFER STATUS'
\echo '========================================'

SELECT
    (SELECT COUNT(*)
     FROM raw_corn.transactions
     WHERE transaction_type = 'transfer') AS transfer_transactions,
    (SELECT COUNT(*)
     FROM raw_corn.transfers) AS transfer_records;

\echo '========================================'
\echo 'QUALITY CHECKS COMPLETED'
\echo '========================================'
