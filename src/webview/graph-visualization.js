/**
 * Graph Visualization for Codebase Structure
 * Using Cytoscape.js for interactive graph rendering
 * Integrates with the graph backend API for logic graph generation
 */

let cy = null;
let currentLayout = 'auto';
let currentView = 'logic-graph';
let isGeneratingGraph = false;
let currentGraphData = null;
let modifiedFiles = new Set();
let backendConnected = false;
let expandedNodes = new Set();

// Graph backend API configuration
const GRAPH_BACKEND_URL = 'http://localhost:8000/api';

// Layout configurations
const layoutConfigs = {
    dagre: {
        name: 'dagre',
        rankDir: 'TB',  // Top to Bottom
        nodeSep: 80,
        edgeSep: 30,
        rankSep: 120,
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 50
    },
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
        // Default to dagre (top-to-bottom hierarchical) for directed graphs
        return layoutConfigs.dagre;
    }
    return layoutConfigs[currentLayout] || layoutConfigs.dagre;
}

/**
 * Get layout info text for display
 */
function getLayoutInfoText(nodeCount) {
    if (currentLayout === 'auto') {
        return 'Auto (Dagre TB)';
    }
    return currentLayout.charAt(0).toUpperCase() + currentLayout.slice(1);
}

/**
 * Convert logic graph data from backend to Cytoscape format
 */
function convertLogicGraphToCytoscape(logicGraph) {
    const nodes = [];
    const edges = [];

    // Color mapping for different node levels
    const levelColors = {
        0: '#2563eb',  // Main nodes - blue
        1: '#10b981',  // Sub-nodes level 1 - green
        2: '#f59e0b',  // Sub-nodes level 2 - amber
        3: '#8b5cf6',  // Sub-nodes level 3 - purple
    };

    // Process nodes - only add main (level 0) nodes initially
    // Sub-nodes are stored on the parent and expanded on click
    for (const node of logicGraph.nodes) {
        const isModified = isNodeModified(node);
        const level = node.metadata?.level || 0;

        nodes.push({
            data: {
                id: node.id,
                label: node.label,
                description: node.description,
                type: 'logic',
                level: level,
                files: node.files,
                isModified: isModified,
                group: level === 0 ? 'main' : `sub-${level}`,
                // Store sub-nodes and sub-edges on the parent for on-demand expansion
                subNodes: node.metadata?.subNodes || [],
                subEdges: node.metadata?.subEdges || [],
            }
        });
    }

    // Process main edges
    for (const edge of logicGraph.edges) {
        edges.push({
            data: {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                label: edge.label,
                description: edge.description,
            }
        });
    }

    return { nodes, edges };
}

/**
 * Check if a node has modified files
 */
function isNodeModified(node) {
    if (!node.files || modifiedFiles.size === 0) return false;
    return node.files.some(file => {
        // Check both relative and absolute paths
        return modifiedFiles.has(file) ||
               Array.from(modifiedFiles).some(mf => file.endsWith(mf) || mf.endsWith(file));
    });
}

/**
 * Check if backend is connected
 */
