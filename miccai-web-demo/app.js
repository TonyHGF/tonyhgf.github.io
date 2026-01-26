let allData = [];

document.addEventListener('DOMContentLoaded', () => {
    // Make sure 'assets/miccai_data.json' exists and is in the correct folder
    fetch('assets/miccai_data.json')
        .then(response => response.json())
        .then(data => {
            allData = data;
            initFilters();
            drawChart(allData);
        })
        .catch(error => console.error('Error loading data:', error));
});

function drawChart(data) {
    // TRACE 0: The main data
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
        hoverinfo: 'none', 
        name: 'MainData'
    };

    // TRACE 1: The "Highlighter"
    const highlightTrace = {
        x: [], 
        y: [], 
        mode: 'markers',
        type: 'scattergl',
        marker: {
            size: 15,
            color: 'rgba(0,0,0,0)', 
            line: { color: '#FF0000', width: 3 }
        },
        hoverinfo: 'skip',
        name: 'Highlight'
    };

    const layout = {
        title: 'MICCAI Semantic Map (2000-2025)',
        hovermode: 'closest',
        margin: { t: 40, l: 40, r: 20, b: 40 },
        dragmode: 'pan',
        showlegend: false
    };

    const config = { responsive: true };

    Plotly.newPlot('chart', [mainTrace, highlightTrace], layout, config);

    const plot = document.getElementById('chart');

    // HOVER EVENT
    plot.on('plotly_hover', (eventData) => {
        const point = eventData.points[0];
        const index = point.customdata;

        // 1. Update Sidebar
        updateDetails(allData[index]);

        // 2. Move the Highlighter
        Plotly.restyle('chart', {
            x: [[point.x]],
            y: [[point.y]]
        }, [1]); 
    });

    // UNHOVER EVENT
    plot.on('plotly_unhover', () => {
        Plotly.restyle('chart', {
            x: [[]],
            y: [[]]
        }, [1]);
    });
}

// --- FILTER LOGIC ---

function initFilters() {
    // Get unique values for dropdowns
    const years = [...new Set(allData.map(d => d.year))].sort();
    const countries = [...new Set(allData.map(d => d.country))].sort();
    const insts = [...new Set(allData.map(d => d.institution))].sort();

    // Populate dropdowns
    populateSelect('sel-year', years);
    populateSelect('sel-country', countries);
    populateSelect('sel-inst', insts);

    // Add event listeners
    document.querySelectorAll('select').forEach(sel => {
        sel.addEventListener('change', applyFilters);
    });
    
    document.getElementById('btn-reset').addEventListener('click', () => {
        document.querySelectorAll('select').forEach(s => s.value = 'all');
        applyFilters();
    });
}

// [FIXED] This function was missing in your original code
function populateSelect(id, options) {
    const select = document.getElementById(id);
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        select.appendChild(option);
    });
}

function applyFilters() {
    const year = document.getElementById('sel-year').value;
    const country = document.getElementById('sel-country').value;
    const inst = document.getElementById('sel-inst').value;

    const newColors = [];
    const newOpacities = [];
    const newSizes = [];

    // Check if any filter is actually active
    const isFiltering = (year !== 'all' || country !== 'all' || inst !== 'all');

    allData.forEach(d => {
        const matchYear = year === 'all' || d.year.toString() === year;
        const matchCountry = country === 'all' || d.country === country;
        const matchInst = inst === 'all' || d.institution === inst;

        // We ALWAYS use the base color now, never gray
        newColors.push(d.base_color);

        if (matchYear && matchCountry && matchInst) {
            // MATCH: Full opacity, normal size
            // If we are filtering, make selected points slightly larger (10) to pop out
            newOpacities.push(1); 
            newSizes.push(isFiltering ? 10 : 8); 
        } else {
            // NO MATCH: Low opacity (0.3), smaller size (5), but SAME COLOR
            newOpacities.push(0.3); // Increased from 0.1 to 0.3 so they are visible
            newSizes.push(5);
        }
    });

    Plotly.restyle('chart', {
        'marker.color': [newColors],
        'marker.opacity': [newOpacities],
        'marker.size': [newSizes]
    }, [0]); 
}

// --- SIDEBAR UI ---

function updateDetails(record) {
    const box = document.getElementById('details-box');
    
    // Check if authors is an array or string
    const authorStr = Array.isArray(record.authors) ? record.authors.join(", ") : record.authors;

    box.innerHTML = `
        <div class="details-title">${record.title}</div>
        <div class="details-meta">
            <b>Authors:</b> ${authorStr || 'N/A'} <br>
            <hr style="margin: 5px 0; border: 0; border-top: 1px solid #eee;">
            <b>Year:</b> ${record.year} <br> 
            <b>Country:</b> ${record.country} <br> 
            <b>Inst:</b> ${record.institution}
        </div>
        <hr>
        <div class="details-abstract">
            <b>Cluster:</b> ${record.topic_id}<br>
            ${record.abstract || '(No abstract available)'}
        </div>
    `;
}