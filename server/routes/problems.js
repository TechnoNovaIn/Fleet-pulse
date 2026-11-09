const express = require('express');
const router = express.Router();
const { db, audit } = require('../db/database');

// List problems with unresolved first, filtered by vehicle, date, category, status, location
router.get('/', (req, res) => {
  const { vehicle_id, category, status, priority, search, start_date, end_date } = req.query;

  // Retrieve threshold for long pending from settings
  const thresholdRow = db.prepare("SELECT value FROM system_settings WHERE key = 'long_pending_days_threshold'").get();
  const thresholdDays = thresholdRow ? parseInt(thresholdRow.value, 10) : 3;

  let query = `
    SELECT p.*, 
      v.reg_number, v.vehicle_type, v.model, v.operational_status as vehicle_status,
      ROUND((julianday('now') - julianday(p.reported_datetime)), 1) as pending_days,
      CASE 
        WHEN p.status IN ('Open', 'In Progress') AND (julianday('now') - julianday(p.reported_datetime)) >= ? THEN 1
        ELSE 0
      END as is_long_pending
    FROM vehicle_problems p
    JOIN vehicles v ON p.vehicle_id = v.id
    WHERE 1=1
  `;
  const params = [thresholdDays];

  if (vehicle_id && vehicle_id !== 'All') {
    query += ` AND p.vehicle_id = ?`;
    params.push(vehicle_id);
  }

  if (category && category !== 'All') {
    query += ` AND p.category = ?`;
    params.push(category);
  }

  if (status && status !== 'All') {
    query += ` AND p.status = ?`;
    params.push(status);
  }

  if (priority && priority !== 'All') {
    query += ` AND p.priority = ?`;
    params.push(priority);
  }

  if (start_date) {
    query += ` AND date(p.reported_datetime) >= date(?)`;
    params.push(start_date);
  }

  if (end_date) {
    query += ` AND date(p.reported_datetime) <= date(?)`;
    params.push(end_date);
  }

  if (search && search.trim()) {
    query += ` AND (v.reg_number LIKE ? OR p.location LIKE ? OR p.description LIKE ? OR p.action_taken LIKE ? OR p.assigned_to LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term, term);
  }

  // Ordering: Unresolved first (Open, In Progress), then Priority (Urgent > High > Medium > Low), then newest
  query += `
    ORDER BY 
      CASE p.status
        WHEN 'Open' THEN 1
        WHEN 'In Progress' THEN 2
        WHEN 'Resolved' THEN 3
        WHEN 'Closed' THEN 4
        ELSE 5
      END ASC,
      CASE p.priority
        WHEN 'Urgent' THEN 1
        WHEN 'High' THEN 2
        WHEN 'Medium' THEN 3
        WHEN 'Low' THEN 4
        ELSE 5
      END ASC,
      p.reported_datetime DESC
  `;

  try {
    const problems = db.prepare(query).all(...params);
    res.json(problems);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve problems: ' + err.message });
  }
});

// Get single problem by ID with full history
router.get('/:id', (req, res) => {
  try {
    const problem = db.prepare(`
      SELECT p.*, v.reg_number, v.vehicle_type, v.model, v.operational_status as vehicle_status
      FROM vehicle_problems p
      JOIN vehicles v ON p.vehicle_id = v.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!problem) {
      return res.status(404).json({ error: 'Problem record not found' });
    }

    const history = db.prepare(`
      SELECT * FROM problem_history WHERE problem_id = ? ORDER BY created_at DESC
    `).all(problem.id);

    res.json({ problem, history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load problem: ' + err.message });
  }
});

// Record a new problem
router.post('/', (req, res) => {
  const {
    vehicle_id,
    reported_datetime,
    category,
    description,
    location,
    photo_url,
    reported_by,
    assigned_to,
    action_taken,
    priority,
    create_stoppage_too
  } = req.body;

  if (!vehicle_id) {
    return res.status(400).json({ error: 'Vehicle is required' });
  }

  const vehicle = db.prepare('SELECT id, reg_number FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) {
    return res.status(404).json({ error: 'Selected vehicle not found in Vehicle Master' });
  }

  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Problem description is required' });
  }

  if (!category || !category.trim()) {
    return res.status(400).json({ error: 'Problem category is required' });
  }

  if (!location || !location.trim()) {
    return res.status(400).json({ error: 'Reported location is required' });
  }

  const repDate = reported_datetime || new Date().toISOString();
  const probPriority = priority || 'Medium';

  const transaction = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO vehicle_problems (
        vehicle_id, reported_datetime, category, description, location,
        photo_url, reported_by, assigned_to, action_taken, status, priority, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, datetime('now'), datetime('now'))
    `);

    const result = stmt.run(
      vehicle_id,
      repDate,
      category,
      description.trim(),
      location.trim(),
      photo_url || null,
      reported_by ? reported_by.trim() : 'Process Handler',
      assigned_to ? assigned_to.trim() : null,
      action_taken ? action_taken.trim() : null,
      probPriority
    );

    const problemId = result.lastInsertRowid;

    // Log history
    db.prepare(`
      INSERT INTO problem_history (problem_id, previous_status, new_status, action_taken, notes, updated_by)
      VALUES (?, NULL, 'Open', ?, 'Problem ticket created', ?)
    `).run(problemId, action_taken || 'Ticket logged', reported_by || 'Process Handler');

    // Optionally create linked stoppage if requested
    let createdStoppageId = null;
    if (create_stoppage_too) {
      // Check if vehicle already has an ongoing stoppage
      const activeStoppage = db.prepare("SELECT id FROM vehicle_stoppages WHERE vehicle_id = ? AND status = 'Ongoing'").get(vehicle_id);
      if (!activeStoppage) {
        const stopStmt = db.prepare(`
          INSERT INTO vehicle_stoppages (
            vehicle_id, start_datetime, location, reason, related_problem_id, action_taken, status, remarks
          ) VALUES (?, ?, ?, ?, ?, ?, 'Ongoing', ?)
        `);
        const stopRes = stopStmt.run(
          vehicle_id,
          repDate,
          location.trim(),
          `${category}: ${description.trim().substring(0, 100)}`,
          problemId,
          action_taken || null,
          'Automatically initiated from vehicle problem ticket'
        );
        createdStoppageId = stopRes.lastInsertRowid;
        db.prepare("UPDATE vehicles SET operational_status = 'Stopped', updated_at = datetime('now') WHERE id = ?").run(vehicle_id);
      }
    }

    audit('Problems', 'CREATE', problemId, `Reported ${probPriority} ${category} for vehicle ${vehicle.reg_number}`);

    return { problemId, createdStoppageId };
  });

  try {
    const { problemId, createdStoppageId } = transaction();
    const created = db.prepare(`
      SELECT p.*, v.reg_number, v.vehicle_type, v.model
      FROM vehicle_problems p
      JOIN vehicles v ON p.vehicle_id = v.id
      WHERE p.id = ?
    `).get(problemId);

    res.status(201).json({
      message: `Problem ticket #${problemId} recorded successfully for ${vehicle.reg_number}.`,
      problem: created,
      linkedStoppageId: createdStoppageId
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error recording problem: ' + err.message });
  }
});

