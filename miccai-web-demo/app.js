// Global State
let rawPapers = {};       // Content of papers.json
let rawAssignments = {};  // Content of assignments.json
let rawColors = {};       // Content of colors.json
let plotData = [];        // Array version of papers for Plotly
let lockedIndex = null; // [NEW] 用来存储当前锁定的文章索引，null 代表没锁定

document.addEventListener('DOMContentLoaded', () => {
    const timestamp = new Date().getTime(); // Prevent caching during dev

    // 1. Fetch all three files in parallel
    Promise.all([
        fetch(`assets/papers.json?t=${timestamp}`).then(res => res.json()),
        fetch(`assets/assignments.json?t=${timestamp}`).then(res => res.json()),
        fetch(`assets/colors.json?t=${timestamp}`).then(res => res.json())
    ])
    .then(([papers, assignments, colors]) => {
        // Store raw data
        rawPapers = papers;
        rawAssignments = assignments;
        rawColors = colors;

        // Convert dictionary to array for Plotly (and existing filter logic)
        // Object.values() creates an array of the paper objects
        plotData = Object.values(rawPapers);

        // Initialize UI components
        initAssignmentSelect();
        initFilters();
        
        // Initial Draw
        updateColorMapping(); // Calculate colors based on default assignment
        drawChart(plotData);
    })
    .catch(error => console.error('Error loading data:', error));
});

// --- NEW: COLORING LOGIC ---

function initAssignmentSelect() {
    const selector = document.getElementById('sel-assignment');
    selector.innerHTML = '';

    // Create options based on assignments.json keys
    // Example keys: "group_by_year", "group_by_topic", etc.
    Object.keys(rawAssignments).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = rawAssignments[key].name || key; // Use "name" field if available
        selector.appendChild(opt);
    });

    // Listen for changes
    selector.addEventListener('change', () => {
        updateColorMapping();
        applyFilters(); // Re-apply filters/colors to update the chart
    });
}

function updateColorMapping() {
    const currentMode = document.getElementById('sel-assignment').value;
    const assignmentMap = rawAssignments[currentMode]?.map || {};
    const colorPalette = rawColors[currentMode] || {};

    // Iterate over our data array and attach the calculated color
    // We add a temporary property `current_color` to each data point
    plotData.forEach(d => {
        const paperId = d.paper_id; // Using the ID from papers.json
        
        // 1. Find which group this paper belongs to in the current mode
        const groupLabel = assignmentMap[paperId]; 

        // 2. Find the color for that group, or default to grey
        if (groupLabel && colorPalette[groupLabel]) {
            d.current_color = colorPalette[groupLabel];
        } else {
            d.current_color = '#cccccc'; // Default grey for unassigned/outliers
        }
    });
}

// --- EXISTING CHART LOGIC (Updated) ---

// [NEW] 引入一个标志位，用来区分是“点击了点”还是“点击了背景”
let isPointClicked = false; 

