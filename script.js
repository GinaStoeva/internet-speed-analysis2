/* script.js
   Advanced interactive front-end for SDG-9 Internet Speeds Explorer
   - Chart.js charts
   - Leaflet choropleth
   - csv upload + sample data
   - KPIs, outliers, top lists, region averages
   - Timeline slider (2017-2024) for animated top-country view
   - Export to PDF via html2canvas + jsPDF
*/

// ---------- Utilities ----------
function csvToRows(text) {
  // Split lines robustly
  return text.trim().split(/\r?\n/).map(line => {
    // naive CSV split (works for basic CSVs without quoted commas)
    // For more complex CSVs a proper parser would be needed
    return line.split(',').map(s => s.trim());
  });
}

function parseRows(rows) {
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const p = rows[i];
    if (!p || p.length < 11) continue;
    const country = p[0];
    const majorArea = p[1];
    const region = p[2];
    const s2017 = cleanVal(p[3]), s2018 = cleanVal(p[4]), s2019 = cleanVal(p[5]);
    const s2020 = cleanVal(p[6]), s2021 = cleanVal(p[7]), s2022 = cleanVal(p[8]);
    const s2023 = cleanVal(p[9]), s2024 = cleanVal(p[10]);
    data.push({
      country, majorArea, region,
      speeds: { '2017': s2017, '2018': s2018, '2019': s2019, '2020': s2020, '2021': s2021, '2022': s2022, '2023': s2023, '2024': s2024 },
      speed2023: s2023,
      speed2024: s2024
    });
  }
  return data;
}
function cleanVal(v) {
  if (v === undefined || v === null) return 0;
  const s = String(v).trim();
  if (s === '' || s.toLowerCase() === 'null') return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// ---------- sample CSV ----------
const sampleCSV = `country,major_area,region,year 2017,year 2018,year 2019,year 2020,year 2021,year 2022,year 2023,year 2024
Afghanistan,Asia,Southern Asia,null,null,6.49,8.2,9.23,1.9,2.84,3.63
Albania,Europe,Southern Europe,11.48,14.71,28.61,37.11,41.47,33.67,46.47,62.71
Algeria,Africa,Northern Africa,3.98,3.52,4.06,3.92,9.95,10.84,11.3,14.26
Andorra,Europe,Southern Europe,null,null,110.34,129.69,145.18,85.92,93.94,110.00
Australia,Oceania,Australia and New Zealand,45.1,52.3,63.1,71.2,75.3,80.4,90.1,105.7
Brazil,Americas,South America,12.2,15.8,21.3,25.9,28.1,30.2,32.5,55.1
Canada,Americas,Northern America,30.1,40.5,50.2,62.3,70.1,72.0,75.9,88.0
China,Asia,Eastern Asia,70.2,75.1,80.5,85.7,90.2,92.5,95.3,120.4
Egypt,Africa,Northern Africa,7.5,8.2,9.1,10.0,11.5,12.2,13.4,14.6`;

// ---------- state ----------
let records = [];
let mainChart = null;
let regionAvgChart = null;
let mapLayer = null;
let map = null;

// ---------- DOM refs ----------
const csvFile = document.getElementById('csvFile');
const uploadBtn = document.getElementById('uploadBtn');
const useSample = document.getElementById('useSample');
const runQuery = document.getElementById('runQuery');
const topNBtn = document.getElementById('topNBtn');
const yearSelect = document.getElementById('yearSelect');
const continentInput = document.getElementById('continentInput');
const summary = document.getElementById('summary');
const topList = document.getElementById('topList');
const outliersDiv = document.getElementById('outliers');
const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');
const yearSlider = document.getElementById('yearSlider');
const sliderYear = document.getElementById('sliderYear');

// ---------- file handling ----------
uploadBtn.addEventListener('click', () => csvFile.click());
csvFile.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = csvToRows(reader.result);
    records = parseRows(rows);
    onDataLoaded();
  };
  reader.readAsText(f);
});
useSample.addEventListener('click', () => {
  records = parseRows(csvToRows(sampleCSV));
  onDataLoaded();
});

