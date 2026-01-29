/**
 * Graph data: conversion from backend format to Cytoscape, modified file detection
 */

function convertLogicGraphToCytoscape(logicGraph) {
    const nodes = [];
    const edges = [];

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
                subNodes: node.metadata?.subNodes || [],
                subEdges: node.metadata?.subEdges || [],
            }
        });
    }

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

function isNodeModified(node) {
    if (!node.files || modifiedFiles.size === 0) return false;
    return node.files.some(file => {
        return modifiedFiles.has(file) ||
               Array.from(modifiedFiles).some(mf => file.endsWith(mf) || mf.endsWith(file));
    });
}
