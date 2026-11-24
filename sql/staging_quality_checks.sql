\echo '========================================'
\echo 'STAGING QUALITY CHECKS'
\echo '========================================'

\echo ''
\echo '1. ROW COUNTS'

SELECT 'branches' AS table_name, COUNT(*) FROM staging_corn.branches
UNION ALL
SELECT 'customers', COUNT(*) FROM staging_corn.customers
UNION ALL
SELECT 'accounts', COUNT(*) FROM staging_corn.accounts
UNION ALL
SELECT 'transactions', COUNT(*) FROM staging_corn.transactions
UNION ALL
SELECT 'transfers', COUNT(*) FROM staging_corn.transfers;

\echo ''
\echo '2. CUSTOMER AND ACCOUNT RELATIONSHIPS'

SELECT COUNT(*) AS customers_without_account
FROM staging_corn.customers c
LEFT JOIN staging_corn.accounts a
    ON c.customer_id = a.customer_id
WHERE a.account_id IS NULL;

SELECT COUNT(*) AS accounts_without_customer
FROM staging_corn.accounts a
LEFT JOIN staging_corn.customers c
    ON a.customer_id = c.customer_id
WHERE c.customer_id IS NULL;

\echo ''
\echo '3. TRANSACTION RELATIONSHIPS'

SELECT COUNT(*) AS transactions_without_account
FROM staging_corn.transactions t
LEFT JOIN staging_corn.accounts a
    ON t.account_id = a.account_id
WHERE a.account_id IS NULL;

SELECT COUNT(*) AS transactions_without_branch
FROM staging_corn.transactions t
LEFT JOIN staging_corn.branches b
    ON t.branch_id = b.branch_id
WHERE b.branch_id IS NULL;

\echo ''
\echo '4. TRANSFER RELATIONSHIPS'

SELECT COUNT(*) AS transfers_without_transaction
FROM staging_corn.transfers tr
LEFT JOIN staging_corn.transactions t
    ON tr.transaction_id = t.transaction_id
WHERE t.transaction_id IS NULL;

SELECT COUNT(*) AS transfers_with_wrong_type
FROM staging_corn.transfers tr
JOIN staging_corn.transactions t
    ON tr.transaction_id = t.transaction_id
WHERE t.transaction_type <> 'transfer';

SELECT COUNT(*) AS transfer_transactions_without_details
FROM staging_corn.transactions t
LEFT JOIN staging_corn.transfers tr
    ON t.transaction_id = tr.transaction_id
WHERE t.transaction_type = 'transfer'
  AND tr.transfer_id IS NULL;

\echo ''
\echo '5. FINANCIAL DATA VALIDATION'

SELECT COUNT(*) AS invalid_amounts
FROM staging_corn.transactions
WHERE amount <= 0;

SELECT COUNT(*) AS invalid_directions
FROM staging_corn.transactions
WHERE direction NOT IN ('credit', 'debit');

SELECT COUNT(*) AS inconsistent_directions
FROM staging_corn.transactions
WHERE (transaction_type = 'deposit' AND direction <> 'credit')
   OR (transaction_type <> 'deposit' AND direction <> 'debit');

\echo ''
\echo '6. TRANSFER STATUS VALIDATION'

SELECT COUNT(*) AS completed_without_completion_time
FROM staging_corn.transfers
WHERE transfer_status = 'completed'
  AND completed_at IS NULL;

SELECT COUNT(*) AS incomplete_with_completion_time
FROM staging_corn.transfers
WHERE transfer_status IN ('pending', 'failed')
  AND completed_at IS NOT NULL;

SELECT COUNT(*) AS completion_before_initiation
FROM staging_corn.transfers
WHERE completed_at < initiated_at;

\echo ''
\echo '7. DUPLICATE TRANSFER REFERENCES'

SELECT COUNT(*) AS duplicate_transaction_references
FROM (
    SELECT transaction_id
    FROM staging_corn.transfers
    GROUP BY transaction_id
    HAVING COUNT(*) > 1
) duplicates;

\echo ''
\echo 'STAGING QUALITY CHECKS COMPLETED'
