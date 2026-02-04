import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectPsdFile: () => ipcRenderer.invoke('select-psd-file'),
  selectPsdFiles: () => ipcRenderer.invoke('select-psd-files'),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  analyzePsd: (filePath: string) => ipcRenderer.invoke('analyze-psd', filePath),
  convertPsd: (filePath: string, outputDir: string) =>
    ipcRenderer.invoke('convert-psd', filePath, outputDir),
  convertPsdBatch: (filePaths: string[], outputDir: string) =>
    ipcRenderer.invoke('convert-psd-batch', filePaths, outputDir),
  runCliConvert: (filePath: string, outputDir: string) =>
    ipcRenderer.invoke('run-cli-convert', filePath, outputDir),
  openFolder: (folderPath: string) => ipcRenderer.invoke('open-folder', folderPath),
  onProgress: (callback: (progress: { percent: number; message: string; fileIndex?: number; totalFiles?: number }) => void) => {
    ipcRenderer.on('conversion-progress', (_event, progress) => callback(progress));
  },
  removeProgressListener: () => {
    ipcRenderer.removeAllListeners('conversion-progress');
  },
});
