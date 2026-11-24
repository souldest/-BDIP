import { useEffect, useMemo, useState } from "react";
import "./ChurnPrevention.css";

const statusOptions = [
  "Offen",
  "Kontakt aufgenommen",
  "Kunde interessiert",
  "Erfolgreich zurückgewonnen",
  "Nicht zurückgewonnen",
];

const statusLabels = {
  "Offen": "Open",
  "Kontakt aufgenommen": "Contact Initiated",
  "Kunde interessiert": "Customer Engaged",
  "Erfolgreich zurückgewonnen": "Successfully Retained",
  "Nicht zurückgewonnen": "Retention Unsuccessful",
};

const actionOptions = [
  "Persönlicher Anruf",
  "Beratungsgespräch",
  "Individuelles Angebot",
  "Gebühren- oder Konditionenprüfung",
  "Kundenstatus prüfen",
  "Weitere Action",
];

const actionLabels = {
  "Persönlicher Anruf": "Personal Call",
  "Beratungsgespräch": "Advisory Meeting",
  "Individuelles Angebot": "Personalized Offer",
  "Gebühren- oder Konditionenprüfung": "Pricing and Terms Review",
  "Kundenstatus prüfen": "Review Customer Status",
  "Weitere Action": "Other Action",
};

const suggestedTeam = {
  "Persönlicher Anruf": "Customer Relationship Management",
  "Beratungsgespräch": "Retail Banking & Advisory",
  "Individuelles Angebot": "Retail Banking & Advisory",
  "Gebühren- oder Konditionenprüfung": "Pricing & Product Management",
  "Kundenstatus prüfen": "Customer Operations",
  "Weitere Action": "Retention Management",
};

const riskLabel = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const segmentLabel = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const priorityLabel = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function formatPeriodComparison(item, period) {
  if (!item) return "Comparison unavailable";

  const current = Number(item.current || 0);
  const previous = Number(item.previous || 0);
  const change = Number(item.change || 0);
  const periodLabel = {
    daily: "previous day",
    weekly: "previous week",
    monthly: "previous month",
  }[period] || "previous period";

  if (current === 0 && previous === 0) {
    return "No activity in either period";
  }

  if (change === 0) return `No change vs ${periodLabel}`;

  const sign = change > 0 ? "+" : "";
  const percentage = item.change_percent == null
    ? ""
    : ` (${item.change_percent > 0 ? "+" : ""}${item.change_percent}%)`;

  return `${sign}${change}${percentage} vs ${periodLabel}`;
}

