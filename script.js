// script.js — interactive app (requires data.csv in the same folder)
let raw = [];        // raw parsed rows
let tableRows = [];  // processed rows
let currentPage = 1;
let pageSize = 10;
let sortKey = null;
let sortAsc = true;

// chart instances
let regionChart = null;
let trendChart = null;

document.addEventListener("DOMContentLoaded", () => {
  // wire up UI
  document.getElementById("searchBox").addEventListener("input", refreshTable);
  document.getElementById("regionSelect").addEventListener("change", onRegionChange);
  document.getElementById("btn-highlow").addEventListener("click", showHighestLowest);
  document.getElementById("btn-dii").addEventListener("click", showDII);
  document.getElementById("btn-improve").addEventListener("click", showBestImprovement);
  document.getElementById("pageSize").addEventListener("change", e => { pageSize = parseInt(e.target.value); currentPage = 1; refreshTable(); });
  document.getElementById("prevPage").addEventListener("click", ()=> { if(currentPage>1){currentPage--; refreshTable();}});
  document.getElementById("nextPage").addEventListener("click", ()=> { currentPage++; refreshTable();});
  document.getElementById("exportCSV").addEventListener("click", exportVisibleCSV);
  document.getElementById("downloadJSON").addEventListener("click", downloadJSON);
  document.getElementById("clearLocal").addEventListener("click", clearLocalStorage);

  // add form
  document.getElementById("addForm").addEventListener("submit", e => {
    e.preventDefault();
    addRecordFromForm();
  });
  document.getElementById("resetForm").addEventListener("click", () => document.getElementById("addForm").reset());

  // table header sort
  document.querySelectorAll("#dataTable thead th").forEach(h => {
    h.addEventListener("click", () => {
      const key = h.dataset.key;
      if (sortKey === key) sortAsc = !sortAsc; else { sortKey = key; sortAsc = true; }
      currentPage = 1;
      refreshTable();
    });
  });

  loadCSV("data.csv");
  loadSavedEntries();
});

// --- CSV load & parse (PapaParse handles edge cases)
function loadCSV(path){
  fetch(path).then(r => r.text()).then(txt => {
    const parsed = Papa.parse(txt, { header: true, skipEmptyLines: true });
    raw = parsed.data;
    normalizeRaw();
    buildRegionList();
    populateCountrySelect();
    currentPage = 1;
    refreshTable();
    buildRegionChart();
    document.getElementById("totalCount").textContent = raw.length;
  }).catch(err => {
    document.getElementById("results").innerHTML = `<b style="color:orange">Failed to load data.csv:</b> ${err}`;
  });
}

function normalizeRaw(){
  // convert numeric fields and trim strings
  tableRows = raw.map(r => {
    const rr = {};
    for (let k in r) {
      const v = r[k]===undefined ? "" : (""+r[k]).trim();
      rr[k.trim()] = (v.toLowerCase && v.toLowerCase()==="null") ? null : v;
    }
    // parse numbers for 2023/2024
    rr["year 2023"] = rr["year 2023"] ? Number(rr["year 2023"]) : null;
    rr["year 2024"] = rr["year 2024"] ? Number(rr["year 2024"]) : null;
    rr.country = rr.country || "";
    rr["major_area"] = rr["major_area"] || rr.major_area || "";
    rr.region = rr.region || "";
    rr.growth = (rr["year 2024"]!=null && rr["year 2023"]!=null) ? (rr["year 2024"] - rr["year 2023"]) : null;
    return rr;
  });
}

// build region dropdown (unique major_area values)
function buildRegionList(){
  const sel = document.getElementById("regionSelect");
  const unique = new Set(tableRows.map(r => r["major_area"] || r.majorArea).filter(x => x && x!==""));
  const arr = ["All", ...Array.from(unique).sort((a,b)=>a.localeCompare(b))];
  sel.innerHTML = "";
  arr.forEach(a => {
    const o = document.createElement("option");
    o.value = a;
    o.textContent = a;
    sel.appendChild(o);
  });
}

// update country dropdown for trend
function populateCountrySelect(){
  const sel = document.getElementById("countrySelect");
  const names = tableRows.map(r=>r.country).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  sel.innerHTML = "<option value=''>— choose country —</option>";
  names.forEach(n => {
    const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o);
  });
  sel.addEventListener("change", () => drawCountryTrend(sel.value));
}

// when region selection changes
function onRegionChange(){ currentPage=1; refreshTable(); buildRegionChart(); }

