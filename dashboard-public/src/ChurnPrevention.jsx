import { useEffect, useMemo, useState } from "react";
import "./ChurnPrevention.css";

const statusLabels = {
  "Offen": "Open",
  "Kontakt aufgenommen": "Contact Initiated",
  "Kunde interessiert": "Customer Engaged",
  "Erfolgreich zurückgewonnen": "Successfully Retained",
  "Nicht zurückgewonnen": "Retention Unsuccessful",
};

const riskLabel = { high: "High", medium: "Medium", low: "Low" };
const priorityLabel = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const priorityOptions = ["critical", "high", "medium", "low"];
const statusOptions = Object.keys(statusLabels);
const actionOptions = [
  "Persönlicher Anruf",
  "Beratungsgespräch",
  "Individuelles Angebot",
  "Gebühren- oder Konditionenprüfung",
  "Kundenstatus prüfen",
  "Weitere Action",
];
const teamOptions = [
  "Customer Relationship Management",
  "Retail Banking & Advisory",
  "Pricing & Product Management",
  "Customer Operations",
  "Retention Management",
];
const storageKey = "sedad-demo-churn-records-v1";

function formatComparison(item, period) {
  if (!item) return "Comparison unavailable";
  const change = Number(item.change || 0);
  const previous = { daily: "previous day", weekly: "previous week", monthly: "previous month" }[period];
  if (!change) return `No change vs ${previous}`;
  const sign = change > 0 ? "+" : "";
  const percentage = item.change_percent == null ? "" : ` (${item.change_percent > 0 ? "+" : ""}${item.change_percent}%)`;
  return `${sign}${change}${percentage} vs ${previous}`;
}

