from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter()

def get_rows(connection, query):
    return [
        dict(row)
        for row in connection.execute(text(query)).mappings().all()
    ]

@router.get("/overview")
def sedad_analytics_overview(request: Request):
    try:
        with request.app.state.db_engine.connect() as connection:

            counts = connection.execute(text("""
                SELECT
                    (SELECT COUNT(*)
                     FROM analytics_sedad.dim_customer) AS customers,
                    (SELECT COUNT(*)
                     FROM analytics_sedad.dim_account) AS accounts,
                    (SELECT COUNT(*)
                     FROM analytics_sedad.fact_transactions) AS transactions,
                    (SELECT COUNT(*)
                     FROM analytics_sedad.fact_transfers) AS transfers
            """)).mappings().one()

            currencies = get_rows(connection, """
                SELECT
                    currency,
                    COUNT(*) AS transaction_count,
                    SUM(amount) AS total_amount,
                    ROUND(AVG(amount), 2) AS average_amount
                FROM analytics_sedad.fact_transactions
                GROUP BY currency
                ORDER BY currency
            """)

            statuses = get_rows(connection, """
                SELECT
                    transaction_status,
                    COUNT(*) AS total
                FROM analytics_sedad.fact_transactions
                GROUP BY transaction_status
                ORDER BY transaction_status
            """)

        return {
            "bank": "Sedad Bank",
            "data_type": "synthetic_demo_data",
            "totals": dict(counts),
            "transactions_by_currency": currencies,
            "transactions_by_status": statuses,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Sedad Analytics Overview konnte nicht geladen werden."
        )

@router.get("/customers")
def sedad_analytics_customers(request: Request):
    try:
        with request.app.state.db_engine.connect() as connection:

            total = connection.execute(text("""
                SELECT COUNT(*)
                FROM analytics_sedad.dim_customer
            """)).scalar_one()

            statuses = get_rows(connection, """
                SELECT
                    customer_status,
                    COUNT(*) AS total
                FROM analytics_sedad.dim_customer
                GROUP BY customer_status
                ORDER BY customer_status
            """)

            monthly = get_rows(connection, """
                SELECT
                    TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM')
                        AS month,
                    COUNT(*) AS new_customers
                FROM analytics_sedad.dim_customer
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY DATE_TRUNC('month', created_at)
            """)

        return {
            "bank": "Sedad Bank",
            "total_customers": total,
            "by_status": statuses,
            "new_customers_by_month": monthly,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Sedad Customer Analytics konnte nicht geladen werden."
        )

@router.get("/accounts")
def sedad_analytics_accounts(request: Request):
    try:
        with request.app.state.db_engine.connect() as connection:

            total = connection.execute(text("""
                SELECT COUNT(*)
                FROM analytics_sedad.dim_account
            """)).scalar_one()

            distribution = get_rows(connection, """
                SELECT
                    account_type,
                    account_status,
                    currency,
                    COUNT(*) AS total
                FROM analytics_sedad.dim_account
                GROUP BY account_type, account_status, currency
                ORDER BY account_type, account_status, currency
            """)

        return {
            "bank": "Sedad Bank",
            "total_accounts": total,
            "distribution": distribution,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Sedad Account Analytics konnte nicht geladen werden."
        )

@router.get("/transactions")
def sedad_analytics_transactions(request: Request):
    try:
        with request.app.state.db_engine.connect() as connection:

            total = connection.execute(text("""
                SELECT COUNT(*)
                FROM analytics_sedad.fact_transactions
            """)).scalar_one()

            distribution = get_rows(connection, """
                SELECT
                    transaction_type,
                    direction,
                    transaction_status,
                    currency,
                    COUNT(*) AS total_transactions,
                    SUM(amount) AS total_amount,
                    ROUND(AVG(amount), 2) AS average_amount
                FROM analytics_sedad.fact_transactions
                GROUP BY
                    transaction_type,
                    direction,
                    transaction_status,
                    currency
                ORDER BY
                    transaction_type,
                    transaction_status,
                    currency
            """)

        return {
            "bank": "Sedad Bank",
            "total_transactions": total,
            "distribution": distribution,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Sedad Transaction Analytics konnte nicht geladen werden."
        )

@router.get("/transfers")
def sedad_analytics_transfers(request: Request):
    try:
        with request.app.state.db_engine.connect() as connection:

            total = connection.execute(text("""
                SELECT COUNT(*)
                FROM analytics_sedad.fact_transfers
            """)).scalar_one()

            distribution = get_rows(connection, """
                SELECT
                    tr.transfer_status,
                    ft.currency,
                    COUNT(*) AS total_transfers,
                    SUM(ft.amount) AS total_amount,
                    ROUND(
                        AVG(
                            EXTRACT(
                                EPOCH FROM (
                                    tr.completed_at - tr.initiated_at
                                )
                            ) / 3600
                        ) FILTER (WHERE tr.completed_at IS NOT NULL),
                        2
                    ) AS average_completion_hours
                FROM analytics_sedad.fact_transfers tr
                JOIN analytics_sedad.fact_transactions ft
                    ON ft.transaction_key = tr.transaction_key
                GROUP BY tr.transfer_status, ft.currency
                ORDER BY tr.transfer_status, ft.currency
            """)

        return {
            "bank": "Sedad Bank",
            "total_transfers": total,
            "distribution": distribution,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Sedad Transfer Analytics konnte nicht geladen werden."
        )

@router.get("/monthly")
def sedad_analytics_monthly(request: Request):
    try:
        with request.app.state.db_engine.connect() as connection:

            rows = get_rows(connection, """
                SELECT
                    d.year_number,
                    d.month_number,
                    d.month_name,
                    ft.currency,
                    COUNT(*) AS total_transactions,
                    SUM(ft.amount) AS total_amount,
                    ROUND(AVG(ft.amount), 2) AS average_amount
                FROM analytics_sedad.fact_transactions ft
                JOIN analytics_sedad.dim_date d
                    ON d.date_key = ft.date_key
                GROUP BY
                    d.year_number,
                    d.month_number,
                    d.month_name,
                    ft.currency
                ORDER BY
                    d.year_number,
                    d.month_number,
                    ft.currency
            """)

        return {
            "bank": "Sedad Bank",
            "monthly_transactions": rows,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Sedad Monthly Analytics konnte nicht geladen werden."
        )
