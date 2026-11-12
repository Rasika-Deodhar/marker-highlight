// Words that change what a sentence claims. They are rarely "important" by any statistical
// measure, yet dropping one from a skim path can reverse or distort the meaning. The engine
// marks them as second-tier *context* (underlined), and src/core/audit.js checks that none
// was left out. English only; injectable later alongside the stopword lists.

const set = (s) => new Set(s.split(/\s+/).filter(Boolean));

/** Reverse or cancel the claim. Always marked, together with the word they negate. */
export const NEGATIONS_EN = set(
  `not no never none nobody nothing nowhere neither nor cannot without hardly barely scarcely
  rarely seldom unless except`,
);

/** Turn the relation between clauses around. Marked wherever their sentence is highlighted. */
export const CONTRASTS_EN = set(`but however although though despite yet instead whereas nevertheless nonetheless otherwise`);

/** Limit, scale or condition the word that follows. Marked when directly before a marked word. */
export const QUALIFIERS_EN = set(
  `only all every most many few fewer less least more half always often sometimes usually must
  may might should could if because before after until than rather against versus almost nearly`,
);

const NEGATION_CONTRACTION_RE = /n['’]t$/i;
const NEGATIVE_AFFIX_RE = /^(?:un|non|dis|mis|anti)-?\p{L}{4,}$|^\p{L}{3,}less$/iu;
// Words that merely look negative.
const NOT_NEGATIVE_RE = /^(?:under|uni|until|unless|uncle|discuss|discover|distan|distrib|distinct|display|dish|disk|disc|district|disease|miss|mist|misc|antiq|antic|bless|unless)/i;

export const isNegation = (word) => NEGATIONS_EN.has(word.toLowerCase()) || NEGATION_CONTRACTION_RE.test(word);
export const isContrast = (word) => CONTRASTS_EN.has(word.toLowerCase());
export const isQualifier = (word) => QUALIFIERS_EN.has(word.toLowerCase());
/** "unaided", "non-fatal", "useless": the negation lives inside the word. */
export const hasNegativeAffix = (word) => NEGATIVE_AFFIX_RE.test(word) && !NOT_NEGATIVE_RE.test(word);

/** How far past a negation to look for the word it negates ("did not really improve"). */
export const NEGATION_REACH = 4;
