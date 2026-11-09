const { db } = require('../server/db/database');
const { smartNorm } = require('../server/services/syncAllOperations');

const vehicles = db.prepare('SELECT id, reg_number, vehicle_type, operational_status, notes FROM vehicles ORDER BY id ASC').all();
const vMap = new Map();

for (const v of vehicles) {
  const norm = smartNorm(v.reg_number);
  if (!vMap.has(norm)) {
    vMap.set(norm, [v]);
  } else {
    vMap.get(norm).push(v);
  }
}

const duplicates = Array.from(vMap.entries()).filter(([k, arr]) => arr.length > 1);
console.log('Total duplicate vehicle groups:', duplicates.length);

duplicates.forEach(([k, arr], idx) => {
  console.log(`${idx + 1}. Normalized [${k}]:`);
  arr.forEach(v => {
    // Count associated foreign keys
    const acts = db.prepare('SELECT count(*) as count FROM daily_activities WHERE vehicle_id = ?').get(v.id).count;
    const stops = db.prepare('SELECT count(*) as count FROM vehicle_stoppages WHERE vehicle_id = ?').get(v.id).count;
    const probs = db.prepare('SELECT count(*) as count FROM vehicle_problems WHERE vehicle_id = ?').get(v.id).count;
    console.log(`   id: ${v.id} | reg: "${v.reg_number}" | type: ${v.vehicle_type} | status: ${v.operational_status} | acts: ${acts}, stops: ${stops}, probs: ${probs}`);
  });
});

