/**
 * Graph events: Cytoscape event handlers, highlight logic
 */

function setupEventHandlers() {
    cy.on('tap', 'node', function(evt) {
        const node = evt.target;
        const nodeId = node.id();

        if (node.data('isFileNode')) {
            const filePath = node.data('filePath') || node.data('description');
            if (filePath && typeof vscode !== 'undefined') {
                vscode.postMessage({ type: 'openFile', filePath: filePath });
            }
            return;
        }

        if (node.data('isSubNode')) {
            const parentId = node.data('parentId');
            if (expandedNodes.has(nodeId)) {
                collapseNode(nodeId);
            } else {
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

        if (expandedNodes.has(nodeId)) {
            collapseNode(nodeId);
        } else {
            for (const expandedId of Array.from(expandedNodes)) {
                if (!expandedId.includes('_sub_') && expandedId !== nodeId) {
                    collapseNode(expandedId);
                }
            }
            expandNode(nodeId);
        }
        highlightHierarchy(nodeId);
        showNodeDetails(node.data());
    });

    cy.on('dbltap', function(evt) {
        if (evt.target === cy) {
            cy.elements().removeClass('highlighted').removeClass('dimmed');
            hideNodeDetails();
        }
    });
}

function highlightHierarchy(nodeId) {
    if (!cy) return;

    const node = cy.getElementById(nodeId);
    if (node.length === 0) return;

    cy.elements().removeClass('highlighted').removeClass('dimmed');

    const connected = node.neighborhood().add(node);

    cy.elements().addClass('dimmed');
    connected.removeClass('dimmed').addClass('highlighted');
}
