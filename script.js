// 1. Initialize Supabase
const supabaseUrl = 'https://yagqrtjjaecnvhozegka.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhZ3FydGpqYWVjbnZob3plZ2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMTMxODMsImV4cCI6MjA5MTc4OTE4M30.GR2xT-qkuJIdc6XHP93BHwKZGVXZ91VmdHWnzkKQIZU'; 
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const GLOBAL_STATS = {
    sst: { mean: 26.39, sd: 2.57 },
    sla: { mean: 0.050, sd: 0.089 },
    oni: { mean: -0.03, sd: 0.84 }
};

const getGradientColor = (value) => {
    let hue;
    
    if (value <= 0.0) {
        hue = 0;
    } else if (value <= 0.5) {
        const ratio = value / 0.5;
        hue = ratio * 60;
    } else if (value < 1.5) {
        const ratio = (value - 0.5) / 1.0; 
        hue = 60 + (ratio * 60);
    } else {
        hue = 120;
    }
    
    return `hsl(${hue}, 100%, 50%)`;
};

// 2. Initialize Leaflet Maps (Filtered Map & Daily Map)
const map = L.map('map').setView([21, -107], 5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri'
}).addTo(map);
const markerGroup = L.layerGroup().addTo(map);

const dailyMap = L.map('daily-map').setView([21, -107], 5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri'
}).addTo(dailyMap);
const dailyMarkerGroup = L.layerGroup().addTo(dailyMap);

setTimeout(() => { map.invalidateSize(); dailyMap.invalidateSize(); }, 500);

// 3. Initialize Chart.js Line Graph
const ctx = document.getElementById('distChart').getContext('2d');
const distChart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Frequency', data: [], borderColor: '#0056b3', backgroundColor: 'rgba(0, 86, 179, 0.1)', fill: true, tension: 0.4 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'Chlorophyll-a' } }, y: { beginAtZero: true, display: false } }, plugins: { legend: { display: false } } }
});

// 4. Setup Listeners & Time-Stepping Logic
let queryTimeout;
let currentDailyDate = null;

const shiftDate = (days) => {
    if (!currentDailyDate) return;
    
    // Parse the current YYYY-MM-DD string into a strict UTC Date object
    let d = new Date(currentDailyDate);
    
    // Add/Subtract the days using UTC to prevent timezone drift
    d.setUTCDate(d.getUTCDate() + days);
    
    // Format back to YYYY-MM-DD
    const newDateStr = d.toISOString().split('T')[0];
    
    // Load the map with the new date (pass null for the table row, since we clicked a button)
    loadDailyMap(newDateStr, null);
};

document.getElementById('btn-prev').addEventListener('click', () => shiftDate(-8));
document.getElementById('btn-next').addEventListener('click', () => shiftDate(8));

const inputs = ['month-min', 'month-max', 'sst-min', 'sst-max', 'sla-min', 'sla-max', 'oni-min', 'oni-max', 'lat-min', 'lat-max', 'lon-min', 'lon-max'];

inputs.forEach(id => { 
    document.getElementById(id).addEventListener('input', () => {
        clearTimeout(queryTimeout);
        queryTimeout = setTimeout(() => {
            updateDashboard();
        }, 600);
    }); 
});

