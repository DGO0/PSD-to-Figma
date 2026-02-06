/**
 * JSON + 이미지를 합성하여 "Figma가 렌더링할 결과"를 로컬에서 시뮬레이션
 * PSD preview와 비교하여 converter 품질을 측정
 */
import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';

interface FigmaNode {
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
  locked?: boolean;
  imageFileName?: string;
  clipping?: boolean;
  placedLayer?: boolean;
  mask?: boolean | { enabled: boolean; bounds: { x: number; y: number; width: number; height: number }; visibleBounds?: { x: number; y: number; width: number; height: number }; imageFileName?: string; defaultColor?: number };
  children?: FigmaNode[];
  vectorFill?: {
    type: string;
    color: { r: number; g: number; b: number; a: number };
  };
  vectorMask?: {
    enabled: boolean;
    pathData: string;
  };
  vectorStroke?: {
    color: { r: number; g: number; b: number; a: number };
    width: number;
  };
  text?: string;
  textStyle?: {
    fontFamily: string;
    fontStyle: string;
    fontSize: number;
    color: { r: number; g: number; b: number; a: number };
    lineHeight?: number;
    letterSpacing?: number;
    textAlign?: string;
  };
  textTransform?: {
    scaleX: number;
    scaleY: number;
    tx: number;
    ty: number;
  };
  styleRuns?: Array<{
    text: string;
    fontFamily?: string;
    fontStyle?: string;
    fontSize?: number;
  }>;
  dropShadow?: any;
  layerEffects?: any;
  effects?: {
    solidFill?: { color: { r: number; g: number; b: number; a: number }; blendMode?: string };
    gradientOverlay?: { type: string; angle: number; stops: { position: number; color: { r: number; g: number; b: number; a: number } }[]; blendMode?: string };
    dropShadow?: any;
    innerShadow?: any;
    stroke?: any;
  };
}

interface FigmaExport {
  version: string;
  name: string;
  canvas: { width: number; height: number };
  nodes: FigmaNode[];
}

function mapBlendMode(mode: string): string {
  const map: Record<string, string> = {
    'NORMAL': 'source-over',
    'MULTIPLY': 'multiply',
    'SCREEN': 'screen',
    'OVERLAY': 'overlay',
    'DARKEN': 'darken',
    'LIGHTEN': 'lighten',
    'COLOR_DODGE': 'color-dodge',
    'COLOR_BURN': 'color-burn',
    'HARD_LIGHT': 'hard-light',
    'SOFT_LIGHT': 'soft-light',
    'DIFFERENCE': 'difference',
    'EXCLUSION': 'exclusion',
  };
  return map[mode] || 'source-over';
}

/**
 * 노드 리스트를 평탄화 (GROUP children을 펼침)
 */
function flattenNodes(nodes: FigmaNode[]): FigmaNode[] {
  const result: FigmaNode[] = [];
  for (const node of nodes) {
    if (node.type === 'GROUP' && node.children && node.children.length > 0) {
      if (!node.visible) continue; // 그룹이 숨겨져있으면 자식도 스킵

      // 그룹 자식을 재귀적으로 평탄화
      const children = flattenNodes(node.children);

      // 그룹에 mask가 있으면 그룹 bounds로 클리핑 적용
      if (node.mask) {
        // 마스크 그룹: 첫번째 자식이 마스크 역할, 나머지가 클리핑
        result.push(...children);
      } else {
        result.push(...children);
      }
    } else {
      result.push(node);
    }
  }
  return result;
}

/**
 * 클리핑 그룹 분석
 */
function analyzeClippingGroups(nodes: FigmaNode[]): Array<{ base: FigmaNode; clipped: FigmaNode[] }> {
  const groups: Array<{ base: FigmaNode; clipped: FigmaNode[] }> = [];
  let currentGroup: { base: FigmaNode; clipped: FigmaNode[] } | null = null;

  for (const node of nodes) {
    if (!node.clipping) {
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentGroup = { base: node, clipped: [] };
    } else {
      if (currentGroup) {
        currentGroup.clipped.push(node);
      } else {
        groups.push({ base: node, clipped: [] });
      }
    }
  }
  if (currentGroup) {
    groups.push(currentGroup);
  }
  return groups;
}

