// 레이어 색상 태그 (Photoshop 레이어 색상 라벨)
export type LayerColor = 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'gray';

// PSD 레이어 타입 정의
export interface PsdLayerInfo {
  name: string;
  type: 'group' | 'layer' | 'text' | 'shape' | 'adjustment';
  visible: boolean;
  opacity: number;
  blendMode: string;
  color?: LayerColor;  // 레이어 색상 태그
  locked?: boolean;    // 레이어 잠금 상태
  bounds: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  children?: PsdLayerInfo[];
  textData?: TextLayerData;
  imageData?: Buffer;
  effects?: LayerEffects;
  adjustmentType?: AdjustmentType;
  adjustmentData?: AdjustmentData;
  smartFilters?: SmartFilter[];
  // 마스크 관련
  clipping?: boolean;
  mask?: LayerMask;
  vectorMask?: VectorMask;
  // 벡터 관련
  vectorStroke?: VectorStroke;
  vectorFill?: VectorFill;
  // 배치된 레이어
  placedLayer?: PlacedLayerInfo;
}

// 레이어 마스크
export interface LayerMask {
  enabled: boolean;
  bounds: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  defaultColor: number;
  imageData?: Buffer;
}

// 벡터 마스크
export interface VectorMask {
  enabled: boolean;
  paths: VectorPath[];
}

export interface VectorPath {
  type: 'rect' | 'ellipse' | 'polygon' | 'path';
  points?: { x: number; y: number }[];
  // rect/ellipse용
  bounds?: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  cornerRadius?: number;
}

// 벡터 스트로크
export interface VectorStroke {
  enabled: boolean;
  color: RGBAColor;
  width: number;
  lineAlignment: 'inside' | 'center' | 'outside';
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  dashPattern?: number[];
}

// 벡터 채우기
export interface VectorFill {
  type: 'solid' | 'gradient' | 'pattern';
  color?: RGBAColor;
  gradient?: GradientOverlayEffect;
}

// 배치된 레이어 정보
export interface PlacedLayerInfo {
  type: 'embedded' | 'linked';
  transform?: {
    xx: number;
    xy: number;
    yx: number;
    yy: number;
    tx: number;
    ty: number;
  };
  width?: number;
  height?: number;
}

// 레이어 효과
export interface LayerEffects {
  dropShadow?: ShadowEffect | ShadowEffect[];
  innerShadow?: ShadowEffect | ShadowEffect[];
  outerGlow?: GlowEffect;
  innerGlow?: GlowEffect;
  stroke?: StrokeEffect | StrokeEffect[];
  bevelEmboss?: BevelEmbossEffect;
  gaussianBlur?: GaussianBlurEffect;
  solidFill?: SolidFillEffect;
  gradientOverlay?: GradientOverlayEffect;
  satin?: SatinEffect;
  patternOverlay?: PatternOverlayEffect;
}

export interface ShadowEffect {
  enabled: boolean;
  color: RGBAColor;
  opacity: number;
  angle: number;
  distance: number;
  blur: number;
  spread: number;
}

export interface GlowEffect {
  enabled: boolean;
  color: RGBAColor;
  opacity: number;
  blur: number;
  spread: number;
}

export interface StrokeEffect {
  enabled: boolean;
  color?: RGBAColor;
  size: number;
  position: 'inside' | 'center' | 'outside';
  opacity: number;
  // 그라디언트 스트로크
  fillType?: 'solid' | 'gradient' | 'pattern';
  gradient?: GradientOverlayEffect;
}

export interface BevelEmbossEffect {
  enabled: boolean;
  style: 'outer-bevel' | 'inner-bevel' | 'emboss' | 'pillow-emboss' | 'stroke-emboss';
  technique: 'smooth' | 'chisel-hard' | 'chisel-soft';
  depth: number;
  direction: 'up' | 'down';
  size: number;
  soften: number;
  angle: number;
  altitude: number;
  highlightMode: string;
  highlightColor: RGBAColor;
  highlightOpacity: number;
  shadowMode: string;
  shadowColor: RGBAColor;
  shadowOpacity: number;
}

export interface GaussianBlurEffect {
  enabled: boolean;
  radius: number;
}

export interface SolidFillEffect {
  enabled: boolean;
  color: RGBAColor;
  opacity: number;
  blendMode: string;
}

export interface GradientOverlayEffect {
  enabled: boolean;
  opacity: number;
  blendMode: string;
  angle: number;
  type: 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond';
  colors: GradientStop[];
  reverse: boolean;
  scale: number;
}

export interface GradientStop {
  location: number; // 0-100
  color: RGBAColor;
}

export interface SatinEffect {
  enabled: boolean;
  color: RGBAColor;
  opacity: number;
  angle: number;
  distance: number;
  size: number;
  blendMode: string;
  invert: boolean;
}

export interface PatternOverlayEffect {
  enabled: boolean;
  opacity: number;
  blendMode: string;
  scale: number;
  patternName?: string;
  patternId?: string;
  patternData?: Buffer; // 패턴 이미지 데이터
}

// 조정 레이어 타입
export type AdjustmentType =
  | 'brightness-contrast'
  | 'levels'
  | 'curves'
  | 'exposure'
  | 'vibrance'
  | 'hue-saturation'
  | 'color-balance'
  | 'black-white'
  | 'photo-filter'
  | 'channel-mixer'
  | 'color-lookup'
  | 'invert'
  | 'posterize'
  | 'threshold'
  | 'gradient-map'
  | 'selective-color';

