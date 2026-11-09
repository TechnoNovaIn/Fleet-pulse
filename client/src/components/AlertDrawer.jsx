import React from 'react';
import { X, AlertTriangle, Clock, Calendar, ChevronRight, Bell } from 'lucide-react';

export default function AlertDrawer({ isOpen, onClose, alerts = [], onNavigate }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ justifyContent: 'flex-end', padding: 0 }}>
      <div
        className="modal-dialog"
        onClick={e => e.stopPropagation()}
        style={{
          width: '380px', maxWidth: '100%', height: '100vh',
          maxHeight: '100vh', borderRadius: 0, animation: 'slideInRight 0.25s ease-out'
        }}
      >
        <div className="modal-header" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '8px',
              backgroundColor: '#fee2e2', color: '#ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Bell size={18} />
            </div>
            <div>
              <h3 className="modal-title" style={{ fontSize: '16px' }}>Operational Alerts</h3>
              <p style={{ fontSize: '12px', color: '#64748b' }}>
                {alerts.length} action item{alerts.length !== 1 ? 's' : ''} require attention
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body" style={{ padding: '16px', gap: '12px' }}>
          {alerts.length === 0 ? (
            <div className="empty-state" style={{ padding: '36px 12px' }}>
              <div className="empty-icon" style={{ backgroundColor: '#ecfdf5', color: '#10b981' }}>
                <Bell size={28} />
              </div>
              <h4 className="empty-title">All Clear!</h4>
              <p className="empty-desc">No urgent problems or overdue vehicle stoppages detected.</p>
            </div>
          ) : (
            alerts.map(alert => (
              <div
                key={alert.id}
                onClick={() => {
                  onNavigate(alert.module, alert.linkId);
                  onClose();
                }}
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  backgroundColor: alert.severity === 'danger' ? '#fef2f2' : alert.severity === 'warning' ? '#fffbeb' : '#eff6ff',
                  border: `1px solid ${alert.severity === 'danger' ? '#fecaca' : alert.severity === 'warning' ? '#fde68a' : '#bfdbfe'}`,
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
                    color: alert.severity === 'danger' ? '#991b1b' : alert.severity === 'warning' ? '#92400e' : '#1e40af'
                  }}>
                    {alert.type.replace('_', ' ')}
                  </span>
                  <ChevronRight size={14} color="#94a3b8" />
                </div>

                <h4 style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                  {alert.title}
                </h4>

                <p style={{ fontSize: '12px', color: '#475569', lineHeight: '1.4' }}>
                  {alert.message}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  <Clock size={12} />
                  <span>{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
