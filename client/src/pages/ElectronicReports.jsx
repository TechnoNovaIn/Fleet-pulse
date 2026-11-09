import React, { useState, useEffect } from 'react';
import { 
  FileText, Download, Printer, Filter, Calendar, 
  Search, Eye, RefreshCw, CheckCircle2 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable, { applyPlugin } from 'jspdf-autotable';

// Ensure autoTable plugin is registered on jsPDF constructor
try {
  if (typeof applyPlugin === 'function') {
    applyPlugin(jsPDF);
  }
} catch (e) {
  console.warn('Could not auto-apply autoTable plugin:', e);
}

const REPORT_TABS = [
  { id: 'vehicle_master', label: 'Vehicle Master Report' },
  { id: 'daily_operations', label: 'Daily Operations Report' },
  { id: 'current_stoppages', label: 'Vehicle Stoppage Report' },
  { id: 'vehicle_problems', label: 'Vehicle Problem Report' },
  { id: 'resolved_problems', label: 'Resolved Problems Report' },
  { id: 'long_pending_problems', label: 'Long-Pending Vehicle Report' }
];

export default function ElectronicReports({ t, showToast, lang, onNavigate, navParams }) {
  const [activeTab, setActiveTab] = useState(() => navParams?.reportType || 'vehicle_master');
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [vehicleType, setVehicleType] = useState('All');
  const [status, setStatus] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState(() => navParams?.search || '');

  // Column toggle
  const [showOptionalColumns, setShowOptionalColumns] = useState(true);

  useEffect(() => {
    if (navParams?.reportType) {
      setActiveTab(navParams.reportType);
    }
    if (navParams?.search) {
      setSearch(navParams.search);
    }
    if (navParams?.vehicleType) {
      setVehicleType(navParams.vehicleType);
    }
  }, [navParams]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('report_type', activeTab);
      if (vehicleType !== 'All') params.append('vehicle_type', vehicleType);
      if (status !== 'All') params.append('status', status);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (search) params.append('search', search);

      const res = await fetch(`/api/reports?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load electronic report');
      const json = await res.json();
      setReportData(json.data || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [activeTab, vehicleType, status, startDate, endDate, search]);

  // Export to Excel
  const handleExportExcel = () => {
    if (reportData.length === 0) {
      showToast('No records available to export', 'warning');
      return;
    }

    try {
      const worksheet = XLSX.utils.json_to_sheet(reportData);
      const workbook = XLSX.utils.book_new();
      const tabTitle = activeTab.replace(/_/g, ' ').toUpperCase();
      XLSX.utils.book_append_sheet(workbook, worksheet, tabTitle.substring(0, 30));
      XLSX.writeFile(workbook, `FleetPulse_${activeTab}_${Date.now()}.xlsx`);
      showToast('Excel report downloaded successfully', 'success');
    } catch (err) {
      showToast('Excel export failed: ' + err.message, 'error');
    }
  };

  // Export to PDF
  const handleExportPDF = () => {
    if (reportData.length === 0) {
      showToast('No records available to export', 'warning');
      return;
    }

    try {
      const doc = new jsPDF('landscape');
      const title = REPORT_TABS.find(t => t.id === activeTab)?.label || 'Electronic Vehicle Report';

      // Header Branding
      doc.setFontSize(16);
      doc.setTextColor(37, 99, 235);
      doc.text('FLEETPULSE TRANSPORT OPERATIONS', 14, 15);
      
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text(title, 14, 23);

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated on: ${new Date().toLocaleString()} | Total Records: ${reportData.length}`, 14, 29);

      // Prepare headers & data
      const headers = Object.keys(reportData[0] || {});
      const rows = reportData.map(row => headers.map(h => row[h] || '-'));

      // Build table using autoTable function
      const tableDrawer = 
        (typeof autoTable === 'function' ? autoTable : null) ||
        (autoTable && typeof autoTable.default === 'function' ? autoTable.default : null) ||
        (autoTable && typeof autoTable.autoTable === 'function' ? autoTable.autoTable : null);

      if (tableDrawer) {
        tableDrawer(doc, {
          head: [headers],
          body: rows,
          startY: 34,
          styles: { fontSize: 8, cellPadding: 3.5, overflow: 'linebreak' },
          headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] }
        });
      } else if (typeof doc.autoTable === 'function') {
        doc.autoTable({
          head: [headers],
          body: rows,
          startY: 34,
          styles: { fontSize: 8, cellPadding: 3.5, overflow: 'linebreak' },
          headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] }
        });
      }

      doc.save(`FleetPulse_Report_${activeTab}_${Date.now()}.pdf`);
      showToast('PDF report generated and downloaded successfully', 'success');
    } catch (err) {
      showToast('PDF export failed: ' + err.message, 'error');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const columns = reportData.length > 0 ? Object.keys(reportData[0]) : [];

  return (
    <div className="content-body">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title">{t.reports.title}</h1>
          <p className="section-desc">{t.reports.columnsNotice}</p>
        </div>

        <div className="reports-action-buttons">
          <button className="btn-secondary" onClick={handlePrint} title="Print Report">
            <Printer size={16} /> Print
          </button>
          <button className="btn-secondary" onClick={handleExportPDF} title="Download formatted PDF">
            <Download size={16} /> Export PDF
          </button>
          <button className="btn-primary" onClick={handleExportExcel} title="Download formatted Excel (.xlsx)">
            <Download size={16} /> Export Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Mobile Report Selector Dropdown */}
      <div className="reports-select-mobile">
        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Select Report Type:
        </label>
        <select
          className="filter-select"
          style={{ width: '100%', fontWeight: '700', background: '#eff6ff', color: '#1e40af', borderColor: '#bfdbfe', padding: '10px 14px' }}
          value={activeTab}
          onChange={e => {
            setActiveTab(e.target.value);
            setStatus('All');
          }}
        >
          {REPORT_TABS.map(tab => (
            <option key={tab.id} value={tab.id}>{tab.label}</option>
          ))}
        </select>
      </div>

      {/* Desktop Report Tabs */}
      <div className="reports-tabs-desktop" style={{
        display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px',
        marginBottom: '16px', borderBottom: '1px solid #e2e8f0'
      }}>
        {REPORT_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setStatus('All');
            }}
            style={{
              padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
              whiteSpace: 'nowrap', transition: 'all 0.15s ease',
              backgroundColor: activeTab === tab.id ? '#2563eb' : '#ffffff',
              color: activeTab === tab.id ? '#ffffff' : '#475569',
              border: activeTab === tab.id ? '1px solid #2563eb' : '1px solid #e2e8f0',
              boxShadow: activeTab === tab.id ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            className="search-input"
            placeholder="Search report by vehicle, location, or reason..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={vehicleType}
          onChange={e => setVehicleType(e.target.value)}
        >
          <option value="All">All Vehicle Types</option>
          <option value="25 ft">25 ft</option>
          <option value="40 ft">40 ft</option>
          <option value="32 ft Multi-Axle">32 ft Multi-Axle</option>
        </select>

        {activeTab === 'current_stoppages' && (
          <select
            className="filter-select"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="All">All Statuses (Ongoing & Ended)</option>
            <option value="Ongoing">Ongoing (Active Stoppages)</option>
            <option value="Ended">Ended (Restarted Stoppages)</option>
          </select>
        )}

        {activeTab === 'vehicle_master' && (
          <select
            className="filter-select"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Operating">Operating</option>
            <option value="Stopped">Stopped</option>
            <option value="Idle">Idle</option>
            <option value="Under Maintenance">Under Maintenance</option>
          </select>
        )}

        {activeTab === 'vehicle_problems' && (
          <select
            className="filter-select"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>
        )}

        <div className="filter-dates-row">
          <div className="filter-date-item">
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>From:</span>
            <input
              type="date"
              className="filter-select"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>

          <div className="filter-date-item">
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>To:</span>
            <input
              type="date"
              className="filter-select"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <button className="btn-secondary" onClick={fetchReport}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Report Summary Bar */}
      <div style={{
        padding: '12px 18px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap', gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={16} color="#2563eb" />
          <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: '700' }}>
            {REPORT_TABS.find(t => t.id === activeTab)?.label || 'Report'}
          </span>
          <span style={{ fontSize: '12px', background: '#eff6ff', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
            {reportData.length} Records Found
          </span>
        </div>
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          Simplified report: showing only essential operational columns
        </span>
      </div>

      {/* Mobile Table Scroll Hint */}
      <div className="mobile-table-hint">
        <span>⟷ Swipe left/right to view all table columns</span>
      </div>

      {/* Table */}
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reportData.length === 0 ? (
              <tr>
                <td colSpan={columns.length || 6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                  {loading ? 'Compiling electronic report...' : 'No records match current report filters.'}
                </td>
              </tr>
            ) : (
              reportData.map((row, idx) => (
                <tr key={idx} className="hover-table-row">
                  {columns.map(col => {
                    const val = row[col];
                    const isDaysStopped = col === 'Days Stopped' || col === 'Days Overdue';
                    const isVehicle = col === 'Vehicle Number';
                    const isStatus = col === 'Status' || col === 'Operational Status';
                    const isPriority = col === 'Priority';

                    return (
                      <td key={col}>
                        {isVehicle ? (
                          <span 
                            onClick={() => onNavigate && onNavigate('vehicles', { vehicleReg: val })}
                            style={{
                              fontWeight: '700',
                              color: '#1e3a8a',
                              background: '#eff6ff',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              border: '1px solid #bfdbfe',
                              cursor: 'pointer',
                              display: 'inline-block'
                            }}
                            title="Click to view in Vehicle Master"
                          >
                            {val}
                          </span>
                        ) : isDaysStopped ? (
                          <span className="badge" style={{
                            background: parseInt(val, 10) >= 7 ? '#fee2e2' : parseInt(val, 10) >= 3 ? '#ffedd5' : '#fef3c7',
                            color: parseInt(val, 10) >= 7 ? '#991b1b' : parseInt(val, 10) >= 3 ? '#9a3412' : '#92400e',
                            border: parseInt(val, 10) >= 7 ? '1px solid #fca5a5' : parseInt(val, 10) >= 3 ? '1px solid #fdba74' : '1px solid #fde68a',
                            fontWeight: '700'
                          }}>
                            {val}
                          </span>
                        ) : isStatus ? (
                          <span 
                            className={`badge ${
                              val === 'Ongoing' ? 'badge-ongoing' : 
                              val === 'Ended' ? 'badge-ended' : 
                              val === 'Operating' ? 'badge-operating' : 
                              val === 'Stopped' ? 'badge-stopped' : 
                              val === 'Under Maintenance' ? 'badge-maintenance' :
                              `badge-${String(val).toLowerCase().replace(/\s+/g, '-')}`
                            }`}
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px',
                              cursor: activeTab === 'current_stoppages' ? 'pointer' : 'default'
                            }}
                            onClick={() => {
                              if (activeTab === 'current_stoppages' && onNavigate) {
                                onNavigate('stoppages', { vehicleReg: row['Vehicle Number'] });
                              } else if ((activeTab === 'vehicle_problems' || activeTab === 'resolved_problems') && onNavigate) {
                                onNavigate('problems', { vehicleReg: row['Vehicle Number'] });
                              }
                            }}
                            title={activeTab === 'current_stoppages' ? 'Click to open in Stoppage Tracking' : (activeTab === 'vehicle_problems' || activeTab === 'resolved_problems') ? 'Click to open in Vehicle Problems' : undefined}
                          >
                            <span style={{
                              width: '7px',
                              height: '7px',
                              borderRadius: '50%',
                              backgroundColor: (val === 'Ongoing' || val === 'Stopped') ? '#dc2626' : (val === 'Ended' || val === 'Operating' || val === 'Resolved' || val === 'Closed') ? '#16a34a' : '#d97706',
                              display: 'inline-block'
                            }} />
                            {val}
                          </span>
                        ) : isPriority ? (
                          <span className={`badge badge-${String(val).toLowerCase()}`}>
                            {val}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.84rem', color: '#1e293b' }}>{val || '-'}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