// 5. The Main Query Function
async function updateDashboard() {
    const dataPanel = document.querySelector('.data-panel');
    const visualPanel = document.querySelector('.visual-panel');
    dataPanel.classList.add('is-loading');
    visualPanel.classList.add('is-loading');

    const chlDisplay = document.getElementById('chl-result');
    const countDisplay = document.getElementById('count-result');
    const medianDisplay = document.getElementById('median-result');
    const sdDisplay = document.getElementById('sd-result');
    const varDisplay = document.getElementById('var-result');
    const tbody = document.getElementById('top-points-body');

    const getVal = (id) => { const val = document.getElementById(id).value; return (val === "" || val === "all") ? null : parseFloat(val); };
    const params = {
        p_month_min: getVal('month-min'), p_month_max: getVal('month-max'),
        p_sst_min: getVal('sst-min'), p_sst_max: getVal('sst-max'),
        p_sla_min: getVal('sla-min'), p_sla_max: getVal('sla-max'),
        p_oni_min: getVal('oni-min'), p_oni_max: getVal('oni-max'),
        p_lat_min: getVal('lat-min'), p_lat_max: getVal('lat-max'),
        p_lon_min: getVal('lon-min'), p_lon_max: getVal('lon-max')
    };

    const { data, error } = await _supabase.rpc('get_ocean_points', params);

    if (error) {
        console.error("Supabase Error Object:", error);
        chlDisplay.innerText = "DB Error";
        countDisplay.innerHTML = `<span style="color: red; font-size: 0.9em;">${error.message}</span>`;
        dataPanel.classList.remove('is-loading');
        visualPanel.classList.remove('is-loading');
        return;
    }

    const result = data[0]; 
    tbody.innerHTML = ''; 
    markerGroup.clearLayers(); 

    if (result && result.total_points > 0) {
        chlDisplay.innerText = result.avg_chl;
        countDisplay.innerText = result.total_points.toLocaleString();
        medianDisplay.innerText = result.median_chl !== null ? result.median_chl : "N/A";
        sdDisplay.innerText = result.sd_chl !== null ? result.sd_chl : "N/A";
        varDisplay.innerText = result.var_chl !== null ? result.var_chl : "N/A";

        if (result.env_stats) {
            const st = result.env_stats;
            document.getElementById('lat-range').innerText = `${st.lat.min} - ${st.lat.max}`;
            document.getElementById('lat-mean').innerText = `Mean: ${st.lat.mean}`;
            document.getElementById('lon-range').innerText = `${st.lon.min} - ${st.lon.max}`;
            document.getElementById('lon-mean').innerText = `Mean: ${st.lon.mean}`;
            document.getElementById('sst-range').innerText = `${st.sst.min} - ${st.sst.max}`;
            document.getElementById('sst-mean').innerText = `Mean: ${st.sst.mean}`;
            document.getElementById('sla-range').innerText = `${st.sla.min} - ${st.sla.max}`;
            document.getElementById('sla-mean').innerText = `Mean: ${st.sla.mean}`;
            document.getElementById('oni-range').innerText = `${st.oni.min} - ${st.oni.max}`;
            document.getElementById('oni-mean').innerText = `Mean: ${st.oni.mean}`;
        }

        if (result.top_points && result.env_stats) {
            const getOutlierStatus = (val, mean, sd) => {
                if (sd === null || sd === 0 || mean === null) return 'none';
                if (val > (mean + (2 * sd))) return 'high';
                if (val < (mean - (2 * sd))) return 'low';
                return 'none';
            };

            const getOutlierStyle = (status) => {
                if (status === 'high') return "font-weight: bold; color: #c62828; background-color: #ffebee;"; 
                if (status === 'low')  return "font-weight: bold; color: #1565c0; background-color: #e3f2fd;"; 
                return "";
            };

            result.top_points.forEach(pt => {
                const sstStatus = getOutlierStatus(Number(pt.sst), GLOBAL_STATS.sst.mean, GLOBAL_STATS.sst.sd);
                const slaStatus = getOutlierStatus(Number(pt.sla), GLOBAL_STATS.sla.mean, GLOBAL_STATS.sla.sd);
                const oniStatus = getOutlierStatus(Number(pt.oni), GLOBAL_STATS.oni.mean, GLOBAL_STATS.oni.sd);

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: left;">${pt.date}</td>
                    <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right;">${Number(pt.latitude).toFixed(2)}</td>
                    <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right;">${Number(pt.longitude).toFixed(2)}</td>
                    <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right; ${getOutlierStyle(sstStatus)}">${Number(pt.sst).toFixed(2)}</td>
                    <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right; ${getOutlierStyle(slaStatus)}">${Number(pt.sla).toFixed(3)}</td>
                    <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right; ${getOutlierStyle(oniStatus)}">${Number(pt.oni).toFixed(2)}</td>
                    <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #0056b3;">${Number(pt.chlor_a).toFixed(2)}</td>
                `;
                
                // Add click listener for daily map drill-down
                tr.onclick = () => loadDailyMap(pt.date, tr);
                
                tbody.appendChild(tr);
            });
        }
        
        if (result.map_points && result.map_points.length > 0) {
            let chlorValues = [];
            
            result.map_points.forEach(pt => {
                chlorValues.push(pt.chlor_a);
                let color = getGradientColor(pt.chlor_a);
                L.circleMarker([pt.latitude, pt.longitude], {
                    radius: 3, color: color, fillColor: color, fillOpacity: 0.8, weight: 1
                }).addTo(markerGroup);
            });

            chlorValues.sort((a, b) => a - b);
            const min = chlorValues[0];
            const max = chlorValues[chlorValues.length - 1];
            const binCount = 25; 
            const binWidth = (max - min) / binCount || 1;
            let bins = Array(binCount).fill(0);
            let labels = Array(binCount).fill(0).map((_, i) => (min + i * binWidth).toFixed(1));

            chlorValues.forEach(v => {
                let binIndex = Math.floor((v - min) / binWidth);
                if (binIndex >= binCount) binIndex = binCount - 1;
                bins[binIndex]++;
            });

            distChart.data.labels = labels;
            distChart.data.datasets[0].data = bins;
            distChart.update();
        }

    } else {
        chlDisplay.innerText = "0.00"; countDisplay.innerText = "0"; medianDisplay.innerText = "--"; sdDisplay.innerText = "--"; varDisplay.innerText = "--";
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 1rem;">No data matching these filters.</td></tr>';
        
        ['lat', 'lon', 'sst', 'sla', 'oni'].forEach(v => {
            document.getElementById(`${v}-range`).innerText = "--";
            document.getElementById(`${v}-mean`).innerText = "Mean: --";
        });

        distChart.data.labels = []; distChart.data.datasets[0].data = []; distChart.update();
    }

    dataPanel.classList.remove('is-loading');
    visualPanel.classList.remove('is-loading');
}

// 6. Interactive Drill-Down Function
async function loadDailyMap(selectedDate, clickedRow = null) {
    const visualPanel = document.querySelector('.visual-panel');
    visualPanel.classList.add('is-loading');

    // Update global state and UI controls
    currentDailyDate = selectedDate;
    document.getElementById('date-controls').style.display = 'flex';
    document.getElementById('current-map-date').innerText = selectedDate;

    // UI Polish: Clear all row highlights
    document.querySelectorAll('#top-points-body tr').forEach(r => r.classList.remove('selected-row'));
    
    // Only apply the highlight if the user actually clicked a row (not a button)
    if (clickedRow) {
        clickedRow.classList.add('selected-row');
    }

    // Query Supabase for all coordinates on this exact date
    const { data, error } = await _supabase
        .from('ocean_data')
        .select('latitude, longitude, chlor_a')
        .eq('date', selectedDate);

    if (error) {
        console.error("Error fetching daily map:", error);
        visualPanel.classList.remove('is-loading');
        return;
    }

    // Clear the daily map and draw the specific day's data
    dailyMarkerGroup.clearLayers();
    
    if (data && data.length > 0) {
        data.forEach(pt => {
            let color = getGradientColor(pt.chlor_a);
            L.circleMarker([pt.latitude, pt.longitude], {
                radius: 3, color: color, fillColor: color, fillOpacity: 0.8, weight: 1
            }).addTo(dailyMarkerGroup);
        });
    }
    
    visualPanel.classList.remove('is-loading');
}

// 7. Run on load
updateDashboard();