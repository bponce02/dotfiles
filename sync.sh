#!/usr/bin/env bash

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

# Official repo packages
pacman -Qqen > "$SCRIPT_DIR/pkglist.txt"

# AUR packages
pacman -Qqem > "$SCRIPT_DIR/aurlist.txt"
