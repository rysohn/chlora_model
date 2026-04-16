// 1. Initialize Supabase
const supabaseUrl = 'https://yagqrtjjaecnvhozegka.supabase.co'; // Your actual URL
const supabaseKey = 'YOUR_ACTUAL_ANON_KEY_HERE'; // Remember to paste your actual anon key!
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// 2. Setup Listeners
const inputs = [
    'month-min', 'month-max', 
    'sst-min', 'sst-max', 
    'sla-min', 'sla-max', 
    'oni-min', 'oni-max', 
    'lat-min', 'lat-max', 
    'lon-min', 'lon-max'
];

inputs.forEach(id => {
    document.getElementById(id).addEventListener('change', updateDashboard);
});

// 3. The Query Function
async function updateDashboard() {
    // A. Grab the entire right-side panel & turn on the fading loading state
    const dataPanel = document.querySelector('.data-panel');
    dataPanel.classList.add('is-loading');

    // B. Map all our HTML elements exactly ONCE
    const chlDisplay = document.getElementById('chl-result');
    const countDisplay = document.getElementById('count-result');
    const medianDisplay = document.getElementById('median-result');
    const sdDisplay = document.getElementById('sd-result');
    const varDisplay = document.getElementById('var-result');
    const tbody = document.getElementById('top-points-body');

    // Helper to handle empty boxes as 'null' for the SQL function
    const getVal = (id) => {
        const val = document.getElementById(id).value;
        return (val === "" || val === "all") ? null : parseFloat(val);
    };

    const params = {
        p_month_min: getVal('month-min'), p_month_max: getVal('month-max'),
        p_sst_min: getVal('sst-min'), p_sst_max: getVal('sst-max'),
        p_sla_min: getVal('sla-min'), p_sla_max: getVal('sla-max'),
        p_oni_min: getVal('oni-min'), p_oni_max: getVal('oni-max'),
        p_lat_min: getVal('lat-min'), p_lat_max: getVal('lat-max'),
        p_lon_min: getVal('lon-min'), p_lon_max: getVal('lon-max')
    };

    // C. CALL THE DATABASE
    const { data, error } = await _supabase.rpc('get_ocean_points', params);

    if (error) {
        console.error("Supabase Error Object:", error);
        chlDisplay.innerText = "DB Error";
        countDisplay.innerHTML = `<span style="color: red; font-size: 0.9em;">${error.message}</span>`;
        
        // Turn off loading state if there's an error
        dataPanel.classList.remove('is-loading');
        return;
    }

    // D. UPDATE THE UI
    const result = data[0]; 
    tbody.innerHTML = ''; 

    if (result && result.total_points > 0) {
        chlDisplay.innerText = result.avg_chl;
        countDisplay.innerText = result.total_points.toLocaleString();
        
        medianDisplay.innerText = result.median_chl !== null ? result.median_chl : "N/A";
        sdDisplay.innerText = result.sd_chl !== null ? result.sd_chl : "N/A";
        varDisplay.innerText = result.var_chl !== null ? result.var_chl : "N/A";

        if (result.top_points) {
            result.top_points.forEach(pt => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${pt.month}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${Number(pt.latitude).toFixed(2)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${Number(pt.longitude).toFixed(2)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${Number(pt.sst).toFixed(2)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${Number(pt.sla).toFixed(3)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${Number(pt.oni).toFixed(2)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; color: #0056b3;">${Number(pt.chlor_a).toFixed(2)}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } else {
        chlDisplay.innerText = "0.00";
        countDisplay.innerText = "0";
        medianDisplay.innerText = "--";
        sdDisplay.innerText = "--";
        varDisplay.innerText = "--";
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 1rem;">No data matching these filters.</td></tr>';
    }

    // E. TURN OFF LOADING STATE: Restore panel to full opacity
    dataPanel.classList.remove('is-loading');
}

// 4. Run once on load to show global averages
updateDashboard();