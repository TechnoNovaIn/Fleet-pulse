/**
 * Balaji Transports External API Integration Service
 * Manages JWT authentication and shipment attendance querying.
 */

const UPSTREAM_BASE_URL = process.env.BALAJI_API_URL || 'https://external.balajitransports.in';
const DEFAULT_USERNAME = process.env.BALAJI_API_USER || 'Raghu';
const DEFAULT_PASSWORD = process.env.BALAJI_API_PASSWORD || 'Raghu@1976';

let cachedToken = null;
let tokenExpiry = 0;
let userDetails = null;

/**
 * Decode JWT expiration time
 */
function getJwtExp(token) {
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      return payload.exp ? payload.exp * 1000 : Date.now() + 3600 * 1000;
    }
  } catch (e) {
    // ignore
  }
  return Date.now() + 3600 * 1000;
}

/**
 * Login to Balaji Transports API and obtain JWT Bearer Token
 */
async function authenticate(username = DEFAULT_USERNAME, password = DEFAULT_PASSWORD) {
  const loginUrl = `${UPSTREAM_BASE_URL}/api/WebLogin?Username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  
  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Balaji-FleetPulse/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Authentication failed with HTTP ${response.status}: ${response.statusText}`);
  }

  const rawText = await response.text();
  let body;
  try {
    body = JSON.parse(rawText);
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
  } catch (err) {
    throw new Error('Failed to parse login response JSON: ' + err.message);
  }

  if (!body.success || (!body.token && !body.Token)) {
    throw new Error(`Upstream rejected login: ${body.message || 'No token returned'}`);
  }

  cachedToken = body.token || body.Token;
  tokenExpiry = getJwtExp(cachedToken);
  userDetails = body.user || { name: username };

  console.log(`[BalajiAPI] Logged in successfully as ${username}. Token expires in ${Math.round((tokenExpiry - Date.now()) / 60000)} minutes.`);
  return { token: cachedToken, user: userDetails };
}

/**
 * Returns a valid JWT Bearer token, auto-logging in if necessary
 */
async function getValidToken(forceRefresh = false) {
  const needsRefresh = forceRefresh || !cachedToken || Date.now() >= (tokenExpiry - 300000); // 5 min buffer
  if (needsRefresh) {
    await authenticate();
  }
  return cachedToken;
}

/**
 * Fetch shipment details with automatic retry and auth refresh
 */
async function getAllShipmentDetails(params = {}) {
  const {
    From = '2026-08-01',
    To = '2026-08-07',
    VehicleID = '',
    VehicleType = ' ',
    Regdate = ' ',
    make = '',
    YearOfManufacture = ' ',
    shipmentType = 'Prepaid,Rake,StockYard,To-Pay,Internal,Dolvi,BMM',
    PageNumber = 1,
    PageSize = 2000
  } = params;

  const query = new URLSearchParams({
    From,
    To,
    VehicleID: VehicleID || '',
    VehicleType,
    Regdate,
    make,
    YearOfManufacture,
    shipmentType,
    PageNumber: String(PageNumber),
    PageSize: String(PageSize)
  });

  const url = `${UPSTREAM_BASE_URL}/api/VehicleAttendence/GetAllShipmentDetails?${query.toString()}`;

  let attempts = 0;
  while (attempts < 2) {
    attempts++;
    const token = await getValidToken(attempts > 1);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*'
      }
    });

    if (response.status === 401 && attempts === 1) {
      console.warn('[BalajiAPI] Token expired or invalid (401). Retrying with fresh login...');
      continue;
    }

    if (!response.ok) {
      throw new Error(`Shipment API returned HTTP ${response.status}: ${response.statusText}`);
    }

    const rawText = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(rawText);
      // ASP.NET might serialize twice when headers specify application/json
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
    } catch (e) {
      throw new Error('Failed to parse shipment data: ' + e.message);
    }

    return {
      data: parsed.Data || (Array.isArray(parsed) ? parsed : []),
      totalRecords: parsed.TotalRecords || (parsed.Data ? parsed.Data.length : 0),
      pageNumber: parsed.PageNumber || PageNumber,
      pageSize: parsed.PageSize || PageSize,
      meta: {
        from: From,
        to: To,
        shipmentType
      }
    };
  }

  throw new Error('Failed to retrieve shipment details after authentication retry.');
}

/**
 * Fetch live telematics GPS locations for fleet vehicles
 * (LocoNav and Intangles current location)
 */
async function fetchGpsLocations(params = {}) {
  const {
    Vehicle = '',
    Driver = '',
    VehicleType = '',
    Location = '',
    feet25 = '',
    feet40 = '',
    VehicleCategory = ''
  } = params;

  const query = new URLSearchParams({
    Vehicle,
    Driver,
    VehicleType,
    Location,
    feet25,
    feet40,
    VehicleCategory
  });

  const url = `${UPSTREAM_BASE_URL}/api/LoconavAndIntanglesCurrentLoc?${query.toString()}`;

  let attempts = 0;
  while (attempts < 2) {
    attempts++;
    const token = await getValidToken(attempts > 1);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*'
      }
    });

    if (response.status === 401 && attempts === 1) {
      console.warn('[BalajiAPI] GPS API token rejected (401). Refreshing token...');
      continue;
    }

    if (!response.ok) {
      throw new Error(`GPS API returned HTTP ${response.status}: ${response.statusText}`);
    }

    const rawText = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(rawText);
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
    } catch (e) {
      throw new Error('Failed to parse GPS data: ' + e.message);
    }

    const list = Array.isArray(parsed) ? parsed : (parsed.Data || []);
    return {
      success: true,
      total: list.length,
      data: list
    };
  }

  throw new Error('Failed to retrieve GPS locations after token refresh.');
}

/**
 * Get system status and connection info
 */
function getApiStatus() {
  return {
    connected: !!cachedToken && Date.now() < tokenExpiry,
    serviceAccount: DEFAULT_USERNAME,
    baseUrl: UPSTREAM_BASE_URL,
    tokenExpiresAt: tokenExpiry ? new Date(tokenExpiry).toISOString() : null,
    user: userDetails
  };
}

module.exports = {
  authenticate,
  getValidToken,
  getAllShipmentDetails,
  fetchGpsLocations,
  getApiStatus
};

