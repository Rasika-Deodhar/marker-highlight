// Read aloud: the Listen menu. Speaks the reader's text with the browser's own speech
// synthesis and marks the sentence being spoken so the eye can follow the voice.

import { buildQueue } from '../src/speech/queue.js';
import { createSpeaker, isSpeechSupported, rankVoices, RATE_MAX, RATE_MIN } from '../src/speech/speaker.js';

const $ = (id) => document.getElementById(id);

/**
 * @param {object} options
 * @param {ReturnType<import('../src/dom/highlighter.js').createHighlighter>} options.highlighter
 * @param {object} options.prefs  shared preferences: speechMode, rate, voice, on
 * @param {(patch: object) => void} options.set  update preferences
 * @returns {{refresh(): void, stop(): void}}
 */
export function setupListen({ highlighter, prefs, set }) {
  const menu = $('listen-menu');
  if (!isSpeechSupported(window)) {
    menu.hidden = true;
    return { refresh() {}, stop() {} };
  }
  const synth = window.speechSynthesis;
  const toggle = $('speak-toggle');
  const stopButton = $('speak-stop');
  const rate = $('rate');
  const rateOut = $('rate-out');
  const voiceSelect = $('voice');
  const voiceNote = $('voice-note');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let voices = [];
  let queue = [];
  let appliedRate = null;

  rate.min = RATE_MIN;
  rate.max = RATE_MAX;

  const speaker = createSpeaker({
    synth,
    Utterance: window.SpeechSynthesisUtterance,
    onChunk(index, chunk) {
      if (!chunk) {
        highlighter.clearSpeaking();
        return;
      }
      const range = highlighter.markSpeaking(chunk.block, chunk.ranges);
      if (range) keepInView(range);
    },
    onState: renderState,
  });

  function keepInView(range) {
    const rect = range.getBoundingClientRect();
    const top = document.querySelector('.bar').getBoundingClientRect().bottom + 16;
    if (rect.top >= top && rect.bottom <= window.innerHeight - 80) return;
    window.scrollTo({ top: window.scrollY + rect.top - window.innerHeight * 0.3, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }

  function renderState() {
    const state = speaker.state;
    toggle.textContent = state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : 'Play';
    toggle.disabled = !queue.length;
    stopButton.disabled = state === 'idle';
    $('speak-prev').disabled = $('speak-next').disabled = state === 'idle';
    menu.dataset.state = state;
  }

  /** Quick read needs highlights to follow; with them switched off, read everything. */
  const mode = () => (prefs.speechMode === 'quick' && prefs.on ? 'quick' : 'all');

  /** Start from what is on screen, not from the top of a long document. */
  function firstVisibleChunk() {
    const top = document.querySelector('.bar').getBoundingClientRect().bottom;
    const segments = highlighter.segments();
    const index = queue.findIndex((chunk) => segments[chunk.block].el.getBoundingClientRect().bottom > top + 4);
    return Math.max(index, 0);
  }

  function currentVoice() {
    return voices.find((v) => v.voiceURI === prefs.voice) ?? voices[0] ?? null;
  }

  function loadVoices() {
    voices = rankVoices(synth.getVoices(), document.documentElement.lang || 'en');
    voiceSelect.replaceChildren(
      ...(voices.length ? voices : [null]).map((v) => {
        const option = document.createElement('option');
        option.value = v?.voiceURI ?? '';
        option.textContent = v ? `${v.name} (${v.lang})${v.localService ? '' : ' · online'}` : 'Default voice';
        return option;
      }),
    );
    voiceSelect.disabled = voices.length < 2;
    renderVoice();
  }

  function renderVoice() {
    const voice = currentVoice();
    voiceSelect.value = voice?.voiceURI ?? '';
    voiceNote.hidden = !voice || voice.localService;
    speaker.setVoice(voice);
  }

  toggle.addEventListener('click', () => {
    if (speaker.state === 'playing') speaker.pause();
    else if (speaker.state === 'paused') speaker.resume();
    else speaker.play(queue, firstVisibleChunk());
  });
  stopButton.addEventListener('click', () => speaker.stop());
  $('speak-prev').addEventListener('click', () => speaker.skip(-1));
  $('speak-next').addEventListener('click', () => speaker.skip(1));
  rate.addEventListener('input', () => set({ rate: Number(rate.value) }));
  voiceSelect.addEventListener('change', () => {
    set({ voice: voiceSelect.value });
    renderVoice();
  });
  for (const input of document.querySelectorAll('input[name="speechMode"]')) {
    input.addEventListener('change', () => set({ speechMode: input.value }));
  }
  synth.addEventListener?.('voiceschanged', loadVoices);
  // Speech belongs to the browser, not the page: without this it carries on after a reload.
  synth.cancel();
  window.addEventListener('pagehide', () => synth.cancel());
  loadVoices();

  return {
    /** Called after every re-analysis: reflect preferences and keep the voice on the current text. */
    refresh() {
      rate.value = prefs.rate;
      rateOut.textContent = `${Number(prefs.rate).toFixed(1).replace(/\.0$/, '')}×`;
      if (prefs.rate !== appliedRate) {
        appliedRate = prefs.rate;
        speaker.setRate(prefs.rate); // restarts the current sentence at the new speed
      }
      const input = document.querySelector(`input[name="speechMode"][value="${prefs.speechMode}"]`);
      if (input) input.checked = true;
      $('quick-note').hidden = !(prefs.speechMode === 'quick' && !prefs.on);

      const next = buildQueue(highlighter.segments(), mode());
      const changed = next.length !== queue.length || next.some((chunk, i) => chunk.text !== queue[i].text);
      if (changed) {
        const block = queue[speaker.index]?.block ?? 0;
        queue = next;
        // The highlights changed under the voice: carry on from the same paragraph.
        speaker.replace(queue, Math.max(queue.findIndex((chunk) => chunk.block >= block), 0));
      }
      renderState();
    },
    stop() {
      speaker.stop();
    },
  };
}
