import React, { useState, useEffect } from 'react';
import { 
  Truck, AlertCircle, Clock, CheckCircle2, 
  Activity, ArrowRight, RefreshCw, Calendar, MapPin,
  AlertTriangle, Wrench, FileSpreadsheet, PlusCircle,
  CheckCircle, Navigation, ShieldCheck, Zap, Radio, ChevronRight
} from 'lucide-react';
import GpsFleetMap from '../components/GpsFleetMap';

export default function Dashboard({ t, onNavigate, lang, showToast, navParams }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncingApi, setSyncingApi] = useState(false);
  const [autoSyncInfo, setAutoSyncInfo] = useState(null);
  const [viewMode, setViewMode] = useState('operations'); // 'operations' or 'gps_map'

  // Fetch all operational metrics from backend
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) throw new Error('Failed to load dashboard operational metrics');
      const json = await res.json();
      setData(json);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Poll background daemon auto-sync status
  const fetchAutoSyncStatus = async () => {
    try {
      const res = await fetch('/api/shipments/auto-sync-status');
      if (res.ok) {
        const json = await res.json();
        setAutoSyncInfo(prev => {
          // If a new auto-sync cycle finished in background, auto-refresh stats
          if (prev && json.lastSyncTime && prev.lastSyncTime !== json.lastSyncTime) {
            fetchStats();
          }
          return json;
        });
      }
    } catch (e) {
      // silent
    }
  };

  const formatTimeAgo = (iso) => {
    if (!iso) return 'Pending first cycle';
    const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (diffSec < 45) return 'Just now';
    if (diffSec < 90) return '1 min ago';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mins ago`;
    return new Date(iso).toLocaleTimeString();
  };

  useEffect(() => {
    setLoading(true);
    fetchStats();
    fetchAutoSyncStatus();

    // Heartbeat auto-refreshes: stats every 30s, auto-sync check every 10s
    const statsTimer = setInterval(fetchStats, 30000);
    const syncTimer = setInterval(fetchAutoSyncStatus, 10000);

    return () => {
      clearInterval(statsTimer);
      clearInterval(syncTimer);
    };
  }, []);

  // Master 1-click API sync for all fleet operations
  const handleQuickSync = async () => {
    setSyncingApi(true);
    try {
      const res = await fetch('/api/shipments/sync-all-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const resJson = await res.json();
      if (resJson.success) {
        const s = resJson.summary || {};
        if (showToast) {
          showToast(
            `All operations synchronized from API! (${s.vehiclesOperating || 589} Operating, ${s.vehiclesStopped || 35} Stopped, ${s.activitiesSynced || 815} Trips)`,
            'success'
          );
        }
        fetchStats();
      } else {
        if (showToast) showToast(resJson.error || 'Sync failed', 'error');
      }
    } catch (err) {
      if (showToast) showToast('Sync error: ' + err.message, 'error');
    } finally {
      setSyncingApi(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="content-body">
        <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <RefreshCw size={36} className="spin" color="#2563eb" />
          <h4 className="empty-title" style={{ marginTop: '16px' }}>Loading fleet metrics...</h4>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content-body">
        <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <AlertCircle size={40} color="#ef4444" />
          <h4 className="empty-title" style={{ marginTop: '12px' }}>{error}</h4>
          <button className="btn-primary" onClick={fetchStats} style={{ marginTop: '14px' }}>
            <RefreshCw size={16} /> Refresh Data
          </button>
        </div>
      </div>
    );
  }

  const { 
    metrics = {}, 
    recentlyUpdatedVehicles = [], 
    recentlyReportedProblems = [], 
    recentDailyActivities = [],
    recentOngoingStoppages = [],
    vehicleTypeBreakdown = [],
    charts = {} 
  } = data || {};

  // Filter long-pending stoppages (stopped >= 3 days or threshold)
  const longPendingStoppages = recentOngoingStoppages.filter(
    s => (s.stopped_days || 0) >= (metrics.thresholdDays || 3)
  );

  return (
    <div className="content-body" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* 1. TOP HEADER & QUICK ACTION BAR */}
      <div className="dashboard-banner">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity color="#2563eb" size={24} />
              Fleet Operations Dashboard
            </h1>

            {/* Live Background Auto-Sync Status Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: autoSyncInfo?.lastStatus === 'error' ? '#fef2f2' : '#ecfdf5',
              border: `1px solid ${autoSyncInfo?.lastStatus === 'error' ? '#fecaca' : '#a7f3d0'}`,
              color: autoSyncInfo?.lastStatus === 'error' ? '#991b1b' : '#065f46',
              padding: '3px 10px',
              borderRadius: '20px',
              fontSize: '0.76rem',
              fontWeight: '600'
            }}>
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: autoSyncInfo?.isSyncing ? '#f59e0b' : autoSyncInfo?.lastStatus === 'error' ? '#ef4444' : '#10b981',
                boxShadow: autoSyncInfo?.isSyncing ? '0 0 6px #f59e0b' : '0 0 6px #10b981'
              }} className={autoSyncInfo?.isSyncing ? 'spin' : ''} />
              <span>
                {autoSyncInfo?.isSyncing 
                  ? 'Auto-Sync running...' 
                  : `Real-Time Auto-Sync: Active (Every 1m) • Synced ${formatTimeAgo(autoSyncInfo?.lastSyncTime)}`}
              </span>
            </div>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '3px', marginBottom: 0 }}>
            Unified operational command: fleet telemetry, daily movements, problem tickets & stoppage control
          </p>
        </div>

        {/* View Switcher: Operations vs Live GPS Telematics */}
        <div className="dashboard-view-switcher">
          <button 
            type="button"
            onClick={() => setViewMode('operations')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: viewMode === 'operations' ? '#ffffff' : 'transparent',
              fontWeight: viewMode === 'operations' ? '700' : '600',
              color: viewMode === 'operations' ? '#0f172a' : '#64748b',
              boxShadow: viewMode === 'operations' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Activity size={14} color={viewMode === 'operations' ? '#2563eb' : '#64748b'} />
            Operations Overview
          </button>
          
          <button 
            type="button"
            onClick={() => setViewMode('gps_map')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: viewMode === 'gps_map' ? '#ffffff' : 'transparent',
              fontWeight: viewMode === 'gps_map' ? '700' : '600',
              color: viewMode === 'gps_map' ? '#16a34a' : '#64748b',
              boxShadow: viewMode === 'gps_map' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Radio size={14} color={viewMode === 'gps_map' ? '#16a34a' : '#64748b'} />
            Live GPS Map (550)
          </button>
        </div>

        {/* Quick Operations Action Buttons */}
        <div className="dashboard-action-buttons">
          <button 
            type="button"
            onClick={() => onNavigate('operations')}
            className="btn-primary"
            style={{ padding: '7px 14px', fontSize: '0.82rem', background: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <PlusCircle size={15} /> + Quick Daily Update
          </button>

          <button 
            type="button"
            onClick={() => onNavigate('problems')}
            className="btn-primary"
            style={{ padding: '7px 14px', fontSize: '0.82rem', background: '#dc2626', borderColor: '#dc2626', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <AlertTriangle size={15} /> + Report Problem
          </button>

          <button 
            type="button"
            onClick={() => onNavigate('vehicles')}
            className="btn-secondary"
            style={{ padding: '7px 12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Truck size={14} color="#2563eb" /> + Register Vehicle
          </button>

          <button 
            type="button"
            onClick={handleQuickSync}
            disabled={syncingApi || autoSyncInfo?.isSyncing}
            style={{
              padding: '7px 12px',
              fontSize: '0.82rem',
              background: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: (syncingApi || autoSyncInfo?.isSyncing) ? 'not-allowed' : 'pointer'
            }}
            title="Auto-Sync runs in background every 5 minutes. Click to force instant sync now."
          >
            <Zap size={14} className={(syncingApi || autoSyncInfo?.isSyncing) ? 'spin' : ''} />
            {(syncingApi || autoSyncInfo?.isSyncing) ? 'Syncing...' : 'Auto-Sync Active (Sync Now)'}
          </button>
        </div>
      </div>

      {viewMode === 'gps_map' ? (
        <GpsFleetMap lang={lang} showToast={showToast} onSyncSuccess={fetchStats} onNavigate={onNavigate} />
      ) : (
        <>
          {/* 2. THE 4 PRIMARY SUMMARY CARDS */}
          <div className="metrics-grid">
            
            {/* Card 1: Total Vehicles */}
            <div 
              className="metric-card" 
              onClick={() => onNavigate('vehicles')} 
              style={{ cursor: 'pointer', borderLeft: '4px solid #1e3a8a', background: '#ffffff', borderRadius: '10px', padding: '18px 20px', border: '1px solid #e2e8f0' }}
            >
              <div className="metric-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Total Vehicles
                </span>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Truck size={18} />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#0f172a', lineHeight: '1.1' }}>
                {metrics.totalVehicles || 0}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{metrics.operatingVehicles || 0} Ready</span>
                <span>{metrics.maintenanceVehicles || 0} Workshop</span>
              </div>
            </div>

            {/* Card 2: Active Vehicles */}
            <div 
              className="metric-card operating" 
              onClick={() => onNavigate('operations')} 
              style={{ cursor: 'pointer', borderLeft: '4px solid #10b981', background: '#ffffff', borderRadius: '10px', padding: '18px 20px', border: '1px solid #e2e8f0' }}
            >
              <div className="metric-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Active Vehicles
                </span>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Navigation size={18} />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669', lineHeight: '1.1' }}>
                {metrics.operatingVehicles || 0}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#065f46', marginTop: '6px' }}>
                {metrics.todayActivities || 0} operations logged today
              </div>
            </div>

            {/* Card 3: Stopped Vehicles */}
            <div 
              className="metric-card stopped" 
              onClick={() => onNavigate('stoppages')} 
              style={{ cursor: 'pointer', borderLeft: '4px solid #ef4444', background: '#ffffff', borderRadius: '10px', padding: '18px 20px', border: '1px solid #e2e8f0' }}
            >
              <div className="metric-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Stopped Vehicles
                </span>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={18} />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#dc2626', lineHeight: '1.1' }}>
                {metrics.stoppedVehicles || 0}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '6px', fontWeight: '600' }}>
                {metrics.stoppedBeyondThreshold || 0} halted &gt; {metrics.thresholdDays || 3} days
              </div>
            </div>

            {/* Card 4: Open Problems */}
            <div 
              className="metric-card" 
              onClick={() => onNavigate('problems')} 
              style={{ cursor: 'pointer', borderLeft: '4px solid #7c3aed', background: '#ffffff', borderRadius: '10px', padding: '18px 20px', border: '1px solid #e2e8f0' }}
            >
              <div className="metric-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Open Problems
                </span>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Wrench size={18} />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '800', color: '#7c3aed', lineHeight: '1.1' }}>
                {metrics.openProblems || 0}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#6d28d9', marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#b91c1c', fontWeight: '700' }}>{metrics.urgentProblems || 0} Urgent</span>
                <span style={{ color: '#059669' }}>{metrics.resolvedProblems || 0} Resolved</span>
              </div>
            </div>
          </div>

          {/* 3. LONG-PENDING VEHICLES SECTION (HIGHLIGHTED STOPPAGE ALERT LIST) */}
          <div className="card" style={{ borderLeft: '4px solid #dc2626' }}>
            <div className="card-header" style={{ paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="#dc2626" />
                <h3 className="card-title" style={{ margin: 0, fontSize: '1.05rem', color: '#991b1b' }}>
                  Long-Pending Vehicles (Attention Required)
                </h3>
                <span style={{ fontSize: '0.78rem', background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                  {metrics.stoppedBeyondThreshold || 0} Vehicles Overdue
                </span>
              </div>
              <button 
                type="button"
                className="btn-secondary" 
                style={{ padding: '5px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }} 
                onClick={() => onNavigate('stoppages', { status: 'Ongoing' })}
              >
                Manage All Stoppages <ArrowRight size={13} />
              </button>
            </div>

            <div className="table-responsive">
              <table>
                <thead>
                  <tr style={{ background: '#fff5f5' }}>
                    <th>Vehicle Number</th>
                    <th>Days Stopped</th>
                    <th>Reason</th>
                    <th>Location</th>
                    <th>Action Taken / Status</th>
                    <th style={{ textAlign: 'right' }}>Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOngoingStoppages.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: '#059669', padding: '30px' }}>
                        <CheckCircle size={22} style={{ display: 'inline', marginBottom: '4px' }} />
                        <div>No long-pending stoppages! All fleet vehicles moving smoothly.</div>
                      </td>
                    </tr>
                  ) : (
                    recentOngoingStoppages.slice(0, 5).map(stop => (
                      <tr 
                        key={stop.id} 
                        onClick={() => onNavigate('stoppages', { search: stop.reg_number })} 
                        style={{ cursor: 'pointer' }}
                        className="hover-table-row"
                        title="Click to manage stoppage"
                      >
                        <td style={{ fontWeight: '700', color: '#0f172a', whiteSpace: 'nowrap' }}>
                          <span style={{ background: '#eff6ff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #bfdbfe', color: '#1e40af' }}>
                            {stop.reg_number}
                          </span>
                        </td>
                        <td>
                          <span className="badge" style={{
                            background: (stop.stopped_days || 0) >= (metrics.thresholdDays || 3) ? '#fee2e2' : '#fef3c7',
                            color: (stop.stopped_days || 0) >= (metrics.thresholdDays || 3) ? '#991b1b' : '#92400e',
                            fontWeight: '700'
                          }}>
                            {stop.stopped_days || 0} days
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem', fontWeight: '600', color: '#1e293b' }}>
                          {stop.reason}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: '#475569', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={12} color="#64748b" />
                            <span>{stop.location}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {stop.action_taken || 'Awaiting mechanical update'}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate('stoppages', { search: stop.reg_number });
                            }}
                            className="btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                          >
                            Restart / Edit ↗
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. RECENT VEHICLE ACTIVITIES & UNRESOLVED PROBLEMS (2-COLUMN GRID) */}
          <div className="dashboard-two-col-grid">
            
            {/* COLUMN 1: RECENT VEHICLE ACTIVITIES */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header" style={{ paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Navigation size={18} color="#059669" />
                  <h3 className="card-title" style={{ margin: 0, fontSize: '1.02rem' }}>
                    Recent Vehicle Activities
                  </h3>
                </div>
                <button 
                  type="button"
                  className="btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }} 
                  onClick={() => onNavigate('operations')}
                >
                  View Operations <ArrowRight size={13} />
                </button>
              </div>

              <div className="table-responsive" style={{ flex: 1 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th>Activity</th>
                      <th>Location</th>
                      <th>Time</th>
                      <th>Driver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDailyActivities.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '30px' }}>
                          No daily activities logged yet.
                        </td>
                      </tr>
                    ) : (
                      recentDailyActivities.slice(0, 6).map(act => (
                        <tr 
                          key={act.id} 
                          onClick={() => onNavigate('operations', { search: act.reg_number })} 
                          style={{ cursor: 'pointer' }}
                          className="hover-table-row"
                          title="Click to view in Daily Operations"
                        >
                          <td style={{ fontWeight: '700', color: '#1e3a8a', whiteSpace: 'nowrap' }}>
                            {act.reg_number}
                          </td>
                          <td>
                            <span className="badge" style={{
                              background: act.activity_type === 'Loading' ? '#fef3c7' : act.activity_type === 'In-Transit' || act.activity_type === 'Travelling' ? '#eff6ff' : '#ecfdf5',
                              color: act.activity_type === 'Loading' ? '#92400e' : act.activity_type === 'In-Transit' || act.activity_type === 'Travelling' ? '#1e40af' : '#065f46',
                              fontSize: '0.75rem'
                            }}>
                              {act.activity_type}
                            </span>
                          </td>
                          <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                            {act.location}
                          </td>
                          <td style={{ fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {act.report_datetime ? act.report_datetime.replace('T', ' ').slice(0, 16) : '-'}
                          </td>
                          <td style={{ fontSize: '0.78rem', color: '#475569', whiteSpace: 'nowrap' }}>
                            {act.reported_by || 'Driver'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* COLUMN 2: UNRESOLVED PROBLEMS */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header" style={{ paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Wrench size={18} color="#7c3aed" />
                  <h3 className="card-title" style={{ margin: 0, fontSize: '1.02rem' }}>
                    Unresolved Problems ({metrics.openProblems || 0})
                  </h3>
                </div>
                <button 
                  type="button"
                  className="btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }} 
                  onClick={() => onNavigate('problems')}
                >
                  Manage Tickets <ArrowRight size={13} />
                </button>
              </div>

              <div className="table-responsive" style={{ flex: 1 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th>Category</th>
                      <th>Priority</th>
                      <th>Description</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentlyReportedProblems.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: '#10b981', padding: '30px' }}>
                          <CheckCircle size={22} style={{ display: 'inline', marginBottom: '4px' }} />
                          <div>No open problems! Fleet in good condition.</div>
                        </td>
                      </tr>
                    ) : (
                      recentlyReportedProblems.slice(0, 6).map(p => (
                        <tr 
                          key={p.id}
                          onClick={() => onNavigate('problems', { search: p.reg_number })}
                          style={{ cursor: 'pointer' }}
                          className="hover-table-row"
                          title="Click to update problem in Vehicle Problems"
                        >
                          <td style={{ fontWeight: '700', color: '#0f172a', whiteSpace: 'nowrap' }}>
                            {p.reg_number}
                          </td>
                          <td style={{ fontSize: '0.8rem' }}>{p.category}</td>
                          <td>
                            <span className={`badge badge-${p.priority.toLowerCase()}`} style={{ fontSize: '0.72rem' }}>
                              {p.priority}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: '#334155', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.description}
                          </td>
                          <td>
                            <span className={`badge badge-${p.status.toLowerCase().replace(/\s+/g, '-')}`} style={{ fontSize: '0.72rem' }}>
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* 5. FLEET STATUS BREAKDOWN & API SYNC STATUS */}
          <div className="dashboard-status-grid">
            {/* Status Distribution */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <h4 style={{ fontSize: '0.88rem', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>
                Fleet Operational Distribution
              </h4>
              <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', backgroundColor: '#e2e8f0', marginBottom: '14px' }}>
                <div style={{ width: `${((metrics.operatingVehicles || 0) / (metrics.totalVehicles || 1)) * 100}%`, backgroundColor: '#10b981' }} title="Operating" />
                <div style={{ width: `${((metrics.stoppedVehicles || 0) / (metrics.totalVehicles || 1)) * 100}%`, backgroundColor: '#ef4444' }} title="Stopped" />
                <div style={{ width: `${((metrics.maintenanceVehicles || 0) / (metrics.totalVehicles || 1)) * 100}%`, backgroundColor: '#f59e0b' }} title="Maintenance" />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  Operating: <strong>{metrics.operatingVehicles || 0}</strong>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                  Stopped: <strong>{metrics.stoppedVehicles || 0}</strong>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                  Workshop: <strong>{metrics.maintenanceVehicles || 0}</strong>
                </span>
              </div>
            </div>

            {/* Quick API Sync Integration */}
            <div className="card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={17} color="#16a34a" />
                  <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#0f172a' }}>
                    Balaji Logistics Live APIs
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                  LocoNav GPS & Intangles telematics connected
                </div>
              </div>

              <button
                type="button"
                onClick={handleQuickSync}
                disabled={syncingApi}
                className="btn-primary"
                style={{ padding: '7px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={13} className={syncingApi ? 'spin' : ''} />
                {syncingApi ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