async function checkBackendConnection() {
    try {
        const response = await fetch(`${GRAPH_BACKEND_URL}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000),
        });
        backendConnected = response.ok;
    } catch (error) {
        backendConnected = false;
    }
    updateBackendStatus();
    return backendConnected;
}

/**
 * Update backend status indicator
 */
function updateBackendStatus() {
    const statusEl = document.getElementById('backendStatus');
    if (statusEl) {
        if (backendConnected) {
            statusEl.innerHTML = '<span style="color: #10b981;">● Connected</span>';
            statusEl.title = 'Backend is running at localhost:8000';
        } else {
            statusEl.innerHTML = '<span style="color: #ef4444;">● Disconnected</span>';
            statusEl.title = 'Backend not running. Click to see instructions.';
        }
    }
}

/**
 * Show backend instructions
 */
function showBackendInstructions() {
    const container = document.getElementById('graphCanvas');
    if (container) {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground); padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">🔌</div>
                <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Backend Not Running</div>
                <div style="font-size: 13px; text-align: left; max-width: 400px; margin-bottom: 16px; background: var(--vscode-textBlockQuote-background); padding: 16px; border-radius: 8px; font-family: monospace;">
                    <div style="margin-bottom: 8px;">Start the backend server:</div>
                    <code style="display: block; margin-bottom: 4px;">cd /path/to/vscode_graph_backend</code>
                    <code style="display: block;">python run.py</code>
                </div>
                <button onclick="checkBackendAndRetry()" style="padding: 8px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer;">
                    Retry Connection
                </button>
            </div>
        `;
    }
}

/**
 * Check backend and retry if connected
 */
async function checkBackendAndRetry() {
    const connected = await checkBackendConnection();
    if (connected) {
        showGraphPlaceholder();
    } else {
        showBackendInstructions();
    }
}

/**
 * Generate the logic graph using streaming API with progress logs
 */
async function generateGraph() {
    if (isGeneratingGraph) {
        console.log('Graph generation already in progress');
        return;
    }

    // Check backend connection first
    const connected = await checkBackendConnection();
    if (!connected) {
        showBackendInstructions();
        return;
    }

    isGeneratingGraph = true;
    updateGenerateButtonState(true);

    try {
        // Get workspace path from VS Code
        const workspacePath = await getWorkspacePath();
        if (!workspacePath) {
            showGraphError('No workspace folder open');
            return;
        }

        console.log('Generating graph for workspace:', workspacePath);

        // Show progress panel (keep old graph visible if exists)
        showProgressPanel('Starting graph generation...');

        // Use streaming endpoint for progress updates
        const response = await fetch(`${GRAPH_BACKEND_URL}/regenerate-graph-stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                workspacePath: workspacePath,
                fileExtensions: ['py', 'js', 'jsx', 'ts', 'tsx', 'rs', 'go'],
                excludePatterns: ['__pycache__', 'node_modules', '.git', 'venv', '.venv', 'env', '.env']
            }),
        });

        if (!response.ok) {
            throw new Error(`Backend error: ${response.status} ${response.statusText}`);
        }

        // Process SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let result = null;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const event = JSON.parse(line.slice(6));
                        if (event.type === 'progress') {
                            updateProgressLog(event.step, event.message, event.data);
                        } else if (event.type === 'complete') {
                            result = event;
                        } else if (event.type === 'error') {
                            throw new Error(event.message);
                        }
                    } catch (e) {
                        if (e.message !== 'Unexpected end of JSON input') {
                            console.warn('Failed to parse SSE event:', e);
                        }
                    }
                }
            }
        }

        if (!result || !result.success) {
            throw new Error(result?.message || 'Unknown error generating graph');
        }

        // Store the graph data
        currentGraphData = result.graph;

        // Fetch modified files to highlight them
        await fetchModifiedFiles(workspacePath);

        // Convert and render the graph
        const cytoscapeData = convertLogicGraphToCytoscape(result.graph);
        renderGraph(cytoscapeData);

        // Show stats in log
        if (result.stats) {
            console.log('Graph generation stats:', result.stats);
            updateProgressLog('complete', `Done! ${result.stats.logic_nodes} nodes, ${result.stats.logic_edges} edges`, result.stats);
        }

        // Hide progress panel after short delay to show completion
        setTimeout(hideProgressPanel, 1500);

    } catch (error) {
        console.error('Error generating graph:', error);
        // If we have existing graph, show error in progress panel
        if (currentGraphData && cy) {
            updateProgressLog('error', `Error: ${error.message}`);
            setTimeout(hideProgressPanel, 3000);
        } else {
            showGraphError(`Failed to generate graph: ${error.message}`);
        }
    } finally {
        isGeneratingGraph = false;
        updateGenerateButtonState(false);
    }
}

/**
 * Fetch modified files from the backend
 */
async function fetchModifiedFiles(workspacePath) {
    try {
        const response = await fetch(`${GRAPH_BACKEND_URL}/modified-files`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                workspacePath: workspacePath,
            }),
        });

        if (!response.ok) {
            console.warn('Failed to fetch modified files');
            return;
        }

        const result = await response.json();
        if (result.success && result.modifiedFiles) {
            modifiedFiles = new Set(result.modifiedFiles.map(f => f.path));
            console.log('Modified files:', modifiedFiles);
        }
    } catch (error) {
        console.warn('Error fetching modified files:', error);
    }
}

/**
 * Get workspace path from VS Code extension
 */
async function getWorkspacePath() {
    return new Promise((resolve) => {
        // Request workspace path from extension
        if (typeof vscode !== 'undefined') {
            vscode.postMessage({ type: 'getWorkspacePath' });

            // Listen for response
            const handler = (event) => {
                if (event.data.type === 'workspacePath') {
                    window.removeEventListener('message', handler);
                    resolve(event.data.path);
                }
            };
            window.addEventListener('message', handler);

            // Timeout after 5 seconds
            setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve(null);
            }, 5000);
        } else {
            // Fallback for testing
            resolve('/Users/Mattia/Code/vscode_graph_backend');
        }
    });
}

/**
 * Render the graph with the given data
 */
function renderGraph(graphData) {
    // Always clear placeholder content before rendering
    const container = document.getElementById('graphCanvas');
    if (container && !cy) {
        container.innerHTML = '';
    }

    if (!cy) {
        initializeGraphWithData(graphData);
    } else {
        // Update existing graph
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

    // Register layouts
    registerLayouts();

    const container = document.getElementById('graphCanvas');
    if (!container) {
        console.error('Graph canvas container not found');
        return;
    }

    // Clear any placeholder content so Cytoscape can use the container
    container.innerHTML = '';

    setupContainerDimensions(container);

    const colors = getThemeColors();
    const layoutConfig = getLayoutConfig(graphData.nodes.length);

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
        cy.resize();
        cy.fit();
    }, 100);
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

    // Show placeholder message instead of sample data
    showGraphPlaceholder();
}

/**
 * Register Cytoscape layouts
 */
function registerLayouts() {
    // Register cose-bilkent layout
    if (typeof cytoscapeCoseBilkent !== 'undefined') {
        cytoscape.use(cytoscapeCoseBilkent);
    } else if (typeof window.cytoscapeCoseBilkent !== 'undefined') {
        cytoscape.use(window.cytoscapeCoseBilkent);
    } else if (typeof coseBilkent !== 'undefined') {
        cytoscape.use(coseBilkent);
    }

    // Register dagre layout
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
    const availableHeight = window.innerHeight || document.documentElement.clientHeight || 600;
    graphContainer.style.height = availableHeight + 'px';
    container.style.height = availableHeight + 'px';
    container.style.width = (graphContainer.offsetWidth || 279) + 'px';
}

/**
 * Get theme colors based on VS Code theme
 */
function getThemeColors() {
    const isDark = document.body.classList.contains('vscode-dark') ||
                   document.body.classList.contains('vscode-high-contrast');

    return {
        node: {
            main: isDark ? '#2563eb' : '#3b82f6',
            'sub-1': isDark ? '#10b981' : '#22c55e',
            'sub-2': isDark ? '#f59e0b' : '#fbbf24',
            'sub-3': isDark ? '#8b5cf6' : '#a78bfa',
            modified: isDark ? '#ef4444' : '#dc2626',
        },
        edge: isDark ? '#6b7280' : '#9ca3af',
        text: isDark ? '#e5e7eb' : '#1f2937',
        background: isDark ? '#1e1e1e' : '#ffffff',
    };
}

/**
 * Get Cytoscape styles
 */
function getCytoscapeStyles(colors) {
    return [
        {
            selector: 'node',
            style: {
                'label': 'data(label)',
                'background-color': function(ele) {
                    if (ele.data('isModified')) {
                        return colors.node.modified;
                    }
                    const group = ele.data('group');
                    return colors.node[group] || colors.node.main;
                },
                'color': colors.text,
                'text-valign': 'center',
                'text-halign': 'center',
                'font-size': '11px',
                'font-weight': 'bold',
                'width': function(ele) {
                    const level = ele.data('level') || 0;
                    return level === 0 ? 80 : 60;
                },
                'height': function(ele) {
                    const level = ele.data('level') || 0;
                    return level === 0 ? 80 : 60;
                },
                'shape': 'ellipse',
                'text-wrap': 'wrap',
                'text-max-width': '100px',
                'font-family': 'var(--vscode-font-family)',
                'border-width': function(ele) {
                    return ele.data('isModified') ? '4px' : '2px';
                },
                'border-color': function(ele) {
                    if (ele.data('isModified')) {
                        return colors.node.modified;
                    }
                    const group = ele.data('group');
                    return colors.node[group] || colors.node.main;
                },
                'opacity': 1,
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
                'transition-property': 'line-color, width',
                'transition-duration': '0.2s',
            }
        },
        {
            selector: 'node[?isSubNode]',
            style: {
                'width': 60,
                'height': 60,
                'font-size': '10px',
                'shape': 'round-rectangle',
            }
        },
        {
            selector: 'node[?isFileNode]',
            style: {
                'width': 50,
                'height': 50,
                'font-size': '9px',
                'shape': 'rectangle',
                'background-color': function(ele) {
                    return colors.node['sub-2'] || '#f59e0b';
                },
                'border-color': function(ele) {
                    return colors.node['sub-2'] || '#f59e0b';
                },
                'cursor': 'pointer',
            }
        },
        {
            selector: 'node:selected',
            style: {
                'border-width': 4,
                'border-color': colors.text,
            }
        },
        {
            selector: 'node.highlighted',
            style: {
                'border-width': 4,
                'border-color': '#60a5fa',
                'z-index': 999,
            }
        },
        {
            selector: 'edge.highlighted',
            style: {
                'width': 4,
                'line-color': '#60a5fa',
                'target-arrow-color': '#60a5fa',
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
    ];
}

/**
 * Expand a main node to show its sub-nodes
 */
function expandNode(nodeId) {
    if (!cy || expandedNodes.has(nodeId)) return;

    const node = cy.getElementById(nodeId);
    if (node.length === 0) return;

    const nodeData = node.data();
    const subElements = [];

    if (nodeData.subNodes && nodeData.subNodes.length > 0) {
        // Create sub-node elements
        nodeData.subNodes.forEach((subNode, index) => {
            const subNodeId = `${nodeId}_sub_${index}`;
            const isFileNode = subNode.metadata?.isFileNode === true;
            subElements.push({
                data: {
                    id: subNodeId,
                    label: subNode.label,
                    level: subNode.metadata?.level || 1,
                    isSubNode: true,
                    isFileNode: isFileNode,
                    parentId: nodeId,
                    description: subNode.description,
                    files: subNode.files || [],
                    filePath: isFileNode ? (subNode.files?.[0] || '') : '',
                    group: isFileNode ? 'file' : 'sub-1',
                    originalId: subNode.id,
                }
            });
            // Edge from parent to sub-node
            subElements.push({
                data: {
                    id: `${nodeId}_to_${subNodeId}`,
                    source: nodeId,
                    target: subNodeId,
                    label: 'contains',
                    isSubEdge: true,
                }
            });
        });

        // Map and add sub-edges between sub-nodes
        if (nodeData.subEdges && nodeData.subEdges.length > 0) {
            const idMap = {};
            nodeData.subNodes.forEach((sn, i) => {
                idMap[sn.id] = `${nodeId}_sub_${i}`;
            });
            nodeData.subEdges.forEach((subEdge) => {
                const mappedSource = idMap[subEdge.source] || subEdge.source;
                const mappedTarget = idMap[subEdge.target] || subEdge.target;
                subElements.push({
                    data: {
                        id: `${nodeId}_${subEdge.id}`,
                        source: mappedSource,
                        target: mappedTarget,
                        label: subEdge.label,
                        description: subEdge.description,
                        isSubEdge: true,
                    }
                });
            });
        }
    } else if (nodeData.files && nodeData.files.length > 0) {
        // No sub-nodes, show files directly
        nodeData.files.forEach((file, index) => {
            const fileName = file.split('/').pop() || file;
            const fileNodeId = `${nodeId}_file_${index}`;
            subElements.push({
                data: {
                    id: fileNodeId,
                    label: fileName,
                    level: 1,
                    isFileNode: true,
                    isSubNode: true,
                    parentId: nodeId,
                    filePath: file,
                    description: file,
                    group: 'file',
                }
            });
            subElements.push({
                data: {
                    id: `${nodeId}_to_${fileNodeId}`,
                    source: nodeId,
                    target: fileNodeId,
                    label: 'contains',
                    isSubEdge: true,
                }
            });
        });
    } else {
        return; // Nothing to expand
    }

    cy.add(subElements);
    expandedNodes.add(nodeId);

    cy.layout({
        name: 'cose-bilkent',
        animate: true,
        animationDuration: 600,
        fit: false,
        padding: 50,
        randomize: false,
        idealEdgeLength: 250,
        nodeRepulsion: 18000,
        gravity: 2.0,
        numIter: 1000,
    }).run();
}

/**
 * Expand a sub-node to show individual file nodes
 */
function expandSubNodeToFiles(subNodeId) {
    if (!cy || expandedNodes.has(subNodeId)) return;

    const node = cy.getElementById(subNodeId);
    if (node.length === 0) return;

    const files = node.data('files') || [];
    if (files.length === 0) return;

    const elements = [];
    files.forEach((file, index) => {
        const fileName = file.split('/').pop() || file;
        const fileNodeId = `${subNodeId}_file_${index}`;
        elements.push({
            data: {
                id: fileNodeId,
                label: fileName,
                level: 2,
                isFileNode: true,
                isSubNode: true,
                parentId: subNodeId,
                filePath: file,
                description: file,
                group: 'file',
            }
        });
        elements.push({
            data: {
                id: `${subNodeId}_to_${fileNodeId}`,
                source: subNodeId,
                target: fileNodeId,
                label: 'contains',
                isSubEdge: true,
            }
        });
    });

    cy.add(elements);
    expandedNodes.add(subNodeId);

    cy.layout({
        name: 'cose-bilkent',
        animate: true,
        animationDuration: 600,
        fit: false,
        randomize: false,
        idealEdgeLength: 200,
        nodeRepulsion: 15000,
        gravity: 2.0,
        numIter: 800,
    }).run();
}

/**
 * Collapse a node, removing all its child elements
 */
function collapseNode(nodeId) {
    if (!cy || !expandedNodes.has(nodeId)) return;

    // Remove sub-nodes, file nodes, and their edges
    const toRemove = cy.elements(`[id^="${nodeId}_sub_"], [id^="${nodeId}_file_"], [id^="${nodeId}_to_"]`);
    // Also remove edges referencing sub-node IDs
    const subEdges = cy.elements(`[id*="${nodeId}_sub_"]`);

    cy.remove(toRemove);
    cy.remove(subEdges);

    // Remove from expanded set (including any expanded sub-nodes)
    expandedNodes.delete(nodeId);
    for (const id of expandedNodes) {
        if (id.startsWith(`${nodeId}_sub_`)) {
            expandedNodes.delete(id);
        }
    }

    cy.layout({
        name: 'cose-bilkent',
        animate: true,
        animationDuration: 400,
        fit: false,
    }).run();
}

/**
 * Setup event handlers for the graph
 */
function setupEventHandlers() {
    // Click handler for nodes - expand/collapse on tap
    cy.on('tap', 'node', function(evt) {
        const node = evt.target;
        const nodeId = node.id();

        // File node: open the file in VS Code
        if (node.data('isFileNode')) {
            const filePath = node.data('filePath') || node.data('description');
            if (filePath && typeof vscode !== 'undefined') {
                vscode.postMessage({ type: 'openFile', filePath: filePath });
            }
            return;
        }

        // Sub-node: expand to show files, or collapse
        // Collapse sibling sub-nodes first (exclusive expansion)
        if (node.data('isSubNode')) {
            const parentId = node.data('parentId');
            if (expandedNodes.has(nodeId)) {
                collapseNode(nodeId);
            } else {
                // Collapse any expanded sibling sub-nodes
                if (parentId) {
                    for (const expandedId of Array.from(expandedNodes)) {
                        if (expandedId.startsWith(`${parentId}_sub_`) && expandedId !== nodeId) {
                            collapseNode(expandedId);
                        }
                    }
                }
                expandSubNodeToFiles(nodeId);
            }
            highlightHierarchy(nodeId);
            showNodeDetails(node.data());
            return;
        }

        // Main node: expand to show sub-nodes, or collapse
        // Collapse other expanded main nodes first (exclusive expansion)
        if (expandedNodes.has(nodeId)) {
            collapseNode(nodeId);
        } else {
            // Collapse any other expanded main nodes
            for (const expandedId of Array.from(expandedNodes)) {
                // Only collapse top-level expanded nodes (no underscore = main node)
                if (!expandedId.includes('_sub_') && expandedId !== nodeId) {
                    collapseNode(expandedId);
                }
            }
            expandNode(nodeId);
        }
        highlightHierarchy(nodeId);
        showNodeDetails(node.data());
    });

    // Double-click to reset highlights
    cy.on('dbltap', function(evt) {
        if (evt.target === cy) {
            cy.elements().removeClass('highlighted').removeClass('dimmed');
            hideNodeDetails();
        }
    });
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

    // Force style recalculation
    cy.style().update();
}

/**
 * Show graph placeholder
 */
function showGraphPlaceholder() {
    const container = document.getElementById('graphCanvas');
    if (container) {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground);">
                <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
                <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">No Graph Generated</div>
                <div style="font-size: 13px; text-align: center; max-width: 300px; margin-bottom: 16px;">
                    Click the "Generate Graph" button to analyze your codebase and create a logic graph visualization.
                </div>
            </div>
        `;
    }
}

/**
 * Show progress panel (overlay on top of existing graph)
 */
function showProgressPanel(initialMessage) {
    // Remove existing progress panel if any
    hideProgressPanel();

    const graphContainer = document.getElementById('graphContainer');
    if (!graphContainer) return;

    const progressPanel = document.createElement('div');
    progressPanel.id = 'progressPanel';
    progressPanel.style.cssText = `
        position: absolute;
        bottom: 60px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
        padding: 12px 16px;
        min-width: 300px;
        max-width: 500px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 1001;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-size: 12px;
    `;

    progressPanel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div class="progress-spinner" style="width: 14px; height: 14px; border: 2px solid var(--vscode-button-background); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <span style="font-weight: 600;">Generating Graph</span>
        </div>
        <div id="progressLogs" style="font-family: monospace; font-size: 11px; color: var(--vscode-descriptionForeground);">
            <div class="progress-log-entry">${initialMessage}</div>
        </div>
        <style>
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            .progress-log-entry {
                padding: 2px 0;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            .progress-log-entry:last-child {
                border-bottom: none;
            }
            .progress-log-entry.error {
                color: var(--vscode-errorForeground);
            }
            .progress-log-entry.complete {
                color: var(--vscode-testing-iconPassed);
            }
        </style>
    `;

    graphContainer.appendChild(progressPanel);
}

/**
 * Update progress log with new message
 */
function updateProgressLog(step, message, data) {
    const progressLogs = document.getElementById('progressLogs');
    if (!progressLogs) return;

    // Create log entry
    const entry = document.createElement('div');
    entry.className = 'progress-log-entry';
    if (step === 'error') entry.classList.add('error');
    if (step === 'complete') entry.classList.add('complete');

    // Format message based on step
    let icon = '→';
    if (step === 'complete') icon = '✓';
    if (step === 'error') icon = '✗';
    if (step === 'summarizing' && data?.current) {
        icon = `[${data.current}/${data.total}]`;
    }

    entry.textContent = `${icon} ${message}`;
    progressLogs.appendChild(entry);

    // Auto-scroll to bottom
    const panel = document.getElementById('progressPanel');
    if (panel) {
        panel.scrollTop = panel.scrollHeight;
    }

    // Update spinner visibility on complete/error
    if (step === 'complete' || step === 'error') {
        const spinner = document.querySelector('.progress-spinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
    }
}

/**
 * Hide progress panel
 */
function hideProgressPanel() {
    const panel = document.getElementById('progressPanel');
    if (panel) {
        panel.remove();
    }
}

/**
 * Show graph loading state (only used when no existing graph)
 */
function showGraphLoading(message) {
    // If we have an existing graph, use the progress panel instead
    if (currentGraphData && cy) {
        showProgressPanel(message);
        return;
    }

    const container = document.getElementById('graphCanvas');
    if (container) {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground);">
                <div class="loading-spinner" style="width: 40px; height: 40px; border: 3px solid var(--vscode-button-background); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px;"></div>
                <div style="font-size: 14px;">${message || 'Loading...'}</div>
            </div>
            <style>
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
    }
}

/**
 * Hide graph loading state
 */
function hideGraphLoading() {
    // The graph will be rendered, replacing the loading content
}

/**
 * Show graph error
 */
function showGraphError(message) {
    const container = document.getElementById('graphCanvas');
    if (container) {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--vscode-errorForeground);">
                <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Error</div>
                <div style="font-size: 13px; text-align: center; max-width: 400px;">${message}</div>
                <button onclick="generateGraph()" style="margin-top: 16px; padding: 8px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer;">
                    Try Again
                </button>
            </div>
        `;
    }
}

/**
 * Update generate button state
 */
function updateGenerateButtonState(isLoading) {
    const btn = document.getElementById('generateGraphBtn');
    if (btn) {
        btn.disabled = isLoading;
        btn.textContent = isLoading ? 'Generating...' : 'Generate Graph';
    }
}

/**
 * Show node details panel
 */
function showNodeDetails(nodeData) {
    const infoPanel = document.querySelector('.graph-info');
    if (infoPanel && nodeData) {
        const filesHtml = nodeData.files && nodeData.files.length > 0
            ? `<div style="margin-top: 8px; font-size: 11px;">
                <strong>Files:</strong>
                <ul style="margin: 4px 0; padding-left: 16px;">
                    ${nodeData.files.slice(0, 5).map(f => `<li>${f.split('/').pop()}</li>`).join('')}
                    ${nodeData.files.length > 5 ? `<li>... and ${nodeData.files.length - 5} more</li>` : ''}
                </ul>
               </div>`
            : '';

        infoPanel.innerHTML = `
            <div><strong>${nodeData.label}</strong></div>
            <div style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px;">
                ${nodeData.description || ''}
            </div>
            ${nodeData.isModified ? '<div style="color: var(--vscode-errorForeground); font-size: 11px; margin-top: 4px;">⚠️ Contains modified files</div>' : ''}
            ${filesHtml}
        `;
    }
}

/**
 * Hide node details panel
 */
function hideNodeDetails() {
    updateGraphInfo();
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

    const statusBar = document.getElementById('status');

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
        graphContainer.style.display = 'block';

        // Initialize graph if not already done
        if (!cy && !currentGraphData && !isGeneratingGraph) {
            console.log('Graph not initialized, checking backend...');
            setTimeout(async () => {
                // Don't show placeholder if generation started in the meantime
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
    currentView = viewType;

    // Update button states
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
 * Update graph info panel
 */
function updateGraphInfo() {
    const graphInfo = document.querySelector('.graph-info');
    if (graphInfo) {
        if (cy) {
            const nodeCount = cy.nodes().length;
            const edgeCount = cy.edges().length;
            const layoutInfo = getLayoutInfoText(nodeCount);
            const modifiedCount = cy.nodes().filter(n => n.data('isModified')).length;

            graphInfo.innerHTML = `
                <div>${nodeCount} nodes, ${edgeCount} edges</div>
                ${modifiedCount > 0 ? `<div style="color: var(--vscode-errorForeground);">${modifiedCount} modified</div>` : ''}
                <div class="layout-info">Layout: ${layoutInfo}</div>
            `;
        } else {
            graphInfo.innerHTML = `
                <div>0 nodes, 0 edges</div>
                <div class="layout-info">Layout: Auto</div>
            `;
        }
    }
}

/**
 * Fit graph to screen
 */
function fitGraph() {
    if (!cy) return;
    cy.fit(null, 50);
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

/**
 * Refresh modified files and update graph highlighting
 */
async function refreshModifiedFiles() {
    const workspacePath = await getWorkspacePath();
    if (workspacePath) {
        await fetchModifiedFiles(workspacePath);
        updateNodeStyles();
    }
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

// Check backend connection on load
setTimeout(checkBackendConnection, 1000);
