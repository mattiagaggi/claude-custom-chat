/**
 * Git Push Functionality
 * Handles pushing changes to any branch
 */

// Store branches data
let branchesData = null;

/**
 * Show push to branch dialog
 */
function showPushToBranchDialog() {
	const modal = document.getElementById('pushToBranchModal');
	if (modal) {
		modal.style.display = 'flex';

		// Request branches from extension
		vscode.postMessage({ type: 'getBranches' });

		// Focus on the commit message textarea after a short delay
		setTimeout(() => {
			document.getElementById('pushBranchCommitMessage')?.focus();
		}, 100);
	}
}

/**
 * Hide push to branch dialog
 */
function hidePushToBranchModal() {
	const modal = document.getElementById('pushToBranchModal');
	if (modal) {
		modal.style.display = 'none';
		// Clear the form
		const select = document.getElementById('pushBranchSelect');
		const customInput = document.getElementById('customBranchName');
		const textarea = document.getElementById('pushBranchCommitMessage');
		if (select) select.selectedIndex = 0;
		if (customInput) customInput.value = '';
		if (textarea) textarea.value = '';
		document.getElementById('customBranchInput').style.display = 'none';
	}
}

/**
 * Populate branches dropdown with fetched data
 */
function populateBranchesDropdown(branches) {
	branchesData = branches;
	const select = document.getElementById('pushBranchSelect');
	const currentBranchInfo = document.getElementById('currentBranchInfo');

	if (!select) return;

	// Clear existing options
	select.innerHTML = '';

	// Add current branch info
	if (currentBranchInfo && branches.current) {
		currentBranchInfo.textContent = `Current branch: ${branches.current}`;
	}

	// Combine and deduplicate branches
	const allBranches = [...new Set([...branches.local, ...branches.remote])];

	// Sort with current branch first, then main/master, then alphabetically
	allBranches.sort((a, b) => {
		if (a === branches.current) return -1;
		if (b === branches.current) return 1;
		if (a === 'main') return -1;
		if (b === 'main') return 1;
		if (a === 'master') return -1;
		if (b === 'master') return 1;
		return a.localeCompare(b);
	});

	// Add branches as options
	allBranches.forEach(branch => {
		const option = document.createElement('option');
		option.value = branch;
		let label = branch;
		if (branch === branches.current) {
			label += ' (current)';
		}
		option.textContent = label;
		select.appendChild(option);
	});

	// Add "Create new branch" option
	const newBranchOption = document.createElement('option');
	newBranchOption.value = '__new__';
	newBranchOption.textContent = '➕ Create new branch...';
	select.appendChild(newBranchOption);

	// Select current branch by default
	if (branches.current) {
		select.value = branches.current;
	}
}

/**
 * Handle branch selection change
 */
function handleBranchSelectChange() {
	const select = document.getElementById('pushBranchSelect');
	const customInput = document.getElementById('customBranchInput');
	const pushButton = document.getElementById('pushBranchButton');
	const modalTitle = document.getElementById('pushBranchModalTitle');

	if (!select) return;

	if (select.value === '__new__') {
		// Show custom branch input
		if (customInput) customInput.style.display = 'block';
		if (pushButton) pushButton.textContent = 'Create & Push';
		if (modalTitle) modalTitle.textContent = '🌿 Create and Push New Branch';
		// Focus on custom input
		setTimeout(() => {
			document.getElementById('customBranchName')?.focus();
		}, 100);
	} else {
		// Hide custom branch input
		if (customInput) customInput.style.display = 'none';
		if (pushButton) pushButton.textContent = 'Push';
		if (modalTitle) modalTitle.textContent = '🚀 Push to Branch';
	}
}

/**
 * Confirm and execute push to branch
 */
function confirmPushToBranch() {
	const select = document.getElementById('pushBranchSelect');
	const customInput = document.getElementById('customBranchName');
	const commitMessage = document.getElementById('pushBranchCommitMessage')?.value.trim();

	if (!commitMessage) {
		alert('Please enter a commit message');
		return;
	}

	let targetBranch;
	let isNewBranch = false;

	if (select?.value === '__new__') {
		// Creating new branch
		targetBranch = customInput?.value.trim();
		isNewBranch = true;

		if (!targetBranch) {
			alert('Please enter a branch name');
			return;
		}

		// Validate branch name
		if (!/^[\w\-\/\.]+$/.test(targetBranch)) {
			alert('Branch name can only contain letters, numbers, hyphens, underscores, forward slashes, and dots');
			return;
		}

		// Check if branch already exists
		if (branchesData && (branchesData.local.includes(targetBranch) || branchesData.remote.includes(targetBranch))) {
			alert(`Branch "${targetBranch}" already exists. Please choose it from the dropdown.`);
			return;
		}
	} else {
		// Pushing to existing branch
		targetBranch = select?.value;

		if (!targetBranch) {
			alert('Please select a branch');
			return;
		}
	}

	// Send message to extension
	if (isNewBranch) {
		vscode.postMessage({
			type: 'pushToNewBranch',
			branchName: targetBranch,
			commitMessage: commitMessage
		});
	} else {
		vscode.postMessage({
			type: 'pushToBranch',
			branchName: targetBranch,
			commitMessage: commitMessage
		});
	}

	hidePushToBranchModal();
}

/**
 * Update push button visibility based on dev mode status
 * Note: Push button is now always visible since push works without Dev Mode
 */
function updatePushButtonsVisibility(isDevModeActive) {
	// Push button is now always visible
	// Keeping this function for backward compatibility
}
