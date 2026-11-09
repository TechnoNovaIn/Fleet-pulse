const express = require('express');
const router = express.Router();
const { db, audit } = require('../db/database');

// Helper to format duration in days and hours
function formatDuration(startStr, endStr = null) {
  if (!startStr) return { days: 0, hours: 0, text: '0 hours' };
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : new Date();
  const diffMs = Math.max(0, end - start);
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  let text = '';
  if (days > 0) {
    text = `${days} day${days > 1 ? 's' : ''} ${hours} hr${hours !== 1 ? 's' : ''}`;
  } else {
    text = `${hours} hr${hours !== 1 ? 's' : ''}`;
  }
  return { days, hours, totalHours, text };
}

// List all stoppages with filters, vehicle info, and calculated durations
router.get('/', (req, res) => {
  const { status, vehicle_id, reason, start_date, end_date, search } = req.query;

  // Get threshold
  const thresholdRow = db.prepare("SELECT value FROM system_settings WHERE key = 'long_pending_days_threshold'").get();
  const thresholdDays = thresholdRow ? parseInt(thresholdRow.value, 10) : 3;

  let query = `
    SELECT s.*, 
      v.reg_number, v.vehicle_type, v.model, v.operational_status as current_vehicle_status,
      p.category as problem_category, p.description as problem_description, p.status as problem_status
    FROM vehicle_stoppages s
    JOIN vehicles v ON s.vehicle_id = v.id
    LEFT JOIN vehicle_problems p ON s.related_problem_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (status && status !== 'All') {
    query += ` AND s.status = ?`;
    params.push(status);
  }

  if (vehicle_id && vehicle_id !== 'All') {
    query += ` AND s.vehicle_id = ?`;
    params.push(vehicle_id);
  }

  if (reason && reason !== 'All') {
    query += ` AND s.reason LIKE ?`;
    params.push(`%${reason}%`);
  }

  if (start_date) {
    query += ` AND date(s.start_datetime) >= date(?)`;
    params.push(start_date);
  }

  if (end_date) {
    query += ` AND date(s.start_datetime) <= date(?)`;
    params.push(end_date);
  }

  if (search && search.trim()) {
    query += ` AND (v.reg_number LIKE ? OR s.location LIKE ? OR s.reason LIKE ? OR s.action_taken LIKE ? OR s.remarks LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term, term);
  }

  // Ongoing first, then start datetime desc
  query += `
    ORDER BY 
      CASE s.status WHEN 'Ongoing' THEN 1 ELSE 2 END ASC,
      s.start_datetime DESC
  `;

  try {
    const rawStoppages = db.prepare(query).all(...params);

    const stoppages = rawStoppages.map(item => {
      const dur = formatDuration(item.start_datetime, item.actual_restart_datetime);
      const isLongPending = (item.status === 'Ongoing' && dur.days >= thresholdDays);
      return {
        ...item,
        duration_days: dur.days,
        duration_hours: dur.hours,
        duration_text: dur.text,
        is_long_pending: isLongPending ? 1 : 0
      };
    });

    res.json(stoppages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve stoppages: ' + err.message });
  }
});

