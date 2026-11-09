/**
 * Comprehensive Deduplication Service
 * 1. Merges duplicate vehicles (e.g. AP-02-TB-3799 vs AP02TB3799A)
 * 2. Re-points foreign keys in daily_activities, vehicle_stoppages, vehicle_problems
 * 3. Deduplicates redundant GPS pings and shipment trips in daily_activities
 * 4. Deduplicates any redundant stoppages and problems
 */

const { db } = require('../server/db/database');
const { smartNorm } = require('../server/services/syncAllOperations');

function runDeduplication() {
  console.log('=== STARTING DEDUPLICATION PROCESS ===');

  const report = {
    vehiclesMerged: 0,
    duplicateVehiclesDeleted: 0,
    activitiesRepointed: 0,
    stoppagesRepointed: 0,
    problemsRepointed: 0,
    duplicateActivitiesRemoved: 0,
    duplicateStoppagesRemoved: 0,
    duplicateProblemsRemoved: 0,
    finalVehicleCount: 0,
    finalActivityCount: 0,
    finalStoppageCount: 0,
    finalProblemCount: 0
  };

  const execute = db.transaction(() => {
    // -------------------------------------------------------------
    // STEP 1: MERGE DUPLICATE VEHICLES
    // -------------------------------------------------------------
    const allVehicles = db.prepare('SELECT id, reg_number, vehicle_type, operational_status, notes FROM vehicles ORDER BY id ASC').all();
    const vMap = new Map();

    for (const v of allVehicles) {
      const norm = smartNorm(v.reg_number);
      if (!vMap.has(norm)) {
        vMap.set(norm, [v]);
      } else {
        vMap.get(norm).push(v);
      }
    }

    const repointActivityStmt = db.prepare('UPDATE daily_activities SET vehicle_id = ? WHERE vehicle_id = ?');
    const repointStoppageStmt = db.prepare('UPDATE vehicle_stoppages SET vehicle_id = ? WHERE vehicle_id = ?');
    const repointProblemStmt = db.prepare('UPDATE vehicle_problems SET vehicle_id = ? WHERE vehicle_id = ?');
    const deleteVehicleStmt = db.prepare('DELETE FROM vehicles WHERE id = ?');
    const updateVehicleNotesStmt = db.prepare('UPDATE vehicles SET notes = COALESCE(notes, ?), operational_status = COALESCE(?, operational_status) WHERE id = ?');

    for (const [normKey, group] of vMap.entries()) {
      if (group.length <= 1) continue;

      // Select primary vehicle: prefer one with hyphens/spaces (e.g. "AP-02-TB-3799") or lowest id
      let primary = group[0];
      for (const candidate of group) {
        if (candidate.reg_number.includes('-') || candidate.reg_number.includes(' ')) {
          primary = candidate;
          break;
        }
      }

      const duplicates = group.filter(v => v.id !== primary.id);
      for (const dup of duplicates) {
        // 1. Re-point activities
        const actRes = repointActivityStmt.run(primary.id, dup.id);
        report.activitiesRepointed += actRes.changes;

        // 2. Re-point stoppages
        const stopRes = repointStoppageStmt.run(primary.id, dup.id);
        report.stoppagesRepointed += stopRes.changes;

        // 3. Re-point problems
        const probRes = repointProblemStmt.run(primary.id, dup.id);
        report.problemsRepointed += probRes.changes;

        // Transfer notes/status if primary was empty
        if (!primary.notes && dup.notes) {
          updateVehicleNotesStmt.run(dup.notes, dup.operational_status, primary.id);
        }

        // Delete duplicate vehicle
        deleteVehicleStmt.run(dup.id);
        report.duplicateVehiclesDeleted++;
      }
      report.vehiclesMerged++;
    }

    // -------------------------------------------------------------
    // STEP 2: DEDUPLICATE DAILY ACTIVITIES
    // -------------------------------------------------------------
    const allActivities = db.prepare('SELECT id, vehicle_id, report_datetime, location, activity_type, description, reported_by FROM daily_activities ORDER BY id ASC').all();
    const seenActivities = new Map();
    const deleteActivityIds = [];

    for (const act of allActivities) {
      const isGps = (act.reported_by || '').includes('GPS') || (act.reported_by || '').includes('Telematics');
      let dedupKey;

      if (isGps) {
        // Vehicle GPS ping at exact datetime
        dedupKey = `GPS_${act.vehicle_id}_${act.report_datetime}`;
      } else {
        // Shipment trip reference
        const refMatch = (act.description || '').match(/\[Ref: ([^\]]+)\]/);
        if (refMatch) {
          dedupKey = `SHIP_REF_${refMatch[1]}`;
        } else {
          dedupKey = `ACT_${act.vehicle_id}_${act.report_datetime}_${act.location}_${(act.description || '').slice(0, 35)}`;
        }
      }

      if (seenActivities.has(dedupKey)) {
        deleteActivityIds.push(act.id);
      } else {
        seenActivities.set(dedupKey, act.id);
      }
    }

    if (deleteActivityIds.length > 0) {
      const deleteActStmt = db.prepare('DELETE FROM daily_activities WHERE id = ?');
      for (const id of deleteActivityIds) {
        deleteActStmt.run(id);
        report.duplicateActivitiesRemoved++;
      }
    }

    // -------------------------------------------------------------
    // STEP 3: DEDUPLICATE ONGOING STOPPAGES
    // -------------------------------------------------------------
    const allStoppages = db.prepare('SELECT id, vehicle_id, start_datetime, reason, status FROM vehicle_stoppages WHERE status = \'Ongoing\' ORDER BY id ASC').all();
    const seenStoppages = new Map();
    const deleteStoppageStmt = db.prepare('DELETE FROM vehicle_stoppages WHERE id = ?');

    for (const stop of allStoppages) {
      const key = `${stop.vehicle_id}_${stop.reason}`;
      if (seenStoppages.has(key)) {
        deleteStoppageStmt.run(stop.id);
        report.duplicateStoppagesRemoved++;
      } else {
        seenStoppages.set(key, stop.id);
      }
    }

    // -------------------------------------------------------------
    // STEP 4: DEDUPLICATE OPEN PROBLEMS
    // -------------------------------------------------------------
    const allProblems = db.prepare('SELECT id, vehicle_id, category, description, status FROM vehicle_problems WHERE status = \'Open\' ORDER BY id ASC').all();
    const seenProblems = new Map();
    const deleteProblemStmt = db.prepare('DELETE FROM vehicle_problems WHERE id = ?');

    for (const prob of allProblems) {
      const key = `${prob.vehicle_id}_${prob.category}_${(prob.description || '').slice(0, 35)}`;
      if (seenProblems.has(key)) {
        deleteProblemStmt.run(prob.id);
        report.duplicateProblemsRemoved++;
      } else {
        seenProblems.set(key, prob.id);
      }
    }

    // Final Counts
    report.finalVehicleCount = db.prepare('SELECT count(*) as c FROM vehicles').get().c;
    report.finalActivityCount = db.prepare('SELECT count(*) as c FROM daily_activities').get().c;
    report.finalStoppageCount = db.prepare('SELECT count(*) as c FROM vehicle_stoppages WHERE status = \'Ongoing\'').get().c;
    report.finalProblemCount = db.prepare('SELECT count(*) as c FROM vehicle_problems WHERE status = \'Open\'').get().c;
  });

  execute();

  console.log('=== DEDUPLICATION COMPLETE ===');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) {
  runDeduplication();
}

module.exports = { runDeduplication };

