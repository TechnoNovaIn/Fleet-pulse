const express = require('express');
const router = express.Router();
const { db, audit } = require('../db/database');

// List daily activities with filters
router.get('/', (req, res) => {
  const { vehicle_id, activity_type, start_date, end_date, search } = req.query;

  let query = `
    SELECT a.*, 
      v.reg_number, v.vehicle_type, v.model, v.manufacturer, v.operational_status as current_vehicle_status
    FROM daily_activities a
    JOIN vehicles v ON a.vehicle_id = v.id
    WHERE 1=1
  `;
  const params = [];

  if (vehicle_id && vehicle_id !== 'All') {
    query += ` AND a.vehicle_id = ?`;
    params.push(vehicle_id);
  }

  if (activity_type && activity_type !== 'All') {
    query += ` AND a.activity_type = ?`;
    params.push(activity_type);
  }

  if (start_date) {
    query += ` AND date(a.report_datetime) >= date(?)`;
    params.push(start_date);
  }

  if (end_date) {
    query += ` AND date(a.report_datetime) <= date(?)`;
    params.push(end_date);
  }

  if (search && search.trim()) {
    query += ` AND (v.reg_number LIKE ? OR a.location LIKE ? OR a.description LIKE ? OR a.reported_by LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  query += ` ORDER BY a.report_datetime DESC`;

  try {
    const activities = db.prepare(query).all(...params);
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve daily activities: ' + err.message });
  }
});

// Record a new daily activity
router.post('/', (req, res) => {
  const {
    vehicle_id,
    report_datetime,
    location,
    activity_type,
    start_datetime,
    end_datetime,
    description,
    photo_url,
    reported_by
  } = req.body;

  // Validation
  if (!vehicle_id) {
    return res.status(400).json({ error: 'Vehicle selection is required' });
  }

  const vehicle = db.prepare('SELECT id, reg_number, operational_status FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) {
    return res.status(404).json({ error: 'Selected vehicle was not found in Vehicle Master' });
  }

  if (!location || !location.trim()) {
    return res.status(400).json({ error: 'Current or reported location is required' });
  }

  if (!activity_type) {
    return res.status(400).json({ error: 'Activity type is required' });
  }

  const validActivities = ['Travelling', 'Halting', 'Loading', 'Unloading', 'Waiting', 'Maintenance', 'Breakdown', 'Other', 'In-Transit', 'Operating'];
  if (!validActivities.includes(activity_type)) {
    return res.status(400).json({ error: `Invalid activity type. Must be one of: ${validActivities.join(', ')}` });
  }

  const finalReportDatetime = report_datetime || new Date().toISOString();
  const finalStartDatetime = start_datetime || finalReportDatetime;

  try {
    const stmt = db.prepare(`
      INSERT INTO daily_activities (
        vehicle_id, report_datetime, location, activity_type, start_datetime, end_datetime, description, photo_url, reported_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      vehicle_id,
      finalReportDatetime,
      location.trim(),
      activity_type,
      finalStartDatetime,
      end_datetime || null,
      description ? description.trim() : null,
      photo_url || null,
      reported_by ? reported_by.trim() : 'Driver / Process Handler'
    );

    // Contextual status adjustment (without forcing loading/unloading to be breakdown)
    if (activity_type === 'Travelling' && vehicle.operational_status !== 'Operating') {
      db.prepare("UPDATE vehicles SET operational_status = 'Operating', updated_at = datetime('now') WHERE id = ?").run(vehicle_id);
    } else if (activity_type === 'Breakdown' && vehicle.operational_status !== 'Stopped') {
      db.prepare("UPDATE vehicles SET operational_status = 'Stopped', updated_at = datetime('now') WHERE id = ?").run(vehicle_id);
    } else if (activity_type === 'Maintenance' && vehicle.operational_status !== 'Under Maintenance') {
      db.prepare("UPDATE vehicles SET operational_status = 'Under Maintenance', updated_at = datetime('now') WHERE id = ?").run(vehicle_id);
    }

    audit('Operations', 'CREATE', result.lastInsertRowid, `Logged ${activity_type} for ${vehicle.reg_number} at ${location}`);

    const created = db.prepare(`
      SELECT a.*, v.reg_number, v.vehicle_type, v.model
      FROM daily_activities a
      JOIN vehicles v ON a.vehicle_id = v.id
      WHERE a.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({
      message: `Daily operation '${activity_type}' recorded successfully for vehicle ${vehicle.reg_number}.`,
      activity: created
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error recording activity: ' + err.message });
  }
});

// Get single activity details by ID
router.get('/:id', (req, res) => {
  try {
    const act = db.prepare(`
      SELECT a.*, 
        v.reg_number, v.vehicle_type, v.model, v.manufacturer, v.operational_status as current_vehicle_status
      FROM daily_activities a
      JOIN vehicles v ON a.vehicle_id = v.id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!act) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    res.json(act);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve activity: ' + err.message });
  }
});

// Update an existing daily activity
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const {
    location,
    activity_type,
    report_datetime,
    start_datetime,
    end_datetime,
    description,
    reported_by
  } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM daily_activities WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    db.prepare(`
      UPDATE daily_activities
      SET location = COALESCE(?, location),
          activity_type = COALESCE(?, activity_type),
          report_datetime = COALESCE(?, report_datetime),
          start_datetime = COALESCE(?, start_datetime),
          end_datetime = ?,
          description = COALESCE(?, description),
          reported_by = COALESCE(?, reported_by)
      WHERE id = ?
    `).run(
      location ? location.trim() : null,
      activity_type || null,
      report_datetime || null,
      start_datetime || null,
      end_datetime !== undefined ? end_datetime : existing.end_datetime,
      description !== undefined ? description.trim() : existing.description,
      reported_by ? reported_by.trim() : null,
      id
    );

    audit('Operations', 'UPDATE', id, `Updated activity ${id}`);

    const updated = db.prepare(`
      SELECT a.*, 
        v.reg_number, v.vehicle_type, v.model, v.manufacturer, v.operational_status as current_vehicle_status
      FROM daily_activities a
      JOIN vehicles v ON a.vehicle_id = v.id
      WHERE a.id = ?
    `).get(id);

    res.json({
      message: 'Operation activity updated successfully',
      activity: updated
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update activity: ' + err.message });
  }
});

// Delete an activity
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const existing = db.prepare('SELECT * FROM daily_activities WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    db.prepare('DELETE FROM daily_activities WHERE id = ?').run(id);
    audit('Operations', 'DELETE', id, `Deleted activity ${id}`);

    res.json({ message: 'Operation record deleted successfully', id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete activity: ' + err.message });
  }
});

module.exports = router;
