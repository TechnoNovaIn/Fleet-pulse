const { db } = require('../server/db/database');

const dups = db.prepare(`
  SELECT vehicle_id, report_datetime, location, activity_type, count(*) as count, group_concat(id) as ids
  FROM daily_activities
  GROUP BY vehicle_id, report_datetime, location
  HAVING count(*) > 1
  LIMIT 5
`).all();

for (const d of dups) {
  console.log('Group vehicle_id:', d.vehicle_id, 'count:', d.count);
  const rows = db.prepare('SELECT id, vehicle_id, report_datetime, location, activity_type, description, reported_by FROM daily_activities WHERE id IN (' + d.ids + ')').all();
  rows.forEach(r => {
    console.log(`  [id: ${r.id}] date: ${r.report_datetime} | type: ${r.activity_type} | loc: ${r.location} | by: ${r.reported_by}`);
    console.log(`    desc: ${r.description.slice(0, 100)}...`);
  });
}

