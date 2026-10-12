import type { SequenceField } from "./types.ts";

// 「順番に再生」で読み上げる順番。meaning は登録されている意味をすべて読む
export const SEQUENCE: SequenceField[] = ["word", "meaning", "en", "ja", "en", "en"];
