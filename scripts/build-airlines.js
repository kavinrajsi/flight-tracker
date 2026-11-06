'use strict';
// Generates lib/airlines.json (IATA -> [ICAO,...]) from OpenFlights airlines.dat (ODbL).
// Usage: node scripts/build-airlines.js
const fs = require('node:fs');
const path = require('node:path');

const URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat';

function parseLine(line) {
  const out = [];
  let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

(async () => {
  const text = await (await fetch(URL)).text();
  const active = {}, inactive = {};
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const [, , , iata, icao, , , isActive] = parseLine(line);
    if (!/^[A-Z0-9]{2}$/.test(iata) || !/^[A-Z]{3}$/.test(icao)) continue;
    const bucket = isActive === 'Y' ? active : inactive;
    (bucket[iata] ||= new Set()).add(icao);
  }
  const map = {};
  for (const k of new Set([...Object.keys(active), ...Object.keys(inactive)])) {
    map[k] = [...(active[k] || inactive[k])].sort();
  }
  fs.writeFileSync(path.join(__dirname, '../lib/airlines.json'), JSON.stringify(map));
  console.log(`wrote ${Object.keys(map).length} IATA codes`);
})();
