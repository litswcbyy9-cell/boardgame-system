const { app, BrowserWindow, shell } = require('electron');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PORT = Number(process.env.PORT || 9898);
let mainWindow;

function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Server did not become ready: ${url}`));
        } else {
          setTimeout(check, 300);
        }
      });
      req.setTimeout(1000, () => req.destroy());
    };
    check();
  });
}

async function startServer() {
  process.env.PORT = String(PORT);
  process.env.SERVE_WEB = '1';
  process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
  process.env.DB_PORT = process.env.DB_PORT || '3306';
  process.env.DB_USER = process.env.DB_USER || 'boardgame';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'boardgame';
  process.env.DB_NAME = process.env.DB_NAME || 'boardgame';

  const appRoot = app.getAppPath();
  const serverEntry = path.join(appRoot, 'server', 'src', 'index.js');
  await import(pathToFileURL(serverEntry).href);
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);
}

async function createWindow() {
  await startServer();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 760,
    title: '骰子猫桌游馆运营工作台',
    backgroundColor: '#f3f6f2',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
