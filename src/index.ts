// PSD to Figma Converter - Main Entry Point

// 만료일 체크 (2026-03-07 00:00:00 KST)
const EXPIRY_DATE = new Date('2026-03-07T00:00:00+09:00');
if (new Date() >= EXPIRY_DATE) {
  throw new Error('This software has expired. Please contact the developer.');
}

export { PsdParser } from './parser/psdParser';
export { PsdToFigmaConverter, ConversionResult, FigmaExportData } from './converter/converter';
export { FigmaClient } from './figma/figmaClient';
export * from './types';

// Usage example:
// import { PsdParser, PsdToFigmaConverter } from 'psd-to-figma';
//
// const parser = new PsdParser('./design.psd');
// const psd = await parser.parse();
//
// const converter = new PsdToFigmaConverter({ exportImages: true });
// const result = await converter.convert(psd);
// await converter.saveOutput(result, './output');
