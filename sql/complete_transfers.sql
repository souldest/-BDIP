BEGIN;

INSERT INTO raw_corn.transfers (
    transfer_id,
    transaction_id,
    recipient_bank,
    recipient_account_reference,
    transfer_status,
    initiated_at,
    completed_at
)
SELECT
    t.transaction_id AS transfer_id,
    t.transaction_id,
    CASE (t.transaction_id % 5)
        WHEN 0 THEN 'BMI Bank Corn'
        WHEN 1 THEN 'Mauritania Bank'
        WHEN 2 THEN 'Bank of Africa'
        WHEN 3 THEN 'BCI Mauritania'
        ELSE 'International Partner Bank'
    END AS recipient_bank,
    'MRU-EXT-' || LPAD(t.transaction_id::text, 12, '0'),
    t.transaction_status,
    t.transaction_timestamp,
    CASE
        WHEN t.transaction_status = 'completed'
        THEN t.transaction_timestamp
        ELSE NULL
    END AS completed_at
FROM raw_corn.transactions t
WHERE t.transaction_type = 'transfer'
  AND NOT EXISTS (
      SELECT 1
      FROM raw_corn.transfers tr
      WHERE tr.transaction_id = t.transaction_id
  )
ON CONFLICT (transaction_id) DO NOTHING;

COMMIT;
