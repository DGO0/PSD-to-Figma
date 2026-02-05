import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, exec } from 'child_process';
import { PsdParser } from '../parser/psdParser';
import { PsdToFigmaConverter } from '../converter/converter';

// 메모리 제한 늘리기 (대용량 PSB 파일용)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=16384');

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  // Mac에서는 기본 메뉴 필요 (Cmd+Q, Cmd+C/V 등)
  if (process.platform === 'darwin') {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } else {
    // Windows에서는 메뉴바 제거
    Menu.setApplicationMenu(null);
  }

  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
    autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, '../../src/gui/index.html'));

  // 개발자 도구 열기 (F12로도 열 수 있음)
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC 핸들러들

// 경로 유틸리티
ipcMain.handle('get-dirname', (_event, filePath: string) => {
  return path.dirname(filePath);
});

ipcMain.handle('join-path', (_event, ...paths: string[]) => {
  return path.join(...paths);
});

// 파일 선택 다이얼로그 (단일)
ipcMain.handle('select-psd-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Photoshop Files', extensions: ['psd', 'psb'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// 파일 선택 다이얼로그 (다중)
ipcMain.handle('select-psd-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Photoshop Files', extensions: ['psd', 'psb'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths;
});

// 출력 폴더 선택
ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// CLI 실행 (2GB+ 파일용)
ipcMain.handle('run-cli-convert', async (_event, filePath: string, outputDir: string) => {
  try {
    // 프로젝트 루트 찾기
    const isPackaged = app.isPackaged;
    let cliPath: string;
    let projectRoot: string;

    if (isPackaged) {
      // 패키징된 앱: app.asar.unpacked에서 CLI 실행
      const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked');
      cliPath = path.join(unpackedPath, 'dist', 'cli', 'index.js');
      projectRoot = unpackedPath;
    } else {
      // 개발 모드
      projectRoot = path.join(__dirname, '..', '..');
      cliPath = path.join(projectRoot, 'dist', 'cli', 'index.js');
    }

    // 터미널에서 CLI 실행
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    let command: string;
    if (isWindows) {
      command = `start cmd /k "cd /d "${projectRoot}" && node --max-old-space-size=8192 --expose-gc "${cliPath}" convert "${filePath}" -o "${outputDir}" --stream && echo. && echo 완료! Figma에서 import 하세요. && pause"`;
    } else if (isMac) {
      // Mac: 경로를 Base64로 인코딩하여 한글 문제 방지
      const escapedProjectRoot = projectRoot.replace(/'/g, "'\\''");
      const escapedCliPath = cliPath.replace(/'/g, "'\\''");
      const escapedFilePath = filePath.replace(/'/g, "'\\''");
      const escapedOutputDir = outputDir.replace(/'/g, "'\\''");
      command = `osascript -e 'tell app "Terminal" to activate' -e 'tell app "Terminal" to do script "cd '"'"'${escapedProjectRoot}'"'"' && node --max-old-space-size=8192 --expose-gc '"'"'${escapedCliPath}'"'"' convert '"'"'${escapedFilePath}'"'"' -o '"'"'${escapedOutputDir}'"'"' --stream"'`;
    } else {
      // Linux
      command = `xterm -hold -e "cd '${projectRoot}' && node --max-old-space-size=8192 --expose-gc '${cliPath}' convert '${filePath}' -o '${outputDir}' --stream"`;
    }

    console.log('CLI 실행:', command);

    exec(command, { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        console.error('CLI 실행 오류:', error);
      }
    });

    return { success: true, message: 'CLI가 새 터미널에서 실행되었습니다.' };
  } catch (error: any) {
    console.error('CLI 실행 실패:', error);
    return { success: false, error: error.message };
  }
});

// PSD 분석
ipcMain.handle('analyze-psd', async (_event, filePath: string) => {
  try {
    sendProgress(0, '파일 분석 시작...');
    await yieldToEventLoop();

    // 파일 크기 확인
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    const fileName = path.basename(filePath, path.extname(filePath));

    console.log(`=== analyze-psd: ${fileName} (${fileSizeMB.toFixed(0)}MB) ===`);

    // 2GB 이상: CLI 필요
    const fileSizeGB = fileSizeMB / 1024;
    if (fileSizeGB >= 2) {
      console.log('초대용량 파일 - CLI 필요');
      sendProgress(100, '초대용량 파일 - CLI 사용 필요');

      return {
        success: true,
        data: {
          name: fileName,
          width: 0,
          height: 0,
          layerCount: 0,
          layers: [],
          isLargeFile: true,
          isTooLarge: true,
          fileSizeMB: Math.round(fileSizeMB),
          message: `⚠️ ${fileSizeGB.toFixed(1)}GB 파일은 CLI에서만 처리 가능합니다.`,
        },
      };
    }

    // 500MB~2GB: 스트리밍 모드
    if (fileSizeMB > 500) {
      console.log('대용량 파일 - 스트리밍 모드');
      sendProgress(100, '대용량 파일 - 스트리밍 모드로 처리');

      return {
        success: true,
        data: {
          name: fileName,
          width: 0,
          height: 0,
          layerCount: 0,
          layers: [],
          isLargeFile: true,
          fileSizeMB: Math.round(fileSizeMB),
          message: `대용량 파일 (${Math.round(fileSizeMB)}MB) - 스트리밍 모드로 처리됩니다.`,
        },
      };
    }

    // 일반 파일: 전체 분석
    const parser = new PsdParser(filePath);

    sendProgress(20, 'PSD 구조 읽는 중...');
    await yieldToEventLoop();

    const psd = await parser.parse();
    await yieldToEventLoop();

    sendProgress(80, '레이어 정보 처리 중...');
    await yieldToEventLoop();

    const result = {
      success: true,
      data: {
        name: psd.name,
        width: psd.width,
        height: psd.height,
        layerCount: countLayers(psd.layers),
        layers: stripBuffersFromLayers(psd.layers),
        guides: safeClone(psd.guides),
        grid: safeClone(psd.grid),
        slices: safeClone(psd.slices),
        resolution: safeClone(psd.resolution),
      },
    };

    sendProgress(100, '분석 완료!');
    await yieldToEventLoop();

    return result;
  } catch (error) {
    sendProgress(0, '오류 발생');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// 진행률 전송 헬퍼
function sendProgress(percent: number, message: string) {
  if (mainWindow) {
    mainWindow.webContents.send('conversion-progress', { percent, message });
  }
}

// 이벤트 루프에 제어 양보 (UI 멈춤 방지)
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

// CLI를 자식 프로세스로 실행 (대용량 파일용)
function runCliConvert(filePath: string, outputDir: string): Promise<{ success: boolean; outputDir: string; error?: string }> {
  return new Promise((resolve) => {
    // 패키징 여부 확인
    const isPackaged = app.isPackaged;

    // CLI 스크립트 경로 찾기
    let cliPath: string;
    let cwd: string;

    if (isPackaged) {
      // 패키징된 앱: app.asar.unpacked 폴더에서 실행
      const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked');
      cliPath = path.join(unpackedPath, 'dist', 'cli', 'index.js');
      cwd = unpackedPath;
    } else {
      // 개발 모드: dist/gui/main.js 기준
      const projectRoot = path.join(__dirname, '..', '..');
      cliPath = path.join(projectRoot, 'dist', 'cli', 'index.js');
      cwd = projectRoot;
    }

    // Node.js 실행 파일 경로 (Electron 내장 Node 사용)
    const nodePath = process.execPath;

    // CLI 인자 (스크립트 경로가 첫 번째)
    const args = [
      cliPath,
      'convert',
      filePath,
      '-o', outputDir,
      '--stream'
    ];

    // 환경 변수로 메모리 설정 전달
    const childEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_OPTIONS: '--max-old-space-size=8192 --expose-gc'
    };

    console.log(`Packaged: ${isPackaged}`);
    console.log(`Node path: ${nodePath}`);
    console.log(`CLI path: ${cliPath}`);
    console.log(`CLI exists: ${fs.existsSync(cliPath)}`);
    console.log(`CWD: ${cwd}`);
    console.log(`Args: ${args.join(' ')}`);
    sendProgress(5, 'CLI 프로세스 시작...');

    const child = spawn(nodePath, args, {
      cwd: cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: childEnv,
    });

    let lastProgress = 5;
    let outputData = '';
    let errorData = '';

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      outputData += text;
      console.log('[CLI]', text.trim());

      // 진행 상황 파싱
      if (text.includes('Reading:')) {
        const match = text.match(/(\d+(?:\.\d+)?)%/);
        if (match) {
          const readProgress = parseFloat(match[1]);
          lastProgress = Math.min(5 + readProgress * 0.3, 35); // 5~35%
          sendProgress(lastProgress, `파일 읽는 중... ${match[1]}%`);
        }
      } else if (text.includes('Parsing PSD')) {
        lastProgress = 40;
        sendProgress(40, 'PSD 구조 분석 중...');
      } else if (text.includes('Streamed')) {
        const match = text.match(/Streamed (\d+) images/);
        if (match) {
          lastProgress = Math.min(40 + parseInt(match[1]) * 0.1, 70);
          sendProgress(lastProgress, `이미지 스트리밍: ${match[1]}개 저장됨`);
        }
      } else if (text.includes('Converting')) {
        lastProgress = 75;
        sendProgress(75, 'Figma 형식으로 변환 중...');
      } else if (text.includes('Saving')) {
        lastProgress = 85;
        sendProgress(85, '파일 저장 중...');
      } else if (text.includes('complete')) {
        lastProgress = 95;
        sendProgress(95, '변환 완료!');
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      errorData += text;
      console.error('[CLI Error]', text.trim());
    });

    child.on('close', (code) => {
      if (code === 0) {
        // 성공 - 출력 디렉토리 찾기
        const psdFileName = path.basename(filePath, path.extname(filePath));
        const finalOutputDir = path.join(outputDir, psdFileName);
        resolve({ success: true, outputDir: finalOutputDir });
      } else {
        resolve({
          success: false,
          outputDir: '',
          error: errorData || `CLI 프로세스가 코드 ${code}로 종료됨`
        });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, outputDir: '', error: err.message });
    });
  });
}

// PSD 변환
ipcMain.handle('convert-psd', async (_event, filePath: string, outputDir: string) => {
  try {
    console.log('=== convert-psd 시작 ===');
    console.log(`파일: ${filePath}`);
    console.log(`출력: ${outputDir}`);

    sendProgress(0, '파일 확인 중...');
    await yieldToEventLoop();

    // 파일 크기 확인
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    const fileSizeGB = fileSizeMB / 1024;

    // PSD 파일명으로 출력 폴더 자동 생성
    const psdFileName = path.basename(filePath, path.extname(filePath));
    const finalOutputDir = path.join(outputDir, psdFileName);

    console.log(`파일 크기: ${fileSizeMB.toFixed(0)}MB`);

    // 2GB 이상 파일: GUI에서 처리 불가 (버퍼 할당 한계)
    if (fileSizeGB >= 2) {
      const cliCommand = `cd "${path.dirname(filePath)}" && node --max-old-space-size=8192 --expose-gc "${path.join(__dirname, '..', 'cli', 'index.js')}" convert "${filePath}" -o "${outputDir}" --stream`;

      throw new Error(
        `파일이 너무 큽니다 (${fileSizeGB.toFixed(1)}GB).\n\n` +
        `2GB 이상 파일은 CLI에서만 처리할 수 있습니다.\n\n` +
        `터미널에서 다음 명령어를 실행하세요:\n` +
        `npm start -- convert "${filePath}" -o "${outputDir}" --stream`
      );
    }

    const useLargeFileMode = fileSizeMB > 500; // 500MB~2GB: 스트리밍 모드
    console.log(`대용량 모드: ${useLargeFileMode}`);

    // 대용량 파일 (500MB~2GB): 스트리밍 모드로 처리
    if (useLargeFileMode) {
      console.log('>>> 대용량 파일 스트리밍 모드 처리 <<<');
      sendProgress(2, `대용량 파일 (${fileSizeMB.toFixed(0)}MB) - 스트리밍 모드로 처리...`);
      await yieldToEventLoop();

      try {
        // 가비지 컬렉션 실행
        if (global.gc) {
          global.gc();
          console.log('GC executed before parsing');
        }

        // 스트리밍 파서 사용
        const streamParser = new PsdParser(filePath, {
          streamImages: true,
          outputDir: finalOutputDir,
        });

        sendProgress(10, 'PSD 구조 분석 중... (대용량 파일)');
        await yieldToEventLoop();

        const psd = await streamParser.parse();
        await yieldToEventLoop();

        sendProgress(50, '레이어 변환 중...');
        await yieldToEventLoop();

        const converter = new PsdToFigmaConverter({
          outputDir: finalOutputDir,
          preserveGroups: true,
          exportImages: true,
          streamImages: true,
        });

        sendProgress(60, 'Figma 형식으로 변환 중...');
        await yieldToEventLoop();

        const result = await converter.convert(psd);
        await yieldToEventLoop();

        sendProgress(80, '파일 저장 중...');
        await yieldToEventLoop();

        // 출력 디렉토리 생성
        if (!fs.existsSync(finalOutputDir)) {
          fs.mkdirSync(finalOutputDir, { recursive: true });
        }

        // JSON 파일 저장
        const jsonPath = path.join(finalOutputDir, `${result.figmaData.name}_figma.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(result.figmaData, null, 2), 'utf-8');
        const savedFiles = [jsonPath];

        // 이미지 디렉토리
        const imagesDir = path.join(finalOutputDir, 'images');
        let imageCount = 0;
        if (fs.existsSync(imagesDir)) {
          imageCount = fs.readdirSync(imagesDir).length;
          savedFiles.push(`images/ (${imageCount}개)`);
        }

        sendProgress(100, '변환 완료!');
        await yieldToEventLoop();

        // 최종 GC
        if (global.gc) {
          global.gc();
        }

        return {
          success: true,
          data: {
            summary: {
              message: `스트리밍 모드로 변환 완료 (${fileSizeMB.toFixed(0)}MB)`,
              totalLayers: result.summary.totalLayers,
              groups: result.summary.groups,
              textLayers: result.summary.textLayers,
              imageLayers: result.summary.imageLayers,
            },
            files: savedFiles,
            jsonPath: jsonPath,
            outputDir: finalOutputDir,
          },
        };
      } catch (error: any) {
        console.error('스트리밍 변환 오류:', error);
        throw new Error(`변환 실패: ${error.message}`);
      }
    }

    // 일반 파일 (500MB 이하): 직접 처리
    sendProgress(5, '파일 읽는 중...');
    await yieldToEventLoop();

    const parser = new PsdParser(filePath);

    sendProgress(15, 'PSD 구조 분석 중...');
    await yieldToEventLoop();

    const psd = await parser.parse();
    await yieldToEventLoop();

    sendProgress(30, '레이어 변환 중...');
    await yieldToEventLoop();

    const converter = new PsdToFigmaConverter({
      outputDir: finalOutputDir,
      preserveGroups: true,
      exportImages: true,
    });

    sendProgress(40, 'Figma 형식으로 변환 중...');
    await yieldToEventLoop();

    const result = await converter.convert(psd);
    await yieldToEventLoop();

    sendProgress(60, '파일 저장 중...');
    await yieldToEventLoop();

    // 이미지 저장 진행률 계산
    const totalImages = result.imageFiles.size;
    let savedImages = 0;

    // 출력 디렉토리 생성
    if (!fs.existsSync(finalOutputDir)) {
      fs.mkdirSync(finalOutputDir, { recursive: true });
    }

    // JSON 파일 저장
    const jsonPath = path.join(finalOutputDir, `${result.figmaData.name}_figma.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result.figmaData, null, 2), 'utf-8');
    const savedFiles = [jsonPath];

    sendProgress(70, '이미지 저장 중...');
    await yieldToEventLoop();

    // 이미지 디렉토리 생성
    const imagesDir = path.join(finalOutputDir, 'images');
    if (totalImages > 0 && !fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // 이미지 파일 저장 (진행률 포함, 10개마다 UI 업데이트)
    let batchCount = 0;
    for (const [fileName, buffer] of result.imageFiles) {
      const imagePath = path.join(imagesDir, fileName);
      fs.writeFileSync(imagePath, buffer);
      savedFiles.push(imagePath);
      savedImages++;
      batchCount++;

      // 10개마다 또는 마지막에 UI 업데이트
      if (batchCount >= 10 || savedImages === totalImages) {
        const imageProgress = 70 + Math.round((savedImages / totalImages) * 25);
        sendProgress(imageProgress, `이미지 저장 중... (${savedImages}/${totalImages})`);
        await yieldToEventLoop();
        batchCount = 0;
      }
    }

    sendProgress(100, '완료!');
    await yieldToEventLoop();

    return {
      success: true,
      data: {
        summary: result.summary,
        files: savedFiles,
        jsonPath: savedFiles.find((f) => f.endsWith('.json')),
        outputDir: finalOutputDir,
      },
    };
  } catch (error) {
    sendProgress(0, '오류 발생');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// 폴더 열기
ipcMain.handle('open-folder', async (_event, folderPath: string) => {
  const { shell } = require('electron');
  shell.openPath(folderPath);
});

// 배치 변환
ipcMain.handle('convert-psd-batch', async (_event, filePaths: string[], outputDir: string) => {
  const results: any[] = [];
  const totalFiles = filePaths.length;

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const fileName = path.basename(filePath);

    try {
      sendProgress(0, `[${i + 1}/${totalFiles}] ${fileName} 처리 중...`);

      const parser = new PsdParser(filePath);
      const psd = await parser.parse();

      const psdFileName = path.basename(filePath, path.extname(filePath));
      const finalOutputDir = path.join(outputDir, psdFileName);

      const converter = new PsdToFigmaConverter({
        outputDir: finalOutputDir,
        preserveGroups: true,
        exportImages: true,
      });

      const result = await converter.convert(psd);

      // 출력 디렉토리 생성
      if (!fs.existsSync(finalOutputDir)) {
        fs.mkdirSync(finalOutputDir, { recursive: true });
      }

      // JSON 저장
      const jsonPath = path.join(finalOutputDir, `${result.figmaData.name}_figma.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(result.figmaData, null, 2), 'utf-8');

      // 이미지 저장
      const imagesDir = path.join(finalOutputDir, 'images');
      if (result.imageFiles.size > 0 && !fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      for (const [imgFileName, buffer] of result.imageFiles) {
        fs.writeFileSync(path.join(imagesDir, imgFileName), buffer);
      }

      results.push({
        file: fileName,
        success: true,
        summary: result.summary,
        outputDir: finalOutputDir,
      });

      const overallProgress = Math.round(((i + 1) / totalFiles) * 100);
      sendProgress(overallProgress, `[${i + 1}/${totalFiles}] ${fileName} 완료!`);
    } catch (error) {
      results.push({
        file: fileName,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  sendProgress(100, `${totalFiles}개 파일 변환 완료!`);

  return {
    success: true,
    results,
    outputDir,
  };
});

function countLayers(layers: any[]): number {
  let count = 0;
  for (const layer of layers) {
    count++;
    if (layer.children) {
      count += countLayers(layer.children);
    }
  }
  return count;
}

// 객체를 JSON 직렬화 가능하게 깊은 복사
function safeClone(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Buffer.isBuffer(obj)) return undefined;
  if (typeof obj === 'function') return undefined;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => safeClone(item)).filter(item => item !== undefined);
  }

  const result: any = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    // Buffer나 canvas 객체 제외
    if (Buffer.isBuffer(value) || key === 'canvas' || key === 'imageData') {
      continue;
    }
    const cloned = safeClone(value);
    if (cloned !== undefined) {
      result[key] = cloned;
    }
  }
  return result;
}

// Buffer 데이터를 제거하여 IPC 직렬화 가능하게 만듦
function stripBuffersFromLayers(layers: any[]): any[] {
  return layers.map(layer => {
    const cleanLayer: any = {
      name: layer.name,
      type: layer.type,
      visible: layer.visible,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      bounds: safeClone(layer.bounds),
    };

    // 텍스트 데이터
    if (layer.textData) {
      cleanLayer.textData = safeClone(layer.textData);
    }

    // 효과
    if (layer.effects) {
      cleanLayer.effects = safeClone(layer.effects);
    }

    // 조정 레이어
    if (layer.adjustmentType) {
      cleanLayer.adjustmentType = layer.adjustmentType;
      cleanLayer.adjustmentData = safeClone(layer.adjustmentData);
    }

    // 클리핑
    if (layer.clipping) {
      cleanLayer.clipping = true;
    }

    // 마스크 (imageData 제외)
    if (layer.mask) {
      cleanLayer.mask = {
        enabled: layer.mask.enabled,
        bounds: safeClone(layer.mask.bounds),
        defaultColor: layer.mask.defaultColor,
        hasImageData: !!layer.mask.imageData,
      };
    }

    // 벡터 마스크
    if (layer.vectorMask) {
      cleanLayer.vectorMask = {
        enabled: layer.vectorMask.enabled,
        hasPaths: !!(layer.vectorMask.paths && layer.vectorMask.paths.length > 0),
      };
    }

    // 벡터 스트로크
    if (layer.vectorStroke) {
      cleanLayer.vectorStroke = safeClone(layer.vectorStroke);
    }

    // 벡터 채우기
    if (layer.vectorFill) {
      cleanLayer.vectorFill = safeClone(layer.vectorFill);
    }

    // 배치된 레이어
    if (layer.placedLayer) {
      cleanLayer.placedLayer = safeClone(layer.placedLayer);
    }

    // 스마트 필터
    if (layer.smartFilters) {
      cleanLayer.smartFilters = safeClone(layer.smartFilters);
    }

    // 이미지 데이터 유무만 표시
    cleanLayer.hasImageData = !!layer.imageData;

    // 자식 레이어 재귀 처리
    if (layer.children) {
      cleanLayer.children = stripBuffersFromLayers(layer.children);
    }

    return cleanLayer;
  });
}
