#!/usr/bin/env bash
# Used by release.yml: for each package, tag + GitHub Release "<name>@<version>" (e.g. @expokit/cli@0.2.0) when that version is on npm and
# has no release yet. DRY_RUN=1 prints what it would do.
set -euo pipefail

release() {
  local dir=$1 paths=$2
  local name version
  name=$(node -p "require('./$dir/package.json').name")
  version=$(node -p "require('./$dir/package.json').version")
  local full="$name@$version"

  if git rev-parse -q --verify "refs/tags/$full" >/dev/null; then
    echo "$full: already released"
    return
  fi
  if ! npm view "$name@$version" version >/dev/null 2>&1; then
    echo "$full: $name@$version is not on npm yet — skipping"
    return
  fi

  local previous notes
  previous=$(git tag --list "$name@*" --sort=-v:refname | head -1)
  notes=$(mktemp)
  {
    echo "\`$name@$version\` — [npm](https://www.npmjs.com/package/$name/v/$version)"
    echo
    if [ -n "$previous" ]; then
      echo "## Changes since $previous"
      echo
      # shellcheck disable=SC2086
      git log "$previous..HEAD" --format='- %s' -- $paths
    else
      echo "First release from this repository."
    fi
    echo
    echo "Docs: https://expokit.karandev.in/docs"
  } >"$notes"

  if [ -n "${DRY_RUN:-}" ]; then
    echo "DRY RUN — would release $full:"
    cat "$notes"
    return
  fi
  git tag "$full" HEAD
  git push origin "refs/tags/$full"
  gh release create "$full" --title "$name $version" --notes-file "$notes" --verify-tag
  echo "$full: released"
}

release packages/cli "packages/cli registry"
release packages/charts "packages/charts"
