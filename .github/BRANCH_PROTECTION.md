# Branch Protection Rules Setup

This document explains how to configure branch protection rules on GitHub to require tests to pass before merging pull requests.

## Automatic CI Checks

The repository now includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that automatically:
- Runs on every pull request to `main` or `master` branches
- Runs on every push to `main` or `master` branches
- Executes the following checks:
  - Linting (`npm run lint`)
  - Tests (`npm test`)
  - Build verification (`npm run compile`)

## Setting Up Branch Protection Rules

To require these checks to pass before merging, follow these steps:

### 1. Navigate to Branch Protection Settings

1. Go to your GitHub repository: https://github.com/mattiagaggi/claude-custom-chat
2. Click on **Settings** (requires admin access)
3. In the left sidebar, click **Branches**
4. Under "Branch protection rules", click **Add rule** (or edit an existing rule)

### 2. Configure the Protection Rule

**Branch name pattern:** `main` (or `master` if that's your default branch)

**Protect matching branches - Enable these options:**

- ✅ **Require a pull request before merging**
  - Optional: Require approvals (set to 1 or more if you want code reviews)
  - Optional: Dismiss stale pull request approvals when new commits are pushed

- ✅ **Require status checks to pass before merging**
  - ✅ **Require branches to be up to date before merging** (recommended)
  - **Status checks that are required:** Search for and select:
    - `test` (this is the CI job name from the workflow)

- ✅ **Require conversation resolution before merging** (optional but recommended)

- ✅ **Do not allow bypassing the above settings** (recommended to enforce rules even for admins)

### 3. Additional Recommended Settings

- ✅ **Require linear history** - Prevents merge commits, keeps history clean
- ✅ **Require deployments to succeed before merging** - If you have deployment workflows
- ✅ **Lock branch** - Prevents any pushes to the branch (use with caution)

### 4. Save Changes

Click **Create** (or **Save changes** if editing an existing rule)

## Testing the Setup

1. Create a new branch: `git checkout -b test-branch-protection`
2. Make a change to any file
3. Push the branch: `git push -u origin test-branch-protection`
4. Create a pull request on GitHub
5. You should see the CI checks running
6. The "Merge" button will be disabled until all checks pass

## Troubleshooting

### CI checks not appearing
- Make sure the workflow file is committed to the `main` branch
- Check the **Actions** tab in your repository to see if workflows are enabled
- Verify the workflow runs successfully on the `main` branch first

### Can't find the status check
- The status check name must match the job name in the workflow file (`test`)
- Status checks only appear after they've run at least once
- Try running the workflow on a pull request first, then add it to branch protection

### Checks fail but can still merge
- Ensure "Require status checks to pass before merging" is enabled
- Ensure the specific check (`test`) is selected
- Ensure "Do not allow bypassing the above settings" is enabled

## Alternative: Using CODEOWNERS

You can also require specific people to review code by creating a `.github/CODEOWNERS` file:

```
# Require review from repository owner for all changes
* @mattiagaggi

# Require review for specific directories
/src/ @mattiagaggi
/.github/ @mattiagaggi
```

Then enable "Require review from Code Owners" in the branch protection settings.

## References

- [GitHub Branch Protection Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Status Checks Documentation](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
