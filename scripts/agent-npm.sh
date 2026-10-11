#!/usr/bin/env bash
# Use the existing runtime; never install packages or change the caller's shell.
set -e

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  if [[ ! -s "$HOME/.nvm/nvm.sh" ]]; then
    echo 'Node/npm unavailable. Activate an installed Node runtime, then retry.' >&2
    exit 127
  fi

  # Avoid nvm selecting a version before checking the project pin.
  . "$HOME/.nvm/nvm.sh" --no-use
  if [[ -f .nvmrc ]]; then
    if ! nvm use --silent >&2; then
      echo 'The project Node version is unavailable. Prepare that version first.' >&2
      exit 127
    fi
  elif ! nvm use --silent default >&2; then
    echo 'The default Node version is unavailable. Activate an installed runtime.' >&2
    exit 127
  fi
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Node/npm unavailable after runtime activation.' >&2
  exit 127
fi

exec npm "$@"
