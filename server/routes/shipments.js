const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const balajiApi = require('../services/balajiApiService');
const { syncAllOperations, smartNorm } = require('../services/syncAllOperations');
const autoSyncService = require('../services/autoSyncService');

/**
 * GET /api/shipments/status
 * Check upstream API connectivity and login status
 */
router.get('/status', async (req, res) => {
  try {
    let status = balajiApi.getApiStatus();
    if (!status.connected) {
      await balajiApi.authenticate();
      status = balajiApi.getApiStatus();
    }
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/shipments/fetch
 * Fetch shipment details from Balaji Transports upstream API
 */
router.get('/fetch', async (req, res) => {
  try {
    const {
      From = '2026-08-01',
      To = '2026-08-07',
      VehicleID = '',
      shipmentType = 'Prepaid,Rake,StockYard,To-Pay,Internal,Dolvi,BMM',
      PageNumber = 1,
      PageSize = 2000
    } = req.query;

    const result = await balajiApi.getAllShipmentDetails({
      From,
      To,
      VehicleID,
      shipmentType,
      PageNumber: parseInt(PageNumber) || 1,
      PageSize: parseInt(PageSize) || 2000
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[Shipments API Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/shipments/sync-activities
 * Imports shipment records into FleetPulse Daily Activities
 */
router.post('/sync-activities', async (req, res) => {
  try {
    let shipments = req.body.shipments;
    
    // If no shipments passed directly, fetch using query or date params
    if (!Array.isArray(shipments) || shipments.length === 0) {
      const { From = '2026-08-01', To = '2026-08-07', shipmentType } = req.body;
      const fetched = await balajiApi.getAllShipmentDetails({
        From,
        To,
        shipmentType: shipmentType || 'Prepaid,Rake,StockYard,To-Pay,Internal,Dolvi,BMM',
        PageSize: 1000
      });
      shipments = fetched.data;
    }

    if (!shipments || shipments.length === 0) {
      return res.json({ success: true, count: 0, message: 'No shipments available to sync.' });
    }

    let vehiclesAdded = 0;
    let activitiesAdded = 0;
    let skipped = 0;

    const allDbVehicles = db.prepare('SELECT id, reg_number FROM vehicles').all();
    const dbVehicleMap = new Map();
    for (const v of allDbVehicles) {
      dbVehicleMap.set(smartNorm(v.reg_number), v);
    }

    const insertVehicleStmt = db.prepare(`
      INSERT INTO vehicles (reg_number, vehicle_type, operational_status, notes)
      VALUES (?, ?, 'Operating', 'Auto-imported from Balaji API Shipment')
    `);

    const checkActivityStmt = db.prepare(`
      SELECT id FROM daily_activities 
      WHERE vehicle_id = ? AND description LIKE ?
    `);

    const insertActivityStmt = db.prepare(`
      INSERT INTO daily_activities (
        vehicle_id, report_datetime, location, activity_type, start_datetime, end_datetime, description, reported_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const runSync = db.transaction(() => {
      for (const item of shipments) {
        const regNo = (item.vehicle || '').trim();
        if (!regNo) continue;

        // 1. Ensure vehicle exists using smart normalization
        const normKey = smartNorm(regNo);
        let vRow = dbVehicleMap.get(normKey);
        if (!vRow) {
          const type = item.VehicleType?.trim() || 'Heavy Commercial Vehicle';
          const insRes = insertVehicleStmt.run(regNo, type);
          vRow = { id: insRes.lastInsertRowid, reg_number: regNo };
          dbVehicleMap.set(normKey, vRow);
          vehiclesAdded++;
        }

        if (!vRow) continue;

        // 2. Prevent duplicate entries using unique GC/Invoice reference
        const docRef = item.GCNo || item.InvoiceNo || String(item.shipmentId);
        const searchPattern = `%[Ref: ${docRef}]%`;
        const exists = checkActivityStmt.get(vRow.id, searchPattern);
        if (exists) {
          skipped++;
          continue;
        }

        // Format activity details
        const shipDate = item.ShipmentDate ? item.ShipmentDate.replace('T', ' ') : new Date().toISOString().replace('T', ' ').slice(0, 19);
        const location = item.Location || (item.From && item.Unload ? `${item.From} to ${item.Unload}` : item.From || 'En Route');
        const actType = item.ShipmentType === 'StockYard' ? 'Loading' : (item.Unload ? 'In-Transit' : 'Operating');
        const desc = `[Ref: ${docRef}] ${item.ShipmentType || 'Shipment'} - ${item.ProductName || 'Goods'} (${item.NtWt || item.GrossWt || 0} T) | Party: ${item.PartyName || '-'} | Route: ${item.From || '-'} -> ${item.Unload || '-'} | Driver: ${item.Driver || '-'}`;

        insertActivityStmt.run(
          vRow.id,
          shipDate,
          location,
          actType,
          shipDate,
          shipDate,
          desc,
          'Balaji API Sync (Raghu)'
        );
        activitiesAdded++;
      }
    });

    runSync();

    res.json({
      success: true,
      activitiesAdded,
      vehiclesAdded,
      skipped,
      message: `Successfully synced ${activitiesAdded} operational activities and registered ${vehiclesAdded} new vehicles.`
    });
  } catch (err) {
    console.error('[Sync Activities Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/shipments/sync-vehicles
 * Extracts all unique vehicles from Balaji shipments and adds them to Vehicle Master
 */
router.post('/sync-vehicles', async (req, res) => {
  try {
    const { From = '2026-08-01', To = '2026-08-07' } = req.body;
    const fetched = await balajiApi.getAllShipmentDetails({ From, To, PageSize: 2000 });
    const shipments = fetched.data || [];

    const insertVehicleStmt = db.prepare(`
      INSERT OR IGNORE INTO vehicles (reg_number, vehicle_type, operational_status, notes)
      VALUES (?, ?, 'Operating', 'Auto-registered from Balaji Transports API')
    `);

    let count = 0;
    const uniqueMap = new Map();
    for (const item of shipments) {
      const reg = (item.vehicle || '').trim();
      if (reg && !uniqueMap.has(reg)) {
        uniqueMap.set(reg, item.VehicleType?.trim() || 'Heavy Commercial Vehicle');
      }
    }

    const runImport = db.transaction(() => {
      for (const [reg, vType] of uniqueMap.entries()) {
        const result = insertVehicleStmt.run(reg, vType);
        if (result.changes > 0) count++;
      }
    });

    runImport();

    res.json({
      success: true,
      vehiclesAdded: count,
      totalUniqueInShipments: uniqueMap.size,
      message: `Identified ${uniqueMap.size} unique fleet vehicles; imported ${count} new vehicles into Vehicle Master.`
    });
  } catch (err) {
    console.error('[Sync Vehicles Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/shipments/gps
 * Live GPS Fleet Locations from LocoNav & Intangles Telematics API
 */
router.get('/gps', async (req, res) => {
  try {
    const result = await balajiApi.fetchGpsLocations(req.query);
    res.json(result);
  } catch (err) {
    console.error('[GPS API Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/shipments/gps/sync-status
 * Automatically syncs live GPS vehicle status (Running, Stopped, Idle) and location into FleetPulse
 */
router.post('/gps/sync-status', async (req, res) => {
  try {
    const result = await balajiApi.fetchGpsLocations();
    const gpsList = result.data || [];

    if (gpsList.length === 0) {
      return res.json({ success: true, count: 0, message: 'No GPS records returned from telematics API.' });
    }

    // Load all vehicles from database
    const allDbVehicles = db.prepare('SELECT id, reg_number, operational_status FROM vehicles').all();
    const dbVehicleMap = new Map();
    for (const v of allDbVehicles) {
      dbVehicleMap.set(smartNorm(v.reg_number), v);
    }

    const updateStatusStmt = db.prepare(`
      UPDATE vehicles 
      SET operational_status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);

    const checkGpsActivityStmt = db.prepare(`
      SELECT id FROM daily_activities 
      WHERE vehicle_id = ? AND report_datetime = ?
    `);

    const insertActivityStmt = db.prepare(`
      INSERT INTO daily_activities (
        vehicle_id, report_datetime, location, activity_type, start_datetime, description, reported_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let updatedCount = 0;
    let runningCount = 0;
    let stoppedCount = 0;
    let idleCount = 0;

    const runSync = db.transaction(() => {
      for (const item of gpsList) {
        const normNo = smartNorm(item.VehicleNo);
        const dbV = dbVehicleMap.get(normNo);

        if (!dbV) continue;

        let newStatus = 'Operating';
        let activityType = 'In-Transit';

        const rawStatus = (item.CurrentStatus || '').toLowerCase();
        if (rawStatus.includes('stop')) {
          newStatus = 'Stopped';
          activityType = 'Halting';
          stoppedCount++;
        } else if (rawStatus.includes('idle')) {
          newStatus = 'Idle';
          activityType = 'Halting';
          idleCount++;
        } else {
          newStatus = 'Operating';
          activityType = 'In-Transit';
          runningCount++;
        }

        // Update vehicle operational status
        updateStatusStmt.run(newStatus, dbV.id);
        updatedCount++;

        // Record location snapshot if location exists and not already recorded for this ping
        if (item.Location) {
          const nowStr = item.TimeStamp ? item.TimeStamp.replace('T', ' ') : new Date().toISOString().replace('T', ' ').slice(0, 19);
          if (!checkGpsActivityStmt.get(dbV.id, nowStr)) {
            insertActivityStmt.run(
              dbV.id,
              nowStr,
              item.Location,
              activityType,
              nowStr,
              `[Live GPS: ${item.CurrentStatus || 'Active'}] Lat: ${item.lat}, Lng: ${item.lng} | Driver: ${item.DriverName || '-'}`,
              'LocoNav/Intangles GPS'
            );
          }
        }
      }
    });

    runSync();

    res.json({
      success: true,
      updatedCount,
      runningCount,
      stoppedCount,
      idleCount,
      totalGpsVehicles: gpsList.length,
      message: `Successfully synchronized ${updatedCount} vehicles with real-time GPS (${runningCount} Running, ${stoppedCount} Stopped, ${idleCount} Idle).`
    });
  } catch (err) {
    console.error('[GPS Sync Status Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/shipments/auto-sync-status
 * Get the live auto-sync service status, timestamps, and statistics
 */
router.get('/auto-sync-status', (req, res) => {
  try {
    const status = autoSyncService.getSyncStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/shipments/trigger-sync
 * Trigger an immediate on-demand synchronization cycle
 */
router.post('/trigger-sync', async (req, res) => {
  try {
    const result = await autoSyncService.runFullSync('manual_user_action');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/shipments/sync-all-operations
 * Synchronizes ALL operations (Vehicles, Daily Operations, Stoppages, Problems) from APIs
 */
router.post('/sync-all-operations', async (req, res) => {
  try {
    const result = await autoSyncService.runFullSync('dashboard_action');
    if (result.success) {
      res.json({
        success: true,
        summary: result.summary,
        message: 'All operations successfully updated as per live API data.'
      });
    } else {
      res.status(500).json({ success: false, error: result.error || result.reason });
    }
  } catch (err) {
    console.error('[Sync All Operations Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

