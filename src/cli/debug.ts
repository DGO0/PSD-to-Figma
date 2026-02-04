#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { readPsd } from 'ag-psd';
import { PsdParser } from '../parser/psdParser';

// PSD 파일 상세 분석
async function analyzePsdDetailed(filePath: string) {
  console.log('\n========================================');
  console.log('  PSD 상세 분석 도구');
  console.log('========================================\n');

  const buffer = fs.readFileSync(filePath);
  const psd = readPsd(buffer, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });

  console.log('📄 파일 정보');
  console.log('─'.repeat(40));
  console.log(`  파일: ${path.basename(filePath)}`);
  console.log(`  크기: ${psd.width} x ${psd.height}px`);
  console.log(`  비트 깊이: ${psd.bitsPerChannel}`);
  console.log(`  채널 수: ${psd.channels}`);
  console.log(`  색상 모드: ${getColorMode(psd.colorMode ?? 3)}`);

  if ((psd as any).resolution) {
    const res = (psd as any).resolution;
    console.log(`  해상도: ${res.horizontalResolution || res.horizontal} PPI`);
  }

  // 폰트 수집
  const fonts = new Set<string>();
  const fontDetails: any[] = [];
  const effects: any[] = [];
  const colors: any[] = [];
  const blendModes = new Set<string>();

  function analyzeLayer(layer: any, depth: number = 0) {
    // 블렌드 모드
    if (layer.blendMode) {
      blendModes.add(layer.blendMode);
    }

    // 텍스트 레이어 분석
    if (layer.text) {
      const textInfo = layer.text;
      const style = textInfo.style || {};

      let fontName = 'Unknown';
      let fontStyle = 'Regular';
      let fontSize = style.fontSize;

      // style.font에서 폰트 정보 추출
      if (style.font) {
        fontName = style.font.name || 'Unknown';
        if (fontName.includes('-')) {
          const parts = fontName.split('-');
          fontName = parts[0];
          fontStyle = parts.slice(1).join('-');
        }
      }

      // styleRuns에서 추가 폰트 정보 추출
      if (textInfo.styleRuns && textInfo.styleRuns.length > 0) {
        const firstRun = textInfo.styleRuns[0];
        if (firstRun.style) {
          if (firstRun.style.font && fontName === 'Unknown') {
            fontName = firstRun.style.font.name || 'Unknown';
            if (fontName.includes('-')) {
              const parts = fontName.split('-');
              fontName = parts[0];
              fontStyle = parts.slice(1).join('-');
            }
          }
          if (!fontSize && firstRun.style.fontSize) {
            fontSize = firstRun.style.fontSize;
          }
        }
      }

      // paragraphStyleRuns에서 추가 정보 추출
      if (textInfo.paragraphStyleRuns && textInfo.paragraphStyleRuns.length > 0) {
        const firstPara = textInfo.paragraphStyleRuns[0];
        if (firstPara.style && firstPara.style.defaultStyle) {
          const ds = firstPara.style.defaultStyle;
          if (ds.font && fontName === 'Unknown') {
            fontName = ds.font.name || 'Unknown';
          }
          if (!fontSize && ds.fontSize) {
            fontSize = ds.fontSize;
          }
        }
      }

      fonts.add(`${fontName} (${fontStyle})`);

      fontDetails.push({
        layer: layer.name,
        text: textInfo.text?.substring(0, 30) + (textInfo.text?.length > 30 ? '...' : ''),
        font: fontName,
        style: fontStyle,
        size: fontSize,
        color: style.fillColor ? formatColor(style.fillColor) : 'N/A',
        tracking: style.tracking,
        leading: style.leading,
        // 디버그용 raw 데이터
        rawFont: style.font,
        hasStyleRuns: !!textInfo.styleRuns,
        styleRunCount: textInfo.styleRuns?.length || 0,
      });

      // 텍스트 색상
      if (style.fillColor) {
        colors.push({
          layer: layer.name,
          type: 'text',
          color: style.fillColor,
        });
      }
    }

    // 효과 분석
    if (layer.effects) {
      const layerEffects: string[] = [];
      const effectData: any = { layer: layer.name, effects: {} };

      if (layer.effects.dropShadow) {
        layerEffects.push('Drop Shadow');
        effectData.effects.dropShadow = {
          color: formatColor(layer.effects.dropShadow.color),
          opacity: layer.effects.dropShadow.opacity,
          angle: layer.effects.dropShadow.angle,
          distance: layer.effects.dropShadow.distance,
          blur: layer.effects.dropShadow.blur,
        };
      }
      if (layer.effects.innerShadow) {
        layerEffects.push('Inner Shadow');
        effectData.effects.innerShadow = layer.effects.innerShadow;
      }
      if (layer.effects.outerGlow) {
        layerEffects.push('Outer Glow');
        effectData.effects.outerGlow = layer.effects.outerGlow;
      }
      if (layer.effects.innerGlow) {
        layerEffects.push('Inner Glow');
        effectData.effects.innerGlow = layer.effects.innerGlow;
      }
      if (layer.effects.bevel) {
        layerEffects.push('Bevel & Emboss');
        effectData.effects.bevel = layer.effects.bevel;
      }
      if (layer.effects.stroke) {
        layerEffects.push('Stroke');
        effectData.effects.stroke = {
          color: formatColor(layer.effects.stroke.color),
          size: layer.effects.stroke.size,
          position: layer.effects.stroke.position,
        };
      }
      if (layer.effects.solidFill) {
        layerEffects.push('Color Overlay');
        effectData.effects.solidFill = {
          color: formatColor(layer.effects.solidFill.color),
          opacity: layer.effects.solidFill.opacity,
          blendMode: layer.effects.solidFill.blendMode,
        };
      }
      if (layer.effects.gradientOverlay) {
        layerEffects.push('Gradient Overlay');
        effectData.effects.gradientOverlay = layer.effects.gradientOverlay;
      }
      if (layer.effects.satin) {
        layerEffects.push('Satin');
        effectData.effects.satin = layer.effects.satin;
      }
      if (layer.effects.patternOverlay) {
        layerEffects.push('Pattern Overlay');
        effectData.effects.patternOverlay = layer.effects.patternOverlay;
      }

      if (layerEffects.length > 0) {
        effects.push(effectData);
      }
    }

    // 자식 레이어
    if (layer.children) {
      layer.children.forEach((child: any) => analyzeLayer(child, depth + 1));
    }
  }

  // 분석 실행
  if (psd.children) {
    psd.children.forEach((layer: any) => analyzeLayer(layer));
  }

  // 폰트 정보 출력
  console.log('\n\n🔤 사용된 폰트');
  console.log('─'.repeat(40));
  fonts.forEach(font => console.log(`  • ${font}`));

  // 폰트 상세 정보
  console.log('\n\n📝 텍스트 레이어 상세');
  console.log('─'.repeat(40));
  fontDetails.forEach((fd, i) => {
    console.log(`\n[${i + 1}] ${fd.layer}`);
    console.log(`    텍스트: "${fd.text}"`);
    console.log(`    폰트: ${fd.font} ${fd.style}`);
    console.log(`    크기: ${fd.size}px`);
    console.log(`    색상: ${fd.color}`);
    if (fd.tracking) console.log(`    자간: ${fd.tracking}`);
    if (fd.leading) console.log(`    행간: ${fd.leading}`);
  });

  // 효과 정보
  if (effects.length > 0) {
    console.log('\n\n✨ 레이어 효과');
    console.log('─'.repeat(40));
    effects.forEach((e, i) => {
      console.log(`\n[${i + 1}] ${e.layer}`);
      Object.keys(e.effects).forEach(effectName => {
        console.log(`    ${effectName}:`, JSON.stringify(e.effects[effectName], null, 2).replace(/\n/g, '\n    '));
      });
    });
  }

  // 블렌드 모드
  console.log('\n\n🎨 사용된 블렌드 모드');
  console.log('─'.repeat(40));
  blendModes.forEach(mode => console.log(`  • ${mode}`));

  // 전역 기능
  console.log('\n\n🌐 전역 기능');
  console.log('─'.repeat(40));

  if ((psd as any).guides && (psd as any).guides.length > 0) {
    console.log(`  안내선: ${(psd as any).guides.length}개`);
    (psd as any).guides.forEach((g: any, i: number) => {
      console.log(`    ${i + 1}. ${g.direction} at ${g.location}px`);
    });
  } else {
    console.log('  안내선: 없음');
  }

  if ((psd as any).slices && (psd as any).slices.length > 0) {
    console.log(`  슬라이스: ${(psd as any).slices.length}개`);
  } else {
    console.log('  슬라이스: 없음');
  }

  // JSON으로 저장
  const outputPath = filePath.replace(/\.(psd|psb)$/i, '_analysis.json');
  const analysisData = {
    file: path.basename(filePath),
    dimensions: { width: psd.width, height: psd.height },
    fonts: Array.from(fonts),
    fontDetails,
    effects,
    blendModes: Array.from(blendModes),
  };
  fs.writeFileSync(outputPath, JSON.stringify(analysisData, null, 2), 'utf-8');
  console.log(`\n\n📁 분석 결과 저장: ${outputPath}`);

  // Figma JSON과 비교 (있다면)
  const baseName = path.basename(filePath).replace(/\.(psd|psb)$/i, '');
  const figmaJsonPath = filePath.replace(/\.(psd|psb)$/i, '_figma.json');

  let figmaData = null;
  let foundFigmaPath = '';

  // 1. 같은 폴더에서 찾기
  if (fs.existsSync(figmaJsonPath)) {
    foundFigmaPath = figmaJsonPath;
  } else {
    // 2. output 폴더에서 찾기
    const outputDir = path.join(path.dirname(filePath), 'output');
    if (fs.existsSync(outputDir)) {
      // output 폴더 직접
      const directPath = path.join(outputDir, `${baseName}_figma.json`);
      if (fs.existsSync(directPath)) {
        foundFigmaPath = directPath;
      } else {
        // output/[이름] 서브폴더
        const subDir = path.join(outputDir, baseName);
        if (fs.existsSync(subDir)) {
          const subPath = path.join(subDir, `${baseName}_figma.json`);
          if (fs.existsSync(subPath)) {
            foundFigmaPath = subPath;
          }
        }
      }
    }
  }

  if (foundFigmaPath) {
    console.log('\n\n🔍 Figma 출력과 비교');
    console.log('─'.repeat(40));
    console.log(`  Figma JSON: ${path.basename(foundFigmaPath)}`);
    try {
      figmaData = JSON.parse(fs.readFileSync(foundFigmaPath, 'utf-8'));
      comparePsdWithFigma(analysisData, figmaData);
    } catch (e) {
      console.log('  Figma JSON 파싱 오류');
    }
  } else {
    console.log('\n\n📝 Figma JSON을 찾을 수 없습니다.');
    console.log('   먼저 GUI 또는 CLI로 변환을 실행하세요.');
  }

  console.log('\n========================================\n');
}

