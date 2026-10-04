// data/words.json の形。サーバーと画面の両方で使う

export type Example = {
  en: string;
  ja: string;
  note?: string;
};

export type Word = {
  word: string;
  examples: Example[];
};

// 読み上げの順番に書ける項目
export type SequenceField = "word" | "en" | "ja";

export type WordData = {
  sequence: SequenceField[];
  words: Word[];
};
