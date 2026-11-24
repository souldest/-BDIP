import { useEffect, useState } from "react";
import {
  LayoutDashboard, Building2, Users, ArrowLeftRight,
  BarChart3, Settings, Bell, Search, CalendarDays,
  ArrowUpRight, Wallet, Activity, CheckCircle2,
  Clock3, XCircle, ChevronDown
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts";
import "./App.css";
import CustomerIntelligence from "./CustomerIntelligence";
import ChurnPrevention from "./ChurnPrevention";
import SedadAnalytics from "./SedadAnalytics";



const transactions = [
  { id: "TRX-90821", customer: "Corporate Client", amount: "245,000 MRU", status: "Completed", time: "10:42 AM" },
  { id: "TRX-90820", customer: "Individual Client", amount: "12,500 MRU", status: "Completed", time: "10:36 AM" },
  { id: "TRX-90819", customer: "Corporate Client", amount: "85,000 MRU", status: "Pending", time: "10:21 AM" },
  { id: "TRX-90818", customer: "Individual Client", amount: "5,000 MRU", status: "Failed", time: "10:08 AM" },
];

const formatNumber = (value) =>
  new Intl.NumberFormat("en-US").format(value);

const formatAmount = (value) =>
  (Number(value) / 1000000).toFixed(1) + "M";

function App() {
  const [selectedBank, setSelectedBank] = useState("corn");
  const [selectedView, setSelectedView] = useState("dashboard");
  const [sedadData, setSedadData] = useState(null);
  const [sedadCurrencies, setSedadCurrencies] = useState([]);
  const [sedadMonthly, setSedadMonthly] = useState([]);
  const [sedadLoading, setSedadLoading] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [transfers, setTransfers] = useState(null);
  const [monthlyData, setMonthlyData] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [customerIntelligence, setCustomerIntelligence] = useState(null);
  const [customerActivity, setCustomerActivity] = useState(null);
  const [segmentationData, setSegmentationData] = useState(null);
  const [churnData, setChurnData] = useState(null);
  const [customerIntelligenceLoading, setCustomerIntelligenceLoading] = useState(false);
  const [customerIntelligenceError, setCustomerIntelligenceError] = useState("");

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [customerResponse, branchResponse, transferResponse, monthlyResponse] = await Promise.all([
          fetch("http://localhost:8005/api/customers"),
          fetch("http://localhost:8005/api/branches"),
          fetch("http://localhost:8005/api/transfers"),
          fetch("http://localhost:8005/api/monthly-transactions"),
        ]);

        if (!customerResponse.ok || !branchResponse.ok || !transferResponse.ok || !monthlyResponse.ok) {
          throw new Error("API data could not be loaded.");
        }

        const [customerData, branchData, transferData, monthlyRows] = await Promise.all([
          customerResponse.json(),
          branchResponse.json(),
          transferResponse.json(),
          monthlyResponse.json(),
        ]);

        setCustomers(customerData);
        setBranches(branchData);
        setTransfers(transferData);
        setMonthlyData(monthlyRows.map((row) => ({
          month: row.month_name.slice(0, 3),
          transactions: Number(row.total_transactions),
          amount: Number(row.total_amount),
          average: Number(row.average_amount),
        })));
      } catch (error) {
        setApiError(error.message);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  useEffect(() => {
    if (selectedBank !== "sedad" && selectedView !== "comparison") return;

    async function loadSedadData() {
      setSedadLoading(true);

      try {
        const [overviewResponse, currencyResponse, monthlyResponse] =
          await Promise.all([
            fetch("http://localhost:8005/api/sedad/overview"),
            fetch("http://localhost:8005/api/sedad/currencies"),
            fetch("http://localhost:8005/api/sedad/monthly-transactions"),
          ]);

        if (!overviewResponse.ok || !currencyResponse.ok || !monthlyResponse.ok) {
          throw new Error("Sedad data could not be loaded.");
        }

        const [overview, currencies, monthly] = await Promise.all([
          overviewResponse.json(),
          currencyResponse.json(),
          monthlyResponse.json(),
        ]);

        setSedadData(overview);
        setSedadCurrencies(currencies);
        setSedadMonthly(monthly);
        setApiError("");
      } catch (error) {
        setApiError(error.message);
      } finally {
        setSedadLoading(false);
      }
    }

    loadSedadData();
  }, [selectedBank, selectedView]);

  useEffect(() => {
    if (!["customer-intelligence", "churn-prevention"].includes(selectedView)) return;

    let cancelled = false;

    async function loadCustomerIntelligence() {
      setCustomerIntelligenceLoading(true);
      setCustomerIntelligenceError("");

      try {
        setSegmentationData(null);
        setChurnData(null);

        const [customerResponse, activityResponse, segmentationResponse, churnResponse] = await Promise.all([
          fetch(`http://localhost:8005/api/${selectedBank}/customer-intelligence`),
          fetch(`http://localhost:8005/api/${selectedBank}/customer-activity`),
          fetch(`http://localhost:8005/api/${selectedBank}/customer-segmentation`),
          fetch(`http://localhost:8005/api/${selectedBank}/churn-analysis`),
        ]);

        if (
          !customerResponse.ok ||
          !activityResponse.ok ||
          !segmentationResponse.ok ||
          !churnResponse.ok
        ) {
          throw new Error("Customer Intelligence data could not be loaded.");
        }

        const [customerData, activityData, segmentation, churn] = await Promise.all([
          customerResponse.json(),
          activityResponse.json(),
          segmentationResponse.json(),
          churnResponse.json(),
        ]);

        if (!cancelled) {
          setCustomerIntelligence(customerData);
          setCustomerActivity(activityData);
          setSegmentationData(segmentation);
          setChurnData(churn);
        }
      } catch (error) {
        if (!cancelled) {
          setCustomerIntelligenceError(error.message);
        }
      } finally {
        if (!cancelled) {
          setCustomerIntelligenceLoading(false);
        }
      }
    }

    loadCustomerIntelligence();

    return () => {
      cancelled = true;
    };
  }, [selectedBank, selectedView]);

  const totalCustomers = customers.reduce(
    (sum, item) => sum + item.total_customers, 0
  );

  const activeCustomers = customers
    .filter((item) => item.customer_status === "active")
    .reduce((sum, item) => sum + item.total_customers, 0);

  const totalTransactions = customers.reduce(
    (sum, item) => sum + item.total_transactions, 0
  );

  const totalAmount = customers.reduce(
    (sum, item) => sum + Number(item.total_amount), 0
  );

  const totalBranchAmount = Math.max(
    ...branches.map((branch) => Number(branch.total_amount)),
    1
  );

  const navGroups = [
    { title: "OVERVIEW", items: [{ label: "Dashboard", icon: LayoutDashboard }] },
    { title: "BANKING", items: [
      { label: "Branches", icon: Building2 },
      { label: "Customer Intelligence", icon: Users },
      { label: "Transactions", icon: ArrowLeftRight },
    ]},
    { title: "INSIGHTS", items: [
      { label: "Analytics", icon: BarChart3 },
      { label: "Sedad Analytics", icon: Activity },
      { label: "Bank Comparison", icon: BarChart3 },
      { label: "Churn Prevention", icon: Activity },
    ]},
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div><strong>BDIP</strong><span>BANKING INTELLIGENCE</span></div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace">
          <div className="workspace-icon">B</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>Select Bank</strong>
            <select
              value={selectedBank}
              onChange={(event) => {
                setSelectedBank(event.target.value);
                setApiError("");
                setSelectedBranch(null);
              }}
              style={{
                display: "block",
                width: "100%",
                marginTop: "5px",
                padding: "5px 4px",
                border: "1px solid #34435e",
                borderRadius: "6px",
                background: "#17243b",
                color: "#ffffff",
                fontSize: "12px",
              }}
            >
              <option value="corn">Bank BMI Corn</option>
              <option value="sedad">Sedad Bank</option>
            </select>
          </div>
        </div>

        <nav>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.title}>
              <div className="nav-title">{group.title}</div>
              {group.items.map(({ label, icon: Icon }) => (
                <button
                  className={`nav-item ${
                    (label === "Dashboard" && selectedView === "dashboard") ||
                    (label === "Customer Intelligence" && selectedView === "customer-intelligence") ||
                    (label === "Bank Comparison" && selectedView === "comparison") ||
                    (label === "Sedad Analytics" && selectedView === "sedad-analytics") ||
                    (label === "Churn Prevention" && selectedView === "churn-prevention")
                      ? "active" : ""
                  }`}
                  key={label}
                  onClick={() => {
                    if (label === "Dashboard") setSelectedView("dashboard");
                    if (label === "Customer Intelligence") setSelectedView("customer-intelligence");
                    if (label === "Bank Comparison") setSelectedView("comparison");
                    if (label === "Sedad Analytics") {
                      setSelectedBank("sedad");
                      setSelectedView("sedad-analytics");
                    }
                    if (label === "Churn Prevention") {
                      setSelectedBank("sedad");
                      setSelectedView("churn-prevention");
                    }
                  }}
                >
                  <Icon size={18} /><span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item"><Settings size={18}/><span>Settings</span></button>
          <div className="profile">
            <div className="avatar">AD</div>
            <div><strong>Admin Demo</strong><span>Bank Administrator</span></div>
            <ChevronDown size={15}/>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>{selectedBank === "sedad" ? "Sedad Bank" : "Bank BMI Corn"}</strong>
          </div>
          <div className="top-actions">
            <div className="search-box"><Search size={16}/><span>Search anything...</span><kbd>⌘ K</kbd></div>
            <button className="icon-button"><Bell size={19}/><i/></button>
            <div className="top-avatar">AD</div>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">BANKING OVERVIEW · SYNTHETIC DEMO DATA</div>
              <h1>
                {selectedView === "sedad-analytics"
                  ? "Sedad Analytics"
                  : selectedView === "comparison"
                  ? "Bank Comparison"
                  : selectedView === "churn-prevention"
                    ? "Churn Prevention"
                    : selectedView === "customer-intelligence"
                      ? "Customer Intelligence"
                      : selectedBank === "sedad"
                        ? "Sedad Bank Dashboard"
                        : "Bank BMI Corn Dashboard"}
                <span> ✦</span>
              </h1>
              <p>
                {selectedView === "sedad-analytics"
                  ? "Detailed analytics for Sedad Bank · EUR, GBP and USD."
                  : selectedView === "comparison"
                  ? "Compare both banks using separate data sources."
                  : selectedView === "churn-prevention"
                    ? "Manage customer retention and recovery actions."
                    : selectedView === "customer-intelligence"
                      ? "Customer status, account activity and transaction trends."
                      : selectedBank === "sedad"
                        ? "Bank overview · EUR, GBP and USD"
                        : "Here’s what’s happening across your banking network today."}
              </p>
            </div>
            <button className="date-button">
              <CalendarDays size={16}/>
              {["customer-intelligence", "churn-prevention"].includes(selectedView) ? "Demo data" : "Last 12 months"}
              <ChevronDown size={15}/>
            </button>
          </section>

          {apiError && (
            <div className="panel" style={{ padding: 16, color: "#b42318" }}>
              API connection error: {apiError}
            </div>
          )}

          {selectedView === "sedad-analytics" ? (
            <SedadAnalytics />
          ) : selectedView === "comparison" ? (
            <BankComparison
              sedadData={sedadData}
              cornCustomers={totalCustomers}
              cornTransactions={totalTransactions}
              cornTransfers={transfers}
              loading={loading || sedadLoading}
            />
          ) : selectedView === "churn-prevention" ? (
            <ChurnPrevention
              churnData={churnData}
              bank={selectedBank}
              loading={customerIntelligenceLoading}
              error={customerIntelligenceError}
            />
          ) : selectedView === "customer-intelligence" ? (
            <CustomerIntelligence
              customerData={customerIntelligence}
              activityData={customerActivity}
              segmentationData={segmentationData}
              churnData={churnData}
              loading={customerIntelligenceLoading}
              error={customerIntelligenceError}
              bank={selectedBank}
            />
          ) : (
          selectedBank === "sedad" ? (
            <SedadDashboard
              data={sedadData}
              currencies={sedadCurrencies}
              monthly={sedadMonthly}
              loading={sedadLoading}
            />
          ) : (
          <>
          <section className="kpi-grid">
            <article className="kpi-card">
              <div className="kpi-top"><span>Total Customers</span><div className="kpi-icon blue"><Users size={19}/></div></div>
              <div className="kpi-value">{loading ? "..." : formatNumber(totalCustomers)}</div>
              <div className="kpi-foot"><span className="neutral-tag">{loading ? "..." : formatNumber(activeCustomers)} active</span><span>Customer base</span></div>
            </article>
            <article className="kpi-card">
              <div className="kpi-top"><span>Total Transactions</span><div className="kpi-icon violet"><ArrowLeftRight size={19}/></div></div>
              <div className="kpi-value">{loading ? "..." : formatNumber(totalTransactions)}</div>
              <div className="kpi-foot"><span className="neutral-tag">PostgreSQL</span><span>Transaction volume</span></div>
            </article>
            <article className="kpi-card">
              <div className="kpi-top"><span>Total Transaction Value</span><div className="kpi-icon gold"><Wallet size={19}/></div></div>
              <div className="kpi-value">{loading ? "..." : (totalAmount / 1000000000).toFixed(2) + "B"} <small>MRU</small></div>
              <div className="kpi-foot"><span className="neutral-tag">{formatNumber(totalTransactions)} records</span><span>Total processed</span></div>
            </article>
            <article className="kpi-card">
              <div className="kpi-top"><span>Transfer Success Rate</span><div className="kpi-icon green"><Activity size={19}/></div></div>
              <div className="kpi-value">{loading ? "..." : Number(transfers?.overall_success_rate ?? 0).toFixed(2)}<span className="percent">%</span></div>
              <div className="kpi-foot"><span className="positive"><ArrowUpRight size={14}/> {formatNumber(transfers?.completed_transfers ?? 0)} completed</span><span>{formatNumber(transfers?.total_transfers ?? 0)} transfers</span></div>
            </article>
          </section>

          <section className="charts-grid">
            <article className="panel chart-panel">
              <div className="panel-heading">
                <div><h2>Transaction Activity</h2><p>Monthly transaction volume · PostgreSQL data</p></div>
                <button className="select-button">2025 <ChevronDown size={14}/></button>
              </div>
              <div className="chart-legend"><span><i className="legend-dot blue-dot"/> Transactions</span></div>
              <div className="chart-area">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                    <defs><linearGradient id="blueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3568d4" stopOpacity={0.19}/><stop offset="100%" stopColor="#3568d4" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid stroke="#edf0f5" vertical={false}/>
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#8993a5", fontSize: 12 }}/>
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8993a5", fontSize: 11 }}/>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        border: "1px solid #e8edf5",
                        borderRadius: "12px",
                        boxShadow: "0 8px 24px rgba(20, 35, 65, 0.10)",
                        padding: "12px 16px",
                      }}
                      labelStyle={{
                        color: "#64748b",
                        fontWeight: 600,
                        marginBottom: "5px",
                      }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;

                        const data = payload[0].payload;

                        return (
                          <div style={{
                            background: "#ffffff",
                            border: "1px solid #e8edf5",
                            borderRadius: "12px",
                            padding: "12px 16px",
                            boxShadow: "0 8px 24px rgba(20, 35, 65, 0.10)",
                          }}>
                            <div style={{
                              color: "#64748b",
                              fontWeight: 600,
                              marginBottom: "8px",
                            }}>{label} 2025</div>

                            <div style={{ color: "#263b60", marginBottom: "6px" }}>
                              Transactions: <strong>{Number(data.transactions).toLocaleString("en-US")}</strong>
                            </div>

                            <div style={{ color: "#263b60", marginBottom: "6px" }}>
                              Total value: <strong>{(data.amount / 1000000).toFixed(2)}M MRU</strong>
                            </div>

                            <div style={{ color: "#64748b", fontSize: "12px" }}>
                              Average: {Number(data.average).toLocaleString("en-US", {
                                maximumFractionDigits: 2,
                              })} MRU
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Area type="monotone" dataKey="transactions" stroke="#3568d4" strokeWidth={2.5} fill="url(#blueFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="panel transfer-panel">
              <div className="panel-heading"><div><h2>Transfer Overview</h2><p>Transfer processing status</p></div><span className="live-label"><i/> OVERVIEW</span></div>
              <div className="transfer-total">{loading ? "..." : formatNumber(transfers?.total_transfers ?? 0)} <span>total transfers</span></div>
              <div className="success-track"><div style={{ width: `${transfers?.overall_success_rate ?? 0}%` }}/></div>
              <div className="transfer-stats">
                <div><span className="status-dot success-dot"/>Completed<strong>{formatNumber(transfers?.completed_transfers ?? 0)}</strong><small>{Number(transfers?.overall_success_rate ?? 0).toFixed(2)}%</small></div>
                <div><span className="status-dot pending-dot"/>Pending<strong>{formatNumber(transfers?.pending_transfers ?? 0)}</strong><small>{transfers?.total_transfers ? (transfers.pending_transfers / transfers.total_transfers * 100).toFixed(2) : "0.00"}%</small></div>
                <div><span className="status-dot failed-dot"/>Failed<strong>{formatNumber(transfers?.failed_transfers ?? 0)}</strong><small>{transfers?.total_transfers ? (transfers.failed_transfers / transfers.total_transfers * 100).toFixed(2) : "0.00"}%</small></div>
              </div>
              <div className="transfer-note"><CheckCircle2 size={16}/> Most transfers are completed successfully.</div>
            </article>
          </section>

          <section className="bottom-grid">
            <article className="panel branches-panel">
              <div className="panel-heading"><div><h2>Branch Performance</h2><p>All branches by transaction value · Live database data</p></div><span className="text-button">{branches.length} branches</span></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>BRANCH</th><th>CUSTOMERS</th><th>TRANSACTION VALUE</th><th>PERFORMANCE</th></tr></thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan="4">Loading branches...</td></tr>
                    ) : branches.map((b) => {
                      const performance = Number(b.total_amount) / totalBranchAmount * 100;
                      return (
                        <tr key={b.branch_id} onClick={() => setSelectedBranch(b)} className={selectedBranch?.branch_id === b.branch_id ? "branch-row selected" : "branch-row"} title="Click to view branch details">
                          <td><div className="branch-name"><span className="branch-icon"><Building2 size={16}/></span><div><strong>{b.branch_name}</strong><small>{b.city}</small></div></div></td>
                          <td>{formatNumber(b.total_customers)}</td>
                          <td className="amount">{formatAmount(b.total_amount)}</td>
                          <td><div className="bar-cell"><div className="mini-track"><i style={{width: `${performance}%`}}/></div><small>{Math.round(performance)}%</small></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selectedBranch && (
                <div style={{
                  marginTop: "18px",
                  padding: "18px",
                  background: "#f8fafc",
                  border: "1px solid #e8edf5",
                  borderRadius: "12px",
                }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "16px",
                  }}>
                    <div>
                      <h3 style={{ margin: 0, color: "#263b60" }}>
                        {selectedBranch.branch_name}
                      </h3>
                      <small style={{ color: "#64748b" }}>
                        {selectedBranch.city} · Branch details
                      </small>
                    </div>
                    <button
                      onClick={() => setSelectedBranch(null)}
                      style={{
                        border: "1px solid #dce3ed",
                        borderRadius: "8px",
                        background: "#ffffff",
                        padding: "7px 12px",
                        cursor: "pointer",
                        color: "#475569",
                      }}
                    >
                      Close
                    </button>
                  </div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                    gap: "14px",
                  }}>
                    <div>
                      <small style={{ color: "#64748b" }}>Total customers</small>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#263b60" }}>
                        {formatNumber(selectedBranch.total_customers)}
                      </div>
                    </div>
                    <div>
                      <small style={{ color: "#64748b" }}>Active customers</small>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#16845b" }}>
                        {formatNumber(selectedBranch.active_customers)}
                      </div>
                    </div>
                    <div>
                      <small style={{ color: "#64748b" }}>Transactions</small>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#263b60" }}>
                        {formatNumber(selectedBranch.total_transactions)}
                      </div>
                    </div>
                    <div>
                      <small style={{ color: "#64748b" }}>Transaction value</small>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#263b60" }}>
                        {formatAmount(selectedBranch.total_amount)} MRU
                      </div>
                    </div>
                    <div>
                      <small style={{ color: "#64748b" }}>Relative performance</small>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#3568d4" }}>
                        {(Number(selectedBranch.total_amount) / totalBranchAmount * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </article>

            <article className="panel recent-panel">
              <div className="panel-heading"><div><h2>Recent Transactions</h2><p>Illustrative activity (not live records)</p></div><button className="more-button">•••</button></div>
              <div className="transaction-list">
                {transactions.map((t) => <div className="transaction-row" key={t.id}>
                  <div className="transaction-icon"><ArrowLeftRight size={16}/></div>
                  <div className="transaction-info"><strong>{t.customer}</strong><small>{t.id} · {t.time}</small></div>
                  <div className="transaction-right"><strong>{t.amount}</strong><small className={`status ${t.status.toLowerCase()}`}>{t.status === "Completed" ? <CheckCircle2 size={12}/> : t.status === "Pending" ? <Clock3 size={12}/> : <XCircle size={12}/>} {t.status}</small></div>
                </div>)}
              </div>
            </article>
          </section>

          </>
          )
          )}

          <footer className="footer"><span>© 2026 BDIP Banking Intelligence Platform</span><span><i/> System operational <b>·</b> Demo environment</span></footer>
        </div>
      </main>
    </div>
  );
}



function SedadDashboard({ data, currencies, monthly, loading }) {
  const number = (value) => formatNumber(Number(value || 0));

  const customerStatus = Object.fromEntries(
    (data?.customers?.by_status || []).map((item) => [
      item.customer_status, item.total
    ])
  );

  const transactionStatus = Object.fromEntries(
    (data?.transactions?.by_status || []).map((item) => [
      item.transaction_status, item.total
    ])
  );

  const transferStatus = Object.fromEntries(
    (data?.transfers?.by_status || []).map((item) => [
      item.transfer_status, item.total
    ])
  );

  const accountGroups = (data?.accounts?.by_type_status_currency || [])
    .reduce((groups, item) => {
      const key = item.account_type;
      groups[key] = (groups[key] || 0) + Number(item.total);
      return groups;
    }, {});

  const monthlyTotals = Object.values(
    monthly.reduce((groups, item) => {
      const key = `${item.year_number}-${item.month_number}`;

      if (!groups[key]) {
        groups[key] = {
          month: item.month_name,
          year: item.year_number,
          transactions: 0,
        };
      }

      groups[key].transactions += Number(item.total_transactions);
      return groups;
    }, {})
  ).sort((a, b) => a.year - b.year || a.month.localeCompare(b.month));

  const completedTransfers = Number(transferStatus.completed || 0);
  const totalTransfers = Number(data?.transfers?.total || 0);
  const successRate = totalTransfers
    ? completedTransfers / totalTransfers * 100
    : 0;

  const accountStatus = (status) =>
    (data?.accounts?.by_type_status_currency || [])
      .filter((item) => item.account_status === status)
      .reduce((sum, item) => sum + Number(item.total), 0);

  return (
    <>
      <section className="kpi-grid">
        <article className="kpi-card">
          <div className="kpi-top">
            <span>Total Customers</span>
            <div className="kpi-icon blue"><Users size={19}/></div>
          </div>
          <div className="kpi-value">
            {loading ? "..." : number(data?.customers?.total)}
          </div>
          <div className="kpi-foot">
            <span className="neutral-tag">{number(customerStatus.active)} active</span>
            <span>Customer base</span>
          </div>
        </article>

        <article className="kpi-card">
          <div className="kpi-top">
            <span>Total Accounts</span>
            <div className="kpi-icon violet"><Wallet size={19}/></div>
          </div>
          <div className="kpi-value">
            {loading ? "..." : number(data?.accounts?.total)}
          </div>
          <div className="kpi-foot">
            <span className="neutral-tag">{number(accountGroups.current)} current</span>
            <span>{number(accountGroups.savings)} savings</span>
          </div>
        </article>

        <article className="kpi-card">
          <div className="kpi-top">
            <span>Total Transactions</span>
            <div className="kpi-icon gold"><ArrowLeftRight size={19}/></div>
          </div>
          <div className="kpi-value">
            {loading ? "..." : number(data?.transactions?.total)}
          </div>
          <div className="kpi-foot">
            <span className="neutral-tag">{number(transactionStatus.completed)} completed</span>
            <span>All currencies</span>
          </div>
        </article>

        <article className="kpi-card">
          <div className="kpi-top">
            <span>Transfer Success Rate</span>
            <div className="kpi-icon green"><Activity size={19}/></div>
          </div>
          <div className="kpi-value">
            {loading ? "..." : successRate.toFixed(2)}
            <span className="percent">%</span>
          </div>
          <div className="kpi-foot">
            <span className="positive">{number(completedTransfers)} completed</span>
            <span>{number(totalTransfers)} transfers</span>
          </div>
        </article>
      </section>

      <section className="charts-grid">
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Transaction Activity</h2>
              <p>Monthly transaction volume · Sedad data</p>
            </div>
          </div>

          <div className="chart-legend">
            <span><i className="legend-dot blue-dot"/> Transactions</span>
          </div>

          <div className="chart-area">
            {monthlyTotals.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTotals}>
                  <defs>
                    <linearGradient id="sedadFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3568d4" stopOpacity={0.19}/>
                      <stop offset="100%" stopColor="#3568d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#edf0f5" vertical={false}/>
                  <XAxis dataKey="month" axisLine={false} tickLine={false}/>
                  <YAxis axisLine={false} tickLine={false}/>
                  <Tooltip/>
                  <Area
                    type="monotone"
                    dataKey="transactions"
                    stroke="#3568d4"
                    strokeWidth={2.5}
                    fill="url(#sedadFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ padding: 20, color: "#64748b" }}>
                {loading ? "Loading..." : "No monthly data available."}
              </p>
            )}
          </div>
        </article>

        <article className="panel transfer-panel">
          <div className="panel-heading">
            <div><h2>Transfer Overview</h2><p>Sedad transfer status</p></div>
          </div>

          <div className="transfer-total">
            {number(data?.transfers?.total)} <span>total transfers</span>
          </div>

          <div className="success-track">
            <div style={{ width: `${successRate}%` }}/>
          </div>

          <div className="transfer-stats">
            <div>
              <span className="status-dot success-dot"/>Completed
              <strong>{number(transferStatus.completed)}</strong>
            </div>
            <div>
              <span className="status-dot pending-dot"/>Pending
              <strong>{number(transferStatus.pending)}</strong>
            </div>
            <div>
              <span className="status-dot failed-dot"/>Failed
              <strong>{number(transferStatus.failed)}</strong>
            </div>
          </div>

          <div className="transfer-note">
            <CheckCircle2 size={16}/> Transfer status from Sedad database
          </div>
        </article>
      </section>

      <section className="bottom-grid">
        <article className="panel branches-panel">
          <div className="panel-heading">
            <div>
              <h2>Transaction Value by Currency</h2>
              <p>Amounts are kept separate · No currency conversion</p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CURRENCY</th>
                  <th>TRANSACTIONS</th>
                  <th>TOTAL AMOUNT</th>
                  <th>AVERAGE</th>
                </tr>
              </thead>
              <tbody>
                {currencies.map((item) => (
                  <tr key={item.currency}>
                    <td><strong>{item.currency}</strong></td>
                    <td>{number(item.total_transactions)}</td>
                    <td className="amount">
                      {Number(item.total_amount).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} {item.currency}
                    </td>
                    <td>
                      {Number(item.average_amount).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} {item.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>Account Overview</h2>
              <p>Account types · Synthetic demo data</p>
            </div>
          </div>

          <div className="transfer-stats">
            <div>
              <span className="status-dot success-dot"/>Active
              <strong>{number(accountStatus("active"))}</strong>
            </div>
            <div>
              <span className="status-dot pending-dot"/>Inactive
              <strong>{number(accountStatus("inactive"))}</strong>
            </div>
          </div>

          <div style={{ padding: "16px 0", color: "#475569" }}>
            <p>Current accounts: <strong>{number(accountGroups.current)}</strong></p>
            <p>Savings accounts: <strong>{number(accountGroups.savings)}</strong></p>
            <p>Blocked customers: <strong>{number(customerStatus.blocked)}</strong></p>
            <p>Inactive customers: <strong>{number(customerStatus.inactive)}</strong></p>
          </div>
        </article>
      </section>
    </>
  );
}




function BankComparison({
  sedadData,
  cornCustomers,
  cornTransactions,
  cornTransfers,
  loading,
}) {
  const sedadCustomers = sedadData?.customers?.total;
  const sedadAccounts = sedadData?.accounts?.total;
  const sedadTransactions = sedadData?.transactions?.total;
  const sedadTransferCount = sedadData?.transfers?.total;

  const sedadTransferStatuses = Object.fromEntries(
    (sedadData?.transfers?.by_status || []).map((item) => [
      item.transfer_status,
      Number(item.total),
    ])
  );

  const sedadSuccessRate = sedadTransferCount
    ? (
        (sedadTransferStatuses.completed || 0) /
        Number(sedadTransferCount) * 100
      )
    : null;

  const cornTransferCount = cornTransfers?.total_transfers;
  const cornSuccessRate = cornTransfers?.overall_success_rate;

  const display = (value) =>
    value === null || value === undefined
      ? "Nicht verfügbar"
      : formatNumber(Number(value));

  const displayPercent = (value) =>
    value === null || value === undefined
      ? "Nicht verfügbar"
      : `${Number(value).toFixed(2)} %`;

  const rows = [
    {
      label: "Kunden",
      sedad: display(sedadCustomers),
      corn: display(cornCustomers),
    },
    {
      label: "Konten",
      sedad: display(sedadAccounts),
      corn: "Nicht verfügbar",
    },
    {
      label: "Transaktionen",
      sedad: display(sedadTransactions),
      corn: display(cornTransactions),
    },
    {
      label: "Transfers",
      sedad: display(sedadTransferCount),
      corn: display(cornTransferCount),
    },
    {
      label: "Transfer Success Rate",
      sedad: displayPercent(sedadSuccessRate),
      corn: displayPercent(cornSuccessRate),
    },
  ];

  return (
    <>
      <section className="kpi-grid">
        <article className="kpi-card">
          <div className="kpi-top">
            <span>Sedad Bank · Kunden</span>
            <div className="kpi-icon blue"><Users size={19}/></div>
          </div>
          <div className="kpi-value">{loading ? "..." : display(sedadCustomers)}</div>
          <div className="kpi-foot"><span>Synthetische Demo-Daten</span></div>
        </article>

        <article className="kpi-card">
          <div className="kpi-top">
            <span>BMI Corn · Kunden</span>
            <div className="kpi-icon violet"><Users size={19}/></div>
          </div>
          <div className="kpi-value">{loading ? "..." : display(cornCustomers)}</div>
          <div className="kpi-foot"><span>Synthetische Demo-Daten</span></div>
        </article>

        <article className="kpi-card">
          <div className="kpi-top">
            <span>Sedad Bank · Transaktionen</span>
            <div className="kpi-icon gold"><ArrowLeftRight size={19}/></div>
          </div>
          <div className="kpi-value">{loading ? "..." : display(sedadTransactions)}</div>
          <div className="kpi-foot"><span>EUR · GBP · USD</span></div>
        </article>

        <article className="kpi-card">
          <div className="kpi-top">
            <span>BMI Corn · Transaktionen</span>
            <div className="kpi-icon green"><ArrowLeftRight size={19}/></div>
          </div>
          <div className="kpi-value">{loading ? "..." : display(cornTransactions)}</div>
          <div className="kpi-foot"><span>MRU</span></div>
        </article>
      </section>

      <section
        className="comparison-chart-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <article className="panel" style={{ padding: "18px" }}>
          <div className="panel-heading">
            <div>
              <h2>Kundenvergleich</h2>
              <p>Anzahl der Kunden je Bank</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[
              { bank: "Sedad Bank", value: Number(sedadCustomers) || 0 },
              { bank: "BMI Corn", value: Number(cornCustomers) || 0 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bank" />
              <YAxis tickFormatter={(value) => formatNumber(value)} />
              <Tooltip formatter={(value) => formatNumber(value)} />
              <Bar dataKey="value" name="Kunden" fill="#3976c5" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="panel" style={{ padding: "18px" }}>
          <div className="panel-heading">
            <div>
              <h2>Transaktionsvergleich</h2>
              <p>Anzahl der Transaktionen je Bank</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[
              { bank: "Sedad Bank", value: Number(sedadTransactions) || 0 },
              { bank: "BMI Corn", value: Number(cornTransactions) || 0 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bank" />
              <YAxis tickFormatter={(value) => formatNumber(value)} />
              <Tooltip formatter={(value) => formatNumber(value)} />
              <Bar dataKey="value" name="Transaktionen" fill="#16a085" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="panel" style={{ padding: "18px" }}>
          <div className="panel-heading">
            <div>
              <h2>Transfer Success Rate</h2>
              <p>Erfolgreiche Transfers in Prozent</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[
              { bank: "Sedad Bank", value: Number(sedadSuccessRate) || 0 },
              { bank: "BMI Corn", value: Number(cornSuccessRate) || 0 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bank" />
              <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <Tooltip formatter={(value) => `${Number(value).toFixed(2)} %`} />
              <Bar dataKey="value" name="Success Rate" fill="#c49a45" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="bottom-grid">
        <article className="panel branches-panel">
          <div className="panel-heading">
            <div>
              <h2>Bank Comparison</h2>
              <p>Comparison of available metrics</p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>METRIC</th>
                  <th>SEDAD BANK</th>
                  <th>BANK BMI CORN</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.label}>
                    <td><strong>{item.label}</strong></td>
                    <td>{loading ? "..." : item.sedad}</td>
                    <td>{loading ? "..." : item.corn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>Data Sources</h2>
              <p>Separate Bank Data</p>
            </div>
          </div>
          <div style={{ padding: "16px 0", color: "#475569" }}>
            <p><strong>Sedad Bank</strong></p>
            <p>Source: raw_sedad</p>
            <p>Currencies: EUR, GBP and USD</p>
            <hr style={{ border: 0, borderTop: "1px solid #edf0f5", margin: "16px 0" }}/>
            <p><strong>Bank BMI Corn</strong></p>
            <p>Source: analytics</p>
            <p>Currency: MRU</p>
          </div>
        </article>
      </section>

      <p style={{ color: "#64748b", fontSize: "12px", marginTop: "12px" }}>
        Note: All displayed values are synthetic demo data.
        Different currencies are not added together or converted.
        Unavailable metrics are explicitly indicated.
      </p>
    </>
  );
}


export default App;
