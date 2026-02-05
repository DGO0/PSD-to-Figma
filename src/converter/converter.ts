import * as fs from 'fs';
import * as path from 'path';
import {
  PsdLayerInfo, ParsedPsd, FigmaNode, BLEND_MODE_MAP, ConvertOptions, LayerEffects,
  SmartFilter, AdjustmentType, AdjustmentData, Guide, GridInfo, Slice, ResolutionInfo,
  GradientStop, LayerMask, VectorMask, VectorStroke, VectorFill, PlacedLayerInfo
} from '../types';

export interface ConversionResult {
  figmaData: FigmaExportData;
  imageFiles: Map<string, Buffer>;
  summary: ConversionSummary;
}

export interface FigmaExportData {
  version: string;
  name: string;
  canvas: {
    width: number;
    height: number;
  };
  nodes: FigmaNodeExport[];
  // 전역 기능
  guides?: FigmaGuide[];
  grid?: FigmaGrid;
  slices?: FigmaSlice[];
  resolution?: { horizontal: number; vertical: number; unit: string };
}

export interface FigmaGuide {
  position: number;
  direction: 'horizontal' | 'vertical';
}

export interface FigmaGrid {
  horizontal: number;
  vertical: number;
}

export interface FigmaSlice {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigmaNodeExport {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  blendMode: string;
  visible: boolean;
  color?: string;    // 레이어 색상 태그
  locked?: boolean;  // 레이어 잠금 상태
  children?: FigmaNodeExport[];
  // 텍스트 전용
  text?: string;
  textStyle?: {
    fontFamily: string;
    fontStyle?: string;
    fontSize: number;
    color: { r: number; g: number; b: number; a: number };
    lineHeight?: number;
    letterSpacing?: number;
    textAlign?: 'left' | 'center' | 'right' | 'justify';
    underline?: boolean;
    strikethrough?: boolean;
  };
  // 멀티 스타일 텍스트
  styleRuns?: {
    text: string;
    fontFamily?: string;
    fontStyle?: string;
    fontSize?: number;
    color?: { r: number; g: number; b: number; a: number };
    letterSpacing?: number;
    underline?: boolean;
    strikethrough?: boolean;
  }[];
  // 텍스트 변환 (회전, 스케일, 이동 등)
  textTransform?: {
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    tx?: number;  // 이동 X (텍스트 위치 보정용)
    ty?: number;  // 이동 Y (텍스트 위치 보정용)
  };
  // 이미지 전용
  imageFileName?: string;
  imageData?: string; // base64 encoded PNG
  // 효과
  effects?: FigmaEffects;
  // 조정 레이어
  adjustment?: FigmaAdjustment;
  // 스마트 필터
  smartFilters?: FigmaSmartFilter[];
  // 클리핑 마스크
  clipping?: boolean;
  // 레이어 마스크
  mask?: FigmaMask;
  // 벡터 관련
  vectorMask?: FigmaVectorMask;
  vectorStroke?: FigmaVectorStroke;
  vectorFill?: FigmaVectorFill;
  // 배치된 레이어
  placedLayer?: boolean;
}

export interface FigmaMask {
  enabled: boolean;
  imageFileName?: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface FigmaVectorMask {
  enabled: boolean;
  pathData?: string; // SVG path data
}

export interface FigmaVectorStroke {
  color: { r: number; g: number; b: number; a: number };
  width: number;
  alignment: string;
  cap: string;
  join: string;
  dashPattern?: number[];
}

export interface FigmaVectorFill {
  type: 'solid' | 'gradient';
  color?: { r: number; g: number; b: number; a: number };
  gradient?: FigmaGradient;
}

export interface FigmaGradient {
  type: string;
  angle: number;
  stops: { position: number; color: { r: number; g: number; b: number; a: number } }[];
}

export interface FigmaShadowEffect {
  color: { r: number; g: number; b: number; a: number };
  offset: { x: number; y: number };
  blur: number;
  spread: number;
}

export interface FigmaStrokeEffect {
  color?: { r: number; g: number; b: number; a: number };
  weight: number;
  position: string;
  fillType?: 'solid' | 'gradient' | 'pattern';
  gradient?: FigmaGradient;
}

export interface FigmaEffects {
  dropShadow?: FigmaShadowEffect | FigmaShadowEffect[];
  innerShadow?: FigmaShadowEffect | FigmaShadowEffect[];
  stroke?: FigmaStrokeEffect | FigmaStrokeEffect[];
  // Bevel & Emboss (Figma에서는 하이라이트/섀도우로 시뮬레이션)
  bevelEmboss?: {
    highlightColor: { r: number; g: number; b: number; a: number };
    shadowColor: { r: number; g: number; b: number; a: number };
    size: number;
    depth: number;
    angle: number;
    altitude: number;
    style: string;
  };
  // Layer Blur
  layerBlur?: {
    radius: number;
  };
  // Outer Glow
  outerGlow?: {
    color: { r: number; g: number; b: number; a: number };
    blur: number;
    spread: number;
  };
  // Inner Glow
  innerGlow?: {
    color: { r: number; g: number; b: number; a: number };
    blur: number;
    spread: number;
  };
  // Solid Fill (Color Overlay)
  solidFill?: {
    color: { r: number; g: number; b: number; a: number };
    blendMode: string;
  };
  // Gradient Overlay
  gradientOverlay?: {
    type: string;
    angle: number;
    stops: { position: number; color: { r: number; g: number; b: number; a: number } }[];
    blendMode: string;
  };
  // Satin
  satin?: {
    color: { r: number; g: number; b: number; a: number };
    angle: number;
    distance: number;
    size: number;
    blendMode: string;
  };
  // Pattern Overlay
  patternOverlay?: {
    imageFileName: string;
    opacity: number;
    scale: number;
    blendMode: string;
  };
}

// 스마트 필터 export 데이터
export interface FigmaSmartFilter {
  type: string;
  enabled: boolean;
  opacity?: number;
  blendMode?: string;
  radius?: number;
  angle?: number;
  distance?: number;
  amount?: number;
  threshold?: number;
}

// 조정 레이어 export 데이터
export interface FigmaAdjustment {
  type: string;
  brightness?: number;
  contrast?: number;
  hue?: number;
  saturation?: number;
  lightness?: number;
  exposure?: number;
  vibrance?: number;
  levels?: number;
  threshold?: number;
}

export interface ConversionSummary {
  totalLayers: number;
  groups: number;
  textLayers: number;
  imageLayers: number;
  shapeLayers: number;
  adjustmentLayers: number;
  smartFilterLayers: number;
}

export class PsdToFigmaConverter {
  private options: ConvertOptions;
  private imageCounter: number = 0;
  private summary: ConversionSummary = {
    totalLayers: 0,
    groups: 0,
    textLayers: 0,
    imageLayers: 0,
    shapeLayers: 0,
    adjustmentLayers: 0,
    smartFilterLayers: 0,
  };
  private imageFiles: Map<string, Buffer> = new Map();
  private imagesDir: string = '';
  private streamedImageCount: number = 0;

