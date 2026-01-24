/**
 * Graph Visualization for Codebase Structure
 * Using Cytoscape.js for interactive graph rendering
 * Matches the reference vscode_graph_extension implementation
 */

let cy = null;
let currentLayout = 'auto';
let currentView = 'logic-graph';

// Sample nodes and edges - representing a typical codebase structure
const sampleGraphData = {
    nodes: [
        // Main files
        { data: { id: 'extension.ts', label: 'extension.ts', type: 'file', group: 'core' } },
        { data: { id: 'ui.ts', label: 'ui.ts', type: 'file', group: 'core' } },

        // Handlers
        { data: { id: 'ClaudeMessageHandler.ts', label: 'ClaudeMessageHandler', type: 'file', group: 'handlers' } },
        { data: { id: 'StreamParser.ts', label: 'StreamParser', type: 'file', group: 'handlers' } },
        { data: { id: 'WebviewMessageHandler.ts', label: 'WebviewMessageHandler', type: 'file', group: 'handlers' } },
        { data: { id: 'MCPHandler.ts', label: 'MCPHandler', type: 'file', group: 'handlers' } },

        // Managers
        { data: { id: 'ConversationManager.ts', label: 'ConversationManager', type: 'file', group: 'managers' } },
        { data: { id: 'ProcessManager.ts', label: 'ProcessManager', type: 'file', group: 'managers' } },
        { data: { id: 'DevModeManager.ts', label: 'DevModeManager', type: 'file', group: 'managers' } },
        { data: { id: 'PermissionManager.ts', label: 'PermissionManager', type: 'file', group: 'managers' } },

        // Webview scripts
        { data: { id: 'state.js', label: 'state.js', type: 'file', group: 'webview' } },
        { data: { id: 'modals.js', label: 'modals.js', type: 'file', group: 'webview' } },
        { data: { id: 'message-rendering.js', label: 'message-rendering', type: 'file', group: 'webview' } },
        { data: { id: 'graph-visualization.js', label: 'graph-visualization', type: 'file', group: 'webview' } },

        // Key functions/classes (virtual nodes)
        { data: { id: 'activate', label: 'activate()', type: 'function', group: 'core' } },
        { data: { id: 'handleMessage', label: 'handleMessage()', type: 'function', group: 'handlers' } },
        { data: { id: 'renderGraph', label: 'renderGraph()', type: 'function', group: 'webview' } },
    ],
    edges: [
        // Core dependencies
        { data: { source: 'extension.ts', target: 'activate', label: 'defines' } },
        { data: { source: 'activate', target: 'ConversationManager.ts', label: 'imports' } },
        { data: { source: 'activate', target: 'ProcessManager.ts', label: 'imports' } },
        { data: { source: 'activate', target: 'DevModeManager.ts', label: 'imports' } },

        // Handler relationships
        { data: { source: 'extension.ts', target: 'ClaudeMessageHandler.ts', label: 'imports' } },
        { data: { source: 'extension.ts', target: 'WebviewMessageHandler.ts', label: 'imports' } },
        { data: { source: 'ClaudeMessageHandler.ts', target: 'StreamParser.ts', label: 'uses' } },
        { data: { source: 'ClaudeMessageHandler.ts', target: 'handleMessage', label: 'defines' } },

        // Manager relationships
        { data: { source: 'ConversationManager.ts', target: 'ProcessManager.ts', label: 'uses' } },
        { data: { source: 'ProcessManager.ts', target: 'PermissionManager.ts', label: 'uses' } },
        { data: { source: 'DevModeManager.ts', target: 'MCPHandler.ts', label: 'uses' } },

        // UI relationships
        { data: { source: 'extension.ts', target: 'ui.ts', label: 'imports' } },
        { data: { source: 'ui.ts', target: 'state.js', label: 'loads' } },
        { data: { source: 'ui.ts', target: 'modals.js', label: 'loads' } },
        { data: { source: 'ui.ts', target: 'message-rendering.js', label: 'loads' } },
        { data: { source: 'ui.ts', target: 'graph-visualization.js', label: 'loads' } },

        // Webview internal dependencies
        { data: { source: 'message-rendering.js', target: 'state.js', label: 'uses' } },
        { data: { source: 'modals.js', target: 'state.js', label: 'uses' } },
        { data: { source: 'graph-visualization.js', target: 'renderGraph', label: 'defines' } },
        { data: { source: 'message-rendering.js', target: 'handleMessage', label: 'uses' } },
    ]
};

