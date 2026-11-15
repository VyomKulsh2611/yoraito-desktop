"""Build a desktop app from the yoraito-desktop template.

Usage:
    1. Copy this template into your tool's desktop/ directory
    2. Replace placeholders in all files (see PLACEHOLDERS.md)
    3. Run: python build_desktop.py

Produces:
    - Windows: dist/Yoraito-Setup-<version>.exe (NSIS installer)
    - macOS: dist/Yoraito-<version>.dmg
    - Linux: dist/Yoraito-<version>.AppImage

Requirements:
    - Python 3.11+
    - Node.js 18+
    - PyInstaller
    - NSIS (Windows only, for installer)
"""

import os
import sys
import subprocess
import shutil

def build():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    desktop_dir = os.path.join(root, "desktop")
    
    # Check prerequisites
    for cmd in ["node", "npm"]:
        if not shutil.which(cmd):
            print(f"Error: {cmd} not found. Install Node.js from https://nodejs.org")
            sys.exit(1)
    
    try:
        import PyInstaller
    except ImportError:
        print("PyInstaller not found. Installing...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"], check=True)
    
    # Step 1: Build Python backend with PyInstaller
    print("Step 1: Building Python backend...")
    backend_cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", "backend",
        "--onefile",
        "--noconfirm",
        "--noconsole",
        "--paths", os.path.join(root, "src"),
        "--add-data", f"{os.path.join(root, 'src', 'yoraito_model_diff', 'web', 'static')}{os.pathsep}yoraito_model_diff/web/static",
        os.path.join(desktop_dir, "desktop_entry.py"),
    ]
    subprocess.run(backend_cmd, check=True, cwd=root)
    
    # Step 2: Install npm dependencies
    print("Step 2: Installing npm dependencies...")
    subprocess.run(["npm", "install"], check=True, cwd=desktop_dir)
    
    # Step 3: Build Electron app
    print("Step 3: Building Electron app...")
    subprocess.run(["npm", "run", "build"], check=True, cwd=desktop_dir)
    
    print("\nBuild complete! Output in desktop/dist/")

if __name__ == "__main__":
    build()
