/**
 * fixtures/messages.js
 * -----------------------------------------------------------
 * Realistic Telegram message mock objects, shaped like real
 * GramJS objects, so we can test extraction/filtering logic
 * without actually connecting to Telegram.
 *
 * A couple of these fixtures use Arabic text on purpose (the
 * message content itself, not code) — these channels post job
 * listings in both English and Arabic, so the parser and filter
 * need to be tested against real Arabic posts too.
 *
 * Message shape mimics: message.message (the text), message.entities
 * (e.g. MessageEntityTextUrl/Url/Email), message.replyMarkup.rows
 * (inline keyboard buttons), message.date (epoch seconds), and
 * message.fwdFrom (if the message is a forward).
 *
 * Each entity's offset/length is computed here with indexOf
 * instead of counted by hand — manual index counting in a long
 * string is easy to get wrong.
 * -----------------------------------------------------------
 */

const nowSeconds = () => Math.floor(Date.now() / 1000);

function urlEntityFor(text, substring) {
  const offset = text.indexOf(substring);
  if (offset === -1) throw new Error(`fixture error: "${substring}" not found in message text`);
  return { className: "MessageEntityUrl", offset, length: substring.length };
}

function emailEntityFor(text, substring) {
  const offset = text.indexOf(substring);
  if (offset === -1) throw new Error(`fixture error: "${substring}" not found in message text`);
  return { className: "MessageEntityEmail", offset, length: substring.length };
}

// 1) A plain English post with a visible link in the text (MessageEntityUrl)
const englishWithPlainLinkText =
  "🚀 Senior React Developer\n🏢 Acme Corp\n📍 Cairo, Egypt\n\nWe are looking for a React developer with Node.js experience.\n\nApply: https://example.com/jobs/101";
export const englishWithPlainLink = {
  id: 101,
  date: nowSeconds() - 3600, // 1 hour ago
  message: englishWithPlainLinkText,
  entities: [urlEntityFor(englishWithPlainLinkText, "https://example.com/jobs/101")],
  replyMarkup: null,
  fwdFrom: null,
};

// 2) A post with a link hidden behind text (MessageEntityTextUrl)
const withHiddenTextLinkText = "Frontend Engineer needed\nCompany: Beta Ltd\nApply here for details";
const hiddenLinkOffset = withHiddenTextLinkText.indexOf("Apply here");
export const withHiddenTextLink = {
  id: 102,
  date: nowSeconds() - 7200,
  message: withHiddenTextLinkText,
  entities: [
    {
      className: "MessageEntityTextUrl",
      offset: hiddenLinkOffset,
      length: "Apply here".length,
      url: "https://example.com/jobs/102",
    },
  ],
  replyMarkup: null,
  fwdFrom: null,
};

// 3) A post with an "Apply" inline keyboard button instead of a link in the text
export const withInlineButton = {
  id: 103,
  date: nowSeconds() - 1800,
  message: "Full Stack Developer (MERN)\n🏢 تِك سوفت\n📍 القاهرة (Remote)",
  entities: [],
  replyMarkup: {
    className: "ReplyInlineMarkup",
    rows: [
      {
        buttons: [
          { className: "KeyboardButtonUrl", text: "Apply", url: "https://example.com/jobs/103" },
        ],
      },
    ],
  },
  fwdFrom: null,
};

// 4) A fully Arabic post, with an application email
const arabicPostText =
  "مطلوب مبرمج ويب Full Stack\nشركة: النخبة للبرمجيات\nالمكان: القاهرة\n\nخبرة في React و Node.js و MongoDB مطلوبة.\n\nللتقديم: careers@example.com";
export const arabicPost = {
  id: 104,
  date: nowSeconds() - 5400,
  message: arabicPostText,
  entities: [emailEntityFor(arabicPostText, "careers@example.com")],
  replyMarkup: null,
  fwdFrom: null,
};

// 5) A post with only an email (fallback link)
const emailOnlyPostText = "Backend Developer (Node.js/Express)\nSend your CV to hr@example.com";
export const emailOnlyPost = {
  id: 105,
  date: nowSeconds() - 900,
  message: emailOnlyPostText,
  entities: [emailEntityFor(emailOnlyPostText, "hr@example.com")],
  replyMarkup: null,
  fwdFrom: null,
};

// 6) An old post that was forwarded (re-posted) — must use the original date, not the repost date
const oldForwardedPostText = "React Developer needed urgently\nApply: https://example.com/jobs/106";
export const oldForwardedPost = {
  id: 106,
  date: nowSeconds() - 60, // posted just now
  message: oldForwardedPostText,
  entities: [urlEntityFor(oldForwardedPostText, "https://example.com/jobs/106")],
  replyMarkup: null,
  fwdFrom: {
    date: nowSeconds() - 400 * 24 * 60 * 60, // but the original is over a year old
  },
};

