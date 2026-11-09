const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { db } = require('../db/database');

// Helper to calculate days between dates
function getDaysDifference(dateStr) {
  if (!dateStr) return 0;
  const now = new Date();
  const past = new Date(dateStr);
  const diffMs = Math.max(0, now - past);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Helper to format date
function formatDate(dtStr) {
  if (!dtStr) return '-';
  try {
    return new Date(dtStr).toLocaleString('en-IN', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return dtStr;
  }
}

// Generate report datasets based on report_type and filters (Simplified with only important columns)
function buildReportData(reportType, filters = {}) {
  const { start_date, end_date, vehicle_type, status, search } = filters;

  // Retrieve threshold
  const thresholdRow = db.prepare("SELECT value FROM system_settings WHERE key = 'long_pending_days_threshold'").get();
  const thresholdDays = thresholdRow ? parseInt(thresholdRow.value, 10) : 3;

  // 1. Vehicle Master Report (Important columns only)
  if (reportType === 'vehicle_master') {
    let q = `SELECT * FROM vehicles WHERE 1=1`;
    const params = [];
    if (vehicle_type && vehicle_type !== 'All') {
      q += ` AND vehicle_type = ?`;
      params.push(vehicle_type);
    }
    if (status && status !== 'All') {
      q += ` AND operational_status = ?`;
      params.push(status);
    }
    if (search) {
      q += ` AND (reg_number LIKE ? OR owner_name LIKE ? OR model LIKE ? OR manufacturer LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    q += ` ORDER BY reg_number ASC`;
    const rows = db.prepare(q).all(...params);
    return rows.map(r => ({
      'Vehicle Number': r.reg_number,
      'Vehicle Type': r.vehicle_type,
      'Manufacturer & Model': [r.manufacturer, r.model].filter(Boolean).join(' ') || '-',
      'Operational Status': r.operational_status,
      'Owner / Agency': r.owner_name || '-',
      'Last Updated': formatDate(r.updated_at)
    }));
  }

  // 2. Daily Operations Report (Important columns only)
  if (reportType === 'daily_operations' || reportType === 'historical_activity') {
    let q = `
      SELECT a.*, v.reg_number, v.vehicle_type
      FROM daily_activities a
      JOIN vehicles v ON a.vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];
    if (start_date) {
      q += ` AND date(a.report_datetime) >= date(?)`;
      params.push(start_date);
    }
    if (end_date) {
      q += ` AND date(a.report_datetime) <= date(?)`;
      params.push(end_date);
    }
    if (vehicle_type && vehicle_type !== 'All') {
      q += ` AND v.vehicle_type = ?`;
      params.push(vehicle_type);
    }
    if (search) {
      q += ` AND (v.reg_number LIKE ? OR a.location LIKE ? OR a.activity_type LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    q += ` ORDER BY a.report_datetime DESC`;
    const rows = db.prepare(q).all(...params);
    return rows.map(r => ({
      'Date & Time': formatDate(r.report_datetime),
      'Vehicle Number': r.reg_number,
      'Activity': r.activity_type,
      'Location': r.location,
      'Remarks / Cargo': r.description || '-',
      'Driver': r.reported_by || '-'
    }));
  }

  // 3. Vehicle Problem & Exceptional Problem Reports (Important columns only)
  if (reportType === 'vehicle_problems' || reportType === 'long_pending_problems' || reportType === 'resolved_problems') {
    let q = `
      SELECT p.*, v.reg_number, v.vehicle_type,
        ROUND((julianday('now') - julianday(p.reported_datetime)), 1) as pending_days
      FROM vehicle_problems p
      JOIN vehicles v ON p.vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];
    if (reportType === 'long_pending_problems') {
      q += ` AND p.status IN ('Open', 'In Progress') AND (julianday('now') - julianday(p.reported_datetime)) >= ?`;
      params.push(thresholdDays);
    } else if (reportType === 'resolved_problems') {
      q += ` AND p.status IN ('Resolved', 'Closed')`;
    }
    if (status && status !== 'All') {
      q += ` AND p.status = ?`;
      params.push(status);
    }
    if (start_date) {
      q += ` AND date(p.reported_datetime) >= date(?)`;
      params.push(start_date);
    }
    if (end_date) {
      q += ` AND date(p.reported_datetime) <= date(?)`;
      params.push(end_date);
    }
    if (vehicle_type && vehicle_type !== 'All') {
      q += ` AND v.vehicle_type = ?`;
      params.push(vehicle_type);
    }
    if (search) {
      q += ` AND (v.reg_number LIKE ? OR p.category LIKE ? OR p.description LIKE ? OR p.location LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    q += ` ORDER BY p.reported_datetime DESC`;
    const rows = db.prepare(q).all(...params);

    if (reportType === 'resolved_problems') {
      return rows.map(r => ({
        'Vehicle Number': r.reg_number,
        'Category': r.category,
        'Description': r.description,
        'Resolution Notes': r.resolution_notes || r.action_taken || 'Resolved',
        'Resolved Date': formatDate(r.resolution_datetime || r.updated_at),
        'Location': r.location
      }));
    }

    if (reportType === 'long_pending_problems') {
      return rows.map(r => ({
        'Vehicle Number': r.reg_number,
        'Vehicle Type': r.vehicle_type,
        'Days Overdue': r.pending_days === 1 ? '1 day' : `${r.pending_days} days`,
        'Category': r.category,
        'Location': r.location,
        'Priority': r.priority,
        'Action Taken': r.action_taken || 'Pending action'
      }));
    }

    // Default vehicle_problems
    return rows.map(r => ({
      'Vehicle Number': r.reg_number,
      'Category': r.category,
      'Description': r.description,
      'Priority': r.priority,
      'Status': r.status,
      'Location': r.location,
      'Reported Date': formatDate(r.reported_datetime)
    }));
  }

  // 4. Vehicle Stoppage Report (Simplified: Only Essential Columns)
  let q = `
    SELECT s.*, v.reg_number, v.vehicle_type
    FROM vehicle_stoppages s
    JOIN vehicles v ON s.vehicle_id = v.id
    WHERE 1=1
  `;
  const params = [];

  if (reportType === 'current_stoppages') {
    if (status && status !== 'All') {
      q += ` AND s.status = ?`;
      params.push(status);
    }
  } else if (reportType === 'resolved_stoppages') {
    q += ` AND s.status = 'Ended'`;
  }

  if (start_date) {
    q += ` AND date(s.start_datetime) >= date(?)`;
    params.push(start_date);
  }
  if (end_date) {
    q += ` AND date(s.start_datetime) <= date(?)`;
    params.push(end_date);
  }
  if (vehicle_type && vehicle_type !== 'All') {
    q += ` AND v.vehicle_type = ?`;
    params.push(vehicle_type);
  }
  if (search) {
    q += ` AND (v.reg_number LIKE ? OR s.location LIKE ? OR s.reason LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  q += ` ORDER BY CASE WHEN s.status = 'Ongoing' THEN 0 ELSE 1 END, s.start_datetime DESC`;

  const rows = db.prepare(q).all(...params);

  return rows.map(r => {
    let daysStopped = 0;
    if (r.status === 'Ongoing') {
      daysStopped = getDaysDifference(r.start_datetime);
    } else if (r.actual_restart_datetime) {
      const diffMs = Math.max(0, new Date(r.actual_restart_datetime) - new Date(r.start_datetime));
      daysStopped = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    return {
      'Vehicle Number': r.reg_number,
      'Vehicle Type': r.vehicle_type,
      'Location': r.location,
      'Days Stopped': daysStopped === 1 ? '1 day' : `${daysStopped} days`,
      'Reason': r.reason,
      'Stoppage Start': formatDate(r.start_datetime),
      'Status': r.status
    };
  });
}

// Electronic Report JSON API
router.get('/', (req, res) => {
  try {
    const reportType = req.query.report_type || 'current_stoppages';
    const data = buildReportData(reportType, req.query);
    res.json({
      reportType,
      recordCount: data.length,
      data
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report: ' + err.message });
  }
});

// Electronic Report Excel (.xlsx) Download Endpoint
router.get('/export/excel', (req, res) => {
  try {
    const reportType = req.query.report_type || 'current_stoppages';
    const data = buildReportData(reportType, req.query);

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    const sheetName = (reportType.replace(/_/g, ' ').substring(0, 30));
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="Vehicle_Report_${reportType}_${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Excel export failed: ' + err.message });
  }
});

module.exports = router;
