import { readPsd, Layer, initializeCanvas } from 'ag-psd';
import * as fs from 'fs';
import * as path from 'path';
import { createCanvas } from 'canvas';
import {
  PsdLayerInfo, ParsedPsd, TextLayerData, RGBAColor, LayerEffects,
  ShadowEffect, GlowEffect, StrokeEffect, BevelEmbossEffect, GaussianBlurEffect,
  AdjustmentType, AdjustmentData, SmartFilter, SmartFilterType,
  SolidFillEffect, GradientOverlayEffect, SatinEffect, GradientStop,
  Guide, GridInfo, Slice, ResolutionInfo,
  LayerMask, VectorMask, VectorStroke, VectorFill, PlacedLayerInfo,
  TextStyleRun, TextTransform
} from '../types';

// Canvas 초기화 (ag-psd에서 이미지 처리를 위해 필요)
initializeCanvas(createCanvas as any);

export interface ParserOptions {
  outputDir?: string;        // 이미지를 즉시 저장할 디렉토리
  streamImages?: boolean;    // 이미지를 즉시 파일로 쓰고 메모리 해제
}

export class PsdParser {
  private filePath: string;
  private patterns: Map<string, Buffer> = new Map();
  private options: ParserOptions;
  private imagesDir: string = '';
  private imageCounter: number = 0;
  private streamedImageCount: number = 0;

  constructor(filePath: string, options?: ParserOptions) {
    this.filePath = filePath;
    this.options = options || {};

    // 스트리밍 모드일 때 이미지 디렉토리 설정
    if (this.options.streamImages && this.options.outputDir) {
      this.imagesDir = path.join(this.options.outputDir, 'images');
      if (!fs.existsSync(this.imagesDir)) {
        fs.mkdirSync(this.imagesDir, { recursive: true });
      }
      console.log(`  Streaming images to: ${this.imagesDir}`);
    }
  }

