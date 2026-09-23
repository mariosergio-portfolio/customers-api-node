import { z } from 'zod';

/** Blank strings behave like absent parameters (same as the Java `isBlank` checks). */
const blankToUndefined = (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

const optionalText = z.preprocess(blankToUndefined, z.string().trim().max(255).optional());

export const ORDER_BY_VALUES = ['id', 'name'];

export const companyParamsSchema = z.object({
  companyId: z
    .string()
    .regex(/^-?\d+$/, 'must be an integer')
    .transform(Number)
    .pipe(z.number().int().safe()),
});

export const searchQuerySchema = z.object({
  name: optionalText,
  country: optionalText,
  orderBy: z.preprocess(
    blankToUndefined,
    z
      .string()
      .toLowerCase()
      .pipe(z.enum(ORDER_BY_VALUES, `must be one of: ${ORDER_BY_VALUES.join(', ')}`))
      .default('id'),
  ),
});

export const customerParamsSchema = z.object({
  customerPk: z.guid('must be a UUID').transform((value) => value.toLowerCase()),
});

export const DEFAULT_LANGUAGE = 'en-US';

/**
 * BCP-47-style language code as used by Polly ("en-US", "pt-BR", "cmn-CN", "en-GB-WLS", "arb").
 * Casing is normalised (language lower-case, region upper-case) because Polly is case-sensitive.
 */
export const pronounceQuerySchema = z.object({
  language: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .regex(/^[a-z]{2,3}(-[a-z0-9]{2,3})*$/i, 'must be a language code such as en-US or pt-BR')
      .transform((value) => value.split('-').map((part, i) => (i === 0 ? part.toLowerCase() : part.toUpperCase())).join('-'))
      .default(DEFAULT_LANGUAGE),
  ),
});
