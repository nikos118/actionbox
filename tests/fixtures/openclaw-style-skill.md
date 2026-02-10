---
name: Merge PR
description: Merge a GitHub PR via squash after CI passes
---

# Merge PR

Squash-merges a GitHub pull request after verifying CI status.

## Tools Used

- `github_get_pr` — Fetch PR details
- `github_merge_pr` — Squash merge the PR
- `slack_send_message` — Notify the team channel