// 조정 레이어 데이터
export interface AdjustmentData {
  // Brightness/Contrast
  brightness?: number;
  contrast?: number;
  // Hue/Saturation
  hue?: number;
  saturation?: number;
  lightness?: number;
  // Levels
  inputBlack?: number;
  inputWhite?: number;
  outputBlack?: number;
  outputWhite?: number;
  gamma?: number;
  // Exposure
  exposure?: number;
  offset?: number;
  gammaCorrection?: number;
  // Color Balance
  cyanRed?: number;
  magentaGreen?: number;
  yellowBlue?: number;
  // Vibrance
  vibrance?: number;
  // Photo Filter
  filterColor?: RGBAColor;
  density?: number;
  // Posterize
  levels?: number;
  // Threshold
  threshold?: number;
}

// 스마트 필터
export interface SmartFilter {
  type: SmartFilterType;
  enabled: boolean;
  opacity?: number;
  blendMode?: string;
  settings?: SmartFilterSettings;
}

export type SmartFilterType =
  | 'gaussian-blur'
  | 'motion-blur'
  | 'radial-blur'
  | 'surface-blur'
  | 'sharpen'
  | 'unsharp-mask'
  | 'noise'
  | 'dust-scratches';

export interface SmartFilterSettings {
  // Gaussian Blur
  radius?: number;
  // Motion Blur
  angle?: number;
  distance?: number;
  // Unsharp Mask
  amount?: number;
  threshold?: number;
  // Noise
  noiseAmount?: number;
  distribution?: 'uniform' | 'gaussian';
  monochromatic?: boolean;
}

export interface TextLayerData {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontStyle?: string;
  color: RGBAColor;
  lineHeight?: number;
  letterSpacing?: number;
  // 텍스트 정렬
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  // 텍스트 장식
  underline?: boolean;
  strikethrough?: boolean;
  // 멀티 스타일 텍스트 (여러 스타일이 혼합된 경우)
  styleRuns?: TextStyleRun[];
  // 텍스트 변환 (회전, 스케일 등)
  transform?: TextTransform;
}

// 텍스트 변환 매트릭스
export interface TextTransform {
  // 2D 아핀 변환 [xx, xy, yx, yy, tx, ty]
  xx: number;  // 스케일 X / cos(angle)
  xy: number;  // 기울임 X / sin(angle)
  yx: number;  // 기울임 Y / -sin(angle)
  yy: number;  // 스케일 Y / cos(angle)
  tx: number;  // 이동 X
  ty: number;  // 이동 Y
  // 계산된 값
  rotation?: number;  // 회전 각도 (도)
  scaleX?: number;
  scaleY?: number;
}

// 텍스트 스타일 런 (멀티 스타일 텍스트용)
export interface TextStyleRun {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  color?: RGBAColor;
  letterSpacing?: number;
  underline?: boolean;
  strikethrough?: boolean;
}

export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ParsedPsd {
  width: number;
  height: number;
  layers: PsdLayerInfo[];
  name: string;
  // 전역 기능
  guides?: Guide[];
  grid?: GridInfo;
  slices?: Slice[];
  resolution?: ResolutionInfo;
}

// 안내선
export interface Guide {
  location: number;
  direction: 'horizontal' | 'vertical';
}

// 그리드
export interface GridInfo {
  horizontal: number;
  vertical: number;
  subdivisions?: number;
}

// 슬라이스
export interface Slice {
  id: number;
  name: string;
  bounds: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  url?: string;
}

// 해상도 정보
export interface ResolutionInfo {
  horizontal: number;
  horizontalUnit: 'PPI' | 'PPCM';
  vertical: number;
  verticalUnit: 'PPI' | 'PPCM';
}

// Figma API 타입 정의
export interface FigmaNode {
  id?: string;
  name: string;
  type: 'FRAME' | 'GROUP' | 'RECTANGLE' | 'TEXT' | 'VECTOR';
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  blendMode?: string;
  children?: FigmaNode[];
  fills?: FigmaFill[];
  characters?: string;
  style?: FigmaTextStyle;
}

export interface FigmaFill {
  type: 'SOLID' | 'IMAGE' | 'GRADIENT_LINEAR';
  color?: { r: number; g: number; b: number; a: number };
  imageRef?: string;
}

export interface FigmaTextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeightPx?: number;
  letterSpacing?: number;
}

export interface FigmaFile {
  name: string;
  document: {
    children: FigmaNode[];
  };
}

// 변환 옵션
export interface ConvertOptions {
  figmaToken: string;
  figmaFileKey?: string;
  outputDir?: string;
  preserveGroups: boolean;
  exportImages: boolean;
  streamImages?: boolean;  // 이미지를 즉시 파일로 쓰고 메모리 해제
}

// 블렌드 모드 매핑
export const BLEND_MODE_MAP: Record<string, string> = {
  'normal': 'NORMAL',
  'multiply': 'MULTIPLY',
  'screen': 'SCREEN',
  'overlay': 'OVERLAY',
  'darken': 'DARKEN',
  'lighten': 'LIGHTEN',
  'color-dodge': 'COLOR_DODGE',
  'color-burn': 'COLOR_BURN',
  'hard-light': 'HARD_LIGHT',
  'soft-light': 'SOFT_LIGHT',
  'difference': 'DIFFERENCE',
  'exclusion': 'EXCLUSION',
  'hue': 'HUE',
  'saturation': 'SATURATION',
  'color': 'COLOR',
  'luminosity': 'LUMINOSITY',
};
