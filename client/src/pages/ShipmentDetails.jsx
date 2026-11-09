import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, RefreshCw, Download, Database, CheckCircle2, 
  Search, ArrowRight, Truck, User, Calendar, Layers, ShieldCheck
} from 'lucide-react';

export default function ShipmentDetails({ t, showToast, lang }) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingVehicles, setSyncingVehicles] = useState(false);

  // Filters
  const [fromDate, setFromDate] = useState('2026-08-01');
  const [toDate, setToDate] = useState('2026-08-07');
  const [selectedType, setSelectedType] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(100);

  // Data
  const [shipments, setShipments] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [apiStatus, setApiStatus] = useState(null);

  // Check API Status on load
  const checkStatus = async () => {
    try {
      const res = await fetch('/api/shipments/status');
      const data = await res.json();
      if (data.success) {
        setApiStatus(data);
      }
    } catch (err) {
      console.error('Failed to get API status:', err);
    }
  };

  // Fetch shipment records
  const fetchShipments = async () => {
    setLoading(true);
    try {
      const types = selectedType === 'All' 
        ? 'Prepaid,Rake,StockYard,To-Pay,Internal,Dolvi,BMM'
        : selectedType;

      const query = new URLSearchParams({
        From: fromDate,
        To: toDate,
        shipmentType: types,
        PageNumber: '1',
        PageSize: String(pageSize)
      });

      const res = await fetch(`/api/shipments/fetch?${query.toString()}`);
      const result = await res.json();

      if (result.success) {
        setShipments(result.data || []);
        setTotalRecords(result.totalRecords || (result.data ? result.data.length : 0));
        showToast(`Retrieved ${result.data?.length || 0} shipment records from Balaji API`, 'success');
      } else {
        showToast(result.error || 'Failed to fetch shipment details', 'error');
      }
    } catch (err) {
      showToast('API Connection Error: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    fetchShipments();
  }, []);

  // Filtered shipments by user search term
  const filteredShipments = useMemo(() => {
    if (!searchTerm) return shipments;
    const term = searchTerm.toLowerCase();
    return shipments.filter(s => 
      (s.vehicle && s.vehicle.toLowerCase().includes(term)) ||
      (s.GCNo && s.GCNo.toLowerCase().includes(term)) ||
      (s.InvoiceNo && s.InvoiceNo.toLowerCase().includes(term)) ||
      (s.PartyName && s.PartyName.toLowerCase().includes(term)) ||
      (s.From && s.From.toLowerCase().includes(term)) ||
      (s.Unload && s.Unload.toLowerCase().includes(term)) ||
      (s.Driver && s.Driver.toLowerCase().includes(term))
    );
  }, [shipments, searchTerm]);

  // Aggregate metrics
  const stats = useMemo(() => {
    const total = filteredShipments.length;
    const vehicles = new Set(filteredShipments.map(s => s.vehicle).filter(Boolean));
    const totalNtWt = filteredShipments.reduce((sum, s) => sum + (parseFloat(s.NtWt) || 0), 0);
    
    // Most common destination
    const destCounts = {};
    filteredShipments.forEach(s => {
      const route = s.From && s.Unload ? `${s.From} → ${s.Unload}` : (s.Unload || s.From);
      if (route) destCounts[route] = (destCounts[route] || 0) + 1;
    });
    let topRoute = '-';
    let maxCount = 0;
    for (const [r, count] of Object.entries(destCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topRoute = r;
      }
    }

    return {
      total,
      uniqueVehicles: vehicles.size,
      totalNtWt: totalNtWt.toFixed(2),
      topRoute
    };
  }, [filteredShipments]);

  // Sync shipments to Daily Operations
  const handleSyncToOperations = async () => {
    if (shipments.length === 0) {
      showToast('No shipments available to sync', 'error');
      return;
    }

    const confirmMsg = `Sync all ${shipments.length} fetched shipments to Daily Fleet Operations?`;

    if (!window.confirm(confirmMsg)) return;

    setSyncing(true);
    try {
      const res = await fetch('/api/shipments/sync-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipments })
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          `Synced ${data.activitiesAdded} operations and registered ${data.vehiclesAdded} new vehicles!`,
          'success'
        );
      } else {
        showToast(data.error || 'Sync failed', 'error');
      }
    } catch (err) {
      showToast('Sync error: ' + err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Sync unique vehicles into Vehicle Master
  const handleSyncVehicles = async () => {
    setSyncingVehicles(true);
    try {
      const res = await fetch('/api/shipments/sync-vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ From: fromDate, To: toDate })
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          `Successfully registered ${data.vehiclesAdded} vehicles into Vehicle Master!`,
          'success'
        );
      } else {
        showToast(data.error || 'Failed to sync vehicles', 'error');
      }
    } catch (err) {
      showToast('Error syncing vehicles: ' + err.message, 'error');
    } finally {
      setSyncingVehicles(false);
    }
  };

  // Export to CSV
  const exportCsv = () => {
    if (filteredShipments.length === 0) {
      showToast('No records to export', 'error');
      return;
    }

    const headers = ['Shipment Date', 'Vehicle No', 'Type', 'GC No', 'Invoice No', 'From', 'Destination', 'Party Name', 'Consignor', 'Net Weight', 'Driver'];
    const rows = filteredShipments.map(s => [
      s.ShipmentDate?.replace('T', ' ') || '',
      s.vehicle || '',
      s.ShipmentType || '',
      s.GCNo || '',
      s.InvoiceNo || '',
      s.From || '',
      s.Unload || '',
      `"${(s.PartyName || '').replace(/"/g, '""')}"`,
      `"${(s.Consignor || '').replace(/"/g, '""')}"`,
      s.NtWt || 0,
      s.Driver || ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Shipment_Details_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV exported successfully', 'success');
  };

  const st = t.shipments || {};

  return (
    <div className="page-content" style={{ padding: '24px' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '700', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Package color="#2563eb" size={28} />
            {st.title || 'Shipment Attendance (Live API)'}
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>
            {st.subtitle || 'Direct integration with Balaji Transports Logistics API with automated operational syncing'}
          </p>
        </div>

        {/* Live Status Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          padding: '8px 16px',
          borderRadius: '20px',
          color: '#166534',
          fontSize: '0.85rem',
          fontWeight: '600'
        }}>
          <ShieldCheck size={18} color="#16a34a" />
          <span>Balaji API: <strong>Connected</strong> (User: Raghu)</span>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '16px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        border: '1px solid #e2e8f0',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-end' }}>
          {/* From Date */}
          <div style={{ flex: '1 1 140px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>
              <Calendar size={13} style={{ display: 'inline', marginRight: '4px' }} />
              {st.from || 'From Date'}
            </label>
            <input 
              type="date" 
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
            />
          </div>

          {/* To Date */}
          <div style={{ flex: '1 1 140px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>
              <Calendar size={13} style={{ display: 'inline', marginRight: '4px' }} />
              {st.to || 'To Date'}
            </label>
            <input 
              type="date" 
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
            />
          </div>

          {/* Shipment Type */}
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>
              <Layers size={13} style={{ display: 'inline', marginRight: '4px' }} />
              {st.shipmentType || 'Shipment Type'}
            </label>
            <select 
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
            >
              <option value="All">{st.allTypes || 'All Types (Prepaid, Rake, BMM...)'}</option>
              <option value="BMM">BMM</option>
              <option value="Prepaid">Prepaid</option>
              <option value="Rake">Rake</option>
              <option value="StockYard">StockYard</option>
              <option value="To-Pay">To-Pay</option>
              <option value="Internal">Internal</option>
              <option value="Dolvi">Dolvi</option>
            </select>
          </div>

          {/* Page Limit */}
          <div style={{ flex: '0 1 110px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>
              Records
            </label>
            <select 
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={2000}>2000</option>
            </select>
          </div>

          {/* Fetch Live Shipments Button */}
          <button
            onClick={fetchShipments}
            disabled={loading}
            style={{
              background: '#2563eb',
              color: '#ffffff',
              padding: '9px 18px',
              borderRadius: '6px',
              border: 'none',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            {loading ? (st.loading || 'Fetching...') : (st.fetchData || 'Fetch Live Data')}
          </button>
        </div>

        {/* Second Row: Search & Action Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search box */}
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '10px' }} />
            <input 
              type="text"
              placeholder="Filter vehicle, GC No, party, destination..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {/* Sync to Daily Operations */}
            <button
              onClick={handleSyncToOperations}
              disabled={syncing || shipments.length === 0}
              style={{
                background: '#059669',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: syncing ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              title="Push shipments into Daily Operations log"
            >
              <CheckCircle2 size={16} />
              {syncing ? (st.syncing || 'Syncing...') : (st.syncToOperations || 'Sync to Operations')}
            </button>

            {/* Sync to Vehicle Master */}
            <button
              onClick={handleSyncVehicles}
              disabled={syncingVehicles}
              style={{
                background: '#4f46e5',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: syncingVehicles ? 'not-allowed' : 'pointer'
              }}
              title="Register missing fleet vehicles into Master database"
            >
              <Database size={16} />
              {syncingVehicles ? 'Registering...' : (st.syncVehicles || 'Import Vehicles to Master')}
            </button>

            {/* Export CSV */}
            <button
              onClick={exportCsv}
              disabled={filteredShipments.length === 0}
              style={{
                background: '#ffffff',
                color: '#334155',
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: filteredShipments.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <Download size={16} />
              {t.common.exportExcel || 'Export CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* Aggregate Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '20px'
      }}>
        {/* Total Shipments */}
        <div style={{ background: '#ffffff', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
          <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase' }}>
            {st.totalShipments || 'Shipments Loaded'}
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: '700', color: '#0f172a', marginTop: '4px' }}>
            {stats.total.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
            Total in Balaji Database: {totalRecords.toLocaleString()}
          </div>
        </div>

        {/* Unique Active Vehicles */}
        <div style={{ background: '#ffffff', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
          <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase' }}>
            {st.uniqueVehicles || 'Active Fleet Vehicles'}
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: '700', color: '#2563eb', marginTop: '4px' }}>
            {stats.uniqueVehicles}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
            Operating during selected dates
          </div>
        </div>

        {/* Net Tonnage */}
        <div style={{ background: '#ffffff', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
          <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase' }}>
            {st.totalTonnage || 'Total Net Tonnage'}
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: '700', color: '#059669', marginTop: '4px' }}>
            {stats.totalNtWt} <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Tons</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
            Commercial cargo handled
          </div>
        </div>

        {/* Top Route */}
        <div style={{ background: '#ffffff', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
          <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase' }}>
            {st.topRoute || 'High-Volume Route'}
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#d97706', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stats.topRoute}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
            Most frequent transport corridor
          </div>
        </div>
      </div>

      {/* Shipment Data Table */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ overflowX: 'auto', maxHeight: '580px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '600' }}>Date</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '600' }}>Vehicle</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '600' }}>Type</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '600' }}>Route (From → Unload)</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '600' }}>Consignor & Party</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '600' }}>GC / Invoice No</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '600', textAlign: 'right' }}>Net Wt (T)</th>
                <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '600' }}>Driver</th>
              </tr>
            </thead>
            <tbody>
              {filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    {loading ? (st.loading || 'Fetching shipments from Balaji Transports API...') : (t.common.noRecords || 'No shipment records found.')}
                  </td>
                </tr>
              ) : (
                filteredShipments.map((s, idx) => (
                  <tr 
                    key={s.shipmentId || idx}
                    style={{ 
                      borderBottom: '1px solid #f1f5f9',
                      background: idx % 2 === 0 ? '#ffffff' : '#fcfcfd'
                    }}
                  >
                    {/* Date */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#334155' }}>
                      {s.ShipmentDate ? s.ShipmentDate.split('T')[0] : '-'}
                    </td>

                    {/* Vehicle */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontWeight: '700',
                        color: '#1e3a8a',
                        background: '#eff6ff',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: '1px solid #dbeafe',
                        letterSpacing: '0.5px'
                      }}>
                        {s.vehicle || '-'}
                      </span>
                    </td>

                    {/* Shipment Type */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: s.ShipmentType === 'BMM' ? '#fef3c7' : s.ShipmentType === 'Prepaid' ? '#dcfce7' : '#f1f5f9',
                        color: s.ShipmentType === 'BMM' ? '#92400e' : s.ShipmentType === 'Prepaid' ? '#166534' : '#475569'
                      }}>
                        {s.ShipmentType || '-'}
                      </span>
                    </td>

                    {/* Route */}
                    <td style={{ padding: '10px 14px', color: '#334155' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: '500' }}>{s.From || 'Unknown'}</span>
                        <ArrowRight size={13} color="#94a3b8" />
                        <span style={{ fontWeight: '600', color: '#0f172a' }}>{s.Unload || s.Location || 'En Route'}</span>
                      </div>
                    </td>

                    {/* Consignor & Party */}
                    <td style={{ padding: '10px 14px', maxWidth: '200px' }}>
                      <div style={{ fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.PartyName || '-'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.Consignor || s.ProductName || '-'}
                      </div>
                    </td>

                    {/* GC / Invoice */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: '600', color: '#0f172a' }}>{s.GCNo || '-'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.InvoiceNo || ''}</div>
                    </td>

                    {/* Net Wt */}
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '600', color: '#0f172a' }}>
                      {s.NtWt ? `${s.NtWt} T` : '-'}
                    </td>

                    {/* Driver */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#475569' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User size={13} color="#94a3b8" />
                        <span>{s.Driver && s.Driver !== '-' ? s.Driver : 'Assigned Driver'}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div style={{
          padding: '12px 16px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.8rem',
          color: '#64748b'
        }}>
          <div>
            Showing <strong>{filteredShipments.length}</strong> of <strong>{shipments.length}</strong> loaded shipments (Total upstream: {totalRecords.toLocaleString()})
          </div>
          <div>
            Balaji Transports Upstream Logistics Interface
          </div>
        </div>
      </div>
    </div>
  );
}

