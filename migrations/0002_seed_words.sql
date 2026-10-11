-- data/words.json で管理していた単語を移す

INSERT INTO words (word) VALUES ('resilient');
INSERT INTO examples (word_id, position, en, ja, note)
  VALUES ((SELECT id FROM words WHERE word = 'resilient'), 0, 'She remained resilient despite all the setbacks.', '彼女は数々の挫折にもかかわらず、くじけなかった。', 'remain + 形容詞 で「〜のままでいる」。setback は「挫折、つまずき」。');

INSERT INTO words (word) VALUES ('abandon');
INSERT INTO examples (word_id, position, en, ja, note)
  VALUES ((SELECT id FROM words WHERE word = 'abandon'), 0, 'He had to abandon his plan.', '彼は計画を断念しなければならなかった。', NULL);
INSERT INTO examples (word_id, position, en, ja, note)
  VALUES ((SELECT id FROM words WHERE word = 'abandon'), 1, 'The crew abandoned the sinking ship.', '乗組員は沈みゆく船を見捨てた。', '「計画をやめる」と「人や物を見捨てる」の両方に使える。');

INSERT INTO words (word) VALUES ('either');
INSERT INTO examples (word_id, position, en, ja, note)
  VALUES ((SELECT id FROM words WHERE word = 'either'), 0, 'Employees can register for the workshop either online or at the front desk.', '従業員は、オンラインまたは受付のどちらかでワークショップの参加登録を行うことができます。', 'eitherの後ろにある or に注目するのがポイントです。
TOEIC Part 5 では 「either A or B（AかBのどちらか）」 という相関接続詞のコロケーション（定番の組み合わせ）が非常に頻出します。

- either A or B（AまたはBのどちらか）
- both A and B（AとBの両方）
- neither A nor B（AもBも〜ない）');
