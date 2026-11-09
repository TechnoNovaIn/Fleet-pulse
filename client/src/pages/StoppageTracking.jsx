import React, { useState, useEffect } from 'react';
import { 
  Clock, Plus, Search, Filter, CheckCircle2, AlertTriangle, 
  Play, RotateCcw, Calendar, MapPin, X, Check, Edit, RefreshCw 
} from 'lucide-react';

const getCurrentDateTimeSlice = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toInputFormat = (val) => {
  if (!val) return '';
  try {
    const d = new Date(typeof val === 'string' ? val.replace(' ', 'T') : val);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) {
    return '';
  }
};

const safeFormatDateTime = (val) => {
  if (!val) return '-';
  try {
    const d = new Date(typeof val === 'string' ? val.replace(' ', 'T') : val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString('en-IN', {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return String(val);
  }
};

export default function StoppageTracking({ t = {}, showToast = () => {}, lang, onNavigate, navParams }) {
  const [stoppages, setStoppages] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [openProblems, setOpenProblems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (navParams?.vehicleId) {
      setCreateForm(prev => ({
        ...prev,
        vehicle_id: String(navParams.vehicleId),
        reason: navParams.reason || 'Halting / Planned Stoppage'
      }));
      setCreateModalOpen(true);
    } else if (navParams?.vehicleReg) {
      setSearch(navParams.vehicleReg);
    } else if (navParams?.search) {
      setSearch(navParams.search);
    }
  }, [navParams]);

  // Filters
  const [statusFilter, setStatusFilter] = useState('All');
  const [vehicleFilter, setVehicleFilter] = useState('All');
  const [search, setSearch] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [restartModalOpen, setRestartModalOpen] = useState(false);
  const [editDateModalOpen, setEditDateModalOpen] = useState(false);

  const [activeStoppage, setActiveStoppage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Create Form State
  const [createForm, setCreateForm] = useState({
    vehicle_id: '',
    start_datetime: getCurrentDateTimeSlice(),
    location: '',
    reason: 'Breakdown / Mechanical Failure',
    related_problem_id: '',
    action_taken: '',
    expected_restart_datetime: '',
    remarks: ''
  });

  // Restart Form State
  const [restartForm, setRestartForm] = useState({
    actual_restart_datetime: getCurrentDateTimeSlice(),
    action_taken: '',
    remarks: '',
    restore_vehicle_status: 'Operating'
  });

  // Edit Date Form State
  const [editDateForm, setEditDateForm] = useState({
    start_datetime: '',
    expected_restart_datetime: '',
    actual_restart_datetime: '',
    location: '',
    reason: '',
    action_taken: '',
    remarks: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'All') params.append('status', statusFilter);
      if (vehicleFilter !== 'All') params.append('vehicle_id', vehicleFilter);
      if (search) params.append('search', search);

      const [sRes, vRes, pRes] = await Promise.all([
        fetch(`/api/stoppages?${params.toString()}`),
        fetch('/api/vehicles'),
        fetch('/api/problems?status=Open')
      ]);

      setStoppages(await sRes.json());
      const vData = await vRes.json();
      setVehicles(vData);
      setOpenProblems(await pRes.json());

      if (vData.length > 0 && !createForm.vehicle_id) {
        setCreateForm(prev => ({ ...prev, vehicle_id: vData[0].id }));
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh stoppage logs to reflect background auto-sync updates
    const interval = setInterval(() => {
      fetchData();
    }, 45000);
    return () => clearInterval(interval);
  }, [statusFilter, vehicleFilter, search]);

  const handleOpenCreate = () => {
    setModalError('');
    setCreateForm({
      vehicle_id: vehicles[0]?.id || '',
      start_datetime: getCurrentDateTimeSlice(),
      location: '',
      reason: 'Breakdown / Mechanical Failure',
      related_problem_id: '',
      action_taken: '',
      expected_restart_datetime: '',
      remarks: ''
    });
    setCreateModalOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!createForm.location.trim()) {
      setModalError('Please enter the stoppage location.');
      return;
    }

    if (!createForm.reason.trim()) {
      setModalError('Please enter a reason for stoppage.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/stoppages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          start_datetime: new Date(createForm.start_datetime).toISOString(),
          expected_restart_datetime: createForm.expected_restart_datetime ? new Date(createForm.expected_restart_datetime).toISOString() : null,
          related_problem_id: createForm.related_problem_id || null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record stoppage');

      showToast(data.message, 'success');
      setCreateModalOpen(false);
      fetchData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenRestart = (s) => {
    setActiveStoppage(s);
    setRestartForm({
      actual_restart_datetime: getCurrentDateTimeSlice(),
      action_taken: s.action_taken || '',
      remarks: '',
      restore_vehicle_status: 'Operating'
    });
    setModalError('');
    setRestartModalOpen(true);
  };

  const handleRestartSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    setSaving(true);

    try {
      const res = await fetch(`/api/stoppages/${activeStoppage.id}/restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actual_restart_datetime: new Date(restartForm.actual_restart_datetime).toISOString(),
          action_taken: restartForm.action_taken,
          remarks: restartForm.remarks,
          restore_vehicle_status: restartForm.restore_vehicle_status
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record restart');

      showToast(data.message, 'success');
      setRestartModalOpen(false);
      fetchData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEditDate = (s) => {
    setActiveStoppage(s);
    setEditDateForm({
      start_datetime: toInputFormat(s.start_datetime),
      expected_restart_datetime: toInputFormat(s.expected_restart_datetime),
      actual_restart_datetime: toInputFormat(s.actual_restart_datetime),
      location: s.location || '',
      reason: s.reason || '',
      action_taken: s.action_taken || '',
      remarks: s.remarks || ''
    });
    setModalError('');
    setEditDateModalOpen(true);
  };

  const handleEditDateSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    setSaving(true);

    try {
      const res = await fetch(`/api/stoppages/${activeStoppage.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_datetime: editDateForm.start_datetime ? new Date(editDateForm.start_datetime).toISOString() : null,
          expected_restart_datetime: editDateForm.expected_restart_datetime ? new Date(editDateForm.expected_restart_datetime).toISOString() : null,
          actual_restart_datetime: editDateForm.actual_restart_datetime ? new Date(editDateForm.actual_restart_datetime).toISOString() : null,
          location: editDateForm.location,
          reason: editDateForm.reason,
          action_taken: editDateForm.action_taken,
          remarks: editDateForm.remarks
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to correct stoppage');

      showToast(data.message, 'success');
      setEditDateModalOpen(false);
      fetchData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content-body">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title">{t?.stoppages?.title || t?.stoppage?.title || 'Vehicle Stoppage Tracking'}</h1>
          <p className="section-desc">{t?.stoppages?.subtitle || t?.stoppage?.subtitle || 'Track and resolve halts, delays, and breakdowns with real-time duration counters'}</p>
        </div>
        <button className="btn-primary" onClick={handleOpenCreate}>
          <Plus size={16} /> {t?.stoppages?.logStoppage || t?.stoppage?.logStoppage || t?.stoppages?.recordStoppage || 'Record Stoppage'}
        </button>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            className="search-input"
            placeholder="Search stoppages by vehicle number, location, reason..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="All">All Stoppages (Ongoing First)</option>
          <option value="Ongoing">Ongoing Stoppages Only</option>
          <option value="Ended">Ended / Completed</option>
        </select>

        <select
          className="filter-select"
          value={vehicleFilter}
          onChange={e => setVehicleFilter(e.target.value)}
        >
          <option value="All">All Vehicles</option>
          {vehicles.map(v => (
            <option key={v.id} value={v.id}>{v.reg_number}</option>
          ))}
        </select>

        <button className="btn-secondary" onClick={fetchData}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Mobile Table Scroll Hint */}
      <div className="mobile-table-hint">
        <span>⟷ Swipe left/right to view all stoppage columns</span>
      </div>

      {/* Table */}
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Vehicle Number</th>
              <th>Vehicle Type</th>
              <th>Location</th>
              <th>Stoppage Start</th>
              <th>Days Stopped</th>
              <th>Reason</th>
              <th>Expected Restart</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stoppages.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                  {loading ? 'Loading stoppages...' : (t?.common?.noRecords || 'No records found matching your filters.')}
                </td>
              </tr>
            ) : (
              stoppages.map(s => {
                const isOngoing = s.status === 'Ongoing';
                const isLong = (s.stopped_days || 0) >= 3 || s.is_long_pending;
                return (
                  <tr key={s.id} style={{ backgroundColor: isLong ? '#fff5f5' : isOngoing ? '#fffbfb' : 'transparent' }}>
                    <td>
                      <span style={{ fontWeight: '700', color: '#1e3a8a', background: '#eff6ff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                        {s.reg_number || 'N/A'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: '#475569' }}>
                      {s.vehicle_type || '-'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}>
                        <MapPin size={12} color="#64748b" />
                        <span>{s.location || 'Unknown'}</span>
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: '#475569', fontSize: '0.82rem' }}>
                      {safeFormatDateTime(s.start_datetime)}
                    </td>
                    <td>
                      <span className={`badge`} style={{
                        background: isLong ? '#fee2e2' : '#fef3c7',
                        color: isLong ? '#991b1b' : '#92400e',
                        fontWeight: '700',
                        fontSize: '0.78rem'
                      }}>
                        <Clock size={11} style={{ marginRight: '3px' }} />
                        {s.stopped_days ? `${s.stopped_days} days` : s.duration_text || '1 day'}
                      </span>
                    </td>
                    <td style={{ maxWidth: '220px' }}>
                      <span style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.84rem' }}>{s.reason || 'Stoppage'}</span>
                      {s.problem_category && (
                        <div style={{ fontSize: '11px', color: '#b91c1c' }}>
                          Linked Issue: {s.problem_category}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                      {safeFormatDateTime(s.expected_restart_datetime)}
                    </td>
                    <td>
                      <span className={`badge badge-${s.status === 'Ongoing' ? 'stopped' : 'operating'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {isOngoing && (
                          <button
                            className="btn-success"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                            onClick={() => handleOpenRestart(s)}
                          >
                            <Play size={13} /> End / Restart
                          </button>
                        )}
                        <button
                          className="btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          onClick={() => handleOpenEditDate(s)}
                          title="Correct Dates & Details"
                        >
                          <Edit size={13} /> Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Record Stoppage Modal */}
      {createModalOpen && (
        <div className="modal-overlay" onClick={() => setCreateModalOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Record Vehicle Stoppage</h3>
              <button className="modal-close-btn" onClick={() => setCreateModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body">
                {modalError && (
                  <div style={{
                    padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                    borderRadius: '8px', color: '#991b1b', fontSize: '13px'
                  }}>
                    {modalError}
                  </div>
                )}

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Select Vehicle <span style={{ color: '#ef4444' }}>*</span></label>
                    <select
                      className="form-control"
                      value={createForm.vehicle_id}
                      onChange={e => setCreateForm({ ...createForm, vehicle_id: e.target.value })}
                      required
                    >
                      {vehicles.length === 0 ? (
                        <option value="">-- No vehicles in Master (Upload master data first) --</option>
                      ) : (
                        vehicles.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.reg_number} ({v.vehicle_type}) - Status: {v.operational_status}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Stoppage Location <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. NH4 KM 82 Toll Plaza"
                      value={createForm.location}
                      onChange={e => setCreateForm({ ...createForm, location: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Stoppage Start Date & Time <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={createForm.start_datetime}
                      onChange={e => setCreateForm({ ...createForm, start_datetime: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Expected Restart Time (Optional)</label>
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={createForm.expected_restart_datetime}
                      onChange={e => setCreateForm({ ...createForm, expected_restart_datetime: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Reason for Stoppage <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Radial tyre puncture, clutch failure, driver rest, loading delay"
                    value={createForm.reason}
                    onChange={e => setCreateForm({ ...createForm, reason: e.target.value })}
                    required
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Note: Normal loading/unloading or driver rest is tracked separately from breakdown.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Link Related Problem Ticket (Optional)</label>
                  <select
                    className="form-control"
                    value={createForm.related_problem_id}
                    onChange={e => setCreateForm({ ...createForm, related_problem_id: e.target.value })}
                  >
                    <option value="">-- No Related Problem Ticket --</option>
                    {openProblems.map(p => (
                      <option key={p.id} value={p.id}>
                        Ticket #{p.id}: {p.reg_number} - {p.category} ({p.priority})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Action Taken / Remarks</label>
                  <textarea
                    className="form-control"
                    placeholder="Immediate action taken or roadside parking remarks"
                    value={createForm.action_taken}
                    onChange={e => setCreateForm({ ...createForm, action_taken: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Start Stoppage Tracking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Restart Modal */}
      {restartModalOpen && activeStoppage && (
        <div className="modal-overlay" onClick={() => setRestartModalOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Record Restart & Restore Vehicle</h3>
              <button className="modal-close-btn" onClick={() => setRestartModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleRestartSubmit}>
              <div className="modal-body">
                {modalError && (
                  <div style={{
                    padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                    borderRadius: '8px', color: '#991b1b', fontSize: '13px'
                  }}>
                    {modalError}
                  </div>
                )}

                <div style={{
                  padding: '12px 14px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0',
                  borderRadius: '8px', color: '#065f46', fontSize: '13px'
                }}>
                  Vehicle: <strong>{activeStoppage.reg_number || 'N/A'}</strong><br />
                  Stoppage Start: {safeFormatDateTime(activeStoppage.start_datetime)}<br />
                  Elapsed Duration: <strong>{activeStoppage.duration_text || '-'}</strong>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Actual Restart Date & Time <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={restartForm.actual_restart_datetime}
                    onChange={e => setRestartForm({ ...restartForm, actual_restart_datetime: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Final Action Taken & Resolution</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Tyres replaced and torqued, vehicle departed toward hub"
                    value={restartForm.action_taken}
                    onChange={e => setRestartForm({ ...restartForm, action_taken: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Vehicle Status After Restart</label>
                  <select
                    className="form-control"
                    value={restartForm.restore_vehicle_status}
                    onChange={e => setRestartForm({ ...restartForm, restore_vehicle_status: e.target.value })}
                  >
                    <option value="Operating">Operating (Ready for trip)</option>
                    <option value="Under Maintenance">Under Maintenance (Transit to workshop)</option>
                    <option value="Idle">Idle (Parked at yard)</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setRestartModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-success" disabled={saving}>
                  <Check size={16} /> Confirm Restart & Close Stoppage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Date & Details Modal (Section 7 Rule: Allow correction of incorrect dates with validation) */}
      {editDateModalOpen && activeStoppage && (
        <div className="modal-overlay" onClick={() => setEditDateModalOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Correct Stoppage #{activeStoppage.id} Dates</h3>
              <button className="modal-close-btn" onClick={() => setEditDateModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleEditDateSubmit}>
              <div className="modal-body">
                {modalError && (
                  <div style={{
                    padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                    borderRadius: '8px', color: '#991b1b', fontSize: '13px'
                  }}>
                    {modalError}
                  </div>
                )}

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Start Date & Time</label>
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={editDateForm.start_datetime}
                      onChange={e => setEditDateForm({ ...editDateForm, start_datetime: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Actual Restart Date & Time</label>
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={editDateForm.actual_restart_datetime}
                      onChange={e => setEditDateForm({ ...editDateForm, actual_restart_datetime: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Location</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editDateForm.location}
                      onChange={e => setEditDateForm({ ...editDateForm, location: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Reason</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editDateForm.reason}
                      onChange={e => setEditDateForm({ ...editDateForm, reason: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Action Taken / Remarks</label>
                  <textarea
                    className="form-control"
                    value={editDateForm.action_taken}
                    onChange={e => setEditDateForm({ ...editDateForm, action_taken: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditDateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  Save Date Corrections
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
