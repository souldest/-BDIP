from datetime import date

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter()


class ChurnActionUpdate(BaseModel):
    action: str = Field(min_length=1, max_length=100)
    status: str = Field(min_length=1, max_length=50)
    follow_up_date: date | None = None
    notes: str | None = Field(default=None, max_length=10000)
    assigned_team: str | None = Field(default=None, max_length=120)
    assigned_employee: str | None = Field(default=None, max_length=120)


class CustomerContactLog(BaseModel):
    notes: str | None = Field(default=None, max_length=10000)


@router.get("/{bank}/churn-prevention")
def get_churn_actions(bank: str, request: Request):
    if bank.lower() != "sedad":
        raise HTTPException(status_code=404, detail="Unbekannte Bank.")

    engine = request.app.state.db_write_engine

    try:
        with engine.connect() as connection:
            rows = connection.execute(text("""
                SELECT
                    customer_id,
                    action_type AS action,
                    status,
                    follow_up_date::text AS follow_up_date,
                    notes,
                    assigned_team,
                    assigned_employee,
                    updated_at::text AS updated_at
                FROM public.churn_prevention_actions
                WHERE bank = :bank
                ORDER BY updated_at DESC
            """), {"bank": bank}).mappings().all()

        return {"bank": bank, "actions": [dict(row) for row in rows]}

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Kundenbindungsmaßnahmen konnten nicht geladen werden."
        )


@router.get("/{bank}/retention-teams")
def get_retention_teams(bank: str, request: Request):
    if bank.lower() != "sedad":
        raise HTTPException(status_code=404, detail="Unknown bank.")

    engine = request.app.state.db_write_engine

    try:
        with engine.connect() as connection:
            rows = connection.execute(text("""
                SELECT team_name
                FROM public.retention_teams
                WHERE bank = :bank AND is_active = TRUE
                ORDER BY team_name
            """), {"bank": bank}).mappings().all()

        return {"bank": bank, "teams": [row["team_name"] for row in rows]}

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Retention teams could not be loaded."
        )


@router.put("/{bank}/churn-prevention/{customer_id}")
def save_churn_action(
    bank: str,
    customer_id: str,
    payload: ChurnActionUpdate,
    request: Request,
):
    if bank.lower() != "sedad":
        raise HTTPException(status_code=404, detail="Unknown bank.")

    engine = request.app.state.db_write_engine
    values = payload.model_dump()

    try:
        with engine.begin() as connection:
            existing = connection.execute(text("""
                SELECT action_type, status, follow_up_date, notes,
                       assigned_team, assigned_employee
                FROM public.churn_prevention_actions
                WHERE bank = :bank AND customer_id = :customer_id
            """), {
                "bank": bank,
                "customer_id": customer_id,
            }).mappings().first()

            connection.execute(text("""
                INSERT INTO public.churn_prevention_actions (
                    bank, customer_id, action_type, status,
                    follow_up_date, notes, assigned_team, assigned_employee
                )
                VALUES (
                    :bank, :customer_id, :action, :status,
                    :follow_up_date, :notes, :assigned_team, :assigned_employee
                )
                ON CONFLICT (bank, customer_id)
                DO UPDATE SET
                    action_type = EXCLUDED.action_type,
                    status = EXCLUDED.status,
                    follow_up_date = EXCLUDED.follow_up_date,
                    notes = EXCLUDED.notes,
                    assigned_team = EXCLUDED.assigned_team,
                    assigned_employee = EXCLUDED.assigned_employee,
                    updated_at = CURRENT_TIMESTAMP
            """), {
                "bank": bank,
                "customer_id": customer_id,
                **values,
            })

            events = []

            if existing is None:
                events.append((
                    "action_created",
                    "Retention action created",
                    None,
                    values["status"],
                ))
            else:
                comparisons = [
                    ("action_updated", "action_type", values["action"],
                     "Retention action changed"),
                    ("status_changed", "status", values["status"],
                     "Processing status changed"),
                    ("follow_up_updated", "follow_up_date",
                     values["follow_up_date"], "Follow-up date changed"),
                    ("team_assigned", "assigned_team",
                     values["assigned_team"], "Responsible team changed"),
                    ("employee_assigned", "assigned_employee",
                     values["assigned_employee"], "Assigned employee changed"),
                    ("notes_updated", "notes", values["notes"],
                     "Action notes updated"),
                ]

                for event_type, field, new_value, detail in comparisons:
                    if existing[field] != new_value:
                        events.append((
                            event_type,
                            detail,
                            existing["status"],
                            values["status"],
                        ))

            for event_type, detail, previous_status, new_status in events:
                connection.execute(text("""
                    INSERT INTO public.retention_intervention_events (
                        bank, customer_id, event_type, event_detail,
                        assigned_team, assigned_employee,
                        previous_status, new_status
                    )
                    VALUES (
                        :bank, :customer_id, :event_type, :event_detail,
                        :assigned_team, :assigned_employee,
                        :previous_status, :new_status
                    )
                """), {
                    "bank": bank,
                    "customer_id": customer_id,
                    "event_type": event_type,
                    "event_detail": detail,
                    "assigned_team": values["assigned_team"],
                    "assigned_employee": values["assigned_employee"],
                    "previous_status": previous_status,
                    "new_status": new_status,
                })

        return {
            "success": True,
            "customer_id": customer_id,
            "events_recorded": len(events),
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Retention action could not be saved."
        )


