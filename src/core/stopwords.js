// English function words. They carry grammar, not topic, so they are never highlighted on
// their own (they can still be absorbed into a phrase, e.g. "theory of mind").
// Swappable per language: analyze() accepts a `stopwords` Set.
export const STOPWORDS_EN = new Set(
  `a about above after again against all almost also although always am among an and any are
  aren't as at be because been before being below between both but by can can't cannot could
  couldn't did didn't do does doesn't doing don't down during each either else even ever every
  few for from further get gets got had hadn't has hasn't have haven't having he he'd he'll he's
  her here here's hers herself him himself his how how's however i i'd i'll i'm i've if in into
  is isn't it it's its itself just let's like made make makes many may me might more most much
  must mustn't my myself no nor not now of off often on once one only onto or other others ought
  our ours ourselves out over own per quite rather really said same say says shall shan't she
  she'd she'll she's should shouldn't since so some such than that that's the their theirs them
  themselves then there there's these they they'd they'll they're they've thing things this
  those though through thus to too under until up upon us use used uses using very via was
  wasn't we we'd we'll we're we've well were weren't what what's when when's where where's
  whether which while who who's whom whose why why's will with within without won't would
  wouldn't yet you you'd you'll you're you've your yours yourself yourselves`
    .split(/\s+/)
    .filter(Boolean),
);

// Everyday content words. They are not grammar, so they may still be highlighted, but they
// are common in every text and therefore say little about this one. The engine discounts
// them: a small stand-in for the corpus statistics (IDF) a single-document tool lacks.
export const COMMON_EN = new Set(
  `able back bad begin best better big bit call came case change come comes day days different
  done early end enough example fact far feel find first found gave general give given go goes
  going gone good great group hand hard help high hold idea keep kind know known large last
  later least left less life little long look looking lot low man mean means name need needed
  new next number old open part people person place point put read real right second see seem
  seen set show side small something start still take taken tell think time today took top try
  turn want way ways whole word words work works world year years`
    .split(/\s+/)
    .filter(Boolean),
);
