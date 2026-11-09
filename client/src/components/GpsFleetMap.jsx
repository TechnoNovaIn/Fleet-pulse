import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { 
  RefreshCw, Search, ShieldCheck, MapPin, Navigation, Radio, 
  CheckCircle2, X, ExternalLink, Truck, Eye, AlertCircle 
} from 'lucide-react';

export default function GpsFleetMap({ lang, showToast, onSyncSuccess, onNavigate }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const markersMapRef = useRef({});

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Normalize string for fuzzy alphanumeric search (ignoring spaces, dashes, case)
  const normalize = (str) => (str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  // Fetch live GPS positions (supports silent background auto-sync)
  const fetchGpsPositions = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/shipments/gps');
      const json = await res.json();
      if (json.success) {
        setVehicles(json.data || []);
      } else {
        if (!silent && showToast) showToast(json.error || 'Failed to fetch GPS locations', 'error');
      }
    } catch (err) {
      if (!silent && showToast) showToast('GPS Network Error: ' + err.message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Sync GPS statuses to database
  const handleSyncGpsStatus = async (silent = false) => {
    if (!silent) setSyncing(true);
    try {
      const res = await fetch('/api/shipments/gps/sync-status', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        if (!silent && showToast) {
          showToast(
            `Synchronized ${json.updatedCount} vehicles with live GPS hardware!`,
            'success'
          );
        }
        if (onSyncSuccess) onSyncSuccess();
      } else {
        if (!silent && showToast) showToast(json.error || 'GPS sync failed', 'error');
      }
    } catch (err) {
      if (!silent && showToast) showToast('GPS sync error: ' + err.message, 'error');
    } finally {
      if (!silent) setSyncing(false);
    }
  };

  // Initialize Leaflet Map once & start background auto-refresh
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Centered on South India (Karnataka / Bangalore / Bellary)
      const map = L.map(mapContainerRef.current, {
        center: [13.5, 77.0],
        zoom: 7,
        zoomControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18
      }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      markersLayerRef.current = markersLayer;
    }

    // Initial fetch
    fetchGpsPositions();

    // Auto-sync intervals: live GPS locations every 30s, status sync every 60s
    const gpsInterval = setInterval(() => {
      fetchGpsPositions(true);
    }, 30000);

    const statusSyncInterval = setInterval(() => {
      handleSyncGpsStatus(true);
    }, 60000);

    return () => {
      clearInterval(gpsInterval);
      clearInterval(statusSyncInterval);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Filtered vehicles based on search term
  const filteredVehicles = useMemo(() => {
    const raw = searchTerm.trim().toLowerCase();
    if (!raw) return vehicles;

    const cleanQuery = normalize(searchTerm);

    return vehicles.filter(v => {
      const cleanNo = normalize(v.VehicleNo);
      const rawNo = (v.VehicleNo || '').toLowerCase();
      const loc = (v.Location || '').toLowerCase();
      const driver = (v.DriverName || '').toLowerCase();
      return (
        cleanNo.includes(cleanQuery) ||
        rawNo.includes(raw) ||
        loc.includes(raw) ||
        driver.includes(raw)
      );
    });
  }, [vehicles, searchTerm]);

  // Update map markers and auto-zoom whenever filtered vehicles or search term changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    const layer = markersLayerRef.current;
    layer.clearLayers();
    markersMapRef.current = {};

    const validVehicles = filteredVehicles.filter(v => {
      const lat = parseFloat(v.lat);
      const lng = parseFloat(v.lng);
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    });

    const isSearchActive = Boolean(searchTerm.trim());

    validVehicles.forEach(v => {
      const lat = parseFloat(v.lat);
      const lng = parseFloat(v.lng);
      const isRunning = (v.CurrentStatus || '').toLowerCase().includes('run');
      const isStopped = (v.CurrentStatus || '').toLowerCase().includes('stop');
      const color = isRunning ? '#10b981' : isStopped ? '#ef4444' : '#f59e0b';

      const isMatch = isSearchActive;

      const marker = L.circleMarker([lat, lng], {
        radius: isMatch ? 11 : 6,
        fillColor: color,
        color: isMatch ? '#1e40af' : '#ffffff',
        weight: isMatch ? 3.5 : 2,
        opacity: 1,
        fillOpacity: 0.95
      });

      if (isMatch) {
        marker.bindTooltip(`<b>${v.VehicleNo}</b><br/>${v.Location || ''}`, {
          permanent: validVehicles.length <= 5,
          direction: 'top',
          offset: [0, -8]
        });
      }

      const popupHtml = `
        <div style="font-family: inherit; font-size: 13px; min-width: 200px; padding: 4px;">
          <div style="font-weight: 700; color: #1e3a8a; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
            <span>${v.VehicleNo}</span>
            <span style="font-size: 10px; background: ${color}20; color: ${color}; padding: 2px 6px; border-radius: 4px;">
              ${v.CurrentStatus || 'Active'}
            </span>
          </div>
          <div style="margin-bottom: 4px;"><strong>Location:</strong> ${v.Location || 'In Transit'}</div>
          <div style="margin-bottom: 4px;"><strong>Driver:</strong> ${v.DriverName || '-'}</div>
          ${v.MobileNo ? `<div style="margin-bottom: 4px;"><strong>Mobile:</strong> ${v.MobileNo}</div>` : ''}
          <div style="margin-bottom: 4px;"><strong>Type:</strong> ${v.VehicleType || '-'}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Last GPS: ${v.TimeStamp ? v.TimeStamp.replace('T', ' ') : '-'}</div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('click', () => setSelectedVehicle(v));

      layer.addLayer(marker);
      markersMapRef.current[v.VehicleNo] = marker;
    });

    // Auto-focus / zoom based on search
    if (isSearchActive && validVehicles.length > 0) {
      if (validVehicles.length === 1) {
        // Exactly 1 match found -> zoom directly and open popup
        const v = validVehicles[0];
        const lat = parseFloat(v.lat);
        const lng = parseFloat(v.lng);
        mapInstanceRef.current.flyTo([lat, lng], 14, { animate: true, duration: 1.0 });
        if (selectedVehicle?.VehicleNo !== v.VehicleNo) {
          setSelectedVehicle(v);
        }
        const marker = markersMapRef.current[v.VehicleNo];
        if (marker) {
          setTimeout(() => {
            try { marker.openPopup(); } catch (e) {}
          }, 400);
        }
      } else {
        // Multiple matches found -> fit bounds around all matched markers
        const bounds = L.latLngBounds(validVehicles.map(v => [parseFloat(v.lat), parseFloat(v.lng)]));
        if (bounds.isValid()) {
          mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 13, animate: true });
        }
      }
    } else if (!isSearchActive && validVehicles.length > 0 && selectedVehicle === null) {
      // Search cleared -> maintain general South India view
    }

  }, [filteredVehicles, searchTerm]);

  // Zoom to vehicle when selected from search dropdown or card
  const handleSelectVehicle = (v) => {
    setSelectedVehicle(v);
    setSearchTerm(v.VehicleNo);
    setShowDropdown(false);

    const lat = parseFloat(v.lat);
    const lng = parseFloat(v.lng);
    if (mapInstanceRef.current && !isNaN(lat) && !isNaN(lng)) {
      mapInstanceRef.current.flyTo([lat, lng], 14, { animate: true, duration: 1.0 });
      const marker = markersMapRef.current[v.VehicleNo];
      if (marker) {
        setTimeout(() => {
          try { marker.openPopup(); } catch (e) {}
        }, 400);
      }
    }
  };

  // Clear search and reset map
  const handleClearSearch = () => {
    setSearchTerm('');
    setSelectedVehicle(null);
    setShowDropdown(false);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([13.5, 77.0], 7, { animate: true });
    }
  };

  // Search input key handler (Enter to select first result)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredVehicles.length > 0) {
        handleSelectVehicle(filteredVehicles[0]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'visible' }}>
      {/* Map Control Bar */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        background: '#f8fafc',
        position: 'relative',
        zIndex: 1100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Radio size={18} color="#16a34a" />
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
            Live Fleet Telematics & GPS Tracking
          </h3>
          <span style={{ fontSize: '0.8rem', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
            {vehicles.length} Vehicles Online
          </span>
          <span style={{
            fontSize: '0.76rem',
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0',
            padding: '2px 8px',
            borderRadius: '12px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 5px #10b981' }} />
            Auto-Sync: 30s
          </span>
          {searchTerm && (
            <span style={{ fontSize: '0.78rem', background: '#eff6ff', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
              {filteredVehicles.length} Found
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search box with dynamic autocomplete */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ position: 'relative', minWidth: '160px', maxWidth: '280px' }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px', zIndex: 2 }} />
              <input 
                type="text"
                placeholder="Search vehicle (e.g. 9525)..."
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleKeyDown}
                style={{
                  padding: '7px 28px 7px 30px',
                  borderRadius: '6px',
                  border: searchTerm ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  width: '100%',
                  boxSizing: 'border-box',
                  outline: 'none',
                  boxShadow: searchTerm ? '0 0 0 3px rgba(37,99,235,0.1)' : 'none'
                }}
              />

              {/* Clear Button */}
              {searchTerm && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  title="Clear search"
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '7px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px'
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (filteredVehicles.length > 0) {
                  handleSelectVehicle(filteredVehicles[0]);
                }
              }}
              title="Search Vehicle"
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 11px',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Search size={13} /> Find
            </button>

            {/* Autocomplete Search Dropdown */}
            {showDropdown && searchTerm.trim() && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                boxShadow: '0 10px 25px -3px rgba(0,0,0,0.2)',
                zIndex: 99999,
                maxHeight: '260px',
                overflowY: 'auto'
              }}>
                {filteredVehicles.length === 0 ? (
                  <div style={{ padding: '10px 14px', fontSize: '0.8rem', color: '#64748b' }}>
                    No vehicles found matching "{searchTerm}"
                  </div>
                ) : (
                  filteredVehicles.slice(0, 8).map(v => {
                    const isRunning = (v.CurrentStatus || '').toLowerCase().includes('run');
                    const isStopped = (v.CurrentStatus || '').toLowerCase().includes('stop');
                    const statusColor = isRunning ? '#10b981' : isStopped ? '#ef4444' : '#f59e0b';

                    return (
                      <div
                        key={v.VehicleNo + (v.lat || '')}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectVehicle(v);
                        }}
                        style={{
                          padding: '9px 12px',
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'background 0.15s ease'
                        }}
                        className="hover-table-row"
                      >
                        <div>
                          <div style={{ fontSize: '0.86rem', fontWeight: '700', color: '#0f172a' }}>
                            {v.VehicleNo}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            {v.Location || 'In Transit'} • {v.DriverName || 'Driver'}
                          </div>
                        </div>

                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          color: statusColor,
                          background: `${statusColor}18`,
                          padding: '2px 7px',
                          borderRadius: '10px'
                        }}>
                          {v.CurrentStatus || 'Active'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => fetchGpsPositions(false)}
            disabled={loading}
            className="btn-secondary"
            style={{ padding: '7px 12px', fontSize: '0.82rem' }}
            title="Auto-updates every 30s. Click to refresh immediately."
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing...' : 'Auto-Refreshing (30s)'}
          </button>

          <button
            onClick={() => handleSyncGpsStatus(false)}
            disabled={syncing}
            style={{
              background: '#059669',
              color: '#ffffff',
              padding: '7px 14px',
              borderRadius: '6px',
              border: 'none',
              fontWeight: '600',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: syncing ? 'not-allowed' : 'pointer'
            }}
            title="Auto-syncs every 60s. Click to force instant database sync."
          >
            <CheckCircle2 size={14} />
            {syncing ? 'Syncing...' : 'Auto-Synced to Fleet Master'}
          </button>
        </div>

        {/* Quick Matching Vehicles Pills Bar */}
        {searchTerm.trim() && filteredVehicles.length > 0 && (
          <div style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingTop: '8px',
            borderTop: '1px solid #e2e8f0',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Truck size={13} /> Found ({filteredVehicles.length}):
            </span>
            {filteredVehicles.slice(0, 6).map(v => {
              const isSelected = selectedVehicle?.VehicleNo === v.VehicleNo;
              return (
                <button
                  key={v.VehicleNo}
                  type="button"
                  onClick={() => handleSelectVehicle(v)}
                  style={{
                    background: isSelected ? '#1e40af' : '#eff6ff',
                    color: isSelected ? '#ffffff' : '#1e40af',
                    border: isSelected ? '1px solid #1e40af' : '1px solid #bfdbfe',
                    borderRadius: '16px',
                    padding: '3px 10px',
                    fontSize: '0.78rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease'
                  }}
                  title={`Focus on ${v.VehicleNo}`}
                >
                  <MapPin size={11} />
                  <span>{v.VehicleNo}</span>
                  <span style={{ opacity: 0.75, fontSize: '0.7rem' }}>• {v.Location || 'Transit'}</span>
                </button>
              );
            })}
            {filteredVehicles.length > 6 && (
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                +{filteredVehicles.length - 6} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Map Element Container */}
      <div style={{ position: 'relative' }}>
        <div 
          ref={mapContainerRef} 
          className="gps-map-canvas"
          style={{ width: '100%', backgroundColor: '#e2e8f0', zIndex: 1 }} 
        />

        {/* Floating Selected Vehicle Card */}
        {selectedVehicle && (
          <div style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            right: '16px',
            zIndex: 1000,
            background: '#ffffff',
            borderRadius: '10px',
            padding: '12px 16px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            border: '1px solid #cbd5e1',
            maxWidth: '380px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Truck size={16} color="#2563eb" />
                <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>
                  {selectedVehicle.VehicleNo}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVehicle(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '4px' }}>
              <strong>Status:</strong>{' '}
              <span style={{
                color: (selectedVehicle.CurrentStatus || '').toLowerCase().includes('run') ? '#10b981' : '#dc2626',
                fontWeight: '700'
              }}>
                {selectedVehicle.CurrentStatus || 'Active'}
              </span>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '4px' }}>
              <strong>Location:</strong> {selectedVehicle.Location || 'In Transit'}
            </div>

            <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '8px' }}>
              <strong>Driver:</strong> {selectedVehicle.DriverName || '-'} {selectedVehicle.MobileNo ? `(${selectedVehicle.MobileNo})` : ''}
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => handleSelectVehicle(selectedVehicle)}
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.75rem', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
              >
                <Navigation size={12} color="#2563eb" /> Focus Map
              </button>

              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('vehicles', { vehicleReg: selectedVehicle.VehicleNo })}
                  style={{
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <ExternalLink size={12} /> Master Spec ↗
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Legend & Status */}
      <div style={{
        padding: '10px 18px',
        background: '#f8fafc',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.78rem',
        color: '#64748b',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#10b981' }} />
            Running / Operating
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
            Stopped
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
            Idle
          </span>
        </div>
        <div>
          Powered by <strong>LocoNav & Intangles Telematics</strong> API
        </div>
      </div>
    </div>
  );
}