@router.post("/{bank}/churn-prevention/{customer_id}/contact")
def log_customer_contact(
    bank: str,
    customer_id: str,
    payload: CustomerContactLog,
    request: Request,
):
    if bank.lower() != "sedad":
        raise HTTPException(status_code=404, detail="Unknown bank.")

    engine = request.app.state.db_write_engine

    try:
        with engine.begin() as connection:
            action = connection.execute(text("""
                SELECT assigned_team, assigned_employee, status
                FROM public.churn_prevention_actions
                WHERE bank = :bank AND customer_id = :customer_id
            """), {
                "bank": bank,
                "customer_id": customer_id,
            }).mappings().first()

            if action is None:
                raise HTTPException(
                    status_code=404,
                    detail="No retention action exists for this customer."
                )

            connection.execute(text("""
                INSERT INTO public.retention_intervention_events (
                    bank, customer_id, event_type, event_detail,
                    assigned_team, assigned_employee,
                    previous_status, new_status
                )
                VALUES (
                    :bank, :customer_id, 'customer_contact', :event_detail,
                    :assigned_team, :assigned_employee, :status, :status
                )
            """), {
                "bank": bank,
                "customer_id": customer_id,
                "event_detail": payload.notes or "Customer contact explicitly logged",
                "assigned_team": action["assigned_team"],
                "assigned_employee": action["assigned_employee"],
                "status": action["status"],
            })

        return {"success": True, "event_type": "customer_contact"}

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Customer contact could not be logged."
        )


