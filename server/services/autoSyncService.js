/**
 * Background Automatic Synchronization Service
 * Automatically reconciles GPS telematics and shipment attendance
 * across all vehicles, daily activities, stoppages, and problems.
 */

const { syncAllOperations } = require('./syncAllOperations');
const balajiApi = require('./balajiApiService');
const { db } = require('../db/database');

function smartNorm(str) {
  if (!str) return '';
  let clean = str.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (/\d[A-Z]$/.test(clean)) {
    return clean.slice(0, -1);
  }
  return clean;
}

// Auto-sync state
let isSyncing = false;
let autoSyncIntervalTimer = null;
let gpsIntervalTimer = null;

const syncState = {
  enabled: true,
  intervalSeconds: 60, // Real-time: each and every minute for full operations sync
  gpsIntervalSeconds: 30, // 30 seconds for live GPS telematics
  lastSyncTime: null,
  lastGpsSyncTime: null,
  lastStatus: 'initialized',
  lastSummary: null,
  lastError: null,
  totalSyncCycles: 0,
  nextScheduledSync: null
};

/**
 * Execute full operations synchronization
 */
async function runFullSync(triggerSource = 'automatic') {
  if (isSyncing) {
    console.log(`[AutoSync] Sync already in progress, skipping trigger from (${triggerSource})`);
    return { skipped: true, reason: 'Sync already in progress' };
  }

  isSyncing = true;
  syncState.lastStatus = 'running';
  const startTime = Date.now();

  try {
    console.log(`[AutoSync] [${new Date().toLocaleTimeString()}] Starting ${triggerSource} operations sync...`);
    const summary = await syncAllOperations();
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    syncState.lastSyncTime = new Date().toISOString();
    syncState.lastStatus = 'success';
    syncState.lastSummary = summary;
    syncState.lastError = null;
    syncState.totalSyncCycles += 1;
    syncState.nextScheduledSync = new Date(Date.now() + syncState.intervalSeconds * 1000).toISOString();

    console.log(`[AutoSync] Finished in ${durationSec}s. Vehicles: ${summary.vehiclesOperating} Operating, ${summary.vehiclesStopped} Stopped, ${summary.vehiclesMaintenance} Maint, ${summary.vehiclesIdle} Idle.`);
    return { success: true, summary, durationSec };
  } catch (err) {
    syncState.lastStatus = 'error';
    syncState.lastError = err.message;
    console.error(`[AutoSync] Operations sync error:`, err.message);
    return { success: false, error: err.message };
  } finally {
    isSyncing = false;
  }
}

/**
 * Lightweight GPS-only status sync (runs every 2 mins between full syncs)
 */
async function runGpsOnlySync() {
  if (isSyncing) return;

  try {
    const result = await balajiApi.fetchGpsLocations();
    const gpsList = result.data || [];
    if (gpsList.length === 0) return;

    const allDbVehicles = db.prepare('SELECT id, reg_number, operational_status FROM vehicles').all();
    const dbVehicleMap = new Map();
    for (const v of allDbVehicles) {
      dbVehicleMap.set(smartNorm(v.reg_number), v);
    }

    const updateStmt = db.prepare(`
      UPDATE vehicles 
      SET operational_status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);

    let updated = 0;
    const executeGpsUpdate = db.transaction(() => {
      for (const g of gpsList) {
        const k = smartNorm(g.VehicleNo);
        const existing = dbVehicleMap.get(k);
        if (!existing) continue;

        const gpsStatus = (g.CurrentStatus || '').toLowerCase();
        let targetStatus = existing.operational_status;

        if (gpsStatus.includes('stop')) {
          targetStatus = 'stopped';
        } else if (gpsStatus.includes('run')) {
          targetStatus = 'operating';
        } else if (gpsStatus.includes('idle')) {
          targetStatus = 'idle';
        }

        if (targetStatus !== existing.operational_status) {
          updateStmt.run(targetStatus, existing.id);
          updated++;
        }
      }
    });

    executeGpsUpdate();
    syncState.lastGpsSyncTime = new Date().toISOString();
    if (updated > 0) {
      console.log(`[AutoSync-GPS] Updated ${updated} vehicle statuses from live telematics.`);
    }
  } catch (err) {
    console.warn(`[AutoSync-GPS] Fast GPS sync notice: ${err.message}`);
  }
}

/**
 * Start the background auto-sync engine
 */
function startAutoSync() {
  if (autoSyncIntervalTimer) {
    clearInterval(autoSyncIntervalTimer);
  }
  if (gpsIntervalTimer) {
    clearInterval(gpsIntervalTimer);
  }

  syncState.enabled = true;
  syncState.nextScheduledSync = new Date(Date.now() + 5000).toISOString();

  // First sync runs 5 seconds after startup
  setTimeout(() => {
    runFullSync('startup');
  }, 5000);

  // Full operations sync every 60 seconds (each and every minute)
  autoSyncIntervalTimer = setInterval(() => {
    runFullSync('scheduled_1min');
  }, syncState.intervalSeconds * 1000);

  // Fast GPS status sync every 30 seconds
  gpsIntervalTimer = setInterval(() => {
    runGpsOnlySync();
  }, syncState.gpsIntervalSeconds * 1000);

  console.log(`[AutoSync] Real-Time Auto-Sync Engine active (Full Operations: every 1 minute, GPS: every 30s).`);
}

/**
 * Stop background auto-sync
 */
function stopAutoSync() {
  if (autoSyncIntervalTimer) clearInterval(autoSyncIntervalTimer);
  if (gpsIntervalTimer) clearInterval(gpsIntervalTimer);
  autoSyncIntervalTimer = null;
  gpsIntervalTimer = null;
  syncState.enabled = false;
  console.log(`[AutoSync] Background Auto-Sync stopped.`);
}

/**
 * Get current auto-sync status
 */
function getSyncStatus() {
  return {
    ...syncState,
    isSyncing
  };
}

module.exports = {
  startAutoSync,
  stopAutoSync,
  getSyncStatus,
  runFullSync
};