// ---------- render table ----------
function renderTable(dataArr) {
  tableHead.innerHTML = `<tr><th>#</th><th>Country</th><th>Continent</th><th>Region</th><th>2023</th><th>2024</th></tr>`;
  tableBody.innerHTML = '';
  dataArr.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i + 1}</td><td>${r.country}</td><td>${r.majorArea}</td><td>${r.region}</td><td>${r.speed2023}</td><td>${r.speed2024}</td>`;
    tableBody.appendChild(tr);
  });
}

// ---------- charts ----------
function drawMainChart(labels, values, title = '') {
  const ctx = document.getElementById('mainChart');
  if (mainChart) mainChart.destroy();
  const g = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
  g.addColorStop(0, 'rgba(96,165,250,0.95)');
  g.addColorStop(1, 'rgba(125,211,252,0.2)');
  mainChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: title,
        data: values,
        backgroundColor: g,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.formattedValue + ' Mbps' } }
      },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function drawRegionAvgChart(items, year) {
  const ctx = document.getElementById('regionAvgChart');
  if (regionAvgChart) regionAvgChart.destroy();
  const labs = items.map(i => i.region);
  const vals = items.map(i => i.avg);
  regionAvgChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: labs, datasets: [{ label: `Avg ${year}`, data: vals, backgroundColor: 'rgba(96,165,250,0.9)' }] },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } }
  });
}

// ---------- compute region averages ----------
function computeRegionAverages(dataArr, yearStr) {
  const totals = {}, counts = {};
  dataArr.forEach(r => {
    const key = r.region || r.majorArea || 'Unknown';
    const val = (yearStr === '2017' || yearStr === '2023' || yearStr === '2024') ? (r.speeds[yearStr] || 0) : (r.speeds[yearStr] || 0);
    totals[key] = (totals[key] || 0) + val;
    counts[key] = (counts[key] || 0) + 1;
  });
  const out = [];
  Object.keys(totals).forEach(k => out.push({ region: k, avg: totals[k] / counts[k] }));
  out.sort((a, b) => b.avg - a.avg);
  return out;
}

// ---------- outlier detection ----------
function findOutliers(dataArr, year) {
  const vals = dataArr.map(r => (r.speeds[year] || 0));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length);
  const high = dataArr.filter(r => (r.speeds[year] || 0) > mean + 2 * std);
  const low = dataArr.filter(r => (r.speeds[year] || 0) < mean - 2 * std);
  return { mean, std, high, low };
}

// ---------- query by continent ----------
function queryByContinent(continent, year) {
  const matched = records.filter(r => r.majorArea && r.majorArea.toLowerCase().includes(continent.toLowerCase()));
  if (matched.length === 0) {
    summary.innerText = `No countries found for "${continent}"`;
    drawMainChart([], [], `No data`);
    return;
  }

  const key = (year === 'both') ? '2024' : year;
  const sorted = matched.slice().sort((a, b) => (b.speeds[key] || 0) - (a.speeds[key] || 0));
  const highest = sorted[0], lowest = sorted[sorted.length - 1];

  summary.innerHTML = `<strong>${matched.length}</strong> countries in ${continent}.<br>
    Highest (${key}): <strong>${highest.country}</strong> — ${highest.speeds[key] || 0} Mbps<br>
    Lowest (${key}): <strong>${lowest.country}</strong> — ${lowest.speeds[key] || 0} Mbps`;

  const labels = sorted.map(r => r.country);
  const values = sorted.map(r => r.speeds[key] || 0);
  drawMainChart(labels, values, `${continent} ${key} speeds`);

  const regionAvg = computeRegionAverages(matched, key);
  drawRegionAvgChart(regionAvg.slice(0, 12), key);

  topList.innerHTML = '';
  sorted.slice(0, 10).forEach((r, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${r.country} — ${r.speeds[key] || 0} Mbps`;
    topList.appendChild(li);
  });

  const out = findOutliers(matched, key);
  outliersDiv.innerHTML = `<div class="small">Mean: ${out.mean.toFixed(2)} Mbps; Std: ${out.std.toFixed(2)}</div>`;
  if (out.high.length) outliersDiv.innerHTML += `<div>High: ${out.high.map(x => x.country).join(', ')}</div>`;
  if (out.low.length) outliersDiv.innerHTML += `<div>Low: ${out.low.map(x => x.country).join(', ')}</div>`;
}

