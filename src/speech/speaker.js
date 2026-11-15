// Plays a queue of chunks through the Web Speech API, one utterance per chunk.
// The synthesiser is injected so this can run against a fake in tests.

export const RATE_MIN = 0.5;
export const RATE_MAX = 3;

export function isSpeechSupported(scope = globalThis) {
  return 'speechSynthesis' in scope && typeof scope.SpeechSynthesisUtterance === 'function';
}

/**
 * Voices for a language, on-device voices first. Some browsers also offer network voices,
 * which send the text they speak to the browser vendor; those are listed last and are
 * never picked by default.
 */
export function rankVoices(voices, lang = 'en') {
  const prefix = lang.toLowerCase().split('-')[0];
  const matching = voices.filter((v) => v.lang?.toLowerCase().startsWith(prefix));
  const pool = matching.length ? matching : [...voices];
  return pool.sort((a, b) => Number(b.localService) - Number(a.localService) || Number(b.default) - Number(a.default));
}

/**
 * @param {object} options
 * @param {SpeechSynthesis} options.synth
 * @param {typeof SpeechSynthesisUtterance} options.Utterance
 * @param {(index: number, chunk: object|null) => void} [options.onChunk]  the chunk now being spoken, or -1/null
 * @param {(state: 'idle'|'playing'|'paused') => void} [options.onState]
 */
export function createSpeaker({ synth, Utterance, onChunk, onState }) {
  let queue = [];
  let index = -1;
  let state = 'idle';
  let rate = 1;
  let voice = null;
  let run = 0; // invalidates callbacks from utterances that were cancelled

  function setState(next) {
    if (state === next) return;
    state = next;
    onState?.(state);
  }

  function speakCurrent() {
    const mine = ++run;
    synth.cancel();
    const chunk = queue[index];
    if (!chunk) {
      index = -1;
      onChunk?.(-1, null);
      setState('idle');
      return;
    }
    const utterance = new Utterance(chunk.text);
    utterance.rate = rate;
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    const next = () => {
      if (mine !== run) return;
      index++;
      speakCurrent();
    };
    utterance.onend = next;
    // 'interrupted' and 'canceled' are our own cancel(); anything else skips the chunk.
    utterance.onerror = (e) => {
      if (e?.error !== 'interrupted' && e?.error !== 'canceled') next();
    };
    onChunk?.(index, chunk);
    setState('playing');
    synth.speak(utterance);
  }

  return {
    get state() {
      return state;
    },
    get index() {
      return index;
    },
    play(chunks, from = 0) {
      queue = chunks;
      index = Math.min(Math.max(from, 0), chunks.length);
      speakCurrent();
    },
    pause() {
      if (state !== 'playing') return;
      // synth.pause() is unreliable across browsers; stop and remember the chunk instead.
      run++;
      synth.cancel();
      setState('paused');
    },
    resume() {
      if (state === 'paused') speakCurrent();
    },
    stop() {
      run++;
      synth.cancel();
      index = -1;
      onChunk?.(-1, null);
      setState('idle');
    },
    /** Jump by whole chunks (sentences). */
    skip(delta) {
      if (state === 'idle') return;
      index = Math.min(Math.max(index + delta, 0), queue.length - 1);
      if (state === 'playing') speakCurrent();
      else onChunk?.(index, queue[index]);
    },
    /** Replace what is left to read (e.g. the highlights changed), staying in `fromIndex`. */
    replace(chunks, fromIndex) {
      queue = chunks;
      if (state === 'idle') return;
      index = Math.min(Math.max(fromIndex, 0), chunks.length);
      if (state === 'playing') speakCurrent();
    },
    setRate(value) {
      rate = Math.min(RATE_MAX, Math.max(RATE_MIN, Number(value) || 1));
      if (state === 'playing') speakCurrent(); // restart the sentence at the new speed
    },
    setVoice(value) {
      voice = value ?? null;
      if (state === 'playing') speakCurrent();
    },
  };
}
