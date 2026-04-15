let oceanData = [];

// 1. Fetch the data
fetch('output/historical_explorer.json')
  .then(response => {
      if (!response.ok) throw new Error("Data not found.");
      return response.json();
  })
  .then(data => {
    oceanData = data;
    updateResults(); // Run once on load
  })
  .catch(error => {
      document.getElementById('chl-result').innerText = "Error loading data";
      console.error(error);
  });

// 2. Add event listeners to ALL the new inputs
const inputs = [
    'month-input', 
    'sst-min', 'sst-max', 
    'sla-min', 'sla-max', 
    'oni-min', 'oni-max', 
    'lat-min', 'lat-max', 
    'lon-min', 'lon-max'
];

inputs.forEach(id => {
    document.getElementById(id).addEventListener('input', updateResults);
});

// 3. The Range Filtering Function
function updateResults() {
  const selectedMonth = document.getElementById('month-input').value;
  
  // Parse all Mins and Maxes
  const sstMin = parseFloat(document.getElementById('sst-min').value);
  const sstMax = parseFloat(document.getElementById('sst-max').value);
  const slaMin = parseFloat(document.getElementById('sla-min').value);
  const slaMax = parseFloat(document.getElementById('sla-max').value);
  const oniMin = parseFloat(document.getElementById('oni-min').value);
  const oniMax = parseFloat(document.getElementById('oni-max').value);
  const latMin = parseFloat(document.getElementById('lat-min').value);
  const latMax = parseFloat(document.getElementById('lat-max').value);
  const lonMin = parseFloat(document.getElementById('lon-min').value);
  const lonMax = parseFloat(document.getElementById('lon-max').value);

  // Filter the massive array
  const filteredData = oceanData.filter(d => {
    let match = true;

    // Month (Exact match)
    if (selectedMonth !== 'all') {
        match = match && (d.month === parseInt(selectedMonth));
    }

    // Explicit Range Checks (Only filters if the box actually has a number in it)
    if (!isNaN(sstMin)) match = match && (d.sst >= sstMin);
    if (!isNaN(sstMax)) match = match && (d.sst <= sstMax);

    if (!isNaN(slaMin)) match = match && (d.sla >= slaMin);
    if (!isNaN(slaMax)) match = match && (d.sla <= slaMax);

    if (!isNaN(oniMin)) match = match && (d.oni >= oniMin);
    if (!isNaN(oniMax)) match = match && (d.oni <= oniMax);

    if (!isNaN(latMin)) match = match && (d.latitude >= latMin);
    if (!isNaN(latMax)) match = match && (d.latitude <= latMax);

    if (!isNaN(lonMin)) match = match && (d.longitude >= lonMin);
    if (!isNaN(lonMax)) match = match && (d.longitude <= lonMax);

    return match;
  });

  // Calculate Results
  if (filteredData.length > 0) {
    const totalChl = filteredData.reduce((sum, d) => sum + d.chlor_a, 0);
    const avgChl = (totalChl / filteredData.length).toFixed(2);
    
    document.getElementById('chl-result').innerText = avgChl;
    document.getElementById('count-result').innerText = filteredData.length;
  } else {
    document.getElementById('chl-result').innerText = "0.00";
    document.getElementById('count-result').innerText = "0 (No matches)";
  }
}