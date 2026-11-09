const { db } = require('../server/db/database');
const { smartNorm } = require('../server/services/syncAllOperations');

function checkDuplicates() {
  console.log('=== CHECKING DUPLICATES IN DATABASE ===');

  // 1. Vehicle duplicates by smartNorm
  const vehicles = db.prepare('SELECT id, reg_number, vehicle_type, operational_status, created_at FROM vehicles').all();
  const vMap = new Map();
  for (const v of vehicles) {
    const norm = smartNorm(v.reg_number);
    if (!vMap.has(norm)) {
      vMap.set(norm, [v]);
    } else {
      vMap.get(norm).push(v);
    }
  }

  const multiVehicles = Array.from(vMap.entries()).filter(([k, arr]) => arr.length > 1);
  console.log('Total vehicles in DB:', vehicles.length);
  console.log('Unique normalized vehicles:', vMap.size);
  console.log('Duplicate vehicle registration groups:', multiVehicles.length);
  if (multiVehicles.length > 0) {
    console.log('Sample vehicle duplicate groups:');
    multiVehicles.slice(0, 10).forEach(([k, arr]) => {
      console.log(`Key ${k}:`, arr.map(x => `[id:${x.id}] ${x.reg_number} (${x.operational_status})`).join(' vs '));
    });
  }

  // 2. Daily activities duplicates
  // A: same vehicle_id, report_datetime, location
  const dupActivities = db.prepare(`
    SELECT vehicle_id, report_datetime, location, count(*) as count, group_concat(id) as ids
    FROM daily_activities
    GROUP BY vehicle_id, report_datetime, location
    HAVING count(*) > 1
  `).all();
  console.log('\nDuplicate daily_activities (same vehicle, datetime, location):', dupActivities.length);
  const totalDupRows = dupActivities.reduce((acc, d) => acc + (d.count - 1), 0);
  console.log('Total redundant activity rows by datetime+location:', totalDupRows);

  // B: check duplicates by reference in description (e.g. GC No / Invoice No)
  const allActs = db.prepare('SELECT id, vehicle_id, description, report_datetime FROM daily_activities').all();
  const refMap = new Map();
  let descDups = 0;
  for (const a of allActs) {
    const match = (a.description || '').match(/\[(Ref: [^\]]+|GPS Ping: [^\]]+)\]/);
    if (match) {
      const ref = match[1];
      const key = `${a.vehicle_id}_${ref}`;
      if (!refMap.has(key)) {
        refMap.set(key, [a.id]);
      } else {
        refMap.get(key).push(a.id);
        descDups++;
      }
    }
  }
  console.log('Duplicate daily_activities by Reference (GC/Invoice/GPS):', descDups);

  // 3. Stoppages duplicates
  const dupStoppages = db.prepare(`
    SELECT vehicle_id, status, count(*) as count, group_concat(id) as ids
    FROM vehicle_stoppages
    WHERE status = 'Ongoing'
    GROUP BY vehicle_id, status
    HAVING count(*) > 1
  `).all();
  console.log('\nDuplicate ongoing stoppages (same vehicle):', dupStoppages.length);
  if (dupStoppages.length > 0) {
    console.log('Sample stoppage duplicates:', dupStoppages.slice(0, 5));
  }

  // 4. Vehicle problems duplicates
  const dupProblems = db.prepare(`
    SELECT vehicle_id, category, description, status, count(*) as count, group_concat(id) as ids
    FROM vehicle_problems
    WHERE status = 'Open'
    GROUP BY vehicle_id, category, description, status
    HAVING count(*) > 1
  `).all();
  console.log('\nDuplicate open problems (same vehicle, category, desc):', dupProblems.length);
  if (dupProblems.length > 0) {
    console.log('Sample problem duplicates:', dupProblems.slice(0, 5));
  }
}

checkDuplicates();

