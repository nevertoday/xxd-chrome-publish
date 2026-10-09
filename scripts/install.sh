#!/bin/sh
# Link the CLI onto PATH as `xxd-chrome-publish` (and any extra names given).
#   sh scripts/install.sh                 -> ~/.local/bin/xxd-chrome-publish
#   sh scripts/install.sh cx-chrome-publish   also adds that alias
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin="${XXD_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$bin"
for name in xxd-chrome-publish "$@"; do
  cat > "$bin/$name" <<SH
#!/bin/sh
exec node "$here/xxd-chrome-publish.mjs" "\$@"
SH
  chmod +x "$bin/$name"
  echo "installed $bin/$name"
done
case ":$PATH:" in *":$bin:"*) ;; *) echo "note: add $bin to PATH" ;; esac
