const express = require('express');
const router = express.Router();
const { db, audit } = require('../db/database');

// List vehicle types
router.get('/types', (req, res) => {
  const types = db.prepare('SELECT id, name, is_active FROM vehicle_types ORDER BY name ASC').all();
  res.json(types);
});

// Add new vehicle type
router.post('/types', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Vehicle type name is required' });
  }

  try {
    const stmt = db.prepare('INSERT INTO vehicle_types (name) VALUES (?)');
    const result = stmt.run(name.trim());
    audit('Vehicles', 'CREATE_TYPE', result.lastInsertRowid, `Created vehicle type: ${name.trim()}`);
    res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), message: 'Vehicle type added successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'This vehicle type already exists' });
    }
    res.status(500).json({ error: 'Failed to add vehicle type: ' + err.message });
  }
});

// List all vehicles with filters and search
router.get('/', (req, res) => {
  const { search, type, model, status } = req.query;
  let query = `
    SELECT v.*, 
      (SELECT location FROM daily_activities WHERE vehicle_id = v.id ORDER BY report_datetime DESC LIMIT 1) as last_location,
      (SELECT activity_type FROM daily_activities WHERE vehicle_id = v.id ORDER BY report_datetime DESC LIMIT 1) as last_activity,
      (SELECT report_datetime FROM daily_activities WHERE vehicle_id = v.id ORDER BY report_datetime DESC LIMIT 1) as last_activity_time,
      (SELECT COUNT(*) FROM vehicle_problems WHERE vehicle_id = v.id AND status IN ('Open', 'In Progress')) as open_problems_count,
      (SELECT COUNT(*) FROM vehicle_stoppages WHERE vehicle_id = v.id AND status = 'Ongoing') as is_currently_stopped
    FROM vehicles v
    WHERE 1=1
  `;
  const params = [];

  if (search && search.trim()) {
    query += ` AND (v.reg_number LIKE ? OR v.owner_name LIKE ? OR v.model LIKE ? OR v.manufacturer LIKE ? OR v.notes LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term, term);
  }

  if (type && type !== 'All') {
    query += ` AND v.vehicle_type = ?`;
    params.push(type);
  }

  if (model && model !== 'All') {
    query += ` AND v.model = ?`;
    params.push(model);
  }

  if (status && status !== 'All') {
    query += ` AND v.operational_status = ?`;
    params.push(status);
  }

  query += ` ORDER BY v.reg_number ASC`;

  try {
    const vehicles = db.prepare(query).all(...params);
    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve vehicles: ' + err.message });
  }
});

// Get single vehicle by ID with related records
router.get('/:id', (req, res) => {
  try {
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const recentActivities = db.prepare(`
      SELECT * FROM daily_activities WHERE vehicle_id = ? ORDER BY report_datetime DESC LIMIT 10
    `).all(vehicle.id);

    const activeProblems = db.prepare(`
      SELECT * FROM vehicle_problems WHERE vehicle_id = ? ORDER BY reported_datetime DESC
    `).all(vehicle.id);

    const stoppages = db.prepare(`
      SELECT * FROM vehicle_stoppages WHERE vehicle_id = ? ORDER BY start_datetime DESC
    `).all(vehicle.id);

    res.json({
      vehicle,
      recentActivities,
      activeProblems,
      stoppages
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve vehicle details: ' + err.message });
  }
});

// Add a vehicle
router.post('/', (req, res) => {
  const { reg_number, owner_name, vehicle_type, manufacturer, model, operational_status, notes } = req.body;

  // Validation
  if (!reg_number || !reg_number.trim()) {
    return res.status(400).json({ error: 'Vehicle registration number is required (e.g., KA-01-AB-1234 or AP-02-TA-7253)' });
  }

  if (!vehicle_type || !vehicle_type.trim()) {
    return res.status(400).json({ error: 'Vehicle type is required (e.g., Twelve Wheeler, Fourteen Wheeler, Trailers)' });
  }

  const normalizedReg = reg_number.trim().toUpperCase().replace(/\s+/g, '-');

  // Check duplicate registration number
  const existing = db.prepare('SELECT id, reg_number FROM vehicles WHERE reg_number = ? COLLATE NOCASE').get(normalizedReg);
  if (existing) {
    return res.status(409).json({ 
      error: `Vehicle registration number '${normalizedReg}' is already registered in the system (Vehicle ID: ${existing.id}). Duplicate registrations are not allowed.` 
    });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO vehicles (reg_number, owner_name, vehicle_type, manufacturer, model, operational_status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const result = stmt.run(
      normalizedReg,
      owner_name ? owner_name.trim() : null,
      vehicle_type.trim(),
      manufacturer ? manufacturer.trim() : null,
      model ? model.trim() : null,
      operational_status || 'Operating',
      notes ? notes.trim() : null
    );

    audit('Vehicles', 'CREATE', result.lastInsertRowid, `Added vehicle ${normalizedReg} (${vehicle_type})`);

    const created = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
      message: `Vehicle ${normalizedReg} added successfully to Vehicle Master.`,
      vehicle: created
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error adding vehicle: ' + err.message });
  }
});

// Bulk import vehicles from file/data
router.post('/import', (req, res) => {
  const { vehicles } = req.body;
  if (!Array.isArray(vehicles) || vehicles.length === 0) {
    return res.status(400).json({ error: 'Please provide an array of vehicle records to import' });
  }

  const results = {
    total: vehicles.length,
    imported: 0,
    skipped: 0,
    errors: []
  };

  const checkStmt = db.prepare('SELECT id, reg_number FROM vehicles WHERE reg_number = ? COLLATE NOCASE');
  const insertStmt = db.prepare(`
    INSERT INTO vehicles (reg_number, owner_name, vehicle_type, manufacturer, model, operational_status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const importTx = db.transaction(() => {
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const rawReg = v.reg_number || v['Registration Number'] || v['Registration No'] || v.regNo || '';
      const reg = String(rawReg).trim().toUpperCase().replace(/\s+/g, '-');
      const owner = (v.owner_name || v['Owner Name'] || v['Owner'] || v['owner'] || '').trim();
      const vType = (v.vehicle_type || v['Vehicle Type'] || v.type || 'Twelve Wheeler').trim();
      const mdl = (v.model || v['Model'] || '').trim();
      const mfg = (v.manufacturer || v['Manufacturer'] || v.make || '').trim();
      const status = (v.operational_status || v['Operational Status'] || v['Status'] || 'Operating').trim();
      const notes = (v.notes || v['Notes'] || '').trim();

      if (!reg) {
        results.skipped++;
        results.errors.push(`Row ${i + 1}: Missing registration number`);
        continue;
      }

      const existing = checkStmt.get(reg);
      if (existing) {
        results.skipped++;
        results.errors.push(`Row ${i + 1}: '${reg}' already exists in fleet (Vehicle ID: ${existing.id})`);
        continue;
      }

      insertStmt.run(
        reg,
        owner || null,
        vType || 'Twelve Wheeler',
        mfg || null,
        mdl || null,
        status || 'Operating',
        notes || null
      );
      results.imported++;
    }
  });

  try {
    importTx();
    audit('Vehicles', 'IMPORT', null, `Bulk imported ${results.imported} vehicles (${results.skipped} duplicates/skipped)`);
    res.json({
      message: `Import finished: ${results.imported} vehicle${results.imported !== 1 ? 's' : ''} successfully added to Vehicle Master${results.skipped > 0 ? ` (${results.skipped} skipped)` : ''}.`,
      results
    });
  } catch (err) {
    res.status(500).json({ error: 'Bulk import transaction failed: ' + err.message });
  }
});

// Update vehicle details
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { reg_number, owner_name, vehicle_type, manufacturer, model, operational_status, notes } = req.body;

  const current = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  if (!current) {
    return res.status(404).json({ error: 'Vehicle not found' });
  }

  if (!reg_number || !reg_number.trim()) {
    return res.status(400).json({ error: 'Vehicle registration number is required' });
  }

  if (!vehicle_type || !vehicle_type.trim()) {
    return res.status(400).json({ error: 'Vehicle type is required' });
  }

  const normalizedReg = reg_number.trim().toUpperCase().replace(/\s+/g, '-');

  // Check duplicate with other vehicles
  const existing = db.prepare('SELECT id FROM vehicles WHERE reg_number = ? COLLATE NOCASE AND id != ?').get(normalizedReg, id);
  if (existing) {
    return res.status(409).json({ error: `Registration number '${normalizedReg}' is already used by another vehicle` });
  }

  try {
    db.prepare(`
      UPDATE vehicles 
      SET reg_number = ?, owner_name = ?, vehicle_type = ?, manufacturer = ?, model = ?, operational_status = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      normalizedReg,
      owner_name ? owner_name.trim() : null,
      vehicle_type.trim(),
      manufacturer ? manufacturer.trim() : null,
      model ? model.trim() : null,
      operational_status || current.operational_status,
      notes ? notes.trim() : null,
      id
    );

    audit('Vehicles', 'UPDATE', id, `Updated vehicle details for ${normalizedReg}`);
    const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);

    res.json({
      message: `Vehicle ${normalizedReg} updated successfully.`,
      vehicle: updated
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error updating vehicle: ' + err.message });
  }
});

module.exports = router;
