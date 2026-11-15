# yoraito-desktop — Shared Desktop App Packaging Template

This repository contains the shared desktop application packaging framework for all Yoraito tools.

Each Yoraito tool (model-diff, recon, sync, etc.) copies this template into its own `desktop/` directory and customizes it.

## What's Included

- **Electron shell** — loads the local web app in a native window
- **PyInstaller entry point** — wraps the FastAPI backend for distribution
- **NSIS installer config** — Windows installer with upgrade support
- **Build scripts** — one-command build for exe + installer
- **Documentation** — step-by-step packaging guide

## How to Use

1. Copy this template into your tool's `desktop/` directory
2. Replace placeholders (see `PLACEHOLDERS.md`)
3. Run `python build_desktop.py`
4. Output: `desktop/dist/Yoraito-Setup-<version>.exe`

## Placeholders

| Placeholder | Description | Example |
|---|---|---|
| `{{TOOL_NAME}}` | Display name | Yoraito Model Diff |
| `{{TOOL_NAME_LOWER}}` | Lowercase, hyphenated | yoraito-model-diff |
| `{{TOOL_NAME_PASCAL}}` | PascalCase | YoraitoModelDiff |
| `{{PORT}}` | Default port | 17842 |
| `{{LEGACY_FOLDER}}` | Old data folder name | yoraito-model-diff |
| `{{APP_FOLDER}}` | New data folder name | Yoraito |
| `{{ENTRY_MODULE}}` | Python module path | yoraito_model_diff.web.app |
| `{{CLI_COMMAND}}` | CLI command name | yoraito-model-diff |

## Files

- `desktop/main.js` — Electron main process
- `desktop/preload.js` — Preload script (IPC, security)
- `desktop/desktop_entry.py` — PyInstaller backend entry point
- `desktop/build_desktop.py` — Build script (PyInstaller + NSIS)
- `desktop/electron-builder.yml` — Electron builder config
- `desktop/loading.html` — Loading screen
- `packaging/*.iss` — Inno Setup installer template
- `docs/DESKTOP.md` — Packaging guide

## License

MIT License. Part of the Yoraito open-source finance stack.