function ChurnPrevention({ churnData, bank, loading, error }) {
  const [records, setRecords] = useState({});
  const [teams, setTeams] = useState([]);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("high");
  const [statusFilter, setStatusFilter] = useState("all");
  const [engagementFilter, setEngagementFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [actionsLoading, setActionsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [retentionPeriod, setRetentionPeriod] = useState("daily");
  const [retentionReport, setRetentionReport] = useState(null);
  const [reportError, setReportError] = useState("");
  const [contactLogging, setContactLogging] = useState(false);

  // Bereits gespeicherte Actionn aus PostgreSQL laden
  useEffect(() => {
    let cancelled = false;

    async function loadActions() {
      setActionsLoading(true);
      setSaveError("");
      setSaveMessage("");
      setRecords({});
      setSelectedId("");

      try {
        const response = await fetch(
          `http://localhost:8005/api/${bank}/churn-prevention`
        );

        if (!response.ok) {
          throw new Error("Actions could not be loaded.");
        }

        const data = await response.json();

        const loadedRecords = {};
        for (const action of data.actions || []) {
          loadedRecords[action.customer_id] = {
            action: action.action,
            status: action.status,
            followUpDate: action.follow_up_date || "",
            notes: action.notes || "",
            assignedTeam: action.assigned_team || suggestedTeam[action.action] || "",
            assignedEmployee: action.assigned_employee || "",
          };
        }

        if (!cancelled) {
          setRecords(loadedRecords);
        }

        const teamResponse = await fetch(
          `http://localhost:8005/api/${bank}/retention-teams`
        );

        if (!teamResponse.ok) {
          throw new Error("Retention teams could not be loaded.");
        }

        const teamData = await teamResponse.json();

        if (!cancelled) {
          setTeams(teamData.teams || []);
        }
      } catch (err) {
        if (!cancelled) {
          setSaveError(err.message || "Error loading actions.");
        }
      } finally {
        if (!cancelled) {
          setActionsLoading(false);
        }
      }
    }

    if (bank) {
      loadActions();
    }

    return () => {
      cancelled = true;
    };
  }, [bank]);

  useEffect(() => {
    let cancelled = false;

    async function loadRetentionReport() {
      setReportError("");
      try {
        const response = await fetch(
          `http://localhost:8005/api/${bank}/retention-performance?period=${retentionPeriod}`
        );
        if (!response.ok) {
          throw new Error("Retention report could not be loaded.");
        }
        const data = await response.json();
        if (!cancelled) setRetentionReport(data);
      } catch (err) {
        if (!cancelled) setReportError(err.message || "Report loading failed.");
      }
    }

    if (bank) loadRetentionReport();
    return () => { cancelled = true; };
  }, [bank, retentionPeriod]);

  const customers = churnData?.customers || [];

  // Eine Action in PostgreSQL speichern
  const saveRecord = async (customerId, record) => {
    setSaving(true);
    setSaveError("");
    setSaveMessage("");

    try {
      const response = await fetch(
        `http://localhost:8005/api/${bank}/churn-prevention/${encodeURIComponent(customerId)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: record.action || actionOptions[0],
            status: record.status || "Offen",
            follow_up_date: record.followUpDate || null,
            notes: record.notes || null,
            assigned_team: record.assignedTeam || null,
            assigned_employee: record.assignedEmployee || null,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Action could not be saved.");
      }

      setSaveMessage("Changes saved to PostgreSQL.");
    } catch (err) {
      setSaveError(err.message || "Error while saving.");
    } finally {
      setSaving(false);
    }
  };

  const logCustomerContact = async () => {
    if (!selectedId || contactLogging) return;

    setContactLogging(true);
    setSaveError("");
    setSaveMessage("");

    try {
      const response = await fetch(
        `http://localhost:8005/api/${bank}/churn-prevention/${encodeURIComponent(selectedId)}/contact`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes: selectedRecord.notes || "Customer contact explicitly logged",
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Customer contact could not be logged.");
      }

      setSaveMessage("Customer contact recorded.");
      const reportResponse = await fetch(
        `http://localhost:8005/api/${bank}/retention-performance?period=${retentionPeriod}`
      );
      if (reportResponse.ok) {
        setRetentionReport(await reportResponse.json());
      }
    } catch (err) {
      setSaveError(err.message || "Contact logging failed.");
    } finally {
      setContactLogging(false);
    }
  };

  const updateRecord = (customerId, field, value, persist = true) => {
    const updatedRecord = {
      ...(records[customerId] || {}),
      [field]: value,
    };

    if (field === "action") {
      updatedRecord.assignedTeam = suggestedTeam[value] || "";
    }

    setRecords((current) => ({
      ...current,
      [customerId]: updatedRecord,
    }));

    if (persist) {
      saveRecord(customerId, updatedRecord);
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers
      .filter((customer) => {
        const record = records[customer.customer_id] || {};

        const matchesSearch = String(customer.customer_id)
          .toLowerCase()
          .includes(search.trim().toLowerCase());

        const matchesRisk =
          riskFilter === "all" || customer.risk === riskFilter;

        const matchesStatus =
          statusFilter === "all" ||
          (record.status || "Offen") === statusFilter;

        const matchesEngagement =
          engagementFilter === "all" ||
          customer.engagement_segment === engagementFilter;

        const matchesPriority =
          priorityFilter === "all" ||
          customer.retention_priority === priorityFilter;

        return (
          matchesSearch &&
          matchesRisk &&
          matchesStatus &&
          matchesEngagement &&
          matchesPriority
        );
      })
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const riskOrder = { high: 0, medium: 1, low: 2 };

        const priorityDifference =
          (priorityOrder[a.retention_priority] ?? 4) -
          (priorityOrder[b.retention_priority] ?? 4);

        if (priorityDifference !== 0) return priorityDifference;

        return (riskOrder[a.risk] ?? 3) - (riskOrder[b.risk] ?? 3);
      });
  }, [
    customers,
    records,
    search,
    riskFilter,
    statusFilter,
    engagementFilter,
    priorityFilter,
  ]);

  const selectedCustomer = customers.find(
    (customer) => customer.customer_id === selectedId
  );

  const selectedRecord = selectedId ? records[selectedId] || {} : {};

  const counts = {
    high: customers.filter((customer) => customer.risk === "high").length,
    medium: customers.filter((customer) => customer.risk === "medium").length,
    low: customers.filter((customer) => customer.risk === "low").length,
    open: customers.filter((customer) => {
      const record = records[customer.customer_id];
      return record && (!record.status || record.status === "Offen");
    }).length,
    contacted: Object.values(records).filter(
      (record) =>
        record.status === "Kontakt aufgenommen" ||
        record.status === "Kunde interessiert"
    ).length,
    recovered: Object.values(records).filter(
      (record) => record.status === "Erfolgreich zurückgewonnen"
    ).length,
    engagementHigh: customers.filter(
      (customer) => customer.engagement_segment === "high"
    ).length,
    engagementMedium: customers.filter(
      (customer) => customer.engagement_segment === "medium"
    ).length,
    engagementLow: customers.filter(
      (customer) => customer.engagement_segment === "low"
    ).length,
    critical: customers.filter(
      (customer) => customer.retention_priority === "critical"
    ).length,
  };

  const actionRecords = Object.values(records);
  const resolvedRecords = actionRecords.filter((record) =>
    ["Erfolgreich zurückgewonnen", "Nicht zurückgewonnen"].includes(record.status)
  );
  const successfulRecords = actionRecords.filter(
    (record) => record.status === "Erfolgreich zurückgewonnen"
  );
  const today = (() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  })();

  const retentionMetrics = {
    total: actionRecords.length,
    open: actionRecords.filter(
      (record) => !record.status || record.status === "Offen"
    ).length,
    inProgress: actionRecords.filter((record) =>
      ["Kontakt aufgenommen", "Kunde interessiert"].includes(record.status)
    ).length,
    resolved: resolvedRecords.length,
    successful: successfulRecords.length,
    successRate: resolvedRecords.length
      ? Math.round((successfulRecords.length / resolvedRecords.length) * 100)
      : null,
    overdue: actionRecords.filter(
      (record) =>
        record.followUpDate &&
        record.followUpDate < today &&
        !["Erfolgreich zurückgewonnen", "Nicht zurückgewonnen"].includes(record.status)
    ).length,
  };

  if (loading || actionsLoading) {
    return <div className="cp-message">Loading churn data and retention actions...</div>;
  }

  if (error) {
    return <div className="cp-message cp-error">{error}</div>;
  }

  return (
    <div className="cp-page">
      <div className="cp-notice">
        <strong>DEMO SIMULATION</strong>
        <span>
          Risk classifications are based on the existing rule-based
          churn analysis. Retention actions are stored in PostgreSQL.
        </span>
      </div>

      <div className="cp-summary">
        <article className="cp-metric cp-high">
          <span>High-Risk Customers</span>
          <strong>{counts.high}</strong>
        </article>
        <article className="cp-metric cp-open">
          <span>Open Actions</span>
          <strong>{counts.open}</strong>
        </article>
        <article className="cp-metric cp-contact">
          <span>Contacted / Interested</span>
          <strong>{counts.contacted}</strong>
        </article>
        <article className="cp-metric cp-success">
          <span>Retained</span>
          <strong>{counts.recovered}</strong>
        </article>
        <article className="cp-metric cp-critical">
          <span>Critical Retention</span>
          <strong>{counts.critical}</strong>
        </article>
        <article className="cp-metric cp-engagement-high">
          <span>High Engagement</span>
          <strong>{counts.engagementHigh}</strong>
        </article>
        <article className="cp-metric cp-engagement-medium">
          <span>Medium Engagement</span>
          <strong>{counts.engagementMedium}</strong>
        </article>
        <article className="cp-metric cp-engagement-low">
          <span>Low Engagement</span>
          <strong>{counts.engagementLow}</strong>
        </article>
      </div>

      <section className="cp-panel cp-effectiveness">
        <div className="cp-heading">
          <div>
            <h2>Retention Effectiveness</h2>
            <p>Current action status and recorded intervention performance</p>
          </div>
          <label className="cp-period-select">
            Reporting Period
            <select
              value={retentionPeriod}
              onChange={(event) => setRetentionPeriod(event.target.value)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>

        <h3 className="cp-report-subtitle">
          {retentionPeriod.charAt(0).toUpperCase() + retentionPeriod.slice(1)} Activity
        </h3>
        {reportError && <p className="cp-report-error">{reportError}</p>}
        <div className="cp-effectiveness-grid">
          <article className="cp-effectiveness-card">
            <span>Actions Created</span>
            <strong>{retentionReport?.totals?.actions_created ?? "—"}</strong>
            <small>New actions recorded this period</small>
            <small className="cp-comparison">{formatPeriodComparison(retentionReport?.comparison?.actions_created, retentionPeriod)}</small>
          </article>
          <article className="cp-effectiveness-card">
            <span>Customer Contacts</span>
            <strong>{retentionReport?.totals?.customer_contacts ?? "—"}</strong>
            <small>Explicitly logged customer contacts</small>
            <small className="cp-comparison">{formatPeriodComparison(retentionReport?.comparison?.customer_contacts, retentionPeriod)}</small>
          </article>
          <article className="cp-effectiveness-card">
            <span>Successful Outcomes</span>
            <strong>{retentionReport?.totals?.successful_outcomes ?? "—"}</strong>
            <small>Customers marked successfully retained</small>
            <small className="cp-comparison">{formatPeriodComparison(retentionReport?.comparison?.successful_outcomes, retentionPeriod)}</small>
          </article>
          <article className="cp-effectiveness-card">
            <span>Unsuccessful Outcomes</span>
            <strong>{retentionReport?.totals?.unsuccessful_outcomes ?? "—"}</strong>
            <small>Customers not successfully retained</small>
            <small className="cp-comparison">{formatPeriodComparison(retentionReport?.comparison?.unsuccessful_outcomes, retentionPeriod)}</small>
          </article>
        </div>

        <h3 className="cp-report-subtitle">Team Performance</h3>
        {retentionReport?.team_performance?.length ? (
          <div className="cp-team-report">
            <div className="cp-team-report-row cp-team-report-header">
              <span>Responsible Team</span>
              <span>Events</span>
              <span>Contacts</span>
              <span>Successful</span>
            </div>
            {retentionReport.team_performance.map((team) => (
              <div className="cp-team-report-row" key={team.team_name}>
                <span>{team.team_name}</span>
                <span>{team.recorded_events}</span>
                <span>{team.customer_contacts}</span>
                <span>{team.successful_outcomes}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="cp-effectiveness-note">
            No team activity has been recorded for this period yet.
          </p>
        )}

        <h3 className="cp-report-subtitle">Current Action Portfolio</h3>
        <div className="cp-effectiveness-grid">
          <article className="cp-effectiveness-card">
            <span>Actions Recorded</span>
            <strong>{retentionMetrics.total}</strong>
            <small>Saved customer action records</small>
          </article>
          <article className="cp-effectiveness-card">
            <span>Open Actions</span>
            <strong>{retentionMetrics.open}</strong>
            <small>Awaiting further processing</small>
          </article>
          <article className="cp-effectiveness-card">
            <span>In Progress</span>
            <strong>{retentionMetrics.inProgress}</strong>
            <small>Contact initiated or customer engaged</small>
          </article>
          <article className="cp-effectiveness-card">
            <span>Resolved Outcomes</span>
            <strong>{retentionMetrics.resolved}</strong>
            <small>Successful or unsuccessful outcomes</small>
          </article>
          <article className="cp-effectiveness-card">
            <span>Successfully Retained</span>
            <strong>{retentionMetrics.successful}</strong>
            <small>Explicitly recorded successful outcomes</small>
          </article>
          <article className="cp-effectiveness-card">
            <span>Retention Success Rate</span>
            <strong>
              {retentionMetrics.successRate === null
                ? "N/A"
                : `${retentionMetrics.successRate}%`}
            </strong>
            <small>
              {retentionMetrics.resolved
                ? "Successful outcomes / resolved outcomes"
                : "Available after the first resolved outcome"}
            </small>
          </article>
          <article className="cp-effectiveness-card cp-overdue-card">
            <span>Overdue Follow-ups</span>
            <strong>{retentionMetrics.overdue}</strong>
            <small>Unresolved actions past their follow-up date</small>
          </article>
        </div>
        <p className="cp-effectiveness-note">
          Metrics are calculated from saved action records for the selected bank.
          A retention success is counted only when explicitly recorded as successful.
        </p>
      </section>

      <section className="cp-panel">
        <div className="cp-heading">
          <div>
            <h2>Prioritized Customers</h2>
            <p>
              {bank === "sedad" ? "Sedad Bank" : "Bank BMI Corn"} ·{" "}
              {filteredCustomers.length} matching customers
            </p>
          </div>
        </div>

        <div className="cp-filters">
          <input
            type="search"
            placeholder="Search customer ID …"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value)}
          >
            <option value="all">All Risk Levels</option>
            <option value="high">High Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="low">Low Risk</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All Action Statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>{statusLabels[status] || status}</option>
            ))}
          </select>
          <select
            value={engagementFilter}
            onChange={(event) => setEngagementFilter(event.target.value)}
          >
            <option value="all">All Engagement Segments</option>
            <option value="high">High Engagement</option>
            <option value="medium">Medium Engagement</option>
            <option value="low">Low Engagement</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
          >
            <option value="all">All Retention Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead>
              <tr>
                <th>Customer ID</th>
                <th>Risk</th>
                <th>Engagement</th>
                <th>Segment</th>
                <th>Retention Priority</th>
                <th>Inactive For</th>
                <th>Recommendation</th>
                <th>Action Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => {
                const record = records[customer.customer_id] || {};

                return (
                  <tr
                    key={customer.customer_id}
                    className={selectedId === customer.customer_id ? "selected" : ""}
                  >
                    <td className="cp-id">{customer.customer_id}</td>
                    <td>
                      <span className={`cp-risk cp-risk-${customer.risk}`}>
                        {riskLabel[customer.risk] || customer.risk}
                      </span>
                    </td>
                    <td>
                      <strong>{customer.engagement_score ?? 0}</strong>
                      <span className="cp-score-max"> / 100</span>
                    </td>
                    <td>
                      <span className={`cp-segment cp-segment-${customer.engagement_segment || "low"}`}>
                        {segmentLabel[customer.engagement_segment] || "Unknown"}
                      </span>
                    </td>
                    <td>
                      <span className={`cp-priority cp-priority-${customer.retention_priority || "low"}`}>
                        {priorityLabel[customer.retention_priority] || "Unknown"}
                      </span>
                    </td>
                    <td>
                      {customer.days_inactive == null
                        ? "No Successful Transaction"
                        : `${customer.days_inactive} days`}
                    </td>
                    <td className="cp-recommendation">
                      {customer.recommendation || customer.risk_reason || "–"}
                    </td>
                    <td>
                      <span className="cp-status">
                        {statusLabels[record.status || "Offen"] || record.status || "Open"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="cp-select-button"
                        onClick={() => setSelectedId(customer.customer_id)}
                      >
                        {selectedId === customer.customer_id
                          ? "Selected"
                          : "Edit"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan="9" className="cp-empty">
                    No matching customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedCustomer && (
        <section className="cp-panel cp-editor">
          <div className="cp-heading">
            <div>
              <h2>Edit Retention Action</h2>
              <p className="cp-id">{selectedCustomer.customer_id}</p>
            </div>
            <button
              className="cp-close"
              onClick={() => setSelectedId("")}
            >
              Close
            </button>
          </div>

          <div className="cp-customer-info">
            <span>
              Risk: <strong>{riskLabel[selectedCustomer.risk] || "Unknown"}</strong>
            </span>
            <span>
              Customer Status: <strong>{selectedCustomer.customer_status || "Unknown"}</strong>
            </span>
            <span>
              Engagement: <strong>{selectedCustomer.engagement_score ?? 0} / 100</strong>
            </span>
            <span>
              Segment: <strong>{segmentLabel[selectedCustomer.engagement_segment] || "Unknown"}</strong>
            </span>
            <span>
              Retention Priority: <strong>{priorityLabel[selectedCustomer.retention_priority] || "Unknown"}</strong>
            </span>
            <span>
              Inactivity: <strong>
                {selectedCustomer.days_inactive == null
                  ? "No Successful Transaction"
                  : `${selectedCustomer.days_inactive} days`}
              </strong>
            </span>
          </div>

          <div className="cp-form-grid">
            <label>
              Action
              <select
                value={selectedRecord.action || actionOptions[0]}
                onChange={(event) =>
                  updateRecord(selectedId, "action", event.target.value)
                }
              >
                {actionOptions.map((action) => (
                  <option key={action} value={action}>{actionLabels[action] || action}</option>
                ))}
              </select>
            </label>

            <label>
              Responsible Team
              <select
                value={selectedRecord.assignedTeam || suggestedTeam[selectedRecord.action || actionOptions[0]] || ""}
                onChange={(event) =>
                  updateRecord(selectedId, "assignedTeam", event.target.value)
                }
              >
                <option value="">Select a team</option>
                {teams.map((team) => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </label>

            <label>
              Assigned Employee
              <input
                type="text"
                maxLength="120"
                placeholder="Enter employee name"
                value={selectedRecord.assignedEmployee || ""}
                onChange={(event) =>
                  updateRecord(selectedId, "assignedEmployee", event.target.value)
                }
              />
            </label>

            <label>
              Processing Status
              <select
                value={selectedRecord.status || "Offen"}
                onChange={(event) =>
                  updateRecord(selectedId, "status", event.target.value)
                }
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{statusLabels[status] || status}</option>
                ))}
              </select>
            </label>

            <label>
              Next Follow-up
              <input
                type="date"
                value={selectedRecord.followUpDate || ""}
                onChange={(event) =>
                  updateRecord(selectedId, "followUpDate", event.target.value)
                }
              />
            </label>

            <label className="cp-notes">
              Action Notes
              <textarea
                rows="4"
                placeholder="Record conversation, customer response, or next steps …"
                value={selectedRecord.notes || ""}
                onChange={(event) =>
                  updateRecord(selectedId, "notes", event.target.value, false)
                }
                onBlur={() => saveRecord(selectedId, selectedRecord)}
              />
            </label>
          </div>

          <button
            type="button"
            className="cp-contact-button"
            onClick={logCustomerContact}
            disabled={contactLogging || saving}
          >
            {contactLogging ? "Recording Contact …" : "Log Customer Contact"}
          </button>

          <p className="cp-saved">
            <span />
            {saving
              ? "Saving to PostgreSQL …"
              : saveError
                ? saveError
                : saveMessage || "Änderungen werden in PostgreSQL stored."}
          </p>
        </section>
      )}
    </div>
  );
}

export default ChurnPrevention;
