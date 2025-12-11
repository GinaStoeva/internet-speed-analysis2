AOS.init();

// Sample CSV
const sampleCSV = `country,major_area,region,year2017,year2018,year2019,year2020,year2021,year2022,year2023,year2024
Afghanistan,Asia,Southern Asia,null,null,6.49,8.2,9.23,1.9,2.84,3.63
Albania,Europe,Southern Europe,11.48,14.71,28.61,37.11,41.47,33.67,46.47,62.71
Algeria,Africa,Northern Africa,3.98,3.52,4.06,3.92,9.95,10.84,11.3,14.26
Australia,Oceania,Australia and New Zealand,45.1,52.3,63.1,71.2,75.3,80.4,90.1,105.7
Brazil,Americas,South America,12.2,15.8,21.3,25.9,28.1,30.2,32.5,55.1
Canada,Americas,Northern America,30.1,40.5,50.2,62.3,70.1,72.0,75.9,88.0
China,Asia,Eastern Asia,70.2,75.1,80.5,85.7,90.2,92.5,95.3,120.4
Egypt,Africa,Northern Africa,7.5,8.2,9.1,10.0,11.5,12.2,13.4,14.6`;

// Mapping for country -> lat/lng (only for sample, can expand for real data)
const countryCoords = {
  "Afghanistan": {lat:33.93911, lng:67.709953},
  "Albania": {lat:41.153332, lng:20.168331},
  "Algeria": {lat:28.033886, lng:1.659626},
  "Australia": {lat:-25.274398, lng:133.775136},
  "Brazil": {lat:-14.235004, lng:-51.92528},
  "Canada": {lat:56.130366, lng:-106.346771},
  "China": {lat:35.86166, lng:104.195397},
  "Egypt": {lat:26.820553, lng:30.802498}
};

// Parse CSV
function csvToRows(text){ return text.trim().split('\n').map(line=>line.split(',')); }
function parseRows(rows){
  const data=[];
  for(let i=1;i<rows.length;i++){
    const p=rows[i].map(s=>s.trim());
    if(p.length<11) continue;
    const country=p[0], majorArea=p[1], region=p[2];
    const s23=(p[9]===''||p[9].toLowerCase()==='null')?0:parseFloat(p[9]);
    const s24=(p[10]===''||p[10].toLowerCase()==='null')?0:parseFloat(p[10]);
    const coords = countryCoords[country] || {lat: Math.random()*140-70, lng: Math.random()*360-180};
    data.push({country,majorArea,region,speed2023:s23,speed2024:s24,...coords});
  }
  return data;
}

// State
let records=[];
let countryChart=null, topChart=null, globe=null;

// DOM
const csvFile=document.getElementById('csvFile');
const uploadBtn=document.getElementById('uploadBtn');
const useSample=document.getElementById('useSample');
const runQuery=document.getElementById('runQuery');
const yearSelect=document.getElementById('yearSelect');
const countryInput=document.getElementById('countryInput');
const kpiAvg=document.getElementById('kpiAvg');
const kpiGrowth=document.getElementById('kpiGrowth');
const kpiImpact=document.getElementById('kpiImpact');
const outliersDiv=document.getElementById('outliers');

// File handling
uploadBtn.addEventListener('click', ()=> csvFile.click());
csvFile.addEventListener('change',(e)=>{
  const f=e.target.files[0];
  if(!f) return;
  const reader=new FileReader();
  reader.onload=()=>{ const rows=csvToRows(reader.result); records=parseRows(rows); onDataLoaded(); };
  reader.readAsText(f);
});
useSample.addEventListener('click', ()=>{ records=parseRows(csvToRows(sampleCSV)); onDataLoaded(); });

// Charts
function drawBarChart(ctx, labels, values){
  if(ctx.chart) ctx.chart.destroy();
  ctx.chart = new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[{label:'Internet Speeds',data:values,backgroundColor:'rgba(96,165,250,0.9)',borderRadius:6}]},
    options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.formattedValue+' Mbps'}}},scales:{y:{beginAtZero:true}}}
  });
}

// KPIs
function computeKPIs(){
  if(!records||records.length===0) return;
  const avg24 = records.reduce((s,r)=>s+r.speed2024,0)/records.length;
  const improved = records.filter(r=>r.speed2024-r.speed2023>0).length;
  const meanGrowth = records.reduce((a,b)=>a+b.speed2024-b.speed2023,0)/records.length;
  const impactScore = Math.max(0,(meanGrowth/(avg24||1))*100);
  kpiAvg.innerText=avg24.toFixed(2);
  kpiGrowth.innerText=improved;
  kpiImpact.innerText=impactScore.toFixed(1);
}

// Run query
runQuery.addEventListener('click',()=>{
  const year=yearSelect.value;
  const countries=countryInput.value.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(countries.length===0){ alert('Enter at least one country'); return; }
  const filtered=records.filter(r=>countries.includes(r.country.toLowerCase()));
  if(filtered.length===0){ alert('No matching countries'); return; }
  const ctx=document.getElementById('countryChart');
  const labels=filtered.map(r=>r.country);
  const values=filtered.map(r=>year==='2023'?r.speed2023:year==='2024'?r.speed2024: (r.speed2023+r.speed2024)/2 );
  drawBarChart(ctx, labels, values);
});

// Top chart
function drawTopCountries(){
  const sorted=records.slice().sort((a,b)=>b.speed2024-a.speed2024).slice(0,5);
  const labels=sorted.map(r=>r.country);
  const values=sorted.map(r=>r.speed2024);
  drawBarChart(document.getElementById('topChart'), labels, values);
}
drawTopCountries();

// 3D Globe
function addGlobe(){
  globe = Globe()
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
    .pointsData(records)
    .pointLat('lat')
    .pointLng('lng')
    .pointAltitude(r=>r.speed2024/150)
    .pointColor(r=>{
      if(r.speed2024>100) return '#0ea5a4';
      if(r.speed2024>50) return '#60a5fa';
      if(r.speed2024>20) return '#7dd3fc';
      return '#94a3b8';
    })
    .pointLabel(r=>`${r.country}<br>Continent: ${r.majorArea}<br>2023: ${r.speed2023} Mbps<br>2024: ${r.speed2024} Mbps`)
    .onPointClick(r=> alert(`${r.country}:\n2023: ${r.speed2023} Mbps\n2024: ${r.speed2024} Mbps\nRegion: ${r.region}`))
    .width(document.getElementById('globeViz').clientWidth)
    .height(document.getElementById('globeViz').clientHeight)
    .backgroundColor('#071427')
    .showAtmosphere(true)
    .atmosphereColor('rgba(0,150,255,0.1)')
    .onGlobeReady(()=>{ globe.controls().autoRotate=true; globe.controls().autoRotateSpeed=0.2; });
  document.getElementById('globeViz').appendChild(globe.renderer().domElement);
}
addGlobe();

// Export PDF
document.getElementById('exportReport').addEventListener('click', async ()=>{
  const node=document.querySelector('main.container');
  const canvas=await html2canvas(node,{scale:2,useCORS:true});
  const imgData=canvas.toDataURL('image/png');
  const { jsPDF } = window.jspdf;
  const pdf=new jsPDF('p','mm','a4');
  const w=pdf.internal.pageSize.getWidth()-20;
  const imgProps=pdf.getImageProperties(imgData);
  const h=imgProps.height*(w/imgProps.width);
  pdf.addImage(imgData,'PNG',10,10,w,h);
  pdf.save('InternetSpeedsReport.pdf');
});

// Init
records=parseRows(csvToRows(sampleCSV));
computeKPIs();
drawTopCountries();
