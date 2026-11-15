"""Build the Yoraito Windows installer.  Usage (from the repository root or anywhere):

    .venv-desktop\\Scripts\\python.exe desktop\\build_desktop.py

Steps: (1) build the React frontend, (2) package the Python backend as a one-folder PyInstaller build,
(3) package Electron + backend into an NSIS installer, (4) write the SHA-256 checksum.
The results land in <repository>/release/. Nothing is uploaded or published.

Needs: Node.js + npm, and a Python with the project's dependencies and PyInstaller (see docs/DESKTOP.md).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

DESKTOP = Path(__file__).resolve().parent
ROOT = DESKTOP.parent
STAGE = DESKTOP / "stage"
RELEASE = ROOT / "release"
NPM = "npm.cmd" if sys.platform == "win32" else "npm"
NPX = "npx.cmd" if sys.platform == "win32" else "npx"


def run(cmd: list[str], cwd: Path, **kw) -> None:
    print(f"\n> {' '.join(cmd)}   (in {cwd})", flush=True)
    subprocess.run(cmd, cwd=str(cwd), check=True, **kw)


def build_frontend() -> None:
    web = ROOT / "webui"
    if not (web / "node_modules").exists():
        run([NPM, "ci"], web)
    run([NPM, "run", "build"], web)


def build_backend() -> None:
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        sys.exit("PyInstaller is missing in this Python. See docs/DESKTOP.md (build setup).")
    out = STAGE / "backend"
    work = STAGE / "_pyinstaller"
    shutil.rmtree(out, ignore_errors=True)
    shutil.rmtree(work, ignore_errors=True)
    static_src = ROOT / "src" / "yoraito_model_diff" / "web" / "static"
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", "yoraito-backend",
        "--onedir", "--noconsole", "--noconfirm", "--clean",
        "--distpath", str(out), "--workpath", str(work), "--specpath", str(work),
        "--paths", str(ROOT / "src"),
        # Only the built UI is bundled (never testing/, reviews.db or review_files/).
        "--add-data", f"{static_src}{os.pathsep}{Path('yoraito_model_diff') / 'web' / 'static'}",
        "--collect-submodules", "uvicorn",
        "--hidden-import", "yoraito_model_diff.web.app",
        "--hidden-import", "yoraito_model_diff.llm",
        "--hidden-import", "fastapi", "--hidden-import", "multipart", "--hidden-import", "reportlab",
        "--hidden-import", "duckdb", "--hidden-import", "openpyxl",
        "--icon", str(DESKTOP / "assets" / "icon.ico"),
        str(DESKTOP / "desktop_entry.py"),
    ]
    run(cmd, ROOT)
    exe = out / "yoraito-backend" / "yoraito-backend.exe"
    if not exe.exists():
        sys.exit(f"The backend was not built: {exe} is missing.")


def build_installer() -> Path:
    if not (DESKTOP / "node_modules" / "electron-builder").exists():
        run([NPM, "ci"], DESKTOP)
    shutil.rmtree(RELEASE, ignore_errors=True)
    run([NPX, "electron-builder", "--win", "nsis", "--x64", "--publish", "never"], DESKTOP)
    version = json.loads((DESKTOP / "package.json").read_text(encoding="utf-8"))["version"]
    installer = RELEASE / f"Yoraito-Setup-{version}.exe"
    if not installer.exists():
        sys.exit(f"The installer was not created: {installer} is missing.")
    return installer


def write_checksum(installer: Path) -> str:
    digest = hashlib.sha256()
    with installer.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    value = digest.hexdigest()
    (RELEASE / f"{installer.name}.sha256").write_text(f"{value} *{installer.name}\n", encoding="ascii")
    return value


def write_docs(installer: Path, checksum: str) -> None:
    """RELEASE_NOTES.md and INSTALL.md next to the installer (regenerated on every build)."""
    version = json.loads((DESKTOP / "package.json").read_text(encoding="utf-8"))["version"]
    size_mb = installer.stat().st_size / (1024 * 1024)
    (RELEASE / "RELEASE_NOTES.md").write_text(
        f"""# Yoraito {version} for Windows

* Installer: `{installer.name}` ({installer.stat().st_size:,} bytes, {size_mb:.0f} MB)
* Architecture: Windows 10/11, 64-bit (x64)
* SHA-256: `{checksum}`
* Not code-signed yet: Windows SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.

## What it does
Compare two versions of an Excel financial model. The new file opens in Excel with the changes coloured in
(green added, amber changed, red removed) and a "Diff summary" sheet listing every change. Earlier comparisons
stay in the list after you close and reopen Yoraito.

## Privacy
Everything runs on your computer. The app can only talk to its own engine on 127.0.0.1; every other network
request is blocked. AI summaries and Google-Sheets-by-URL are switched off. Comparing works with no internet.

## Your data
`%LOCALAPPDATA%\\Yoraito\\` holds `reviews.db`, `review_files\\` and `logs\\`. Uninstalling does not delete it.
History from the earlier one-file program (`%LOCALAPPDATA%\\yoraito-model-diff\\`) is copied in on first run.
""",
        encoding="utf-8",
    )
    (RELEASE / "INSTALL.md").write_text(
        f"""# Install Yoraito {version}

1. Double-click `{installer.name}`. If Windows says "Windows protected your PC", click **More info**, then **Run anyway**.
2. Follow the wizard. No administrator rights are needed; it installs for your user only.
3. Open **Yoraito** from the Start menu or the desktop shortcut.
4. Choose the earlier version (BEFORE) and the new version (AFTER), then click **Compare versions**.

Verify the download (PowerShell): `Get-FileHash .\\{installer.name} -Algorithm SHA256` must equal `{checksum}`.

Back up your history: close Yoraito and copy `%LOCALAPPDATA%\\Yoraito`. Remove all data: delete that folder.
Uninstall: Settings, Apps, Yoraito, Uninstall (your data is kept).
""",
        encoding="utf-8",
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the Yoraito Windows installer.")
    ap.add_argument("--skip-frontend", action="store_true", help="reuse the already built React UI")
    ap.add_argument("--skip-backend", action="store_true", help="reuse the already built backend (desktop/stage)")
    args = ap.parse_args()
    if not args.skip_frontend:
        build_frontend()
    if not args.skip_backend:
        build_backend()
    installer = build_installer()
    checksum = write_checksum(installer)
    write_docs(installer, checksum)
    print("\nInstaller:", installer)
    print("Size     :", f"{installer.stat().st_size:,} bytes")
    print("SHA-256  :", checksum)


if __name__ == "__main__":
    main()
