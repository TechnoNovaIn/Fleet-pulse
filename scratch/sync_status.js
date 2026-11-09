const Database = require('better-sqlite3');
const db = new Database('data/transport_system.db');

const info = db.prepare("UPDATE vehicles SET operational_status = 'Stopped' WHERE id IN (SELECT vehicle_id FROM vehicle_stoppages WHERE status = 'Ongoing')").run();
console.log('Updated stopped vehicles count:', info.changes);

const stats = {
  total: db.prepare("SELECT count(1) as c FROM vehicles").get().c,
  operating: db.prepare("SELECT count(1) as c FROM vehicles WHERE operational_status = 'Operating'").get().c,
  stopped: db.prepare("SELECT count(1) as c FROM vehicles WHERE operational_status = 'Stopped'").get().c,
  stoppages: db.prepare("SELECT count(1) as c FROM vehicle_stoppages WHERE status = 'Ongoing'").get().c
};
console.log('Stats:', stats);

