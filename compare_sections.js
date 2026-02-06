const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const pairs = [
  {
    name: '패러미트_v1',
    psd: 'psd/패러미트_상세페이지.png',
    figma: 'psd/output/export/패러미트_상세페이지.png',
  },
  {
    name: '패러미트_v2',
    psd: 'psd/패러미트_상세페이지.png',
    figma: 'psd/output/export/패러미트_상세페이지_v2.png',
  },
  {
    name: '어댑터_v1',
    psd: 'psd/어댑터_스케치5_하단2.png',
    figma: 'psd/output/export/어댑터_스케치5_하단2.png',
  },
  {
    name: '어댑터_v2',
    psd: 'psd/어댑터_스케치5_하단2.png',
    figma: 'psd/output/export/어댑터_스케치5_하단2_v2.png',
  },
];

const SECTION_HEIGHT = 1000;
const outDir = path.join(__dirname, 'psd', 'output', 'compare');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

(async () => {
  for (const pair of pairs) {
    console.log(`\n=== ${pair.name} ===`);
    const psdBuf = fs.readFileSync(path.join(__dirname, pair.psd));
    const psdImg = await loadImage(psdBuf);
    const figmaBuf = fs.readFileSync(path.join(__dirname, pair.figma));
    const figmaImg = await loadImage(figmaBuf);

    console.log(`PSD:   ${psdImg.width}x${psdImg.height}`);
    console.log(`Figma: ${figmaImg.width}x${figmaImg.height}`);

    const maxH = Math.max(psdImg.height, figmaImg.height);
    const sections = Math.ceil(maxH / SECTION_HEIGHT);

    // pixel diff 전체
    const diffWidth = Math.max(psdImg.width, figmaImg.width);
    const diffHeight = Math.min(psdImg.height, figmaImg.height);
    const diffCanvas = createCanvas(diffWidth, diffHeight);
    const diffCtx = diffCanvas.getContext('2d');

    // PSD 그리기
    const psdFull = createCanvas(psdImg.width, psdImg.height);
    const psdCtx = psdFull.getContext('2d');
    psdCtx.drawImage(psdImg, 0, 0);
    const psdData = psdCtx.getImageData(0, 0, psdImg.width, psdImg.height);

    // Figma 그리기
    const figmaFull = createCanvas(figmaImg.width, figmaImg.height);
    const figmaCtx = figmaFull.getContext('2d');
    figmaCtx.drawImage(figmaImg, 0, 0);
    const figmaData = figmaCtx.getImageData(0, 0, figmaImg.width, figmaImg.height);

    // 구간별 차이 계산
    const sectionDiffs = [];
    for (let s = 0; s < sections; s++) {
      const yStart = s * SECTION_HEIGHT;
      const yEnd = Math.min(yStart + SECTION_HEIGHT, diffHeight);
      if (yStart >= diffHeight) break;

      let totalDiff = 0;
      let pixelCount = 0;
      const w = Math.min(psdImg.width, figmaImg.width);

      for (let y = yStart; y < yEnd; y++) {
        for (let x = 0; x < w; x++) {
          const pIdx = (y * psdImg.width + x) * 4;
          const fIdx = (y * figmaImg.width + x) * 4;

          const dr = Math.abs(psdData.data[pIdx] - figmaData.data[fIdx]);
          const dg = Math.abs(psdData.data[pIdx + 1] - figmaData.data[fIdx + 1]);
          const db = Math.abs(psdData.data[pIdx + 2] - figmaData.data[fIdx + 2]);

          totalDiff += (dr + dg + db) / 3;
          pixelCount++;
        }
      }

      const avgDiff = totalDiff / pixelCount;
      const diffPct = (avgDiff / 255 * 100).toFixed(2);
      sectionDiffs.push({ section: s, yStart, yEnd, diffPct: parseFloat(diffPct), avgDiff });
    }

    // 결과 출력 (차이가 큰 순서로)
    sectionDiffs.sort((a, b) => b.diffPct - a.diffPct);
    console.log('\n--- Section differences (worst first) ---');
    for (const sd of sectionDiffs) {
      const bar = '#'.repeat(Math.round(sd.diffPct));
      console.log(`  y=${sd.yStart}-${sd.yEnd}: ${sd.diffPct}% ${bar}`);
    }

    // 상위 5개 차이 구간 이미지 저장 (side-by-side)
    const topN = sectionDiffs.slice(0, 5);
    for (const sd of topN) {
      const h = sd.yEnd - sd.yStart;
      const w = Math.max(psdImg.width, figmaImg.width);
      const canvas = createCanvas(w * 2 + 20, h + 30);
      const ctx = canvas.getContext('2d');

      // 배경
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 라벨
      ctx.fillStyle = '#fff';
      ctx.font = '16px sans-serif';
      ctx.fillText(`PSD (정답) y=${sd.yStart}-${sd.yEnd}`, 10, 18);
      ctx.fillText(`Figma (현재) diff=${sd.diffPct}%`, w + 30, 18);

      // PSD 구간
      ctx.drawImage(psdImg, 0, sd.yStart, psdImg.width, h, 0, 25, psdImg.width, h);

      // Figma 구간
      ctx.drawImage(figmaImg, 0, sd.yStart, figmaImg.width, h, w + 20, 25, figmaImg.width, h);

      const fname = `${pair.name}_diff_y${sd.yStart}.png`;
      fs.writeFileSync(path.join(outDir, fname), canvas.toBuffer('image/png'));
    }

    // 전체 차이 요약
    const totalAvg = sectionDiffs.reduce((s, d) => s + d.diffPct, 0) / sectionDiffs.length;
    console.log(`\nOverall average diff: ${totalAvg.toFixed(2)}%`);
  }

  console.log(`\nComparison images saved to: ${outDir}`);
})();
