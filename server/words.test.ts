import assert from "node:assert/strict";
import { test } from "node:test";
import { validateWord } from "./words.ts";

const existing = [{ word: "abandon" }];
const valid = {
  word: "resilient",
  meanings: ["回復力のある、立ち直りが早い"],
  examples: [{ en: "She is resilient.", ja: "彼女は打たれ強い。" }],
};

test("正しい入力はそのまま通る", () => {
  assert.deepEqual(validateWord(valid, existing), { ok: true, word: valid });
});

test("前後の空白を除き、空の解説は保存しない", () => {
  const result = validateWord(
    {
      word: "  give up ",
      meanings: [" 諦める、やめる "],
      examples: [{ en: " Don't give up. ", ja: " 諦めるな。 ", note: "  " }],
    },
    existing,
  );
  assert.deepEqual(result, {
    ok: true,
    word: {
      word: "give up",
      meanings: ["諦める、やめる"],
      examples: [{ en: "Don't give up.", ja: "諦めるな。" }],
    },
  });
});

test("解説があれば保存する", () => {
  const result = validateWord(
    { ...valid, examples: [{ ...valid.examples[0], note: "解説" }] },
    existing,
  );
  assert.ok(result.ok);
  assert.equal(result.word.examples[0].note, "解説");
});

test("登録済みの単語は弾く", () => {
  const result = validateWord({ ...valid, word: "abandon" }, existing);
  assert.deepEqual(result, { ok: false, errors: ["「abandon」はすでに登録されています。"] });
});

test("単語と例文が空ならそれぞれエラーになる", () => {
  const result = validateWord({ word: " ", meanings: [], examples: [] }, existing);
  assert.deepEqual(result, {
    ok: false,
    errors: [
      "単語を入力してください。",
      "意味を1つ以上入力してください。",
      "例文を1つ以上入力してください。",
    ],
  });
});

test("英文や日本語訳が欠けた例文は、何番目かを示して弾く", () => {
  const result = validateWord(
    { ...valid, examples: [valid.examples[0], { en: "Only English." }] },
    existing,
  );
  assert.deepEqual(result, { ok: false, errors: ["例文2の日本語訳を入力してください。"] });
});

test("長すぎる入力や多すぎる例文は弾く", () => {
  assert.equal(validateWord({ ...valid, word: "a".repeat(101) }, existing).ok, false);
  assert.equal(
    validateWord({ ...valid, examples: [{ en: "a".repeat(501), ja: "あ" }] }, existing).ok,
    false,
  );
  assert.equal(
    validateWord({ ...valid, examples: Array(11).fill(valid.examples[0]) }, existing).ok,
    false,
  );
});

test("オブジェクトでない入力でも落ちない", () => {
  for (const input of [null, "text", 1, [], { word: 1, examples: [null, "x"] }]) {
    assert.equal(validateWord(input, existing).ok, false);
  }
});

test("編集では、他の単語と重ならなければ同じ名前のまま保存できる", () => {
  // 編集のときは、自分以外で同じ名前の単語だけを existing に渡す
  assert.equal(validateWord({ ...valid, word: "abandon" }, []).ok, true);
});

test("意味は複数登録でき、登録した順に保存する", () => {
  const meanings = ["しかしながら、けれども、とはいえ", "どんなに〜でも"];
  const result = validateWord({ ...valid, word: "however", meanings }, existing);
  assert.ok(result.ok);
  assert.deepEqual(result.word.meanings, meanings);
});

test("意味が無い、または空の意味がある入力は弾く", () => {
  const { meanings: _, ...withoutMeanings } = valid;
  assert.deepEqual(validateWord(withoutMeanings, existing), {
    ok: false,
    errors: ["意味を1つ以上入力してください。"],
  });
  assert.deepEqual(validateWord({ ...valid, meanings: ["回復力のある", "  "] }, existing), {
    ok: false,
    errors: ["意味2を入力してください。"],
  });
});

test("長すぎる意味や多すぎる意味は弾く", () => {
  assert.equal(validateWord({ ...valid, meanings: ["あ".repeat(201)] }, existing).ok, false);
  assert.equal(validateWord({ ...valid, meanings: Array(11).fill("意味") }, existing).ok, false);
});
