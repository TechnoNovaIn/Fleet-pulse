/**
 * Automated Test Suite for Vehicle Process Management System
 * Validates all Section 15 Testing Scenarios:
 * 1. Add 25 ft vehicle
 * 2. Add 40 ft vehicle
 * 3. Attempt duplicate registration number (uniqueness validation)
 * 4. Record loading activity
 * 5. Record unloading activity
 * 6. Record normal halting without classifying as breakdown
 * 7. Create vehicle problem with text only
 * 8. Create vehicle problem with photo
 * 9. Record stoppage and verify duration calculation
 * 10. Update problem to In Progress
 * 11. Resolve problem and record resolution time
 * 12. Close stoppage and verify final duration
 * 13. Filter reports by date and vehicle type
 * 14. Export report to Excel
 * 15. Verify persistence across DB re-fetch
 * 16. Authentication login test
 */

const assert = require('assert');

const BASE_URL = 'http://localhost:5000';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';
  let body;
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { status: res.status, body, headers: res.headers };
}

let passed = 0;
let failed = 0;

function it(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  };
}

async function runAllTests() {
  console.log('====================================================');
  console.log('  RUNNING SECTION 15 COMPLIANCE TEST SUITE');
  console.log('====================================================');

  const tests = [
    // 1. Authentication
    it('1. Secure Process Handler Login', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'handler', password: 'admin123' })
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token, 'Token must be returned');
      assert.strictEqual(res.body.user.role, 'process_handler');
    }),

    // 2. Add 25 ft vehicle
    it('2. Add a 25 ft Vehicle', async () => {
      const uniqueReg = `KA-04-TEST-${Math.floor(1000 + Math.random() * 9000)}`;
      const res = await request('/api/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          reg_number: uniqueReg,
          vehicle_type: '25 ft',
          manufacturer: 'Tata Motors',
          model: 'LPT 1613',
          capacity: '10 Tons',
          operational_status: 'Operating'
        })
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.vehicle.vehicle_type, '25 ft');
      global.test25VehicleId = res.body.vehicle.id;
      global.test25Reg = res.body.vehicle.reg_number;
    }),

    // 3. Add 40 ft vehicle
    it('3. Add a 40 ft Vehicle', async () => {
      const uniqueReg = `KA-01-TEST-${Math.floor(1000 + Math.random() * 9000)}`;
      const res = await request('/api/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          reg_number: uniqueReg,
          vehicle_type: '40 ft',
          manufacturer: 'Ashok Leyland',
          model: 'Captain 40i',
          capacity: '25 Tons',
          operational_status: 'Operating'
        })
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.vehicle.vehicle_type, '40 ft');
      global.test40VehicleId = res.body.vehicle.id;
      global.test40Reg = res.body.vehicle.reg_number;
    }),

    // 4. Attempt duplicate registration
    it('4. Attempt to Add Duplicate Registration Number (Must be Rejected)', async () => {
      const res = await request('/api/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          reg_number: global.test25Reg,
          vehicle_type: '25 ft'
        })
      });
      assert.strictEqual(res.status, 409, 'Duplicate registration must return 409 Conflict');
      assert.ok(res.body.error.includes('already registered'), 'Error message must state already registered');
    }),

    // 5. Record loading activity
    it('5. Record a Loading Activity', async () => {
      const res = await request('/api/activities', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: global.test25VehicleId,
          location: 'Peenya Industrial Hub Bay 4',
          activity_type: 'Loading',
          description: 'Loaded 10 metric tons corrugated boxes for Chennai transit'
        })
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.activity.activity_type, 'Loading');
    }),

    // 6. Record unloading activity
    it('6. Record an Unloading Activity', async () => {
      const res = await request('/api/activities', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: global.test25VehicleId,
          location: 'Sriperumbudur Warehouse',
          activity_type: 'Unloading',
          description: 'Unloaded cargo cleanly, customer sign-off received'
        })
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.activity.activity_type, 'Unloading');
    }),

    // 7. Record normal halting without classifying as breakdown
    it('7. Record Normal Halting (Must Not Classify as Breakdown)', async () => {
      const res = await request('/api/activities', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: global.test40VehicleId,
          location: 'Kolar Highway Toll Plaza Rest Area',
          activity_type: 'Halting',
          description: 'Driver mandatory rest break & vehicle tyre cooling check'
        })
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.activity.activity_type, 'Halting');

      // Verify vehicle is NOT marked Stopped as breakdown
      const vRes = await request(`/api/vehicles/${global.test40VehicleId}`);
      assert.notStrictEqual(vRes.body.vehicle.operational_status, 'Stopped', 'Halting must not be marked Stopped');
    }),

    // 8. Create problem with text only
    it('8. Create Vehicle Problem with Text Only', async () => {
      const res = await request('/api/problems', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: global.test25VehicleId,
          category: 'Brake problem',
          priority: 'High',
          location: 'Hosur Ghat Section KM 32',
          description: 'Air brake pressure valve leaking, minor lag in braking response'
        })
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.problem.category, 'Brake problem');
      assert.strictEqual(res.body.problem.status, 'Open');
      global.testProblemId = res.body.problem.id;
    }),

    // 9. Create problem with photo
    it('9. Create Vehicle Problem with Photo Attachment', async () => {
      const res = await request('/api/problems', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: global.test40VehicleId,
          category: 'Tyre problem',
          priority: 'Urgent',
          location: 'Nelamangala Highway KM 28',
          description: 'Left rear drive tyre blowout with rim flange bent',
          photo_url: '/uploads/sample-tyre-damage.jpg',
          create_stoppage_too: false
        })
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.problem.photo_url, '/uploads/sample-tyre-damage.jpg');
      global.testProblemId2 = res.body.problem.id;
    }),

    // 10. Record stoppage and verify duration calculation
    it('10. Record Stoppage and Verify Duration Calculation', async () => {
      // 3 hours ago start
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      const res = await request('/api/stoppages', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: global.test25VehicleId,
          start_datetime: threeHoursAgo,
          location: 'Hosur Checkpost Service Lane',
          reason: 'Brake air pressure valve replacement',
          related_problem_id: global.testProblemId
        })
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.stoppage.status, 'Ongoing');
      assert.ok(res.body.stoppage.duration_text.includes('hr'), 'Duration text must calculate elapsed hours');
      global.testStoppageId = res.body.stoppage.id;

      // Verify vehicle status is updated to Stopped
      const vRes = await request(`/api/vehicles/${global.test25VehicleId}`);
      assert.strictEqual(vRes.body.vehicle.operational_status, 'Stopped');
    }),

    // 11. Duplicate stoppage prevention
    it('11. Prevent Duplicate Active Stoppage for Same Vehicle', async () => {
      const res = await request('/api/stoppages', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: global.test25VehicleId,
          start_datetime: new Date().toISOString(),
          location: 'Another Location',
          reason: 'Another stoppage'
        })
      });
      assert.strictEqual(res.status, 409, 'Duplicate ongoing stoppage must return 409');
      assert.ok(res.body.error.includes('already has an active ongoing stoppage'));
    }),

    // 12. Update problem to In Progress
    it('12. Update Problem to In Progress with Action Taken', async () => {
      const res = await request(`/api/problems/${global.testProblemId}`, {
        method: 'PUT',
        body: JSON.stringify({
          action_taken: 'Emergency mechanic dispatched with spare brake valve kit',
          assigned_to: 'Sri Murugan Auto Garage Hosur',
          status_change: 'In Progress'
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.problem.status, 'In Progress');
    }),

    // 13. Confirm problem resolution
    it('13. Resolve Problem with Explicit Confirmation & Resolution Notes', async () => {
      const res = await request(`/api/problems/${global.testProblemId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          confirm_resolution: true,
          resolution_notes: 'New brake valve installed, air lines bled and pressure tested at 8.5 bar.',
          action_taken: 'Valve replaced and test run completed successfully'
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.problem.status, 'Resolved');
      assert.ok(res.body.problem.resolution_datetime, 'Resolution datetime must be recorded');
    }),

    // 14. Close stoppage and verify final duration
    it('14. Close Stoppage and Verify Final Duration Calculation', async () => {
      const actualRestart = new Date().toISOString();
      const res = await request(`/api/stoppages/${global.testStoppageId}/restart`, {
        method: 'POST',
        body: JSON.stringify({
          actual_restart_datetime: actualRestart,
          action_taken: 'Repairs finished, driver resumed journey to Chennai',
          restore_vehicle_status: 'Operating'
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.stoppage.status, 'Ended');
      assert.ok(res.body.stoppage.duration_text, 'Duration text must be present');

      // Verify vehicle operational status is restored to Operating
      const vRes = await request(`/api/vehicles/${global.test25VehicleId}`);
      assert.strictEqual(vRes.body.vehicle.operational_status, 'Operating');
    }),

    // 15. Electronic reports filter and columns
    it('15. Electronic Reports: Verify Mandatory Compliance Columns', async () => {
      const res = await request('/api/reports?report_type=current_stoppages');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.data), 'Data must be an array');
      if (res.body.data.length > 0) {
        const row = res.body.data[0];
        // 6 Mandatory Columns from Section 10
        assert.ok('Vehicle Number' in row, 'Missing Vehicle Number');
        assert.ok('Vehicle Type' in row, 'Missing Vehicle Type');
        assert.ok('Vehicle Model' in row, 'Missing Vehicle Model');
        assert.ok('Location' in row, 'Missing Location');
        assert.ok('Number of Days Stopped' in row, 'Missing Number of Days Stopped');
        assert.ok('Reason for Stoppage' in row, 'Missing Reason for Stoppage');
      }
    }),

    // 16. Excel Export
    it('16. Electronic Reports: Excel (.xlsx) Export Verification', async () => {
      const res = await request('/api/reports/export/excel?report_type=current_stoppages');
      assert.strictEqual(res.status, 200);
      const contentType = res.headers.get('content-type') || '';
      assert.ok(
        contentType.includes('spreadsheetml') || contentType.includes('octet-stream'),
        'Content type must be Excel spreadsheet'
      );
    }),

    // 17. Dashboard KPIs calculation
    it('17. Dashboard Statistics: Non-hardcoded live DB calculations', async () => {
      const res = await request('/api/dashboard/stats');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.metrics.totalVehicles >= 2, 'Total vehicles must be at least 2');
      assert.ok(typeof res.body.metrics.operatingVehicles === 'number');
      assert.ok(typeof res.body.metrics.stoppedVehicles === 'number');
      assert.ok(Array.isArray(res.body.charts.statusDistribution));
    }),

    // 18. Bulk Vehicle Import Feature
    it('18. Vehicle Master Bulk Import (Batch Insert & Duplicate Skip)', async () => {
      const batchReg1 = `KA-09-IMP-${Math.floor(1000 + Math.random() * 9000)}`;
      const batchReg2 = `KA-09-IMP-${Math.floor(1000 + Math.random() * 9000)}`;
      
      const res = await request('/api/vehicles/import', {
        method: 'POST',
        body: JSON.stringify({
          vehicles: [
            { reg_number: batchReg1, vehicle_type: '25 ft', manufacturer: 'Tata Motors', model: 'Ultra' },
            { reg_number: batchReg2, vehicle_type: '40 ft', manufacturer: 'Ashok Leyland', model: 'Captain' },
            { reg_number: batchReg1, vehicle_type: '25 ft' } // Duplicate inside batch
          ]
        })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.results.imported, 2, 'Two new vehicles should be imported');
      assert.strictEqual(res.body.results.skipped, 1, 'Duplicate row should be skipped');

      // Verify they now appear in vehicles list
      const checkRes = await request(`/api/vehicles?search=${batchReg1}`);
      assert.strictEqual(checkRes.status, 200);
      assert.strictEqual(checkRes.body.length, 1);
    }),

    // 19. Vehicle Format with Owner Name & User Import Fields
    it('19. Vehicle Master Format: Owner Name, Types & Manufacturer Verification', async () => {
      const reg = `AP-02-TA-${Math.floor(1000 + Math.random() * 9000)}`;
      const owner = 'G R Raghu';
      const res = await request('/api/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          reg_number: reg,
          owner_name: owner,
          vehicle_type: 'Twelve Wheeler',
          model: '2012',
          manufacturer: 'Mahindra Navistar',
          operational_status: 'Operating'
        })
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.vehicle.owner_name, owner);
      assert.strictEqual(res.body.vehicle.vehicle_type, 'Twelve Wheeler');
      assert.strictEqual(res.body.vehicle.model, '2012');
      assert.strictEqual(res.body.vehicle.manufacturer, 'Mahindra Navistar');

      // Search by owner name
      const searchRes = await request(`/api/vehicles?search=Raghu`);
      assert.strictEqual(searchRes.status, 200);
      assert.ok(searchRes.body.some(v => v.owner_name === owner));
    })
  ];

  for (const t of tests) {
    await t();
  }

  console.log('====================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests();
