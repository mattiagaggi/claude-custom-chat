/**
 * Graph styles: Cytoscape style definitions
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
