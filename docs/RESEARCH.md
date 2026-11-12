# Research: fast reading, and why the UI is built this way

This document records what the reading research says, how strong each piece of evidence
is, and which design decision each finding led to.

## Summary

1. **Reading much faster without losing comprehension is not possible.** Speed and
   comprehension trade off. Products that promise otherwise (one-word-at-a-time flashing,
   bolding the first half of each word) do not hold up when measured.
2. **Skimming is the one fast-reading strategy that works**, for one goal: getting the
   important ideas. It does not improve deeper inference.
3. **People already skim on screens**, but they guess where the important material is and
   systematically miss what sits lower on the page or later in a paragraph.
4. **Visual marks reliably steer attention** to the marked words, whether or not those
   words deserve it. So marks help when they are accurate and rare, and hurt when they are
   wrong or everywhere.

Marker Highlight is therefore a **guided-skimming tool**: it keeps the whole text on the
page, marks a small share of it, and leaves the reader free to read any part in full.

One caveat governs everything below: **no study found here tests this exact product**
(machine-chosen keyword highlights for adult skimming). The design is assembled from
adjacent findings, and the one closely related study (Chi et al., 2007) is a caution, not
an endorsement. Validating the product on real readers is on the [roadmap](ROADMAP.md).

## Findings

### 1. Speed and comprehension trade off

Rayner, Schotter, Masson, Potter and Treiman (2016) reviewed decades of reading research
and concluded that there is no technique that lets people read far faster while
understanding as much. Eye movements account for only a small share of reading time; the
limit is language processing. Presenting one word at a time (RSVP) removes the ability to
look back, and looking back supports comprehension. The same review notes that skimming
can be an effective way to get through text quickly when full comprehension is not the
goal. [1]

"Bionic Reading" (bolding the start of each word) was tested by Readwise on 2,074 readers:
reading speed was about 1% *slower* with it, and comprehension was unchanged. [2]

### 2. Skimming preserves the important ideas

Duggan and Payne (2009) gave readers half the time needed to read expository texts.
Readers who skimmed the whole text remembered more of the important ideas than readers who
read half of it normally. Skimming did not improve performance on inference questions.
Follow-up eye-tracking work describes the strategy as *satisficing*: read a passage until
the rate of new information drops, then jump ahead. Skimmers spent more time on text
earlier in each paragraph and earlier on the page. [3] [4]

### 3. Screen readers scan, and scanning misses things

Morkes and Nielsen (1997) found that 79% of test users always scanned a new web page and
16% read word by word. Rewriting a page to be scannable, with highlighted keywords among
the techniques, improved measured usability by 47% on their test site. [5] [6] Later
eye-tracking work by Nielsen Norman Group describes the F-shaped pattern (first lines,
then down the left edge), which leaves content further down and to the right unread. [7]

### 4. Marks attract attention regardless of merit

The isolation (von Restorff) effect: an item that differs from its surroundings is noticed
and remembered better. For text, Dunlosky et al. (2013) report that marked text is better
remembered than unmarked text, sometimes at the expense of the unmarked text, and they
rate highlighting done *by students as a study technique* as low-utility. [8]

Chi, Gumbrecht and Hong (2007) eye-tracked people reading with no highlights, keyword
highlights and sentence highlights. Highlights drew the eye whether or not they were
relevant to the reader's task. [9] [10]

Lorch's work on text signals (headings, typographic emphasis) finds that signals direct
attention and improve memory for the signalled content, without making the rest of the
text better remembered. [11]

Secondary reports of older studies on pre-highlighted text say that helpful highlighting
improved recall and that inappropriate highlighting hurt comprehension. The summaries
found disagree with each other on details, so they are treated here as weak support. [12]

### 5. Reading rate

Brysbaert's (2019) meta-analysis puts average adult silent reading of English non-fiction
at 238 words per minute. [13]

## From findings to design

| Design decision | Why | Sources |
|---|---|---|
| Highlight the original text in place. No summary, no rewriting. | Readers need to look back and read on; replacing the text removes that. Skimming works on the full text. | [1] [3] |
| No one-word-at-a-time mode and no partial-word bolding. | Both were measured and do not help. | [1] [2] |
| Mark whole words and short phrases chosen for meaning. | The mark's value comes from *what* is marked, not from a typographic trick. | [2] [9] |
| Highlights are sparse: 20% by default, never more than 40%. | Isolation only works while marks are rare. The exact default is a product judgment; no study gives a number. | [8] [9] |
| Every paragraph of 12+ words gets at least one highlight. | Unaided skimmers drop off down the page and through each paragraph; a path across the whole text counters that. | [3] [4] [7] |
| First sentences of paragraphs get a small scoring boost. | Authors put key ideas early, and skimmers look there first. | [3] [5] |
| A repeated term is marked less with each repeat. | Repetition adds ink, not information, and erodes isolation. | [8] |
| Headings are never highlighted. | They are already signals; marking them spends the sparse budget on what is already visible. | [11] |
| Unmarked text stays fully legible. "Dim everything else" is opt-in and keeps 4.5:1 contrast. | Skimming does not support inference; readers must be able to drop into full reading at any point. | [3] [14] |
| One prominent on/off switch, with a keyboard shortcut (`H`). | Highlights pull the eye even when unwanted, so removing them must be instant. Turning off restores the page exactly. | [9] |
| An underline style in addition to marker colours. | Colour must not be the only way information is shown; pale marker colours are weak for some low-vision and colour-blind readers. | [15] |
| Reading column capped at about 68 characters, generous line height. | Long lines make it harder to find the next line. | [16] |
| The status line shows word count, full reading time and share highlighted. It does not promise a "time saved". | Full reading time is grounded in a measured rate. The speed-up from this tool has not been measured, so no number is claimed. | [13] |
| The sample text says where skimming stops. | Honest framing: this is a first pass for finding what deserves a full read. | [1] [3] |
| All analysis happens on the device. | Reading whole pages is sensitive. This also makes the later extension's permission request small. | [17] |