@router.get("/{bank}/retention-performance")
def get_retention_performance(
    bank: str,
    request: Request,
    period: str = "daily",
):
    if bank.lower() != "sedad":
        raise HTTPException(status_code=404, detail="Unknown bank.")

    period_units = {
        "daily": "day",
        "weekly": "week",
        "monthly": "month",
    }

    if period not in period_units:
        raise HTTPException(
            status_code=400,
            detail="Period must be daily, weekly, or monthly."
        )

    period_unit = period_units[period]
    engine = request.app.state.db_write_engine

    try:
        with engine.connect() as connection:
            totals = connection.execute(text("""
                WITH bounds AS (
                    SELECT
                        date_trunc(:period_unit, CURRENT_TIMESTAMP) AS current_start,
                        date_trunc(
                            :period_unit,
                            CURRENT_TIMESTAMP - INTERVAL '1 second'
                        ) AS previous_start
                )
                SELECT
                    COUNT(*) FILTER (
                        WHERE e.created_at >= b.current_start
                    ) AS total_events,
                    COUNT(*) FILTER (
                        WHERE e.event_type IN ('action_created', 'action_updated')
                          AND e.created_at >= b.current_start
                    ) AS actions_updated,
                    COUNT(*) FILTER (
                        WHERE e.event_type = 'customer_contact'
                          AND e.created_at >= b.current_start
                    ) AS customer_contacts,
                    COUNT(*) FILTER (
                        WHERE e.event_type = 'status_changed'
                          AND e.new_status = 'Erfolgreich zurückgewonnen'
                          AND e.created_at >= b.current_start
                    ) AS successful_outcomes,
                    COUNT(*) FILTER (
                        WHERE e.event_type = 'status_changed'
                          AND e.new_status = 'Nicht zurückgewonnen'
                          AND e.created_at >= b.current_start
                    ) AS unsuccessful_outcomes,
                    COUNT(*) FILTER (
                        WHERE e.created_at >= b.previous_start
                          AND e.created_at < b.current_start
                    ) AS previous_total_events,
                    COUNT(*) FILTER (
                        WHERE e.event_type IN ('action_created', 'action_updated')
                          AND e.created_at >= b.previous_start
                          AND e.created_at < b.current_start
                    ) AS previous_actions_updated,
                    COUNT(*) FILTER (
                        WHERE e.event_type = 'customer_contact'
                          AND e.created_at >= b.previous_start
                          AND e.created_at < b.current_start
                    ) AS previous_customer_contacts,
                    COUNT(*) FILTER (
                        WHERE e.event_type = 'status_changed'
                          AND e.new_status = 'Erfolgreich zurückgewonnen'
                          AND e.created_at >= b.previous_start
                          AND e.created_at < b.current_start
                    ) AS previous_successful_outcomes,
                    COUNT(*) FILTER (
                        WHERE e.event_type = 'status_changed'
                          AND e.new_status = 'Nicht zurückgewonnen'
                          AND e.created_at >= b.previous_start
                          AND e.created_at < b.current_start
                    ) AS previous_unsuccessful_outcomes
                FROM public.retention_intervention_events e
                CROSS JOIN bounds b
                WHERE e.bank = :bank
                  AND e.created_at >= b.previous_start
                  AND e.created_at < CURRENT_TIMESTAMP
            """), {
                "bank": bank,
                "period_unit": period_unit,
            }).mappings().one()

            totals_data = dict(totals)

            previous_totals = {
                "total_events": totals_data.pop("previous_total_events"),
                "actions_updated": totals_data.pop("previous_actions_updated"),
                "customer_contacts": totals_data.pop("previous_customer_contacts"),
                "successful_outcomes": totals_data.pop("previous_successful_outcomes"),
                "unsuccessful_outcomes": totals_data.pop("previous_unsuccessful_outcomes"),
            }

            comparison = {}
            for metric, current_value in totals_data.items():
                previous_value = previous_totals[metric]
                comparison[metric] = {
                    "current": current_value,
                    "previous": previous_value,
                    "change": current_value - previous_value,
                    "change_percent": (
                        round((current_value - previous_value) / previous_value * 100, 1)
                        if previous_value else None
                    ),
                }


            teams = connection.execute(text("""
                SELECT
                    COALESCE(assigned_team, 'Unassigned') AS team_name,
                    COUNT(*) AS recorded_events,
                    COUNT(*) FILTER (
                        WHERE event_type = 'customer_contact'
                    ) AS customer_contacts,
                    COUNT(*) FILTER (
                        WHERE event_type = 'status_changed' AND new_status = 'Erfolgreich zurückgewonnen'
                    ) AS successful_outcomes
                FROM public.retention_intervention_events
                WHERE bank = :bank
                  AND created_at >= date_trunc(:period_unit, CURRENT_TIMESTAMP)
                GROUP BY COALESCE(assigned_team, 'Unassigned')
                ORDER BY recorded_events DESC, team_name
            """), {
                "bank": bank,
                "period_unit": period_unit,
            }).mappings().all()

        return {
            "bank": bank,
            "period": period,
            "totals": totals_data,
            "previous_period": previous_totals,
            "comparison": comparison,
            "team_performance": [dict(row) for row in teams],
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Retention performance could not be loaded."
        )
