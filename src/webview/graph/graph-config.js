/**
 * Graph configuration: constants, layout configs, theme colors
 */

const GRAPH_BACKEND_URL = 'http://localhost:8000/api';

const layoutConfigs = {
    dagre: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 80,
        edgeSep: 30,
        rankSep: 120,
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 80
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
        padding: 80
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
        padding: 80
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
        padding: 80
    },
    circular: {
        name: 'circle',
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 80
    },
    grid: {
        name: 'grid',
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 80
    }
};

function getLayoutConfig(nodeCount) {
    if (currentLayout === 'auto') {
        return layoutConfigs.dagre;
    }
    return layoutConfigs[currentLayout] || layoutConfigs.dagre;
}

function getLayoutInfoText(nodeCount) {
    if (currentLayout === 'auto') {
        return 'Auto (Dagre TB)';
    }
    return currentLayout.charAt(0).toUpperCase() + currentLayout.slice(1);
}

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