// Layout configurations
const layoutConfigs = {
    default: {
        name: 'cose',
        idealEdgeLength: 300,
        nodeRepulsion: 600000,
        gravity: 150,
        numIter: 1500,
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 30
    },
    bilkent: {
        name: 'cose-bilkent',
        idealEdgeLength: 250,
        nodeRepulsion: 18000,
        gravity: 2.5,
        numIter: 2500,
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 30
    },
    antioverlap: {
        name: 'cose-bilkent',
        idealEdgeLength: 300,
        nodeRepulsion: 15000,
        gravity: 2.0,
        numIter: 3000,
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 30
    },
    circular: {
        name: 'circle',
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 30
    },
    grid: {
        name: 'grid',
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 30
    }
};

/**
 * Get layout configuration based on node count and current layout type
 */
function getLayoutConfig(nodeCount) {
    if (currentLayout === 'auto') {
        if (nodeCount > 100) return layoutConfigs.antioverlap;
        if (nodeCount > 50) return layoutConfigs.bilkent;
        if (nodeCount > 20) return layoutConfigs.default;
        if (nodeCount > 10) return layoutConfigs.circular;
        return layoutConfigs.grid;
    }
    return layoutConfigs[currentLayout] || layoutConfigs.default;
}

/**
 * Get layout info text for display
 */
function getLayoutInfoText(nodeCount) {
    if (currentLayout === 'auto') {
        if (nodeCount > 100) return 'Auto (Anti-Overlap)';
        if (nodeCount > 50) return 'Auto (Bilkent)';
        if (nodeCount > 20) return 'Auto (COSE)';
        if (nodeCount > 10) return 'Auto (Circular)';
        return 'Auto (Grid)';
    }
    return currentLayout.charAt(0).toUpperCase() + currentLayout.slice(1);
}

/**
 * Initialize the graph visualization
 */
