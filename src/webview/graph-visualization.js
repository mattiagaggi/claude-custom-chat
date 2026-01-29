/**
 * Graph Visualization for Codebase Structure
 * Using Cytoscape.js for interactive graph rendering
 * Integrates with the graph backend API for logic graph generation
 *
 * This is the main orchestrator. Individual concerns are split into:
 *   graph/graph-config.js  - Constants, layout configs, theme colors
 *   graph/graph-api.js     - Backend communication, SSE streaming
 *   graph/graph-data.js    - Data conversion (backend → Cytoscape)
 *   graph/graph-styles.js  - Cytoscape style definitions
 *   graph/graph-nodes.js   - Expand, collapse, position logic
 *   graph/graph-ui.js      - Progress panel, placeholders, error display
 *   graph/graph-events.js  - Event handlers, highlight logic
 */

// Shared mutable state (referenced by all graph-* modules)
let cy = null;
let currentLayout = 'auto';
let currentView = 'logic-graph';
let isGeneratingGraph = false;
let currentGraphData = null;
let modifiedFiles = new Set();
let backendConnected = false;
let expandedNodes = new Set();

/**
 * Register Cytoscape layouts
 */
function registerLayouts() {
    if (typeof cytoscapeCoseBilkent !== 'undefined') {
        cytoscape.use(cytoscapeCoseBilkent);
    } else if (typeof window.cytoscapeCoseBilkent !== 'undefined') {
        cytoscape.use(window.cytoscapeCoseBilkent);
    } else if (typeof coseBilkent !== 'undefined') {
        cytoscape.use(coseBilkent);
    }

    if (typeof cytoscapeDagre !== 'undefined') {
        cytoscape.use(cytoscapeDagre);
    } else if (typeof window.cytoscapeDagre !== 'undefined') {
        cytoscape.use(window.cytoscapeDagre);
    }
}

/**
 * Setup container dimensions
 */
function setupContainerDimensions(container) {
    const graphContainer = document.getElementById('graphContainer');
    const toolbar = document.getElementById('graphTabControls');
    const toolbarHeight = toolbar ? toolbar.offsetHeight : 35;
    const containerTop = graphContainer ? graphContainer.getBoundingClientRect().top : 80;
    const availableHeight = window.innerHeight - containerTop - toolbarHeight;
    const availableWidth = graphContainer ? graphContainer.clientWidth : window.innerWidth;

    container.style.width = Math.max(availableWidth, 200) + 'px';
    container.style.height = Math.max(availableHeight, 200) + 'px';
}

/**
 * Render the graph with the given data
 */
function renderGraph(graphData) {
    const container = document.getElementById('graphCanvas');
    if (container && !cy) {
        container.innerHTML = '';
    }

    if (!cy) {
        initializeGraphWithData(graphData);
    } else {
        cy.elements().remove();
        cy.add([...graphData.nodes, ...graphData.edges]);

        const layoutConfig = getLayoutConfig(graphData.nodes.length);
        const layout = cy.layout(layoutConfig);
        layout.run();

        updateNodeStyles();
        updateGraphInfo();
    }
}

/**
 * Initialize the graph with data
 */
function initializeGraphWithData(graphData) {
    console.log('initializeGraphWithData called');

    if (typeof cytoscape === 'undefined') {
        console.error('Cytoscape.js library not loaded');
        return;
    }

    registerLayouts();

    const container = document.getElementById('graphCanvas');
    if (!container) {
        console.error('Graph canvas container not found');
        return;
    }

    container.innerHTML = '';

    setupContainerDimensions(container);

    const colors = getThemeColors();
    const layoutConfig = getLayoutConfig(graphData.nodes.length);

    console.log('[initializeGraphWithData] container size:', container.offsetWidth, 'x', container.offsetHeight, 'elements:', graphData.nodes.length, 'nodes', graphData.edges.length, 'edges');

    cy = cytoscape({
        container: container,
        elements: [...graphData.nodes, ...graphData.edges],
        style: getCytoscapeStyles(colors),
        layout: layoutConfig,
        minZoom: 0.1,
        maxZoom: 2.5,
        wheelSensitivity: 0.15,
        userPanningEnabled: true,
        panningEnabled: true,
        userZoomingEnabled: true,
        boxSelectionEnabled: false,
    });

    setupEventHandlers();
    updateGraphInfo();

    setTimeout(() => {
        if (cy) {
            cy.resize();
            cy.fit();
        }
    }, 50);
    setTimeout(() => {
        if (cy) {
            cy.resize();
            cy.fit();
        }
    }, 200);
}

/**
 * Initialize the graph visualization (legacy - shows placeholder)
 */
function initializeGraph() {
    console.log('initializeGraph called');

    if (typeof cytoscape === 'undefined') {
        console.error('Cytoscape.js library not loaded');
        return;
    }

    registerLayouts();

    const container = document.getElementById('graphCanvas');
    if (!container) {
        console.error('Graph canvas container not found');
        return;
    }

    setupContainerDimensions(container);

    showGraphPlaceholder();
}

/**
 * Update node styles (e.g., after fetching modified files)
 */
function updateNodeStyles() {
    if (!cy || !currentGraphData) return;

    cy.nodes().forEach(node => {
        const nodeData = node.data();
        const isModified = isNodeModified({ files: nodeData.files });
        node.data('isModified', isModified);
    });

    cy.style().update();
}

