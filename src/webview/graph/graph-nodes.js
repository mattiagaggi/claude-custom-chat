/**
 * Graph nodes: expand, collapse, and position logic
 */

function expandNode(nodeId) {
    if (!cy || expandedNodes.has(nodeId)) return;

    const node = cy.getElementById(nodeId);
    if (node.length === 0) return;

    const nodeData = node.data();
    const subElements = [];

    if (nodeData.subNodes && nodeData.subNodes.length > 0) {
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
        return;
    }

    cy.add(subElements);
    expandedNodes.add(nodeId);

    positionChildNodesBelow(nodeId);
}

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

    positionFileNodesBelow(subNodeId);
}

function positionChildNodesBelow(parentId) {
    const parentNode = cy.getElementById(parentId);
    if (parentNode.length === 0) return;

    const parentPos = parentNode.position();
    const parentHeight = parentNode.outerHeight() || 80;

    const subNodes = cy.elements(`[id^="${parentId}_sub_"]`).nodes();
    const fileNodes = cy.elements(`[id^="${parentId}_file_"]`).nodes();
    const allChildren = subNodes.add(fileNodes);

    if (allChildren.length === 0) return;

    cy.nodes().forEach(n => {
        if (!n.id().startsWith(`${parentId}_sub_`) && !n.id().startsWith(`${parentId}_file_`)) {
            n.lock();
        }
    });

    const existingNodes = cy.nodes().filter(n =>
        !n.id().startsWith(`${parentId}_sub_`) && !n.id().startsWith(`${parentId}_file_`)
    );

    const subNodeWidth = 120;
    const subNodeHeight = 60;
    const verticalSpacing = 150;
    const horizontalSpacing = 80;

    const totalWidth = allChildren.length * subNodeWidth + (allChildren.length - 1) * horizontalSpacing;
    const startX = parentPos.x - totalWidth / 2;
    const baseY = parentPos.y + parentHeight / 2 + verticalSpacing;

    allChildren.forEach((child, index) => {
        let x = startX + index * (subNodeWidth + horizontalSpacing);
        let y = baseY;

        const maxOffset = Math.min(totalWidth / 2, 300);
        if (Math.abs(x - parentPos.x) > maxOffset) {
            x = parentPos.x + Math.sign(x - parentPos.x) * maxOffset;
        }

        for (let attempt = 0; attempt < 10; attempt++) {
            let collision = false;
            existingNodes.forEach(existing => {
                const ePos = existing.position();
                const eW = existing.outerWidth() || 80;
                const eH = existing.outerHeight() || 80;
                if (Math.abs(x - ePos.x) < (subNodeWidth + eW) / 2 + 50 &&
                    Math.abs(y - ePos.y) < (subNodeHeight + eH) / 2 + 50) {
                    collision = true;
                }
            });
            if (!collision) break;
            y += 100;
        }

        child.position({ x, y });
        child.lock();
    });

    cy.nodes().forEach(n => {
        if (!n.id().includes('_sub_') && !n.id().includes('_file_')) {
            n.unlock();
        }
    });
}

function positionFileNodesBelow(subNodeId) {
    const parentNode = cy.getElementById(subNodeId);
    if (parentNode.length === 0) return;

    const parentPos = parentNode.position();
    const parentHeight = parentNode.outerHeight() || 60;

    const fileNodes = cy.elements(`[id^="${subNodeId}_file_"]`).nodes();
    if (fileNodes.length === 0) return;

    const existingNodes = cy.nodes().filter(n => !n.id().startsWith(`${subNodeId}_file_`));

    const verticalSpacing = 60;

    fileNodes.forEach((fileNode, index) => {
        let x = parentPos.x;
        let y = parentPos.y + parentHeight / 2 + (index + 1) * verticalSpacing;

        for (let attempt = 0; attempt < 10; attempt++) {
            let collision = false;
            existingNodes.forEach(existing => {
                const ePos = existing.position();
                const eW = existing.outerWidth() || 80;
                const eH = existing.outerHeight() || 40;
                if (Math.abs(x - ePos.x) < (100 + eW) / 2 + 20 &&
                    Math.abs(y - ePos.y) < (40 + eH) / 2 + 20) {
                    collision = true;
                }
            });
            if (!collision) break;
            y += 50;
        }

        fileNode.position({ x, y });
        fileNode.lock();
    });
}

function collapseNode(nodeId) {
    if (!cy || !expandedNodes.has(nodeId)) return;

    const toRemove = cy.elements(`[id^="${nodeId}_sub_"], [id^="${nodeId}_file_"], [id^="${nodeId}_to_"]`);
    const subEdges = cy.elements(`[id*="${nodeId}_sub_"]`);

    cy.remove(toRemove);
    cy.remove(subEdges);

    expandedNodes.delete(nodeId);
    for (const id of expandedNodes) {
        if (id.startsWith(`${nodeId}_sub_`)) {
            expandedNodes.delete(id);
        }
    }
}
