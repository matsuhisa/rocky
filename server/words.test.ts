import assert from "node:assert/strict";
import { test } from "node:test";
import { validateNewWord } from "./words.ts";

const existing = [{ word: "abandon", examples: [{ en: "a", ja: "あ" }] }];
const valid = { word: "resilient", examples: [{ en: "She is resilient.", ja: "彼女は打たれ強い。" }] };

test("正しい入力はそのまま通る", () => {
  assert.deepEqual(validateNewWord(valid, existing), { ok: true, word: valid });
});

test("前後の空白を除き、空の解説は保存しない", () => {
  const result = validateNewWord(
    { word: "  give up ", examples: [{ en: " Don't give up. ", ja: " 諦めるな。 ", note: "  " }] },
    existing,
  );
  assert.deepEqual(result, {
    ok: true,
    word: { word: "give up", examples: [{ en: "Don't give up.", ja: "諦めるな。" }] },
  });
});

test("解説があれば保存する", () => {
  const result = validateNewWord(
    { ...valid, examples: [{ ...valid.examples[0], note: "解説" }] },
    existing,
  );
  assert.ok(result.ok);
  assert.equal(result.word.examples[0].note, "解説");
});

test("登録済みの単語は弾く", () => {
  const result = validateNewWord({ ...valid, word: "abandon" }, existing);
  assert.deepEqual(result, { ok: false, errors: ["「abandon」はすでに登録されています。"] });
});

test("単語と例文が空ならそれぞれエラーになる", () => {
  const result = validateNewWord({ word: " ", examples: [] }, existing);
  assert.deepEqual(result, {
    ok: false,
    errors: ["単語を入力してください。", "例文を1つ以上入力してください。"],
  });
});

test("英文や日本語訳が欠けた例文は、何番目かを示して弾く", () => {
  const result = validateNewWord(
    { word: "resilient", examples: [valid.examples[0], { en: "Only English." }] },
    existing,
  );
  assert.deepEqual(result, { ok: false, errors: ["例文2の日本語訳を入力してください。"] });
});

test("長すぎる入力や多すぎる例文は弾く", () => {
  assert.equal(validateNewWord({ ...valid, word: "a".repeat(101) }, existing).ok, false);
  assert.equal(
    validateNewWord({ ...valid, examples: [{ en: "a".repeat(501), ja: "あ" }] }, existing).ok,
    false,
  );
  assert.equal(
    validateNewWord({ ...valid, examples: Array(11).fill(valid.examples[0]) }, existing).ok,
    false,
  );
});

test("オブジェクトでない入力でも落ちない", () => {
  for (const input of [null, "text", 1, [], { word: 1, examples: [null, "x"] }]) {
    assert.equal(validateNewWord(input, existing).ok, false);
  }
});
