import React, { useState, useEffect, useRef } from 'react';
import { 
  Truck, Plus, Search, Filter, Edit, Eye, CheckCircle2, 
  AlertCircle, X, Check, RefreshCw, Layers, Upload, Download,
  FileSpreadsheet, AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';

export default function VehicleMaster({ t, showToast, lang, onNavigate, navParams }) {
  const [vehicles, setVehicles] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');

  useEffect(() => {
    if (navParams?.vehicleReg) {
      setSearch(navParams.vehicleReg);
    }
  }, [navParams]);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Import state
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importError, setImportError] = useState('');
  const [parsedVehicles, setParsedVehicles] = useState([]);
  const fileInputRef = useRef(null);

  // Form state
  const [formData, setFormData] = useState({
    reg_number: '',
    owner_name: '',
    vehicle_type: 'Twelve Wheeler',
    manufacturer: 'Mahindra Navistar',
    model: '2012',
    operational_status: 'Operating',
    notes: ''
  });

  const [newTypeName, setNewTypeName] = useState('');

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedType !== 'All') params.append('type', selectedType);
      if (selectedStatus !== 'All') params.append('status', selectedStatus);

      const res = await fetch(`/api/vehicles?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch vehicles');
      const data = await res.json();
      setVehicles(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTypes = async () => {
    try {
      const res = await fetch('/api/vehicles/types');
      if (res.ok) {
        const data = await res.json();
        setTypes(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchTypes();
  }, []);

  useEffect(() => {
    fetchVehicles();
    // Auto-refresh vehicle registry to keep in sync with background auto-sync engine
    const interval = setInterval(() => {
      fetchVehicles();
    }, 45000);
    return () => clearInterval(interval);
  }, [search, selectedType, selectedStatus]);

  const handleOpenAdd = () => {
    setEditingVehicle(null);
    setFormData({
      reg_number: '',
      owner_name: '',
      vehicle_type: types[0]?.name || 'Twelve Wheeler',
      manufacturer: 'Mahindra Navistar',
      model: '',
      operational_status: 'Operating',
      notes: ''
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleOpenEdit = (v) => {
    setEditingVehicle(v);
    setFormData({
      reg_number: v.reg_number,
      owner_name: v.owner_name || '',
      vehicle_type: v.vehicle_type,
      manufacturer: v.manufacturer || '',
      model: v.model || '',
      operational_status: v.operational_status,
      notes: v.notes || ''
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.reg_number.trim()) {
      setFormError('Please enter a vehicle registration number (e.g. KA-01-AB-1234)');
      return;
    }

    if (!formData.vehicle_type) {
      setFormError('Please select a vehicle type (e.g. 25 ft or 40 ft)');
      return;
    }

    setSaving(true);
    try {
      const url = editingVehicle ? `/api/vehicles/${editingVehicle.id}` : '/api/vehicles';
      const method = editingVehicle ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save vehicle');
      }

      showToast(data.message, 'success');
      setModalOpen(false);
      fetchVehicles();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddType = async (e) => {
    e.preventDefault();
    if (!newTypeName.trim()) return;

    try {
      const res = await fetch('/api/vehicles/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTypeName.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add type');
      showToast(`Vehicle type '${data.name}' added successfully`, 'success');
      setNewTypeName('');
      setTypeModalOpen(false);
      fetchTypes();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Download sample import template (.xlsx)
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        '#': 1,
        'Registration Number': 'AP 02 TA 7253',
        'Owner Name': 'G R Raghu',
        'Vehicle Type': 'Twelve Wheeler',
        'Model': '2012',
        'Manufacturer': 'Mahindra Navistar',
        'Operational Status': 'Operating'
      },
      {
        '#': 2,
        'Registration Number': 'AP 02 TB 3799',
        'Owner Name': 'G R Raghu',
        'Vehicle Type': 'Twelve Wheeler',
        'Model': '2013',
        'Manufacturer': 'Mahindra Navistar',
        'Operational Status': 'Operating'
      },
      {
        '#': 3,
        'Registration Number': 'AP 04 TU 1513',
        'Owner Name': 'Ishan Steel Movers',
        'Vehicle Type': 'Trailers',
        'Model': '2012',
        'Manufacturer': 'Mahindra Navistar',
        'Operational Status': 'Operating'
      },
      {
        '#': 4,
        'Registration Number': 'AP 16 TE 5812',
        'Owner Name': 'Balaji Transports',
        'Vehicle Type': 'Fourteen Wheeler',
        'Model': '2018',
        'Manufacturer': 'Eicher Motors Ltd',
        'Operational Status': 'Operating'
      },
      {
        '#': 5,
        'Registration Number': 'AP 16 TS 3555',
        'Owner Name': 'Balaji Transports',
        'Vehicle Type': 'Trailers',
        'Model': '2018',
        'Manufacturer': 'Mahindra Ltd',
        'Operational Status': 'Operating'
      },
      {
        '#': 6,
        'Registration Number': 'AP 24 TB 0819',
        'Owner Name': 'Prathibha L',
        'Vehicle Type': 'Twelve Wheeler',
        'Model': '2012',
        'Manufacturer': 'Mahindra Navistar',
        'Operational Status': 'Operating'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehicle Template');
    XLSX.writeFile(workbook, 'Vehicle_Import_Sample_Template.xlsx');
    showToast('Sample import template downloaded', 'info');
  };

  // Handle file selection and parsing
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportFile(file.name);
    setImportError('');
    setParsedVehicles([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          setImportError('The uploaded file is empty or does not contain recognizable vehicle rows.');
          return;
        }

        const existingRegs = new Set(vehicles.map(v => v.reg_number.toUpperCase()));
        const seenInFile = new Set();

        const validatedRows = rawJson.map((row, index) => {
          const rawReg = row['Registration Number'] || row['Registration No'] || row['registration_number'] || row['reg_number'] || row['Reg Number'] || row['Vehicle Number'] || Object.values(row)[1] || Object.values(row)[0] || '';
          const reg = String(rawReg).trim().toUpperCase().replace(/\s+/g, '-');
          const owner = String(row['Owner Name'] || row['Owner'] || row['owner_name'] || row['owner'] || '').trim();
          const type = String(row['Vehicle Type'] || row['Type'] || row['vehicle_type'] || 'Twelve Wheeler').trim();
          const model = String(row['Model'] || row['model'] || '').trim();
          const mfg = String(row['Manufacturer'] || row['Make'] || row['manufacturer'] || '').trim();
          const status = String(row['Operational Status'] || row['Status'] || row['operational_status'] || 'Operating').trim();
          const notes = String(row['Notes'] || row['notes'] || '').trim();

          let validation = 'valid';
          let validationReason = 'Ready to import';

          if (!reg) {
            validation = 'invalid';
            validationReason = 'Missing registration number';
          } else if (existingRegs.has(reg)) {
            validation = 'duplicate_db';
            validationReason = 'Already registered in fleet';
          } else if (seenInFile.has(reg)) {
            validation = 'duplicate_file';
            validationReason = 'Duplicate inside this file';
          } else {
            seenInFile.add(reg);
          }

          return {
            rowNumber: index + 1,
            reg_number: reg,
            owner_name: owner,
            vehicle_type: type,
            manufacturer: mfg,
            model: model,
            operational_status: status,
            notes: notes,
            validation,
            validationReason
          };
        });

        setParsedVehicles(validatedRows);
      } catch (err) {
        setImportError('Failed to parse file: ' + err.message + '. Please ensure file is a valid .xlsx or .csv.');
      }
    };

    reader.onerror = () => {
      setImportError('Error reading file from disk.');
    };

    reader.readAsBinaryString(file);
  };

  const handleResetImport = () => {
    setParsedVehicles([]);
    setImportFile(null);
    setImportError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExecuteImport = async () => {
    const validRows = parsedVehicles.filter(v => v.validation === 'valid');
    if (validRows.length === 0) {
      showToast('No valid vehicle records to import', 'warning');
      return;
    }

    setImporting(true);
    setImportError('');
    try {
      const res = await fetch('/api/vehicles/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: validRows })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      showToast(data.message, 'success');
      setImportModalOpen(false);
      handleResetImport();
      fetchVehicles();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="content-body">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title">{t.menu.vehicleMaster}</h1>
          <p className="section-desc">Manage fleet master records, specifications, chassis sizes, and operational status</p>
        </div>
        <div className="header-action-buttons">
          <button className="btn-secondary" onClick={() => setImportModalOpen(true)}>
            <Upload size={16} /> Import Vehicles
          </button>
          <button className="btn-secondary" onClick={() => setTypeModalOpen(true)}>
            <Layers size={16} /> Configure Types
          </button>
          <button className="btn-primary" onClick={handleOpenAdd}>
            <Plus size={16} /> Add New Vehicle
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            className="search-input"
            placeholder={t.common.searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={selectedType}
          onChange={e => setSelectedType(e.target.value)}
        >
          <option value="All">All Vehicle Types</option>
          {types.map(tp => (
            <option key={tp.id} value={tp.name}>{tp.name}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value)}
        >
          <option value="All">All Operational Statuses</option>
          <option value="Operating">Operating</option>
          <option value="Stopped">Stopped</option>
          <option value="Under Maintenance">Under Maintenance</option>
          <option value="Idle">Idle</option>
        </select>

        <button className="btn-secondary" onClick={fetchVehicles}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Mobile Table Scroll Hint */}
      <div className="mobile-table-hint">
        <span>⟷ Swipe left/right to view all vehicle columns</span>
      </div>

      {/* Table */}
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Vehicle Number</th>
              <th>Vehicle Type</th>
              <th>Manufacturer</th>
              <th>Model</th>
              <th>Current Status</th>
              <th>Last Updated</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
                  {loading ? (
                    'Loading vehicle master...'
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '44px', height: '44px', borderRadius: '50%',
                        backgroundColor: '#eff6ff', color: '#2563eb',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <Truck size={22} />
                      </div>
                      <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '15px' }}>
                        No Vehicles in Master Matching Search
                      </span>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>
                        Click <strong>"Add New Vehicle"</strong> to register manually, or clear search filters.
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              vehicles.map(v => (
                <tr key={v.id} className="hover-table-row">
                  <td>
                    <span style={{ fontWeight: '700', color: '#1e3a8a', fontSize: '14px', background: '#eff6ff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                      {v.reg_number}
                    </span>
                    {v.owner_name && (
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        {v.owner_name}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#334155', fontSize: '0.78rem' }}>
                      {v.vehicle_type}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.84rem', color: '#1e293b' }}>{v.manufacturer || '-'}</td>
                  <td style={{ fontSize: '0.84rem', color: '#1e293b' }}>{v.model || '-'}</td>
                  <td>
                    <span className={`badge badge-${(v.operational_status || 'Operating').toLowerCase().replace(/\s+/g, '-')}`}>
                      {v.operational_status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {v.updated_at ? v.updated_at.replace('T', ' ').slice(0, 16) : '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '5px 12px', fontSize: '12px' }}
                      onClick={() => handleOpenEdit(v)}
                    >
                      <Edit size={13} /> Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Vehicle Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingVehicle ? `Edit Vehicle: ${editingVehicle.reg_number}` : 'Add New Vehicle to Master'}
              </h3>
              <button className="modal-close-btn" onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && (
                  <div style={{
                    padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                    borderRadius: '8px', color: '#991b1b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px'
                  }}>
                    <AlertCircle size={18} style={{ flexShrink: 0 }} />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">
                      Registration Number <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. AP 02 TA 7253"
                      value={formData.reg_number}
                      onChange={e => setFormData({ ...formData, reg_number: e.target.value.toUpperCase() })}
                      required
                    />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Must be unique across the fleet.</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Owner Name</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. G R Raghu, Balaji Transports"
                      value={formData.owner_name}
                      onChange={e => setFormData({ ...formData, owner_name: e.target.value })}
                    />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Registered vehicle owner / agency.</span>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Vehicle Type <span style={{ color: '#ef4444' }}>*</span></label>
                    <select
                      className="form-control"
                      value={formData.vehicle_type}
                      onChange={e => setFormData({ ...formData, vehicle_type: e.target.value })}
                    >
                      {types.map(tp => (
                        <option key={tp.id} value={tp.name}>{tp.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Operational Status</label>
                    <select
                      className="form-control"
                      value={formData.operational_status}
                      onChange={e => setFormData({ ...formData, operational_status: e.target.value })}
                    >
                      <option value="Operating">Operating</option>
                      <option value="Stopped">Stopped</option>
                      <option value="Under Maintenance">Under Maintenance</option>
                      <option value="Idle">Idle</option>
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Model (Year / Variant)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. 2012, 2018"
                      value={formData.model}
                      onChange={e => setFormData({ ...formData, model: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Manufacturer</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Mahindra Navistar, Eicher Motors Ltd"
                      value={formData.manufacturer}
                      onChange={e => setFormData({ ...formData, manufacturer: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Notes & Specifications</label>
                  <textarea
                    className="form-control"
                    placeholder="Assigned route, permit details, or special cargo configuration"
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingVehicle ? 'Update Vehicle' : 'Add Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Configure Vehicle Types Modal */}
      {typeModalOpen && (
        <div className="modal-overlay" onClick={() => setTypeModalOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Configure Vehicle Types</h3>
              <button className="modal-close-btn" onClick={() => setTypeModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '14px' }}>
                <label className="form-label">Active Vehicle Types:</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                  {types.map(t => (
                    <span key={t.id} className="badge" style={{ backgroundColor: '#eff6ff', color: '#1e40af', padding: '6px 12px' }}>
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>

              <form onSubmit={handleAddType}>
                <div className="form-group">
                  <label className="form-label">Add New Vehicle Type</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. 32 ft MXL, 50 ft"
                      value={newTypeName}
                      onChange={e => setNewTypeName(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap' }}>
                      <Plus size={16} /> Add
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Vehicles Modal */}
      {importModalOpen && (
        <div className="modal-overlay" onClick={() => setImportModalOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '780px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  backgroundColor: '#eff6ff', color: '#2563eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="modal-title">Import Vehicles from File</h3>
                  <p style={{ fontSize: '12px', color: '#64748b' }}>
                    Upload an Excel (.xlsx, .xls) or CSV file to add multiple vehicles at once
                  </p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setImportModalOpen(false)}><X size={20} /></button>
            </div>

            <div className="modal-body">
              {importError && (
                <div style={{
                  padding: '12px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: '8px', color: '#991b1b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <span>{importError}</span>
                </div>
              )}

              {/* Step 1: Template download banner */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: '8px', flexWrap: 'wrap', gap: '10px'
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                    Need the standard column template?
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Download our formatted Excel template with pre-filled sample rows
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '12px' }}
                  onClick={handleDownloadTemplate}
                >
                  <Download size={14} /> Download Sample Template (.xlsx)
                </button>
              </div>

              {/* Step 2: Upload Zone */}
              {parsedVehicles.length === 0 ? (
                <div style={{
                  border: '2px dashed #cbd5e1', borderRadius: '12px',
                  padding: '36px 20px', textAlign: 'center', backgroundColor: '#f8fafc',
                  position: 'relative', cursor: 'pointer', transition: 'all 0.2s ease'
                }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      opacity: 0, cursor: 'pointer', width: '100%', height: '100%'
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '50%',
                      backgroundColor: '#eff6ff', color: '#2563eb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Upload size={24} />
                    </div>
                    <div>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                        Click to select an Excel or CSV file
                      </span>
                      <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        Supports .xlsx, .xls, and .csv spreadsheets
                      </p>
                    </div>
                    <span className="badge" style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#475569' }}>
                      Required Column: Registration Number
                    </span>
                  </div>
                </div>
              ) : (
                /* Step 3: Live Preview Table */
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                        File: {importFile}
                      </span>
                      <span className="badge" style={{ backgroundColor: '#eff6ff', color: '#1e40af' }}>
                        {parsedVehicles.length} row{parsedVehicles.length !== 1 ? 's' : ''} detected
                      </span>
                      <span className="badge" style={{ backgroundColor: '#ecfdf5', color: '#065f46' }}>
                        {parsedVehicles.filter(v => v.validation === 'valid').length} Ready
                      </span>
                      {parsedVehicles.some(v => v.validation !== 'valid') && (
                        <span className="badge badge-urgent">
                          {parsedVehicles.filter(v => v.validation !== 'valid').length} Duplicates / Invalid
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      onClick={handleResetImport}
                    >
                      <X size={13} /> Choose Another File
                    </button>
                  </div>

                  <div className="table-responsive" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>#</th>
                          <th>Registration Number</th>
                          <th>Owner Name</th>
                          <th>Vehicle Type</th>
                          <th>Model</th>
                          <th>Manufacturer</th>
                          <th>Operational Status</th>
                          <th>Validation Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedVehicles.map(v => (
                          <tr key={v.rowNumber} style={{ backgroundColor: v.validation !== 'valid' ? '#fffbfb' : 'transparent' }}>
                            <td style={{ color: '#64748b', fontSize: '11px' }}>{v.rowNumber}</td>
                            <td>
                              <strong style={{ color: v.validation === 'valid' ? '#0f172a' : '#b91c1c' }}>
                                {v.reg_number || '(Empty)'}
                              </strong>
                            </td>
                            <td style={{ color: '#334155', fontWeight: '500' }}>{v.owner_name || '-'}</td>
                            <td>{v.vehicle_type}</td>
                            <td>{v.model || '-'}</td>
                            <td>{v.manufacturer || '-'}</td>
                            <td>
                              <span className="badge" style={{ fontSize: '11px', padding: '2px 8px' }}>
                                {v.operational_status}
                              </span>
                            </td>
                            <td>
                              {v.validation === 'valid' ? (
                                <span className="badge badge-operating" style={{ fontSize: '11px' }}>
                                  <Check size={12} /> {v.validationReason}
                                </span>
                              ) : (
                                <span className="badge badge-urgent" style={{ fontSize: '11px' }}>
                                  <AlertTriangle size={12} /> {v.validationReason}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setImportModalOpen(false)}
              >
                Cancel
              </button>

              {parsedVehicles.length > 0 && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={importing || parsedVehicles.filter(v => v.validation === 'valid').length === 0}
                  onClick={handleExecuteImport}
                >
                  <Check size={16} />
                  {importing
                    ? 'Importing...'
                    : `Confirm Import (${parsedVehicles.filter(v => v.validation === 'valid').length} Vehicles)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