// Record a new stoppage
// Prompt Rule: "Prevent duplicate active stoppage records for the same incident / vehicle"
// Prompt Rule: "Do not count normal loading or unloading as a breakdown automatically"
// Prompt Rule: "Allow a vehicle to have a new stoppage after an earlier stoppage has ended"
router.post('/', (req, res) => {
  const {
    vehicle_id,
    start_datetime,
    location,
    reason,
    related_problem_id,
    action_taken,
    expected_restart_datetime,
    remarks
  } = req.body;

  if (!vehicle_id) {
    return res.status(400).json({ error: 'Vehicle selection is required' });
  }

  const vehicle = db.prepare('SELECT id, reg_number, operational_status FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) {
    return res.status(404).json({ error: 'Selected vehicle not found in Vehicle Master' });
  }

  if (!location || !location.trim()) {
    return res.status(400).json({ error: 'Stoppage location is required' });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Reason for stoppage is required' });
  }

  // Check for active ongoing stoppage for this vehicle
  const activeStoppage = db.prepare(`
    SELECT id, start_datetime, location, reason 
    FROM vehicle_stoppages 
    WHERE vehicle_id = ? AND status = 'Ongoing'
  `).get(vehicle_id);

  if (activeStoppage) {
    return res.status(409).json({
      error: `Vehicle ${vehicle.reg_number} already has an active ongoing stoppage (Stoppage #${activeStoppage.id} started on ${activeStoppage.start_datetime} at ${activeStoppage.location}). Please close the existing stoppage before logging a new one.`
    });
  }

  const startDt = start_datetime || new Date().toISOString();

  // Validate start date is not in future
  if (new Date(startDt) > new Date(Date.now() + 60000)) {
    return res.status(400).json({ error: 'Stoppage start date/time cannot be in the future' });
  }

  // Validate expected restart date if provided
  if (expected_restart_datetime && new Date(expected_restart_datetime) <= new Date(startDt)) {
    return res.status(400).json({ error: 'Expected restart date/time must be after the start date/time' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO vehicle_stoppages (
        vehicle_id, start_datetime, location, reason, related_problem_id,
        action_taken, expected_restart_datetime, status, remarks, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Ongoing', ?, datetime('now'), datetime('now'))
    `);

    const result = stmt.run(
      vehicle_id,
      startDt,
      location.trim(),
      reason.trim(),
      related_problem_id || null,
      action_taken ? action_taken.trim() : null,
      expected_restart_datetime || null,
      remarks ? remarks.trim() : null
    );

    // Update vehicle status to Stopped
    db.prepare("UPDATE vehicles SET operational_status = 'Stopped', updated_at = datetime('now') WHERE id = ?").run(vehicle_id);

    audit('Stoppages', 'CREATE', result.lastInsertRowid, `Logged stoppage for ${vehicle.reg_number} at ${location}: ${reason}`);

    const dur = formatDuration(startDt);
    const created = db.prepare(`
      SELECT s.*, v.reg_number, v.vehicle_type, v.model
      FROM vehicle_stoppages s
      JOIN vehicles v ON s.vehicle_id = v.id
      WHERE s.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({
      message: `Stoppage recorded successfully for ${vehicle.reg_number}. Duration tracking is now active.`,
      stoppage: {
        ...created,
        duration_text: dur.text
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error creating stoppage: ' + err.message });
  }
});

// Close stoppage / Record restart date & time
router.post('/:id/restart', (req, res) => {
  const { id } = req.params;
  const { actual_restart_datetime, action_taken, remarks, restore_vehicle_status } = req.body;

  const stoppage = db.prepare('SELECT s.*, v.reg_number FROM vehicle_stoppages s JOIN vehicles v ON s.vehicle_id = v.id WHERE s.id = ?').get(id);
  if (!stoppage) {
    return res.status(404).json({ error: 'Stoppage record not found' });
  }

  if (stoppage.status === 'Ended') {
    return res.status(400).json({ error: 'This stoppage has already been ended on ' + stoppage.actual_restart_datetime });
  }

  const restartDt = actual_restart_datetime || new Date().toISOString();

  // Date validation: Restart time must be after start time
  if (new Date(restartDt) < new Date(stoppage.start_datetime)) {
    return res.status(400).json({
      error: `Actual restart time (${restartDt}) cannot be earlier than stoppage start time (${stoppage.start_datetime})`
    });
  }

  const dur = formatDuration(stoppage.start_datetime, restartDt);

  try {
    db.prepare(`
      UPDATE vehicle_stoppages
      SET actual_restart_datetime = ?,
          status = 'Ended',
          action_taken = COALESCE(?, action_taken),
          remarks = COALESCE(?, remarks),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      restartDt,
      action_taken ? action_taken.trim() : null,
      remarks ? remarks.trim() : null,
      id
    );

    // If restore_vehicle_status flag is true or default, change vehicle status back to Operating
    const targetStatus = restore_vehicle_status || 'Operating';
    db.prepare("UPDATE vehicles SET operational_status = ?, updated_at = datetime('now') WHERE id = ?").run(targetStatus, stoppage.vehicle_id);

    audit('Stoppages', 'CLOSE', id, `Ended stoppage for ${stoppage.reg_number}. Total Duration: ${dur.text}`);

    const updated = db.prepare(`
      SELECT s.*, v.reg_number, v.vehicle_type, v.model
      FROM vehicle_stoppages s
      JOIN vehicles v ON s.vehicle_id = v.id
      WHERE s.id = ?
    `).get(id);

    res.json({
      message: `Stoppage ended successfully for ${stoppage.reg_number}. Total calculated duration: ${dur.text}.`,
      stoppage: {
        ...updated,
        duration_days: dur.days,
        duration_hours: dur.hours,
        duration_text: dur.text
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record restart: ' + err.message });
  }
});

// Update / Correct stoppage dates and details
// Prompt Rule: "Allow correction of incorrect dates with appropriate validation."
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { start_datetime, expected_restart_datetime, actual_restart_datetime, location, reason, action_taken, remarks } = req.body;

  const stoppage = db.prepare('SELECT * FROM vehicle_stoppages WHERE id = ?').get(id);
  if (!stoppage) {
    return res.status(404).json({ error: 'Stoppage not found' });
  }

  const newStart = start_datetime || stoppage.start_datetime;
  const newActual = actual_restart_datetime !== undefined ? actual_restart_datetime : stoppage.actual_restart_datetime;
  const newExpected = expected_restart_datetime !== undefined ? expected_restart_datetime : stoppage.expected_restart_datetime;

  // Validation
  if (newActual && new Date(newActual) < new Date(newStart)) {
    return res.status(400).json({ error: 'Actual restart time cannot be earlier than start time' });
  }

  if (newExpected && new Date(newExpected) <= new Date(newStart)) {
    return res.status(400).json({ error: 'Expected restart time must be after the start time' });
  }

  try {
    db.prepare(`
      UPDATE vehicle_stoppages
      SET start_datetime = ?,
          expected_restart_datetime = ?,
          actual_restart_datetime = ?,
          location = COALESCE(?, location),
          reason = COALESCE(?, reason),
          action_taken = COALESCE(?, action_taken),
          remarks = COALESCE(?, remarks),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      newStart,
      newExpected || null,
      newActual || null,
      location ? location.trim() : null,
      reason ? reason.trim() : null,
      action_taken ? action_taken.trim() : null,
      remarks ? remarks.trim() : null,
      id
    );

    audit('Stoppages', 'UPDATE', id, `Updated stoppage #${id} details and dates`);

    const updated = db.prepare(`
      SELECT s.*, v.reg_number, v.vehicle_type, v.model
      FROM vehicle_stoppages s
      JOIN vehicles v ON s.vehicle_id = v.id
      WHERE s.id = ?
    `).get(id);

    const dur = formatDuration(updated.start_datetime, updated.actual_restart_datetime);

    res.json({
      message: 'Stoppage record corrected successfully.',
      stoppage: {
        ...updated,
        duration_days: dur.days,
        duration_hours: dur.hours,
        duration_text: dur.text
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update stoppage: ' + err.message });
  }
});

module.exports = router;
