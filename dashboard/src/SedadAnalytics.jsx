import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Wallet,
  ArrowLeftRight,
  Activity,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

import "./SedadAnalytics.css";

const API = "http://localhost:8005/api/sedad/analytics";

const COLORS = {
  blue: "#3976c5",
  green: "#16a085",
  gold: "#c49a45",
  red: "#dc6868",
  purple: "#8b72c7",
  gray: "#94a3b8",
};

const numberFormat = new Intl.NumberFormat("de-DE");

const amountFormat = (value, currency) =>
  `${Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;

async function fetchJson(endpoint, signal) {
  const response = await fetch(`${API}/${endpoint}`, { signal });

  if (!response.ok) {
    throw new Error(`${endpoint}: HTTP ${response.status}`);
  }

  return response.json();
}

export default function SedadAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const [
          overview,
          customers,
          accounts,
          transactions,
          transfers,
          monthly,
        ] = await Promise.all([
          fetchJson("overview", controller.signal),
          fetchJson("customers", controller.signal),
          fetchJson("accounts", controller.signal),
          fetchJson("transactions", controller.signal),
          fetchJson("transfers", controller.signal),
          fetchJson("monthly", controller.signal),
        ]);

        if (!controller.signal.aborted) {
          setData({
            overview,
            customers,
            accounts,
            transactions,
            transfers,
            monthly,
          });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message || "Analytics konnten nicht geladen werden.");
          setData(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => controller.abort();
  }, [reload]);

  const monthlyChart = useMemo(() => {
    const grouped = new Map();

    for (const row of data?.monthly?.monthly_transactions || []) {
      const key = `${row.year_number}-${String(row.month_number).padStart(2, "0")}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          period: `${row.month_name.slice(0, 3)} ${row.year_number}`,
          EUR: 0,
          GBP: 0,
          USD: 0,
        });
      }

      const entry = grouped.get(key);

      if (Object.hasOwn(entry, row.currency)) {
        entry[row.currency] += Number(row.total_transactions);
      }
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value);
  }, [data]);

  const transferChart = useMemo(() => {
    const grouped = new Map();

    for (const row of data?.transfers?.distribution || []) {
      if (!grouped.has(row.currency)) {
        grouped.set(row.currency, {
          currency: row.currency,
          completed: 0,
          pending: 0,
          failed: 0,
        });
      }

      const item = grouped.get(row.currency);
      const status = String(row.transfer_status).toLowerCase();

      if (Object.hasOwn(item, status)) {
        item[status] += Number(row.total_transfers);
      }
    }

    return Array.from(grouped.values()).sort((a, b) =>
      a.currency.localeCompare(b.currency)
    );
  }, [data]);

  const totals = data?.overview?.totals || {};

  const completedTransfers = (data?.transfers?.distribution || [])
    .filter((row) => row.transfer_status === "completed")
    .reduce((sum, row) => sum + Number(row.total_transfers), 0);

  const transferRate = totals.transfers
    ? (completedTransfers / Number(totals.transfers)) * 100
    : 0;

  const metrics = [
    {
      label: "Total Customers",
      value: totals.customers,
      icon: Users,
      color: "blue",
      note: "Customer base",
    },
    {
      label: "Total Accounts",
      value: totals.accounts,
      icon: Wallet,
      color: "violet",
      note: "Current and savings",
    },
    {
      label: "Transactions",
      value: totals.transactions,
      icon: ArrowLeftRight,
      color: "gold",
      note: "All currencies",
    },
    {
      label: "Transfers",
      value: totals.transfers,
      icon: Activity,
      color: "green",
      note: `${transferRate.toFixed(2)}% completed`,
    },
  ];

  const customerStatus = data?.customers?.by_status || [];
  const accountDistribution = data?.accounts?.distribution || [];
  const currencyDistribution =
    data?.overview?.transactions_by_currency || [];

  const statusColors = {
    active: COLORS.green,
    blocked: COLORS.red,
    inactive: COLORS.gray,
  };

  return (
    <div className="sed-analytics">

      <div className="sed-analytics-heading">
        <div>
          <div className="sed-analytics-eyebrow">
            SEDAD BANK · ANALYTICS
          </div>

          <h2>Banking Intelligence</h2>

          <p>
            Analytische Auswertung des Sedad-Datenbestands
            · Synthetische Demo-Daten
          </p>
        </div>

        <button
          className="sed-analytics-refresh"
          onClick={() => setReload((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw size={16} />
          {loading ? "Loading..." : "Refresh Data"}
        </button>
      </div>

      {error && (
        <div className="sed-analytics-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <section className="sed-analytics-kpis">
        {metrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <article className="sed-analytics-kpi" key={metric.label}>
              <div className="sed-analytics-kpi-top">
                <span>{metric.label}</span>
                <div className={`sed-analytics-icon ${metric.color}`}>
                  <Icon size={19} />
                </div>
              </div>

              <div className="sed-analytics-kpi-value">
                {loading
                  ? "..."
                  : numberFormat.format(Number(metric.value || 0))}
              </div>

              <div className="sed-analytics-kpi-note">
                {metric.note}
              </div>
            </article>
          );
        })}
      </section>

      <section className="sed-analytics-grid">

        <article className="sed-analytics-panel sed-analytics-wide">
          <div className="sed-analytics-panel-heading">
            <h3>Monthly Transaction Activity</h3>
            <p>Transaction counts by currency</p>
          </div>

          <div className="sed-analytics-chart">
            {loading ? (
              <div className="sed-analytics-placeholder">Loading chart...</div>
            ) : monthlyChart.length === 0 ? (
              <div className="sed-analytics-placeholder">No monthly data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf0f5" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => numberFormat.format(value)}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      numberFormat.format(value),
                      name,
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="EUR"
                    stroke={COLORS.blue}
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="GBP"
                    stroke={COLORS.green}
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="USD"
                    stroke={COLORS.gold}
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article className="sed-analytics-panel">
          <div className="sed-analytics-panel-heading">
            <h3>Customer Status</h3>
            <p>Distribution by customer status</p>
          </div>

          <div className="sed-analytics-chart">
            {loading ? (
              <div className="sed-analytics-placeholder">Loading chart...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={customerStatus}
                    dataKey="total"
                    nameKey="customer_status"
                    innerRadius={55}
                    outerRadius={88}
                    paddingAngle={3}
                  >
                    {customerStatus.map((row) => (
                      <Cell
                        key={row.customer_status}
                        fill={statusColors[row.customer_status] || COLORS.purple}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => numberFormat.format(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article className="sed-analytics-panel">
          <div className="sed-analytics-panel-heading">
            <h3>Transfer Performance</h3>
            <p>Completed, pending and failed transfers</p>
          </div>

          <div className="sed-analytics-chart">
            {loading ? (
              <div className="sed-analytics-placeholder">Loading chart...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={transferChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf0f5" />
                  <XAxis dataKey="currency" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value) => numberFormat.format(value)}
                  />
                  <Legend />
                  <Bar
                    dataKey="completed"
                    name="Completed"
                    stackId="transfers"
                    fill={COLORS.green}
                  />
                  <Bar
                    dataKey="pending"
                    name="Pending"
                    stackId="transfers"
                    fill={COLORS.gold}
                  />
                  <Bar
                    dataKey="failed"
                    name="Failed"
                    stackId="transfers"
                    fill={COLORS.red}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article className="sed-analytics-panel sed-analytics-wide">
          <div className="sed-analytics-panel-heading">
            <h3>Transaction Value by Currency</h3>
            <p>Amounts are kept separate · No currency conversion</p>
          </div>

          <div className="sed-analytics-table-wrap">
            <table className="sed-analytics-table">
              <thead>
                <tr>
                  <th>Currency</th>
                  <th>Transactions</th>
                  <th>Total Amount</th>
                  <th>Average Amount</th>
                </tr>
              </thead>

              <tbody>
                {currencyDistribution.map((row) => (
                  <tr key={row.currency}>
                    <td><strong>{row.currency}</strong></td>
                    <td>{numberFormat.format(row.transaction_count)}</td>
                    <td>
                      {amountFormat(row.total_amount, row.currency)}
                    </td>
                    <td>
                      {amountFormat(row.average_amount, row.currency)}
                    </td>
                  </tr>
                ))}

                {!loading && currencyDistribution.length === 0 && (
                  <tr>
                    <td colSpan="4">No currency data available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="sed-analytics-panel sed-analytics-wide">
          <div className="sed-analytics-panel-heading">
            <h3>Account Distribution</h3>
            <p>Account type, status and currency</p>
          </div>

          <div className="sed-analytics-table-wrap">
            <table className="sed-analytics-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Currency</th>
                  <th>Accounts</th>
                </tr>
              </thead>

              <tbody>
                {accountDistribution.map((row, index) => (
                  <tr key={`${row.account_type}-${row.account_status}-${row.currency}-${index}`}>
                    <td>{row.account_type}</td>
                    <td>{row.account_status}</td>
                    <td><strong>{row.currency}</strong></td>
                    <td>{numberFormat.format(row.total)}</td>
                  </tr>
                ))}

                {!loading && accountDistribution.length === 0 && (
                  <tr>
                    <td colSpan="4">No account data available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

      </section>

      <div className="sed-analytics-footer">
        Source: analytics_sedad · All figures are synthetic demo data.
        Currency amounts are not combined or converted.
      </div>

    </div>
  );
}
