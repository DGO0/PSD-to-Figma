import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 앱 정보
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // 경로 유틸리티 (IPC를 통해 main process에서 처리)
  getDirname: (filePath: string) => ipcRenderer.invoke('get-dirname', filePath),
  joinPath: (...paths: string[]) => ipcRenderer.invoke('join-path', ...paths),
  // 드래그앤드롭 파일 경로 가져오기
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
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
