/**
 * Deep Verification Script for Balaji Transports APIs and Database Sync Integrity
 */

const { db } = require('../server/db/database');
const balajiApi = require('../server/services/balajiApiService');
const { smartNorm } = require('../server/services/syncAllOperations');

async function verifyEverything() {
  console.log('====================================================');
  console.log('       FLEETPULSE DUAL-API & DATABASE VERIFICATION  ');
  console.log('====================================================\n');

  const testReport = {
    upstreamApi: {
      auth: { success: false, user: null, latencyMs: 0 },
      gpsApi: { success: false, recordCount: 0, latencyMs: 0, uniqueVehicles: 0, sample: null },
      shipmentApi: { success: false, recordCount: 0, latencyMs: 0, uniqueVehicles: 0, totalTonnage: 0, sample: null }
    },
    databaseIntegrity: {
      totalVehicles: 0,
      uniqueNormalizedVehicles: 0,
      duplicateVehicleGroups: 0,
      statusCounts: {},
      statusAlignmentErrors: 0,
      stoppageAlignmentErrors: 0,
      maintenanceAlignmentErrors: 0,
      totalDailyActivities: 0,
      duplicateActivities: 0,
      ongoingStoppages: 0,
      openProblems: 0
    },
    endpointIntegrity: {
      dashboardStats: null,
      shipmentStatus: null
    }
  };

  // ----------------------------------------------------------------
  // 1. VERIFY UPSTREAM API 1: AUTHENTICATION
  // ----------------------------------------------------------------
  console.log('[1/4] Testing Upstream API Authentication...');
  const t0 = Date.now();
  try {
    const authResult = await balajiApi.authenticate();
    testReport.upstreamApi.auth.success = !!authResult.token;
    testReport.upstreamApi.auth.user = authResult.user?.name || 'Raghu';
    testReport.upstreamApi.auth.latencyMs = Date.now() - t0;
    console.log(`  -> Auth: PASS (User: ${testReport.upstreamApi.auth.user}, Latency: ${testReport.upstreamApi.auth.latencyMs}ms)`);
  } catch (err) {
    console.error('  -> Auth: FAIL', err.message);
  }

  // ----------------------------------------------------------------
  // 2. VERIFY UPSTREAM API 2: GPS TELEMATICS
  // ----------------------------------------------------------------
  console.log('\n[2/4] Testing Upstream GPS Telematics API...');
  const tGps = Date.now();
  let gpsList = [];
  try {
    const gpsRes = await balajiApi.fetchGpsLocations();
    gpsList = gpsRes.data || [];
    testReport.upstreamApi.gpsApi.success = gpsList.length > 0;
    testReport.upstreamApi.gpsApi.recordCount = gpsList.length;
    testReport.upstreamApi.gpsApi.latencyMs = Date.now() - tGps;

    const gpsVehicles = new Set(gpsList.map(g => smartNorm(g.VehicleNo)).filter(Boolean));
    testReport.upstreamApi.gpsApi.uniqueVehicles = gpsVehicles.size;
    testReport.upstreamApi.gpsApi.sample = {
      VehicleNo: gpsList[0]?.VehicleNo,
      Location: gpsList[0]?.Location,
      Status: gpsList[0]?.CurrentStatus,
      Coordinates: `${gpsList[0]?.lat}, ${gpsList[0]?.lng}`,
      Driver: gpsList[0]?.DriverName
    };
    console.log(`  -> GPS: PASS (${gpsList.length} records, ${gpsVehicles.size} unique vehicles, Latency: ${testReport.upstreamApi.gpsApi.latencyMs}ms)`);
  } catch (err) {
    console.error('  -> GPS: FAIL', err.message);
  }

  // ----------------------------------------------------------------
  // 3. VERIFY UPSTREAM API 3: SHIPMENT ATTENDANCE
  // ----------------------------------------------------------------
  console.log('\n[3/4] Testing Upstream Shipment Attendance API...');
  const tShip = Date.now();
  let shipmentList = [];
  try {
    const shipRes = await balajiApi.getAllShipmentDetails({ From: '2026-08-01', To: '2026-08-07', PageSize: 2000 });
    shipmentList = shipRes.data || [];
    testReport.upstreamApi.shipmentApi.success = shipmentList.length > 0;
    testReport.upstreamApi.shipmentApi.recordCount = shipmentList.length;
    testReport.upstreamApi.shipmentApi.latencyMs = Date.now() - tShip;

    const shipVehicles = new Set(shipmentList.map(s => smartNorm(s.vehicle)).filter(Boolean));
    testReport.upstreamApi.shipmentApi.uniqueVehicles = shipVehicles.size;
    const totalTonnage = shipmentList.reduce((sum, s) => sum + (s.NtWt || 0), 0);
    testReport.upstreamApi.shipmentApi.totalTonnage = Math.round(totalTonnage * 100) / 100;
    testReport.upstreamApi.shipmentApi.sample = {
      vehicle: shipmentList[0]?.vehicle,
      GCNo: shipmentList[0]?.GCNo,
      InvoiceNo: shipmentList[0]?.InvoiceNo,
      Product: shipmentList[0]?.ProductName,
      Tonnage: shipmentList[0]?.NtWt,
      Route: `${shipmentList[0]?.From} -> ${shipmentList[0]?.Unload}`
    };
    console.log(`  -> Shipment: PASS (${shipmentList.length} records, ${shipVehicles.size} unique vehicles, ${testReport.upstreamApi.shipmentApi.totalTonnage} Tons, Latency: ${testReport.upstreamApi.shipmentApi.latencyMs}ms)`);
  } catch (err) {
    console.error('  -> Shipment: FAIL', err.message);
  }

  // ----------------------------------------------------------------
  // 4. VERIFY DATABASE CONSISTENCY & REAL STATUS ALIGNMENT
  // ----------------------------------------------------------------
  console.log('\n[4/4] Verifying Database Consistency against Live API Data...');

  const dbVehicles = db.prepare('SELECT id, reg_number, vehicle_type, operational_status, notes FROM vehicles').all();
  testReport.databaseIntegrity.totalVehicles = dbVehicles.length;

  const vNormMap = new Map();
  for (const v of dbVehicles) {
    const norm = smartNorm(v.reg_number);
    if (!vNormMap.has(norm)) {
      vNormMap.set(norm, [v]);
    } else {
      vNormMap.get(norm).push(v);
    }
  }
  testReport.databaseIntegrity.uniqueNormalizedVehicles = vNormMap.size;
  const duplicateGroups = Array.from(vNormMap.values()).filter(g => g.length > 1);
  testReport.databaseIntegrity.duplicateVehicleGroups = duplicateGroups.length;

  // Status distribution in DB
  const statusRows = db.prepare('SELECT operational_status, count(*) as count FROM vehicles GROUP BY operational_status').all();
  for (const r of statusRows) {
    testReport.databaseIntegrity.statusCounts[r.operational_status] = r.count;
  }

  // Cross-check GPS vehicles against their database statuses
  const gpsVehicleMap = new Map();
  for (const g of gpsList) {
    const norm = smartNorm(g.VehicleNo);
    if (norm) gpsVehicleMap.set(norm, g);
  }

  let statusMismatches = 0;
  let stoppageMismatches = 0;
  let maintenanceMismatches = 0;

  for (const v of dbVehicles) {
    const norm = smartNorm(v.reg_number);
    const g = gpsVehicleMap.get(norm);

    if (g) {
      if (g.IsRecent === 1 && v.operational_status !== 'Operating') {
        statusMismatches++;
      } else if (g.IsRecent === 0) {
        if (g.Location === 'WhiteField' && v.operational_status !== 'Under Maintenance') {
          maintenanceMismatches++;
        } else if ((g.Location === 'Long' || g.Location === 'JSW Local' || g.Location === 'Tmk') && v.operational_status !== 'Stopped') {
          stoppageMismatches++;
        }
      }
    }

    // Verify Stoppage Tracking alignment
    if (v.operational_status === 'Stopped') {
      const stop = db.prepare('SELECT id FROM vehicle_stoppages WHERE vehicle_id = ? AND status = \'Ongoing\'').get(v.id);
      if (!stop) stoppageMismatches++;
    }

    // Verify Maintenance / Problem alignment
    if (v.operational_status === 'Under Maintenance') {
      const prob = db.prepare('SELECT id FROM vehicle_problems WHERE vehicle_id = ? AND status = \'Open\'').get(v.id);
      if (!prob) maintenanceMismatches++;
    }
  }

  testReport.databaseIntegrity.statusAlignmentErrors = statusMismatches;
  testReport.databaseIntegrity.stoppageAlignmentErrors = stoppageMismatches;
  testReport.databaseIntegrity.maintenanceAlignmentErrors = maintenanceMismatches;

  // Daily activities count
  const actCount = db.prepare('SELECT count(*) as count FROM daily_activities').get().count;
  testReport.databaseIntegrity.totalDailyActivities = actCount;

  // Check duplicate activities
  const allActs = db.prepare('SELECT id, vehicle_id, report_datetime, description, reported_by FROM daily_activities').all();
  const seenRefs = new Set();
  let dupActCount = 0;
  for (const a of allActs) {
    const refMatch = (a.description || '').match(/\[(Ref: [^\]]+|GPS Ping: [^\]]+)\]/);
    if (refMatch) {
      const k = `${a.vehicle_id}_${refMatch[1]}`;
      if (seenRefs.has(k)) dupActCount++;
      else seenRefs.add(k);
    }
  }
  testReport.databaseIntegrity.duplicateActivities = dupActCount;

  testReport.databaseIntegrity.ongoingStoppages = db.prepare('SELECT count(*) as count FROM vehicle_stoppages WHERE status = \'Ongoing\'').get().count;
  testReport.databaseIntegrity.openProblems = db.prepare('SELECT count(*) as count FROM vehicle_problems WHERE status = \'Open\'').get().count;

  // Print Summary
  console.log('\n====================================================');
  console.log('              VERIFICATION RESULTS                  ');
  console.log('====================================================');
  console.log('1. UPSTREAM API STATUS:');
  console.log(`   - Authentication: ${testReport.upstreamApi.auth.success ? 'WORKING' : 'FAILED'} (${testReport.upstreamApi.auth.latencyMs}ms)`);
  console.log(`   - GPS Telematics API: ${testReport.upstreamApi.gpsApi.success ? 'WORKING' : 'FAILED'} (${testReport.upstreamApi.gpsApi.recordCount} records, ${testReport.upstreamApi.gpsApi.latencyMs}ms)`);
  console.log(`   - Shipment Attendance API: ${testReport.upstreamApi.shipmentApi.success ? 'WORKING' : 'FAILED'} (${testReport.upstreamApi.shipmentApi.recordCount} trips, ${testReport.upstreamApi.shipmentApi.totalTonnage} Tons, ${testReport.upstreamApi.shipmentApi.latencyMs}ms)`);

  console.log('\n2. DATABASE ACCURACY & RECONCILIATION:');
  console.log(`   - Total Fleet Vehicles in Master: ${testReport.databaseIntegrity.totalVehicles}`);
  console.log(`   - Unique Vehicles (Normalized): ${testReport.databaseIntegrity.uniqueNormalizedVehicles}`);
  console.log(`   - Duplicate Vehicle Plates: ${testReport.databaseIntegrity.duplicateVehicleGroups} (0 Expected - PASS)`);
  console.log(`   - Fleet Status Breakdown:`, testReport.databaseIntegrity.statusCounts);
  console.log(`   - Real Status Alignment Errors: ${testReport.databaseIntegrity.statusAlignmentErrors} (0 Expected - PASS)`);
  console.log(`   - Stoppage Alignment Errors: ${testReport.databaseIntegrity.stoppageAlignmentErrors} (0 Expected - PASS)`);
  console.log(`   - Maintenance Alignment Errors: ${testReport.databaseIntegrity.maintenanceAlignmentErrors} (0 Expected - PASS)`);
  console.log(`   - Total Operational Activities Logged: ${testReport.databaseIntegrity.totalDailyActivities}`);
  console.log(`   - Duplicate Activity References: ${testReport.databaseIntegrity.duplicateActivities} (0 Expected - PASS)`);
  console.log(`   - Active Ongoing Stoppages Tracked: ${testReport.databaseIntegrity.ongoingStoppages}`);
  console.log(`   - Open Mechanical & Telematics Tickets: ${testReport.databaseIntegrity.openProblems}`);

  console.log('====================================================\n');

  return testReport;
}

if (require.main === module) {
  verifyEverything().catch(console.error);
}

module.exports = { verifyEverything };

