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
# stow refuses to overwrite pre-existing real files (a fresh system has default
# .bashrc, apps create their own config, etc.), which would abort the whole run.
# So for each package we dry-run first, move any conflicting non-symlink targets
# into a timestamped backup dir, then stow — the repo's versions win, nothing lost.
cd "$SCRIPT_DIR"
BACKUP_DIR="$HOME/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"
for pkg in */; do
    pkg="${pkg%/}"
    while IFS= read -r target; do
        [ -n "$target" ] || continue
        [ -e "$HOME/$target" ] || continue   # gone already
        [ -L "$HOME/$target" ] && continue    # an existing symlink is fine
        mkdir -p "$BACKUP_DIR/$(dirname "$target")"
        mv "$HOME/$target" "$BACKUP_DIR/$target"
        echo "backed up ~/$target -> $BACKUP_DIR/$target"
    done < <(stow -nv --target="$HOME" "$pkg" 2>&1 \
        | sed -n 's/.*cannot stow .* over existing target \(.*\) since .*/\1/p')
    stow --target="$HOME" "$pkg"
done

# 7. Enable system services (skips any not present so a missing unit won't abort)
for svc in "${SERVICES[@]}"; do
    if systemctl cat "$svc" &> /dev/null; then
        sudo systemctl enable "$svc"
    fi
done
