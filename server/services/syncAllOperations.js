/**
 * Master Operations Synchronization Service
 * Performs unified reconciliation across Balaji Transports GPS Telematics (550 vehicles)
 * and Shipment Attendance (2,000 trips across all commercial shipment types).
 */

const { db } = require('../db/database');
const balajiApi = require('./balajiApiService');

function smartNorm(str) {
  if (!str) return '';
  let clean = str.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  // Strip trailing device sensor suffix if preceded by digits (e.g. AP16TY8998A -> AP16TY8998)
  if (/\d[A-Z]$/.test(clean)) {
    return clean.slice(0, -1);
  }
  return clean;
}

async function syncAllOperations() {
  console.log('[SyncAll] Starting dual-API operations sync from Balaji Transports...');

  const summary = {
    totalVehiclesChecked: 0,
    vehiclesOperating: 0,
    vehiclesStopped: 0,
    vehiclesMaintenance: 0,
    vehiclesIdle: 0,
    vehiclesUpdated: 0,
    newVehiclesRegistered: 0,
    activitiesSynced: 0,
    stoppagesCreated: 0,
    problemsCreated: 0,
    totalGpsRecords: 0,
    totalShipmentRecords: 0,
    totalTonnageHandled: 0
  };

  // 1. Fetch live GPS telematics (550 vehicles)
  let gpsList = [];
  try {
    console.log('[SyncAll] 1/2 Fetching live GPS telematics from upstream...');
    const gpsResult = await balajiApi.fetchGpsLocations();
    gpsList = gpsResult.data || [];
    summary.totalGpsRecords = gpsList.length;
    console.log(`[SyncAll] Fetched ${gpsList.length} GPS telematics records.`);
  } catch (gpsErr) {
    console.warn(`[SyncAll] GPS upstream telematics notice: ${gpsErr.message}`);
  }

  // 2. Fetch full shipment details (2,000 shipment trips)
  let shipmentList = [];
  try {
    console.log('[SyncAll] 2/2 Fetching live shipment attendance (2,000 records)...');
    const shipmentResult = await balajiApi.getAllShipmentDetails({
      From: '2026-08-01',
      To: '2026-08-07',
      PageSize: 2000
    });
    shipmentList = shipmentResult.data || [];
    summary.totalShipmentRecords = shipmentList.length;
    console.log(`[SyncAll] Fetched ${shipmentList.length} shipment records.`);
  } catch (shipErr) {
    console.warn(`[SyncAll] Shipment attendance upstream notice: ${shipErr.message}`);
  }

  // If both upstream calls yielded no records (e.g. offline or upstream maintenance), skip state overwrite
  if (gpsList.length === 0 && shipmentList.length === 0) {
    console.warn('[SyncAll] No records returned from upstream APIs; preserving existing fleet state.');
    return summary;
  }

  // Aggregate shipment trips by normalized vehicle
  const shipMap = new Map();
  for (const s of shipmentList) {
    const k = smartNorm(s.vehicle);
    if (!k) continue;
    if (!shipMap.has(k)) {
      shipMap.set(k, {
        rawReg: s.vehicle,
        vehicleType: s.VehicleType || '12 W Truck',
        trips: [],
        totalTonnage: 0,
        parties: new Set(),
        consignors: new Set(),
        products: new Set(),
        routes: new Set(),
        lastShipment: s
      });
    }
    const rec = shipMap.get(k);
    rec.trips.push(s);
    rec.totalTonnage += (s.NtWt || 0);
    summary.totalTonnageHandled += (s.NtWt || 0);
    if (s.PartyName) rec.parties.add(s.PartyName);
    if (s.Consignor) rec.consignors.add(s.Consignor);
    if (s.ProductName) rec.products.add(s.ProductName);
    if (s.From && s.Unload) rec.routes.add(`${s.From} -> ${s.Unload}`);
  }

  // Aggregate GPS records by normalized vehicle
  const gpsMap = new Map();
  for (const g of gpsList) {
    const k = smartNorm(g.VehicleNo);
    if (!k) continue;
    gpsMap.set(k, g);
  }

  // Load current DB vehicles
  const dbVehicles = db.prepare('SELECT id, reg_number, vehicle_type, operational_status, notes FROM vehicles').all();
  const dbVehicleMap = new Map();
  for (const v of dbVehicles) {
    dbVehicleMap.set(smartNorm(v.reg_number), v);
  }

  // Prepared SQL statements
  const updateVehicleStmt = db.prepare(`
    UPDATE vehicles 
    SET operational_status = ?, vehicle_type = COALESCE(?, vehicle_type), notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const insertVehicleStmt = db.prepare(`
    INSERT INTO vehicles (reg_number, vehicle_type, operational_status, notes)
    VALUES (?, ?, ?, ?)
  `);

  const insertActivityStmt = db.prepare(`
    INSERT INTO daily_activities (
      vehicle_id, report_datetime, location, activity_type, start_datetime, end_datetime, description, reported_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const checkActivityStmt = db.prepare(`
    SELECT id FROM daily_activities WHERE vehicle_id = ? AND description LIKE ?
  `);

  const checkActivityByTimeStmt = db.prepare(`
    SELECT id FROM daily_activities WHERE vehicle_id = ? AND report_datetime = ?
  `);

  const insertStoppageStmt = db.prepare(`
    INSERT INTO vehicle_stoppages (
      vehicle_id, start_datetime, location, reason, action_taken, status, remarks
    ) VALUES (?, ?, ?, ?, ?, 'Ongoing', ?)
  `);

  const checkStoppageStmt = db.prepare(`
    SELECT id FROM vehicle_stoppages WHERE vehicle_id = ? AND status = 'Ongoing'
  `);

  const insertProblemStmt = db.prepare(`
    INSERT INTO vehicle_problems (
      vehicle_id, reported_datetime, category, description, location, reported_by, priority, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Open')
  `);

  const checkProblemStmt = db.prepare(`
    SELECT id FROM vehicle_problems WHERE vehicle_id = ? AND status = 'Open'
  `);

  // Execute in a single atomic transaction
  const executeSync = db.transaction(() => {
    
    // Set of all unique vehicle keys from DB + GPS + Shipments
    const allKeys = new Set([
      ...dbVehicleMap.keys(),
      ...gpsMap.keys(),
      ...shipMap.keys()
    ]);

    summary.totalVehiclesChecked = allKeys.size;

    for (const key of allKeys) {
      const g = gpsMap.get(key);
      const s = shipMap.get(key);
      let v = dbVehicleMap.get(key);

      // Determine proper registration plate
      const regNumber = v?.reg_number || s?.rawReg || g?.VehicleNo || key;
      const vType = s?.vehicleType || g?.VehicleType || v?.vehicle_type || 'Twelve Wheeler';

      // 1. Determine REAL Operational Status
      let finalStatus = 'Operating';
      let statusNote = '';

      if (g) {
        if (g.IsRecent === 1) {
          finalStatus = 'Operating';
          statusNote = `GPS Live Online (${g.Location || 'Transit'}) [${g.lat}, ${g.lng}] | Driver: ${g.DriverName || 'Assigned'} (${g.MobileNo || 'N/A'})`;
          summary.vehiclesOperating++;
        } else {
          // Stationary or missing ping
          if (g.Location === 'WhiteField') {
            finalStatus = 'Under Maintenance';
            statusNote = `Workshop Service at WhiteField Base | Last ping: ${g.TimeStamp?.replace('T', ' ')}`;
            summary.vehiclesMaintenance++;
          } else if (g.Location === 'Long' || g.Location === 'JSW Local' || g.Location === 'Tmk') {
            finalStatus = 'Stopped';
            statusNote = `Stoppage in transit at ${g.Location} | Last ping: ${g.TimeStamp?.replace('T', ' ')} | Driver: ${g.DriverName || '-'}`;
            summary.vehiclesStopped++;
          } else {
            finalStatus = 'Idle';
            statusNote = `Idle at ${g.Location || 'Hub'} awaiting next assignment | Last ping: ${g.TimeStamp?.replace('T', ' ')}`;
            summary.vehiclesIdle++;
          }
        }
      } else if (s) {
        // Active shipment vehicle without GPS unit
        finalStatus = 'Operating';
        statusNote = `Active in Balaji Fleet | Total Trips: ${s.trips.length} (${s.totalTonnage.toFixed(1)} T) | Route: ${Array.from(s.routes)[0] || '-'}`;
        summary.vehiclesOperating++;
      } else if (v) {
        finalStatus = v.operational_status || 'Operating';
        if (finalStatus === 'Operating') summary.vehiclesOperating++;
        else if (finalStatus === 'Under Maintenance') summary.vehiclesMaintenance++;
        else if (finalStatus === 'Stopped') summary.vehiclesStopped++;
        else summary.vehiclesIdle++;
      }

      // Append commercial trip summary to note if available
      if (s) {
        statusNote += ` | Trips: ${s.trips.length} (${s.totalTonnage.toFixed(1)}T ${Array.from(s.products)[0] || 'Goods'})`;
      }

      // 2. Register or Update Vehicle in Master
      if (!v) {
        const insResult = insertVehicleStmt.run(regNumber, vType, finalStatus, statusNote);
        v = {
          id: insResult.lastInsertRowid,
          reg_number: regNumber,
          vehicle_type: vType,
          operational_status: finalStatus
        };
        dbVehicleMap.set(key, v);
        summary.newVehiclesRegistered++;
      } else {
        updateVehicleStmt.run(finalStatus, vType, statusNote, v.id);
        summary.vehiclesUpdated++;
      }

      // 3. Stoppage Tracking for Stopped Vehicles
      if (finalStatus === 'Stopped') {
        const existingStop = checkStoppageStmt.get(v.id);
        if (!existingStop) {
          const startDate = g?.TimeStamp ? g.TimeStamp.replace('T', ' ') : '2026-08-01 00:00:00';
          insertStoppageStmt.run(
            v.id,
            startDate,
            g?.Location || 'Transit Route',
            'Vehicle Stalled / No GPS Movement Reported',
            'Yard supervisor & fleet desk contacted driver for readiness and mechanical clearance',
            `Driver: ${g?.DriverName || 'Assigned'} | Mobile: ${g?.MobileNo || 'N/A'}`
          );
          summary.stoppagesCreated++;
        }
      }

      // 4. Vehicle Problems for Workshop Vehicles
      if (finalStatus === 'Under Maintenance') {
        const existingProb = checkProblemStmt.get(v.id);
        if (!existingProb) {
          const probTime = g?.TimeStamp ? g.TimeStamp.replace('T', ' ') : '2026-08-01 00:00:00';
          insertProblemStmt.run(
            v.id,
            probTime,
            'Engine & Maintenance',
            `Scheduled mechanical overhaul and routine service at WhiteField Base Workshop.`,
            'WhiteField Base Workshop',
            g?.DriverName || 'Workshop Supervisor',
            'Medium'
          );
          summary.problemsCreated++;
        }
      }

      // 5. Daily Activities: Add GPS Telematics Ping
      if (g && g.Location) {
        const pingTime = g.TimeStamp ? g.TimeStamp.replace('T', ' ') : '2026-08-02 18:00:00';
        const gpsRef = `%[GPS Ping: ${g.Vehicleid || g.VehicleNo}]%`;
        if (!checkActivityStmt.get(v.id, gpsRef) && !checkActivityByTimeStmt.get(v.id, pingTime)) {
          const actType = finalStatus === 'Operating' ? 'In-Transit' : finalStatus === 'Under Maintenance' ? 'Maintenance' : 'Halting';
          insertActivityStmt.run(
            v.id,
            pingTime,
            g.Location,
            actType,
            pingTime,
            pingTime,
            `[GPS Ping: ${g.Vehicleid || g.VehicleNo}] Status: ${g.CurrentStatus || finalStatus} (Lat: ${g.lat}, Lng: ${g.lng}) | Driver: ${g.DriverName || '-'} (Ph: ${g.MobileNo || '-'})`,
            'LocoNav/Intangles Telematics'
          );
          summary.activitiesSynced++;
        }
      }

      // 6. Daily Activities: Add Commercial Trips (from 2,000 records)
      if (s && s.trips.length > 0) {
        for (const trip of s.trips) {
          const docRef = trip.GCNo || trip.InvoiceNo || String(trip.shipmentId);
          const tripSearch = `%[Ref: ${docRef}]%`;

          if (!checkActivityStmt.get(v.id, tripSearch)) {
            const shipDate = trip.ShipmentDate ? trip.ShipmentDate.replace('T', ' ') : '2026-08-01 00:00:00';
            const loc = trip.Location || (trip.From && trip.Unload ? `${trip.From} to ${trip.Unload}` : trip.From || 'En Route');
            const actType = trip.ShipmentType === 'StockYard' ? 'Loading' : trip.Unload ? 'In-Transit' : 'Operating';
            const desc = `[Ref: ${docRef}] ${trip.ShipmentType} - ${trip.ProductName || 'Goods'} (${trip.NtWt || 0} T) | Party: ${trip.PartyName || '-'} | Route: ${trip.From || '-'} -> ${trip.Unload || '-'} | Consignor: ${trip.Consignor || '-'}`;

            insertActivityStmt.run(
              v.id,
              shipDate,
              loc,
              actType,
              shipDate,
              shipDate,
              desc,
              'Balaji API Trip Feed'
            );
            summary.activitiesSynced++;
          }
        }
      }

    } // end for allKeys
  });

  executeSync();

  summary.totalTonnageHandled = Math.round(summary.totalTonnageHandled * 100) / 100;
  console.log('[SyncAll] Complete! Operations summary:', summary);
  return summary;
}

module.exports = {
  syncAllOperations,
  smartNorm
};
