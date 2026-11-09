import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, Truck, Activity, AlertTriangle, Clock, 
  FileSpreadsheet, Settings, Bell, LogOut, 
  Menu, X, CheckCircle, Info, Search, Calendar, ArrowLeft
} from 'lucide-react';

import { translations } from './translations';

import LoginModal from './components/LoginModal';
import AlertDrawer from './components/AlertDrawer';

import Dashboard from './pages/Dashboard';
import VehicleMaster from './pages/VehicleMaster';
import DailyOperations from './pages/DailyOperations';
import VehicleProblems from './pages/VehicleProblems';
import StoppageTracking from './pages/StoppageTracking';
import ElectronicReports from './pages/ElectronicReports';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('fleet_user');
      return stored ? JSON.parse(stored) : { full_name: 'Rajesh Kumar', username: 'handler', role: 'process_handler' };
    } catch {
      return { full_name: 'Rajesh Kumar', username: 'handler', role: 'process_handler' };
    }
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [navParams, setNavParams] = useState({});

  const handleNavigate = (tab, params = {}) => {
    const tabMap = {
      'stoppage': 'stoppages',
      'problem': 'problems',
      'vehicle': 'vehicles',
      'operation': 'operations',
      'report': 'reports'
    };
    const targetTab = tabMap[tab] || tab;
    setActiveTab(targetTab);
    setNavParams(params || {});
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const lang = 'en';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertDrawerOpen, setAlertDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Global fleet vehicles list for quick search
  const [fleetVehicles, setFleetVehicles] = useState([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [showGlobalDropdown, setShowGlobalDropdown] = useState(false);
  const searchContainerRef = useRef(null);

  // Alerts & Toasts
  const [alerts, setAlerts] = useState([]);
  const [toasts, setToasts] = useState([]);

  const t = translations['en'];

  // Current formatted date
  const currentDateFormatted = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }, []);

  // Fetch in-app operational alerts
  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/dashboard/alerts');
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch {
      // ignore
    }
  };

  // Fetch vehicles for global search
  const fetchGlobalVehicles = async () => {
    try {
      const res = await fetch('/api/vehicles');
      if (res.ok) {
        const data = await res.json();
        setFleetVehicles(data || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchAlerts();
    fetchGlobalVehicles();
    const interval = setInterval(fetchAlerts, 20000);
    return () => clearInterval(interval);
  }, []);

  // Click outside listener for global search dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowGlobalDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 4500);
  };

  const handleLogout = () => {
    localStorage.removeItem('fleet_token');
    localStorage.removeItem('fleet_user');
    setUser(null);
  };

  const handleNavigateFromAlert = (module) => {
    handleNavigate(module);
  };

  // Filtered vehicles for global search dropdown
  const filteredGlobalVehicles = useMemo(() => {
    const q = globalSearch.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (!q) return [];
    return fleetVehicles.filter(v => {
      const reg = (v.reg_number || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const type = (v.vehicle_type || '').toLowerCase();
      const loc = (v.current_location || '').toLowerCase();
      return reg.includes(q) || type.includes(q) || loc.includes(q);
    }).slice(0, 7);
  }, [fleetVehicles, globalSearch]);

  const handleSelectGlobalVehicle = (v) => {
    setShowGlobalDropdown(false);
    setGlobalSearch('');
    handleNavigate('vehicles', { vehicleReg: v.reg_number });
  };

  if (!user) {
    return <LoginModal onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />;
  }

  const urgentCount = alerts.filter(a => a.severity === 'danger').length;

  return (
    <div className="app-container">
      {/* Mobile Sidebar Backdrop Overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          title="Tap to close menu"
        />
      )}

      {/* 1. FIXED LEFT SIDEBAR */}
      <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-badge">
            <Truck size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="logo-title">FleetPulse</div>
            <div className="logo-subtitle">Vehicle Management</div>
          </div>
          <button
            className="sidebar-close-mobile"
            onClick={() => setSidebarOpen(false)}
            title="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="nav-menu">
          <button
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'vehicles' ? 'active' : ''}`}
            onClick={() => { setActiveTab('vehicles'); setSidebarOpen(false); }}
          >
            <Truck size={18} />
            <span>Vehicle Master</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'operations' ? 'active' : ''}`}
            onClick={() => { setActiveTab('operations'); setSidebarOpen(false); }}
          >
            <Activity size={18} />
            <span>Daily Operations</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'stoppages' ? 'active' : ''}`}
            onClick={() => { setActiveTab('stoppages'); setSidebarOpen(false); }}
          >
            <Clock size={18} />
            <span>Stoppage Tracking</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'problems' ? 'active' : ''}`}
            onClick={() => { setActiveTab('problems'); setSidebarOpen(false); }}
          >
            <AlertTriangle size={18} />
            <span>Vehicle Problems</span>
            {urgentCount > 0 && <span className="nav-badge">{urgentCount}</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => { setActiveTab('reports'); setSidebarOpen(false); }}
          >
            <FileSpreadsheet size={18} />
            <span>Reports</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }}
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </nav>

        {/* Process Handler Profile Footer */}
        <div className="sidebar-footer">
          <div className="handler-card">
            <div className="handler-avatar">
              {user.full_name?.charAt(0) || 'P'}
            </div>
            <div className="handler-info">
              <div className="handler-name">{user.full_name || 'Process Handler'}</div>
              <div className="handler-role">Fleet Operations Handler</div>
            </div>
            <button
              onClick={handleLogout}
              style={{ background: 'transparent', color: '#94a3b8', padding: '4px', cursor: 'pointer' }}
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION WRAPPER */}
      <div className="main-wrapper">
        {/* TOP HEADER */}
        <header className="topbar">
          {mobileSearchOpen ? (
            /* Full-width dedicated search bar on Mobile */
            <div ref={searchContainerRef} className="mobile-search-full">
              <button
                type="button"
                className="mobile-search-back-btn"
                onClick={() => setMobileSearchOpen(false)}
                title="Back"
              >
                <ArrowLeft size={20} />
              </button>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search vehicle number (e.g. 9525, KA06)..."
                  value={globalSearch}
                  onChange={e => {
                    setGlobalSearch(e.target.value);
                    setShowGlobalDropdown(true);
                  }}
                  className="mobile-search-full-input"
                />
                {globalSearch && (
                  <button
                    type="button"
                    onClick={() => { setGlobalSearch(''); setShowGlobalDropdown(false); }}
                    className="topbar-search-clear"
                    title="Clear"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {showGlobalDropdown && globalSearch.trim() && (
                <div className="topbar-search-dropdown mobile-dropdown">
                  {filteredGlobalVehicles.length === 0 ? (
                    <div style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#64748b' }}>
                      No vehicle found matching "{globalSearch}"
                    </div>
                  ) : (
                    filteredGlobalVehicles.map(v => (
                      <div
                        key={v.id}
                        onClick={() => {
                          setMobileSearchOpen(false);
                          handleSelectGlobalVehicle(v);
                        }}
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                        className="hover-table-row"
                      >
                        <div>
                          <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a' }}>
                            {v.reg_number}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {v.vehicle_type} • {v.current_location || 'Operating'}
                          </div>
                        </div>
                        <span className={`badge badge-${(v.operational_status || 'Operating').toLowerCase().replace(/\s+/g, '-')}`}>
                          {v.operational_status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Top Left: Mobile Menu + Application Name */}
              <div className="topbar-left">
                <button
                  className="mobile-menu-btn"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  title="Toggle sidebar"
                >
                  {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
                <div className="topbar-brand">
                  <span className="brand-title">
                    FleetPulse
                  </span>
                  <span className="brand-tag">
                    Operations
                  </span>
                </div>
              </div>

              {/* Top Center: Global Vehicle Search (Desktop Only) */}
              <div ref={searchContainerRef} className="topbar-search-container desktop-search-only">
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                  <input
                    type="text"
                    placeholder="Global search vehicle (e.g. 9525, KA06)..."
                    value={globalSearch}
                    onChange={e => {
                      setGlobalSearch(e.target.value);
                      setShowGlobalDropdown(true);
                    }}
                    onFocus={() => setShowGlobalDropdown(true)}
                    className="topbar-search-input"
                  />
                  {globalSearch && (
                    <button
                      type="button"
                      onClick={() => { setGlobalSearch(''); setShowGlobalDropdown(false); }}
                      className="topbar-search-clear"
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Global Search Results Dropdown */}
                {showGlobalDropdown && globalSearch.trim() && (
                  <div className="topbar-search-dropdown">
                    {filteredGlobalVehicles.length === 0 ? (
                      <div style={{ padding: '10px 14px', fontSize: '0.8rem', color: '#64748b' }}>
                        No vehicle found matching "{globalSearch}"
                      </div>
                    ) : (
                      filteredGlobalVehicles.map(v => (
                        <div
                          key={v.id}
                          onClick={() => handleSelectGlobalVehicle(v)}
                          style={{
                            padding: '9px 12px',
                            borderBottom: '1px solid #f1f5f9',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          className="hover-table-row"
                        >
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0f172a' }}>
                              {v.reg_number}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                              {v.vehicle_type} • {v.current_location || 'Operating'}
                            </div>
                          </div>
                          <span className={`badge badge-${(v.operational_status || 'Operating').toLowerCase().replace(/\s+/g, '-')}`} style={{ fontSize: '0.72rem' }}>
                            {v.operational_status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Top Right: Search Toggle + Current Date + Alerts + Employee Profile */}
              <div className="topbar-right">
                {/* Mobile Search Button (Visible on mobile only) */}
                <button
                  type="button"
                  className="mobile-search-btn"
                  onClick={() => {
                    setMobileSearchOpen(true);
                    setShowGlobalDropdown(true);
                  }}
                  title="Search vehicles"
                >
                  <Search size={19} color="#475569" />
                </button>

                {/* Current Date */}
                <div className="topbar-date">
                  <Calendar size={14} color="#2563eb" />
                  <span>{currentDateFormatted}</span>
                </div>

                {/* Alert Bell */}
                <button
                  className="btn-alert-bell"
                  onClick={() => setAlertDrawerOpen(true)}
                  title="Operational Alerts"
                >
                  <Bell size={18} color="#475569" />
                  {alerts.length > 0 && (
                    <span className="bell-badge">{alerts.length}</span>
                  )}
                </button>

                {/* Employee Profile Pill */}
                <div className="topbar-user-pill">
                  <div className="topbar-user-avatar">
                    {user.full_name?.charAt(0) || 'P'}
                  </div>
                  <div className="topbar-user-info">
                    <div className="topbar-user-name">
                      {user.full_name || 'Rajesh Kumar'}
                    </div>
                    <div className="topbar-user-role">
                      Process Handler
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </header>

        {/* Dynamic Route Pages */}
        {activeTab === 'dashboard' && (
          <Dashboard t={t} onNavigate={handleNavigate} lang={lang} showToast={showToast} navParams={navParams} />
        )}
        {activeTab === 'vehicles' && (
          <VehicleMaster t={t} showToast={showToast} lang={lang} onNavigate={handleNavigate} navParams={navParams} />
        )}
        {activeTab === 'operations' && (
          <DailyOperations t={t} showToast={showToast} lang={lang} onNavigate={handleNavigate} navParams={navParams} />
        )}
        {activeTab === 'stoppages' && (
          <StoppageTracking t={t} showToast={showToast} lang={lang} onNavigate={handleNavigate} navParams={navParams} />
        )}
        {activeTab === 'problems' && (
          <VehicleProblems t={t} showToast={showToast} lang={lang} onNavigate={handleNavigate} navParams={navParams} />
        )}
        {activeTab === 'reports' && (
          <ElectronicReports t={t} showToast={showToast} lang={lang} onNavigate={handleNavigate} navParams={navParams} />
        )}
        {activeTab === 'settings' && (
          <SettingsPage t={t} showToast={showToast} lang={lang} onNavigate={handleNavigate} navParams={navParams} />
        )}
      </div>

      {/* Slide-out Alert Drawer */}
      <AlertDrawer
        isOpen={alertDrawerOpen}
        onClose={() => setAlertDrawerOpen(false)}
        alerts={alerts}
        onNavigate={handleNavigateFromAlert}
      />

      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === 'success' && <CheckCircle size={18} color="#10b981" />}
            {toast.type === 'error' && <AlertTriangle size={18} color="#ef4444" />}
            {toast.type === 'info' && <Info size={18} color="#2563eb" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
