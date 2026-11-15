# Yoraito desktop app (Windows)

The desktop app is the existing web app in its own window. It starts the same Python engine on your computer,
shows the same screens, and never needs a browser or an internet connection to compare files.

## For users

**Install:** double-click `Yoraito-Setup-1.0.0.exe`, follow the wizard (no administrator rights needed), and open
Yoraito from the Start menu. Windows may say "Windows protected your PC" because the installer is not code-signed
yet: click **More info**, then **Run anyway**.

**Use:** choose the old file and the new file, click **Compare versions**. The new file opens in Excel with the
changes coloured in. Earlier comparisons stay in the list after you close and reopen Yoraito.

**Your data** is in `%LOCALAPPDATA%\Yoraito\` (paste that into the Explorer address bar):

| Item | Location |
|---|---|
| Review history (database) | `reviews.db` |
| Copies of the two files of each comparison | `review_files\` |
| Logs (no file contents) | `logs\` |

* **Back up:** close Yoraito, copy the whole `Yoraito` folder somewhere safe.
* **Remove:** close Yoraito and delete the `Yoraito` folder.
* **Uninstalling does not delete this folder.** Reinstalling or updating keeps your history.
* If you used the earlier one-file program, its history in `%LOCALAPPDATA%\yoraito-model-diff\` is **copied** into
  the new folder the first time (the old folder is left untouched).

**Privacy:** files are processed on this computer only. The window may talk only to its own engine on
`127.0.0.1`; every other network request is blocked. The AI-summary and Google-Sheets-by-URL features are
switched off in this app. The one thing that leaves your computer is something you choose: the **Open in Google
Sheets** button opens `sheets.new` in your browser, and you upload the file there yourself.

## For developers

Layout (`desktop/`): `main.js` (Electron main process), `preload.js` (two argument-free calls), `loading.html`,
`desktop_entry.py` (starts the existing FastAPI app quietly; data folder, migration, blocked routes, exits when
Electron disappears), `build_desktop.py`, `electron-builder.yml`, `make_icon.py` (placeholder icon: replace
`assets/icon.ico` with the real logo).

The interface is served by the bundled backend at `http://127.0.0.1:<free port>` (same code as the web version, no
changes to `web/app.py`). Electron adds a strict Content-Security-Policy, cancels any request that is not to that
address, and denies every permission request.

**Build** (needs Node.js and Python 3.11+):

```
python -m venv .venv-desktop
.venv-desktop\Scripts\python.exe -m pip install openpyxl defusedxml duckdb pydantic "mcp>=2.0" fastapi uvicorn python-multipart reportlab "pyinstaller==6.19.0"
cd desktop && npm ci && cd ..
.venv-desktop\Scripts\python.exe desktop\build_desktop.py
```

The installer, its `.sha256` file and the release notes land in `release/` (git-ignored). The build downloads
Electron and the NSIS tools from GitHub once; they are cached afterwards.

Run without installing: build the backend once (`build_desktop.py` does), then `cd desktop && npm start`.
