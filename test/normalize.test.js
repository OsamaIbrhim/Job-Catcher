import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeArabic, normalizeText, buildKeywordRegex, textContainsKeyword } from "../src/lib/textNormalize.js";

test("normalizeArabic strips diacritics", () => {
  assert.equal(normalizeArabic("مُبَرمِج"), "مبرمج");
});

test("normalizeArabic unifies alef forms", () => {
  assert.equal(normalizeArabic("أحمد"), "احمد");
  // note: normalizeArabic also folds ة -> ه (ta marbuta), so the ة in "إسكندرية" becomes "ه"
  assert.equal(normalizeArabic("إسكندرية"), "اسكندريه");
  assert.equal(normalizeArabic("آخر"), "اخر");
});

test("normalizeArabic unifies hamza forms", () => {
  assert.equal(normalizeArabic("مسؤول"), "مسءول");
  assert.equal(normalizeArabic("مسئول"), "مسءول");
});

test("normalizeText lowercases Latin text", () => {
  assert.equal(normalizeText("REACT Developer"), "react developer");
});

test("normalizeText collapses whitespace", () => {
  assert.equal(normalizeText("react   \n\n  developer"), "react developer");
});

test("word boundary: 'java' does not match inside 'javascript'", () => {
  assert.equal(textContainsKeyword(normalizeText("we use javascript here"), "java"), false);
});

test("word boundary: 'node' does not match inside unrelated substrings", () => {
  assert.equal(textContainsKeyword(normalizeText("nodejsexpert wanted"), "node"), false);
  assert.equal(textContainsKeyword(normalizeText("we need a node developer"), "node"), true);
});

test("word boundary: 'c#' matches as a standalone token", () => {
  assert.equal(textContainsKeyword(normalizeText("looking for a c# developer"), "c#"), true);
  assert.equal(textContainsKeyword(normalizeText("scala developer"), "c#"), false);
});

test("word boundary: '.net' matches when standalone but not inside 'asp.net'", () => {
  assert.equal(textContainsKeyword(normalizeText(".NET Core developer needed"), ".net"), true);
  // "asp.net" is its own exclude keyword, so this is expected: the
  // leading dot of ".net" is preceded by an alnum char ("p") inside "asp.net"
  assert.equal(textContainsKeyword(normalizeText("asp.net developer"), ".net"), false);
  assert.equal(textContainsKeyword(normalizeText("asp.net developer"), "asp.net"), true);
});

test("word boundary: multi-word phrases match", () => {
  assert.equal(textContainsKeyword(normalizeText("we build in react native"), "react native"), true);
  assert.equal(textContainsKeyword(normalizeText("front-end developer"), "front-end"), true);
});

test("buildKeywordRegex is case-insensitive", () => {
  assert.equal(buildKeywordRegex("react").test("REACT"), true);
});
