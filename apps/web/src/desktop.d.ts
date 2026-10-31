interface DesktopFile {
  name: string;
  mimeType: string;
  data: ArrayBuffer;
}

interface DesktopBridge {
  openFiles(
    kind: "image" | "pdf",
    multiple: boolean,
  ): Promise<{ canceled: boolean; files: DesktopFile[] }>;
  saveFile(
    name: string,
    mimeType: string,
    data: ArrayBuffer,
  ): Promise<{ canceled: boolean }>;
}

interface Window {
  gsftDesktop?: DesktopBridge;
}