function initializeGraph() {
    console.log('initializeGraph called');

    if (typeof cytoscape === 'undefined') {
        console.error('Cytoscape.js library not loaded');
        return;
    }

    console.log('Cytoscape library loaded successfully');

    // Register cose-bilkent layout if available
    // Try different possible global variable names
    let bilkentRegistered = false;

    if (typeof cytoscapeCoseBilkent !== 'undefined') {
        cytoscape.use(cytoscapeCoseBilkent);
        console.log('cose-bilkent layout registered (cytoscapeCoseBilkent)');
        bilkentRegistered = true;
    } else if (typeof window.cytoscapeCoseBilkent !== 'undefined') {
        cytoscape.use(window.cytoscapeCoseBilkent);
        console.log('cose-bilkent layout registered (window.cytoscapeCoseBilkent)');
        bilkentRegistered = true;
    } else if (typeof coseBilkent !== 'undefined') {
        cytoscape.use(coseBilkent);
        console.log('cose-bilkent layout registered (coseBilkent)');
        bilkentRegistered = true;
    }

    if (!bilkentRegistered) {
        console.warn('cose-bilkent layout not available, will use fallback layouts');
        console.log('Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('cyto') || k.toLowerCase().includes('bilk')));
    }

    const container = document.getElementById('graphCanvas');
    if (!container) {
        console.error('Graph canvas container not found');
        return;
    }

    // Force explicit dimensions since vh/% don't resolve in VSCode webviews
    const graphContainer = document.getElementById('graphContainer');
    const availableHeight = window.innerHeight || document.documentElement.clientHeight || 600;
    graphContainer.style.height = availableHeight + 'px';
    container.style.height = availableHeight + 'px';
    container.style.width = (graphContainer.offsetWidth || 279) + 'px';

    console.log('Graph canvas container found:', container);
    console.log('Container dimensions:', container.offsetWidth, 'x', container.offsetHeight);

    // Define colors based on VS Code theme
    const isDark = document.body.classList.contains('vscode-dark') ||
                   document.body.classList.contains('vscode-high-contrast');

    const colors = {
        node: {
            core: isDark ? '#2563eb' : '#3b82f6',
            handlers: isDark ? '#10b981' : '#22c55e',
            managers: isDark ? '#f59e0b' : '#fbbf24',
            webview: isDark ? '#8b5cf6' : '#a78bfa',
            function: isDark ? '#ec4899' : '#f472b6',
        },
        edge: isDark ? '#6b7280' : '#9ca3af',
        text: isDark ? '#e5e7eb' : '#1f2937',
        background: isDark ? '#1e1e1e' : '#ffffff',
    };

    const nodeCount = sampleGraphData.nodes.length;
    const layoutConfig = getLayoutConfig(nodeCount);

    console.log('Creating cytoscape with', nodeCount, 'nodes');
    console.log('Sample data:', sampleGraphData);
    console.log('Layout config:', layoutConfig);

    cy = cytoscape({
        container: container,
        elements: [...sampleGraphData.nodes, ...sampleGraphData.edges],
        style: [
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'background-color': function(ele) {
                        const group = ele.data('group');
                        return colors.node[group] || colors.node.core;
                    },
                    'color': colors.text,
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '11px',
                    'font-weight': 'bold',
                    'width': function(ele) {
                        return ele.data('type') === 'function' ? 30 : 60;
                    },
                    'height': function(ele) {
                        return ele.data('type') === 'function' ? 30 : 60;
                    },
                    'shape': function(ele) {
                        return ele.data('type') === 'function' ? 'diamond' : 'ellipse';
                    },
                    'text-wrap': 'wrap',
                    'text-max-width': '80px',
                    'font-family': 'var(--vscode-font-family)',
                    'border-width': '2px',
                    'border-color': function(ele) {
                        const group = ele.data('group');
                        const baseColor = colors.node[group] || colors.node.core;
                        return baseColor.replace(/[\d.]+\)$/g, '0.8)'); // Darken border
                    },
                    'opacity': 1,
                    'text-outline-width': 0,
                    'transition-property': 'background-color, border-width, border-color',
                    'transition-duration': '0.2s',
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 3,
                    'line-color': colors.edge,
                    'target-arrow-color': colors.edge,
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'label': 'data(label)',
                    'font-size': '10px',
                    'color': colors.text,
                    'text-rotation': 'autorotate',
                    'text-margin-y': -10,
                    'font-family': 'var(--vscode-font-family)',
                    'opacity': 0.8,
                    'text-outline-width': 0,
                    'transition-property': 'line-color, width',
                    'transition-duration': '0.2s',
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'border-width': 3,
                    'border-color': isDark ? '#ffffff' : '#000000',
                }
            },
            {
                selector: 'node.highlighted',
                style: {
                    'border-width': 3,
                    'border-color': isDark ? '#60a5fa' : '#2563eb',
                    'z-index': 999,
                }
            },
            {
                selector: 'edge.highlighted',
                style: {
                    'width': 4,
                    'line-color': isDark ? '#60a5fa' : '#2563eb',
                    'target-arrow-color': isDark ? '#60a5fa' : '#2563eb',
                    'z-index': 999,
                }
            },
            {
                selector: 'node.dimmed',
                style: {
                    'opacity': 0.3,
                }
            },
            {
                selector: 'edge.dimmed',
                style: {
                    'opacity': 0.2,
                }
            }
        ],
        layout: layoutConfig,
        minZoom: 0.1,
        maxZoom: 2.5,
        wheelSensitivity: 0.15,
    });

    // Add click handler for nodes
    cy.on('tap', 'node', function(evt) {
        const node = evt.target;
        cy.elements().removeClass('highlighted').removeClass('dimmed');
        node.addClass('highlighted');
        const neighbors = node.neighborhood();
        neighbors.addClass('highlighted');
        cy.elements().not(neighbors).not(node).addClass('dimmed');
    });

    // Add double-click handler to reset highlighting
    cy.on('dbltap', function(evt) {
        if (evt.target === cy) {
            cy.elements().removeClass('highlighted').removeClass('dimmed');
        }
    });

    // Update graph info
    updateGraphInfo();

    console.log('Graph visualization initialized with', cy.nodes().length, 'nodes and', cy.edges().length, 'edges');
    console.log('Cytoscape instance:', cy);

    // Force a resize and fit after initialization
    setTimeout(() => {
        cy.resize();
        cy.fit();
        console.log('Graph resized and fitted');
    }, 100);
}

