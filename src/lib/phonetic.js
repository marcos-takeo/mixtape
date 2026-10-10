// Approximate "how it sounds" key for Portuguese (Brazilian) text, used only
// as a fallback when voice search finds no spelling match.
//
// Speech engines often return a word spelled differently from the song title
// even though it sounds the same ("coracao" / "corasao", "amor" / "amo",
// "nao" / "naum"). Two strings that produce the same key are treated as
// close. It deliberately merges lots of sounds, so it is never used on its
// own for typed search and always ranks below a real spelling match.
//
// Input is expected to be already normalised with normalizeForSearch
// (lowercase, no accents, single spaces).

const VOWELS = "aeiou";

function keyForWord(word) {
  let w = word;

  // Word-initial "ex" + vowel sounds like "ez" (exagerado, exemplo).
  w = w.replace(/^ex(?=[aeiou])/, "ez");

  // Digraphs first, before single letters are rewritten.
  w = w
    .replace(/lh/g, "L")
    .replace(/nh/g, "N")
    .replace(/ch|sh/g, "X")
    .replace(/rr/g, "R")
    .replace(/ss|sc(?=[ei])|xc(?=[ei])/g, "S")
    .replace(/qu(?=[ei])/g, "K")
    .replace(/gu(?=[ei])/g, "G");

  w = w
    .replace(/c(?=[ei])/g, "S")
    .replace(/[ckq]/g, "K")
    .replace(/h/g, "")
    .replace(/g(?=[ei])/g, "J")
    .replace(/j/g, "J")
    .replace(/g/g, "G")
    .replace(/[sz]/g, "S")
    .replace(/x/g, "X")
    .replace(/y/g, "i")
    .replace(/w/g, "v");

  // Nasal vowels: a vowel followed by m/n before a consonant or at the end
  // is one nasal sound ("canto" ~ "cato", "bem" ~ "be", "som" ~ "so").
  w = w.replace(new RegExp(`([${VOWELS}])[mn](?![${VOWELS}])`, "g"), "$1");

  // "ao" / "au" / "am" word endings all sound alike (nao, naum, nam).
  w = w.replace(/(ao|au|am)$/, "AO");

  // "l" after a vowel sounds like "u" in Brazilian Portuguese (Brasil, mil).
  w = w.replace(new RegExp(`([${VOWELS}])l(?![${VOWELS}])`, "g"), "$1u");

  // A final "r" is often not pronounced (amor ~ amo, cantar ~ canta).
  if (w.length > 2) w = w.replace(/r$/, "");

  // Unstressed word endings: final o ~ u, final e ~ i.
  w = w.replace(/o$/, "u").replace(/e$/, "i");

  // Doubled letters sound like one.
  w = w.replace(/(.)\1+/g, "$1");

  return w;
}

/** Phonetic key of an already-normalised string (words keep their spaces). */
export function phoneticKey(normalized) {
  if (!normalized) return "";
  return normalized
    .split(" ")
    .filter(Boolean)
    .map(keyForWord)
    .join(" ");
}
