#!/usr/bin/env node

// 만료일 체크 (2026-03-07 00:00:00 KST)
const EXPIRY_DATE = new Date('2026-03-07T00:00:00+09:00');
if (new Date() >= EXPIRY_DATE) {
  console.error('This software has expired. Please contact the developer.');
  process.exit(1);
}

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { PsdParser } from '../parser/psdParser';
import { PsdToFigmaConverter } from '../converter/converter';
import { FigmaClient } from '../figma/figmaClient';

// ESM chalk를 동적으로 import
async function getChalk() {
  const chalk = await import('chalk');
  return chalk.default;
}

async function main() {
  const chalk = await getChalk();
  const program = new Command();

  program
    .name('psd2figma')
    .description('Convert PSD files to Figma-compatible format')
    .version('1.0.0');

  // convert 명령어
  program
    .command('convert')
    .description('Convert a PSD/PSB file to Figma format')
    .argument('<psd-file>', 'Path to the PSD or PSB file')
    .option('-o, --output <dir>', 'Output directory', './output')
    .option('-t, --token <token>', 'Figma personal access token')
    .option('--no-groups', 'Flatten layer groups')
    .option('--no-images', 'Skip image extraction')
    .option('--stream', 'Stream images to disk during parsing (for large files)')
    .action(async (psdFile: string, options) => {
      try {
        console.log(chalk.blue('\n🎨 PSD to Figma Converter\n'));

        // 파일 존재 확인
        const absolutePath = path.resolve(psdFile);
        if (!fs.existsSync(absolutePath)) {
          console.error(chalk.red(`Error: File not found: ${absolutePath}`));
          process.exit(1);
        }

        // PSD 파일명에서 출력 폴더명 생성
        const psdFileName = path.basename(absolutePath, path.extname(absolutePath));
        const outputDir = path.join(options.output, psdFileName);

        console.log(chalk.gray(`Input: ${absolutePath}`));
        console.log(chalk.gray(`Output: ${path.resolve(outputDir)}\n`));

        // PSD 파싱
        console.log(chalk.yellow('Parsing PSD file...'));
        const useStreaming = options.stream === true;
        if (useStreaming) {
          console.log(chalk.cyan('  Streaming mode enabled - images will be written to disk during parsing'));
          // 이전 변환의 잔여 이미지 파일 정리 (재변환 시 파일 중복 방지)
          const imagesDir = path.join(outputDir, 'images');
          if (fs.existsSync(imagesDir)) {
            const oldFiles = fs.readdirSync(imagesDir);
            if (oldFiles.length > 0) {
              for (const f of oldFiles) {
                fs.unlinkSync(path.join(imagesDir, f));
              }
              console.log(chalk.gray(`  Cleaned ${oldFiles.length} old images from previous conversion`));
            }
          }
        }
        const parser = new PsdParser(absolutePath, {
          streamImages: useStreaming,
          outputDir: useStreaming ? outputDir : undefined,
        });
        const psd = await parser.parse();
        console.log(chalk.green(`  ✓ Parsed: ${psd.name} (${psd.width}x${psd.height})`));

        // 레이어 트리 출력
        console.log(chalk.yellow('\nLayer structure:'));
        parser.printLayerTree(psd.layers);

        // 변환
        console.log(chalk.yellow('\nConverting to Figma format...'));
        const converter = new PsdToFigmaConverter({
          figmaToken: options.token || '',
          outputDir: outputDir,
          preserveGroups: options.groups !== false,
          exportImages: options.images !== false,
        });

        const result = await converter.convert(psd);

        // 결과 저장
        console.log(chalk.yellow('\nSaving output...'));
        const savedFiles = await converter.saveOutput(result, outputDir);

        // 요약 출력
        console.log(chalk.green('\n✓ Conversion complete!\n'));
        console.log(chalk.cyan('Summary:'));
        console.log(`  Total layers: ${result.summary.totalLayers}`);
        console.log(`  Groups: ${result.summary.groups}`);
        console.log(`  Text layers: ${result.summary.textLayers}`);
        console.log(`  Image layers: ${result.summary.imageLayers}`);
        console.log(`  Shape layers: ${result.summary.shapeLayers}`);
        if (result.summary.adjustmentLayers > 0) {
          console.log(`  Adjustment layers: ${result.summary.adjustmentLayers}`);
        }
        if (result.summary.smartFilterLayers > 0) {
          console.log(`  Smart filter layers: ${result.summary.smartFilterLayers}`);
        }

        console.log(chalk.cyan('\nOutput files:'));
        savedFiles.forEach((file) => {
          console.log(`  ${file}`);
        });

        console.log(chalk.blue('\nNext steps:'));
        console.log('  1. Open Figma and create a new file');
        console.log('  2. Install the PSD Import plugin (or use the provided plugin)');
        console.log('  3. Import the generated JSON file');

      } catch (error) {
        console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // analyze 명령어 - PSD/PSB 분석만
  program
    .command('analyze')
    .description('Analyze a PSD/PSB file structure without converting')
    .argument('<psd-file>', 'Path to the PSD or PSB file')
    .action(async (psdFile: string) => {
      try {
        console.log(chalk.blue('\n🔍 PSD Analyzer\n'));

        const absolutePath = path.resolve(psdFile);
        if (!fs.existsSync(absolutePath)) {
          console.error(chalk.red(`Error: File not found: ${absolutePath}`));
          process.exit(1);
        }

        const parser = new PsdParser(absolutePath);
        const psd = await parser.parse();

        console.log(chalk.cyan('File info:'));
        console.log(`  Name: ${psd.name}`);
        console.log(`  Dimensions: ${psd.width}x${psd.height}px`);
        console.log(`  Total layers: ${countLayers(psd.layers)}`);

        console.log(chalk.cyan('\nLayer structure:'));
        parser.printLayerTree(psd.layers);

      } catch (error) {
        console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // validate 명령어 - Figma 토큰 확인
  program
    .command('validate-token')
    .description('Validate Figma personal access token')
    .argument('<token>', 'Figma personal access token')
    .action(async (token: string) => {
      try {
        console.log(chalk.blue('\n🔐 Validating Figma token...\n'));

        const client = new FigmaClient(token);
        const isValid = await client.validateToken();

        if (isValid) {
          const user = await client.getMe();
          console.log(chalk.green('✓ Token is valid!'));
          console.log(`  User: ${user.handle}`);
          console.log(`  Email: ${user.email}`);
        } else {
          console.log(chalk.red('✗ Token is invalid'));
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  program.parse();
}

function countLayers(layers: any[]): number {
  let count = 0;
  for (const layer of layers) {
    count++;
    if (layer.children) {
      count += countLayers(layer.children);
    }
  }
  return count;
}

main().catch(console.error);