function ChurnPrevention({ churnData, loading, error }) {
  const [records, setRecords] = useState({});
  const [selectedId, setSelectedId] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("high");
  const [statusFilter, setStatusFilter] = useState("all");
  const [engagementFilter, setEngagementFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [retentionPeriod, setRetentionPeriod] = useState("daily");
  const [retentionReport, setRetentionReport] = useState(null);
  const [reportError, setReportError] = useState("");
  const [actionsLoading, setActionsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadActions() {
      try {
        const response = await fetch("/data/churn-prevention.json");
        if (!response.ok) throw new Error("Retention actions could not be loaded.");
        const data = await response.json();

        const loadedRecords = {};
        for (const action of data.actions || []) {
          loadedRecords[action.customer_id] = {
            action: action.action,
            status: action.status || "Offen",
            followUpDate: action.follow_up_date || "",
            notes: action.notes || "",
            assignedTeam: action.assigned_team || "",
            assignedEmployee: action.assigned_employee || "",
          };
        }
        let savedRecords = {};
        try {
          savedRecords = JSON.parse(localStorage.getItem(storageKey) || "{}");
        } catch {
          savedRecords = {};
        }
        if (!cancelled) setRecords({ ...loadedRecords, ...savedRecords });
      } catch (err) {
        if (!cancelled) setReportError(err.message);
      } finally {
        if (!cancelled) setActionsLoading(false);
      }
    }

    loadActions();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      setReportError("");
      setRetentionReport(null);
      try {
        const response = await fetch(`/data/retention-${retentionPeriod}.json`);
        if (!response.ok) throw new Error("Retention report could not be loaded.");
        const data = await response.json();
        if (!cancelled) setRetentionReport(data);
      } catch (err) {
        if (!cancelled) setReportError(err.message);
      }
    }

    loadReport();
    return () => { cancelled = true; };
  }, [retentionPeriod]);

  const customers = churnData?.customers || [];

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const record = records[customer.customer_id] || {};
      const priority = record.retentionPriority || customer.retention_priority;
      return (
        String(customer.customer_id).toLowerCase().includes(search.trim().toLowerCase()) &&
        (riskFilter === "all" || customer.risk === riskFilter) &&
        (statusFilter === "all" || (record.status || "Offen") === statusFilter) &&
        (engagementFilter === "all" || customer.engagement_segment === engagementFilter) &&
        (priorityFilter === "all" || priority === priorityFilter)
      );
    }).sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityA = records[a.customer_id]?.retentionPriority || a.retention_priority;
      const priorityB = records[b.customer_id]?.retentionPriority || b.retention_priority;
      return (order[priorityA] ?? 4) - (order[priorityB] ?? 4);
    });
  }, [customers, records, search, riskFilter, statusFilter, engagementFilter, priorityFilter]);

  const selectedCustomer = customers.find((customer) => customer.customer_id === selectedId);
  const selectedRecord = selectedId ? (records[selectedId] || {}) : {};

  function updateSelectedRecord(field, value) {
    if (!selectedId) return;
    setSaveMessage("");
    setRecords((current) => {
      const next = {
        ...current,
        [selectedId]: { ...(current[selectedId] || {}), [field]: value },
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        setSaveMessage("Browser storage is unavailable. Changes may not persist.");
      }
      return next;
    });
    setSaveMessage("Saved in this browser");
  }

  function logCustomerContact() {
    if (!selectedId) return;
    setRecords((current) => {
      const next = {
        ...current,
        [selectedId]: {
          ...(current[selectedId] || {}),
          status: "Kontakt aufgenommen",
          lastContactLoggedAt: new Date().toISOString(),
        },
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        setSaveMessage("Browser storage is unavailable. Changes may not persist.");
        return next;
      }
      setSaveMessage("Customer contact logged in this browser");
      return next;
    });
  }

  const counts = {
    high: customers.filter((c) => c.risk === "high").length,
    medium: customers.filter((c) => c.risk === "medium").length,
    low: customers.filter((c) => c.risk === "low").length,
    critical: customers.filter((c) => (records[c.customer_id]?.retentionPriority || c.retention_priority) === "critical").length,
    engagementHigh: customers.filter((c) => c.engagement_segment === "high").length,
    engagementMedium: customers.filter((c) => c.engagement_segment === "medium").length,
    engagementLow: customers.filter((c) => c.engagement_segment === "low").length,
    open: Object.values(records).filter((r) => !r.status || r.status === "Offen").length,
    contacted: Object.values(records).filter((r) => ["Kontakt aufgenommen", "Kunde interessiert"].includes(r.status)).length,
    recovered: Object.values(records).filter((r) => r.status === "Erfolgreich zurückgewonnen").length,
  };

  if (loading || actionsLoading) {
    return <div className="cp-message">Loading demo data...</div>;
  }

  if (error) return <div className="cp-message cp-error">{error}</div>;

  const report = retentionReport;
  const visibleCustomers = filteredCustomers.slice(0, 200);

  return (
    <div className="cp-page">
      <div className="cp-notice">
        <strong>INTERACTIVE DEMO</strong>
        <span>
          Synthetic demonstration data. You can edit retention actions, priorities and recommendations.
          Your changes are saved only in this browser and are not shared with other users or devices.
          Retention effectiveness reports remain exported snapshots.
        </span>
      </div>

      <div className="cp-summary">
        <article className="cp-metric cp-high"><span>High-Risk Customers</span><strong>{counts.high}</strong></article>
        <article className="cp-metric cp-open"><span>Open Actions</span><strong>{counts.open}</strong></article>
        <article className="cp-metric cp-contact"><span>Contacted / Interested</span><strong>{counts.contacted}</strong></article>
        <article className="cp-metric cp-success"><span>Retained</span><strong>{counts.recovered}</strong></article>
        <article className="cp-metric cp-critical"><span>Critical Retention</span><strong>{counts.critical}</strong></article>
        <article className="cp-metric cp-engagement-high"><span>High Engagement</span><strong>{counts.engagementHigh}</strong></article>
        <article className="cp-metric cp-engagement-medium"><span>Medium Engagement</span><strong>{counts.engagementMedium}</strong></article>
        <article className="cp-metric cp-engagement-low"><span>Low Engagement</span><strong>{counts.engagementLow}</strong></article>
      </div>

      <section className="cp-panel cp-effectiveness">
        <div className="cp-heading">
          <div>
            <h2>Retention Effectiveness</h2>
            <p>Snapshot of recorded retention activity</p>
          </div>
          <label className="cp-period-select">
            Reporting Period
            <select value={retentionPeriod} onChange={(event) => setRetentionPeriod(event.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>

        <h3 className="cp-report-subtitle">{retentionPeriod.charAt(0).toUpperCase() + retentionPeriod.slice(1)} Activity</h3>
        {reportError && <p className="cp-report-error">{reportError}</p>}

        <div className="cp-effectiveness-grid">
          {[
            ["Actions Created", "actions_created", "New actions recorded this period"],
            ["Customer Contacts", "customer_contacts", "Explicitly logged customer contacts"],
            ["Successful Outcomes", "successful_outcomes", "Customers marked successfully retained"],
            ["Unsuccessful Outcomes", "unsuccessful_outcomes", "Customers not successfully retained"],
          ].map(([label, key, description]) => (
            <article className="cp-effectiveness-card" key={key}>
              <span>{label}</span>
              <strong>{report?.totals?.[key] ?? "—"}</strong>
              <small>{description}</small>
              <small className="cp-comparison">{formatComparison(report?.comparison?.[key], retentionPeriod)}</small>
            </article>
          ))}
        </div>

        <h3 className="cp-report-subtitle">Team Performance</h3>
        {report?.team_performance?.length ? (
          <div className="cp-team-report">
            <div className="cp-team-report-row cp-team-report-header">
              <span>Responsible Team</span><span>Events</span><span>Contacts</span><span>Successful</span>
            </div>
            {report.team_performance.map((team) => (
              <div className="cp-team-report-row" key={team.team_name}>
                <span>{team.team_name}</span>
                <span>{team.recorded_events}</span>
                <span>{team.customer_contacts}</span>
                <span>{team.successful_outcomes}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="cp-effectiveness-note">No team activity recorded for this period.</p>
        )}
        <p className="cp-effectiveness-note">Figures are from the exported demo snapshot and are not updated live.</p>
      </section>

      <section className="cp-panel">
        <div className="cp-heading">
          <div>
            <h2>Prioritized Customers</h2>
            <p>Sedad Bank · {filteredCustomers.length.toLocaleString()} matching customers</p>
          </div>
        </div>

        <div className="cp-filters">
          <input type="search" placeholder="Search customer ID …" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            <option value="all">All Risk Levels</option><option value="high">High Risk</option><option value="medium">Medium Risk</option><option value="low">Low Risk</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All Action Statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={engagementFilter} onChange={(event) => setEngagementFilter(event.target.value)}>
            <option value="all">All Engagement Segments</option><option value="high">High Engagement</option><option value="medium">Medium Engagement</option><option value="low">Low Engagement</option>
          </select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
            <option value="all">All Retention Priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </div>

        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead>
              <tr>
                <th>Customer ID</th><th>Risk</th><th>Engagement</th><th>Segment</th><th>Retention Priority</th><th>Inactive For</th><th>Recommendation</th><th>Action Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleCustomers.map((customer) => {
                const record = records[customer.customer_id] || {};
                const priority = record.retentionPriority || customer.retention_priority;
                return (
                  <tr
                    key={customer.customer_id}
                    className={selectedId === customer.customer_id ? "cp-selected-row" : "cp-clickable-row"}
                    onClick={() => { setSelectedId(customer.customer_id); setSaveMessage(""); }}
                    title="Click to edit this customer"
                  >
                    <td className="cp-id">{customer.customer_id}</td>
                    <td><span className={`cp-risk cp-risk-${customer.risk}`}>{riskLabel[customer.risk] || customer.risk}</span></td>
                    <td><strong>{customer.engagement_score ?? 0}</strong><span className="cp-score-max"> / 100</span></td>
                    <td><span className={`cp-segment cp-segment-${customer.engagement_segment || "low"}`}>{customer.engagement_segment || "Unknown"}</span></td>
                    <td><span className={`cp-priority cp-priority-${priority || "low"}`}>{priorityLabel[priority] || "Unknown"}</span></td>
                    <td>{customer.days_inactive == null ? "No Successful Transaction" : `${customer.days_inactive} days`}</td>
                    <td className="cp-recommendation">{record.recommendation || customer.recommendation || customer.risk_reason || "–"}</td>
                    <td><span className="cp-status">{statusLabels[record.status || "Offen"] || record.status || "Open"}</span></td>
                  </tr>
                );
              })}
              {visibleCustomers.length === 0 && <tr><td colSpan="8" className="cp-empty">No matching customers found.</td></tr>}
            </tbody>
          </table>
        </div>
        {filteredCustomers.length > visibleCustomers.length && (
          <p className="cp-effectiveness-note">
            Showing the first {visibleCustomers.length} of {filteredCustomers.length.toLocaleString()} matching customers. Use the filters to narrow the list.
          </p>
        )}
      </section>

      {selectedCustomer && (
        <section className="cp-panel cp-editor">
          <div className="cp-heading">
            <div>
              <h2>Edit Retention Action</h2>
              <p>{selectedCustomer.first_name || ""} {selectedCustomer.last_name || ""} · {selectedCustomer.customer_id}</p>
            </div>
            <button type="button" className="cp-close-editor" onClick={() => setSelectedId("")}>Close</button>
          </div>

          <div className="cp-customer-info">
            <span>Risk: <strong>{riskLabel[selectedCustomer.risk] || selectedCustomer.risk}</strong></span>
            <span>Inactive: <strong>{selectedCustomer.days_inactive ?? "—"} days</strong></span>
            <span>Engagement: <strong>{selectedCustomer.engagement_segment || "—"}</strong></span>
          </div>

          <div className="cp-form-grid">
            <label>
              Retention Priority
              <select value={selectedRecord.retentionPriority || selectedCustomer.retention_priority || "low"}
                onChange={(e) => updateSelectedRecord("retentionPriority", e.target.value)}>
                {priorityOptions.map((value) => <option key={value} value={value}>{priorityLabel[value]}</option>)}
              </select>
            </label>

            <label>
              Recommendation
              <textarea rows="2" value={selectedRecord.recommendation ?? selectedCustomer.recommendation ?? ""}
                onChange={(e) => updateSelectedRecord("recommendation", e.target.value)} />
            </label>

            <label>
              Action
              <select value={selectedRecord.action || ""}
                onChange={(e) => updateSelectedRecord("action", e.target.value)}>
                <option value="">Select action</option>
                {actionOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>

            <label>
              Responsible Team
              <select value={selectedRecord.assignedTeam || ""}
                onChange={(e) => updateSelectedRecord("assignedTeam", e.target.value)}>
                <option value="">Select team</option>
                {teamOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>

            <label>
              Assigned Employee
              <input value={selectedRecord.assignedEmployee || ""}
                onChange={(e) => updateSelectedRecord("assignedEmployee", e.target.value)}
                placeholder="Employee name" />
            </label>

            <label>
              Processing Status
              <select value={selectedRecord.status || "Offen"}
                onChange={(e) => updateSelectedRecord("status", e.target.value)}>
                {statusOptions.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
              </select>
            </label>

            <label>
              Next Follow-up
              <input type="date" value={selectedRecord.followUpDate || ""}
                onChange={(e) => updateSelectedRecord("followUpDate", e.target.value)} />
            </label>

            <label className="cp-notes">
              Action Notes
              <textarea rows="3" value={selectedRecord.notes || ""}
                onChange={(e) => updateSelectedRecord("notes", e.target.value)}
                placeholder="Add notes about the retention action..." />
            </label>
          </div>

          <div className="cp-editor-actions">
            <button type="button" className="cp-contact-button" onClick={logCustomerContact}>
              Log Customer Contact
            </button>
            {saveMessage && <span className="cp-saved">{saveMessage}</span>}
          </div>
        </section>
      )}
    </div>
  );
}

export default ChurnPrevention;