function drawChart(data) {
    if (!data || data.length === 0) return;

    if (data[0].x === undefined || data[0].y === undefined) {
        console.error("❌ Data is missing 'x' or 'y' coordinates.");
        return;
    }

    const mainTrace = {
        x: data.map(d => d.x),
        y: data.map(d => d.y),
        mode: 'markers',
        type: 'scattergl', 
        marker: {
            size: 8,
            color: data.map(d => d.current_color || '#cccccc'),
            opacity: 0.8
        },
        customdata: data.map((d, i) => i), 
        hoverinfo: 'none', 
        name: 'MainData'
    };

    const highlightTrace = {
        x: [], y: [], 
        mode: 'markers', type: 'scattergl',
        marker: {
            size: 15,
            color: 'rgba(0,0,0,0)', 
            line: { color: '#FF0000', width: 3 }
        },
        hoverinfo: 'skip', name: 'Highlight'
    };

    const layout = {
        title: 'MICCAI Semantic Map',
        hovermode: 'closest',
        margin: { t: 40, l: 40, r: 20, b: 40 },
        dragmode: 'pan',
        showlegend: false
    };

    const config = { responsive: true };

    Plotly.newPlot('chart', [mainTrace, highlightTrace], layout, config);

    const plot = document.getElementById('chart');

    // --- 1. Plotly Click Event (处理“点”的点击) ---
    plot.on('plotly_click', (eventData) => {
        const point = eventData.points[0];
        const index = point.customdata;
        const record = plotData[index];

        // [FIXED] 修复 Regression：
        // 如果这个点被 Filter 隐藏了，点击它应该无效！
        if (record.isHidden) {
            return;
        }

        // 标记：刚刚点击了一个点！(通知下面的背景点击逻辑不要触发)
        isPointClicked = true;

        // 锁定当前文章
        lockedIndex = index;
        
        // 立即更新 UI
        updateDetails(record);
        Plotly.restyle('chart', {
            x: [[point.x]],
            y: [[point.y]]
        }, [1]);
    });

    // --- 2. Native DOM Click Event (处理“背景”的点击) ---
    // 这里的逻辑是：给各种点击事件一点时间差。
    // 如果 plotly_click 触发了，isPointClicked 会变 true。
    // 否则，说明点到了空白处。
    plot.addEventListener('click', () => {
        setTimeout(() => {
            // 如果刚刚没有点击到点 (isPointClicked 还是 false)
            // 并且当前处于锁定状态 -> 说明点到了空白处，应该“解绑”
            if (!isPointClicked && lockedIndex !== null) {
                
                // 解锁
                lockedIndex = null;
                
                // 清除红圈
                Plotly.restyle('chart', {
                    x: [[]],
                    y: [[]]
                }, [1]);
                
                // (可选) 如果你想在解绑时清空 sidebar，可以在这里调用：
                // document.getElementById('details-box').innerHTML = '...';
            }
            
            // 重置标志位，为下一次点击做准备
            isPointClicked = false;
        }, 100); // 100毫秒的延迟足够让 plotly_click 先执行
    });

    // --- 3. Hover Event (保持不变) ---
    plot.on('plotly_hover', (eventData) => {
        // 如果锁定了，忽略 Hover
        if (lockedIndex !== null) return;

        const point = eventData.points[0];
        const index = point.customdata;
        const record = plotData[index];

        // 如果被隐藏了，忽略 Hover
        if (record.isHidden) return;

        updateDetails(record); 
        Plotly.restyle('chart', {
            x: [[point.x]],
            y: [[point.y]]
        }, [1]); 
    });

    // --- 4. Unhover Event (保持不变) ---
    plot.on('plotly_unhover', () => {
        // 如果锁定了，不要清除红圈
        if (lockedIndex !== null) return;

        Plotly.restyle('chart', { x: [[]], y: [[]] }, [1]);
    });
}

// --- FILTER LOGIC (Updated to preserve colors) ---

function initFilters() {
    // 1. 设置 Year 输入框的提示语 (Placeholder)
    // 只有当数据加载成功且有年份时才执行
    const years = plotData.map(d => d.year).filter(y => y);
    const yearInput = document.getElementById('sel-year');
    
    if (yearInput && years.length > 0) {
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        yearInput.placeholder = `e.g. ${minYear}-${minYear+3}, ${maxYear}`;
    }

    // 2. 准备 Country 和 Institution 的数据
    const countries = [...new Set(plotData.map(d => d.country))].sort();
    const insts = [...new Set(plotData.map(d => d.institution))].sort();

    // 3. 填充下拉菜单
    // ⚠️ 注意：这里千万不要再写 populateSelect('sel-year', ...); 了！
    populateSelect('sel-country', countries);
    populateSelect('sel-inst', insts);

    // 4. 绑定事件监听
    // 给所有下拉菜单绑定
    document.querySelectorAll('select').forEach(sel => {
        sel.addEventListener('change', applyFilters);
    });

    // 单独给 Year 输入框绑定 (因为它不是 select)
    if (yearInput) {
        yearInput.addEventListener('change', applyFilters);
    }
    
    // Reset 按钮逻辑
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            document.querySelectorAll('select').forEach(s => s.value = 'all');
            if (yearInput) yearInput.value = ''; // 清空输入框
            applyFilters();
        });
    }
}

function populateSelect(id, options) {
    const select = document.getElementById(id);
    // Keep the "All" option, verify it exists or re-add it
    if(select.options.length === 0 || select.options[0].value !== 'all') {
         const allOpt = document.createElement('option');
         allOpt.value = 'all';
         allOpt.text = 'All';
         select.prepend(allOpt);
    }
    
    options.forEach(opt => {
        // filter out null/undefined
        if (!opt) return; 
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        select.appendChild(option);
    });
}

