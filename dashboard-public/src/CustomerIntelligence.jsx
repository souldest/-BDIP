import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  Users,
  UserCheck,
  Wallet,
  ArrowLeftRight,
} from "lucide-react";
import "./CustomerIntelligence.css";

const number = (value) =>
  new Intl.NumberFormat("en-US").format(Number(value || 0));

const statusColors = {
  active: "#29966d",
  inactive: "#e3ae4c",
  blocked: "#d86b70",
  closed: "#8994a6",
  completed: "#29966d",
  pending: "#e3ae4c",
  failed: "#d86b70",
};

const label = (value) => {
  const labels = {
    active: "Active",
    inactive: "Inactive",
    blocked: "Blocked",
    closed: "Closed",
    completed: "Completed",
    pending: "Pending",
    failed: "Failed",
    current: "Current Account",
    savings: "Savings Account",
    business: "Business Account",
    deposit: "Deposit",
    transfer: "Transfer",
    withdrawal: "Withdrawal",
    bill_payment: "Bill Payment",
  };
  return labels[value] || value || "Unknown";
};

function KpiCard({ title, value, icon: Icon, tone }) {
  return (
    <div className="ci-kpi-card">
      <div className="ci-kpi-top">
        <span>{title}</span>
        <span className={`ci-kpi-icon ${tone}`}>
          <Icon size={18} />
        </span>
      </div>
      <div className="ci-kpi-value">{number(value)}</div>
      <div className="ci-kpi-foot">Synthetic Demo Data</div>
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <section className="panel ci-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="ci-demo-tag">DEMO</span>
      </div>
      {children}
    </section>
  );
}

