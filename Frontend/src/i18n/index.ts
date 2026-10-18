import { en } from './en';
import { hi } from './hi';

export { translateServerMessage } from './serverMessages';
export type { TranslationKey } from './en';

export const SUPPORTED_LANGUAGES = ['en', 'hi'];
export const DEFAULT_LANGUAGE = 'en';
export const translations = { en, hi };
