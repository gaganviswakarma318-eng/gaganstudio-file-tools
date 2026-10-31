const { app, BrowserWindow, dialog, ipcMain, session } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const isDevelopment = !app.isPackaged;
const MAX_FILE_BYTES = 250 * 1024 * 1024;
const IMAGE_EXTENSIONS = ["avif", "bmp", "gif", "jpg", "jpeg", "png", "tif", "tiff", "webp"];
const IMAGE_MIME_TYPES = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".tif", "image/tiff"],
  [".tiff", "image/tiff"],
  [".webp", "image/webp"],
]);
const SAVE_TYPES = new Map([
  ["image/png", { name: "PNG image", extensions: ["png"] }],
  ["image/jpeg", { name: "JPEG image", extensions: ["jpg", "jpeg"] }],
  ["image/webp", { name: "WebP image", extensions: ["webp"] }],
  ["image/gif", { name: "GIF image", extensions: ["gif"] }],
  ["application/pdf", { name: "PDF document", extensions: ["pdf"] }],
  ["application/zip", { name: "ZIP archive", extensions: ["zip"] }],
]);

function isTrustedUrl(value) {
  const senderUrl = new URL(value);
  if (isDevelopment) {
    return senderUrl.protocol === "http:" &&
      senderUrl.hostname === "127.0.0.1" &&
      senderUrl.port === "4173" &&
      senderUrl.pathname === "/";
  }
  const appUrl = pathToFileURL(path.resolve(__dirname, "../../web/dist/index.html")).href;
  return senderUrl.href === appUrl;
}

function assertTrustedSender(event) {
  const senderUrl = event.senderFrame?.url;
  if (
    !senderUrl ||
    event.senderFrame !== event.sender.mainFrame ||
    !isTrustedUrl(senderUrl)
  ) {
    throw new Error("File dialogs are only available to the application window.");
  }
}

function getOpenDialogOptions(kind, multiple) {
  if (kind === "image") {
    return {
      title: "Open images",
      filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
      properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
    };
  }
  if (kind === "pdf") {
    return {
      title: "Open PDF files",
      filters: [{ name: "PDF documents", extensions: ["pdf"] }],
      properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
    };
  }
  throw new Error("Unsupported file selection type.");
}

ipcMain.handle("gsft:open-files", async (event, kind, multiple) => {
  assertTrustedSender(event);
  if (typeof multiple !== "boolean") throw new Error("Invalid file selection options.");
  const result = await dialog.showOpenDialog(getOpenDialogOptions(kind, multiple));
  if (result.canceled) return { canceled: true, files: [] };

  const files = [];
  for (const filePath of result.filePaths) {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) throw new Error("The selected item is not a file.");
    if (stats.size > MAX_FILE_BYTES) {
      throw new Error(`${path.basename(filePath)} exceeds the 250 MB file limit.`);
    }
    const contents = await fs.readFile(filePath);
    if (contents.byteLength > MAX_FILE_BYTES) {
      throw new Error(`${path.basename(filePath)} exceeds the 250 MB file limit.`);
    }
    const data = new Uint8Array(contents.byteLength);
    contents.copy(data);
    const extension = path.extname(filePath).toLowerCase();
    files.push({
      name: path.basename(filePath),
      mimeType: extension === ".pdf"
        ? "application/pdf"
        : IMAGE_MIME_TYPES.get(extension) ?? "application/octet-stream",
      data: data.buffer,
    });
  }
  return { canceled: false, files };
});

ipcMain.handle("gsft:save-file", async (event, fileName, mimeType, data) => {
  assertTrustedSender(event);
  const fileType = SAVE_TYPES.get(mimeType);
  if (
    typeof fileName !== "string" ||
    !fileName.trim() ||
    !fileType ||
    !(data instanceof ArrayBuffer) ||
    data.byteLength > MAX_FILE_BYTES
  ) {
    throw new Error("Invalid file save request.");
  }

  const safeName = path.basename(fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_"));
  const result = await dialog.showSaveDialog({
    title: "Save processed file",
    defaultPath: safeName,
    filters: [fileType],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, Buffer.from(data));
  return { canceled: false };
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f6f7f9",
    title: "GaganStudio File Tools",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });

  if (isDevelopment) {
    void window.loadURL("http://127.0.0.1:4173");
  } else {
    void window.loadFile(path.join(__dirname, "../../web/dist/index.html"));
  }
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' http://127.0.0.1:4173 ws://127.0.0.1:4173",
        ],
      },
    });
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
