let allData = [];

document.addEventListener('DOMContentLoaded', () => {
    fetch('assets/miccai_data.json')
        .then(response => response.json())
        .then(data => {
            allData = data;
            initFilters();
            drawChart(allData);
        });
});

function drawChart(data) {
    // TRACE 0: The main data (2000+ points)
    const mainTrace = {
        x: data.map(d => d.x),
        y: data.map(d => d.y),
        mode: 'markers',
        type: 'scattergl', 
        marker: {
            size: 8,
            color: data.map(d => d.base_color),
            opacity: 0.8
        },
        customdata: data.map((d, i) => i), 
        hoverinfo: 'none', // Keep text hidden, we only want visual feedback
        name: 'MainData'
    };

    // [CHANGE 1] TRACE 1: The "Highlighter" (Single point, initially hidden)
    const highlightTrace = {
        x: [], 
        y: [], 
        mode: 'markers',
        type: 'scattergl',
        marker: {
            size: 15,              // Much bigger
            color: 'rgba(0,0,0,0)', // Transparent fill
            line: {                // Bright Red Border
                color: '#FF0000',
                width: 3
            }
        },
        hoverinfo: 'skip',         // Mouse ignores this trace
        name: 'Highlight'
    };

    const layout = {
        title: 'MICCAI Semantic Map (2000-2025)',
        hovermode: 'closest',
        margin: { t: 40, l: 40, r: 20, b: 40 },
        dragmode: 'pan',
        showlegend: false          // Hide legend so "Highlight" doesn't show up
    };

    const config = { responsive: true };

    // Plot both traces
    Plotly.newPlot('chart', [mainTrace, highlightTrace], layout, config);

    const plot = document.getElementById('chart');

    // [CHANGE 2] ON HOVER: Move the Highlight Trace to the hovered point
    plot.on('plotly_hover', (eventData) => {
        const point = eventData.points[0];
        const index = point.customdata;

        // 1. Update Sidebar
        updateDetails(allData[index]);

        // 2. Move the Red Circle to this point's coordinates
        // We restyle ONLY trace index [1] (the highlight trace)
        Plotly.restyle('chart', {
            x: [[point.x]],
            y: [[point.y]]
        }, [1]); 
    });

    // [CHANGE 3] ON UNHOVER: Hide the Highlight Trace
    plot.on('plotly_unhover', () => {
        Plotly.restyle('chart', {
            x: [[]],
            y: [[]]
        }, [1]);
    });
}

// 3. Update Sidebar Details
function updateDetails(record) {
    const box = document.getElementById('details-box');
    box.innerHTML = `
        <div class="details-title">${record.title}</div>
        <div class="details-meta">
            <b>File:</b> ${record.filename}<br>
            <b>Year:</b> ${record.year} | <b>Inst:</b> ${record.institution}<br>
            <b>Region:</b> ${record.region}
        </div>
        <hr>
        <div class="details-abstract">
            <b>Topic Cluster:</b> ${record.topic_id}<br>
            (Abstract would go here...)
        </div>
    `;
}

// 4. Populate Dropdowns
function initFilters() {
    const years = [...new Set(allData.map(d => d.year))].sort();
    const regions = [...new Set(allData.map(d => d.region))].sort();
    const insts = [...new Set(allData.map(d => d.institution))].sort();

    populateSelect('sel-year', years);
    populateSelect('sel-region', regions);
    populateSelect('sel-inst', insts);

    // Add event listeners to all dropdowns
    document.querySelectorAll('select').forEach(sel => {
        sel.addEventListener('change', applyFilters);
    });
    
    document.getElementById('btn-reset').addEventListener('click', () => {
        document.querySelectorAll('select').forEach(s => s.value = 'all');
        applyFilters();
    });
}

function populateSelect(id, options) {
    const sel = document.getElementById(id);
    options.forEach(opt => {
        const el = document.createElement('option');
        el.value = opt;
        el.textContent = opt;
        sel.appendChild(el);
    });
}

// 5. The "Grey-out" Filter Logic (CORRECTED)
function applyFilters() {
    const year = document.getElementById('sel-year').value;
    const region = document.getElementById('sel-region').value;
    const inst = document.getElementById('sel-inst').value;

    const newColors = [];
    const newOpacities = [];
    const newSizes = [];

    allData.forEach(d => {
        // Check if matches filters
        // Note: d.year is likely a number, so we convert to string for comparison
        const matchYear = year === 'all' || d.year.toString() === year;
        const matchRegion = region === 'all' || d.region === region;
        const matchInst = inst === 'all' || d.institution === inst;

        if (matchYear && matchRegion && matchInst) {
            // MATCH: Highlight Red or Keep Original? 
            const isFiltering = (year !== 'all' || region !== 'all' || inst !== 'all');
            
            // Javascript uses .push(), not .append()
            newColors.push(isFiltering ? '#FF0000' : d.base_color);
            newOpacities.push(isFiltering ? 1.0 : 0.8);
            newSizes.push(isFiltering ? 10 : 8);
        } else {
            // NO MATCH: Grey out
            newColors.push('#e0e0e0');
            newOpacities.push(0.1);
            newSizes.push(5);
        }
    });

    // Update TRACE 0 (The Main Data) only
    Plotly.restyle('chart', {
        'marker.color': [newColors],
        'marker.opacity': [newOpacities],
        'marker.size': [newSizes]
    }, [0]); 
}