  async parse(): Promise<ParsedPsd> {
    // 파일 크기 확인
    const stats = fs.statSync(this.filePath);
    const fileSizeGB = stats.size / (1024 * 1024 * 1024);

    console.log(`  File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

    let buffer: Buffer;

    if (stats.size > 500 * 1024 * 1024) {
      // 500MB 이상: 청크 단위로 읽기
      console.log('  Large file detected, reading in chunks...');
      buffer = await this.readLargeFile(this.filePath, stats.size);
    } else {
      // 일반 파일
      console.log('  Reading file...');
      buffer = fs.readFileSync(this.filePath);
    }

    console.log('  Parsing PSD structure...');
    const psd = readPsd(buffer, {
      skipLayerImageData: false,
      skipCompositeImageData: true,
      skipThumbnail: true,
    });

    // 패턴 추출 및 저장
    this.extractPatterns(psd);

    const fileName = path.basename(this.filePath, path.extname(this.filePath));

    const result: ParsedPsd = {
      width: psd.width,
      height: psd.height,
      name: fileName,
      layers: this.parseLayers(psd.children || []),
    };

    // 안내선 추출
    if ((psd as any).guides && (psd as any).guides.length > 0) {
      result.guides = this.parseGuides((psd as any).guides);
      console.log(`  Found ${result.guides.length} guides`);
    }

    // 그리드 추출
    if ((psd as any).grid) {
      result.grid = this.parseGrid((psd as any).grid);
      console.log('  Found grid settings');
    }

    // 슬라이스 추출
    if ((psd as any).slices && (psd as any).slices.length > 0) {
      result.slices = this.parseSlices((psd as any).slices);
      console.log(`  Found ${result.slices.length} slices`);
    }

    // 해상도 추출
    if ((psd as any).resolution) {
      result.resolution = this.parseResolution((psd as any).resolution);
      console.log(`  Resolution: ${result.resolution.horizontal} ${result.resolution.horizontalUnit}`);
    }

    // 스트리밍 통계 출력
    if (this.options.streamImages && this.streamedImageCount > 0) {
      console.log(`  Streamed ${this.streamedImageCount} images to disk during parsing`);
      // 최종 가비지 컬렉션
      if (global.gc) {
        console.log('  Running final garbage collection...');
        global.gc();
      }
    }

    return result;
  }

  // 대용량 파일을 청크 단위로 읽기 (2GB+ 지원)
  private async readLargeFile(filePath: string, fileSize: number): Promise<Buffer> {
    const fileSizeGB = (fileSize / (1024 * 1024 * 1024)).toFixed(2);
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(0);

    // 메모리 사용량 체크
    const usedMemory = process.memoryUsage();
    const heapTotal = usedMemory.heapTotal / (1024 * 1024);
    const heapUsed = usedMemory.heapUsed / (1024 * 1024);
    console.log(`  Current memory: ${heapUsed.toFixed(0)}MB used / ${heapTotal.toFixed(0)}MB total`);

    // 파일 크기에 맞는 버퍼를 미리 할당
    let buffer: Buffer;
    try {
      console.log(`  Allocating buffer for ${fileSizeMB}MB file...`);

      // 강제 가비지 컬렉션 시도
      if (global.gc) {
        console.log('  Running garbage collection...');
        global.gc();
      }

      buffer = Buffer.allocUnsafe(fileSize);
      console.log('  Buffer allocated successfully');
    } catch (err: any) {
      const errorMsg = `메모리 할당 실패 (${fileSizeGB}GB 필요).\n\n` +
        `해결 방법:\n` +
        `1. 크롬, VSCode 등 다른 프로그램을 모두 종료하세요\n` +
        `2. 컴퓨터를 재시작한 후 다시 시도하세요\n` +
        `3. 포토샵에서 파일을 여러 개로 나눠서 저장하세요\n\n` +
        `기술 정보: ${err.message}`;
      throw new Error(errorMsg);
    }

    return new Promise((resolve, reject) => {
      let offset = 0;
      const chunkSize = 64 * 1024 * 1024; // 64MB 청크

      const stream = fs.createReadStream(filePath, {
        highWaterMark: chunkSize
      });

      stream.on('data', (chunk: Buffer) => {
        chunk.copy(buffer, offset);
        offset += chunk.length;
        const progress = ((offset / fileSize) * 100).toFixed(1);
        const readMB = (offset / (1024 * 1024)).toFixed(0);
        process.stdout.write(`\r  Reading: ${readMB}MB / ${fileSizeMB}MB (${progress}%)`);
      });

      stream.on('end', () => {
        console.log('\n  File read complete!');
        resolve(buffer);
      });

      stream.on('error', (err) => {
        reject(new Error(`파일 읽기 실패: ${err.message}`));
      });
    });
  }

  // 패턴 추출 및 저장
  private extractPatterns(psd: any): void {
    // ag-psd는 patterns를 globalResources 또는 직접 속성으로 제공할 수 있음
    const patterns = (psd as any).patterns || (psd as any).globalResources?.patterns;
    if (patterns && Array.isArray(patterns)) {
      for (const pattern of patterns) {
        if (pattern.id && pattern.canvas) {
          try {
            const canvas = pattern.canvas as any;
            if (canvas.toBuffer) {
              const buffer = canvas.toBuffer('image/png');
              this.patterns.set(pattern.id, buffer);
            }
          } catch (e) {
            // 패턴 추출 실패
          }
        }
      }
      if (this.patterns.size > 0) {
        console.log(`  Found ${this.patterns.size} patterns`);
      }
    }
  }

  // 패턴 ID로 이미지 데이터 가져오기
  private getPatternData(patternId: string): Buffer | undefined {
    return this.patterns.get(patternId);
  }

  private parseLayers(layers: Layer[]): PsdLayerInfo[] {
    return layers.map((layer) => this.parseLayer(layer)).filter((l): l is PsdLayerInfo => l !== null);
  }

  private parseLayer(layer: Layer): PsdLayerInfo | null {
    const bounds = {
      top: layer.top || 0,
      left: layer.left || 0,
      right: layer.right || 0,
      bottom: layer.bottom || 0,
      width: (layer.right || 0) - (layer.left || 0),
      height: (layer.bottom || 0) - (layer.top || 0),
    };

    // opacity 처리: ag-psd는 0-1 범위 또는 0-255 범위일 수 있음
    let opacity = layer.opacity ?? 1;
    if (opacity > 1) {
      opacity = opacity / 255;
    }
    // 기본값이 너무 낮으면 1로 설정
    if (opacity < 0.01) {
      opacity = 1;
    }

    const baseInfo: PsdLayerInfo = {
      name: layer.name || 'Unnamed Layer',
      type: this.getLayerType(layer),
      visible: (layer as any).hidden !== true, // PSD 레이어 실제 visibility 사용
      opacity: opacity,
      blendMode: layer.blendMode || 'normal',
      bounds,
    };

    // 레이어 효과 추출
    const effects = this.parseLayerEffects(layer);
    if (effects) {
      baseInfo.effects = effects;
    }

    // 스마트 필터 추출
    const smartFilters = this.parseSmartFilters(layer);
    if (smartFilters && smartFilters.length > 0) {
      baseInfo.smartFilters = smartFilters;
    }

    // 클리핑 마스크
    if ((layer as any).clipping) {
      baseInfo.clipping = true;
    }

    // 레이어 마스크
    if ((layer as any).mask) {
      baseInfo.mask = this.parseLayerMask((layer as any).mask, layer);
    }

    // 벡터 마스크
    if ((layer as any).vectorMask) {
      baseInfo.vectorMask = this.parseVectorMask((layer as any).vectorMask);
    }

    // 벡터 스트로크
    if ((layer as any).vectorStroke) {
      baseInfo.vectorStroke = this.parseVectorStroke((layer as any).vectorStroke);
    }

    // 벡터 채우기 - 여러 소스에서 확인
    if ((layer as any).vectorFill) {
      baseInfo.vectorFill = this.parseVectorFill((layer as any).vectorFill);
    } else if ((layer as any).fillColor) {
      // fillColor 속성에서 색상 추출
      baseInfo.vectorFill = {
        type: 'solid',
        color: this.parseEffectColor((layer as any).fillColor),
      };
    } else if ((layer as any).solidFill) {
      // solidFill 속성에서 색상 추출
      const sf = (layer as any).solidFill;
      baseInfo.vectorFill = {
        type: 'solid',
        color: this.parseEffectColor(sf.color || sf),
      };
    } else if ((layer as any).vectorOrigination) {
      // vectorOrigination에서 fill 정보 추출
      const vo = (layer as any).vectorOrigination;
      if (vo.fillContents || vo.fill) {
        const fill = vo.fillContents || vo.fill;
        baseInfo.vectorFill = this.parseVectorFill(fill);
      }
    }

    // 배치된 레이어 (스마트 오브젝트)
    if ((layer as any).placedLayer) {
      baseInfo.placedLayer = this.parsePlacedLayer((layer as any).placedLayer);
    }

    // 조정 레이어 처리
    if ((layer as any).adjustment) {
      baseInfo.type = 'adjustment';
      const adjData = this.parseAdjustmentLayer(layer);
      if (adjData) {
        baseInfo.adjustmentType = adjData.type;
        baseInfo.adjustmentData = adjData.data;
      }
      return baseInfo;
    }

    // 그룹(폴더) 레이어 처리
    if (layer.children && layer.children.length > 0) {
      baseInfo.type = 'group';
      baseInfo.children = this.parseLayers(layer.children);
      return baseInfo;
    }

    // 텍스트 레이어 처리
    if (layer.text) {
      baseInfo.type = 'text';
      baseInfo.textData = this.parseTextData(layer);
      return baseInfo;
    }

    // 이미지 레이어 처리
    if (layer.canvas) {
      baseInfo.type = 'layer';
      baseInfo.imageData = this.extractImageBuffer(layer);
      return baseInfo;
    }

    // 빈 레이어는 스킵
    if (bounds.width === 0 || bounds.height === 0) {
      return null;
    }

    return baseInfo;
  }

  private getLayerType(layer: Layer): PsdLayerInfo['type'] {
    if (layer.children && layer.children.length > 0) {
      return 'group';
    }
    if (layer.text) {
      return 'text';
    }
    // 조정 레이어 체크
    if ((layer as any).adjustment) {
      return 'adjustment';
    }
    if (layer.vectorMask || layer.vectorStroke) {
      return 'shape';
    }
    return 'layer';
  }

  private parseTextData(layer: Layer): TextLayerData {
    const textInfo = layer.text!;
    const style = textInfo.style || {};

    // 색상 추출
    let color: RGBAColor = { r: 0, g: 0, b: 0, a: 1 };
    if (style.fillColor) {
      const fc = style.fillColor as any;
      color = {
        r: fc.r ?? 0,
        g: fc.g ?? 0,
        b: fc.b ?? 0,
        a: fc.a ?? 1,
      };
    }

    // 폰트 정보 추출
    let fontFamily = '';
    let fontStyle = 'Regular';
    let fontSize = style.fontSize;

    // style.font에서 폰트 정보 추출
    if (style.font) {
      const font = style.font as any;
      fontFamily = font.name || '';

      // PostScript 이름에서 스타일 추출 시도
      if (font.name && font.name.includes('-')) {
        const parts = font.name.split('-');
        if (parts.length > 1) {
          fontFamily = parts[0];
          fontStyle = parts.slice(1).join('-');
        }
      }
    }

    // styleRuns에서 추가 폰트 정보 추출 (style.font가 없거나 불완전한 경우)
    const styleRuns = (textInfo as any).styleRuns;
    if (styleRuns && styleRuns.length > 0) {
      const firstRun = styleRuns[0];
      if (firstRun.style) {
        // 폰트 정보가 없으면 styleRuns에서 가져오기
        if (!fontFamily && firstRun.style.font) {
          const runFont = firstRun.style.font;
          fontFamily = runFont.name || '';
          if (fontFamily.includes('-')) {
            const parts = fontFamily.split('-');
            fontFamily = parts[0];
            fontStyle = parts.slice(1).join('-');
          }
        }
        // 폰트 크기가 없으면 styleRuns에서 가져오기
        if (!fontSize && firstRun.style.fontSize) {
          fontSize = firstRun.style.fontSize;
        }
        // 색상이 기본값이면 styleRuns에서 가져오기
        if (color.r === 0 && color.g === 0 && color.b === 0 && firstRun.style.fillColor) {
          const fc = firstRun.style.fillColor;
          color = {
            r: fc.r ?? 0,
            g: fc.g ?? 0,
            b: fc.b ?? 0,
            a: fc.a ?? 1,
          };
        }
      }
    }

    // paragraphStyleRuns에서 추가 정보 추출
    let textAlign: 'left' | 'center' | 'right' | 'justify' | undefined;
    const paragraphStyleRuns = (textInfo as any).paragraphStyleRuns;
    if (paragraphStyleRuns && paragraphStyleRuns.length > 0) {
      const firstPara = paragraphStyleRuns[0];
      if (firstPara.style) {
        // 텍스트 정렬
        if (firstPara.style.justification) {
          const justMap: Record<string, 'left' | 'center' | 'right' | 'justify'> = {
            'left': 'left',
            'center': 'center',
            'right': 'right',
            'justifyAll': 'justify',
            'justifyLeft': 'justify',
            'justifyCenter': 'justify',
            'justifyRight': 'justify',
          };
          textAlign = justMap[firstPara.style.justification] || 'left';
        }

        if (firstPara.style.defaultStyle) {
          const ds = firstPara.style.defaultStyle;
          if (!fontFamily && ds.font) {
            fontFamily = ds.font.name || '';
            if (fontFamily.includes('-')) {
              const parts = fontFamily.split('-');
              fontFamily = parts[0];
              fontStyle = parts.slice(1).join('-');
            }
          }
          if (!fontSize && ds.fontSize) {
            fontSize = ds.fontSize;
          }
        }
      }
    }

    // 텍스트 장식 추출
    let underline = false;
    let strikethrough = false;
    if (style.underline) underline = true;
    if (style.strikethrough) strikethrough = true;

    // 멀티 스타일 텍스트 추출
    let parsedStyleRuns: TextStyleRun[] | undefined;
    if (styleRuns && styleRuns.length > 1) {
      parsedStyleRuns = this.parseStyleRuns(styleRuns, textInfo.text || '');
    }

    // 텍스트 변환 추출 (회전, 기울임 등)
    let transform: TextTransform | undefined;
    if ((textInfo as any).transform) {
      transform = this.parseTextTransform((textInfo as any).transform);
    }

    // 기본값 적용
    if (!fontFamily) {
      fontFamily = 'Arial';
    }
    if (!fontSize) {
      fontSize = 16;
    }

    // 텍스트에서 Photoshop 단락 구분자(\u0003)를 줄바꿈으로 변환
    let text = textInfo.text || '';
    text = text.replace(/\u0003/g, '\n');

    return {
      text,
      fontSize,
      fontFamily,
      fontStyle,
      color,
      lineHeight: style.leading,
      letterSpacing: style.tracking ? style.tracking / 1000 : undefined,
      textAlign,
      underline: underline || undefined,
      strikethrough: strikethrough || undefined,
      styleRuns: parsedStyleRuns,
      transform,
    };
  }

  // 텍스트 변환 매트릭스 파싱
  private parseTextTransform(transform: any): TextTransform {
    // 2D 아핀 변환 매트릭스
    // 배열 형태: [xx, xy, yx, yy, tx, ty]
    // 또는 객체 형태: { xx, xy, yx, yy, tx, ty }
    let xx: number, xy: number, yx: number, yy: number, tx: number, ty: number;

    if (Array.isArray(transform)) {
      xx = transform[0] ?? 1;
      xy = transform[1] ?? 0;
      yx = transform[2] ?? 0;
      yy = transform[3] ?? 1;
      tx = transform[4] ?? 0;
      ty = transform[5] ?? 0;
    } else {
      xx = transform.xx ?? 1;
      xy = transform.xy ?? 0;
      yx = transform.yx ?? 0;
      yy = transform.yy ?? 1;
      tx = transform.tx ?? 0;
      ty = transform.ty ?? 0;
    }

    // 회전 각도 계산 (라디안 -> 도)
    // atan2(xy, xx)는 회전 각도를 반환
    const rotation = Math.atan2(xy, xx) * (180 / Math.PI);

    // 스케일 계산
    const scaleX = Math.sqrt(xx * xx + xy * xy);
    const scaleY = Math.sqrt(yx * yx + yy * yy);

    return {
      xx,
      xy,
      yx,
      yy,
      tx,
      ty,
      rotation: Math.abs(rotation) > 0.01 ? rotation : undefined,
      scaleX: Math.abs(scaleX - 1) > 0.01 ? scaleX : undefined,
      scaleY: Math.abs(scaleY - 1) > 0.01 ? scaleY : undefined,
    };
  }

  // 멀티 스타일 텍스트 런 파싱
  private parseStyleRuns(styleRuns: any[], fullText: string): TextStyleRun[] {
    const result: TextStyleRun[] = [];
    let currentPos = 0;

    for (const run of styleRuns) {
      const runLength = run.length || 0;
      // Photoshop 단락 구분자(\u0003)를 줄바꿈으로 변환
      const runText = fullText.substring(currentPos, currentPos + runLength).replace(/\u0003/g, '\n');
      currentPos += runLength;

      if (runText.length === 0) continue;

      const runStyle = run.style || {};
      let runFontFamily = '';
      let runFontStyle = 'Regular';

      if (runStyle.font) {
        runFontFamily = runStyle.font.name || '';
        if (runFontFamily.includes('-')) {
          const parts = runFontFamily.split('-');
          runFontFamily = parts[0];
          runFontStyle = parts.slice(1).join('-');
        }
      }

      let runColor: RGBAColor | undefined;
      if (runStyle.fillColor) {
        const fc = runStyle.fillColor;
        runColor = {
          r: fc.r ?? 0,
          g: fc.g ?? 0,
          b: fc.b ?? 0,
          a: fc.a ?? 1,
        };
      }

      result.push({
        text: runText,
        fontSize: runStyle.fontSize,
        fontFamily: runFontFamily || undefined,
        fontStyle: runFontStyle !== 'Regular' ? runFontStyle : undefined,
        color: runColor,
        letterSpacing: runStyle.tracking ? runStyle.tracking / 1000 : undefined,
        underline: runStyle.underline || undefined,
        strikethrough: runStyle.strikethrough || undefined,
      });
    }

    return result;
  }

  private extractImageBuffer(layer: Layer): Buffer | undefined {
    if (!layer.canvas) {
      return undefined;
    }

    try {
      // ag-psd의 canvas는 HTMLCanvasElement 형태
      // Node.js 환경에서는 Buffer로 변환
      const canvas = layer.canvas as any;
      if (canvas.toBuffer) {
        const buffer = canvas.toBuffer('image/png');

        // 스트리밍 모드: 즉시 파일로 쓰고 메모리 해제
        if (this.options.streamImages && this.imagesDir) {
          const fileName = `layer_${this.imageCounter++}.png`;
          const imagePath = path.join(this.imagesDir, fileName);
          fs.writeFileSync(imagePath, buffer);
          this.streamedImageCount++;

          // 주기적으로 진행상황 출력 및 가비지 컬렉션
          if (this.streamedImageCount % 50 === 0) {
            console.log(`    Streamed ${this.streamedImageCount} images to disk`);
            if (global.gc) {
              global.gc();
            }
          }

          // canvas 참조 해제하여 메모리 확보
          (layer as any).canvas = null;

          // 파일 경로를 특별한 마커와 함께 반환 (나중에 converter에서 처리)
          return Buffer.from(`__STREAMED__:${fileName}`);
        }

        return buffer;
      }
      return undefined;
    } catch (error) {
      console.warn(`Failed to extract image from layer: ${layer.name}`);
      return undefined;
    }
  }

  // 레이어 효과 추출
  private parseLayerEffects(layer: Layer): LayerEffects | undefined {
    const effects = (layer as any).effects;
    if (!effects) return undefined;

    const result: LayerEffects = {};
    let hasEffects = false;

    // 드롭 쉐도우 (다중 지원)
    if (effects.dropShadow) {
      const shadows = Array.isArray(effects.dropShadow) ? effects.dropShadow : [effects.dropShadow];
      const parsedShadows = shadows
        .filter((ds: any) => ds && ds.enabled !== false)
        .map((ds: any) => ({
          enabled: true,
          color: this.parseEffectColor(ds.color),
          opacity: (ds.opacity ?? 100) / 100,
          angle: ds.angle ?? 120,
          distance: ds.distance ?? 5,
          blur: ds.blur ?? 5,
          spread: ds.spread ?? 0,
        }));
      if (parsedShadows.length === 1) {
        result.dropShadow = parsedShadows[0];
      } else if (parsedShadows.length > 1) {
        result.dropShadow = parsedShadows;
      }
      if (parsedShadows.length > 0) hasEffects = true;
    }

    // 이너 쉐도우 (다중 지원)
    if (effects.innerShadow) {
      const shadows = Array.isArray(effects.innerShadow) ? effects.innerShadow : [effects.innerShadow];
      const parsedShadows = shadows
        .filter((is: any) => is && is.enabled !== false)
        .map((is: any) => ({
          enabled: true,
          color: this.parseEffectColor(is.color),
          opacity: (is.opacity ?? 100) / 100,
          angle: is.angle ?? 120,
          distance: is.distance ?? 5,
          blur: is.blur ?? 5,
          spread: is.spread ?? 0,
        }));
      if (parsedShadows.length === 1) {
        result.innerShadow = parsedShadows[0];
      } else if (parsedShadows.length > 1) {
        result.innerShadow = parsedShadows;
      }
      if (parsedShadows.length > 0) hasEffects = true;
    }

    // 아우터 글로우
    if (effects.outerGlow && effects.outerGlow.enabled !== false) {
      const og = effects.outerGlow;
      result.outerGlow = {
        enabled: true,
        color: this.parseEffectColor(og.color),
        opacity: (og.opacity ?? 100) / 100,
        blur: og.blur ?? 10,
        spread: og.spread ?? 0,
      };
      hasEffects = true;
    }

    // 이너 글로우
    if (effects.innerGlow && effects.innerGlow.enabled !== false) {
      const ig = effects.innerGlow;
      result.innerGlow = {
        enabled: true,
        color: this.parseEffectColor(ig.color),
        opacity: (ig.opacity ?? 100) / 100,
        blur: ig.blur ?? 10,
        spread: ig.spread ?? 0,
      };
      hasEffects = true;
    }

    // 스트로크 (다중 및 그라디언트 지원)
    if (effects.stroke) {
      const strokes = Array.isArray(effects.stroke) ? effects.stroke : [effects.stroke];
      const parsedStrokes = strokes
        .filter((st: any) => st && st.enabled !== false)
        .map((st: any) => {
          const strokeEffect: any = {
            enabled: true,
            size: st.size ?? 1,
            position: st.position || 'outside',
            opacity: (st.opacity ?? 100) / 100,
            fillType: st.fillType || 'solid',
          };
          if (st.fillType === 'gradient' && st.gradient) {
            strokeEffect.gradient = {
              enabled: true,
              opacity: 1,
              blendMode: 'normal',
              angle: st.gradient.angle ?? 90,
              type: st.gradient.type || 'linear',
              colors: this.parseGradientColors(st.gradient),
              reverse: st.gradient.reverse ?? false,
              scale: st.gradient.scale ?? 100,
            };
          } else {
            strokeEffect.color = this.parseEffectColor(st.color);
          }
          return strokeEffect;
        });
      if (parsedStrokes.length === 1) {
        result.stroke = parsedStrokes[0];
      } else if (parsedStrokes.length > 1) {
        result.stroke = parsedStrokes;
      }
      if (parsedStrokes.length > 0) hasEffects = true;
    }

    // Bevel & Emboss
    if (effects.bevelEmboss && effects.bevelEmboss.enabled !== false) {
      const be = effects.bevelEmboss;
      result.bevelEmboss = {
        enabled: true,
        style: be.style || 'inner-bevel',
        technique: be.technique || 'smooth',
        depth: be.depth ?? 100,
        direction: be.direction || 'up',
        size: be.size ?? 5,
        soften: be.soften ?? 0,
        angle: be.angle ?? 120,
        altitude: be.altitude ?? 30,
        highlightMode: be.highlightMode || 'screen',
        highlightColor: this.parseEffectColor(be.highlightColor),
        highlightOpacity: (be.highlightOpacity ?? 75) / 100,
        shadowMode: be.shadowMode || 'multiply',
        shadowColor: this.parseEffectColor(be.shadowColor),
        shadowOpacity: (be.shadowOpacity ?? 75) / 100,
      };
      hasEffects = true;
    }

    // Gaussian Blur (레이어 블러)
    const layerAny = (effects as any);
    if (layerAny.blur || layerAny.gaussianBlur) {
      const blur = layerAny.blur || layerAny.gaussianBlur;
      if (blur.enabled !== false) {
        result.gaussianBlur = {
          enabled: true,
          radius: blur.radius ?? blur.size ?? 5,
        };
        hasEffects = true;
      }
    }

    // Solid Fill (색상 오버레이)
    if (effects.solidFill && effects.solidFill.enabled !== false) {
      const sf = effects.solidFill;
      result.solidFill = {
        enabled: true,
        color: this.parseEffectColor(sf.color),
        opacity: (sf.opacity ?? 100) / 100,
        blendMode: sf.blendMode || 'normal',
      };
      hasEffects = true;
    }

    // Gradient Overlay (그라디언트 오버레이)
    if (effects.gradientOverlay && effects.gradientOverlay.enabled !== false) {
      const go = effects.gradientOverlay;
      result.gradientOverlay = {
        enabled: true,
        opacity: (go.opacity ?? 100) / 100,
        blendMode: go.blendMode || 'normal',
        angle: go.angle ?? 90,
        type: go.type || 'linear',
        colors: this.parseGradientColors(go.gradient),
        reverse: go.reverse ?? false,
        scale: go.scale ?? 100,
      };
      hasEffects = true;
    }

    // Satin (새틴 효과)
    if (effects.satin && effects.satin.enabled !== false) {
      const sa = effects.satin;
      result.satin = {
        enabled: true,
        color: this.parseEffectColor(sa.color),
        opacity: (sa.opacity ?? 100) / 100,
        angle: sa.angle ?? 120,
        distance: sa.distance ?? 10,
        size: sa.size ?? 10,
        blendMode: sa.blendMode || 'multiply',
        invert: sa.invert ?? false,
      };
      hasEffects = true;
    }

    // Pattern Overlay (패턴 오버레이)
    if (effects.patternOverlay && effects.patternOverlay.enabled !== false) {
      const po = effects.patternOverlay;
      const patternId = po.pattern?.id;
      result.patternOverlay = {
        enabled: true,
        opacity: (po.opacity ?? 100) / 100,
        blendMode: po.blendMode || 'normal',
        scale: po.scale ?? 100,
        patternName: po.pattern?.name,
        patternId: patternId,
        patternData: patternId ? this.getPatternData(patternId) : undefined,
      };
      hasEffects = true;
    }

    return hasEffects ? result : undefined;
  }

  // 그라디언트 색상 파싱
  private parseGradientColors(gradient: any): GradientStop[] {
    if (!gradient || !gradient.colors) {
      return [
        { location: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
        { location: 100, color: { r: 255, g: 255, b: 255, a: 1 } },
      ];
    }
    return gradient.colors.map((c: any) => ({
      location: c.location ?? 0,
      color: this.parseEffectColor(c.color),
    }));
  }

  // 효과 색상 파싱
  private parseEffectColor(color: any): RGBAColor {
    if (!color) return { r: 0, g: 0, b: 0, a: 1 };
    return {
      r: color.r ?? 0,
      g: color.g ?? 0,
      b: color.b ?? 0,
      a: color.a ?? 1,
    };
  }

  // 조정 레이어 파싱
  private parseAdjustmentLayer(layer: Layer): { type: AdjustmentType; data: AdjustmentData } | null {
    const adj = (layer as any).adjustment;
    if (!adj) return null;

    // ag-psd의 adjustment 객체 구조에 따라 파싱
    const adjType = Object.keys(adj)[0];
    const adjData = adj[adjType];

    let type: AdjustmentType;
    const data: AdjustmentData = {};

    switch (adjType) {
      case 'brightnessContrast':
        type = 'brightness-contrast';
        data.brightness = adjData.brightness ?? 0;
        data.contrast = adjData.contrast ?? 0;
        break;
      case 'levels':
        type = 'levels';
        if (adjData.input) {
          data.inputBlack = adjData.input[0] ?? 0;
          data.inputWhite = adjData.input[1] ?? 255;
        }
        if (adjData.output) {
          data.outputBlack = adjData.output[0] ?? 0;
          data.outputWhite = adjData.output[1] ?? 255;
        }
        data.gamma = adjData.gamma ?? 1;
        break;
      case 'curves':
        type = 'curves';
        // curves는 복잡한 데이터 구조를 가짐, 기본값만 저장
        break;
      case 'exposure':
        type = 'exposure';
        data.exposure = adjData.exposure ?? 0;
        data.offset = adjData.offset ?? 0;
        data.gammaCorrection = adjData.gamma ?? 1;
        break;
      case 'vibrance':
        type = 'vibrance';
        data.vibrance = adjData.vibrance ?? 0;
        data.saturation = adjData.saturation ?? 0;
        break;
      case 'hueSaturation':
        type = 'hue-saturation';
        data.hue = adjData.hue ?? 0;
        data.saturation = adjData.saturation ?? 0;
        data.lightness = adjData.lightness ?? 0;
        break;
      case 'colorBalance':
        type = 'color-balance';
        if (adjData.midtones) {
          data.cyanRed = adjData.midtones[0] ?? 0;
          data.magentaGreen = adjData.midtones[1] ?? 0;
          data.yellowBlue = adjData.midtones[2] ?? 0;
        }
        break;
      case 'blackAndWhite':
        type = 'black-white';
        break;
      case 'photoFilter':
        type = 'photo-filter';
        if (adjData.color) {
          data.filterColor = this.parseEffectColor(adjData.color);
        }
        data.density = adjData.density ?? 25;
        break;
      case 'channelMixer':
        type = 'channel-mixer';
        break;
      case 'colorLookup':
        type = 'color-lookup';
        break;
      case 'invert':
        type = 'invert';
        break;
      case 'posterize':
        type = 'posterize';
        data.levels = adjData.levels ?? 4;
        break;
      case 'threshold':
        type = 'threshold';
        data.threshold = adjData.level ?? 128;
        break;
      case 'gradientMap':
        type = 'gradient-map';
        break;
      case 'selectiveColor':
        type = 'selective-color';
        break;
      default:
        return null;
    }

    return { type, data };
  }

  // 스마트 필터 파싱
  private parseSmartFilters(layer: Layer): SmartFilter[] | undefined {
    const smartObject = (layer as any).smartObject;
    const filterEffects = (layer as any).filterEffects || (layer as any).smartFilters;

    if (!filterEffects) return undefined;

    const filters: SmartFilter[] = [];

    // 필터 효과 배열 처리
    const filterList = Array.isArray(filterEffects) ? filterEffects : [filterEffects];

    for (const filter of filterList) {
      if (!filter) continue;

      let filterType: SmartFilterType | null = null;
      const settings: any = {};

      // 필터 타입 감지
      if (filter.gaussianBlur || filter.type === 'gaussianBlur') {
        filterType = 'gaussian-blur';
        const gb = filter.gaussianBlur || filter;
        settings.radius = gb.radius ?? 5;
      } else if (filter.motionBlur || filter.type === 'motionBlur') {
        filterType = 'motion-blur';
        const mb = filter.motionBlur || filter;
        settings.angle = mb.angle ?? 0;
        settings.distance = mb.distance ?? 10;
      } else if (filter.radialBlur || filter.type === 'radialBlur') {
        filterType = 'radial-blur';
      } else if (filter.surfaceBlur || filter.type === 'surfaceBlur') {
        filterType = 'surface-blur';
        const sb = filter.surfaceBlur || filter;
        settings.radius = sb.radius ?? 5;
        settings.threshold = sb.threshold ?? 15;
      } else if (filter.sharpen || filter.type === 'sharpen') {
        filterType = 'sharpen';
      } else if (filter.unsharpMask || filter.type === 'unsharpMask') {
        filterType = 'unsharp-mask';
        const usm = filter.unsharpMask || filter;
        settings.amount = usm.amount ?? 50;
        settings.radius = usm.radius ?? 1;
        settings.threshold = usm.threshold ?? 0;
      } else if (filter.noise || filter.type === 'noise') {
        filterType = 'noise';
        const n = filter.noise || filter;
        settings.noiseAmount = n.amount ?? 10;
        settings.distribution = n.distribution || 'uniform';
        settings.monochromatic = n.monochromatic ?? false;
      }

      if (filterType) {
        filters.push({
          type: filterType,
          enabled: filter.enabled !== false,
          opacity: filter.opacity ? filter.opacity / 100 : 1,
          blendMode: filter.blendMode,
          settings,
        });
      }
    }

    return filters.length > 0 ? filters : undefined;
  }

  // 안내선 파싱
  private parseGuides(guides: any[]): Guide[] {
    return guides.map(g => ({
      location: g.location || 0,
      direction: g.direction === 'horizontal' ? 'horizontal' : 'vertical',
    }));
  }

  // 그리드 파싱
  private parseGrid(grid: any): GridInfo {
    return {
      horizontal: grid.horizontal || 18,
      vertical: grid.vertical || 18,
      subdivisions: grid.subdivisions,
    };
  }

  // 슬라이스 파싱
  private parseSlices(slices: any[]): Slice[] {
    return slices.map(s => ({
      id: s.id || 0,
      name: s.name || '',
      bounds: {
        top: s.top || s.bounds?.top || 0,
        left: s.left || s.bounds?.left || 0,
        right: s.right || s.bounds?.right || 0,
        bottom: s.bottom || s.bounds?.bottom || 0,
      },
      url: s.url,
    }));
  }

  // 해상도 파싱
  private parseResolution(resolution: any): ResolutionInfo {
    return {
      horizontal: resolution.horizontalResolution || resolution.horizontal || 72,
      horizontalUnit: resolution.horizontalResolutionUnit === 2 ? 'PPCM' : 'PPI',
      vertical: resolution.verticalResolution || resolution.vertical || 72,
      verticalUnit: resolution.verticalResolutionUnit === 2 ? 'PPCM' : 'PPI',
    };
  }

  // 레이어 마스크 파싱
  private parseLayerMask(mask: any, layer: Layer): LayerMask {
    const result: LayerMask = {
      enabled: mask.disabled !== true,
      bounds: {
        top: mask.top ?? 0,
        left: mask.left ?? 0,
        right: mask.right ?? 0,
        bottom: mask.bottom ?? 0,
      },
      defaultColor: mask.defaultColor ?? 255,
    };

    // 마스크 이미지 데이터 추출
    if (mask.canvas) {
      try {
        const canvas = mask.canvas as any;
        if (canvas.toBuffer) {
          const buffer = canvas.toBuffer('image/png');

          // 스트리밍 모드: 즉시 파일로 쓰고 메모리 해제
          if (this.options.streamImages && this.imagesDir) {
            const fileName = `mask_${this.imageCounter++}.png`;
            const imagePath = path.join(this.imagesDir, fileName);
            fs.writeFileSync(imagePath, buffer);
            this.streamedImageCount++;

            // canvas 참조 해제
            mask.canvas = null;

            result.imageData = Buffer.from(`__STREAMED__:${fileName}`);
          } else {
            result.imageData = buffer;
          }
        }
      } catch (e) {
        // 마스크 이미지 추출 실패
      }
    }

    return result;
  }

  // 벡터 마스크 파싱
  private parseVectorMask(vectorMask: any): VectorMask {
    const result: VectorMask = {
      enabled: vectorMask.disabled !== true,
      paths: [],
    };

    if (vectorMask.paths) {
      result.paths = vectorMask.paths.map((p: any) => {
        const path: any = { type: 'path' };
        if (p.knots) {
          path.points = p.knots.map((k: any) => ({
            x: k.points?.[0] ?? k.x ?? 0,
            y: k.points?.[1] ?? k.y ?? 0,
          }));
        }
        return path;
      });
    }

    return result;
  }

  // 벡터 스트로크 파싱
  private parseVectorStroke(stroke: any): VectorStroke {
    return {
      enabled: stroke.enabled !== false,
      color: this.parseEffectColor(stroke.strokeColor || stroke.color),
      width: stroke.strokeWidth ?? stroke.width ?? 1,
      lineAlignment: stroke.strokeStyleLineAlignment || 'center',
      lineCap: stroke.strokeStyleLineCapType || 'butt',
      lineJoin: stroke.strokeStyleLineJoinType || 'miter',
      dashPattern: stroke.strokeStyleLineDashSet,
    };
  }

  // 벡터 채우기 파싱
  private parseVectorFill(fill: any): VectorFill {
    if (fill.solidColorContents || fill.color) {
      return {
        type: 'solid',
        color: this.parseEffectColor(fill.solidColorContents?.color || fill.color),
      };
    }
    if (fill.gradientContents || fill.gradient) {
      return {
        type: 'gradient',
        gradient: {
          enabled: true,
          opacity: 1,
          blendMode: 'normal',
          angle: fill.gradientContents?.angle || 90,
          type: 'linear',
          colors: this.parseGradientColors(fill.gradientContents?.gradient || fill.gradient),
          reverse: false,
          scale: 100,
        },
      };
    }
    return { type: 'solid', color: { r: 128, g: 128, b: 128, a: 1 } };
  }

  // 배치된 레이어 파싱
  private parsePlacedLayer(placed: any): PlacedLayerInfo {
    const result: PlacedLayerInfo = {
      type: placed.type === 'linked' ? 'linked' : 'embedded',
    };

    if (placed.transform) {
      result.transform = {
        xx: placed.transform.xx ?? 1,
        xy: placed.transform.xy ?? 0,
        yx: placed.transform.yx ?? 0,
        yy: placed.transform.yy ?? 1,
        tx: placed.transform.tx ?? 0,
        ty: placed.transform.ty ?? 0,
      };
    }

    if (placed.width) result.width = placed.width;
    if (placed.height) result.height = placed.height;

    return result;
  }

  // 레이어 정보 출력 (디버그용)
  printLayerTree(layers: PsdLayerInfo[], indent: number = 0): void {
    const prefix = '  '.repeat(indent);
    for (const layer of layers) {
      const tags: string[] = [];
      if (layer.effects) {
        const effectNames: string[] = [];
        if (layer.effects.dropShadow) effectNames.push('shadow');
        if (layer.effects.innerShadow) effectNames.push('inner-shadow');
        if (layer.effects.bevelEmboss) effectNames.push('bevel');
        if (layer.effects.gaussianBlur) effectNames.push('blur');
        if (layer.effects.stroke) effectNames.push('stroke');
        if (layer.effects.outerGlow) effectNames.push('outer-glow');
        if (layer.effects.innerGlow) effectNames.push('inner-glow');
        if (layer.effects.solidFill) effectNames.push('color-overlay');
        if (layer.effects.gradientOverlay) effectNames.push('gradient');
        if (layer.effects.satin) effectNames.push('satin');
        if (layer.effects.patternOverlay) effectNames.push('pattern');
        if (effectNames.length > 0) tags.push(`fx:${effectNames.join(',')}`);
      }
      if (layer.adjustmentType) tags.push(`adj:${layer.adjustmentType}`);
      if (layer.smartFilters && layer.smartFilters.length > 0) {
        tags.push(`filters:${layer.smartFilters.map(f => f.type).join(',')}`);
      }
      if (layer.clipping) tags.push('clip');
      if (layer.mask) tags.push('mask');
      if (layer.vectorMask) tags.push('vmask');
      if (layer.vectorStroke) tags.push('vstroke');
      if (layer.placedLayer) tags.push('placed');
      const tagsStr = tags.length > 0 ? ` [${tags.join(' ')}]` : '';
      console.log(`${prefix}[${layer.type}] ${layer.name} (${layer.bounds.width}x${layer.bounds.height})${tagsStr}`);
      if (layer.children) {
        this.printLayerTree(layer.children, indent + 1);
      }
    }
  }
}