/**
 * Hide the graph and show chat container
 */
function hideGraph() {
    window._graphTabActive = false;
    if (typeof renderConversationTabs === 'function') renderConversationTabs();
    const graphContainer = document.getElementById('graphContainer');
    if (graphContainer && graphContainer.style.display !== 'none') {
        graphContainer.style.display = 'none';
        const historyDiv = document.getElementById('conversationHistory');
        const historyVisible = historyDiv && historyDiv.style.display !== 'none' && historyDiv.style.display !== '';
        if (!historyVisible) {
            const chatContainer = document.getElementById('chatContainer');
            if (chatContainer) {
                chatContainer.style.display = 'flex';
            }
        }
    }
}

/**
 * Switch main content tabs between chat and graph
 */
/**
 * Open the graph tab (called from header button)
 */
function openGraphTab() {
    window._graphTabOpen = true;
    switchMainTab('graph');
}

function switchMainTab(tabName) {
    const chatContainer = document.getElementById('chatContainer');
    const graphContainer = document.getElementById('graphContainer');
    const historyDiv = document.getElementById('conversationHistory');
    const statusBar = document.getElementById('status');

    window._graphTabActive = (tabName === 'graph');
    if (tabName === 'graph') {
        window._graphTabOpen = true;
    }
    if (typeof renderConversationTabs === 'function') {
        renderConversationTabs();
    }

    if (tabName === 'chat') {
        graphContainer.style.display = 'none';
        if (historyDiv) historyDiv.style.display = 'none';
        chatContainer.style.display = 'flex';
        if (statusBar) statusBar.style.display = '';
    } else if (tabName === 'graph') {
        console.log('Switching to graph view');
        chatContainer.style.display = 'none';
        if (historyDiv) historyDiv.style.display = 'none';
        if (statusBar) statusBar.style.display = 'none';
        graphContainer.style.display = 'flex';

        if (!cy && !currentGraphData && !isGeneratingGraph) {
            console.log('Graph not initialized, checking backend...');
            setTimeout(async () => {
                if (cy || currentGraphData || isGeneratingGraph) return;
                setupContainerDimensions(document.getElementById('graphCanvas'));
                const connected = await checkBackendConnection();
                if (connected) {
                    showGraphPlaceholder();
                } else {
                    showBackendInstructions();
                }
            }, 100);
        } else if (cy) {
            console.log('Graph already initialized, resizing...');
            setTimeout(() => {
                if (cy) {
                    cy.resize();
                    cy.fit();
                }
            }, 100);
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

    const select = document.getElementById('graphStyleSelect');
    if (select) select.value = layoutType;

    const layout = cy.layout(layoutConfig);
    layout.run();

    updateGraphInfo();
}

/**
 * Change view type
 */
function changeView(viewType) {
    currentView = viewType;

    document.querySelectorAll('.view-switcher button').forEach(btn => {
        if (btn.dataset.view === viewType) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    console.log('View changed to:', viewType);
}

/**
 * Navigation helpers
 */
function fitGraph() {
    if (!cy) return;
    cy.fit(null, 50);
}

function zoomIn() {
    if (!cy) return;
    cy.zoom(cy.zoom() * 1.2);
}

function zoomOut() {
    if (!cy) return;
    cy.zoom(cy.zoom() * 0.8);
}

function centerGraph() {
    if (!cy) return;
    cy.center();
}

/**
 * Save graph state to VS Code webview state for persistence
 */
function saveGraphState() {
    if (typeof vscode !== 'undefined' && currentGraphData) {
        const state = vscode.getState() || {};
        state.graphData = currentGraphData;
        state.expandedNodes = Array.from(expandedNodes);
        state.currentLayout = currentLayout;
        state.currentView = currentView;
        vscode.setState(state);
    }
}

/**
 * Restore graph state from VS Code webview state
 */
function restoreGraphState() {
    if (typeof vscode !== 'undefined') {
        const state = vscode.getState();
        if (state && state.graphData) {
            currentGraphData = state.graphData;
            currentLayout = state.currentLayout || 'auto';
            currentView = state.currentView || 'logic-graph';
            console.log('Restored cached graph state');
            return true;
        }
    }
    return false;
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
window.generateGraph = generateGraph;
window.refreshModifiedFiles = refreshModifiedFiles;
window.checkBackendConnection = checkBackendConnection;
window.checkBackendAndRetry = checkBackendAndRetry;
window.showBackendInstructions = showBackendInstructions;
window.restoreGraphState = restoreGraphState;

// Resize graph on window resize
window.addEventListener('resize', () => {
    if (cy) {
        const canvas = document.getElementById('graphCanvas');
        if (canvas) {
            setupContainerDimensions(canvas);
        }
        cy.resize();
    }
});

// Check backend connection on load
setTimeout(checkBackendConnection, 1000);

// Restore cached graph on load if webview was previously disposed
setTimeout(() => {
    if (!cy && !currentGraphData && !isGeneratingGraph) {
        if (restoreGraphState() && currentGraphData) {
            console.log('Restoring graph from cache...');
            const cytoscapeData = convertLogicGraphToCytoscape(currentGraphData);
            renderGraph(cytoscapeData);
        }
    }
}, 500);