function applyFilters() {
    // ... 前面的代码保持不变 (获取 inputs, parseYearInput 等) ...

    const yearInput = document.getElementById('sel-year');
    const countrySelect = document.getElementById('sel-country');
    const instSelect = document.getElementById('sel-inst');

    const yearInputStr = yearInput ? yearInput.value : '';
    const country = countrySelect ? countrySelect.value : 'all';
    const inst = instSelect ? instSelect.value : 'all';

    const selectedYears = parseYearInput(yearInputStr);

    const newColors = [];
    const newOpacities = [];
    const newSizes = [];
    const isFiltering = (selectedYears !== null || country !== 'all' || inst !== 'all');

    plotData.forEach(d => {
        const matchYear = (selectedYears === null) || selectedYears.has(d.year);
        const matchCountry = country === 'all' || d.country === country;
        const matchInst = inst === 'all' || d.institution === inst;

        // [NEW] 这里的逻辑是关键：
        // 如果满足所有条件，isVisible 就是 true，否则就是 false
        const isVisible = matchYear && matchCountry && matchInst;
        
        // 我们把这个状态直接存到数据对象里，供 hover 时检查
        d.isHidden = !isVisible; 

        newColors.push(d.current_color || '#cccccc');

        if (isVisible) {
            newOpacities.push(1); 
            newSizes.push(isFiltering ? 10 : 8); 
        } else {
            newOpacities.push(0.1); 
            newSizes.push(5);
        }
    });

    Plotly.restyle('chart', {
        'marker.color': [newColors],
        'marker.opacity': [newOpacities],
        'marker.size': [newSizes]
    }, [0]); 
}


// 解析年份输入的辅助函数
// 输入: "2005-2007, 2009"
// 输出: Set { 2005, 2006, 2007, 2009 } 或 null (如果为空)
function parseYearInput(inputStr) {
    if (!inputStr || inputStr.trim() === '') {
        return null; // null 代表 "All Years"
    }

    const validYears = new Set();
    // 1. 按逗号分割
    const parts = inputStr.split(',');

    parts.forEach(part => {
        part = part.trim();
        if (part.includes('-')) {
            // 2. 处理范围 (e.g., "2005-2010")
            const range = part.split('-');
            if (range.length === 2) {
                const start = parseInt(range[0]);
                const end = parseInt(range[1]);
                if (!isNaN(start) && !isNaN(end)) {
                    // 确保从小到大循环
                    const min = Math.min(start, end);
                    const max = Math.max(start, end);
                    for (let y = min; y <= max; y++) {
                        validYears.add(y);
                    }
                }
            }
        } else {
            // 3. 处理单一年份 (e.g., "2012")
            const y = parseInt(part);
            if (!isNaN(y)) {
                validYears.add(y);
            }
        }
    });

    return validYears.size > 0 ? validYears : null;
}


// --- SIDEBAR UI ---

function updateDetails(record) {
    if (!record) return;
    const box = document.getElementById('details-box');
    const authorStr = Array.isArray(record.authors) ? record.authors.join(", ") : record.authors;

    // 1. 获取当前着色模式的信息 (为了显示 Cluster)
    const selector = document.getElementById('sel-assignment');
    const currentMode = selector ? selector.value : '';
    const assignmentMap = rawAssignments[currentMode]?.map || {};
    const paperId = record.paper_id || record.id;
    const clusterLabel = assignmentMap[paperId] || 'N/A';
    const modeName = rawAssignments[currentMode]?.name || 'Cluster';

    // 2. [NEW] 生成 Labels 的 HTML
    let labelsHtml = '';
    if (record.labels) {
        // 定义你想显示的字段顺序
        const keysToShow = ['category', 'task', 'method', 'modality', 'organ'];
        
        labelsHtml += '<div class="label-section">';
        keysToShow.forEach(key => {
            // 检查该字段是否有数据
            if (record.labels[key] && record.labels[key].length > 0) {
                // 首字母大写 (e.g., "task" -> "Task")
                const title = key.charAt(0).toUpperCase() + key.slice(1);
                
                // 将数组里的每个词转换成 <span class="label-tag">...</span>
                const tags = record.labels[key]
                    .map(val => `<span class="label-tag">${val}</span>`)
                    .join('');
                
                labelsHtml += `
                    <div class="label-row">
                        <span class="label-key">${title}:</span>
                        ${tags}
                    </div>
                `;
            }
        });
        labelsHtml += '</div>';
    }

    // 3. 组装最终的 HTML
    box.innerHTML = `
        <div class="details-title">${record.title}</div>
        
        <div class="details-meta">
            <b>Authors:</b> ${authorStr || 'N/A'} <br>
            <div style="margin-top:5px; color:#666;">
                ${record.year} | ${record.country} | ${record.institution}
            </div>
        </div>

        ${labelsHtml}

        <div class="details-abstract">
            <div style="margin-bottom: 8px; font-size: 0.85em; color: #007bff;">
                <b>${modeName}:</b> ${clusterLabel}
            </div>
            ${record.abstract || '(No abstract available)'}
            <br><br>
            <a href="${record.link}" target="_blank" style="display:inline-block; margin-top:5px; color:#007bff; text-decoration:none;">
                🔗 View Paper Source
            </a>
        </div>
    `;
}