  constructor(options: Partial<ConvertOptions> = {}) {
    this.options = {
      figmaToken: options.figmaToken || '',
      preserveGroups: options.preserveGroups ?? true,
      exportImages: options.exportImages ?? true,
      outputDir: options.outputDir || './output',
      streamImages: options.streamImages ?? true,  // 기본값: 즉시 파일로 쓰기
    };
  }

  // 이미지를 즉시 파일로 쓰고 메모리 해제
  private writeImageImmediately(fileName: string, buffer: Buffer): void {
    if (!this.options.streamImages) {
      this.imageFiles.set(fileName, buffer);
      return;
    }

    // 이미지 디렉토리가 없으면 생성
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
    }

    const imagePath = path.join(this.imagesDir, fileName);
    fs.writeFileSync(imagePath, buffer);
    this.streamedImageCount++;

    // 진행률 출력 (100개마다)
    if (this.streamedImageCount % 100 === 0) {
      console.log(`  Images written: ${this.streamedImageCount}`);

      // 가비지 컬렉션 유도
      if (global.gc) {
        global.gc();
      }
    }
  }

  async convert(psd: ParsedPsd): Promise<ConversionResult> {
    // 초기화
    this.imageCounter = 0;
    this.streamedImageCount = 0;
    this.summary = {
      totalLayers: 0,
      groups: 0,
      textLayers: 0,
      imageLayers: 0,
      shapeLayers: 0,
      adjustmentLayers: 0,
      smartFilterLayers: 0,
    };
    this.imageFiles.clear();

    // 이미지 스트리밍 모드: 출력 디렉토리 미리 생성
    if (this.options.streamImages && this.options.outputDir) {
      this.imagesDir = path.join(this.options.outputDir, 'images');
      if (!fs.existsSync(this.options.outputDir)) {
        fs.mkdirSync(this.options.outputDir, { recursive: true });
      }
      console.log(`  Stream mode: images will be written to ${this.imagesDir}`);
    }

    const nodes = this.convertLayers(psd.layers);

    const figmaData: FigmaExportData = {
      version: '1.0.0',
      name: psd.name,
      canvas: {
        width: psd.width,
        height: psd.height,
      },
      nodes,
    };

    // 안내선
    if (psd.guides && psd.guides.length > 0) {
      figmaData.guides = psd.guides.map(g => ({
        position: g.location,
        direction: g.direction,
      }));
    }

    // 그리드
    if (psd.grid) {
      figmaData.grid = {
        horizontal: psd.grid.horizontal,
        vertical: psd.grid.vertical,
      };
    }

    // 슬라이스
    if (psd.slices && psd.slices.length > 0) {
      figmaData.slices = psd.slices.map(s => ({
        id: s.id,
        name: s.name,
        x: s.bounds.left,
        y: s.bounds.top,
        width: s.bounds.right - s.bounds.left,
        height: s.bounds.bottom - s.bounds.top,
      }));
    }

    // 해상도
    if (psd.resolution) {
      figmaData.resolution = {
        horizontal: psd.resolution.horizontal,
        vertical: psd.resolution.vertical,
        unit: psd.resolution.horizontalUnit,
      };
    }

    return {
      figmaData,
      imageFiles: this.imageFiles,
      summary: this.summary,
    };
  }

