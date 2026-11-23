import { useEffect, useState } from "react";
import { Users, Activity, ShieldCheck, Search, Bell } from "lucide-react";
import "./App.css";
import CustomerIntelligence from "./CustomerIntelligence";
import ChurnPrevention from "./ChurnPrevention";

function App() {
  const [selectedView, setSelectedView] = useState("customer-intelligence");
  const [customerData, setCustomerData] = useState(null);
  const [activityData, setActivityData] = useState(null);
  const [segmentationData, setSegmentationData] = useState(null);
  const [churnData, setChurnData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDemoData() {
      try {
        const files = [
          "customer-intelligence.json",
          "customer-activity.json",
          "customer-segmentation.json",
          "churn-analysis.json",
        ];

        const responses = await Promise.all(
          files.map((file) => fetch(`/data/${file}`))
        );

        if (responses.some((response) => !response.ok)) {
          throw new Error("Demo data could not be loaded.");
        }

        const [customers, activity, segmentation, churn] = await Promise.all(
          responses.map((response) => response.json())
        );

        if (!cancelled) {
          setCustomerData(customers);
          setActivityData(activity);
          setSegmentationData(segmentation);
          setChurnData(churn);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDemoData();
    return () => {
      cancelled = true;
    };
  }, []);

  const isChurn = selectedView === "churn-prevention";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>SEDAD</strong>
            <span>BANKING INTELLIGENCE</span>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace">
          <div className="workspace-icon">S</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>Sedad Bank</strong>
            <span style={{ display: "block", color: "#9aa7ba", fontSize: 11 }}>
              Demo environment
            </span>
          </div>
        </div>

        <nav>
          <div className="nav-group">
            <div className="nav-title">CUSTOMER & RETENTION</div>
            <button
              className={`nav-item ${!isChurn ? "active" : ""}`}
              onClick={() => setSelectedView("customer-intelligence")}
            >
              <Users size={18} />
              <span>Customer Intelligence</span>
            </button>
            <button
              className={`nav-item ${isChurn ? "active" : ""}`}
              onClick={() => setSelectedView("churn-prevention")}
            >
              <Activity size={18} />
              <span>Churn Prevention</span>
            </button>
          </div>
        </nav>

        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">SD</div>
            <div>
              <strong>Sedad Demo</strong>
              <span>Read-only access</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>Sedad Bank</strong>
          </div>
          <div className="top-actions">
            <div className="search-box">
              <Search size={16} />
              <span>Demo environment</span>
            </div>
            <div className="icon-button"><Bell size={19} /></div>
            <div className="top-avatar">SD</div>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                SEDAD BANK · SYNTHETIC DEMO DATA · READ ONLY
              </div>
              <h1>
                {isChurn ? "Churn Prevention" : "Customer Intelligence"}
                <span> ✦</span>
              </h1>
              <p>
                {isChurn
                  ? "Customer retention insights and prevention performance."
                  : "Customer status, account activity and transaction insights."}
              </p>
            </div>
            <div className="date-button">
              <ShieldCheck size={16} />
              Read-only demo
            </div>
          </section>

          {error && (
            <div className="panel" style={{ padding: 16, color: "#b42318" }}>
              {error}
            </div>
          )}

          {isChurn ? (
            <ChurnPrevention
              churnData={churnData}
              bank="sedad"
              loading={loading}
              error={error}
            />
          ) : (
            <CustomerIntelligence
              customerData={customerData}
              activityData={activityData}
              segmentationData={segmentationData}
              churnData={churnData}
              loading={loading}
              error={error}
              bank="sedad"
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