/**
 * Hide the graph and show chat container
 */
function hideGraph() {
    const graphContainer = document.getElementById('graphContainer');
    if (graphContainer && graphContainer.style.display !== 'none') {
        graphContainer.style.display = 'none';
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            chatContainer.style.display = 'flex';
        }
    }
}

/**
 * Switch main content tabs between chat and graph
 */
function switchMainTab(tabName) {
    const chatContainer = document.getElementById('chatContainer');
    const graphContainer = document.getElementById('graphContainer');
    const historyDiv = document.getElementById('conversationHistory');

    if (tabName === 'chat') {
        graphContainer.style.display = 'none';
        if (historyDiv) historyDiv.style.display = 'none';
        chatContainer.style.display = 'flex';
    } else if (tabName === 'graph') {
        console.log('Switching to graph view');
        chatContainer.style.display = 'none';
        if (historyDiv) historyDiv.style.display = 'none';
        graphContainer.style.display = 'block';

        // Initialize graph if not already done
        if (!cy) {
            console.log('Graph not initialized, initializing now...');
            setTimeout(() => initializeGraph(), 100);
        } else {
            console.log('Graph already initialized, resizing...');
            const availableHeight = window.innerHeight || document.documentElement.clientHeight || 600;
            graphContainer.style.height = availableHeight + 'px';
            const canvas = document.getElementById('graphCanvas');
            canvas.style.height = availableHeight + 'px';
            canvas.style.width = graphContainer.offsetWidth + 'px';
            cy.resize();
            cy.fit();
        }
    }
}

/**
 * Change layout algorithm
 */
function changeLayout(layoutType) {
    if (!cy) return;

    currentLayout = layoutType;
    const nodeCount = cy.nodes().length;
    const layoutConfig = getLayoutConfig(nodeCount);

    // Update button states
    document.querySelectorAll('.layout-switcher button').forEach(btn => {
        if (btn.dataset.layout === layoutType) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Run new layout
    const layout = cy.layout(layoutConfig);
    layout.run();

    // Update info panel
    updateGraphInfo();
}

/**
 * Change view type
 */
function changeView(viewType) {
    if (!cy) return;

    currentView = viewType;

    // Update button states
    document.querySelectorAll('.view-switcher button').forEach(btn => {
        if (btn.dataset.view === viewType) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // In a real implementation, this would switch between different graph data
    // For now, just log the change
    console.log('View changed to:', viewType);
}

/**
 * Update graph info panel
 */
function updateGraphInfo() {
    if (!cy) return;

    const nodeCount = cy.nodes().length;
    const edgeCount = cy.edges().length;
    const layoutInfo = getLayoutInfoText(nodeCount);

    const graphInfo = document.querySelector('.graph-info');
    if (graphInfo) {
        graphInfo.innerHTML = `
            <div>${nodeCount} nodes, ${edgeCount} edges</div>
            <div class="layout-info">Layout: ${layoutInfo}</div>
        `;
    }
}

/**
 * Fit graph to screen
 */
function fitGraph() {
    if (!cy) return;
    cy.fit(null, 50); // 50px padding
}

/**
 * Zoom in
 */
function zoomIn() {
    if (!cy) return;
    cy.zoom(cy.zoom() * 1.2);
}

/**
 * Zoom out
 */
function zoomOut() {
    if (!cy) return;
    cy.zoom(cy.zoom() * 0.8);
}

/**
 * Center graph
 */
function centerGraph() {
    if (!cy) return;
    cy.center();
}

// Make functions globally available
window.switchMainTab = switchMainTab;
window.hideGraph = hideGraph;
window.changeLayout = changeLayout;
window.changeView = changeView;
window.fitGraph = fitGraph;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.centerGraph = centerGraph;
