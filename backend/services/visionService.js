import tesseract from 'tesseract.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';
import { logHandoff, logInfo, logError } from "../utils/logger.js";

dotenv.config();

const execFileAsync = promisify(execFile);

const runNativeTesseract = async (imageBuffer) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'election-ocr-'));
  const inputPath = path.join(tempDir, 'input.png');

  try {
    await fs.writeFile(inputPath, imageBuffer);
    const { stdout } = await execFileAsync('tesseract', [inputPath, 'stdout', '--psm', '6', '--oem', '1'], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });

    return (stdout || '').trim();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

export const extractTextFromImage = async (imageBuffer, mimeType) => {
  try {
    logHandoff("Vision Agent: Extracting text from image using native OCR...");

    let normalizedOcrText = '';

    try {
      const nativeText = await runNativeTesseract(imageBuffer);
      normalizedOcrText = nativeText
        .replace(/\s+/g, ' ')
        .replace(/[|]/g, 'I')
        .trim();

      if (normalizedOcrText) {
        logInfo(`Vision Agent: Native OCR extracted text: "${normalizedOcrText.substring(0, 80)}..."`);
      } else {
        logInfo('Vision Agent: Native OCR returned no usable text.');
      }
    } catch (nativeError) {
      logError(`Vision Agent: Native OCR failed (${nativeError?.message || 'unknown error'})`, nativeError);

      try {
        logHandoff('Vision Agent: Falling back to tesseract.js OCR...');
        const ocrResult = await tesseract.recognize(imageBuffer, 'eng', {
          logger: () => {}
        });

        const ocrText = (ocrResult?.data?.text || '').trim();
        normalizedOcrText = ocrText
          .replace(/\s+/g, ' ')
          .replace(/[|]/g, 'I')
          .trim();

        if (normalizedOcrText) {
          logInfo(`Vision Agent: tesseract.js extracted text: "${normalizedOcrText.substring(0, 80)}..."`);
        } else {
          logInfo('Vision Agent: tesseract.js returned no usable text.');
        }
      } catch (fallbackError) {
        logError(`Vision Agent: tesseract.js OCR failed (${fallbackError?.message || 'unknown error'})`, fallbackError);
        normalizedOcrText = '';
      }
    }

    if (!normalizedOcrText) {
      logInfo('Vision Agent: OCR returned no usable text.');
      return '';
    }

    logInfo(`Vision Agent: Local OCR extracted text: "${normalizedOcrText.substring(0, 80)}..."`);

    return normalizedOcrText;
  } catch (error) {
    logError(`Vision Agent: Failed to extract text (${error?.message || 'unknown error'})`, error);
    throw error;
  }
};