// main table rendering with sorting, filtering, pagination
function refreshTable(){
  const selRegion = document.getElementById("regionSelect").value;
  const q = document.getElementById("searchBox").value.trim().toLowerCase();

  let list = tableRows.filter(r => {
    if (selRegion && selRegion !== "All" && ((r["major_area"]||r.majorArea||"").toLowerCase() !== selRegion.toLowerCase())) return false;
    if (q && !r.country.toLowerCase().includes(q) && !((r.region||"").toLowerCase().includes(q))) return false;
    return true;
  });

  // sort
  if (sortKey){
    list.sort((a,b) => {
      let A = a[sortKey] ?? "";
      let B = b[sortKey] ?? "";
      if (typeof A === "string") A = A.toLowerCase();
      if (typeof B === "string") B = B.toLowerCase();
      if (A < B) return sortAsc ? -1 : 1;
      if (A > B) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  // pagination
  const total = list.length;
  const start = (currentPage-1)*pageSize;
  if (start >= total && total > 0) { currentPage = Math.ceil(total/pageSize); return refreshTable(); }
  const page = list.slice(start, start+pageSize);

  renderTableRows(page);
  document.getElementById("shownCount").textContent = page.length + " / " + total;
  document.getElementById("pageInfo").textContent = `${currentPage} / ${Math.max(1,Math.ceil(total/pageSize))}`;
}

// render rows
function renderTableRows(rows){
  const tbody = document.querySelector("#dataTable tbody");
  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.country}</td>
      <td>${r["major_area"] || ""}</td>
      <td>${r.region || ""}</td>
      <td>${r["year 2023"]!=null ? r["year 2023"].toFixed(2) : "—"}</td>
      <td>${r["year 2024"]!=null ? r["year 2024"].toFixed(2) : "—"}</td>
      <td>${r.growth!=null ? r.growth.toFixed(2) : "—"}</td>
    `;
    // row double-click saves to session (localStorage)
    tr.addEventListener("dblclick", () => {
      saveRowToLocal(r);
      flashResult("Saved to session (local storage): " + r.country);
    });
    tbody.appendChild(tr);
  });
}

// --- analyses
function showHighestLowest(){
  const selRegion = document.getElementById("regionSelect").value;
  const rows = tableRows.filter(r => (selRegion==="All"||((r["major_area"]||"").toLowerCase()===selRegion.toLowerCase())));
  let highest=null, lowest=null; let found=0;
  rows.forEach(r => {
    const s = r["year 2024"];
    if (s!=null){ found++; if (!highest || s>highest.speed) highest = {name:r.country, speed:s}; if (!lowest || s<lowest.speed) lowest={name:r.country, speed:s}; }
  });
  if(found===0){ flashResult("No 2024 data in this region."); return; }
  const html = `<b>Highest (2024):</b> ${highest.name} — ${highest.speed.toFixed(2)} Mbps<br>
                <b>Lowest (2024):</b> ${lowest.name} — ${lowest.speed.toFixed(2)} Mbps<br>
                <small>${found} countries with 2024 data in region.</small>`;
  document.getElementById("results").innerHTML = html;
  drawRegionBar(rows);
}

function showBestImprovement(){
  const selRegion = document.getElementById("regionSelect").value;
  const rows = tableRows.filter(r => (selRegion==="All"||((r["major_area"]||"").toLowerCase()===selRegion.toLowerCase())));
  let best=null; let found=0;
  rows.forEach(r => {
    if (r.growth!=null){ found++; if (!best || r.growth>best.diff) best={name:r.country,diff:r.growth}; }
  });
  if(!best){ flashResult("No records with both 2023+2024 data in region."); return; }
  const html = `<b>Biggest improvement (2023→2024):</b> ${best.name} — ${best.diff.toFixed(2)} Mbps<br><small>${found} countries had both years</small>`;
  document.getElementById("results").innerHTML = html;
  drawRegionBar(rows);
}

function showDII(){
  const selRegion = document.getElementById("regionSelect").value;
  const rows = tableRows.filter(r => (selRegion==="All"||((r["major_area"]||"").toLowerCase()===selRegion.toLowerCase())));
  let values = rows.map(r => r["year 2024"]).filter(v => v!=null);
  if(values.length===0){ flashResult("No 2024 speed values in this region."); return; }
  const max = Math.max(...values), min = Math.min(...values);
  const html = `<b>Digital Inequality Index (range):</b> ${ (max-min).toFixed(2) } Mbps<br>
                <b>Highest:</b> ${max.toFixed(2)} Mbps — <b>Lowest:</b> ${min.toFixed(2)} Mbps<br>
                <small>${values.length} data points used</small>`;
  document.getElementById("results").innerHTML = html;
  drawRegionBar(rows);
}

function flashResult(msg){
  const el = document.getElementById("results"); el.innerHTML = `<span style="color:#ffd966">${msg}</span>`;
}

// region bar chart (avg per region or distribution)
function buildRegionChart(){
  // build top-10 region averages across major_area
  const map = {};
  tableRows.forEach(r=>{
    const ma = (r["major_area"]||"").trim();
    if(!ma) return;
    if(!map[ma]) map[ma] = {sum:0,count:0};
    if (r["year 2024"]!=null){ map[ma].sum += r["year 2024"]; map[ma].count++; }
  });
  const arr = Object.keys(map).map(k => ({k, avg: map[k].count? map[k].sum/map[k].count:0}));
  arr.sort((a,b)=>b.avg-a.avg);
  const labels = arr.slice(0,8).map(x=>x.k);
  const data = arr.slice(0,8).map(x=>Number(x.avg.toFixed(2)));
  const ctx = document.getElementById("regionChart").getContext("2d");
  if(regionChart) regionChart.destroy();
  regionChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets:[{label:"Avg 2024 (Mbps)",data,backgroundColor:labels.map(()=> "rgba(59,176,255,0.7)")} ]},
    options:{responsive:true,plugins:{legend:{display:false}}}
  });
}

function drawRegionBar(rows){
  // show distribution of 2024 speeds in the selected subset
  const byCountry = rows.map(r=>({name:r.country, val:r["year 2024"]})).filter(x=>x.val!=null).sort((a,b)=>b.val-a.val).slice(0,10);
  const ctx = document.getElementById("regionChart").getContext("2d");
  if(regionChart) regionChart.destroy();
  regionChart = new Chart(ctx, {
    type:"horizontalBar",
    data:{
      labels: byCountry.map(x=>x.name),
      datasets:[{label:"2024 Mbps", data: byCountry.map(x=>x.val), backgroundColor: byCountry.map(()=> "rgba(139,98,255,0.8)")}]
    },
    options:{legend:{display:false}, responsive:true, scales:{x:{beginAtZero:true}}}
  });
}

function drawCountryTrend(country){
  if(!country) return;
  const row = tableRows.find(r=>r.country===country);
  if(!row) return;
  // years from 2017..2024
  const years = ["year 2017","year 2018","year 2019","year 2020","year 2021","year 2022","year 2023","year 2024"];
  const labels = years.map(y => y.replace("year ",""));
  const vals = years.map(y => row[y] != null ? Number(row[y]) : null);
  if(trendChart) trendChart.destroy();
  const ctx = document.getElementById("trendChart").getContext("2d");
  trendChart = new Chart(ctx, {
    type:"line",
    data:{labels, datasets:[{label:country, data:vals, fill:false, borderColor:"#3bb0ff", tension:0.3}]},
    options:{scales:{y:{beginAtZero:false}}}
  });
}

// --- export & local storage
function exportVisibleCSV(){
  // export the currently filtered dataset (no pagination)
  const selRegion = document.getElementById("regionSelect").value, q = document.getElementById("searchBox").value.trim().toLowerCase();
  const rows = tableRows.filter(r => {
    if (selRegion && selRegion!=="All" && ((r["major_area"]||"").toLowerCase() !== selRegion.toLowerCase())) return false;
    if (q && !r.country.toLowerCase().includes(q)) return false;
    return true;
  });
  const csv = Papa.unparse(rows);
  downloadFile(csv, "export.csv", "text/csv");
}

function downloadJSON(){
  const selRegion = document.getElementById("regionSelect").value;
  const rows = tableRows.filter(r => selRegion==="All" || ((r["major_area"]||"").toLowerCase()===selRegion.toLowerCase()));
  downloadFile(JSON.stringify(rows, null, 2), "export.json", "application/json");
}

function downloadFile(content, filename, type){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// local storage for added rows
function saveRowToLocal(row){
  const saved = JSON.parse(localStorage.getItem("addedRows")||"[]");
  saved.push(row);
  localStorage.setItem("addedRows", JSON.stringify(saved));
  document.getElementById("addedCount").textContent = saved.length;
}

function loadSavedEntries(){
  const saved = JSON.parse(localStorage.getItem("addedRows")||"[]");
  if(saved.length) {
    // merge into tableRows (top)
    saved.forEach(s => tableRows.unshift(s));
    document.getElementById("addedCount").textContent = saved.length;
    refreshTable();
    buildRegionList();
    populateCountrySelect();
  }
}

function clearLocalStorage(){
  localStorage.removeItem("addedRows");
  document.getElementById("addedCount").textContent = 0;
  location.reload();
}

// Add record form handler
function addRecordFromForm(){
  const a = document.getElementById("a_country").value.trim();
  const b = document.getElementById("a_major").value.trim();
  const c = document.getElementById("a_region").value.trim();
  const v23 = parseFloat(document.getElementById("a_2023").value) || null;
  const v24 = parseFloat(document.getElementById("a_2024").value) || null;
  if(!a || !b || !c){ alert("Please fill country, continent and region."); return; }
  const obj = {
    country: a,
    "major_area": b,
    region: c,
    "year 2017": null, "year 2018": null, "year 2019": null, "year 2020": null, "year 2021": null,
    "year 2022": null, "year 2023": v23, "year 2024": v24,
  };
  obj.growth = (v23!=null && v24!=null) ? (v24 - v23) : null;
  tableRows.unshift(obj);
  saveRowToLocal(obj);
  buildRegionList();
  populateCountrySelect();
  refreshTable();
  flashResult("Added record: " + a);
  document.getElementById("addForm").reset();
}

// helper to show top result and auto-plot
function flashResultHTML(html){
  document.getElementById("results").innerHTML = html;
}

// utility to download
function downloadFile(content, filename, type){ /* defined earlier - keep unique */ }
