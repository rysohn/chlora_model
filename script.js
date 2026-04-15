// 1. Initialize Supabase
// You find these in your Supabase Dashboard under Settings > API
const supabaseUrl = 'https://yagqrtjjaecnvhozegka.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhZ3FydGpqYWVjbnZob3plZ2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMTMxODMsImV4cCI6MjA5MTc4OTE4M30.GR2xT-qkuJIdc6XHP93BHwKZGVXZ91VmdHWnzkKQIZU'; 
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// 2. Setup Listeners
const inputs = [
    'month-min', 'month-max', 'sst-min', 'sst-max', 'sla-min', 'sla-max', 
    'oni-min', 'oni-max', 'lat-min', 'lat-max', 'lon-min', 'lon-max'
];

inputs.forEach(id => {
    // We use 'change' instead of 'input' so we don't spam the database 
    // with a request for every single keystroke.
    document.getElementById(id).addEventListener('change', updateDashboard);
});

// 3. The Query Function
async function updateDashboard() {
    const chlDisplay = document.getElementById('chl-result');
    const countDisplay = document.getElementById('count-result');

    chlDisplay.innerText = "Querying...";

    // Helper to handle empty boxes as 'null' for the SQL function
    const getVal = (id) => {
        const val = document.getElementById(id).value;
        return (val === "" || val === "all") ? null : parseFloat(val);
    };

    const params = {
        p_month_min: getVal('month-min'),
        p_month_max: getVal('month-max'),
        p_sst_min: getVal('sst-min'), p_sst_max: getVal('sst-max'),
        p_sla_min: getVal('sla-min'), p_sla_max: getVal('sla-max'),
        p_oni_min: getVal('oni-min'), p_oni_max: getVal('oni-max'),
        p_lat_min: getVal('lat-min'), p_lat_max: getVal('lat-max'),
        p_lon_min: getVal('lon-min'), p_lon_max: getVal('lon-max')
    };

    // CALL THE DATABASE
    const { data, error } = await _supabase.rpc('get_ocean_points', params);

    if (error) {
        console.error("Supabase Error Object:", error);
        
        chlDisplay.innerText = "DB Error";
        countDisplay.innerHTML = `<span style="color: red; font-size: 0.9em;">${error.message} <br> ${error.details || ''}</span>`;
        return;
    }

    if (error) {
        console.error("Supabase Error:", error);
        chlDisplay.innerText = "Error";
        return;
    }

    // UPDATE THE UI
    const result = data[0]; 
    const tbody = document.getElementById('top-points-body');
    
    // Clear out the old table rows every time a filter changes
    tbody.innerHTML = ''; 

    if (result && result.total_points > 0) {
        chlDisplay.innerText = result.avg_chl;
        countDisplay.innerText = result.total_points.toLocaleString();
        
        // Loop through the top 10 points and create a table row for each
        if (result.top_points) {
            result.top_points.forEach(pt => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${pt.month}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${pt.latitude}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${pt.longitude}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${pt.sst}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${pt.sla}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${pt.oni}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; color: #0056b3;">${pt.chlor_a}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } else {
        chlDisplay.innerText = "0.00";
        countDisplay.innerText = "0 (No matches)";
        
        // Let the user know the table is empty
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 1rem;">No data matching these filters.</td></tr>';
    }
}

// Run once on load to show global averages
updateDashboard();