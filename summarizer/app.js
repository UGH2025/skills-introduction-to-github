// Utilities
const WORDS_PER_MINUTE = 200;

function splitSentences(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  // Split on punctuation + space; keep abbreviations safe-ish
  const parts = cleaned.split(/(?<=[.!?])\s+(?=[A-Z\d"'([{])/);
  return parts.filter(Boolean);
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function unique(items) { return Array.from(new Set(items)); }

// Stopwords (concise list)
const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','but','by','for','if','in','into','is','it','no','not','of','on','or','such','that','the','their','then','there','these','they','this','to','was','will','with','from','were','we','you','your','i','our','us','them','he','she','his','her','its','my','me','do','does','did','done','can','could','should','would','may','might'
]);

// Scoring helpers
function wordFrequencies(tokens) {
  const freq = new Map();
  for (const t of tokens) {
    if (STOPWORDS.has(t)) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  // Normalize
  let max = 0; for (const v of freq.values()) max = Math.max(max, v);
  const norm = new Map();
  for (const [k, v] of freq) norm.set(k, v / (max || 1));
  return norm;
}

function sentenceScoreFrequency(sentence, freq) {
  const tokens = tokenize(sentence);
  if (tokens.length === 0) return 0;
  let sum = 0;
  for (const t of tokens) sum += freq.get(t) || 0;
  return sum / tokens.length;
}

function buildSimilarity(aTokens, bTokens) {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let intersection = 0;
  for (const t of aSet) if (bSet.has(t)) intersection++;
  const denom = Math.log(aSet.size + 1) + Math.log(bSet.size + 1);
  return denom === 0 ? 0 : intersection / denom;
}

function textrank(sentences, d = 0.85, iterations = 20) {
  const tokenized = sentences.map(s => tokenize(s).filter(t => !STOPWORDS.has(t)));
  const n = sentences.length;
  if (n === 0) return [];
  const scores = new Array(n).fill(1 / n);

  // Precompute similarities
  const sim = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = buildSimilarity(tokenized[i], tokenized[j]);
      sim[i][j] = w; sim[j][i] = w;
    }
  }

  const outSum = sim.map(row => row.reduce((a, b) => a + b, 0));

  for (let it = 0; it < iterations; it++) {
    const newScores = new Array(n).fill((1 - d) / n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || sim[j][i] === 0) continue;
        newScores[i] += d * (sim[j][i] / (outSum[j] || 1)) * scores[j];
      }
    }
    // L1 norm convergence check (optional)
    let delta = 0; for (let k = 0; k < n; k++) delta += Math.abs(scores[k] - newScores[k]);
    for (let k = 0; k < n; k++) scores[k] = newScores[k];
    if (delta < 1e-5) break;
  }

  return scores.map((score, idx) => ({ idx, score }));
}

function summarize(text, ratio = 0.2, strategy = 'frequency') {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return '';
  const target = Math.max(1, Math.round(sentences.length * ratio));

  let ranked;
  if (strategy === 'textrank') {
    ranked = textrank(sentences);
  } else {
    const tokens = tokenize(text);
    const freq = wordFrequencies(tokens);
    ranked = sentences.map((s, idx) => ({ idx, score: sentenceScoreFrequency(s, freq) }));
  }

  ranked.sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, target).sort((a, b) => a.idx - b.idx);
  return top.map(r => sentences[r.idx]).join(' ');
}

// Metrics
function countWords(text) { return tokenize(text).length; }
function countChars(text) { return text.replace(/\s/g, '').length; }
function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  const matches = w.replace(/e$/,'').match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 0);
}
function fleschKincaid(text) {
  const sentences = splitSentences(text);
  const words = tokenize(text);
  if (sentences.length === 0 || words.length === 0) return NaN;
  const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
  const wps = words.length / sentences.length;
  const spw = syllables / words.length;
  return 0.39 * wps + 11.8 * spw - 15.59;
}
function readingTime(text) {
  const words = countWords(text);
  const minutes = words / WORDS_PER_MINUTE;
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  return `${Math.max(1, Math.round(minutes))}m`;
}

// UI
const inputEl = document.getElementById('inputText');
const ratioEl = document.getElementById('ratio');
const strategyEl = document.getElementById('strategy');
const btnEl = document.getElementById('summarizeBtn');
const summaryEl = document.getElementById('summary');
const copyBtn = document.getElementById('copySummary');
const dlBtn = document.getElementById('downloadSummary');
const sampleBtn = document.getElementById('loadSample');
const clearBtn = document.getElementById('clearInput');

const mSentences = document.getElementById('mSentences');
const mWords = document.getElementById('mWords');
const mChars = document.getElementById('mChars');
const mFk = document.getElementById('mFk');
const mReadTime = document.getElementById('mReadTime');

function updateMetrics(text) {
  mSentences.textContent = String(splitSentences(text).length);
  mWords.textContent = String(countWords(text));
  mChars.textContent = String(countChars(text));
  const fk = fleschKincaid(text);
  mFk.textContent = isNaN(fk) ? '-' : fk.toFixed(1);
  mReadTime.textContent = readingTime(text);
}

function doSummarize() {
  const text = inputEl.value;
  summaryEl.textContent = 'Summarizing…';
  try {
    const ratio = parseFloat(ratioEl.value);
    const strategy = strategyEl.value;
    const result = summarize(text, ratio, strategy);
    summaryEl.textContent = result || '(No summary produced)';
  } catch (e) {
    console.error(e);
    summaryEl.textContent = 'Error during summarization.';
  }
}

btnEl.addEventListener('click', doSummarize);

copyBtn.addEventListener('click', async () => {
  const text = summaryEl.textContent || '';
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
});

dlBtn.addEventListener('click', () => {
  const text = summaryEl.textContent || '';
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'summary.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

sampleBtn.addEventListener('click', () => {
  inputEl.value = `Artificial intelligence (AI) refers to the simulation of human intelligence in machines that are programmed to think like humans and mimic their actions. The term may also be applied to any machine that exhibits traits associated with a human mind such as learning and problem-solving. As the field of AI continues to progress, it encompasses a variety of subfields, including machine learning, natural language processing, computer vision, and robotics. These disciplines collectively aim to build systems capable of performing tasks that typically require human intelligence, ranging from recognizing speech and images to making decisions under uncertainty.

In recent years, deep learning has driven remarkable advancements by leveraging large datasets and powerful computational resources. Neural networks with many layers can automatically learn hierarchical representations of data, enabling breakthroughs in areas such as image recognition, machine translation, and game playing. However, these advancements also raise concerns about interpretability, bias, and ethical use. Ensuring fairness, transparency, and accountability in AI systems has become a critical area of research and policy.

Businesses and governments are increasingly adopting AI to improve efficiency, personalize services, and drive innovation. From healthcare diagnostics and autonomous vehicles to financial forecasting and smart infrastructure, AI is transforming industries. To harness its benefits while mitigating risks, stakeholders must collaborate across disciplines to develop robust standards, invest in education, and prioritize responsible deployment.`;
  updateMetrics(inputEl.value);
});

clearBtn.addEventListener('click', () => {
  inputEl.value = '';
  updateMetrics('');
  summaryEl.textContent = '';
});

inputEl.addEventListener('input', () => updateMetrics(inputEl.value));

// Initial
updateMetrics('');