export default function CustomerIntelligence({
  customerData,
  activityData,
  segmentationData,
  churnData,
  loading,
  error,
  bank,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customer360, setCustomer360] = useState(null);
  const [customer360Loading, setCustomer360Loading] = useState(false);
  const [customer360Error, setCustomer360Error] = useState("");

  const loadCustomer360 = (customer) => {
    setSelectedCustomer(customer);
  };

  if (loading) {
    return <div className="panel ci-message">Loading Customer Intelligence …</div>;
  }

  if (error) {
    return <div className="panel ci-message ci-error">{error}</div>;
  }

  if (!customerData?.customers || !activityData?.accounts || !activityData?.transactions) {
    return (
      <div className="panel ci-message">
        No Customer Intelligence data is currently available for this bank.
      </div>
    );
  }

  const customers = customerData.customers;
  const statusRows = customers.by_status || [];
  const accountRows = activityData.accounts.by_type_status_currency || [];
  const transactionRows =
    activityData.transactions.by_type_status_currency ||
    activityData.transactions.by_type_direction_status_currency ||
    [];

  const customerCounts = statusRows.reduce((result, row) => {
    const key = row.customer_status;
    result[key] = (result[key] || 0) + Number(row.total || 0);
    return result;
  }, {});

  const activeCustomers = customerCounts.active || 0;
  const inactiveCustomers = customerCounts.inactive || 0;
  const blockedCustomers = customerCounts.blocked || 0;

  const monthlyMap = new Map();
  (customers.new_customers_by_month || []).forEach((row) => {
    monthlyMap.set(
      row.month,
      (monthlyMap.get(row.month) || 0) + Number(row.new_customers || 0)
    );
  });

  const monthlyData = Array.from(monthlyMap, ([month, newCustomers]) => ({
    month,
    newCustomers,
    monthLabel: month,
  }));

  const accountMap = new Map();
  accountRows.forEach((row) => {
    const type = row.account_type || "other";
    const status = row.account_status || "unknown";
    if (!accountMap.has(type)) accountMap.set(type, { accountType: label(type) });
    const entry = accountMap.get(type);
    entry[status] = (entry[status] || 0) + Number(row.total || 0);
  });
  const accountChartData = Array.from(accountMap.values());
  const accountStatuses = [...new Set(accountRows.map((row) => row.account_status))];

  const transactionMap = new Map();
  transactionRows.forEach((row) => {
    const type = row.transaction_type || "other";
    const status = row.transaction_status || "unknown";
    if (!transactionMap.has(type)) {
      transactionMap.set(type, { transactionType: label(type) });
    }
    const entry = transactionMap.get(type);
    entry[status] = (entry[status] || 0) + Number(row.total || 0);
  });
  const transactionChartData = Array.from(transactionMap.values());
  const transactionStatuses = [...new Set(transactionRows.map((row) => row.transaction_status))];

  const customerTypeChartData = (segmentationData?.customer_types || []).map((row) => ({
    customerType:
      row.customer_type === "individual"
        ? "Individual Customer"
        : row.customer_type === "corporate"
          ? "Corporate Customer"
          : label(row.customer_type),
    total: Number(row.total || 0),
  }));

  const ageChartData = (segmentationData?.age_groups || []).map((row) => ({
    ageGroup: row.age_group,
    total: Number(row.total || 0),
  }));

  const branchChartData = (segmentationData?.by_branch || []).map((row) => ({
    branch: `${row.branch_name}${row.city ? ` · ${row.city}` : ""}`,
    customers: Number(row.total || 0),
  }));

  const filteredChurnCustomers = (churnData?.customers || [])
    .filter((customer) => {
      const matchesSearch = String(customer.customer_id)
        .toLowerCase()
        .includes(searchTerm.trim().toLowerCase());

      const matchesRisk =
        riskFilter === "all" || customer.risk === riskFilter;

      return matchesSearch && matchesRisk;
    });

  return (
    <div className="ci-page">
      <div className="ci-notice">
        <span className="ci-notice-dot" />
        <div>
          <strong>Synthetic Demo Data</strong>
          <span>
            This Customer Intelligence view uses test or demo records
            and is not a real-time customer analysis.
          </span>
        </div>
      </div>

      <div className="kpi-grid ci-kpi-grid">
        <KpiCard
          title="Total Customers"
          value={customers.total}
          icon={Users}
          tone="blue"
        />
        <KpiCard
          title="Active Customers"
          value={activeCustomers}
          icon={UserCheck}
          tone="green"
        />
        <KpiCard
          title="Total Accounts"
          value={activityData.accounts.total}
          icon={Wallet}
          tone="gold"
        />
        <KpiCard
          title="Transactions"
          value={activityData.transactions.total}
          icon={ArrowLeftRight}
          tone="violet"
        />
      </div>

      {churnData && (
        <section className="panel ci-panel">
          <div className="panel-heading">
            <div>
              <h2>Churn Risk Analysis</h2>
              <p>Rule-based assessment of customer inactivity</p>
            </div>
            <span className="ci-demo-tag">DEMO SIMULATION</span>
          </div>

          <div className="kpi-grid ci-kpi-grid">
            {[
              { key: "low", title: "Low Risk", color: "#29966d" },
              { key: "medium", title: "Medium Risk", color: "#d49a35" },
              { key: "high", title: "High Risk", color: "#d86b70" },
            ].map((risk) => (
              <div className="ci-kpi-card" key={risk.key}>
                <div className="ci-kpi-top">
                  <span>{risk.title}</span>
                  <span
                    className="ci-kpi-icon"
                    style={{ color: risk.color }}
                  >
                    ●
                  </span>
                </div>
                <div className="ci-kpi-value">
                  {number(churnData.risk_counts?.[risk.key] || 0)}
                </div>
                <div className="ci-kpi-foot">Synthetic Demo Data</div>
              </div>
            ))}
          </div>

          <p className="ci-footnote">
            {bank === "corn" ? (
              <>
                BMI Corn: Inactivity is calculated relative to the last
                transaction date in the demo dataset
                {churnData.reference_date
                  ? ` (${new Date(churnData.reference_date).toLocaleDateString("en-US")}).`
                  : "."}
                This is not a current real-time assessment.
              </>
            ) : (
              <>
                Sedad: Inactivity is measured from the latest transaction timestamp in the dataset, using the last successful transaction.
              </>
            )}
            {" "}Simulation method: rule-based classification. Low: 0–44 days,
            medium: 45–89 days, high: 90 days or more without a qualifying transaction.
            Blocked and inactive customers are also classified as high risk
            This is not a prediction based on machine learning.
          </p>

          <h3 style={{ marginTop: 24 }}>Customer Overview</h3>
          <p className="ci-footnote">
            {number(filteredChurnCustomers.length)} matching customers out of{" "}
            {number(churnData.total_customers)}. A maximum of 15 results are displayed.
          </p>

          <div style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 16
          }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search customer ID ..."
              aria-label="Search Customer ID"
              style={{
                flex: "1 1 220px",
                minWidth: 0,
                padding: "11px 12px",
                border: "1px solid var(--border-color, #e5e7eb)",
                borderRadius: 8,
                background: "var(--card-bg, transparent)",
                color: "inherit"
              }}
            />

            <select
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value)}
              aria-label="Filter by risk"
              style={{
                flex: "0 1 190px",
                padding: "11px 12px",
                border: "1px solid var(--border-color, #e5e7eb)",
                borderRadius: 8,
                background: "var(--card-bg, transparent)",
                color: "inherit"
              }}
            >
              <option value="all">All Risk Levels</option>
              <option value="low">Low Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="high">High Risk</option>
            </select>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              textAlign: "left"
            }}>
              <thead>
                <tr>
                  {["Customer ID", "Status", "Inactive For", "Risk", "Reason", "Recommendation"].map((heading) => (
                    <th key={heading} style={{
                      padding: "12px 10px",
                      borderBottom: "1px solid var(--border-color, #e5e7eb)",
                      whiteSpace: "nowrap"
                    }}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredChurnCustomers.slice(0, 15).map((customer) => {
                  const riskColor = customer.risk === "high"
                    ? "#d86b70"
                    : customer.risk === "medium"
                      ? "#d49a35"
                      : "#29966d";

                  return (
                    <tr
                      key={customer.customer_id}
                      onClick={() => loadCustomer360(customer)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          loadCustomer360(customer);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      title="View customer details"
                      style={{
                        cursor: "pointer",
                        background: selectedCustomer?.customer_id === customer.customer_id
                          ? "var(--hover-bg, rgba(100, 116, 139, 0.10))"
                          : "transparent"
                      }}
                    >
                      <td style={{ padding: "11px 10px", borderBottom: "1px solid var(--border-color, #e5e7eb)" }}>
                        {customer.customer_id}
                      </td>
                      <td style={{ padding: "11px 10px", borderBottom: "1px solid var(--border-color, #e5e7eb)" }}>
                        {label(customer.customer_status)}
                      </td>
                      <td style={{ padding: "11px 10px", borderBottom: "1px solid var(--border-color, #e5e7eb)" }}>
                        {customer.days_inactive == null ? "No Successful Transaction" : `${number(customer.days_inactive)} days`}
                      </td>
                      <td style={{ padding: "11px 10px", borderBottom: "1px solid var(--border-color, #e5e7eb)", color: riskColor, fontWeight: 600 }}>
                        {customer.risk === "high" ? "High" : customer.risk === "medium" ? "Medium" : "Low"}
                      </td>
                      <td style={{ padding: "11px 10px", borderBottom: "1px solid var(--border-color, #e5e7eb)", minWidth: 170 }}>
                        {customer.risk_reason}
                      </td>
                      <td style={{ padding: "11px 10px", borderBottom: "1px solid var(--border-color, #e5e7eb)", minWidth: 190 }}>
                        {customer.recommendation}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedCustomer && (
            <div
              className="panel"
              style={{
                marginTop: 20,
                padding: 20,
                border: "1px solid var(--border-color, #e5e7eb)",
                borderLeft: `5px solid ${
                  selectedCustomer.risk === "high" ? "#d86b70" :
                  selectedCustomer.risk === "medium" ? "#d49a35" : "#29966d"
                }`,
                borderRadius: 12
              }}
            >
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap"
              }}>
                <div>
                  <h3 style={{ margin: 0 }}>Customer Details</h3>
                  <p className="ci-footnote">
                    Customer ID: {selectedCustomer.customer_id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomer360(null);
                    setCustomer360Error("");
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-color, #e5e7eb)",
                borderLeft: `5px solid ${
                  selectedCustomer.risk === "high" ? "#d86b70" :
                  selectedCustomer.risk === "medium" ? "#d49a35" : "#29966d"
                }`,
                borderRadius: 12,
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer"
                  }}
                >
                  Close
                </button>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16,
                marginTop: 18
              }}>
                <div style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "var(--hover-bg, rgba(100, 116, 139, 0.08))",
                  border: "1px solid var(--border-color, #e5e7eb)"
                }}>
                  <p className="ci-footnote">Customer Status</p>
                  <strong>{label(selectedCustomer.customer_status)}</strong>
                </div>
                <div style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "var(--hover-bg, rgba(100, 116, 139, 0.08))",
                  border: "1px solid var(--border-color, #e5e7eb)"
                }}>
                  <p className="ci-footnote">Active Accounts</p>
                  <strong>{number(selectedCustomer.active_accounts)}</strong>
                </div>
                <div style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "var(--hover-bg, rgba(100, 116, 139, 0.08))",
                  border: "1px solid var(--border-color, #e5e7eb)"
                }}>
                  <p className="ci-footnote">Inactive For</p>
                  <strong>
                    {selectedCustomer.days_inactive == null
                      ? "No Successful Transaction"
                      : `${number(selectedCustomer.days_inactive)} days`}
                  </strong>
                </div>
                <div style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "var(--hover-bg, rgba(100, 116, 139, 0.08))",
                  border: "1px solid var(--border-color, #e5e7eb)"
                }}>
                  <p className="ci-footnote">Last Transaction</p>
                  <strong>
                    {selectedCustomer.last_transaction
                      ? new Date(selectedCustomer.last_transaction).toLocaleString("en-US")
                      : "No Successful Transaction"}
                  </strong>
                </div>
                <div style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "var(--hover-bg, rgba(100, 116, 139, 0.08))",
                  border: "1px solid var(--border-color, #e5e7eb)"
                }}>
                  <p className="ci-footnote">Churn Risk</p>
                  <strong style={{
                    color: selectedCustomer.risk === "high"
                      ? "#d86b70"
                      : selectedCustomer.risk === "medium"
                        ? "#d49a35"
                        : "#29966d",
                    background: selectedCustomer.risk === "high"
                      ? "rgba(216, 107, 112, 0.13)"
                      : selectedCustomer.risk === "medium"
                        ? "rgba(212, 154, 53, 0.13)"
                        : "rgba(41, 150, 109, 0.13)",
                    padding: "5px 12px",
                    borderRadius: 20,
                    display: "inline-block"
                  }}>
                    {selectedCustomer.risk === "high"
                      ? "High"
                      : selectedCustomer.risk === "medium"
                        ? "Medium"
                        : "Low"}
                  </strong>
                </div>
              </div>

              <div style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 10,
                background: "var(--hover-bg, rgba(100, 116, 139, 0.08))"
              }}>
                <p className="ci-footnote">Grund der Einstufung</p>
                <p>{selectedCustomer.risk_reason || "Not specified"}</p>
              </div>

              <div style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 10,
                background: "var(--hover-bg, rgba(100, 116, 139, 0.08))"
              }}>
                <p className="ci-footnote">Recommended Action</p>
                <p>{selectedCustomer.recommendation || "No recommendation available"}</p>
              </div>

              {customer360Loading && (
                <p className="ci-footnote" style={{ marginTop: 18 }}>
                  Loading Customer 360 data …
                </p>
              )}

              {customer360Error && (
                <p className="ci-error" style={{ marginTop: 18 }}>
                  {customer360Error}
                </p>
              )}

              {customer360 && (
                <div style={{ marginTop: 22, display: "grid", gap: 18 }}>
                  <section>
                    <h3>Customer Profile</h3>
                    <div className="ci-detail-grid">
                      <div>
                        <p className="ci-footnote">Name</p>
                        <strong>
                          {[customer360.customer.first_name, customer360.customer.last_name]
                            .filter(Boolean).join(" ") || "Not specified"}
                        </strong>
                      </div>
                      <div>
                        <p className="ci-footnote">Customer Type</p>
                        <strong>{label(customer360.customer.customer_type)}</strong>
                      </div>
                      <div>
                        <p className="ci-footnote">Created On</p>
                        <strong>
                          {customer360.customer.created_at
                            ? new Date(customer360.customer.created_at).toLocaleDateString("en-US")
                            : "Not specified"}
                        </strong>
                      </div>
                      <div>
                        <p className="ci-footnote">Branch ID</p>
                        <strong>{customer360.customer.branch_id ?? "Not specified"}</strong>
                      </div>
                    </div>
                  </section>

                  <section className="c360-card">
                    <h3>Customer Activity</h3>
                    <div className="c360-kpis">
                      <div className="c360-kpi">
                        <span className="c360-kpi-label">Transactions</span>
                        <div className="c360-kpi-value">
                          {customer360.analytics?.transaction_count ?? customer360.transactions.length}
                        </div>
                      </div>
                      <div className="c360-kpi">
                        <span className="c360-kpi-label">Completed</span>
                        <div className="c360-kpi-value">
                          {customer360.analytics?.completed_transactions ?? 0}
                        </div>
                      </div>
                      <div className="c360-kpi">
                        <span className="c360-kpi-label">Total Accounts</span>
                        <div className="c360-kpi-value">
                          {customer360.accounts.length}
                        </div>
                      </div>
                    </div>

                    <h4 style={{ marginTop: 20 }}>Transaction Volume by Currency</h4>
                    <div className="c360-currency-grid">
                      {(customer360.analytics?.transaction_volume_by_currency ?? []).map((item) => (
                        <div className="c360-currency-item" key={item.currency}>
                          <span className="c360-kpi-label">{item.currency}</span>
                          <strong>{number(item.transaction_volume)} {item.currency}</strong>
                          <span className="c360-kpi-label">
                            {item.transaction_count} Transactions
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="ci-footnote">
                      Volume of the latest 20 transactions loaded at most; not the customer’s complete lifetime transaction volume.
                    </p>
                  </section>

                  <section className="c360-card">
                    <h3>Account Overview by Currency</h3>
                    <div className="c360-currency-grid">
                      {(customer360.analytics?.accounts_by_currency ?? []).map((item) => (
                        <div className="c360-currency-item" key={item.currency}>
                          <span className="c360-kpi-label">{item.currency}</span>
                          <strong>{item.account_count} Accounts</strong>
                          <span className="c360-kpi-label">
                            {item.active_count} Active
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="c360-card">
                    <h3>Activity History</h3>
                    {customer360.transactions.length === 0 ? (
                      <p>No activity available.</p>
                    ) : (
                      <div className="c360-timeline">
                        {[...customer360.transactions]
                          .sort((a, b) =>
                            new Date(b.transaction_timestamp || 0) -
                            new Date(a.transaction_timestamp || 0)
                          )
                          .map((transaction) => (
                            <div className="c360-timeline-item" key={transaction.transaction_id}>
                              <div className="c360-timeline-content">
                                <div className="c360-timeline-top">
                                  <strong>{label(transaction.transaction_type)}</strong>
                                  <span className="c360-timeline-amount">
                                    {number(transaction.amount)} {transaction.currency}
                                  </span>
                                </div>
                                <p className="c360-timeline-meta">
                                  {transaction.transaction_timestamp
                                    ? new Date(transaction.transaction_timestamp).toLocaleString("en-US")
                                    : "Unknown date"}
                                  {" · "}{label(transaction.transaction_status)}
                                  {" · "}{label(transaction.channel)}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3>Accounts ({customer360.accounts.length})</h3>
                    {customer360.accounts.length === 0 ? (
                      <p>No accounts available.</p>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr>
                              {["Account ID", "Account Type", "Currency", "Status"].map((heading) => (
                                <th key={heading} style={{ textAlign: "left", padding: 10 }}>
                                  {heading}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {customer360.accounts.map((account) => (
                              <tr key={account.account_id}>
                                <td style={{ padding: 10 }}>{account.account_id}</td>
                                <td style={{ padding: 10 }}>{label(account.account_type)}</td>
                                <td style={{ padding: 10 }}>{account.currency}</td>
                                <td style={{ padding: 10 }}>{label(account.account_status)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section>
                    <h3>Recent Transactions ({customer360.transactions.length})</h3>
                    {customer360.transactions.length === 0 ? (
                      <p>No transactions available.</p>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr>
                              {["Date", "Type", "Amount", "Status", "Channel"].map((heading) => (
                                <th key={heading} style={{ textAlign: "left", padding: 10 }}>
                                  {heading}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {customer360.transactions.map((transaction) => (
                              <tr key={transaction.transaction_id}>
                                <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                                  {transaction.transaction_timestamp
                                    ? new Date(transaction.transaction_timestamp).toLocaleString("en-US")
                                    : "–"}
                                </td>
                                <td style={{ padding: 10 }}>{label(transaction.transaction_type)}</td>
                                <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                                  {number(transaction.amount)} {transaction.currency}
                                </td>
                                <td style={{ padding: 10 }}>{label(transaction.transaction_status)}</td>
                                <td style={{ padding: 10 }}>{label(transaction.channel)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              )}

              <p className="ci-footnote" style={{ marginTop: 18 }}>
                Synthetic demo record – not a real customer file.
              </p>
            </div>
          )}
        </section>
      )}

      {segmentationData && (
        <>
          <div className="charts-grid ci-charts-grid">
            {customerTypeChartData.length > 0 && (
              <Panel
                title="Customers by Type"
                subtitle="Individual and Corporate Customers"
              >
                <div className="ci-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={customerTypeChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="customerType" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(value) => number(value)} />
                      <Bar dataKey="total" name="Customers" fill="#527bd0" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            )}

            <Panel
              title="Customers by Age Group"
              subtitle="Customer Age Distribution"
            >
              <div className="ci-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ageChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="ageGroup" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value) => number(value)} />
                    <Bar dataKey="total" name="Customers" fill="#29966d" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="ci-footnote">
                Age groups are derived from the dates of birth in the synthetic demo records.
              </p>
            </Panel>
          </div>

          {branchChartData.length > 0 && (
            <div className="charts-grid ci-charts-grid">
              <Panel
                title="Customers by Branch"
                subtitle="Number of customers by branch and city"
              >
                <div className="ci-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={branchChartData} layout="vertical" margin={{ left: 12, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="branch" width={150} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(value) => number(value)} />
                      <Bar dataKey="customers" name="Customers" fill="#b58a42" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          )}
        </>
      )}

      <div className="charts-grid ci-charts-grid">
        <Panel
          title="Customer Growth"
          subtitle="New Customers per Month"
        >
          <div className="ci-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => number(value)} />
                <Bar
                  dataKey="newCustomers"
                  name="New Customers"
                  fill="#527bd0"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Customer Status"
          subtitle="Distribution by Customer Status"
        >
          <div className="ci-status-list">
            {statusRows.map((row) => {
              const total = Number(row.total || 0);
              const percent = customers.total
                ? (total / customers.total) * 100
                : 0;
              return (
                <div className="ci-status-row" key={`${row.customer_status}-${row.synthetic_record ?? ""}`}>
                  <div className="ci-status-label">
                    <span
                      className="status-dot"
                      style={{ background: statusColors[row.customer_status] || "#8994a6" }}
                    />
                    <span>{label(row.customer_status)}</span>
                    <strong>{number(total)}</strong>
                  </div>
                  <div className="ci-progress">
                    <span
                      style={{
                        width: `${percent}%`,
                        background: statusColors[row.customer_status] || "#8994a6",
                      }}
                    />
                  </div>
                  <small>{percent.toFixed(1)} %</small>
                </div>
              );
            })}
          </div>
          <div className="ci-status-summary">
            <span>Inactive: {number(inactiveCustomers)}</span>
            <span>Blocked: {number(blockedCustomers)}</span>
          </div>
        </Panel>
      </div>

      <div className="charts-grid ci-charts-grid">
        <Panel
          title="Accounts by Type and Status"
          subtitle="Number of accounts; currencies are not added together"
        >
          <div className="ci-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={accountChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="accountType" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => number(value)} />
                <Legend />
                {accountStatuses.map((status) => (
                  <Bar
                    key={status}
                    dataKey={status}
                    name={label(status)}
                    stackId="accounts"
                    fill={statusColors[status] || "#527bd0"}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="ci-footnote">
            The chart shows account counts across all currencies, not summed monetary amounts.
          </p>
        </Panel>

        <Panel
          title="Transactions by Type and Status"
          subtitle="Number of Transactions"
        >
          <div className="ci-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={transactionChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="transactionType" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => number(value)} />
                <Legend />
                {transactionStatuses.map((status) => (
                  <Bar
                    key={status}
                    dataKey={status}
                    name={label(status)}
                    stackId="transactions"
                    fill={statusColors[status] || "#527bd0"}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="ci-footnote">
            The chart displays transaction counts, not totals across banks or currencies.
          </p>
        </Panel>
      </div>

      <div className="ci-data-footer">
        Data Source: {bank} · API Customer Intelligence · Synthetic Demo Data
      </div>
    </div>
  );
}