## Sources

Verification: **A** = publisher or author page read during this research; **B** = seen
only through abstracts or secondary summaries; **C** = cited from memory of the
well-known reference, not re-checked.

1. Rayner, K., Schotter, E. R., Masson, M. E. J., Potter, M. C., & Treiman, R. (2016). So Much to Read, So Little Time: How Do We Read, and Can Speed Reading Help? *Psychological Science in the Public Interest, 17*(1). https://www.psychologicalscience.org/publications/speed_reading.html (B)
2. Readwise (2022). Does Bionic Reading actually work? We timed over 2,000 readers. https://blog.readwise.io/bionic-reading-results/ (A; industry study, not peer-reviewed)
3. Duggan, G. B., & Payne, S. J. (2009). Text skimming: The process and effectiveness of foraging through text under time pressure. *Journal of Experimental Psychology: Applied, 15*(3), 228–242. https://researchportal.bath.ac.uk/en/publications/text-skimming-the-process-and-effectiveness-of-foraging-through-t/ (B)
4. Duggan, G. B., & Payne, S. J. (2011). Skim reading by satisficing: Evidence from eye tracking. *CHI 2011*. https://researchportal.bath.ac.uk/en/publications/skim-reading-by-satisficing-evidence-from-eye-tracking/ (B)
5. Nielsen, J. (1997). How Users Read on the Web. Nielsen Norman Group. https://www.nngroup.com/articles/how-users-read-on-the-web/ (A)
6. Morkes, J., & Nielsen, J. (1997). Concise, SCANNABLE, and Objective: How to Write for the Web. https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/ (A; one test site, small sample)
7. Nielsen Norman Group. How People Read Online: New and Old Findings. https://www.nngroup.com/articles/how-people-read-online/ and F-Pattern in Reading Digital Content. https://www.nngroup.com/videos/f-pattern-reading-digital-content/ (B)
8. Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving Students' Learning With Effective Learning Techniques. *Psychological Science in the Public Interest, 14*(1). https://doi.org/10.1177/1529100612453266 (B)
9. Chi, E. H., Gumbrecht, M., & Hong, L. (2007). Visual Foraging of Highlighted Text: An Eye-Tracking Study. *HCI International 2007*. https://dx.doi.org/10.1007/978-3-540-73110-8_64 (B; as summarised in [10])
10. Eye Tracking on Text Reading with Visual Enhancements (2024). arXiv:2404.05572. https://arxiv.org/html/2404.05572v1 (B)
11. Lorch, R. F. (1989). Text-signaling devices and their effects on reading and memory processes. *Educational Psychology Review, 1*. https://doi.org/10.1007/BF01320135; Lorch & Lorch, On-line processing of summary and importance signals in reading. https://scholars.uky.edu/en/publications/on-line-processing-of-summary-and-importance-signals-in-reading/ (B)
12. Fowler, R. L., & Barker, A. S. (1974), *Journal of Applied Psychology*; Silvers, V. L., & Kreiner, D. S. (1997), *Reading Research and Instruction*. Seen only via summaries such as https://www.psychologyinaction.org/?p=877 (B; summaries conflict)
13. Brysbaert, M. (2019). How many words do we read per minute? A review and meta-analysis of reading rate. *Journal of Memory and Language, 109*, 104047. (C)
14. W3C. WCAG 2.2, Understanding SC 1.4.3 Contrast (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html (C)
15. W3C. WCAG 2.2, Understanding SC 1.4.1 Use of Color. https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html (C)
16. W3C. WCAG 2.2, Understanding SC 1.4.8 Visual Presentation (line width of 80 characters or fewer). https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html (C)
17. Chrome for Developers. The activeTab permission. https://developer.chrome.com/docs/extensions/mv3/manifest/activeTab/ (A)

Keyword-extraction references used for the engine (see [ARCHITECTURE.md](ARCHITECTURE.md)):

18. Campos, R., et al. YAKE! Keyword extraction from single documents using multiple local features. https://github.com/LIAAD/yake (B)
19. Rose, S., Engel, D., Cramer, N., & Cowley, W. (2010). Automatic keyword extraction from individual documents (RAKE). In *Text Mining: Applications and Theory*. (C)
20. Mihalcea, R., & Tarau, P. (2004). TextRank: Bringing Order into Texts. *EMNLP 2004*. https://aclanthology.org/W04-3252/ (C)
