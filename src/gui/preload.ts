import { contextBridge, ipcRenderer, webUtils } from 'electron';
import * as path from 'path';

contextBridge.exposeInMainWorld('electronAPI', {
  // 경로 유틸리티 (크로스 플랫폼)
  getDirname: (filePath: string) => path.dirname(filePath),
  joinPath: (...paths: string[]) => path.join(...paths),
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
