export { TesseractOcr } from './ocr';
export { OpenAIVisionExtractor, YandexVisionExtractor, GeminiVisionExtractor, DEFAULT_VISION_MODEL } from './vision';
export { mergeExtractionResults, applyDefaults, isPlausibleWeight } from './extraction';
export { validateExtractedData } from './validators';
export type { ValidationResult } from './validators';
