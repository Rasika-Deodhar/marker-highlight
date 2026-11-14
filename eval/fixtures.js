// Evaluation texts. Each has the exact words a careful human reader would insist on
// (`mustCover`, expected as tier-1 highlights) and the meaning-critical words that must be
// marked in either tier (`mustKeep`). Written and annotated by the project authors: it is
// a regression set, not an independent benchmark. See docs/EVALUATION.md.

export const FIXTURES = [
  {
    name: 'medication leaflet',
    blocks: [
      { text: 'Taking ibuprofen safely', kind: 'heading' },
      'Ibuprofen relieves pain and reduces fever. Adults may take 200 to 400 mg every 6 hours, but must not exceed 1200 mg in 24 hours unless a doctor advises otherwise.',
      'Do not take ibuprofen on an empty stomach. It is not suitable for people with stomach ulcers, and it should never be combined with other anti-inflammatory medicines without medical advice.',
      'Stop taking it and seek help if you notice black stools, although mild nausea is common and usually harmless.',
    ],
    mustCover: ['Ibuprofen', '1200 mg', '24 hours', 'stomach ulcers', 'black stools'],
    mustKeep: ['not exceed', 'unless', 'Do not take', 'not suitable', 'never be combined', 'without medical advice', 'although', 'but'],
  },
  {
    name: 'tenancy clause',
    blocks: [
      'The Tenant shall pay rent of 950 pounds on the first day of each month. The Tenant shall not sublet the Property without the prior written consent of the Landlord.',
      'The Landlord may enter the Property only after giving 24 hours notice, except in an emergency. The deposit will be returned within 14 days unless the Property has been damaged.',
      'Neither party may terminate this agreement before 12 months have passed. Failure to pay rent is not excused by a dispute over repairs.',
    ],
    mustCover: ['Tenant', 'Landlord', '950 pounds', 'sublet', 'deposit', '14 days', '12 months'],
    mustKeep: ['not sublet', 'without the prior written consent', 'only after', 'except', 'unless', 'Neither party', 'not excused'],
  },
  {
    name: 'science news',
    blocks: [
      { text: 'Coffee and heart health', kind: 'heading' },
      'A study of 450,000 adults in the UK Biobank found that drinking two to three cups of coffee a day was linked to a lower risk of heart disease. The researchers did not find the same benefit for people who drank more than five cups.',
      'The study was observational, so it cannot show that coffee causes the lower risk. Coffee drinkers may differ from non-drinkers in ways the researchers did not measure.',
      'Decaffeinated coffee was associated with fewer deaths but not with fewer irregular heartbeats. However, the authors caution that few participants drank only decaffeinated coffee.',
    ],
    mustCover: ['450,000 adults', 'UK Biobank', 'coffee', 'heart disease', 'observational', 'Decaffeinated'],
    mustKeep: ['lower risk', 'did not find', 'cannot show', 'did not measure', 'but not', 'However', 'few participants', 'non-drinkers'],
  },
  {
    name: 'software documentation',
    blocks: [
      { text: 'Resetting the cache', kind: 'heading' },
      'Running reset clears the local cache and rebuilds the index. It does not delete your project files, and it never touches the remote repository.',
      'The reset cannot be undone. Unsaved changes in the editor are not affected, but any uncommitted index entries are lost unless you pass the keep flag.',
      'Use reset only when the index is corrupted. A normal rebuild is faster and is nearly always enough.',
    ],
    mustCover: ['reset', 'cache', 'index', 'project files', 'remote repository', 'keep flag', 'corrupted'],
    mustKeep: ['does not delete', 'never touches', 'cannot be undone', 'not affected', 'uncommitted', 'unless', 'only when', 'but'],
  },
  {
    name: 'work email',
    blocks: [
      'Hi team, the launch of the billing dashboard is moving from 3 March to 17 March. The delay is not caused by engineering; the security review has not finished.',
      'Marketing should not publish the announcement until Priya confirms the new date. Nothing changes for existing customers, and no action is needed from support.',
      'If the review finds no issues by Friday we keep 17 March, otherwise we slip again.',
    ],
    mustCover: ['billing dashboard', '3 March', '17 March', 'security review', 'Priya', 'Friday'],
    mustKeep: ['not caused', 'not finished', 'not publish', 'until Priya', 'Nothing changes', 'no action', 'no issues', 'otherwise'],
  },
  {
    name: 'history explainer',
    blocks: [
      { text: 'The printing press', kind: 'heading' },
      'Johannes Gutenberg did not invent printing. Movable type had been used in China and Korea centuries earlier, although it never displaced hand copying there.',
      'What Gutenberg introduced around 1450 in Mainz was a practical system: a metal alloy for type, an oil-based ink and a press adapted from winemaking. Without all three, printing would not have been cheap enough to spread.',
      'Within 50 years, presses in Europe had produced millions of books. Literacy did not rise immediately, but the cost of a book fell sharply.',
    ],
    mustCover: ['Gutenberg', 'Movable type', 'China', 'Korea', '1450', 'Mainz', '50 years'],
    mustKeep: ['did not invent', 'although', 'never displaced', 'Without all three', 'not have been cheap', 'did not rise', 'but'],
  },
];