/**
 * JSON + 이미지를 합성 렌더링
 */
export async function compositeRender(jsonPath: string, imagesDir: string, outputPath: string): Promise<string> {
  console.log('=== Composite 렌더링 시작 ===');
  console.log(`JSON: ${jsonPath}`);
  console.log(`Images: ${imagesDir}`);

  const data: FigmaExport = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const { width, height } = data.canvas;
  console.log(`캔버스 크기: ${width} x ${height}`);
  console.log(`노드 수: ${data.nodes.length}`);

  // 노드 평탄화 (GROUP 펼치기)
  const flatNodes = flattenNodes(data.nodes);
  console.log(`평탄화 후 노드 수: ${flatNodes.length}`);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 흰색 배경
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // 클리핑 그룹 분석
  const groups = analyzeClippingGroups(flatNodes);
  console.log(`클리핑 그룹 수: ${groups.length}`);

  let rendered = 0;
  for (const group of groups) {
    const { base, clipped } = group;

    if (!base.visible) continue;

    if (clipped.length === 0) {
      await renderNode(ctx, base, imagesDir, width, height);
    } else {
      // 클리핑 그룹
      const tempCanvas = createCanvas(width, height);
      const tempCtx = tempCanvas.getContext('2d');

      await renderNode(tempCtx, base, imagesDir, width, height);

      for (const clipNode of clipped) {
        if (!clipNode.visible) continue;
        tempCtx.globalCompositeOperation = 'source-atop' as any;
        tempCtx.globalAlpha = clipNode.opacity;
        await renderNodeDirect(tempCtx, clipNode, imagesDir);
        tempCtx.globalCompositeOperation = 'source-over' as any;
        tempCtx.globalAlpha = 1;
      }

      ctx.globalCompositeOperation = mapBlendMode(base.blendMode) as any;
      ctx.globalAlpha = 1;
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.globalCompositeOperation = 'source-over' as any;
      ctx.globalAlpha = 1;
    }

    rendered++;
    if (rendered % 10 === 0) {
      console.log(`  렌더링 진행: ${rendered}/${groups.length}`);
    }
  }

  const pngBuffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`\nComposite 저장: ${outputPath}`);
  console.log(`파일 크기: ${(pngBuffer.length / 1024).toFixed(1)} KB`);

  return outputPath;
}

async function renderNode(ctx: CanvasRenderingContext2D, node: FigmaNode, imagesDir: string, canvasW: number, canvasH: number): Promise<void> {
  ctx.save();
  ctx.globalCompositeOperation = mapBlendMode(node.blendMode) as any;
  ctx.globalAlpha = node.opacity;

  // mask 노드: 마스크 이미지가 있으면 알파 마스크로 적용
  // defaultColor: 0=마스크 밖 숨김, 255=마스크 밖 표시
  if (node.mask && typeof node.mask === 'object') {
    const m = node.mask as any;
    const defaultColor = m.defaultColor != null ? m.defaultColor : 0;

    // defaultColor=255: 마스크 밖이 보이므로 클리핑 불필요, 그냥 렌더링
    if (defaultColor === 255) {
      await renderNodeDirect(ctx, node, imagesDir);
      ctx.restore();
      return;
    }

    if (m.imageFileName && m.bounds) {
      // 마스크 이미지를 로드하여 알파 채널로 사용
      const maskPath = path.join(imagesDir, m.imageFileName);
      if (fs.existsSync(maskPath)) {
        try {
          const maskBuffer = fs.readFileSync(maskPath);
          const maskImg = await loadImage(maskBuffer);

          // 마스크 이미지의 밝기를 알파 채널로 변환
          const maskCanvas = createCanvas(canvasW, canvasH);
          const maskCtx = maskCanvas.getContext('2d');

          // defaultColor=0: 마스크 외부는 검은색(투명 = 숨김)
          maskCtx.fillStyle = 'rgba(0,0,0,0)';
          maskCtx.clearRect(0, 0, canvasW, canvasH);
          // 마스크 이미지를 bounds 위치에 그리기
          maskCtx.drawImage(maskImg, m.bounds.x, m.bounds.y, m.bounds.width, m.bounds.height);

          const maskData = maskCtx.getImageData(0, 0, canvasW, canvasH);
          // 그레이스케일 밝기 → 알파 변환 (R채널 사용, RGB는 흰색으로)
          for (let i = 0; i < maskData.data.length; i += 4) {
            const luminance = maskData.data[i]; // R (그레이스케일이므로 R=G=B)
            maskData.data[i] = 255;     // R
            maskData.data[i + 1] = 255; // G
            maskData.data[i + 2] = 255; // B
            maskData.data[i + 3] = luminance; // A = 원래 밝기
          }
          maskCtx.putImageData(maskData, 0, 0);

          // 임시 캔버스에 노드 렌더링
          const tempCanvas2 = createCanvas(canvasW, canvasH);
          const tempCtx2 = tempCanvas2.getContext('2d');
          await renderNodeDirect(tempCtx2, node, imagesDir);

          // 마스크 알파로 클리핑
          tempCtx2.globalCompositeOperation = 'destination-in' as any;
          tempCtx2.drawImage(maskCanvas, 0, 0);

          // 결과를 원래 캔버스에 합성
          ctx.drawImage(tempCanvas2, 0, 0);
          ctx.restore();
          return;
        } catch (e: any) {
          console.warn(`  마스크 적용 실패: ${node.name} - ${e.message}`);
        }
      }
    }
  }

  await renderNodeDirect(ctx, node, imagesDir);

  ctx.restore();
}