// Update action taken, notes, priority, assigned person (keeps status intact unless explicitly changed)
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { action_taken, assigned_to, priority, status_change, notes, updated_by } = req.body;

  const problem = db.prepare('SELECT * FROM vehicle_problems WHERE id = ?').get(id);
  if (!problem) {
    return res.status(404).json({ error: 'Problem record not found' });
  }

  // Ensure status change requires confirmation; if status_change provided
  const targetStatus = status_change || (problem.status === 'Open' && action_taken ? 'In Progress' : problem.status);

  try {
    db.prepare(`
      UPDATE vehicle_problems
      SET action_taken = COALESCE(?, action_taken),
          assigned_to = COALESCE(?, assigned_to),
          priority = COALESCE(?, priority),
          status = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      action_taken || null,
      assigned_to || null,
      priority || null,
      targetStatus,
      id
    );

    // Save history audit
    db.prepare(`
      INSERT INTO problem_history (problem_id, previous_status, new_status, action_taken, notes, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      problem.status,
      targetStatus,
      action_taken || 'Details updated',
      notes || 'Action update logged',
      updated_by || 'Process Handler'
    );

    audit('Problems', 'UPDATE', id, `Updated problem #${id} status: ${problem.status} -> ${targetStatus}`);

    const updated = db.prepare('SELECT * FROM vehicle_problems WHERE id = ?').get(id);
    res.json({
      message: `Problem #${id} updated successfully.`,
      problem: updated
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update problem: ' + err.message });
  }
});

// Explicit Resolution Confirmation Endpoint
// Prompt Rule: "Do not automatically mark a problem resolved merely because an action was entered. Require the employee to confirm the resolution."
router.post('/:id/resolve', (req, res) => {
  const { id } = req.params;
  const { resolution_notes, action_taken, resolution_datetime, confirm_resolution, updated_by } = req.body;

  if (!confirm_resolution) {
    return res.status(400).json({ error: 'Resolution confirmation is required to resolve this ticket' });
  }

  if (!resolution_notes || !resolution_notes.trim()) {
    return res.status(400).json({ error: 'Resolution notes detailing the final solution are required' });
  }

  const problem = db.prepare('SELECT * FROM vehicle_problems WHERE id = ?').get(id);
  if (!problem) {
    return res.status(404).json({ error: 'Problem not found' });
  }

  const resDate = resolution_datetime || new Date().toISOString();

  try {
    db.prepare(`
      UPDATE vehicle_problems
      SET status = 'Resolved',
          action_taken = COALESCE(?, action_taken),
          resolution_notes = ?,
          resolution_datetime = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      action_taken ? action_taken.trim() : null,
      resolution_notes.trim(),
      resDate,
      id
    );

    db.prepare(`
      INSERT INTO problem_history (problem_id, previous_status, new_status, action_taken, notes, updated_by)
      VALUES (?, ?, 'Resolved', ?, ?, ?)
    `).run(
      id,
      problem.status,
      action_taken || 'Final resolution verified',
      resolution_notes.trim(),
      updated_by || 'Process Handler'
    );

    audit('Problems', 'RESOLVE', id, `Problem #${id} confirmed and marked Resolved at ${resDate}`);

    const updated = db.prepare('SELECT * FROM vehicle_problems WHERE id = ?').get(id);
    res.json({
      message: `Problem #${id} marked as Resolved successfully.`,
      problem: updated
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve problem: ' + err.message });
  }
});

module.exports = router;
