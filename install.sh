#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

# System services to enable on boot (edit this list as your setup changes)
SERVICES=(
    sddm.service          # display manager / login screen
    NetworkManager.service # networking
    bluetooth.service     # bluetooth (bluez)
)

# 1. Prerequisites for building AUR packages (git to clone, base-devel for makepkg)
sudo pacman -S --needed --noconfirm git base-devel

# 2. Bootstrap yay if it isn't already installed
if ! command -v yay &> /dev/null; then
    tmpdir="$(mktemp -d)"
    git clone https://aur.archlinux.org/yay.git "$tmpdir/yay"
    (cd "$tmpdir/yay" && makepkg -si --noconfirm)
    rm -rf "$tmpdir"
fi

# 3. Official repo packages
sudo pacman -S --needed --noconfirm - < "$SCRIPT_DIR/pkglist.txt"

# 4. AUR packages
yay -S --needed --noconfirm - < "$SCRIPT_DIR/aurlist.txt"

# 5. workmux (not in the repos; installed via upstream script)
if ! command -v workmux &> /dev/null; then
    curl -fsSL https://raw.githubusercontent.com/raine/workmux/main/scripts/install.sh | bash
fi

# 6. Symlink dotfiles into $HOME (each non-hidden top-level dir is a stow package)
cd "$SCRIPT_DIR"
for pkg in */; do
    stow --target="$HOME" "${pkg%/}"
done

# 7. Enable system services (skips any not present so a missing unit won't abort)
for svc in "${SERVICES[@]}"; do
    if systemctl cat "$svc" &> /dev/null; then
        sudo systemctl enable "$svc"
    fi
done