function getColorMode(mode: number): string {
  const modes: Record<number, string> = {
    0: 'Bitmap',
    1: 'Grayscale',
    2: 'Indexed',
    3: 'RGB',
    4: 'CMYK',
    7: 'Multichannel',
    8: 'Duotone',
    9: 'Lab',
  };
  return modes[mode] || `Unknown (${mode})`;
}

function formatColor(color: any): string {
  if (!color) return 'N/A';
  if (color.r !== undefined) {
    return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
  }
  return JSON.stringify(color);
}

// PSD와 Figma 출력 비교
function comparePsdWithFigma(psdAnalysis: any, figmaData: any) {
  const figmaFonts = new Set<string>();
  const figmaTexts: any[] = [];

  function extractFigmaText(node: any) {
    if (node.type === 'TEXT') {
      const style = node.textStyle || {};
      figmaTexts.push({
        name: node.name,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontStyle: style.fontStyle,
        text: (node.text || node.characters || '').substring(0, 30),
      });
      figmaFonts.add(`${style.fontFamily || 'Unknown'} (${style.fontStyle || 'Regular'})`);
    }
    if (node.children) {
      node.children.forEach(extractFigmaText);
    }
  }

  if (figmaData.nodes) {
    figmaData.nodes.forEach(extractFigmaText);
  }

  // 폰트 비교
  console.log('\n  📌 폰트 차이:');
  const psdFonts = new Set<string>(psdAnalysis.fonts as string[]);
  const missingInFigma = [...psdFonts].filter((f: string) => !figmaFonts.has(f));
  const extraInFigma = [...figmaFonts].filter((f: string) => !psdFonts.has(f));

  if (missingInFigma.length > 0) {
    console.log('    PSD에만 있는 폰트:');
    missingInFigma.forEach(f => console.log(`      - ${f}`));
  }
  if (extraInFigma.length > 0) {
    console.log('    Figma에만 있는 폰트:');
    extraInFigma.forEach(f => console.log(`      - ${f}`));
  }
  if (missingInFigma.length === 0 && extraInFigma.length === 0) {
    console.log('    ✓ 폰트 일치');
  }

  // 텍스트 레이어 수 비교
  console.log(`\n  📌 텍스트 레이어 수:`);
  console.log(`    PSD: ${psdAnalysis.fontDetails.length}개`);
  console.log(`    Figma: ${figmaTexts.length}개`);

  // 상세 텍스트 비교 (이름으로 매칭)
  console.log('\n  📌 텍스트 상세 비교:');
  let matchCount = 0;
  let mismatchCount = 0;

  for (const psdText of psdAnalysis.fontDetails) {
    const figmaMatch = figmaTexts.find((ft: any) =>
      ft.name === psdText.layer ||
      (ft.text && psdText.text && ft.text.includes(psdText.text.substring(0, 10)))
    );

    if (figmaMatch) {
      const psdFontFull = `${psdText.font || ''} ${psdText.style || ''}`.trim();
      const figmaFontFull = `${figmaMatch.fontFamily || ''} ${figmaMatch.fontStyle || ''}`.trim();

      const fontMatch = psdFontFull.toLowerCase() === figmaFontFull.toLowerCase() ||
        (figmaMatch.fontFamily && psdText.font && figmaMatch.fontFamily.includes(psdText.font)) ||
        (psdText.font && figmaMatch.fontFamily && psdText.font.includes(figmaMatch.fontFamily));

      const psdSize = psdText.size || 0;
      const figmaSize = figmaMatch.fontSize || 0;
      const sizeMatch = Math.abs(psdSize - figmaSize) < 1;

      if (!fontMatch || !sizeMatch) {
        mismatchCount++;
        console.log(`\n    ❌ "${psdText.layer}":`);
        if (!fontMatch) {
          console.log(`       폰트: PSD="${psdFontFull}" → Figma="${figmaFontFull}"`);
        }
        if (!sizeMatch) {
          console.log(`       크기: PSD=${psdSize.toFixed(2)}px → Figma=${figmaSize.toFixed(2)}px`);
        }
      } else {
        matchCount++;
      }
    } else {
      mismatchCount++;
      console.log(`\n    ⚠️ "${psdText.layer}": Figma에서 매칭되는 텍스트 없음`);
    }
  }

  console.log(`\n    결과: ${matchCount}개 일치, ${mismatchCount}개 불일치`);
}

