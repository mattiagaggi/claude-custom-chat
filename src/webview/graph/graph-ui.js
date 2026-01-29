/**
 * Graph UI: progress panel, placeholders, error display, node details, button states
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

async function checkBackendAndRetry() {
    const connected = await checkBackendConnection();
    if (connected) {
        showGraphPlaceholder();
    } else {
        showBackendInstructions();
    }
}

function showGraphPlaceholder() {
    // No placeholder — canvas stays empty until a graph is generated
}

function showProgressPanel(initialMessage) {
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

function updateProgressLog(step, message, data) {
    const progressLogs = document.getElementById('progressLogs');
    if (!progressLogs) return;

    const entry = document.createElement('div');
    entry.className = 'progress-log-entry';
    if (step === 'error') entry.classList.add('error');
    if (step === 'complete') entry.classList.add('complete');

    let icon = '→';
    if (step === 'complete') icon = '✓';
    if (step === 'error') icon = '✗';
    if (step === 'summarizing' && data?.current) {
        icon = `[${data.current}/${data.total}]`;
    }

    entry.textContent = `${icon} ${message}`;
    progressLogs.appendChild(entry);

    const panel = document.getElementById('progressPanel');
    if (panel) {
        panel.scrollTop = panel.scrollHeight;
    }

    if (step === 'complete' || step === 'error') {
        const spinner = document.querySelector('.progress-spinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
    }
}

function hideProgressPanel() {
    const panel = document.getElementById('progressPanel');
    if (panel) {
        panel.remove();
    }
}

function showGraphLoading(message) {
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

function hideGraphLoading() {
    // The graph will be rendered, replacing the loading content
}

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

function updateGenerateButtonState(isLoading) {
    const btn = document.getElementById('generateGraphBtn');
    if (btn) {
        btn.disabled = isLoading;
        btn.textContent = isLoading ? 'Generating...' : 'Generate Graph';
    }
}

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

function hideNodeDetails() {
    updateGraphInfo();
}

function updateGraphInfo() {
    const graphInfo = document.getElementById('graphInfoInline');
    if (graphInfo) {
        if (cy) {
            const nodeCount = cy.nodes().length;
            const edgeCount = cy.edges().length;
            const modifiedCount = cy.nodes().filter(n => n.data('isModified')).length;
            graphInfo.textContent = `${nodeCount} nodes, ${edgeCount} edges${modifiedCount > 0 ? ` (${modifiedCount} modified)` : ''}`;
        } else {
            graphInfo.textContent = '0 nodes, 0 edges';
        }
    }
}
