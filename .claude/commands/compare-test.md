PSD 파일을 변환하고 composite render로 비교 테스트를 수행합니다.

인자: $ARGUMENTS (PSD 파일 경로. 없으면 사용자에게 물어볼 것)

## 실행 순서

### 1단계: TypeScript 빌드
```bash
cd D:/Workspace/PSD_figma && npx tsc
```
- 빌드 에러가 있으면 수정 후 재빌드

### 2단계: PSD 변환 (parse + convert)
```bash
cd D:/Workspace/PSD_figma && node --max-old-space-size=8192 dist/cli/index.js convert "$ARGUMENTS" -o "./output" --stream
```
- 출력물: `output/{psdname}/` 디렉토리에 `{psdname}_figma.json` + `images/`
- `--stream` 옵션은 대용량 PSB 파일의 메모리 절약용

### 3단계: Composite Render (Figma 시뮬레이션)
```bash
node dist/cli/compositeRender.js "output/{psdname}" "output/{psdname}/{psdname}_composite.png"
```
- `{psdname}`은 PSD 파일명(확장자 제외)으로 치환
- JSON + images를 읽어서 Figma 렌더링을 로컬에서 시뮬레이션

### 4단계: ag-psd 레퍼런스 이미지 생성
- ag-psd가 PSD 파싱 시 자동으로 composite 이미지를 생성함
- 일반적으로 `output/{psdname}/{psdname}_preview.png` 또는 `output/{psdname}/{psdname}_psd.png` 로 저장됨
- 파일이 없으면 output 디렉토리에서 `*preview*` 또는 `*psd*` 패턴으로 찾을 것

### 5단계: 픽셀 비교
```bash
node dist/cli/compareImages.js "output/{psdname}/{psdname}_psd.png" "output/{psdname}/{psdname}_composite.png" "output/{psdname}/{psdname}_diff.png"
```
- 출력: 전체 차이 %, 영역별 심각도, diff 이미지

### 6단계: Y축 분석 (선택)
```bash
node dist/cli/analyzeImageDiff.js "output/{psdname}/{psdname}_psd.png" "output/{psdname}/{psdname}_composite.png"
```
- 500px 단위 Y축 구간별 차이 분석
- 색상 패턴 및 원인 진단

## 결과 해석 기준

| 차이율 | 평가 | 의미 |
|--------|------|------|
| < 5% | 우수 | 폰트/렌더링 미세 차이만 존재 |
| 5-15% | 양호 | 텍스트, 마스크 등 일부 차이 |
| 15-30% | 보통 | 마스크, 클리핑, 이펙트 등 개선 필요 |
| > 30% | 불량 | 구조적 문제 조사 필요 |

## 이전 버전 비교 결과 (베이스라인)

| 테스트 파일 | v1.0.9 | v1.0.10 | v1.0.11 | 비고 |
|-------------|--------|---------|---------|------|
| hooking | 4.36% | - | - | 텍스트 폰트 차이 |
| parameter_detail | 10.93% | 12.12% | 11.82% | 텍스트+마스크+그룹 |
| adapter_hadan2 | - | 26.22% | 19.90% | 파란배경, 마스크 페더링 |
| 최상단리뉴얼_251001 | - | - | 5.34% | 이미지/폰트 미세차이 |

## 주의사항
- 2단계에서 output 디렉토리 구조를 확인하고, 실제 파일명에 맞게 3~6단계 경로를 조정할 것
- 레퍼런스 이미지 파일명이 다를 수 있으니 glob으로 확인: `ls output/{psdname}/*.png`
- 비교 결과가 이전 베이스라인보다 악화되면 원인을 분석하고 사용자에게 보고할 것
- 빌드 없이 기존 dist 사용 가능하면 1단계 스킵 가능 (사용자에게 확인)

## Figma 플러그인 빌드 (code.ts 수정한 경우)
```bash
cd D:/Workspace/PSD_figma && npx esbuild figma-plugin/code.ts --bundle --outfile=figma-plugin/code.js --format=iife --target=es2017
```
- Figma 플러그인은 composite render와 별도 — 실제 Figma에서만 테스트 가능
- es2017 타겟 필수 (optional chaining 미지원)