// ---------- top N ----------
function showTopN(n, year) {
  if (records.length === 0) { alert('Load data first'); return; }
  const key = year === '2023' ? '2023' : '2024';
  const sortedAll = records.slice().sort((a, b) => (b.speeds[key] || 0) - (a.speeds[key] || 0));
  const top = sortedAll.slice(0, n);
  const labels = top.map(x => x.country);
  const values = top.map(x => x.speeds[key] || 0);
  drawMainChart(labels, values, `Top ${n} (${key})`);
  topList.innerHTML = '';
  top.forEach((r, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${r.country} — ${r.speeds[key] || 0} Mbps`;
    topList.appendChild(li);
  });
}

// ---------- KPIs & export ----------
function animateNumber(el, start, end, duration = 900) {
  const stepTime = 25;
  const steps = Math.ceil(duration / stepTime);
  let current = start;
  const increment = (end - start) / steps;
  const timer = setInterval(() => {
    current += increment;
    el.innerText = (Math.abs(end) >= 100 ? Math.round(current) : current.toFixed(2));
    if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
      el.innerText = (Math.abs(end) >= 100 ? Math.round(end) : end.toFixed(2));
      clearInterval(timer);
    }
  }, stepTime);
}

function computeKPIs() {
  if (!records || records.length === 0) return;
  const avg24 = records.reduce((s, r) => s + r.speed2024, 0) / records.length;
  const improved = records.filter(r => r.speed2024 - r.speed2023 > 0).length;
  const growths = records.map(r => r.speed2024 - r.speed2023);
  const meanGrowth = growths.reduce((a, b) => a + b, 0) / growths.length;
  const impactScore = Math.max(0, (meanGrowth / (avg24 || 1)) * 100);
  animateNumber(document.getElementById('kpiAvg'), 0, avg24, 1100);
  animateNumber(document.getElementById('kpiGrowth'), 0, improved, 1100);
  animateNumber(document.getElementById('kpiImpact'), 0, parseFloat(impactScore.toFixed(1)), 1100);
}

// ---------- Export PDF ----------
document.getElementById('exportReport').addEventListener('click', async () => {
  const node = document.querySelector('main.container');
  const canvas = await html2canvas(node, { scale: 1.5, useCORS: true });
  const imgData = canvas.toDataURL('image/png');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgProps = pdf.getImageProperties(imgData);
  const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
  pdf.addImage(imgData, 'PNG', 10, 10, pdfWidth, pdfHeight);
  pdf.save('Internet-Speeds-Report.pdf');
});

// ---------- Map (Leaflet choropleth) ----------
async function initMap() {
  map = L.map('map', { attributionControl: false }).setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 6, attribution: '' }).addTo(map);
  // legend placeholder
  document.getElementById('mapLegend').innerHTML = `<small>Color bins: 0-20 / 20-50 / 50-100 / 100+</small>`;
}
initMap();

async function loadWorldGeo() {
  const topo = await fetch('https://unpkg.com/world-atlas@2.0.2/world/110m.json').then(r => r.json());
  const geo = topojson.feature(topo, topo.objects.countries);
  return geo;
}

function countryToSpeedMap() {
  const m = {};
  records.forEach(r => { m[r.country.toLowerCase()] = r.speed2024; });
  return m;
}

function addChoropleth(geo) {
  if (mapLayer) map.removeLayer(mapLayer);
  const speedMap = countryToSpeedMap();
  mapLayer = L.geoJSON(geo, {
    style: feature => {
      const name = (feature.properties && (feature.properties.name || feature.properties.NAME)) || '';
      const v = speedMap[name.toLowerCase()] || 0;
      const color = v > 100 ? '#0ea5a4' : v > 50 ? '#60a5fa' : v > 20 ? '#7dd3fc' : '#94a3b8';
      return { fillColor: color, color: '#0b1220', weight: 0.3, fillOpacity: 0.85 };
    },
    onEachFeature: (feature, layer) => {
      const name = (feature.properties && (feature.properties.name || feature.properties.NAME)) || 'Unknown';
      const v = speedMap[name.toLowerCase()] || 'No data';
      layer.bindPopup(`<strong>${name}</strong><br/>2024 speed: ${v} Mbps`);
    }
  }).addTo(map);
}

// ---------- when data loads ----------
async function onDataLoaded() {
  renderTable(records);
  computeKPIs();
  const regionAvg = computeRegionAverages(records, '2024');
  drawRegionAvgChart(regionAvg.slice(0, 12), '2024');
  showTopN(5, '2024');

  try {
    const geo = await loadWorldGeo();
    addChoropleth(geo);
  } catch (e) {
    console.warn('Map load failed', e);
  }
}

// ---------- timeline animation for Year slider ----------
yearSlider.addEventListener('input', () => {
  const y = yearSlider.value;
  sliderYear.innerText = y;
  // animate top countries for this year
  const yearStr = String(y);
  if (records && records.length) {
    const sorted = records.slice().sort((a, b) => (b.speeds[yearStr] || 0) - (a.speeds[yearStr] || 0));
    const top = sorted.slice(0, 10);
    drawMainChart(top.map(t => t.country), top.map(t => t.speeds[yearStr] || 0), `Top 10 — ${yearStr}`);
  }
});

// ---------- UI wiring ----------
document.getElementById('showKPI').addEventListener('click', computeKPIs);
document.getElementById('topNBtn').addEventListener('click', () => showTopN(10, yearSelect.value));
document.getElementById('runQuery').addEventListener('click', () => {
  const cont = continentInput.value.trim();
  if (!cont) { alert('Enter a continent'); return; }
  const yr = yearSelect.value === 'both' ? '2024' : yearSelect.value;
  queryByContinent(cont, yr);
});

// ---------- auto-load sample ----------
(function init(){
  records = parseRows(csvToRows(sampleCSV));
  onDataLoaded();
})();

