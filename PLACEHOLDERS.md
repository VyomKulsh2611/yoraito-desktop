# Placeholders Reference

Replace these placeholders in all template files when setting up a new tool's desktop app.

## Placeholders

| Placeholder | Description | Example (model-diff) | Example (recon) |
|---|---|---|---|
| `__APP_FOLDER__` | Data folder name (under %LOCALAPPDATA%) | `Yoraito` | `Yoraito` |
| `__LEGACY_FOLDER__` | Old data folder name (for migration) | `yoraito-model-diff` | `yoraito-recon` |
| `__ENTRY_MODULE__` | Python module to import app from | `yoraito_model_diff.web.app` | `yoraito_recon.web.app` |
| `__TOOL_NAME__` | Display name | `Yoraito Model Diff` | `Yoraito Recon` |
| `__TOOL_NAME_LOWER__` | Lowercase, hyphenated | `yoraito-model-diff` | `yoraito-recon` |
| `__TOOL_NAME_PASCAL__` | PascalCase | `YoraitoModelDiff` | `YoraitoRecon` |
| `__TOOL_NAME_UPPER__` | Uppercase env var prefix | `YORAITO_MODEL_DIFF` | `YORAITO_RECON` |
| `__PORT__` | Default port | `17842` | `17843` |

## Files to Update

1. `desktop/desktop_entry.py.template` → `desktop/desktop_entry.py`
2. `packaging/installer.iss.template` → `packaging/installer.iss`
3. `desktop/main.js` — update `TOOL_NAME`, `PORT`, `APP_FOLDER`
4. `desktop/package.json` — update `name`, `productName`, `appId`
5. `desktop/electron-builder.yml` — update `appId`, `productName`

## Steps

1. Copy this template into your tool's `desktop/` directory
2. Replace all placeholders in all files
3. Rename `desktop_entry.py.template` → `desktop_entry.py`
4. Rename `installer.iss.template` → `installer.iss`
5. Run `python build_desktop.py`
6. Output: `desktop/dist/Yoraito-Setup-<version>.exe`
