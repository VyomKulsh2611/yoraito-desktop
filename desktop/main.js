"use strict";
/**
 * Yoraito desktop shell (Electron main process).
 *
 * What it does, in order:
 *   1. makes sure only one Yoraito is running;
 *   2. picks a free local port and starts the bundled Python backend on 127.0.0.1;
 *   3. waits for GET /api/health, then shows the interface the backend serves;
 *   4. stops the backend when the app closes, and tells the user if the backend stops by itself.
 *
 * Privacy: the window may only talk to its own backend on 127.0.0.1. Every other network request is cancelled.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const HOST = "127.0.0.1";
const HEALTH_TIMEOUT_MS = 60_000;
const EXTERNAL_ALLOWED = new Set(["https://sheets.new/"]); // opened in the user's browser, only on request

const dataDir = path.join(process.env.LOCALAPPDATA || app.getPath("home"), "Yoraito");
const logDir = path.join(dataDir, "logs");
fs.mkdirSync(logDir, { recursive: true });
app.setPath("userData", path.join(dataDir, "electron")); // Chromium's own cache lives with the rest of the data

let backend = null; // the child process
let backendPort = 0;
let mainWindow = null;
let quitting = false;

function log(message) {
  try {
    fs.appendFileSync(path.join(logDir, "desktop.log"), `${new Date().toISOString()} ${message}\n`);
  } catch {
    /* logging must never stop the app */
  }
}

// ---- one instance only ------------------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(start).catch((err) => fatal(`Yoraito could not start.\n\n${err && err.message ? err.message : err}`));
}

// ---- backend ----------------------------------------------------------------------------------------------
function backendExecutable() {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "backend")
    : path.join(__dirname, "stage", "backend", "yoraito-backend");
  return app.isPackaged ? path.join(base, "yoraito-backend", "yoraito-backend.exe") : path.join(base, "yoraito-backend.exe");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, HOST, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function startBackend(port) {
  const exe = backendExecutable();
  if (!fs.existsSync(exe)) throw new Error(`The Yoraito engine is missing:\n${exe}`);
  const out = fs.openSync(path.join(logDir, "backend-output.log"), "a");
  backend = spawn(exe, [], {
    cwd: path.dirname(exe),
    windowsHide: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, YORAITO_PORT: String(port), YORAITO_PARENT_PID: String(process.pid) },
  });
  log(`backend started pid=${backend.pid} port=${port}`);
  backend.on("exit", (code, signal) => {
    log(`backend exited code=${code} signal=${signal}`);
    backend = null;
    if (!quitting) onBackendLost(code);
  });
}

function stopBackend() {
  if (!backend) return;
  const pid = backend.pid;
  backend = null;
  try {
    if (process.platform === "win32") {
      // /T also ends anything the backend started; /F because it has no console to receive a polite request.
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch (err) {
    log(`stopBackend: ${err.message}`);
  }
  log(`backend stopped pid=${pid}`);
}

function healthy(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port, path: "/api/health", timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(res.statusCode === 200 && JSON.parse(body).status === "ok");
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(port) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!backend) throw new Error("The Yoraito engine stopped while starting.");
    if (await healthy(port)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("The Yoraito engine did not start within 60 seconds.");
}

function onBackendLost(code) {
  if (quitting) return;
  const choice = dialog.showMessageBoxSync(mainWindow || undefined, {
    type: "error",
    title: "Yoraito",
    message: "The Yoraito engine stopped unexpectedly.",
    detail: `Your saved comparisons are safe.\nExit code: ${code}\nLog folder: ${logDir}`,
    buttons: ["Restart Yoraito", "Close"],
    defaultId: 0,
    cancelId: 1,
  });
  if (choice === 0) {
    app.relaunch();
  }
  quitting = true;
  app.exit(0);
}

function fatal(message) {
  log(`fatal: ${message}`);
  dialog.showErrorBox("Yoraito could not start", `${message}\n\nLog folder: ${logDir}`);
  quitting = true;
  stopBackend();
  app.exit(1);
}

// ---- security ---------------------------------------------------------------------------------------------
function isOurOrigin(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && u.hostname === HOST && Number(u.port) === backendPort;
  } catch {
    return false;
  }
}

function lockDownSession(ses) {
  // 1. Nothing but our own backend (and the local loading page) may be requested.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    const allowed = isOurOrigin(url) || url.startsWith("file:") || url.startsWith("devtools:") || url.startsWith("blob:") || url.startsWith("data:");
    if (!allowed) log(`blocked request ${details.method} ${new URL(url).origin}`);
    callback({ cancel: !allowed });
  });
  // 2. A strict Content-Security-Policy on everything the backend serves.
  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    if (isOurOrigin(details.url)) {
      headers["Content-Security-Policy"] = [
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
          "font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; " +
          "frame-ancestors 'none'",
      ];
    }
    callback({ responseHeaders: headers });
  });
  // 3. No camera, microphone, location, notifications...
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
}

function lockDownContents(contents) {
  contents.on("will-navigate", (event, url) => {
    if (!isOurOrigin(url) && !url.startsWith("file:")) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    // The UI opens a blank tab, then points it at Google Sheets for the "Open in Google Sheets" button.
    // Both end up as one request to open https://sheets.new in the user's own browser.
    if (url === "about:blank" || EXTERNAL_ALLOWED.has(url)) {
      shell.openExternal("https://sheets.new/");
    }
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
}

// ---- IPC: two tiny, argument-free requests, accepted only from our own page -------------------------------
function trusted(event) {
  const url = event.senderFrame ? event.senderFrame.url : "";
  return isOurOrigin(url);
}
ipcMain.handle("yoraito:app-info", (event) => {
  if (!trusted(event)) throw new Error("Not allowed.");
  return { version: app.getVersion(), dataFolder: dataDir };
});
ipcMain.handle("yoraito:open-data-folder", async (event) => {
  if (!trusted(event)) throw new Error("Not allowed.");
  return (await shell.openPath(dataDir)) === ""; // openPath returns "" on success
});

// ---- window -----------------------------------------------------------------------------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Yoraito",
    backgroundColor: "#ffffff",
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: !app.isPackaged,
    },
  });
  win.once("ready-to-show", () => win.show());
  lockDownContents(win.webContents);
  win.on("closed", () => {
    mainWindow = null;
  });
  return win;
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          { label: "Open data folder", click: () => shell.openPath(dataDir) },
          { label: "Open log folder", click: () => shell.openPath(logDir) },
          { type: "separator" },
          { role: "quit", label: "Exit" },
        ],
      },
      { label: "View", submenu: [{ role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }] },
      { label: "Help", submenu: [{ label: `Yoraito ${app.getVersion()} - your files stay on this computer`, enabled: false }] },
    ]),
  );
}

async function start() {
  log(`Yoraito ${app.getVersion()} starting (packaged=${app.isPackaged})`);
  buildMenu();
  mainWindow = createWindow();
  mainWindow.loadFile(path.join(__dirname, "loading.html"));
  backendPort = await freePort();
  lockDownSession(session.defaultSession);
  startBackend(backendPort);
  await waitForBackend(backendPort);
  log("backend healthy");
  await mainWindow.loadURL(`http://${HOST}:${backendPort}/`);
}

app.on("before-quit", () => {
  quitting = true;
  stopBackend();
});
app.on("window-all-closed", () => app.quit());
process.on("exit", stopBackend);