// 디렉토리에서 PSD/PSB 파일 찾기
function findPsdFiles(dirPath: string): string[] {
  const files = fs.readdirSync(dirPath);
  return files
    .filter(f => /\.(psd|psb)$/i.test(f))
    .map(f => path.join(dirPath, f));
}

// 실행
async function main() {
  const arg = process.argv[2];
  const indexArg = process.argv[3]; // 파일 인덱스 (선택)

  if (!arg) {
    console.log('Usage: npx ts-node src/cli/debug.ts <psd-file or directory> [index]');
    console.log('       node dist/cli/debug.js <psd-file or directory> [index]');
    console.log('\n디렉토리를 지정하면 PSD/PSB 파일 목록을 보여줍니다.');
    console.log('인덱스를 지정하면 해당 파일을 분석합니다 (1부터 시작).');
    process.exit(1);
  }

  let filePath = arg;

  // 디렉토리인 경우
  if (fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
    const psdFiles = findPsdFiles(arg);
    if (psdFiles.length === 0) {
      console.error(`No PSD/PSB files found in: ${arg}`);
      process.exit(1);
    }
    console.log(`📂 발견된 파일들:`);
    psdFiles.forEach((f, i) => console.log(`  ${i + 1}. ${path.basename(f)}`));

    // 인덱스가 지정된 경우 해당 파일 선택
    if (indexArg) {
      const idx = parseInt(indexArg, 10) - 1;
      if (idx >= 0 && idx < psdFiles.length) {
        console.log(`\n파일 ${idx + 1} 분석 중...`);
        filePath = psdFiles[idx];
      } else {
        console.error(`\n유효하지 않은 인덱스: ${indexArg} (1-${psdFiles.length} 범위)`);
        process.exit(1);
      }
    } else {
      console.log(`\n첫 번째 파일 분석 중...`);
      filePath = psdFiles[0];
    }
  } else if (!fs.existsSync(arg)) {
    // 경로를 분해해서 디렉토리에서 찾기 시도
    const dir = path.dirname(arg);
    const filename = path.basename(arg);

    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      // 파일명이 포함된 파일 찾기
      const match = files.find(f => f.includes(filename.replace(/\.(psd|psb)$/i, '')));
      if (match) {
        filePath = path.join(dir, match);
      } else {
        console.error(`File not found: ${arg}`);
        process.exit(1);
      }
    } else {
      console.error(`File not found: ${arg}`);
      process.exit(1);
    }
  }

  await analyzePsdDetailed(filePath);
}

main().catch(console.error);
