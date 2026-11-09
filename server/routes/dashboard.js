const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// Helper to calculate days between dates
function getDaysDifference(dateStr) {
  if (!dateStr) return 0;
  const now = new Date();
  const past = new Date(dateStr);
  const diffMs = Math.max(0, now - past);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Live Dashboard Stats calculated directly from DB records
router.get('/stats', (req, res) => {
  try {
    // Configurable threshold
    const thresholdRow = db.prepare("SELECT value FROM system_settings WHERE key = 'long_pending_days_threshold'").get();
    const thresholdDays = thresholdRow ? parseInt(thresholdRow.value, 10) : 3;

    // Stoppages ongoing
    const ongoingStoppages = db.prepare("SELECT * FROM vehicle_stoppages WHERE status = 'Ongoing'").all();
    const stoppedBeyondThreshold = ongoingStoppages.filter(s => getDaysDifference(s.start_datetime) >= thresholdDays).length;

    // Vehicle status counts
    const totalVehicles = db.prepare("SELECT COUNT(*) as count FROM vehicles").get().count;
    const distinctStopped = new Set(ongoingStoppages.map(s => s.vehicle_id)).size;
    const stoppedVehicles = Math.max(db.prepare("SELECT COUNT(*) as count FROM vehicles WHERE operational_status = 'Stopped'").get().count, distinctStopped);
    const maintenanceVehicles = db.prepare("SELECT COUNT(*) as count FROM vehicles WHERE operational_status = 'Under Maintenance'").get().count;
    const idleVehicles = db.prepare("SELECT COUNT(*) as count FROM vehicles WHERE operational_status = 'Idle'").get().count;
    const operatingVehicles = Math.max(0, totalVehicles - stoppedVehicles - maintenanceVehicles - idleVehicles);

    // Problem stats
    const openProblems = db.prepare("SELECT COUNT(*) as count FROM vehicle_problems WHERE status IN ('Open', 'In Progress')").get().count;
    const urgentProblems = db.prepare("SELECT COUNT(*) as count FROM vehicle_problems WHERE priority = 'Urgent' AND status IN ('Open', 'In Progress')").get().count;
    const highProblems = db.prepare("SELECT COUNT(*) as count FROM vehicle_problems WHERE priority = 'High' AND status IN ('Open', 'In Progress')").get().count;
    const resolvedProblems = db.prepare("SELECT COUNT(*) as count FROM vehicle_problems WHERE status = 'Resolved'").get().count;

    // Recently updated vehicles (last 5)
    const recentlyUpdatedVehicles = db.prepare(`
      SELECT v.*,
        (SELECT location FROM daily_activities WHERE vehicle_id = v.id ORDER BY report_datetime DESC LIMIT 1) as current_location,
        (SELECT activity_type FROM daily_activities WHERE vehicle_id = v.id ORDER BY report_datetime DESC LIMIT 1) as current_activity
      FROM vehicles v
      ORDER BY v.updated_at DESC
      LIMIT 5
    `).all();

    // Recently reported problems (last 5)
    const recentlyReportedProblems = db.prepare(`
      SELECT p.*, v.reg_number, v.vehicle_type
      FROM vehicle_problems p
      JOIN vehicles v ON p.vehicle_id = v.id
      ORDER BY p.reported_datetime DESC
      LIMIT 5
    `).all();

    // Recent daily operations (last 6)
    const recentDailyActivities = db.prepare(`
      SELECT a.*, v.reg_number, v.vehicle_type
      FROM daily_activities a
      JOIN vehicles v ON a.vehicle_id = v.id
      ORDER BY a.report_datetime DESC
      LIMIT 6
    `).all();

    // Ongoing Stoppages with calculated stopped days (last 6)
    const recentOngoingStoppages = db.prepare(`
      SELECT s.*, v.reg_number, v.vehicle_type,
        CAST(ROUND(julianday('now') - julianday(s.start_datetime)) AS INTEGER) as stopped_days
      FROM vehicle_stoppages s
      JOIN vehicles v ON s.vehicle_id = v.id
      WHERE s.status = 'Ongoing'
      ORDER BY s.start_datetime DESC
      LIMIT 6
    `).all();

    // Vehicle Type breakdown
    const vehicleTypeBreakdown = db.prepare(`
      SELECT vehicle_type, COUNT(*) as count
      FROM vehicles
      GROUP BY vehicle_type
      ORDER BY count DESC
    `).all();

    // Operational counts
    const totalActivities = db.prepare("SELECT COUNT(*) as count FROM daily_activities").get().count;
    const todayActivities = db.prepare("SELECT COUNT(*) as count FROM daily_activities WHERE date(report_datetime) = date('now')").get().count;

    // Chart Data 1: Fleet Status Distribution
    const statusDistribution = [
      { label: 'Operating', count: operatingVehicles, color: '#10b981' },
      { label: 'Stopped', count: stoppedVehicles, color: '#ef4444' },
      { label: 'Maintenance', count: maintenanceVehicles, color: '#f59e0b' },
      { label: 'Idle', count: idleVehicles, color: '#6b7280' }
    ];

    // Chart Data 2: Stoppage Reasons breakdown
    const stoppageReasons = db.prepare(`
      SELECT reason, COUNT(*) as count 
      FROM vehicle_stoppages 
      GROUP BY reason 
      ORDER BY count DESC 
      LIMIT 6
    `).all();

    // Chart Data 3: Activity Breakdown
    const activityBreakdown = db.prepare(`
      SELECT activity_type, COUNT(*) as count
      FROM daily_activities
      GROUP BY activity_type
      ORDER BY count DESC
    `).all();

    // Chart Data 4: Problem Categories
    const problemCategories = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM vehicle_problems
      GROUP BY category
      ORDER BY count DESC
    `).all();

    res.json({
      metrics: {
        totalVehicles,
        operatingVehicles,
        stoppedVehicles,
        maintenanceVehicles,
        idleVehicles,
        openProblems,
        urgentProblems,
        highProblems,
        resolvedProblems,
        stoppedBeyondThreshold,
        thresholdDays,
        totalActivities,
        todayActivities
      },
      recentlyUpdatedVehicles,
      recentlyReportedProblems,
      recentDailyActivities,
      recentOngoingStoppages,
      vehicleTypeBreakdown,
      charts: {
        statusDistribution,
        stoppageReasons,
        activityBreakdown,
        problemCategories
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to calculate dashboard statistics: ' + err.message });
  }
});

// Notifications & Alert List (Section 11)
// Alerts for: New urgent problems, Unresolved problems, Long-pending stoppages, Approaching restart dates
router.get('/alerts', (req, res) => {
  try {
    const thresholdRow = db.prepare("SELECT value FROM system_settings WHERE key = 'long_pending_days_threshold'").get();
    const thresholdDays = thresholdRow ? parseInt(thresholdRow.value, 10) : 3;

    const alerts = [];

    // 1. Urgent problems
    const urgentProblems = db.prepare(`
      SELECT p.*, v.reg_number 
      FROM vehicle_problems p 
      JOIN vehicles v ON p.vehicle_id = v.id 
      WHERE p.priority = 'Urgent' AND p.status IN ('Open', 'In Progress')
      ORDER BY p.reported_datetime DESC
    `).all();

    urgentProblems.forEach(p => {
      alerts.push({
        id: `prob-urgent-${p.id}`,
        type: 'urgent_problem',
        severity: 'danger',
        title: `URGENT Problem: ${p.reg_number}`,
        message: `${p.category} - ${p.description} at ${p.location}`,
        timestamp: p.reported_datetime,
        linkId: p.id,
        module: 'problems'
      });
    });

    // 2. Long pending stoppages (> thresholdDays)
    const longStoppages = db.prepare(`
      SELECT s.*, v.reg_number 
      FROM vehicle_stoppages s 
      JOIN vehicles v ON s.vehicle_id = v.id 
      WHERE s.status = 'Ongoing' AND (julianday('now') - julianday(s.start_datetime)) >= ?
      ORDER BY s.start_datetime ASC
    `).all(thresholdDays);

    longStoppages.forEach(s => {
      const days = getDaysDifference(s.start_datetime);
      alerts.push({
        id: `stop-long-${s.id}`,
        type: 'long_stoppage',
        severity: 'warning',
        title: `Long-Pending Stoppage: ${s.reg_number}`,
        message: `Stopped for ${days} days (${s.reason}) at ${s.location}`,
        timestamp: s.start_datetime,
        linkId: s.id,
        module: 'stoppages'
      });
    });

    // 3. Approaching or passed expected restart dates
    const approachingRestarts = db.prepare(`
      SELECT s.*, v.reg_number 
      FROM vehicle_stoppages s 
      JOIN vehicles v ON s.vehicle_id = v.id 
      WHERE s.status = 'Ongoing' 
        AND s.expected_restart_datetime IS NOT NULL 
        AND (julianday(s.expected_restart_datetime) - julianday('now')) <= 1
      ORDER BY s.expected_restart_datetime ASC
    `).all();

    approachingRestarts.forEach(s => {
      const isOverdue = new Date(s.expected_restart_datetime) < new Date();
      alerts.push({
        id: `restart-${s.id}`,
        type: 'restart_alert',
        severity: isOverdue ? 'danger' : 'info',
        title: `${isOverdue ? 'OVERDUE' : 'Approaching'} Restart: ${s.reg_number}`,
        message: `Expected restart was ${new Date(s.expected_restart_datetime).toLocaleString()}. Reason: ${s.reason}`,
        timestamp: s.expected_restart_datetime,
        linkId: s.id,
        module: 'stoppages'
      });
    });

    res.json({
      totalAlerts: alerts.length,
      alerts
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve alerts: ' + err.message });
  }
});

module.exports = router;
