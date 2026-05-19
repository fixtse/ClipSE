#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /path/to/UGen300_M2_5.3.0_driver_Linux_amd64.zip" >&2
  exit 2
fi

archive_path="$1"
if [ ! -f "$archive_path" ]; then
  echo "Driver archive not found: $archive_path" >&2
  exit 2
fi

workdir="$(mktemp -d)"
cleanup() {
  rm -rf "$workdir"
}
trap cleanup EXIT

echo "[hailo] Installing host build dependencies"
$SUDO apt-get update
$SUDO apt-get install -y build-essential dkms linux-headers-"$(uname -r)" unzip

echo "[hailo] Extracting $archive_path"
unzip -q "$archive_path" -d "$workdir"

deb_path="$(find "$workdir" -type f -name 'hailort-pcie-driver_*_all.deb' | head -n 1 || true)"
if [ -n "$deb_path" ]; then
  echo "[hailo] Installing packaged PCIe driver: $deb_path"
  $SUDO dpkg --install "$deb_path"
else
  install_script="$(find "$workdir" -type f \( -iname 'install.sh' -o -iname '*install*.sh' \) | head -n 1 || true)"
  dkms_dir="$(find "$workdir" -type f -name 'dkms.conf' -printf '%h\n' | head -n 1 || true)"
  make_dir="$(find "$workdir" -type f \( -name 'Makefile' -o -name 'Kbuild' \) -printf '%h\n' | head -n 1 || true)"

  if [ -n "$install_script" ]; then
    echo "[hailo] Running vendor install script: $install_script"
    chmod +x "$install_script"
    (cd "$(dirname "$install_script")" && $SUDO ./$(basename "$install_script"))
  elif [ -n "$dkms_dir" ]; then
    package_name="$(awk -F= '/^PACKAGE_NAME/ { gsub(/[ "]/, "", $2); print $2 }' "$dkms_dir/dkms.conf")"
    package_version="$(awk -F= '/^PACKAGE_VERSION/ { gsub(/[ "]/, "", $2); print $2 }' "$dkms_dir/dkms.conf")"
    if [ -z "$package_name" ] || [ -z "$package_version" ]; then
      echo "Unable to read PACKAGE_NAME/PACKAGE_VERSION from $dkms_dir/dkms.conf" >&2
      exit 1
    fi

    echo "[hailo] Installing DKMS source: ${package_name}/${package_version}"
    $SUDO mkdir -p "/usr/src/${package_name}-${package_version}"
    $SUDO cp -R "$dkms_dir"/. "/usr/src/${package_name}-${package_version}/"
    $SUDO dkms remove -m "$package_name" -v "$package_version" --all || true
    $SUDO dkms add -m "$package_name" -v "$package_version"
    $SUDO dkms build -m "$package_name" -v "$package_version"
    $SUDO dkms install -m "$package_name" -v "$package_version"
  elif [ -n "$make_dir" ]; then
    echo "[hailo] Building kernel module from source: $make_dir"
    (cd "$make_dir" && make)
    module_path="$(find "$make_dir" -type f -name '*.ko' | head -n 1 || true)"
    if [ -z "$module_path" ]; then
      echo "Build finished but no .ko kernel module was found under $make_dir" >&2
      exit 1
    fi

    module_name="$(basename "$module_path" .ko)"
    install_dir="/lib/modules/$(uname -r)/extra"
    $SUDO mkdir -p "$install_dir"
    $SUDO cp "$module_path" "$install_dir/"
    $SUDO depmod -a
    $SUDO modprobe "$module_name"
  else
    echo "No supported installer, DKMS source, or Makefile was found in $archive_path" >&2
    find "$workdir" -maxdepth 3 -type f | sort >&2
    exit 1
  fi
fi

echo "[hailo] Driver install completed. A reboot may be required."
if command -v hailortcli >/dev/null 2>&1; then
  hailortcli scan || true
else
  echo "[hailo] hailortcli is not installed on the host; install HailoRT runtime to run hailortcli scan."
fi
