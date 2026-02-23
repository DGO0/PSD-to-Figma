"use strict";
// Figma Plugin - PSD Import
// 이 코드를 Figma Plugin으로 사용하세요
// 만료일 체크 (2026-03-07 00:00:00 KST)
const EXPIRY_DATE = new Date('2026-03-07T00:00:00+09:00');
if (new Date() >= EXPIRY_DATE) {
    figma.notify('This plugin has expired. Please contact the developer.', { error: true });
    figma.closePlugin();
}
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
    mainFrame.fills = []; // 기본 흰색 배경 제거
    mainFrame.strokes = []; // 기본 스트로크 제거
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
    // 클리핑 영역 계산: 베이스 노드 bounds를 기준으로 하되,
    // vectorMask가 있으면 그 경로가 실제 클리핑 영역이므로 베이스 bounds 사용
    var clipX = baseNode.x;
    var clipY = baseNode.y;
    var clipW = baseNode.width;
    var clipH = baseNode.height;
    // PSD 클리핑 마스크: 베이스 노드의 bounds가 클리핑 영역
    // 클리핑된 노드들은 베이스 bounds 밖의 부분이 잘려야 함
    var frameW = clipW;
    var frameH = clipH;
    // 클리핑 그룹용 프레임 생성
    var clipFrame = figma.createFrame();
    parent.appendChild(clipFrame);
    clipFrame.name = baseNode.name + ' [Clipping Group]';
    clipFrame.x = clipX;
    clipFrame.y = clipY;
    clipFrame.resize(Math.max(1, frameW), Math.max(1, frameH));
    clipFrame.clipsContent = true;
    clipFrame.fills = []; // 배경 투명
    clipFrame.strokes = []; // 기본 스트로크 제거
    // 베이스 노드 생성 (Frame의 clipsContent=true로 클리핑 처리)
    // 베이스 노드 자체는 보이도록 isMask 없이 생성
    var baseCreated = await createNodeInFrame(baseNode, clipFrame, 0, 0);
    if (baseCreated) {
        console.log('Clipping base created: ' + baseNode.name);
    }
    // vectorMask가 있으면 동일 경로로 isMask 벡터 생성
    // → 사각형 bounds 대신 실제 shape(삼각형 등)으로 클리핑 노드들을 마스킹
    if (baseNode.vectorMask && baseNode.vectorMask.pathData && clippingNodes.length > 0) {
        try {
            var maskPathData = baseNode.vectorMask.pathData;
            var maskSvg = '<svg width="' + clipW + '" height="' + clipH + '" viewBox="0 0 ' + clipW + ' ' + clipH + '" xmlns="http://www.w3.org/2000/svg"><path d="' + maskPathData + '" fill="white"/></svg>';
            var maskSvgNode = figma.createNodeFromSvg(maskSvg);
            clipFrame.appendChild(maskSvgNode);
            if (maskSvgNode.children.length === 1 && maskSvgNode.children[0].type === 'VECTOR') {
                var maskVec = maskSvgNode.children[0];
                var clonedMask = maskVec.clone();
                clipFrame.appendChild(clonedMask);
                clonedMask.x = 0;
                clonedMask.y = 0;
                clonedMask.name = baseNode.name + ' [Clip Mask]';
                clonedMask.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }];
                clonedMask.isMask = true;
                maskSvgNode.remove();
                console.log('Clip mask vector created for: ' + baseNode.name);
            }
            else {
                // 복잡한 SVG 구조면 frame 자체를 flatten 후 마스크로 사용
                maskSvgNode.x = 0;
                maskSvgNode.y = 0;
                maskSvgNode.name = baseNode.name + ' [Clip Mask]';
                var flattenedMask = figma.flatten([maskSvgNode]);
                flattenedMask.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }];
                flattenedMask.isMask = true;
                console.log('Clip mask flattened for: ' + baseNode.name);
            }
        }
        catch (e) {
            console.log('Failed to create clip mask vector: ' + e);
        }
    }
    // 클리핑된 노드들 생성
    for (var cj = 0; cj < clippingNodes.length; cj++) {
        var clipNode = clippingNodes[cj];
        var offsetX = clipNode.x - clipX;
        var offsetY = clipNode.y - clipY;
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
// PSD 마스크: defaultColor=0 → 마스크 밖은 숨김 (클리핑), defaultColor=255 → 마스크 밖은 표시
async function createMaskedNode(nodeData, parent) {
    var mask = nodeData.mask;
    if (!mask)
        return null;
    var defaultColor = mask.defaultColor != null ? mask.defaultColor : 0;
    // defaultColor=255: 마스크 밖 영역이 보이므로 레이어 전체 bounds 사용 (클리핑 불필요)
    if (defaultColor === 255) {
        var contentNodeData2 = {};
        for (var k in nodeData) {
            contentNodeData2[k] = nodeData[k];
        }
        contentNodeData2.mask = undefined;
        var contentNode2 = await createNodeBase(contentNodeData2, parent);
        return contentNode2;
    }
    // defaultColor=0: 마스크 bounds로 클리핑
    var maskBounds = mask.bounds;
    if (maskBounds.width <= 0 || maskBounds.height <= 0) {
        // 마스크 bounds가 유효하지 않으면 콘텐츠만 생성
        var contentNodeData3 = {};
        for (var k2 in nodeData) {
            contentNodeData3[k2] = nodeData[k2];
        }
        contentNodeData3.mask = undefined;
        return await createNodeBase(contentNodeData3, parent);
    }
    // 마스크 프레임 생성 (클리핑 영역)
    var maskFrame = figma.createFrame();
    parent.appendChild(maskFrame);
    maskFrame.name = nodeData.name;
    maskFrame.x = maskBounds.x;
    maskFrame.y = maskBounds.y;
    maskFrame.resize(Math.max(1, maskBounds.width), Math.max(1, maskBounds.height));
    maskFrame.clipsContent = true;
    maskFrame.fills = []; // 배경 투명
    maskFrame.strokes = []; // 기본 스트로크 제거
    // 마스크 이미지가 있으면 Figma 마스크로 적용 (luminance→alpha 변환됨)
    // isMask=true 노드의 alpha 채널이 위에 있는 siblings의 가시성을 결정
    var maskImageData = null;
    if (mask.imageFileName) {
        maskImageData = imageStore.get(mask.imageFileName) || null;
    }
    else if (mask.imageData) {
        maskImageData = safeBase64Decode(mask.imageData);
    }
    if (maskImageData) {
        try {
            var maskImg = figma.createImage(maskImageData);
            var maskRect = figma.createRectangle();
            maskFrame.appendChild(maskRect);
            maskRect.name = 'Mask';
            maskRect.x = 0;
            maskRect.y = 0;
            maskRect.resize(Math.max(1, maskBounds.width), Math.max(1, maskBounds.height));
            maskRect.fills = [{ type: 'IMAGE', imageHash: maskImg.hash, scaleMode: 'FILL' }];
            maskRect.strokes = []; // 기본 스트로크 제거
            maskRect.isMask = true;
        }
        catch (e) {
            console.log('Failed to create mask image: ' + e);
        }
    }
    // 콘텐츠 노드를 프레임 안에 생성 (마스크 제거)
    var contentNodeData = {};
    for (var k3 in nodeData) {
        contentNodeData[k3] = nodeData[k3];
    }
    contentNodeData.mask = undefined;
    var contentNode = await createNodeBase(contentNodeData, maskFrame);
    if (contentNode) {
        // 마스크 프레임 기준으로 상대 좌표 설정
        contentNode.x = nodeData.x - maskBounds.x;
        contentNode.y = nodeData.y - maskBounds.y;
    }
    return maskFrame;
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
        frame.strokes = []; // 기본 스트로크 제거
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
    var _a, _b, _c, _d, _f;
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
            // letterSpacing 값을 그대로 픽셀로 사용 (Photoshop과 Figma 렌더링 차이 고려)
            text.letterSpacing = { value: nodeData.textStyle.letterSpacing, unit: 'PIXELS' };
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
    // 텍스트 자동 크기 조절
    // 모든 텍스트에 자동 크기 적용 (명시적 \n만 줄바꿈)
    // 고정 너비 사용시 폰트 렌더링 차이로 줄바꿈 문제 발생
    text.textAutoResize = 'WIDTH_AND_HEIGHT';
    // 위치 설정
    // PSD bounds (nodeData.x, nodeData.y)를 기본으로 사용
    // bounds는 렌더링된 텍스트의 실제 바운딩 박스 위치
    text.x = nodeData.x;
    text.y = nodeData.y;
    // 회전 적용
    if ((_f = nodeData.textTransform) === null || _f === void 0 ? void 0 : _f.rotation) {
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
            // 스트로크 설정 (없으면 기본 스트로크 제거)
            if (nodeData.vectorStroke) {
                const vs = nodeData.vectorStroke;
                clonedVector.strokes = [{
                        type: 'SOLID',
                        color: { r: vs.color.r, g: vs.color.g, b: vs.color.b },
                        opacity: vs.color.a
                    }];
                clonedVector.strokeWeight = vs.width;
            }
            else {
                clonedVector.strokes = [];
            }
            svgNode.remove();
            return clonedVector;
        }
        // 프레임 내부의 벡터들에도 채우기/스트로크 적용
        for (const child of svgNode.children) {
            if (child.type === 'VECTOR') {
                child.fills = [figmaFill];
                child.strokes = []; // 기본 스트로크 제거
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
        rect.strokes = []; // 기본 스트로크 제거
        return rect;
    }
}
async function createRectangle(nodeData, parent) {
    var _a, _b, _c;
    // 벡터 마스크에 경로 데이터가 있으면 벡터로 생성
    if (nodeData.vectorMask && nodeData.vectorMask.pathData) {
        // 이미지가 있으면 이미지를 우선 사용 (PSD 렌더링 결과가 가장 정확)
        var vecImageData = null;
        if (nodeData.imageFileName) {
            vecImageData = imageStore.get(nodeData.imageFileName) || null;
        }
        if (!vecImageData && nodeData.imageData) {
            vecImageData = safeBase64Decode(nodeData.imageData);
        }
        if (vecImageData) {
            // 이미지가 있으면: 벡터 경로 모양 생성 후 이미지/효과 fills 적용
            var createdVecNode = null;
            try {
                createdVecNode = await createVectorFromPath(nodeData, parent);
                // fills 구성: 이미지 → solidFill → gradientOverlay 순으로 오버라이드
                if ('fills' in createdVecNode) {
                    var vecImg = figma.createImage(vecImageData);
                    var vecFills = [{
                            type: 'IMAGE',
                            imageHash: vecImg.hash,
                            scaleMode: 'FILL'
                        }];
                    // solidFill (Color Overlay) - 이미지를 완전히 덮음
                    if (nodeData.effects && nodeData.effects.solidFill) {
                        var sf = nodeData.effects.solidFill;
                        var c = sf.color;
                        var r2 = c.r > 1 ? c.r / 255 : c.r;
                        var g2 = c.g > 1 ? c.g / 255 : c.g;
                        var b2 = c.b > 1 ? c.b / 255 : c.b;
                        vecFills = [{
                                type: 'SOLID',
                                color: { r: r2, g: g2, b: b2 },
                                opacity: c.a
                            }];
                    }
                    // gradientOverlay - 이전 fill 대체
                    if (nodeData.effects && nodeData.effects.gradientOverlay) {
                        vecFills = [createGradientFill(nodeData.effects.gradientOverlay)];
                    }
                    createdVecNode.fills = vecFills;
                }
                // 그림자/글로우 등 효과 적용
                applyEffects(createdVecNode, nodeData.effects);
                return createdVecNode;
            }
            catch (e) {
                // 이미 생성된 벡터 노드가 있으면 제거 (핑크색 잔상 방지)
                if (createdVecNode) {
                    try {
                        createdVecNode.remove();
                    }
                    catch (_e) { }
                }
                console.log('Vector+image creation failed, using path only: ' + nodeData.name);
            }
        }
        // 이미지가 없으면 벡터 경로 + fill color 사용
        var vectorNode = await createVectorFromPath(nodeData, parent);
        // effects의 solidFill (Color Overlay)로 채우기 덮어쓰기
        if (nodeData.effects && nodeData.effects.solidFill && 'fills' in vectorNode) {
            var sf = nodeData.effects.solidFill;
            var c = sf.color;
            var r2 = c.r > 1 ? c.r / 255 : c.r;
            var g2 = c.g > 1 ? c.g / 255 : c.g;
            var b2 = c.b > 1 ? c.b / 255 : c.b;
            vectorNode.fills = [{
                    type: 'SOLID',
                    color: { r: r2, g: g2, b: b2 },
                    opacity: c.a
                }];
        }
        // effects의 gradientOverlay로 채우기 덮어쓰기
        if (nodeData.effects && nodeData.effects.gradientOverlay && 'fills' in vectorNode) {
            vectorNode.fills = [createGradientFill(nodeData.effects.gradientOverlay)];
        }
        // 그림자/글로우 등 효과 적용
        applyEffects(vectorNode, nodeData.effects);
        return vectorNode;
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
            var imgFills = [{
                    type: 'IMAGE',
                    imageHash: image.hash,
                    scaleMode: 'FILL'
                }];
            // 이미지 위에 solidFill (Color Overlay) 적용
            if (nodeData.effects && nodeData.effects.solidFill) {
                var sfImg = nodeData.effects.solidFill;
                var cImg = sfImg.color;
                var rImg = cImg.r > 1 ? cImg.r / 255 : cImg.r;
                var gImg = cImg.g > 1 ? cImg.g / 255 : cImg.g;
                var bImg = cImg.b > 1 ? cImg.b / 255 : cImg.b;
                imgFills = [{
                        type: 'SOLID',
                        color: { r: rImg, g: gImg, b: bImg },
                        opacity: cImg.a
                    }];
            }
            // 이미지 위에 gradientOverlay 적용
            if (nodeData.effects && nodeData.effects.gradientOverlay) {
                imgFills = [createGradientFill(nodeData.effects.gradientOverlay)];
            }
            rect.fills = imgFills;
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
        if ((_a = nodeData.effects) === null || _a === void 0 ? void 0 : _a.solidFill) {
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
        if ((_b = nodeData.effects) === null || _b === void 0 ? void 0 : _b.gradientOverlay) {
            const grad = nodeData.effects.gradientOverlay;
            fills.push(createGradientFill(grad));
        }
        // 채우기 적용
        if (fills.length > 0) {
            rect.fills = fills;
            console.log(`Applied fill to: ${nodeData.name}, fills: ${fills.length}`);
        }
        else if (nodeData.imageFileName) {
            // 이미지 파일명은 있지만 데이터가 없는 경우 - 투명 처리
            console.log(`No image data for: ${nodeData.name}, imageFileName: ${nodeData.imageFileName}`);
            rect.fills = [];
        }
        else {
            // fill/image 없는 레이어 - 투명 처리
            rect.fills = [];
        }
    }
    // 스트로크 적용 (기본값 제거 포함)
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
    else if ((_c = nodeData.effects) === null || _c === void 0 ? void 0 : _c.stroke) {
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
        else {
            rect.strokes = []; // 스트로크 데이터 없으면 기본 스트로크 제거
        }
    }
    else {
        rect.strokes = []; // Figma 기본 스트로크 제거
    }
    // 그림자 효과 적용
    applyEffects(rect, nodeData.effects);
    return rect;
}
// 그라디언트 Fill 생성
function createGradientFill(grad) {
    var scaleVal = (grad.scale != null ? grad.scale : 100) / 100;
    var reverseVal = grad.reverse || false;
    var opacityVal = grad.opacity != null ? grad.opacity : 1;
    var angleRad = (grad.angle * Math.PI) / 180;
    // reverse: 그라디언트 방향 반전
    var stops = grad.stops;
    if (reverseVal) {
        stops = stops.map(function (s) { return { position: 1 - s.position, color: s.color }; });
        stops = stops.slice().reverse();
    }
    var gradientStops = stops.map(function (stop) {
        return {
            position: stop.position,
            color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a }
        };
    });
    // scale 적용: 그라디언트 크기를 scale 비율로 조정 (중앙 기준)
    var cos_s = scaleVal * Math.cos(angleRad);
    var sin_s = scaleVal * Math.sin(angleRad);
    var result = {
        type: 'GRADIENT_LINEAR',
        gradientStops: gradientStops,
        gradientTransform: [
            [cos_s, sin_s, 0.5 - cos_s * 0.5 - sin_s * 0.5],
            [-sin_s, cos_s, 0.5 + sin_s * 0.5 - cos_s * 0.5]
        ]
    };
    // opacity: 효과 전체 불투명도
    if (opacityVal < 1) {
        result.opacity = opacityVal;
    }
    return result;
}
// 효과 적용 (그림자, 블러 등)
function applyEffects(node, effects) {
    var _a, _b, _c, _d, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8;
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
            const colorR = (_f = shadow.color.r) !== null && _f !== void 0 ? _f : 0;
            const colorG = (_g = shadow.color.g) !== null && _g !== void 0 ? _g : 0;
            const colorB = (_h = shadow.color.b) !== null && _h !== void 0 ? _h : 0;
            const colorA = (_j = shadow.color.a) !== null && _j !== void 0 ? _j : 1;
            const blur = (_k = shadow.blur) !== null && _k !== void 0 ? _k : 0;
            const spread = (_l = shadow.spread) !== null && _l !== void 0 ? _l : 0;
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
            const offsetX = (_o = (_m = shadow.offset) === null || _m === void 0 ? void 0 : _m.x) !== null && _o !== void 0 ? _o : 0;
            const offsetY = (_q = (_p = shadow.offset) === null || _p === void 0 ? void 0 : _p.y) !== null && _q !== void 0 ? _q : 0;
            const colorR = (_r = shadow.color.r) !== null && _r !== void 0 ? _r : 0;
            const colorG = (_s = shadow.color.g) !== null && _s !== void 0 ? _s : 0;
            const colorB = (_t = shadow.color.b) !== null && _t !== void 0 ? _t : 0;
            const colorA = (_u = shadow.color.a) !== null && _u !== void 0 ? _u : 1;
            const blur = (_v = shadow.blur) !== null && _v !== void 0 ? _v : 0;
            const spread = (_w = shadow.spread) !== null && _w !== void 0 ? _w : 0;
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
        const colorR = (_x = og.color.r) !== null && _x !== void 0 ? _x : 0;
        const colorG = (_y = og.color.g) !== null && _y !== void 0 ? _y : 0;
        const colorB = (_z = og.color.b) !== null && _z !== void 0 ? _z : 0;
        const colorA = (_0 = og.color.a) !== null && _0 !== void 0 ? _0 : 1;
        figmaEffects.push({
            type: 'DROP_SHADOW',
            color: { r: colorR, g: colorG, b: colorB, a: colorA },
            offset: { x: 0, y: 0 },
            radius: (_1 = og.blur) !== null && _1 !== void 0 ? _1 : 0,
            spread: (_2 = og.spread) !== null && _2 !== void 0 ? _2 : 0,
            visible: true,
            blendMode: 'NORMAL'
        });
    }
    // Inner Glow (Inner Shadow로 시뮬레이션)
    if (effects.innerGlow && effects.innerGlow.color) {
        const ig = effects.innerGlow;
        const colorR = (_3 = ig.color.r) !== null && _3 !== void 0 ? _3 : 0;
        const colorG = (_4 = ig.color.g) !== null && _4 !== void 0 ? _4 : 0;
        const colorB = (_5 = ig.color.b) !== null && _5 !== void 0 ? _5 : 0;
        const colorA = (_6 = ig.color.a) !== null && _6 !== void 0 ? _6 : 1;
        figmaEffects.push({
            type: 'INNER_SHADOW',
            color: { r: colorR, g: colorG, b: colorB, a: colorA },
            offset: { x: 0, y: 0 },
            radius: (_7 = ig.blur) !== null && _7 !== void 0 ? _7 : 0,
            spread: (_8 = ig.spread) !== null && _8 !== void 0 ? _8 : 0,
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
