const { db } = require('../server/db/database');

// Find all exact duplicate activities
const allDups = db.prepare(`
  SELECT id, vehicle_id, report_datetime, location, description, reported_by
  FROM daily_activities
`).all();

console.log('Total activities in DB:', allDups.length);

const seenExact = new Map();
const toDelete = [];

for (const a of allDups) {
  // 1. Check by GPS ping or Shipment Ref in description
  const refMatch = (a.description || '').match(/\[(Ref: [^\]]+|GPS Ping: [^\]]+)\]/);
  let key;
  if (refMatch) {
    key = `REF_${a.vehicle_id}_${refMatch[1]}`;
  } else {
    // Or by exact vehicle, date, location, and first 40 chars of description
    key = `LOC_${a.vehicle_id}_${a.report_datetime}_${a.location}_${(a.description || '').slice(0, 40)}`;
  }

  if (seenExact.has(key)) {
    toDelete.push(a.id);
  } else {
    seenExact.set(key, a.id);
  }
}

console.log('Exact unique activities:', seenExact.size);
console.log('Duplicate activities to clean up:', toDelete.length);