// 7) A message that isn't a job post at all (must be rejected as no-match)
export const notAJobPost = {
  id: 107,
  date: nowSeconds() - 600,
  message: "Good morning everyone! Any updates on that course we were discussing?",
  entities: [],
  replyMarkup: null,
  fwdFrom: null,
};

// 8) A PHP job that must be rejected (exclude keyword)
const phpJobPostText = "PHP Laravel Developer needed\nCompany: LegacyWorks\nApply: https://example.com/jobs/108";
export const phpJobPost = {
  id: 108,
  date: nowSeconds() - 1200,
  message: phpJobPostText,
  entities: [urlEntityFor(phpJobPostText, "https://example.com/jobs/108")],
  replyMarkup: null,
  fwdFrom: null,
};

// 9) React Native — must be accepted (JS-based, unlike Flutter)
const reactNativeJobPostText = "React Native Developer\nCompany: MobileFirst\nApply: https://example.com/jobs/109";
export const reactNativeJobPost = {
  id: 109,
  date: nowSeconds() - 300,
  message: reactNativeJobPostText,
  entities: [urlEntityFor(reactNativeJobPostText, "https://example.com/jobs/109")],
  replyMarkup: null,
  fwdFrom: null,
};

// 10) Flutter — must be rejected (a different language stack entirely, even though it's mobile like React Native)
const flutterJobPostText = "Flutter Developer needed\nCompany: MobileFirst\nApply: https://example.com/jobs/110";
export const flutterJobPost = {
  id: 110,
  date: nowSeconds() - 300,
  message: flutterJobPostText,
  entities: [urlEntityFor(flutterJobPostText, "https://example.com/jobs/110")],
  replyMarkup: null,
  fwdFrom: null,
};

// 11) A senior job post — must be accepted, but flagged with a warning ⚠️
// ("senior" is a soft signal, kept in the title on purpose since the hard
// seniority reject checks the title too — this confirms "senior" alone in a
// title does NOT trigger the hard reject).
const seniorJobPostText =
  "Senior Full Stack Developer\nCompany: BigCorp\nApply: https://example.com/jobs/111";
export const seniorJobPost = {
  id: 111,
  date: nowSeconds() - 200,
  message: seniorJobPostText,
  entities: [urlEntityFor(seniorJobPostText, "https://example.com/jobs/111")],
  replyMarkup: null,
  fwdFrom: null,
};

// 12) A title that hard-rejects on seniority ("Principal" in the title itself)
const principalTitlePostText =
  "Principal Software Engineer\nCompany: BigCorp\nApply: https://example.com/jobs/112";
export const principalTitlePost = {
  id: 112,
  date: nowSeconds() - 200,
  message: principalTitlePostText,
  entities: [urlEntityFor(principalTitlePostText, "https://example.com/jobs/112")],
  replyMarkup: null,
  fwdFrom: null,
};

// 13) "Principal" appears in the BODY, not the title — must NOT be rejected.
// This is the critical case from AI_LAYER_PROMPT.md: "you will report to a
// Principal Engineer" inside a listing that is itself a junior/mid role.
const mentionsPrincipalInBodyText =
  "Junior React Developer\nCompany: BigCorp\n\nYou will report to a Principal Engineer and be mentored by our Staff Engineer team.\n\nApply: https://example.com/jobs/113";
export const mentionsPrincipalInBodyPost = {
  id: 113,
  date: nowSeconds() - 200,
  message: mentionsPrincipalInBodyText,
  entities: [urlEntityFor(mentionsPrincipalInBodyText, "https://example.com/jobs/113")],
  replyMarkup: null,
  fwdFrom: null,
};

// 14) "10+ years" in the title — hard reject (moved from soft to hard in Part 1)
const tenPlusYearsTitlePostText =
  "Full Stack Developer (10+ years)\nCompany: BigCorp\nApply: https://example.com/jobs/114";
export const tenPlusYearsTitlePost = {
  id: 114,
  date: nowSeconds() - 200,
  message: tenPlusYearsTitlePostText,
  entities: [urlEntityFor(tenPlusYearsTitlePostText, "https://example.com/jobs/114")],
  replyMarkup: null,
  fwdFrom: null,
};

// 15) "Tech Lead" — hard rejected (tightened after the initial build; see
// keywords.js HARD_REJECT_SENIORITY_KEYWORDS)
const techLeadTitlePostText =
  "Tech Lead - Full Stack (Node.js/React)\nCompany: BigCorp\nApply: https://example.com/jobs/115";
export const techLeadTitlePost = {
  id: 115,
  date: nowSeconds() - 200,
  message: techLeadTitlePostText,
  entities: [urlEntityFor(techLeadTitlePostText, "https://example.com/jobs/115")],
  replyMarkup: null,
  fwdFrom: null,
};
