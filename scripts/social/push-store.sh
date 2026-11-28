#!/usr/bin/env bash
# Saves social-store/ (state.json + the last few days of card images) as a single commit on the
# public "social-posts" branch. It always replaces the branch with one fresh commit, so old images
# do not pile up in the repository. The site's main branch is never touched.
set -euo pipefail
message="${1:-Update social posts}"
cd social-store
rm -rf .git
git init -q -b social-posts
git add -A
git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit -q -m "$message"
git push -q -f "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" social-posts
rm -rf .git
echo "social-posts 브랜치에 저장했어요: $message"
