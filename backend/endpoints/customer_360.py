from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter()


@router.get("/{bank}/customer-360/{customer_id}")
def get_customer_360(bank: str, customer_id: str, request: Request):
    if bank not in ("corn", "sedad"):
        raise HTTPException(status_code=404, detail="Unbekannte Bank.")

    schema = "raw_corn" if bank == "corn" else "raw_sedad"
    synthetic_customer_filter = (
        "AND c.synthetic_record = TRUE" if bank == "corn" else ""
    )
    synthetic_transaction_filter = (
        "AND t.synthetic_record = TRUE" if bank == "corn" else ""
    )
    customer_type_field = (
        "c.customer_type" if bank == "corn"
        else "NULL::varchar AS customer_type"
    )
    branch_field = (
        "c.branch_id" if bank == "corn"
        else "NULL::smallint AS branch_id"
    )

    engine = request.app.state.db_engine

    try:
        with engine.connect() as connection:
            customer = connection.execute(text(f"""
                SELECT
                    c.customer_id::text AS customer_id,
                    c.first_name,
                    c.last_name,
                    {customer_type_field},
                    c.customer_status,
                    {branch_field},
                    c.created_at
                FROM {schema}.customers c
                WHERE c.customer_id::text = :customer_id
                {synthetic_customer_filter}
            """), {"customer_id": customer_id}).mappings().first()

            if customer is None:
                raise HTTPException(
                    status_code=404,
                    detail="Kunde nicht gefunden."
                )

            accounts = connection.execute(text(f"""
                SELECT
                    a.account_id::text AS account_id,
                    a.account_type,
                    a.currency,
                    a.account_status,
                    a.opened_at
                FROM {schema}.accounts a
                WHERE a.customer_id::text = :customer_id
                ORDER BY a.opened_at DESC
            """), {"customer_id": customer_id}).mappings().all()

            transactions = connection.execute(text(f"""
                SELECT
                    t.transaction_id::text AS transaction_id,
                    t.transaction_type,
                    t.amount,
                    t.currency,
                    t.transaction_status,
                    t.channel,
                    t.transaction_timestamp
                FROM {schema}.transactions t
                JOIN {schema}.accounts a
                    ON a.account_id = t.account_id
                WHERE a.customer_id::text = :customer_id
                {synthetic_transaction_filter}
                ORDER BY t.transaction_timestamp DESC
                LIMIT 20
            """), {"customer_id": customer_id}).mappings().all()

        transaction_summary = {}
        for row in transactions:
            currency = row["currency"] or "Unbekannt"
            summary = transaction_summary.setdefault(currency, {
                "currency": currency,
                "transaction_count": 0,
                "completed_count": 0,
                "transaction_volume": 0.0,
            })
            summary["transaction_count"] += 1
            summary["transaction_volume"] += float(row["amount"] or 0)
            if row["transaction_status"] == "completed":
                summary["completed_count"] += 1

        account_summary = {}
        for row in accounts:
            currency = row["currency"] or "Unbekannt"
            summary = account_summary.setdefault(currency, {
                "currency": currency,
                "account_count": 0,
                "active_count": 0,
            })
            summary["account_count"] += 1
            if row["account_status"] == "active":
                summary["active_count"] += 1

        return {
            "bank": bank,
            "data_type": "synthetic_demo_data",
            "analytics": {
                "transaction_count": len(transactions),
                "completed_transactions": sum(
                    1 for row in transactions
                    if row["transaction_status"] == "completed"
                ),
                "transaction_volume_by_currency": list(transaction_summary.values()),
                "accounts_by_currency": list(account_summary.values()),
                "scope": "Letzte maximal 20 Transaktionen, nicht vollständiger Kundenlebenszeitwert",
            },
            "customer": {
                "customer_id": customer["customer_id"],
                "first_name": customer["first_name"],
                "last_name": customer["last_name"],
                "customer_type": customer["customer_type"],
                "customer_status": customer["customer_status"],
                "branch_id": customer["branch_id"],
                "created_at": (
                    customer["created_at"].isoformat()
                    if customer["created_at"] else None
                ),
            },
            "accounts": [
                {
                    "account_id": row["account_id"],
                    "account_type": row["account_type"],
                    "currency": row["currency"],
                    "account_status": row["account_status"],
                    "opened_at": (
                        row["opened_at"].isoformat()
                        if row["opened_at"] else None
                    ),
                }
                for row in accounts
            ],
            "transactions": [
                {
                    "transaction_id": row["transaction_id"],
                    "transaction_type": row["transaction_type"],
                    "amount": float(row["amount"] or 0),
                    "currency": row["currency"],
                    "transaction_status": row["transaction_status"],
                    "channel": row["channel"],
                    "transaction_timestamp": (
                        row["transaction_timestamp"].isoformat()
                        if row["transaction_timestamp"] else None
                    ),
                }
                for row in transactions
            ],
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Customer-360-Daten konnten nicht geladen werden."
        )
