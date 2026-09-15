/**
 * lib/textNormalize.js
 * -----------------------------------------------------------
 * Text normalization helpers so keyword matching is reliable
 * regardless of spelling variations.
 *
 * "Normalization" here means: collapsing different forms of the
 * same character/word into one consistent form before comparing.
 * Example: "Node.js", "NODEJS", "nodejs" all need to become the
 * same shape before we can compare them against one keyword,
 * "nodejs". The same idea applies to Arabic spelling variants
 * (e.g. different ways people write the same hamza or alef),
 * since these channels post job listings in both English and
 * Arabic.
 * -----------------------------------------------------------
 */

// Arabic diacritics (fatha, damma, kasra, sukoon, tanween...) + tatweel (ـ)
const ARABIC_DIACRITICS_RE = /[ً-ْٰـ]/g;

/**
 * Normalize Arabic letter variants: أ إ آ ٱ -> ا, alef maksura ى -> ي,
 * hamza-on-waw/ya ؤ ئ -> ء, and ta marbuta ة -> ه. Goal: spelling
 * differences in the same word (e.g. "الاسكندرية" vs "الأسكندرية")
 * don't break keyword matching.
 */
export function normalizeArabic(str) {
  if (!str) return "";
  return str
    .replace(ARABIC_DIACRITICS_RE, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ؤئ]/g, "ء")
    .replace(/ة/g, "ه");
}

/**
 * General-purpose normalization: works on any text (Arabic,
 * English, or mixed).
 * - normalizes Arabic letter variants as above
 * - lowercases Latin text
 * - collapses any run of whitespace (newlines, tabs...) into one space
 */
export function normalizeText(str) {
  if (!str) return "";
  return normalizeArabic(str)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a regex for one keyword with hand-computed word boundaries
 * instead of the usual \b, because JavaScript's \b breaks on
 * keywords containing symbols like "c#" or ".net", or multi-word
 * phrases like "react native".
 *
 * The idea: the keyword must not be directly touching a Latin
 * letter/digit on either side (so "java" won't match inside
 * "javascript", since "javascript" has an "s" right after "java").
 */
export function buildKeywordRegex(keyword) {
  const escaped = escapeRegex(keyword.toLowerCase());
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
}

export function textContainsKeyword(normalizedText, keyword) {
  return buildKeywordRegex(keyword).test(normalizedText);
}
