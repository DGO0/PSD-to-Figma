# PSD-to-Figma Converter Changelog

## v1.0.11 (2026-02-08)

### 클리핑 그룹 프레임 크기 수정
- **문제**: 클리핑 그룹의 Frame 크기가 베이스 노드 + 모든 클리핑 노드의 union bounds로 계산되어 베이스 영역 밖의 콘텐츠가 잘리지 않음
- **원인**: `createClippingGroup()`에서 `Math.max(clipW, unionRight - clipX)` 사용
- **수정**: Frame 크기를 베이스 노드의 bounds만 사용 (`frameW = clipW, frameH = clipH`)
- **결과**: PSD 클리핑 마스크와 동일하게 베이스 영역 밖의 콘텐츠가 잘림
- **파일**: `figma-plugin/code.ts` (`createClippingGroup`)
- **사례**: "블루 컬러 추천 조합" 영역에서 Layer 15 (674x634, solidFill+gradientOverlay)가 베이스 Rectangle 13 copy (256x257)보다 훨씬 커서 회색 아티팩트 발생 → 수정 후 베이스 영역 내로 클리핑

### 레이어 마스크 이미지 적용
- **문제**: 레이어 마스크가 사각형 bounds 클리핑만 수행하고, 마스크 이미지의 per-pixel alpha(페더링/그라데이션)를 적용하지 않음
- **원인**: `createMaskedNode()`에서 Frame + clipsContent만 사용, 마스크 이미지 무시
- **수정 (2개 파일)**:
  1. `psdParser.ts`: 마스크 이미지 저장 시 luminance→alpha 변환 (RGB=255, A=luminance)
  2. `code.ts`: 마스크 Frame 안에 마스크 이미지를 `isMask=true` Rectangle로 생성
- **결과**: 마스크 가장자리의 페더링/그라데이션이 PSD와 동일하게 적용됨
- **파일**: `src/parser/psdParser.ts` (`parseLayerMask`), `figma-plugin/code.ts` (`createMaskedNode`)
- **사례**: Generative Fill 2/3/4의 마스크가 가장자리에서 fade-out되는데, 이전에는 사각형으로만 잘려서 Figma에서 불필요한 콘텐츠가 보임 → 수정 후 PSD처럼 부드럽게 페이드

### isMask 제거 (클리핑 그룹)
- **문제**: 클리핑 그룹에서 베이스 노드에 `isMask=true` 설정 시 베이스 이미지/색상이 사라짐
- **수정**: isMask 블록 전체 제거, Frame의 clipsContent=true만으로 클리핑 처리
- **파일**: `figma-plugin/code.ts` (`createClippingGroup`)

### solidFill/gradientOverlay 이미지 경로 적용
- **문제**: vectorMask+image 또는 일반 rectangle+image 경로에서 solidFill/gradientOverlay 효과가 무시됨
- **수정**: IMAGE fill 위에 solidFill(Color Overlay) 또는 gradientOverlay가 있으면 fill 교체
- **파일**: `figma-plugin/code.ts` (`createRectangle` 내 2곳)

### 타일링 로직 강화
- **문제**: 스트리밍 모드가 아닌 경우 `imagesDir`가 없어서 4096px 초과 이미지 타일링이 실패
- **수정**: outputDir에서 imagesDir 자동 생성, 이미지 파일 없으면 직접 저장 후 타일링
- **파일**: `src/converter/converter.ts` (`convertImageLayer`)

---

## 비교 결과 추이

| 테스트 파일 | v1.0.9 이전 | v1.0.9 | v1.0.10 | v1.0.11 |
|------------|------------|--------|---------|---------|
| 패러미트_상세페이지 | 49.19% | 10.93% | 12.12% | **11.82%** |
| 어댑터_스케치5_하단2 | N/A | N/A | 26.22% | **19.90%** |

> v1.0.11 수치는 Figma 플러그인 재import + export 후 확인 필요 (마스크/클리핑 변경은 Figma 렌더링에서만 차이 발생)

---

## 아키텍처 참고 사항

### PSD 레이어 순서
- **ag-psd**: `children[0]` = 최하위 레이어 (Background), `children[last]` = 최상위 레이어
- **converter**: PSD 순서 그대로 JSON nodes 배열로 변환
- **Figma plugin**: `appendChild()` 사용 → `nodes[0]`(Background)이 가장 뒤에 배치 (올바름)

### 클리핑 마스크 vs 레이어 마스크
| 구분 | PSD 동작 | Figma 구현 |
|------|---------|-----------|
| **클리핑 마스크** (layer.clipping) | 아래 레이어의 픽셀 영역으로 잘림 | Frame(clipsContent=true) + 베이스 bounds |
| **레이어 마스크** (layer.mask) | 마스크 이미지의 luminance로 가시성 결정 | Frame(clipsContent=true) + isMask Rectangle |

### 마스크 luminance→alpha 변환
```
PSD: mask 이미지 RGB=(lum,lum,lum), A=255 → luminance 기반
Figma: mask는 alpha 기반 → RGB=(255,255,255), A=lum 으로 변환 필요
변환 위치: psdParser.ts parseLayerMask()
```

### 이미지 타일링
- 4096px 초과 이미지 → GROUP 노드로 변환, children에 타일 Rectangle 배치
- 타일 좌표는 GROUP 기준 상대 좌표 (x=0, y=0/4096/8192...)
- Plugin에서 `createGroup()` → `figma.group(children, parent)` → `group.y = nodeData.y`

### 알려진 남은 이슈
1. **텍스트 폰트 차이**: canvas vs PSD vs Figma 폰트 렌더링 차이 (근본적 한계)
2. **isMask 한계**: 클리핑 그룹에서 베이스의 정확한 픽셀 경계가 아닌 사각형 bounds로 클리핑
3. **벡터 효과**: shadow, gradient 등 일부 효과가 composite renderer에서 미구현
4. **반투명 타일**: Layer 44 등 투명 영역 있는 대형 이미지의 블렌딩 차이
5. **defaultColor=255 마스크**: 마스크 밖이 보이는 경우는 아직 마스크 이미지 미적용

---

## 개발 환경 메모

### 빌드 명령어
```bash
# Figma 플러그인 빌드
cd figma-plugin && npx esbuild code.ts --bundle --outfile=code.js --format=iife --target=es2017

# PSD 변환 (스트리밍 모드)
npx ts-node src/cli/index.ts convert "psd/파일명.psb" -o "psd/output" --stream

# 비교 이미지 생성
npx ts-node src/cli/compositeRender.ts "psd/output/폴더명"
```

### 주의사항
- Figma plugin runtime은 `?.` (optional chaining), `??` (nullish coalescing) 미지원 → es2017 타겟 필수
- Windows에서 한글 파일명은 `canvas.loadImage(path)` 실패 → `fs.readFileSync(path)` + buffer 사용
- 대용량 PSB (500MB+) 파싱 시 메모리 주의 → `--stream` 옵션 사용
