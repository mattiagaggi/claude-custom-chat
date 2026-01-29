/**
 * Graph API: backend communication, workspace path, modified files
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

async function getWorkspacePath() {
    return new Promise((resolve) => {
        if (typeof vscode !== 'undefined') {
            vscode.postMessage({ type: 'getWorkspacePath' });

            const handler = (event) => {
                if (event.data.type === 'workspacePath') {
                    window.removeEventListener('message', handler);
                    resolve(event.data.path);
                }
            };
            window.addEventListener('message', handler);

            setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve(null);
            }, 5000);
        } else {
            resolve('/Users/Mattia/Code/vscode_graph_backend');
        }
    });
}

async function generateGraph() {
    if (isGeneratingGraph) {
        console.log('Graph generation already in progress');
        return;
    }

    const connected = await checkBackendConnection();
    if (!connected) {
        showBackendInstructions();
        return;
    }

    isGeneratingGraph = true;
    updateGenerateButtonState(true);

    try {
        const workspacePath = await getWorkspacePath();
        if (!workspacePath) {
            showGraphError('No workspace folder open');
            return;
        }

        console.log('Generating graph for workspace:', workspacePath);

        showProgressPanel('Starting graph generation...');

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

        currentGraphData = result.graph;

        await fetchModifiedFiles(workspacePath);

        const cytoscapeData = convertLogicGraphToCytoscape(result.graph);
        renderGraph(cytoscapeData);

        saveGraphState();

        if (result.stats) {
            console.log('Graph generation stats:', result.stats);
            let completeMsg = `Done! ${result.stats.logic_nodes} nodes, ${result.stats.logic_edges} edges`;
            if (result.stats.files_from_cache > 0 || result.stats.sub_nodes_from_cache > 0) {
                const parts = [];
                if (result.stats.files_from_cache > 0) parts.push(`${result.stats.files_from_cache} files`);
                if (result.stats.sub_nodes_from_cache > 0) parts.push(`${result.stats.sub_nodes_from_cache} groups`);
                completeMsg += ` (${parts.join(', ')} from cache)`;
            }
            updateProgressLog('complete', completeMsg, result.stats);
        }

        setTimeout(hideProgressPanel, 1500);

    } catch (error) {
        console.error('Error generating graph:', error);
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

async function refreshModifiedFiles() {
    const workspacePath = await getWorkspacePath();
    if (workspacePath) {
        await fetchModifiedFiles(workspacePath);
        updateNodeStyles();
    }
}
