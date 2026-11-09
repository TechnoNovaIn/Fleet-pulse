const { db } = require('../server/db/database');

const allActs = db.prepare('SELECT id, vehicle_id, report_datetime, location, activity_type, description, reported_by FROM daily_activities').all();

const seen = new Map();
const dupsToDelete = [];

for (const a of allActs) {
  let key;
  const isGps = (a.reported_by || '').includes('GPS') || (a.reported_by || '').includes('Telematics');

  if (isGps) {
    // For GPS pings, a vehicle at the exact same timestamp only needs one ping
    key = `GPS_${a.vehicle_id}_${a.report_datetime}`;
  } else {
    // For shipment trips, extract Ref or GC/Inv if present
    const refMatch = (a.description || '').match(/\[Ref: ([^\]]+)\]/);
    if (refMatch) {
      key = `SHIP_REF_${refMatch[1]}`;
    } else {
      key = `ACT_${a.vehicle_id}_${a.report_datetime}_${a.location}_${(a.description || '').slice(0, 30)}`;
    }
  }

  if (seen.has(key)) {
    dupsToDelete.push(a.id);
  } else {
    seen.set(key, a.id);
  }
}

console.log('Total activities:', allActs.length);
console.log('Clean unique activities:', seen.size);
console.log('Total duplicates to delete:', dupsToDelete.length);