  private convertLayers(layers: PsdLayerInfo[]): FigmaNodeExport[] {
    // PSD 레이어 순서 그대로 유지 (ag-psd: 첫 번째가 맨 위)
    return layers.map((layer, index) => this.convertLayer(layer, index));
  }

  private convertLayer(layer: PsdLayerInfo, index: number): FigmaNodeExport {
    this.summary.totalLayers++;
    const id = `node_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;

    const baseNode: FigmaNodeExport = {
      id,
      name: layer.name,
      type: this.mapLayerType(layer.type),
      x: layer.bounds.left,
      y: layer.bounds.top,
      width: layer.bounds.width,
      height: layer.bounds.height,
      opacity: layer.opacity,
      blendMode: BLEND_MODE_MAP[layer.blendMode] || 'NORMAL',
      visible: layer.visible,
    };

    // 레이어 색상 태그
    if (layer.color) {
      baseNode.color = layer.color;
    }

    // 레이어 잠금 상태
    if (layer.locked) {
      baseNode.locked = true;
    }

    // 효과 변환
    if (layer.effects) {
      baseNode.effects = this.convertEffects(layer.effects);

      // 패턴 오버레이 이미지 저장
      if (layer.effects.patternOverlay && layer.effects.patternOverlay.patternData) {
        const po = layer.effects.patternOverlay;
        const patternData = po.patternData!;
        const patternFileName = `${this.sanitizeFileName(layer.name)}_pattern_${this.imageCounter++}.png`;
        this.writeImageImmediately(patternFileName, patternData);
        if (baseNode.effects) {
          baseNode.effects.patternOverlay = {
            imageFileName: patternFileName,
            opacity: po.opacity,
            scale: po.scale,
            blendMode: BLEND_MODE_MAP[po.blendMode] || 'NORMAL',
          };
        }
      }
    }

    // 스마트 필터 변환
    if (layer.smartFilters && layer.smartFilters.length > 0) {
      this.summary.smartFilterLayers++;
      baseNode.smartFilters = this.convertSmartFilters(layer.smartFilters);
    }

    // 클리핑 마스크
    if (layer.clipping) {
      baseNode.clipping = true;
    }

    // 레이어 마스크
    if (layer.mask) {
      let maskImageFileName: string | undefined;
      if (layer.mask.imageData) {
        const maskDataStr = layer.mask.imageData.toString('utf8');
        if (maskDataStr.startsWith('__STREAMED__:')) {
          // 이미 파싱 중에 파일로 저장됨
          maskImageFileName = maskDataStr.replace('__STREAMED__:', '');
        } else {
          // 일반적인 경우: 새 파일명 생성 및 저장
          maskImageFileName = `${this.sanitizeFileName(layer.name)}_mask_${this.imageCounter++}.png`;
          this.writeImageImmediately(maskImageFileName, layer.mask.imageData);
        }
      }
      baseNode.mask = {
        enabled: layer.mask.enabled,
        imageFileName: maskImageFileName,
        bounds: {
          x: layer.mask.bounds.left,
          y: layer.mask.bounds.top,
          width: layer.mask.bounds.right - layer.mask.bounds.left,
          height: layer.mask.bounds.bottom - layer.mask.bounds.top,
        },
      };
    }

    // 벡터 마스크
    if (layer.vectorMask) {
      baseNode.vectorMask = {
        enabled: layer.vectorMask.enabled,
        pathData: this.convertPathsToSvg(layer.vectorMask.paths, layer.bounds),
      };
    }

    // 벡터 스트로크
    if (layer.vectorStroke) {
      baseNode.vectorStroke = this.convertVectorStroke(layer.vectorStroke);
    }

    // 벡터 채우기
    if (layer.vectorFill) {
      baseNode.vectorFill = this.convertVectorFill(layer.vectorFill);
    }

    // 배치된 레이어
    if (layer.placedLayer) {
      baseNode.placedLayer = true;
    }

    // 조정 레이어 처리
    if (layer.type === 'adjustment' && layer.adjustmentType) {
      this.summary.adjustmentLayers++;
      baseNode.adjustment = this.convertAdjustment(layer.adjustmentType, layer.adjustmentData);
      return baseNode;
    }

    // 그룹 처리
    if (layer.type === 'group' && layer.children) {
      this.summary.groups++;
      if (this.options.preserveGroups) {
        baseNode.children = this.convertLayers(layer.children);
      }
      return baseNode;
    }

    // 텍스트 레이어 처리
    if (layer.type === 'text' && layer.textData) {
      this.summary.textLayers++;
      baseNode.text = layer.textData.text;
      baseNode.textStyle = {
        fontFamily: layer.textData.fontFamily,
        fontStyle: layer.textData.fontStyle,
        fontSize: layer.textData.fontSize,
        color: layer.textData.color,
        lineHeight: layer.textData.lineHeight,
        letterSpacing: layer.textData.letterSpacing,
        textAlign: layer.textData.textAlign,
        underline: layer.textData.underline,
        strikethrough: layer.textData.strikethrough,
      };

      // 멀티 스타일 텍스트
      if (layer.textData.styleRuns && layer.textData.styleRuns.length > 0) {
        baseNode.styleRuns = layer.textData.styleRuns.map(run => ({
          text: run.text,
          fontFamily: run.fontFamily,
          fontStyle: run.fontStyle,
          fontSize: run.fontSize,
          color: run.color,
          letterSpacing: run.letterSpacing,
          underline: run.underline,
          strikethrough: run.strikethrough,
        }));
      }

      // 텍스트 변환 (회전, 스케일, 이동 등)
      if (layer.textData.transform) {
        const t = layer.textData.transform;
        if (t.rotation !== undefined || t.scaleX !== undefined || t.scaleY !== undefined ||
            t.tx !== undefined || t.ty !== undefined) {
          baseNode.textTransform = {
            rotation: t.rotation,
            scaleX: t.scaleX,
            scaleY: t.scaleY,
            tx: t.tx,
            ty: t.ty,
          };
        }
      }

      return baseNode;
    }

    // 이미지 레이어 처리
    if (layer.imageData && this.options.exportImages) {
      this.summary.imageLayers++;

      // 파싱 중 스트리밍으로 이미 저장된 경우 확인
      const imageDataStr = layer.imageData.toString('utf8');
      if (imageDataStr.startsWith('__STREAMED__:')) {
        // 이미 파싱 중에 파일로 저장됨, 파일명만 사용
        baseNode.imageFileName = imageDataStr.replace('__STREAMED__:', '');
      } else {
        // 일반적인 경우: 새 파일명 생성 및 저장
        const imageFileName = `${this.sanitizeFileName(layer.name)}_${this.imageCounter++}.png`;
        this.writeImageImmediately(imageFileName, layer.imageData);
        baseNode.imageFileName = imageFileName;
      }
    }

    // 도형 레이어
    if (layer.type === 'shape') {
      this.summary.shapeLayers++;
    }

    return baseNode;
  }

  private mapLayerType(type: PsdLayerInfo['type']): string {
    switch (type) {
      case 'group':
        return 'GROUP';
      case 'text':
        return 'TEXT';
      case 'shape':
        return 'VECTOR';
      case 'adjustment':
        return 'ADJUSTMENT';
      case 'layer':
      default:
        return 'RECTANGLE';
    }
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
  }

  // 효과 변환
  private convertEffects(effects: LayerEffects): FigmaEffects {
    const result: FigmaEffects = {};

    // 드롭 쉐도우 (다중 지원)
    if (effects.dropShadow) {
      const shadows = Array.isArray(effects.dropShadow) ? effects.dropShadow : [effects.dropShadow];
      const converted = shadows.filter(ds => ds.enabled).map(ds => {
        // NaN 체크 포함한 안전한 값 추출
        const angle = (typeof ds.angle === 'number' && !Number.isNaN(ds.angle)) ? ds.angle : 120;
        const distance = (typeof ds.distance === 'number' && !Number.isNaN(ds.distance)) ? ds.distance : 0;
        const angleRad = (angle * Math.PI) / 180;
        const offsetX = Math.cos(angleRad) * distance;
        const offsetY = Math.sin(angleRad) * distance;
        return {
          color: {
            r: (ds.color?.r ?? 0) / 255,
            g: (ds.color?.g ?? 0) / 255,
            b: (ds.color?.b ?? 0) / 255,
            a: ds.opacity ?? 0.75,
          },
          offset: {
            x: Number.isNaN(offsetX) ? 0 : offsetX,
            y: Number.isNaN(offsetY) ? 0 : offsetY,
          },
          blur: ds.blur ?? 0,
          spread: ds.spread ?? 0,
        };
      });
      if (converted.length === 1) {
        result.dropShadow = converted[0];
      } else if (converted.length > 1) {
        result.dropShadow = converted;
      }
    }

    // 이너 쉐도우 (다중 지원)
    if (effects.innerShadow) {
      const shadows = Array.isArray(effects.innerShadow) ? effects.innerShadow : [effects.innerShadow];
      const converted = shadows.filter(is => is.enabled).map(is => {
        // NaN 체크 포함한 안전한 값 추출
        const angle = (typeof is.angle === 'number' && !Number.isNaN(is.angle)) ? is.angle : 120;
        const distance = (typeof is.distance === 'number' && !Number.isNaN(is.distance)) ? is.distance : 0;
        const angleRad = (angle * Math.PI) / 180;
        const offsetX = Math.cos(angleRad) * distance;
        const offsetY = Math.sin(angleRad) * distance;
        return {
          color: {
            r: (is.color?.r ?? 0) / 255,
            g: (is.color?.g ?? 0) / 255,
            b: (is.color?.b ?? 0) / 255,
            a: is.opacity ?? 0.75,
          },
          offset: {
            x: Number.isNaN(offsetX) ? 0 : offsetX,
            y: Number.isNaN(offsetY) ? 0 : offsetY,
          },
          blur: is.blur ?? 0,
          spread: is.spread ?? 0,
        };
      });
      if (converted.length === 1) {
        result.innerShadow = converted[0];
      } else if (converted.length > 1) {
        result.innerShadow = converted;
      }
    }

    // 스트로크 (다중 및 그라디언트 지원)
    if (effects.stroke) {
      const strokes = Array.isArray(effects.stroke) ? effects.stroke : [effects.stroke];
      const converted = strokes.filter(st => st.enabled).map(st => {
        const strokeResult: FigmaStrokeEffect = {
          weight: st.size,
          position: st.position.toUpperCase(),
          fillType: st.fillType || 'solid',
        };
        if (st.fillType === 'gradient' && st.gradient) {
          strokeResult.gradient = {
            type: st.gradient.type,
            angle: st.gradient.angle,
            stops: st.gradient.colors.map(c => ({
              position: c.location / 100,
              color: {
                r: c.color.r / 255,
                g: c.color.g / 255,
                b: c.color.b / 255,
                a: c.color.a,
              },
            })),
          };
        } else if (st.color) {
          strokeResult.color = {
            r: st.color.r / 255,
            g: st.color.g / 255,
            b: st.color.b / 255,
            a: st.opacity,
          };
        }
        return strokeResult;
      });
      if (converted.length === 1) {
        result.stroke = converted[0];
      } else if (converted.length > 1) {
        result.stroke = converted;
      }
    }

    // Bevel & Emboss
    if (effects.bevelEmboss && effects.bevelEmboss.enabled) {
      const be = effects.bevelEmboss;
      result.bevelEmboss = {
        highlightColor: {
          r: be.highlightColor.r / 255,
          g: be.highlightColor.g / 255,
          b: be.highlightColor.b / 255,
          a: be.highlightOpacity,
        },
        shadowColor: {
          r: be.shadowColor.r / 255,
          g: be.shadowColor.g / 255,
          b: be.shadowColor.b / 255,
          a: be.shadowOpacity,
        },
        size: be.size,
        depth: be.depth,
        angle: be.angle,
        altitude: be.altitude,
        style: be.style,
      };
    }

    // Gaussian Blur / Layer Blur
    if (effects.gaussianBlur && effects.gaussianBlur.enabled) {
      result.layerBlur = {
        radius: effects.gaussianBlur.radius,
      };
    }

    // Outer Glow
    if (effects.outerGlow && effects.outerGlow.enabled) {
      const og = effects.outerGlow;
      result.outerGlow = {
        color: {
          r: og.color.r / 255,
          g: og.color.g / 255,
          b: og.color.b / 255,
          a: og.opacity,
        },
        blur: og.blur,
        spread: og.spread,
      };
    }

    // Inner Glow
    if (effects.innerGlow && effects.innerGlow.enabled) {
      const ig = effects.innerGlow;
      result.innerGlow = {
        color: {
          r: ig.color.r / 255,
          g: ig.color.g / 255,
          b: ig.color.b / 255,
          a: ig.opacity,
        },
        blur: ig.blur,
        spread: ig.spread,
      };
    }

    // Solid Fill (Color Overlay)
    if (effects.solidFill && effects.solidFill.enabled) {
      const sf = effects.solidFill;
      result.solidFill = {
        color: {
          r: sf.color.r / 255,
          g: sf.color.g / 255,
          b: sf.color.b / 255,
          a: sf.opacity,
        },
        blendMode: BLEND_MODE_MAP[sf.blendMode] || 'NORMAL',
      };
    }

    // Gradient Overlay
    if (effects.gradientOverlay && effects.gradientOverlay.enabled) {
      const go = effects.gradientOverlay;
      result.gradientOverlay = {
        type: go.type,
        angle: go.angle,
        stops: go.colors.map(c => ({
          position: c.location / 100,
          color: {
            r: c.color.r / 255,
            g: c.color.g / 255,
            b: c.color.b / 255,
            a: c.color.a,
          },
        })),
        blendMode: BLEND_MODE_MAP[go.blendMode] || 'NORMAL',
      };
    }

    // Satin
    if (effects.satin && effects.satin.enabled) {
      const sa = effects.satin;
      result.satin = {
        color: {
          r: sa.color.r / 255,
          g: sa.color.g / 255,
          b: sa.color.b / 255,
          a: sa.opacity,
        },
        angle: sa.angle,
        distance: sa.distance,
        size: sa.size,
        blendMode: BLEND_MODE_MAP[sa.blendMode] || 'MULTIPLY',
      };
    }

    return result;
  }

  // 스마트 필터 변환
  private convertSmartFilters(filters: SmartFilter[]): FigmaSmartFilter[] {
    return filters.map(f => {
      const result: FigmaSmartFilter = {
        type: f.type,
        enabled: f.enabled,
        opacity: f.opacity,
        blendMode: f.blendMode,
      };

      if (f.settings) {
        if (f.settings.radius !== undefined) result.radius = f.settings.radius;
        if (f.settings.angle !== undefined) result.angle = f.settings.angle;
        if (f.settings.distance !== undefined) result.distance = f.settings.distance;
        if (f.settings.amount !== undefined) result.amount = f.settings.amount;
        if (f.settings.threshold !== undefined) result.threshold = f.settings.threshold;
      }

      return result;
    });
  }

  // 벡터 경로를 SVG path 데이터로 변환
  private convertPathsToSvg(
    paths: { type: string; closed?: boolean; points?: { x: number; y: number; beforeX?: number; beforeY?: number; afterX?: number; afterY?: number }[] }[] | undefined,
    bounds: { left: number; top: number; width: number; height: number }
  ): string | undefined {
    if (!paths || paths.length === 0) return undefined;

    const svgPaths: string[] = [];

    for (const path of paths) {
      if (!path.points || path.points.length === 0) continue;

      const commands: string[] = [];
      const points = path.points;

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        // 좌표를 레이어 로컬 좌표로 변환
        const x = pt.x - bounds.left;
        const y = pt.y - bounds.top;

        if (i === 0) {
          commands.push(`M ${x.toFixed(2)} ${y.toFixed(2)}`);
        } else {
          const prevPt = points[i - 1];
          const prevAfterX = (prevPt.afterX ?? prevPt.x) - bounds.left;
          const prevAfterY = (prevPt.afterY ?? prevPt.y) - bounds.top;
          const currBeforeX = (pt.beforeX ?? pt.x) - bounds.left;
          const currBeforeY = (pt.beforeY ?? pt.y) - bounds.top;

          // 직선인지 곡선인지 확인
          const isStraight =
            Math.abs(prevAfterX - (prevPt.x - bounds.left)) < 0.01 &&
            Math.abs(prevAfterY - (prevPt.y - bounds.top)) < 0.01 &&
            Math.abs(currBeforeX - x) < 0.01 &&
            Math.abs(currBeforeY - y) < 0.01;

          if (isStraight) {
            commands.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
          } else {
            commands.push(`C ${prevAfterX.toFixed(2)} ${prevAfterY.toFixed(2)} ${currBeforeX.toFixed(2)} ${currBeforeY.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`);
          }
        }
      }

      // 닫힌 경로인 경우
      if (path.closed !== false && points.length > 2) {
        const firstPt = points[0];
        const lastPt = points[points.length - 1];
        const x = firstPt.x - bounds.left;
        const y = firstPt.y - bounds.top;

        const lastAfterX = (lastPt.afterX ?? lastPt.x) - bounds.left;
        const lastAfterY = (lastPt.afterY ?? lastPt.y) - bounds.top;
        const firstBeforeX = (firstPt.beforeX ?? firstPt.x) - bounds.left;
        const firstBeforeY = (firstPt.beforeY ?? firstPt.y) - bounds.top;

        const isStraight =
          Math.abs(lastAfterX - (lastPt.x - bounds.left)) < 0.01 &&
          Math.abs(lastAfterY - (lastPt.y - bounds.top)) < 0.01 &&
          Math.abs(firstBeforeX - x) < 0.01 &&
          Math.abs(firstBeforeY - y) < 0.01;

        if (isStraight) {
          commands.push('Z');
        } else {
          commands.push(`C ${lastAfterX.toFixed(2)} ${lastAfterY.toFixed(2)} ${firstBeforeX.toFixed(2)} ${firstBeforeY.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} Z`);
        }
      }

      svgPaths.push(commands.join(' '));
    }

    return svgPaths.join(' ');
  }

  // 벡터 스트로크 변환
  private convertVectorStroke(stroke: VectorStroke): FigmaVectorStroke {
    return {
      color: {
        r: stroke.color.r / 255,
        g: stroke.color.g / 255,
        b: stroke.color.b / 255,
        a: stroke.color.a,
      },
      width: stroke.width,
      alignment: stroke.lineAlignment.toUpperCase(),
      cap: stroke.lineCap.toUpperCase(),
      join: stroke.lineJoin.toUpperCase(),
      dashPattern: stroke.dashPattern,
    };
  }

  // 벡터 채우기 변환
  private convertVectorFill(fill: VectorFill): FigmaVectorFill {
    if (fill.type === 'solid' && fill.color) {
      return {
        type: 'solid',
        color: {
          r: fill.color.r / 255,
          g: fill.color.g / 255,
          b: fill.color.b / 255,
          a: fill.color.a,
        },
      };
    }
    if (fill.type === 'gradient' && fill.gradient) {
      return {
        type: 'gradient',
        gradient: {
          type: fill.gradient.type,
          angle: fill.gradient.angle,
          stops: fill.gradient.colors.map(c => ({
            position: c.location / 100,
            color: {
              r: c.color.r / 255,
              g: c.color.g / 255,
              b: c.color.b / 255,
              a: c.color.a,
            },
          })),
        },
      };
    }
    return { type: 'solid', color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } };
  }

  // 조정 레이어 변환
  private convertAdjustment(type: AdjustmentType, data?: AdjustmentData): FigmaAdjustment {
    const result: FigmaAdjustment = { type };

    if (data) {
      if (data.brightness !== undefined) result.brightness = data.brightness;
      if (data.contrast !== undefined) result.contrast = data.contrast;
      if (data.hue !== undefined) result.hue = data.hue;
      if (data.saturation !== undefined) result.saturation = data.saturation;
      if (data.lightness !== undefined) result.lightness = data.lightness;
      if (data.exposure !== undefined) result.exposure = data.exposure;
      if (data.vibrance !== undefined) result.vibrance = data.vibrance;
      if (data.levels !== undefined) result.levels = data.levels;
      if (data.threshold !== undefined) result.threshold = data.threshold;
    }

    return result;
  }

  // 결과를 파일로 저장
  async saveOutput(result: ConversionResult, outputDir: string): Promise<string[]> {
    const savedFiles: string[] = [];

    // 출력 디렉토리 생성
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // JSON 파일 저장
    const jsonPath = path.join(outputDir, `${result.figmaData.name}_figma.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result.figmaData, null, 2), 'utf-8');
    savedFiles.push(jsonPath);

    // 이미지 디렉토리 생성
    const imagesDir = path.join(outputDir, 'images');
    if (result.imageFiles.size > 0 && !fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // 이미지 파일 저장
    for (const [fileName, buffer] of result.imageFiles) {
      const imagePath = path.join(imagesDir, fileName);
      fs.writeFileSync(imagePath, buffer);
      savedFiles.push(imagePath);
    }

    return savedFiles;
  }
}
