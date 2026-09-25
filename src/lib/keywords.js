/**
 * lib/keywords.js
 * -----------------------------------------------------------
 * Keyword lists used for filtering, taken directly from
 * BUILD_PROMPT.md (the user's profile). If you want to adjust
 * filtering, this is the only place you need to edit.
 * -----------------------------------------------------------
 */

// Words that, if found in a post, count as a positive signal (works in this field)
export const INCLUDE_KEYWORDS = [
  "react",
  "reactjs",
  "react native",
  "next",
  "nextjs",
  "node",
  "nodejs",
  "express",
  "mongo",
  "mongodb",
  "mern",
  "mean",
  "javascript",
  "js",
  "typescript",
  "ts",
  "full stack",
  "fullstack",
  "frontend",
  "front-end",
  "backend",
  "back-end",
  "web developer",
  "software engineer",
  "redux",
  "tailwind",
  "rest api",
  "electron",
  // Arabic — many posts in these channels are written in Arabic only,
  // using transliterated tech terms. Written in natural spelling;
  // normalization (textNormalize.js) handles the alef/ta-marbuta
  // variants. Kept to multi-word or distinctive terms, since Arabic
  // keywords match as substrings (see buildKeywordRegex).
  "مطور ويب",
  "مبرمج ويب",
  "مطور مواقع",
  "مبرمج مواقع",
  "مطور واجهات",
  "واجهات امامية",
  "فرونت اند",
  "باك اند",
  "فول ستاك",
  "فل ستاك",
  "رياكت",
  "نود جي اس",
  "نكست جي اس",
  "جافاسكريبت",
  "جافا سكريبت",
  "جافاسكربت",
  "جافا سكربت",
  "تايب سكريبت",
  "تايبسكريبت",
  "مونجو",
  "مهندس برمجيات",
  "مطور برمجيات",
];

// Words that, if found, reject the post immediately (a different tech stack entirely)
export const EXCLUDE_KEYWORDS = [
  "flutter",
  "dart",
  "swift",
  "kotlin",
  "objective-c",
  "php",
  "laravel",
  "wordpress",
  ".net",
  "c#",
  "asp.net",
  "django",
  "ruby",
  "rails",
  "golang",
  "salesforce",
  "sap",
  "uipath",
  "odoo",
  "qa engineer",
  "manual testing",
  "graphic designer",
  "data entry",
  "sales representative",
  "accountant",
  // Arabic equivalents of the non-engineering roles above ("محاسب" is
  // deliberately left out: as a substring it also matches "محاسبي",
  // e.g. a React job building an accounting system).
  "مصمم جرافيك",
  "ادخال بيانات",
  "مندوب مبيعات",
];

// Seniority signals that are far enough from the user's experience level
// to be pure noise — reject outright. Checked against the job TITLE only
// (see scoreMessage in filter.js), never the full message body, since job
// descriptions routinely mention "reports to a Principal Engineer" etc.
// inside listings that are themselves junior/mid roles.
export const HARD_REJECT_SENIORITY_KEYWORDS = [
  "staff engineer",
  "staff software",
  "principal",
  "architect",
  "head of",
  "director",
  "vp of engineering",
  "engineering manager",
  "cto",
  "7+ years",
  "8+ years",
  "10+ years",
  "lead",
  "tech lead",
];

// "High seniority" signals — flag these but don't reject the post because of
// them. "senior" stays soft on purpose: many listings say "senior" while
// actually accepting mid-level.
export const SOFT_KEYWORDS = ["senior", "3+ years", "4+ years", "5+ years"];