async function renderNodeDirect(ctx: CanvasRenderingContext2D, node: FigmaNode, imagesDir: string): Promise<void> {
  // 벡터 도형 (solid fill) 또는 effects fill
  let hasFill = false;
  if (node.vectorFill && node.vectorFill.type === 'solid') {
    const c = node.vectorFill.color;
    ctx.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;
    hasFill = true;
  }

  // effects.solidFill (Color Overlay) 덮어쓰기
  if (node.effects && node.effects.solidFill) {
    const sf = node.effects.solidFill;
    const c = sf.color;
    const r = c.r > 1 ? c.r / 255 : c.r;
    const g = c.g > 1 ? c.g / 255 : c.g;
    const b = c.b > 1 ? c.b / 255 : c.b;
    ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${c.a})`;
    hasFill = true;
  }

  if (hasFill) {
    if (node.vectorMask && node.vectorMask.pathData) {
      drawSvgPath(ctx, node.vectorMask.pathData, node.x, node.y);
      ctx.fill();
    } else {
      ctx.fillRect(node.x, node.y, node.width, node.height);
    }
  }

  // 이미지 레이어
  if (node.imageFileName) {
    const imagePath = path.join(imagesDir, node.imageFileName);
    if (fs.existsSync(imagePath)) {
      try {
        // Buffer로 읽어서 전달 (Windows에서 한글 파일명 loadImage 호환 문제 해결)
        const imgBuffer = fs.readFileSync(imagePath);
        const img = await loadImage(imgBuffer);
        ctx.drawImage(img, node.x, node.y, node.width, node.height);
      } catch (e: any) {
        console.warn(`  이미지 로드 실패: ${node.imageFileName} - ${e.message}`);
      }
    } else {
      console.warn(`  이미지 없음: ${node.imageFileName}`);
    }
  }

  // 텍스트 레이어
  if (node.type === 'TEXT' && node.text && node.textStyle) {
    renderText(ctx, node);
  }

  // 벡터 스트로크
  if (node.vectorStroke) {
    const s = node.vectorStroke;
    ctx.strokeStyle = `rgba(${Math.round(s.color.r * 255)}, ${Math.round(s.color.g * 255)}, ${Math.round(s.color.b * 255)}, ${s.color.a})`;
    ctx.lineWidth = s.width;
    if (node.vectorMask && node.vectorMask.pathData) {
      drawSvgPath(ctx, node.vectorMask.pathData, node.x, node.y);
      ctx.stroke();
    } else {
      ctx.strokeRect(node.x, node.y, node.width, node.height);
    }
  }
}

function drawSvgPath(ctx: CanvasRenderingContext2D, pathData: string, offsetX: number, offsetY: number): void {
  ctx.beginPath();
  const commands = pathData.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || [];

  for (const cmd of commands) {
    const type = cmd[0];
    const nums = cmd.slice(1).trim().split(/[\s,]+/).map(Number);

    switch (type) {
      case 'M':
        ctx.moveTo(nums[0] + offsetX, nums[1] + offsetY);
        break;
      case 'L':
        ctx.lineTo(nums[0] + offsetX, nums[1] + offsetY);
        break;
      case 'C':
        ctx.bezierCurveTo(
          nums[0] + offsetX, nums[1] + offsetY,
          nums[2] + offsetX, nums[3] + offsetY,
          nums[4] + offsetX, nums[5] + offsetY
        );
        break;
      case 'Q':
        ctx.quadraticCurveTo(
          nums[0] + offsetX, nums[1] + offsetY,
          nums[2] + offsetX, nums[3] + offsetY
        );
        break;
      case 'Z':
      case 'z':
        ctx.closePath();
        break;
    }
  }
}

function renderText(ctx: CanvasRenderingContext2D, node: FigmaNode): void {
  if (!node.textStyle || !node.text) return;

  const style = node.textStyle;
  const transform = node.textTransform;

  ctx.save();

  if (transform) {
    ctx.translate(transform.tx, transform.ty);
    ctx.scale(transform.scaleX, transform.scaleY);
  }

  const fontWeight = style.fontStyle?.includes('Bold') || style.fontStyle?.includes('ExtraBold') ? 'bold' :
                     style.fontStyle?.includes('SemiBold') ? '600' :
                     style.fontStyle?.includes('Medium') ? '500' : 'normal';
  ctx.font = `${fontWeight} ${style.fontSize}px "${style.fontFamily}", "Pretendard", "Malgun Gothic", sans-serif`;
  ctx.fillStyle = `rgba(${style.color.r}, ${style.color.g}, ${style.color.b}, ${style.color.a})`;
  ctx.textAlign = (style.textAlign as any) || 'left';
  ctx.textBaseline = 'top';

  const lines = node.text.split('\n');
  const lineHeight = style.lineHeight || style.fontSize * 1.2;

  // 텍스트 렌더링: transform이 있으면 tx/ty 기준, 없으면 x/y 기준
  if (transform && transform.tx !== undefined && transform.ty !== undefined) {
    // tx/ty는 텍스트 앵커 위치 (transform 내에서 이미 translate됨)
    // 전체 텍스트 높이 계산
    const totalHeight = lineHeight * lines.length;
    let yOffset = -totalHeight / 2;
    for (const line of lines) {
      // 텍스트 측정하여 중앙 정렬
      const metrics = ctx.measureText(line);
      const xPos = style.textAlign === 'center' ? -metrics.width / 2 : 0;
      ctx.fillText(line, xPos, yOffset);
      yOffset += lineHeight;
    }
  } else {
    let yPos = node.y;
    for (const line of lines) {
      const xPos = style.textAlign === 'center' ? node.x + node.width / 2 : node.x;
      ctx.fillText(line, xPos, yPos);
      yPos += lineHeight;
    }
  }

  ctx.restore();
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: node compositeRender.js <output-dir> [output-file]');
    console.log('  output-dir: _figma.json과 images/ 폴더가 있는 디렉토리');
    process.exit(1);
  }

  const outputDir = args[0];

  const jsonFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('_figma.json'));
  if (jsonFiles.length === 0) {
    console.error('_figma.json 파일을 찾을 수 없습니다.');
    process.exit(1);
  }

  const jsonPath = path.join(outputDir, jsonFiles[0]);
  const imagesDir = path.join(outputDir, 'images');
  const baseName = jsonFiles[0].replace('_figma.json', '');
  const outputFile = args[1] || path.join(outputDir, `${baseName}_composite.png`);

  compositeRender(jsonPath, imagesDir, outputFile)
    .then(() => console.log('완료'))
    .catch(err => {
      console.error('오류:', err.message);
      process.exit(1);
    });
}
