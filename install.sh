#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

# System services to enable on boot (edit this list as your setup changes)
SERVICES=(
    sddm.service          # display manager / login screen
    NetworkManager.service # networking
    bluetooth.service     # bluetooth (bluez)
    docker.service        # docker daemon
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

# 5. Tools that ship their own curl-pipe installers (see curllist.txt)
# (fd 3 so an installer that reads stdin can't swallow the rest of the list)
while read -r -u 3 cmd url; do
    case "$cmd" in ''|\#*) continue ;; esac
    if ! command -v "$cmd" &> /dev/null; then
        curl -fsSL "$url" | bash
    fi
done 3< "$SCRIPT_DIR/curllist.txt"

# 6. plannotator's Claude Code plugin — the binary comes from curllist.txt, but
# the plugin half is a separate marketplace install once the claude CLI exists
if command -v claude &> /dev/null && ! claude plugin list 2>/dev/null | grep -q plannotator; then
    claude plugin marketplace add backnotprop/plannotator || true
    claude plugin install plannotator@plannotator || true
fi

# 7. pi coding agent (npm global). npm is pulled in explicitly here because it
# only exists as a *dependency* on the source machine, so sync.sh's explicit-
# package lists never capture it. --prefix keeps the install under ~/.local
# (bin already on PATH via .bashrc) so it needs no sudo and survives pacman
# reinstalls of npm itself.
if ! command -v pi &> /dev/null; then
    sudo pacman -S --needed --noconfirm npm
    npm install -g --prefix "$HOME/.local" @earendil-works/pi-coding-agent
fi

# 8. Symlink dotfiles into $HOME (each non-hidden top-level dir is a stow package)
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
    done < <(stow -nv --no-folding --target="$HOME" "$pkg" 2>&1 \
        | sed -n 's/.*cannot stow .* over existing target \(.*\) since .*/\1/p')
    # --no-folding forces per-file symlinks instead of folding a whole dir into a
    # single link. Critical for the .claude tree in config: without it, a fresh machine
    # (no ~/.claude yet) would get all of ~/.claude symlinked into the repo,
    # dragging Claude Code's runtime state (history, sessions, creds) in with it.
    stow --no-folding --target="$HOME" "$pkg"
done

# 9. Enable system services (skips any not present so a missing unit won't abort)
for svc in "${SERVICES[@]}"; do
    if systemctl cat "$svc" &> /dev/null; then
        sudo systemctl enable "$svc"
    fi
done

# 10. Add the current user to the docker group so docker runs without sudo
# (takes effect on next login / `newgrp docker`)
if getent group docker &> /dev/null && ! id -nG "$USER" | grep -qw docker; then
    sudo usermod -aG docker "$USER"
fi
