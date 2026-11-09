import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, Search, Calendar, MapPin, Truck, Check, Clock, 
  AlertCircle, RefreshCw, Eye, Trash2, Edit3, X, ChevronLeft, 
  ChevronRight, Navigation, FileSpreadsheet, ExternalLink, 
  AlertTriangle, Mic, MicOff, Camera, User, Copy
} from 'lucide-react';
import PhotoUpload from '../components/PhotoUpload';

const ACTIVITY_BUTTONS = [
  { id: 'Travelling', label: 'Travelling', icon: '🚚', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { id: 'Halting', label: 'Halting', icon: '🛑', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  { id: 'Loading', label: 'Loading', icon: '📦', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { id: 'Unloading', label: 'Unloading', icon: '📥', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
  { id: 'Waiting', label: 'Waiting', icon: '⏳', color: '#ea580c', bg: '#fff7ed', border: '#ffedd5' },
  { id: 'Maintenance', label: 'Maintenance', icon: '🔧', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { id: 'Breakdown', label: 'Breakdown', icon: '⚠️', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  { id: 'Other', label: 'Other', icon: '📝', color: '#475569', bg: '#f8fafc', border: '#e2e8f0' }
];

export default function DailyOperations({ t, showToast, lang, onNavigate, navParams }) {
  const [activities, setActivities] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [activityType, setActivityType] = useState('Travelling');
  const [location, setLocation] = useState('');
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [reportedBy, setReportedBy] = useState('Driver Ravi Shankar');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Table Filter & Search states
  const [filterVehicle, setFilterVehicle] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Detail Modal states
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  useEffect(() => {
    if (navParams?.vehicleId) {
      setSelectedVehicleId(String(navParams.vehicleId));
    }
    if (navParams?.activityType) {
      setActivityType(navParams.activityType);
    }
    if (navParams?.location) {
      setLocation(navParams.location);
    }
  }, [navParams]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [vRes, aRes] = await Promise.all([
        fetch('/api/vehicles'),
        fetch('/api/activities')
      ]);
      const vData = await vRes.json();
      const aData = await aRes.json();
      setVehicles(vData);
      setActivities(aData);
      if (vData.length > 0 && !selectedVehicleId) {
        setSelectedVehicleId(vData[0].id);
        if (vData[0].current_location) {
          setLocation(vData[0].current_location);
        }
      }
    } catch (err) {
      if (showToast) showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
    // Auto-refresh activities table to keep in sync with background auto-sync
    const interval = setInterval(() => {
      fetch('/api/activities')
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setActivities(data); })
        .catch(() => {});
    }, 45000);
    return () => clearInterval(interval);
  }, []);

  const selectedVehicleObj = vehicles.find(v => String(v.id) === String(selectedVehicleId));

  // Redirect to corresponding dashboard feature when clicking an operation
  const handleRedirectOperation = (type) => {
    setActivityType(type);
    if (!onNavigate) return;
    const vehicleReg = selectedVehicleObj?.reg_number || '';
    const vehicleId = selectedVehicleId;

    if (type === 'Travelling') {
      if (showToast) showToast(`Redirecting to Live Fleet Tracker for ${vehicleReg || 'fleet'}...`, 'info');
      onNavigate('dashboard', { vehicleId, search: vehicleReg });
    } else if (type === 'Halting' || type === 'Waiting' || type === 'Other') {
      if (showToast) showToast(`Redirecting to Stoppage Tracking for ${vehicleReg || 'fleet'}...`, 'info');
      onNavigate('stoppages', { vehicleId, reason: type === 'Waiting' ? 'Waiting for Loading / Papers' : type, search: vehicleReg });
    } else if (type === 'Maintenance') {
      if (showToast) showToast(`Redirecting to Vehicle Problems & Maintenance for ${vehicleReg || 'fleet'}...`, 'info');
      onNavigate('problems', { vehicleId, category: 'Engine problem', search: vehicleReg });
    } else if (type === 'Breakdown') {
      if (showToast) showToast(`Redirecting to Vehicle Problems & Breakdown for ${vehicleReg || 'fleet'}...`, 'info');
      onNavigate('problems', { vehicleId, category: 'Brake problem', search: vehicleReg });
    } else if (type === 'Loading' || type === 'Unloading') {
      if (showToast) showToast(`Redirecting to ${type} Reports for ${vehicleReg || 'fleet'}...`, 'info');
      onNavigate('reports', { reportType: 'daily_operations', search: vehicleReg });
    }
  };

  // Helper for row or badge redirect
  const handleRedirectFromActivity = (act) => {
    if (!onNavigate) return;
    const type = act.activity_type;
    const regNumber = act.reg_number;
    const vehicleId = act.vehicle_id;

    if (type === 'Breakdown' || type === 'Maintenance') {
      onNavigate('problems', { vehicleId, category: type === 'Breakdown' ? 'Brake problem' : 'Engine problem', search: regNumber });
    } else if (type === 'Halting' || type === 'Waiting' || type === 'Other') {
      onNavigate('stoppages', { vehicleId, reason: type === 'Waiting' ? 'Waiting for Loading / Papers' : type, search: regNumber });
    } else if (type === 'Loading' || type === 'Unloading') {
      onNavigate('reports', { reportType: 'daily_operations', search: regNumber });
    } else {
      onNavigate('dashboard', { search: regNumber });
    }
  };

  // When vehicle changes, auto-populate its existing location if available
  const handleVehicleChange = (vId) => {
    setSelectedVehicleId(vId);
    const v = vehicles.find(item => String(item.id) === String(vId));
    if (v && v.current_location) {
      setLocation(v.current_location);
    }
  };

  // Voice Input (Web Speech API)
  const handleToggleVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (showToast) showToast('Voice recognition not supported in this browser. Please use Chrome or Edge.', 'warning');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        if (showToast) showToast('Listening... Speak operation remarks now', 'info');
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setDescription(prev => (prev ? `${prev} ${transcript}` : transcript));
        if (showToast) showToast(`Added voice notes: "${transcript}"`, 'success');
      };

      recognition.onerror = (e) => {
        setIsListening(false);
        if (showToast) showToast(`Voice input error: ${e.error}`, 'error');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      setIsListening(false);
      if (showToast) showToast('Voice input error: ' + err.message, 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!selectedVehicleId) {
      setFormError('Please select a vehicle from the fleet.');
      return;
    }

    if (!location.trim()) {
      setFormError('Please enter current location.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        vehicle_id: selectedVehicleId,
        report_datetime: new Date(reportDate).toISOString(),
        location: location.trim(),
        activity_type: activityType,
        start_datetime: new Date(startDate).toISOString(),
        end_datetime: endDate ? new Date(endDate).toISOString() : null,
        description: description.trim(),
        photo_url: photoUrl,
        reported_by: reportedBy.trim()
      };

      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record activity');

      if (showToast) showToast(data.message || 'Operation recorded successfully', 'success');
      setDescription('');
      setPhotoUrl(null);

      // Refresh list
      const aRes = await fetch('/api/activities');
      setActivities(await aRes.json());
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete activity
  const handleDeleteActivity = async (id, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this recorded operation?')) return;

    try {
      const res = await fetch(`/api/activities/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        if (showToast) showToast(data.message || 'Operation deleted', 'success');
        setActivities(prev => prev.filter(a => a.id !== id));
        if (selectedActivity && selectedActivity.id === id) {
          setSelectedActivity(null);
        }
      } else {
        if (showToast) showToast(data.error || 'Failed to delete', 'error');
      }
    } catch (err) {
      if (showToast) showToast(err.message, 'error');
    }
  };

  // Save inline edit
  const handleSaveEdit = async () => {
    if (!selectedActivity) return;
    try {
      const res = await fetch(`/api/activities/${selectedActivity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });
      const data = await res.json();
      if (res.ok) {
        if (showToast) showToast('Operation updated successfully', 'success');
        setActivities(prev => prev.map(a => a.id === selectedActivity.id ? { ...a, ...data.activity } : a));
        setSelectedActivity(prev => ({ ...prev, ...data.activity }));
        setIsEditing(false);
      } else {
        if (showToast) showToast(data.error || 'Update failed', 'error');
      }
    } catch (err) {
      if (showToast) showToast(err.message, 'error');
    }
  };

  // Filtered & searched activities
  const filteredActivities = useMemo(() => {
    return activities.filter(a => {
      if (filterVehicle !== 'All' && String(a.vehicle_id) !== String(filterVehicle)) return false;
      if (filterType !== 'All' && a.activity_type !== filterType) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesVeh = (a.reg_number || '').toLowerCase().includes(term);
        const matchesLoc = (a.location || '').toLowerCase().includes(term);
        const matchesDesc = (a.description || '').toLowerCase().includes(term);
        const matchesBy = (a.reported_by || '').toLowerCase().includes(term);
        if (!matchesVeh && !matchesLoc && !matchesDesc && !matchesBy) return false;
      }
      return true;
    });
  }, [activities, filterVehicle, filterType, searchTerm]);

  // Paginated activities
  const totalPages = Math.ceil(filteredActivities.length / pageSize) || 1;
  const paginatedActivities = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredActivities.slice(start, start + pageSize);
  }, [filteredActivities, currentPage, pageSize]);

  return (
    <div className="content-body" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Header */}
      <div className="section-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="section-title">Daily Operations Entry</h1>
          <p className="section-desc">
            Quick operational reporting for vehicles: log transit, halts, loadings, maintenance and breakdowns
          </p>
        </div>
      </div>

      {/* QUICK OPERATIONAL ENTRY CARD */}
      <div className="card" style={{ borderLeft: '4px solid #2563eb', padding: '22px' }}>
        <form onSubmit={handleSubmit}>
          {/* Row 1: Vehicle Selector & Auto-Populated Specs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '18px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: '700', color: '#1e293b' }}>
                Select Vehicle <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                className="form-control"
                value={selectedVehicleId}
                onChange={e => handleVehicleChange(e.target.value)}
                style={{ fontSize: '14px', fontWeight: '700', padding: '9px 12px' }}
                required
              >
                {vehicles.length === 0 ? (
                  <option value="">-- No vehicles in fleet master --</option>
                ) : (
                  vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.reg_number} — ({v.vehicle_type}) [{v.operational_status}]
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Auto-Populated Vehicle Details Display */}
            {selectedVehicleObj && (
              <div 
                onClick={() => onNavigate && onNavigate('vehicles', { vehicleReg: selectedVehicleObj.reg_number })}
                style={{
                  padding: '12px 16px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer'
                }}
                className="hover-table-row"
                title="Click to open Vehicle Master"
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Truck size={20} />
                </div>
                <div style={{ flex: 1, lineHeight: '1.3' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Auto-Populated from Master:</span>
                    <span style={{ color: '#2563eb', fontWeight: '700' }}>Open Master ↗</span>
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a' }}>
                    {selectedVehicleObj.manufacturer} {selectedVehicleObj.model} ({selectedVehicleObj.vehicle_type})
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '2px' }}>
                    Owner: {selectedVehicleObj.owner_name || 'Fleet'} • Status:{' '}
                    <strong style={{ color: selectedVehicleObj.operational_status === 'Operating' ? '#10b981' : '#dc2626' }}>
                      {selectedVehicleObj.operational_status}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Row 2: 8 Large Activity Selection Buttons */}
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label" style={{ fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Select Activity Type (Tap large button):
            </label>
            <div className="activity-buttons-grid">
              {ACTIVITY_BUTTONS.map(act => {
                const isSelected = activityType === act.id;
                return (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => handleRedirectOperation(act.id)}
                    style={{
                      padding: '14px 10px',
                      borderRadius: '8px',
                      border: isSelected ? `2px solid ${act.color}` : '1px solid #e2e8f0',
                      background: isSelected ? act.bg : '#ffffff',
                      color: isSelected ? act.color : '#334155',
                      boxShadow: isSelected ? `0 4px 10px ${act.color}25` : '0 1px 2px rgba(0,0,0,0.03)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                    title={`Click to open ${act.label} for ${selectedVehicleObj?.reg_number || 'fleet'}`}
                  >
                    <span style={{ fontSize: '24px' }}>{act.icon}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: isSelected ? '800' : '600' }}>
                      {act.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Location, Dates, and Driver Information */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: '600' }}>
                Current Location <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Tumkur Bypass, Nelamangala Hub"
                value={location}
                onChange={e => setLocation(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: '600' }}>Report Date & Time</label>
              <input
                type="datetime-local"
                className="form-control"
                value={reportDate}
                onChange={e => setReportDate(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: '600' }}>Activity Start Time</label>
              <input
                type="datetime-local"
                className="form-control"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: '600' }}>Information Provided By</label>
              <input
                type="text"
                className="form-control"
                placeholder="Driver Ravi Shankar"
                value={reportedBy}
                onChange={e => setReportedBy(e.target.value)}
              />
            </div>
          </div>

          {/* Row 4: Remarks with Voice Input Button */}
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0, fontWeight: '600' }}>
                Description / Remarks (Optional)
              </label>
              <button
                type="button"
                onClick={handleToggleVoice}
                style={{
                  background: isListening ? '#fef2f2' : '#f8fafc',
                  border: isListening ? '1px solid #fecaca' : '1px solid #cbd5e1',
                  color: isListening ? '#dc2626' : '#2563eb',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {isListening ? <MicOff size={14} className="spin" /> : <Mic size={14} />}
                <span>{isListening ? 'Listening (Stop)...' : 'Voice Input (English)'}</span>
              </button>
            </div>
            <textarea
              className="form-control"
              placeholder="e.g. Loaded 15 tons machinery, departed toward Chennai at 11:30 AM"
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ minHeight: '65px' }}
            />
          </div>

          {/* Row 5: Optional Photo Attachment */}
          <PhotoUpload
            currentPhoto={photoUrl}
            onPhotoUploaded={setPhotoUrl}
            label="Optional Cargo / Location Photo Attachment"
          />

          {formError && (
            <div style={{
              marginTop: '14px', padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '8px', color: '#991b1b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          {/* Submit Button */}
          <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
              style={{ padding: '9px 24px', fontSize: '0.9rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Check size={16} /> {saving ? 'Recording Operation...' : 'Record Activity Now'}
            </button>
          </div>
        </form>
      </div>

      {/* RECORDED OPERATIONS LOG TABLE */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 className="card-title">Recorded Daily Operations Log</h3>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Showing {filteredActivities.length} operational records • Click any row to view full details
            </p>
          </div>

          {/* Search & Filters */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '9px' }} />
              <input
                type="text"
                placeholder="Search vehicle, location, driver..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                style={{ padding: '6px 10px 6px 30px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', width: '200px' }}
              />
            </div>

            <select
              className="filter-select"
              value={filterVehicle}
              onChange={e => { setFilterVehicle(e.target.value); setCurrentPage(1); }}
              style={{ maxWidth: '150px' }}
            >
              <option value="All">All Vehicles</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.reg_number}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={filterType}
              onChange={e => { setFilterType(e.target.value); setCurrentPage(1); }}
              style={{ maxWidth: '140px' }}
            >
              <option value="All">All Activities</option>
              {ACTIVITY_BUTTONS.map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
              <option value="In-Transit">In-Transit</option>
            </select>

            <button
              className="btn-secondary"
              onClick={fetchInitialData}
              title="Refresh Operations"
              style={{ padding: '6px 10px', fontSize: '0.82rem' }}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Mobile Table Scroll Hint */}
        <div className="mobile-table-hint">
          <span>⟷ Swipe left/right to view all activity columns</span>
        </div>

        {/* Table */}
        <div className="table-responsive">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px' }}>Date & Time</th>
                <th style={{ padding: '10px 14px' }}>Vehicle Number</th>
                <th style={{ padding: '10px 14px' }}>Activity</th>
                <th style={{ padding: '10px 14px' }}>Location</th>
                <th style={{ padding: '10px 14px' }}>Remarks / Cargo</th>
                <th style={{ padding: '10px 14px' }}>Driver</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedActivities.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    {loading ? 'Loading operations...' : 'No activity records found matching filters.'}
                  </td>
                </tr>
              ) : (
                paginatedActivities.map(act => (
                  <tr 
                    key={act.id}
                    onClick={() => {
                      setSelectedActivity(act);
                      setIsEditing(false);
                      setEditFormData({
                        location: act.location,
                        activity_type: act.activity_type,
                        description: act.description,
                        reported_by: act.reported_by
                      });
                    }}
                    style={{ cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                    className="hover-table-row"
                    title="Click to view details"
                  >
                    <td style={{ whiteSpace: 'nowrap', color: '#475569', fontSize: '0.82rem', padding: '10px 14px' }}>
                      {act.report_datetime ? act.report_datetime.replace('T', ' ').slice(0, 16) : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate && onNavigate('vehicles', { vehicleReg: act.reg_number });
                        }}
                        style={{
                          fontWeight: '700',
                          color: '#1e3a8a',
                          background: '#eff6ff',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: '1px solid #bfdbfe',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.82rem'
                        }}
                        title="Click to view vehicle master"
                      >
                        <Truck size={12} color="#2563eb" />
                        <span>{act.reg_number}</span>
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRedirectFromActivity(act);
                        }}
                        className="badge" 
                        style={{
                          backgroundColor: act.activity_type === 'Loading' ? '#fef3c7' : act.activity_type === 'In-Transit' || act.activity_type === 'Travelling' ? '#eff6ff' : act.activity_type === 'Breakdown' ? '#fef2f2' : '#ecfdf5',
                          color: act.activity_type === 'Loading' ? '#92400e' : act.activity_type === 'In-Transit' || act.activity_type === 'Travelling' ? '#1e40af' : act.activity_type === 'Breakdown' ? '#b91c1c' : '#065f46',
                          fontSize: '0.78rem',
                          cursor: 'pointer'
                        }}
                        title={`Click to redirect to ${act.activity_type}`}
                      >
                        {act.activity_type}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#334155' }}>
                        <MapPin size={12} color="#64748b" />
                        <span>{act.location}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {act.description || '-'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {act.reported_by || '-'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRedirectFromActivity(act);
                          }}
                          style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            color: '#1e40af',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontWeight: '600'
                          }}
                          title={`Redirect to ${act.activity_type}`}
                        >
                          <Navigation size={11} /> Redirect
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedActivity(act);
                            setIsEditing(false);
                            setEditFormData({
                              location: act.location,
                              activity_type: act.activity_type,
                              description: act.description,
                              reported_by: act.reported_by
                            });
                          }}
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            color: '#334155',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                          title="View Details"
                        >
                          <Eye size={12} /> View
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleDeleteActivity(act.id, e)}
                          style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            color: '#dc2626',
                            cursor: 'pointer'
                          }}
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div style={{
          padding: '12px 18px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.82rem',
          color: '#64748b',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div>
            Showing <strong>{((currentPage - 1) * pageSize) + 1}</strong> to <strong>{Math.min(currentPage * pageSize, filteredActivities.length)}</strong> of <strong>{filteredActivities.length}</strong> activities
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                background: currentPage === 1 ? '#f1f5f9' : '#ffffff',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span>Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong></span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                background: currentPage >= totalPages ? '#f1f5f9' : '#ffffff',
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Detail & Edit Modal */}
      {selectedActivity && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '540px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Activity size={20} color="#2563eb" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#0f172a' }}>
                    Operation: {selectedActivity.reg_number}
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    {selectedActivity.vehicle_type}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedActivity(null)}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              {!isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Activity Type</div>
                      <span className="badge" style={{ fontSize: '0.85rem', fontWeight: '700', marginTop: '2px', background: '#dbeafe', color: '#1e40af' }}>
                        {selectedActivity.activity_type}
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Reported Time</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#0f172a' }}>
                        {selectedActivity.report_datetime?.replace('T', ' ').slice(0, 16)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Location</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={14} color="#2563eb" />
                      <span>{selectedActivity.location}</span>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Remarks / Cargo</div>
                    <div style={{ fontSize: '0.9rem', color: '#334155', background: '#f8fafc', padding: '10px', borderRadius: '6px', marginTop: '4px' }}>
                      {selectedActivity.description || 'No additional remarks recorded.'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Reported By</div>
                    <div style={{ fontSize: '0.88rem', color: '#0f172a' }}>
                      {selectedActivity.reported_by || 'Driver'}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Location</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editFormData.location || ''}
                      onChange={e => setEditFormData({ ...editFormData, location: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Activity Type</label>
                    <select
                      className="form-control"
                      value={editFormData.activity_type || 'Travelling'}
                      onChange={e => setEditFormData({ ...editFormData, activity_type: e.target.value })}
                    >
                      {ACTIVITY_BUTTONS.map(b => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      value={editFormData.description || ''}
                      onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              {!isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                  >
                    <Edit3 size={14} /> Edit Entry
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedActivity(null)}
                    className="btn-primary"
                    style={{ fontSize: '0.82rem' }}
                  >
                    Close
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="btn-secondary"
                    style={{ fontSize: '0.82rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="btn-primary"
                    style={{ fontSize: '0.82rem' }}
                  >
                    Save Changes
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
