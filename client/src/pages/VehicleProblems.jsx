import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, Plus, Search, Filter, CheckCircle2, Clock, 
  History, User, MapPin, Check, X, Camera, AlertCircle, RefreshCw 
} from 'lucide-react';
import PhotoUpload from '../components/PhotoUpload';

const CATEGORIES = [
  'Tyre problem',
  'Engine problem',
  'Battery problem',
  'Brake problem',
  'Accident or safety issue',
  'Loading or unloading delay',
  'Document issue',
  'Driver-related issue',
  'Other'
];

export default function VehicleProblems({ t, showToast, lang, onNavigate, navParams }) {
  const [problems, setProblems] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (navParams?.vehicleId) {
      setCreateForm(prev => ({
        ...prev,
        vehicle_id: String(navParams.vehicleId),
        category: navParams.category || 'Other'
      }));
      setCreateModalOpen(true);
    } else if (navParams?.vehicleReg) {
      setSearch(navParams.vehicleReg);
    } else if (navParams?.search) {
      setSearch(navParams.search);
    }
  }, [navParams]);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedPriority, setSelectedPriority] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Selected item for action/resolve/history
  const [activeProblem, setActiveProblem] = useState(null);
  const [historyList, setHistoryList] = useState([]);

  // Create Form State
  const [createForm, setCreateForm] = useState({
    vehicle_id: '',
    category: 'Tyre problem',
    priority: 'Medium',
    description: '',
    location: '',
    photo_url: null,
    reported_by: 'Driver / Process Handler',
    assigned_to: '',
    action_taken: '',
    create_stoppage_too: true
  });

  // Action update form
  const [actionData, setActionData] = useState({
    action_taken: '',
    assigned_to: '',
    priority: '',
    status_change: ''
  });

  // Resolve form
  const [resolveData, setResolveData] = useState({
    resolution_notes: '',
    action_taken: '',
    confirm_resolution: false
  });

  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedStatus !== 'All') params.append('status', selectedStatus);
      if (selectedPriority !== 'All') params.append('priority', selectedPriority);
      if (selectedCategory !== 'All') params.append('category', selectedCategory);

      const [pRes, vRes] = await Promise.all([
        fetch(`/api/problems?${params.toString()}`),
        fetch('/api/vehicles')
      ]);

      const pData = await pRes.json();
      const vData = await vRes.json();
      setProblems(pData);
      setVehicles(vData);

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
  }, [search, selectedStatus, selectedPriority, selectedCategory]);

  const handleOpenCreate = () => {
    setModalError('');
    setCreateForm({
      vehicle_id: vehicles[0]?.id || '',
      category: 'Tyre problem',
      priority: 'Medium',
      description: '',
      location: '',
      photo_url: null,
      reported_by: 'Driver / Process Handler',
      assigned_to: '',
      action_taken: '',
      create_stoppage_too: true
    });
    setCreateModalOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!createForm.description.trim()) {
      setModalError('Please describe the problem details.');
      return;
    }

    if (!createForm.location.trim()) {
      setModalError('Please specify the incident location.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create problem ticket');

      showToast(data.message, 'success');
      setCreateModalOpen(false);
      fetchData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAction = (p) => {
    setActiveProblem(p);
    setActionData({
      action_taken: p.action_taken || '',
      assigned_to: p.assigned_to || '',
      priority: p.priority,
      status_change: p.status === 'Open' ? 'In Progress' : p.status
    });
    setModalError('');
    setActionModalOpen(true);
  };

  const handleActionSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/problems/${activeProblem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update action');

      showToast(data.message, 'success');
      setActionModalOpen(false);
      fetchData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenResolve = (p) => {
    setActiveProblem(p);
    setResolveData({
      resolution_notes: '',
      action_taken: p.action_taken || '',
      confirm_resolution: false
    });
    setModalError('');
    setResolveModalOpen(true);
  };

  const handleResolveSubmit = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!resolveData.confirm_resolution) {
      setModalError('Please confirm the resolution checkbox before marking this ticket resolved.');
      return;
    }

    if (!resolveData.resolution_notes.trim()) {
      setModalError('Please enter final resolution notes describing how the problem was resolved.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/problems/${activeProblem.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolveData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resolve problem');

      showToast(data.message, 'success');
      setResolveModalOpen(false);
      fetchData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenHistory = async (p) => {
    setActiveProblem(p);
    try {
      const res = await fetch(`/api/problems/${p.id}`);
      const data = await res.json();
      setHistoryList(data.history || []);
      setHistoryModalOpen(true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="content-body">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title">{t.problems.title}</h1>
          <p className="section-desc">Track reported vehicle breakdowns, tyres, engine defects, and follow up verified solutions</p>
        </div>
        <button className="btn-primary" onClick={handleOpenCreate}>
          <Plus size={16} /> {t.problems.logProblem}
        </button>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            className="search-input"
            placeholder="Search problems by vehicle, location, technician..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value)}
        >
          <option value="All">All Statuses (Unresolved First)</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
          <option value="Closed">Closed</option>
        </select>

        <select
          className="filter-select"
          value={selectedPriority}
          onChange={e => setSelectedPriority(e.target.value)}
        >
          <option value="All">All Priorities</option>
          <option value="Urgent">Urgent</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <select
          className="filter-select"
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
        >
          <option value="All">All Categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <button className="btn-secondary" onClick={fetchData}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Mobile Table Scroll Hint */}
      <div className="mobile-table-hint">
        <span>⟷ Swipe left/right to view all problem columns</span>
      </div>

      {/* Table */}
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Problem Description</th>
              <th>Vehicle Number</th>
              <th>Reported Date</th>
              <th>Priority</th>
              <th>Action Taken</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {problems.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                  {loading ? 'Loading problems...' : (t?.common?.noRecords || 'No records found matching your filters.')}
                </td>
              </tr>
            ) : (
              problems.map(p => {
                const isUnresolved = p.status === 'Open' || p.status === 'In Progress';
                return (
                  <tr key={p.id} style={{ backgroundColor: p.priority === 'Urgent' && isUnresolved ? '#fff5f5' : 'transparent' }}>
                    <td style={{ maxWidth: '280px' }}>
                      <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.88rem' }}>
                        #{p.id} • {p.category}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
                        {p.description}
                      </div>
                      {p.photo_url && (
                        <a href={p.photo_url} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#2563eb', display: 'inline-block', marginTop: '2px' }}>
                          View Attached Photo
                        </a>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: '700', color: '#1e3a8a', background: '#eff6ff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #bfdbfe', fontSize: '0.84rem' }}>
                        {p.reg_number}
                      </span>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{p.vehicle_type}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: '#475569', fontSize: '0.82rem' }}>
                      {p.created_at ? p.created_at.replace('T', ' ').slice(0, 16) : '-'}
                    </td>
                    <td>
                      <span className={`badge badge-${p.priority.toLowerCase()}`} style={{ fontSize: '0.74rem' }}>
                        {p.priority}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: '#334155', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.action_taken || <span style={{ color: '#94a3b8' }}>No action logged</span>}
                    </td>
                    <td>
                      <span className={`badge badge-${p.status.toLowerCase().replace(/\s+/g, '-')}`} style={{ fontSize: '0.74rem' }}>
                        {p.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {isUnresolved && (
                          <>
                            <button
                              className="btn-secondary"
                              style={{ padding: '5px 10px', fontSize: '12px' }}
                              onClick={() => handleOpenAction(p)}
                              title="Update Action Taken"
                            >
                              Update
                            </button>
                            <button
                              className="btn-success"
                              style={{ padding: '5px 10px', fontSize: '12px' }}
                              onClick={() => handleOpenResolve(p)}
                              title="Confirm Resolution"
                            >
                              <CheckCircle2 size={13} /> Resolve
                            </button>
                          </>
                        )}
                        <button
                          className="btn-secondary"
                          style={{ padding: '5px 8px', fontSize: '12px' }}
                          onClick={() => handleOpenHistory(p)}
                          title="View History Audit Trail"
                        >
                          <History size={13} />
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

      {/* Log Problem Modal */}
      {createModalOpen && (
        <div className="modal-overlay" onClick={() => setCreateModalOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Report New Vehicle Problem</h3>
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
                    <label className="form-label">Vehicle <span style={{ color: '#ef4444' }}>*</span></label>
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
                          <option key={v.id} value={v.id}>{v.reg_number} ({v.vehicle_type})</option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Problem Category <span style={{ color: '#ef4444' }}>*</span></label>
                    <select
                      className="form-control"
                      value={createForm.category}
                      onChange={e => setCreateForm({ ...createForm, category: e.target.value })}
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Priority Level</label>
                    <select
                      className="form-control"
                      value={createForm.priority}
                      onChange={e => setCreateForm({ ...createForm, priority: e.target.value })}
                    >
                      <option value="Urgent">🚨 Urgent (Immediate Breakdown / Safety)</option>
                      <option value="High">⚠️ High Priority</option>
                      <option value="Medium">Medium Priority</option>
                      <option value="Low">Low Priority</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Reported Location <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. NH48 KM 45, Nelamangala"
                      value={createForm.location}
                      onChange={e => setCreateForm({ ...createForm, location: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Problem Description <span style={{ color: '#ef4444' }}>*</span></label>
                  <textarea
                    className="form-control"
                    placeholder="Describe tyre damage, engine noise, overheating symptoms, or driver complaint"
                    value={createForm.description}
                    onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                    required
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Assign Technician / Garage</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Authorized Workshop Hubli"
                      value={createForm.assigned_to}
                      onChange={e => setCreateForm({ ...createForm, assigned_to: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Immediate Action Taken</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Spare wheel mounted, mechanic sent"
                      value={createForm.action_taken}
                      onChange={e => setCreateForm({ ...createForm, action_taken: e.target.value })}
                    />
                  </div>
                </div>

                <PhotoUpload
                  currentPhoto={createForm.photo_url}
                  onPhotoUploaded={url => setCreateForm({ ...createForm, photo_url: url })}
                  label="Attach Defect / Breakdown Photo (Optional)"
                />

                <div style={{
                  padding: '12px 14px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
                  borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                  <input
                    type="checkbox"
                    id="chk_stop"
                    checked={createForm.create_stoppage_too}
                    onChange={e => setCreateForm({ ...createForm, create_stoppage_too: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <label htmlFor="chk_stop" style={{ fontSize: '13px', color: '#1e40af', fontWeight: '600', cursor: 'pointer' }}>
                    Also mark vehicle as Stopped and start duration tracking
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Creating Ticket...' : 'Create Problem Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Action Modal */}
      {actionModalOpen && activeProblem && (
        <div className="modal-overlay" onClick={() => setActionModalOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Update Action: #{activeProblem.id}</h3>
              <button className="modal-close-btn" onClick={() => setActionModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleActionSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '13px', color: '#64748b' }}>
                  Vehicle: <strong>{activeProblem.reg_number}</strong> | Category: <strong>{activeProblem.category}</strong>
                </p>

                <div className="form-group">
                  <label className="form-label">Action Taken So Far</label>
                  <textarea
                    className="form-control"
                    placeholder="e.g. Mechanic reached location, spare part ordered from Pune"
                    value={actionData.action_taken}
                    onChange={e => setActionData({ ...actionData, action_taken: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Assigned Person / Vendor</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Garage or technician name"
                    value={actionData.assigned_to}
                    onChange={e => setActionData({ ...actionData, assigned_to: e.target.value })}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select
                      className="form-control"
                      value={actionData.priority}
                      onChange={e => setActionData({ ...actionData, priority: e.target.value })}
                    >
                      <option value="Urgent">Urgent</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Ticket Status</label>
                    <select
                      className="form-control"
                      value={actionData.status_change}
                      onChange={e => setActionData({ ...actionData, status_change: e.target.value })}
                    >
                      <option value="In Progress">In Progress</option>
                      <option value="Open">Open</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setActionModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Action Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Resolution Modal */}
      {resolveModalOpen && activeProblem && (
        <div className="modal-overlay" onClick={() => setResolveModalOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Confirm Ticket Resolution: #{activeProblem.id}</h3>
              <button className="modal-close-btn" onClick={() => setResolveModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleResolveSubmit}>
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
                  Resolving problem ticket for <strong>{activeProblem.reg_number}</strong>: {activeProblem.category}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Resolution Notes (Final Solution) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    className="form-control"
                    placeholder="e.g. Replacement radial tyre fitted and aligned. Test run passed with driver confirmation."
                    value={resolveData.resolution_notes}
                    onChange={e => setResolveData({ ...resolveData, resolution_notes: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Final Action Taken</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Summary of action"
                    value={resolveData.action_taken}
                    onChange={e => setResolveData({ ...resolveData, action_taken: e.target.value })}
                  />
                </div>

                {/* Explicit confirmation checkbox required by Prompt Section 6 */}
                <div style={{
                  padding: '12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a',
                  borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                  <input
                    type="checkbox"
                    id="chk_confirm_resolve"
                    checked={resolveData.confirm_resolution}
                    onChange={e => setResolveData({ ...resolveData, confirm_resolution: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                    required
                  />
                  <label htmlFor="chk_confirm_resolve" style={{ fontSize: '13px', color: '#92400e', fontWeight: '700', cursor: 'pointer' }}>
                    I confirm that this problem is fully resolved and tested.
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setResolveModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-success" disabled={saving || !resolveData.confirm_resolution}>
                  <Check size={16} /> Confirm & Mark Resolved
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Audit Trail Modal */}
      {historyModalOpen && activeProblem && (
        <div className="modal-overlay" onClick={() => setHistoryModalOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={18} color="#2563eb" />
                <h3 className="modal-title">Audit Trail: Ticket #{activeProblem.id}</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setHistoryModalOpen(false)}><X size={20} /></button>
            </div>

            <div className="modal-body" style={{ gap: '16px' }}>
              <div style={{ fontSize: '13px', color: '#475569' }}>
                Vehicle: <strong>{activeProblem.reg_number}</strong> | Category: <strong>{activeProblem.category}</strong>
              </div>

              {historyList.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '13px' }}>No prior audit entries found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {historyList.map(item => (
                    <div
                      key={item.id}
                      style={{
                        padding: '12px 14px', backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0', borderRadius: '8px',
                        borderLeft: '4px solid #2563eb'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
                          Status: {item.previous_status || 'New'} &rarr; {item.new_status}
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#334155' }}>{item.action_taken}</div>
                      {item.notes && (
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', fontStyle: 'italic' }}>
                          "{item.notes}"
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                        Updated by: {item.updated_by || 'Process Handler'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setHistoryModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
