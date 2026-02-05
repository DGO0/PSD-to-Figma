"use strict";
// Figma Plugin - PSD Import
// 이 코드를 Figma Plugin으로 사용하세요
// 이미지 저장소 (UI에서 전달받은 이미지 데이터)
let imageStore = new Map();
// 안전하게 base64 디코딩
function safeBase64Decode(data) {
    if (typeof data === 'string' && data.length > 0) {
        try {
            return figma.base64Decode(data);
        }
        catch (e) {
            console.error('base64Decode failed:', e);
            return null;
        }
    }
    return null;
}
// Figma Plugin 메인 함수
figma.showUI(__html__, { width: 450, height: 350 });
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'import-psd') {
        if (!msg.data) {
            figma.notify('No data provided');
            return;
        }
        try {
            // 이미지 데이터 변환 및 저장
            if (msg.images && typeof msg.images === 'object') {
                imageStore.clear();
                const imageEntries = Object.entries(msg.images);
                console.log(`Received ${imageEntries.length} images from UI`);
                for (const [fileName, base64Data] of imageEntries) {
                    const decoded = safeBase64Decode(base64Data);
                    if (decoded) {
                        imageStore.set(fileName, decoded);
                    }
                    else {
                        console.log(`Failed to decode image: ${fileName}`);
                    }
                }
                console.log(`Successfully loaded ${imageStore.size} images`);
                // 처음 5개 이미지 이름 로그
                const imageNames = Array.from(imageStore.keys()).slice(0, 5);
                console.log(`First images: ${imageNames.join(', ')}`);
            }
            else {
                console.log('No images received from UI');
            }
            await importPsdData(msg.data);
            figma.notify('PSD imported successfully!');
            // UI에 완료 메시지 전송
            figma.ui.postMessage({ type: 'import-complete' });
        }
        catch (error) {
            figma.notify(`Error: ${error}`);
            console.error(error);
        }
    }
    if (msg.type === 'cancel') {
        figma.closePlugin();
    }
};
// Figma에 제어 양보 (UI 멈춤 방지)
function yieldToFigma() {
    return new Promise(resolve => setTimeout(resolve, 0));
}
// 노드 개수 카운트
function countNodes(nodes) {
    let count = 0;
    for (const node of nodes) {
        count++;
        if (node.children) {
            count += countNodes(node.children);
        }
    }
    return count;
}
let processedNodes = 0;
let totalNodes = 0;
async function importPsdData(data) {
    // 전체 노드 수 계산
    totalNodes = countNodes(data.nodes);
    processedNodes = 0;
    console.log(`Total nodes to process: ${totalNodes}`);
    figma.notify(`${totalNodes}개 노드 처리 시작...`, { timeout: 2000 });
    // 메인 프레임 생성
    const mainFrame = figma.createFrame();
    mainFrame.name = data.name;
    mainFrame.resize(data.canvas.width, data.canvas.height);
    mainFrame.x = figma.viewport.center.x - data.canvas.width / 2;
    mainFrame.y = figma.viewport.center.y - data.canvas.height / 2;
    mainFrame.clipsContent = true;
    // 클리핑 그룹을 처리하면서 노드 생성
    await createNodesWithClipping(data.nodes, mainFrame);
    // 뷰포트를 프레임으로 이동
    figma.viewport.scrollAndZoomIntoView([mainFrame]);
    figma.currentPage.selection = [mainFrame];
    console.log(`Import complete: ${processedNodes} nodes processed`);
}
// 클리핑 마스크를 처리하면서 노드 생성
async function createNodesWithClipping(nodes, parent) {
    let i = 0;
    while (i < nodes.length) {
        const currentNode = nodes[i];
        // 클리핑 그룹 찾기: 현재 노드가 베이스이고 다음 노드들이 clipping인 경우
        if (!currentNode.clipping) {
            // 다음 연속된 클리핑 레이어들 찾기
            const clippingNodes = [];
            let j = i + 1;
            while (j < nodes.length && nodes[j].clipping) {
                clippingNodes.push(nodes[j]);
                j++;
            }
            if (clippingNodes.length > 0) {
                // 클리핑 그룹 생성
                await createClippingGroup(currentNode, clippingNodes, parent);
                i = j; // 클리핑 노드들 건너뛰기
            }
            else {
                // 일반 노드 생성
                await createNode(currentNode, parent);
                i++;
            }
        }
        else {
            // 단독 클리핑 노드 (베이스 없이) - 일반 노드로 생성
            await createNode(currentNode, parent);
            i++;
        }
    }
}
// 클리핑 그룹 생성
async function createClippingGroup(baseNode, clippingNodes, parent) {
    // 클리핑 그룹용 프레임 생성
    const clipFrame = figma.createFrame();
    parent.appendChild(clipFrame);
    clipFrame.name = `${baseNode.name} [Clipping Group]`;
    clipFrame.x = baseNode.x;
    clipFrame.y = baseNode.y;
    clipFrame.resize(Math.max(1, baseNode.width), Math.max(1, baseNode.height));
    clipFrame.clipsContent = true;
    clipFrame.fills = []; // 배경 투명
    // 베이스 노드 생성 (마스크로 설정)
    const baseCreated = await createNodeInFrame(baseNode, clipFrame, 0, 0);
    if (baseCreated && 'isMask' in baseCreated) {
        // 먼저 채우기 정보 저장
        const savedFills = 'fills' in baseCreated ? [...baseCreated.fills] : [];
        // 마스크 설정
        baseCreated.isMask = true;
        // 채우기 복원 (마스크 설정으로 인해 사라질 수 있음)
        if (savedFills.length > 0 && 'fills' in baseCreated) {
            baseCreated.fills = savedFills;
        }
        console.log(`Clipping mask created: ${baseNode.name}, fills: ${savedFills.length}`);
    }
    // 클리핑된 노드들 생성
    for (const clipNode of clippingNodes) {
        const offsetX = clipNode.x - baseNode.x;
        const offsetY = clipNode.y - baseNode.y;
        await createNodeInFrame(clipNode, clipFrame, offsetX, offsetY);
    }
}
// 프레임 내부에 노드 생성 (오프셋 적용)
async function createNodeInFrame(nodeData, parent, offsetX, offsetY) {
    const node = await createNodeBase(nodeData, parent);
    if (node) {
        node.x = offsetX;
        node.y = offsetY;
        node.name = nodeData.name;
        node.visible = nodeData.visible;
        if ('opacity' in node) {
            node.opacity = nodeData.opacity;
        }
        if ('blendMode' in node && isValidBlendMode(nodeData.blendMode)) {
            node.blendMode = nodeData.blendMode;
        }
    }
    return node;
}
async function createNode(nodeData, parent) {
    // 진행률 업데이트 및 Figma에 제어 양보 (20개마다)
    processedNodes++;
    if (processedNodes % 20 === 0) {
        const percent = Math.round((processedNodes / totalNodes) * 100);
        console.log(`Processing: ${processedNodes}/${totalNodes} (${percent}%)`);
        await yieldToFigma();
    }
    let node = null;
    // 레이어 마스크가 있는 경우 마스크 프레임으로 감싸기
    if (nodeData.mask && nodeData.mask.enabled) {
        node = await createMaskedNode(nodeData, parent);
    }
    else {
        node = await createNodeBase(nodeData, parent);
    }
    if (node) {
        node.name = nodeData.name;
        node.visible = nodeData.visible;
        if ('opacity' in node) {
            node.opacity = nodeData.opacity;
        }
        if ('blendMode' in node && isValidBlendMode(nodeData.blendMode)) {
            node.blendMode = nodeData.blendMode;
        }
    }
    return node;
}
// 기본 노드 생성 (마스크 처리 없이)
async function createNodeBase(nodeData, parent) {
    let node = null;
    switch (nodeData.type) {
        case 'GROUP':
            node = await createGroup(nodeData, parent);
            break;
        case 'TEXT':
            node = await createText(nodeData, parent);
            break;
        case 'RECTANGLE':
        case 'VECTOR':
        default:
            node = await createRectangle(nodeData, parent);
            break;
    }
    return node;
}
// 레이어 마스크가 적용된 노드 생성
// 참고: Figma의 마스크는 포토샵 레이어 마스크와 다르게 작동함
// 포토샵: 마스크 이미지의 밝기로 투명도 결정
// Figma: 마스크 형태로 클리핑
// 현재는 마스크를 건너뛰고 콘텐츠만 표시 (마스크는 수동 적용 필요)
async function createMaskedNode(nodeData, parent) {
    // 마스크 없이 콘텐츠만 생성
    const contentNodeData = Object.assign(Object.assign({}, nodeData), { mask: undefined });
    const contentNode = await createNodeBase(contentNodeData, parent);
    if (contentNode) {
        // 레이어 이름에 마스크 표시 추가
        contentNode.name = `${nodeData.name} [has mask]`;
    }
    return contentNode;
}
async function createGroup(nodeData, parent) {
    if (!nodeData.children || nodeData.children.length === 0) {
        return null;
    }
    // 클리핑이 있는 그룹은 Frame으로 생성
    const hasClipping = nodeData.children.some(child => child.clipping);
    if (hasClipping) {
        // Frame으로 생성하여 클리핑 처리
        const frame = figma.createFrame();
        parent.appendChild(frame);
        frame.name = nodeData.name;
        frame.x = nodeData.x;
        frame.y = nodeData.y;
        frame.resize(Math.max(1, nodeData.width), Math.max(1, nodeData.height));
        frame.clipsContent = true;
        frame.fills = []; // 배경 투명
        // 자식 노드 상대 좌표 계산하여 생성
        const adjustedChildren = nodeData.children.map(child => (Object.assign(Object.assign({}, child), { x: child.x - nodeData.x, y: child.y - nodeData.y })));
        await createNodesWithClipping(adjustedChildren, frame);
        return frame;
    }
    // 일반 그룹
    const children = [];
    for (const childData of nodeData.children) {
        const child = await createNode(childData, parent);
        if (child) {
            children.push(child);
        }
    }
    if (children.length === 0) {
        return null;
    }
    const group = figma.group(children, parent);
    group.name = nodeData.name;
    group.x = nodeData.x;
    group.y = nodeData.y;
    return group;
}
// 폰트 매핑 테이블 (원본 폰트 → Figma 대체 폰트)
const FONT_MAPPING = {
    'Pretendard': {
        family: 'Inter',
        styleMap: {
            'Black': 'Bold',
            'ExtraBold': 'Bold',
            'Bold': 'Bold',
            'SemiBold': 'Semi Bold',
            'Medium': 'Medium',
            'Regular': 'Regular',
            'Light': 'Light',
            'ExtraLight': 'Light',
            'Thin': 'Thin',
        }
    },
    'Pretendard Variable': {
        family: 'Inter',
        styleMap: {
            'Black': 'Bold',
            'Bold': 'Bold',
            'SemiBold': 'Semi Bold',
            'Medium': 'Medium',
            'Regular': 'Regular',
            'Light': 'Light',
            'Thin': 'Thin',
        }
    },
    'MADEOuterSans': {
        family: 'Inter',
        styleMap: {
            'Black': 'Bold',
            'Bold': 'Bold',
            'Medium': 'Medium',
            'Regular': 'Regular',
            'Light': 'Light',
            'Thin': 'Thin',
        }
    },
    'MADEOuterSans-Medium': {
        family: 'Inter',
        styleMap: { 'Regular': 'Medium' }
    },
    'NanumGothic': {
        family: 'Inter',
        styleMap: {
            'Bold': 'Bold',
            'ExtraBold': 'Bold',
            'Regular': 'Regular',
        }
    },
    'NanumSquare': {
        family: 'Inter',
        styleMap: {
            'ExtraBold': 'Bold',
            'Bold': 'Bold',
            'Regular': 'Regular',
            'Light': 'Light',
        }
    },
    'Noto Sans KR': {
        family: 'Inter',
        styleMap: {
            'Black': 'Bold',
            'Bold': 'Bold',
            'Medium': 'Medium',
            'Regular': 'Regular',
            'Light': 'Light',
            'Thin': 'Thin',
        }
    },
};
// 기본 스타일 매핑 (매핑 테이블에 없는 폰트용)
const DEFAULT_STYLE_MAP = {
    'Black': 'Bold',
    'ExtraBold': 'Bold',
    'Bold': 'Bold',
    'SemiBold': 'Semi Bold',
    'Semi Bold': 'Semi Bold',
    'Medium': 'Medium',
    'Regular': 'Regular',
    'Light': 'Light',
    'ExtraLight': 'Light',
    'Extra Light': 'Light',
    'Thin': 'Thin',
    'Italic': 'Italic',
    'Bold Italic': 'Bold Italic',
    'BoldItalic': 'Bold Italic',
};
// 기본 대체 폰트
const DEFAULT_FALLBACK_FONT = { family: 'Inter', style: 'Regular' };
// 폰트 로드 시도 (타임아웃 포함)
async function tryLoadFont(family, style) {
    try {
        // 3초 타임아웃
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Font load timeout')), 3000));
        const loadFont = figma.loadFontAsync({ family, style }).then(() => true);
        await Promise.race([loadFont, timeout]);
        return true;
    }
    catch (_a) {
        return false;
    }
}
// 폰트 매핑 및 로드
async function loadFontWithFallback(family, style) {
    const originalFont = `${family}-${style || 'Regular'}`;
    // 1. 원본 폰트 먼저 시도
    if (await tryLoadFont(family, style || 'Regular')) {
        return { family, style: style || 'Regular' };
    }
    // 2. 매핑 테이블에서 대체 폰트 찾기
    const mapping = FONT_MAPPING[family];
    if (mapping) {
        const mappedStyle = mapping.styleMap[style || 'Regular'] || mapping.styleMap['Regular'] || 'Regular';
        if (await tryLoadFont(mapping.family, mappedStyle)) {
            console.log(`Font mapped: ${originalFont} → ${mapping.family}-${mappedStyle}`);
            figma.notify(`폰트 대체: ${originalFont} → ${mapping.family}-${mappedStyle}`, { timeout: 2000 });
            return { family: mapping.family, style: mappedStyle };
        }
    }
    // 3. 기본 스타일 매핑으로 Inter 시도
    const fallbackStyle = DEFAULT_STYLE_MAP[style || 'Regular'] || 'Regular';
    // Inter 스타일 순서대로 시도
    const interStyles = [fallbackStyle, 'Regular', 'Medium', 'Bold'];
    for (const tryStyle of interStyles) {
        if (await tryLoadFont('Inter', tryStyle)) {
            console.log(`Font fallback: ${originalFont} → Inter-${tryStyle}`);
            figma.notify(`폰트 대체: ${originalFont} → Inter-${tryStyle}`, { timeout: 2000 });
            return { family: 'Inter', style: tryStyle };
        }
    }
    // 4. 최후: Inter Regular 강제
    console.log(`Font fallback (forced): ${originalFont} → Inter-Regular`);
    return DEFAULT_FALLBACK_FONT;
}
async function createText(nodeData, parent) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!nodeData.text) {
        return null;
    }
    const text = figma.createText();
    parent.appendChild(text);
    // 폰트 로드 (스타일 포함)
    const fontFamily = ((_a = nodeData.textStyle) === null || _a === void 0 ? void 0 : _a.fontFamily) || 'Inter';
    const fontStyle = ((_b = nodeData.textStyle) === null || _b === void 0 ? void 0 : _b.fontStyle) || 'Regular';
    let loadedFont;
    try {
        loadedFont = await loadFontWithFallback(fontFamily, fontStyle);
    }
    catch (e) {
        console.error(`Failed to load any font for: ${fontFamily} ${fontStyle}`);
        // 최후의 수단: Inter Regular 강제 로드
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        loadedFont = { family: 'Inter', style: 'Regular' };
    }
    // 폰트 적용
    text.fontName = loadedFont;
    text.characters = nodeData.text;
    if (nodeData.textStyle) {
        // 참고: 스케일은 이미 파서에서 fontSize, lineHeight, letterSpacing에 적용됨
        // 여기서 다시 스케일을 적용하면 이중 스케일링 문제 발생
        text.fontSize = Math.round(nodeData.textStyle.fontSize * 100) / 100; // 소수점 2자리
        if (nodeData.textStyle.color) {
            const { r, g, b } = nodeData.textStyle.color;
            text.fills = [{
                    type: 'SOLID',
                    color: { r: r / 255, g: g / 255, b: b / 255 }
                }];
        }
        if (nodeData.textStyle.letterSpacing) {
            // letterSpacing은 em 단위 (Photoshop tracking/1000)
            // Figma PERCENT = em * 100 (예: -0.04 em = -4%)
            const letterSpacingPercent = nodeData.textStyle.letterSpacing * 100;
            text.letterSpacing = { value: letterSpacingPercent, unit: 'PERCENT' };
        }
        // lineHeight는 여러 줄 텍스트에만 적용
        // 한 줄 텍스트에 큰 lineHeight를 적용하면 위치가 틀어짐
        const isMultiLine = (_c = nodeData.text) === null || _c === void 0 ? void 0 : _c.includes('\n');
        if (nodeData.textStyle.lineHeight && isMultiLine) {
            text.lineHeight = { value: nodeData.textStyle.lineHeight, unit: 'PIXELS' };
        }
    }
    // styleRuns 처리 (멀티스타일 텍스트)
    if (nodeData.styleRuns && nodeData.styleRuns.length > 0) {
        let currentPos = 0;
        for (const run of nodeData.styleRuns) {
            const runLength = run.text.length;
            const startPos = currentPos;
            const endPos = currentPos + runLength;
            // 색상 적용
            if (run.color && startPos < text.characters.length) {
                const actualEnd = Math.min(endPos, text.characters.length);
                const r = run.color.r > 1 ? run.color.r / 255 : run.color.r;
                const g = run.color.g > 1 ? run.color.g / 255 : run.color.g;
                const b = run.color.b > 1 ? run.color.b / 255 : run.color.b;
                text.setRangeFills(startPos, actualEnd, [{
                        type: 'SOLID',
                        color: { r, g, b }
                    }]);
            }
            // 폰트 크기 적용 (다른 폰트 크기가 있는 경우)
            if (run.fontSize && startPos < text.characters.length) {
                const actualEnd = Math.min(endPos, text.characters.length);
                text.setRangeFontSize(startPos, actualEnd, Math.round(run.fontSize * 100) / 100);
            }
            currentPos = endPos;
        }
    }
    // 텍스트 정렬 설정
    const textAlign = ((_d = nodeData.textStyle) === null || _d === void 0 ? void 0 : _d.textAlign) || 'left';
    const alignMap = {
        'left': 'LEFT',
        'center': 'CENTER',
        'right': 'RIGHT',
        'justify': 'JUSTIFIED'
    };
    text.textAlignHorizontal = alignMap[textAlign] || 'LEFT';
    // 텍스트 박스 크기 및 자동 조절 설정
    const originalWidth = nodeData.width;
    const originalHeight = nodeData.height;
    const lineHeight = ((_e = nodeData.textStyle) === null || _e === void 0 ? void 0 : _e.lineHeight) || ((_f = nodeData.textStyle) === null || _f === void 0 ? void 0 : _f.fontSize) || 16;
    const explicitLineCount = (nodeData.text.match(/\n/g) || []).length + 1;
    // 원본 PSD에서 렌더링된 라인 수 추정
    // height / lineHeight로 대략적인 라인 수 계산
    const estimatedRenderedLines = originalHeight / lineHeight;
    // 명시적 줄바꿈보다 렌더링 라인이 많으면 자동 줄바꿈이 있었음
    const hasAutoWrap = estimatedRenderedLines > explicitLineCount + 0.3;
    if (hasAutoWrap) {
        // 자동 줄바꿈 필요 - 고정 너비 사용 (폰트 차이 보정을 위해 5% 여유)
        text.textAutoResize = 'HEIGHT';
        text.resize(Math.ceil(originalWidth * 1.05), originalHeight);
    }
    else {
        // 자동 줄바꿈 불필요 - 명시적 \n만 줄바꿈
        text.textAutoResize = 'WIDTH_AND_HEIGHT';
    }
    // 위치 설정
    // PSD bounds (nodeData.x, nodeData.y)를 기본으로 사용
    // bounds는 렌더링된 텍스트의 실제 바운딩 박스 위치
    text.x = nodeData.x;
    text.y = nodeData.y;
    // 회전 적용
    if ((_g = nodeData.textTransform) === null || _g === void 0 ? void 0 : _g.rotation) {
        text.rotation = -nodeData.textTransform.rotation; // Figma는 반시계방향이 양수
    }
    return text;
}
// SVG 경로 데이터에서 벡터 노드 생성
async function createVectorFromPath(nodeData, parent) {
    var _a, _b;
    const pathData = nodeData.vectorMask.pathData;
    const width = Math.max(1, nodeData.width);
    const height = Math.max(1, nodeData.height);
    // Figma 채우기 색상 결정 (0-1 범위)
    let fillR = 0.5, fillG = 0.5, fillB = 0.5; // 기본 회색
    let fillOpacity = 1;
    if ((_a = nodeData.vectorFill) === null || _a === void 0 ? void 0 : _a.color) {
        const c = nodeData.vectorFill.color;
        fillR = c.r > 1 ? c.r / 255 : c.r;
        fillG = c.g > 1 ? c.g / 255 : c.g;
        fillB = c.b > 1 ? c.b / 255 : c.b;
        fillOpacity = (_b = c.a) !== null && _b !== void 0 ? _b : 1;
    }
    // SVG용 색상 (0-255 범위)
    const svgR = Math.round(fillR * 255);
    const svgG = Math.round(fillG * 255);
    const svgB = Math.round(fillB * 255);
    const fillColor = `#${svgR.toString(16).padStart(2, '0')}${svgG.toString(16).padStart(2, '0')}${svgB.toString(16).padStart(2, '0')}`;
    // 테두리 색상
    let strokeAttr = '';
    if (nodeData.vectorStroke) {
        const sc = nodeData.vectorStroke.color;
        const sr = Math.round((sc.r > 1 ? sc.r : sc.r * 255));
        const sg = Math.round((sc.g > 1 ? sc.g : sc.g * 255));
        const sb = Math.round((sc.b > 1 ? sc.b : sc.b * 255));
        const strokeColor = `#${sr.toString(16).padStart(2, '0')}${sg.toString(16).padStart(2, '0')}${sb.toString(16).padStart(2, '0')}`;
        strokeAttr = ` stroke="${strokeColor}" stroke-width="${nodeData.vectorStroke.width}"`;
    }
    // SVG 생성 (단일 라인)
    const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><path d="${pathData}" fill="${fillColor}" fill-opacity="${fillOpacity}"${strokeAttr}/></svg>`;
    try {
        // SVG에서 노드 생성
        const svgNode = figma.createNodeFromSvg(svg);
        parent.appendChild(svgNode);
        svgNode.x = nodeData.x;
        svgNode.y = nodeData.y;
        svgNode.name = nodeData.name;
        // Figma 채우기 설정 (0-1 범위)
        const figmaFill = {
            type: 'SOLID',
            color: { r: fillR, g: fillG, b: fillB },
            opacity: fillOpacity
        };
        // 프레임을 플래튼하여 벡터만 남기기
        if (svgNode.children.length === 1 && svgNode.children[0].type === 'VECTOR') {
            const vector = svgNode.children[0];
            const clonedVector = vector.clone();
            parent.appendChild(clonedVector);
            clonedVector.x = nodeData.x;
            clonedVector.y = nodeData.y;
            clonedVector.name = nodeData.name;
            // 채우기 명시적 설정
            clonedVector.fills = [figmaFill];
            svgNode.remove();
            return clonedVector;
        }
        // 프레임 내부의 벡터들에도 채우기 적용
        for (const child of svgNode.children) {
            if (child.type === 'VECTOR') {
                child.fills = [figmaFill];
            }
        }
        return svgNode;
    }
    catch (e) {
        console.error(`Failed to create vector from path: ${nodeData.name}`, e);
        // 실패시 사각형으로 폴백 - 채우기 적용
        const rect = figma.createRectangle();
        parent.appendChild(rect);
        rect.x = nodeData.x;
        rect.y = nodeData.y;
        rect.resize(width, height);
        rect.name = nodeData.name + ' [Vector Failed]';
        rect.fills = [{
                type: 'SOLID',
                color: { r: fillR, g: fillG, b: fillB },
                opacity: fillOpacity
            }];
        return rect;
    }
}
async function createRectangle(nodeData, parent) {
    var _a, _b, _c, _d;
    // 벡터 마스크에 경로 데이터가 있으면 벡터로 생성
    if ((_a = nodeData.vectorMask) === null || _a === void 0 ? void 0 : _a.pathData) {
        return await createVectorFromPath(nodeData, parent);
    }
    const rect = figma.createRectangle();
    parent.appendChild(rect);
    rect.x = nodeData.x;
    rect.y = nodeData.y;
    rect.resize(Math.max(1, nodeData.width), Math.max(1, nodeData.height));
    // 이미지 데이터 가져오기 (안전하게)
    let imageData = null;
    let hasImage = false;
    if (nodeData.imageData) {
        imageData = safeBase64Decode(nodeData.imageData);
    }
    else if (nodeData.imageFileName) {
        imageData = imageStore.get(nodeData.imageFileName) || null;
        if (!imageData) {
            console.log(`Image not found in store: ${nodeData.imageFileName}, store has: ${imageStore.size} images`);
        }
    }
    if (imageData) {
        try {
            const image = figma.createImage(imageData);
            rect.fills = [{
                    type: 'IMAGE',
                    imageHash: image.hash,
                    scaleMode: 'FILL'
                }];
            hasImage = true;
        }
        catch (e) {
            console.log(`Image load failed for: ${nodeData.name}`);
            hasImage = false;
        }
    }
    // 이미지가 없으면 vectorFill 또는 effects 적용
    if (!hasImage) {
        const fills = [];
        // 1. vectorFill 적용 (값이 이미 0-1 범위)
        if (nodeData.vectorFill) {
            if (nodeData.vectorFill.type === 'solid' && nodeData.vectorFill.color) {
                const c = nodeData.vectorFill.color;
                // 값이 1보다 크면 0-255 범위로 간주하고 변환
                const r = c.r > 1 ? c.r / 255 : c.r;
                const g = c.g > 1 ? c.g / 255 : c.g;
                const b = c.b > 1 ? c.b / 255 : c.b;
                fills.push({
                    type: 'SOLID',
                    color: { r, g, b },
                    opacity: c.a
                });
            }
            else if (nodeData.vectorFill.type === 'gradient' && nodeData.vectorFill.gradient) {
                const grad = nodeData.vectorFill.gradient;
                fills.push(createGradientFill(grad));
            }
        }
        // 2. effects.solidFill 적용 (Color Overlay)
        if ((_b = nodeData.effects) === null || _b === void 0 ? void 0 : _b.solidFill) {
            const sf = nodeData.effects.solidFill;
            const c = sf.color;
            const r = c.r > 1 ? c.r / 255 : c.r;
            const g = c.g > 1 ? c.g / 255 : c.g;
            const b = c.b > 1 ? c.b / 255 : c.b;
            fills.push({
                type: 'SOLID',
                color: { r, g, b },
                opacity: c.a
            });
        }
        // 3. effects.gradientOverlay 적용
        if ((_c = nodeData.effects) === null || _c === void 0 ? void 0 : _c.gradientOverlay) {
            const grad = nodeData.effects.gradientOverlay;
            fills.push(createGradientFill(grad));
        }
        // 채우기 적용
        if (fills.length > 0) {
            rect.fills = fills;
            console.log(`Applied fill to: ${nodeData.name}, fills: ${fills.length}`);
        }
        else if (nodeData.imageFileName) {
            // 이미지 파일명은 있지만 데이터가 없는 경우
            console.log(`No image data for: ${nodeData.name}, imageFileName: ${nodeData.imageFileName}`);
            rect.fills = [{
                    type: 'SOLID',
                    color: { r: 0.9, g: 0.9, b: 0.9 }
                }];
            rect.name = `[IMG] ${nodeData.name}`;
        }
        else {
            // 기본 플레이스홀더
            rect.fills = [{
                    type: 'SOLID',
                    color: { r: 0.8, g: 0.8, b: 0.8 }
                }];
        }
    }
    // vectorStroke 적용
    if (nodeData.vectorStroke) {
        const vs = nodeData.vectorStroke;
        rect.strokes = [{
                type: 'SOLID',
                color: { r: vs.color.r, g: vs.color.g, b: vs.color.b },
                opacity: vs.color.a
            }];
        rect.strokeWeight = vs.width;
        rect.strokeAlign = vs.alignment === 'CENTER' ? 'CENTER' : vs.alignment === 'INSIDE' ? 'INSIDE' : 'OUTSIDE';
    }
    // effects.stroke 적용
    if (((_d = nodeData.effects) === null || _d === void 0 ? void 0 : _d.stroke) && !nodeData.vectorStroke) {
        const strokes = Array.isArray(nodeData.effects.stroke) ? nodeData.effects.stroke : [nodeData.effects.stroke];
        const firstStroke = strokes[0];
        if (firstStroke && firstStroke.color) {
            rect.strokes = [{
                    type: 'SOLID',
                    color: { r: firstStroke.color.r, g: firstStroke.color.g, b: firstStroke.color.b },
                    opacity: firstStroke.color.a
                }];
            rect.strokeWeight = firstStroke.weight;
        }
    }
    // 그림자 효과 적용
    applyEffects(rect, nodeData.effects);
    return rect;
}
// 그라디언트 Fill 생성
function createGradientFill(grad) {
    const angleRad = (grad.angle * Math.PI) / 180;
    const gradientStops = grad.stops.map(stop => ({
        position: stop.position,
        color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a }
    }));
    // 그라디언트 변환 행렬 계산 (angle 기반)
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return {
        type: 'GRADIENT_LINEAR',
        gradientStops,
        gradientTransform: [
            [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
            [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5]
        ]
    };
}
// 효과 적용 (그림자, 블러 등)
function applyEffects(node, effects) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7;
    if (!effects)
        return;
    const figmaEffects = [];
    // Drop Shadow
    if (effects.dropShadow) {
        const shadows = Array.isArray(effects.dropShadow) ? effects.dropShadow : [effects.dropShadow];
        for (const shadow of shadows) {
            // null/undefined 체크
            if (!shadow || !shadow.color)
                continue;
            const offsetX = (_b = (_a = shadow.offset) === null || _a === void 0 ? void 0 : _a.x) !== null && _b !== void 0 ? _b : 0;
            const offsetY = (_d = (_c = shadow.offset) === null || _c === void 0 ? void 0 : _c.y) !== null && _d !== void 0 ? _d : 0;
            const colorR = (_e = shadow.color.r) !== null && _e !== void 0 ? _e : 0;
            const colorG = (_f = shadow.color.g) !== null && _f !== void 0 ? _f : 0;
            const colorB = (_g = shadow.color.b) !== null && _g !== void 0 ? _g : 0;
            const colorA = (_h = shadow.color.a) !== null && _h !== void 0 ? _h : 1;
            const blur = (_j = shadow.blur) !== null && _j !== void 0 ? _j : 0;
            const spread = (_k = shadow.spread) !== null && _k !== void 0 ? _k : 0;
            figmaEffects.push({
                type: 'DROP_SHADOW',
                color: { r: colorR, g: colorG, b: colorB, a: colorA },
                offset: { x: offsetX, y: offsetY },
                radius: blur,
                spread: spread,
                visible: true,
                blendMode: 'NORMAL'
            });
        }
    }
    // Inner Shadow
    if (effects.innerShadow) {
        const shadows = Array.isArray(effects.innerShadow) ? effects.innerShadow : [effects.innerShadow];
        for (const shadow of shadows) {
            // null/undefined 체크
            if (!shadow || !shadow.color)
                continue;
            const offsetX = (_m = (_l = shadow.offset) === null || _l === void 0 ? void 0 : _l.x) !== null && _m !== void 0 ? _m : 0;
            const offsetY = (_p = (_o = shadow.offset) === null || _o === void 0 ? void 0 : _o.y) !== null && _p !== void 0 ? _p : 0;
            const colorR = (_q = shadow.color.r) !== null && _q !== void 0 ? _q : 0;
            const colorG = (_r = shadow.color.g) !== null && _r !== void 0 ? _r : 0;
            const colorB = (_s = shadow.color.b) !== null && _s !== void 0 ? _s : 0;
            const colorA = (_t = shadow.color.a) !== null && _t !== void 0 ? _t : 1;
            const blur = (_u = shadow.blur) !== null && _u !== void 0 ? _u : 0;
            const spread = (_v = shadow.spread) !== null && _v !== void 0 ? _v : 0;
            figmaEffects.push({
                type: 'INNER_SHADOW',
                color: { r: colorR, g: colorG, b: colorB, a: colorA },
                offset: { x: offsetX, y: offsetY },
                radius: blur,
                spread: spread,
                visible: true,
                blendMode: 'NORMAL'
            });
        }
    }
    // Layer Blur
    if (effects.layerBlur && effects.layerBlur.radius != null) {
        figmaEffects.push({
            type: 'LAYER_BLUR',
            radius: effects.layerBlur.radius,
            visible: true
        });
    }
    // Outer Glow (Drop Shadow로 시뮬레이션)
    if (effects.outerGlow && effects.outerGlow.color) {
        const og = effects.outerGlow;
        const colorR = (_w = og.color.r) !== null && _w !== void 0 ? _w : 0;
        const colorG = (_x = og.color.g) !== null && _x !== void 0 ? _x : 0;
        const colorB = (_y = og.color.b) !== null && _y !== void 0 ? _y : 0;
        const colorA = (_z = og.color.a) !== null && _z !== void 0 ? _z : 1;
        figmaEffects.push({
            type: 'DROP_SHADOW',
            color: { r: colorR, g: colorG, b: colorB, a: colorA },
            offset: { x: 0, y: 0 },
            radius: (_0 = og.blur) !== null && _0 !== void 0 ? _0 : 0,
            spread: (_1 = og.spread) !== null && _1 !== void 0 ? _1 : 0,
            visible: true,
            blendMode: 'NORMAL'
        });
    }
    // Inner Glow (Inner Shadow로 시뮬레이션)
    if (effects.innerGlow && effects.innerGlow.color) {
        const ig = effects.innerGlow;
        const colorR = (_2 = ig.color.r) !== null && _2 !== void 0 ? _2 : 0;
        const colorG = (_3 = ig.color.g) !== null && _3 !== void 0 ? _3 : 0;
        const colorB = (_4 = ig.color.b) !== null && _4 !== void 0 ? _4 : 0;
        const colorA = (_5 = ig.color.a) !== null && _5 !== void 0 ? _5 : 1;
        figmaEffects.push({
            type: 'INNER_SHADOW',
            color: { r: colorR, g: colorG, b: colorB, a: colorA },
            offset: { x: 0, y: 0 },
            radius: (_6 = ig.blur) !== null && _6 !== void 0 ? _6 : 0,
            spread: (_7 = ig.spread) !== null && _7 !== void 0 ? _7 : 0,
            visible: true,
            blendMode: 'NORMAL'
        });
    }
    if (figmaEffects.length > 0 && 'effects' in node) {
        node.effects = figmaEffects;
    }
}
function isValidBlendMode(mode) {
    const validModes = [
        'NORMAL', 'DARKEN', 'MULTIPLY', 'COLOR_BURN', 'LIGHTEN',
        'SCREEN', 'COLOR_DODGE', 'OVERLAY', 'SOFT_LIGHT', 'HARD_LIGHT',
        'DIFFERENCE', 'EXCLUSION', 'HUE', 'SATURATION', 'COLOR', 'LUMINOSITY'
    ];
    return validModes.includes(mode);
}
