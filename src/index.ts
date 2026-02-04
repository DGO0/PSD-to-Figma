// PSD to Figma Converter - Main Entry Point

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
