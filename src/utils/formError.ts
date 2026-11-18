import type { TFunction } from 'i18next';

export function translateFormError(t: TFunction, message: string | undefined): string | undefined {
  if (!message) return undefined;
  return t(message, { defaultValue: message });
}
