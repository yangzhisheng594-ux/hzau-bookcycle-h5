// OCR 书籍识别服务（新增能力，非原小程序功能）
// 流程：图片 → Tesseract.js 浏览器端文字识别（chi_sim+eng，免服务器）
//       → 提取 ISBN → OpenLibrary 反查书名/作者/出版社（CORS 开放，免密钥）
//       → 无 ISBN 时用中文行启发式猜测书名/作者/出版社
const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';
const RECOGNIZE_TIMEOUT = 90000;

let tesseractPromise = null;
function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import(/* @vite-ignore */ TESSERACT_CDN).catch(err => {
      tesseractPromise = null;
      throw new Error('OCR 引擎加载失败，请检查网络后重试');
    });
  }
  return tesseractPromise;
}

const ISBN_RE = /(97[89][0-9]{10})/;
const CJK_RE = /[一-龥]/;

function extractIsbn(text) {
  const compact = String(text || '').replace(/[^0-9Xx]/g, '');
  const match = compact.match(ISBN_RE);
  return match ? match[1] : '';
}

function guessFromLines(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length >= 2 && CJK_RE.test(line));

  const result = { title: '', author: '', publisher: '' };

  for (const line of lines) {
    if (!result.publisher && /出版社|出版集团/.test(line)) {
      const m = line.match(/([一-龥A-Za-z（）()]{2,20}(?:出版社|出版集团))/);
      if (m) result.publisher = m[1];
    }
    if (!result.author) {
      const m = line.match(/([一-龥A-Za-z·.\s]{2,30}?)(?:\s*(?:著|主编|编著|译))$/);
      if (m && !/出版社|定价|版/.test(line)) result.author = m[1].trim();
    }
  }

  // 书名候选：去掉出版社/作者/价格/ISBN 行后，取最长的中文行
  const titleCandidates = lines.filter(line =>
    !/出版社|出版集团|定价|ISBN|isbn|著|主编|编著|第.{1,3}版|版权/.test(line)
  );
  if (titleCandidates.length) {
    result.title = titleCandidates
      .slice()
      .sort((a, b) => b.replace(/[^一-龥A-Za-z0-9]/g, '').length - a.replace(/[^一-龥A-Za-z0-9]/g, '').length)[0]
      .replace(/[《》「」『』]/g, '')
      .trim();
  }
  return result;
}

// OpenLibrary ISBN 反查（豆瓣接口有 CORS/密钥限制，这里用开放接口兜底）
async function lookupByIsbn(isbn) {
  const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('isbn not found');
  const data = await res.json();
  let author = '';
  if (Array.isArray(data.authors) && data.authors[0] && data.authors[0].key) {
    try {
      const ares = await fetch(`https://openlibrary.org${data.authors[0].key}.json`);
      if (ares.ok) author = (await ares.json()).name || '';
    } catch (e) { /* 作者查询失败不阻塞 */ }
  }
  return {
    title: data.title || '',
    author,
    publisher: Array.isArray(data.publishers) && data.publishers.length ? String(data.publishers[0]) : '',
    edition: Array.isArray(data.publish_date) ? '' : '',
    isbn: String(isbn)
  };
}

// 供扫码功能直接调用：条码/ISBN → 书籍信息（查不到抛错由调用方提示）
export async function lookupBookByIsbn(isbn) {
  const cleaned = String(isbn || '').replace(/[^0-9Xx]/g, '');
  if (!/^(97[89])?[0-9]{9}[0-9Xx]$/.test(cleaned) && cleaned.length !== 13) {
    throw new Error('条码不是有效的 ISBN，请对准书封底条码重试');
  }
  return lookupByIsbn(cleaned);
}

/**
 * 识别书籍照片，返回 { title, author, publisher, isbn }
 * 任一步骤失败都降级为启发式结果，整体失败则抛错由调用方提示。
 */
export async function recognizeBookInfo(imageDataUrl, onProgress) {
  const Tesseract = (await loadTesseract()).default;
  const recognizeTask = Tesseract.recognize(imageDataUrl, 'chi_sim+eng', {
    logger: m => {
      if (typeof onProgress === 'function' && m && m.status === 'recognizing text') {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    }
  });
  const timeoutTask = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('识别超时，请换一张更清晰的封面照')), RECOGNIZE_TIMEOUT)
  );
  const { data } = await Promise.race([recognizeTask, timeoutTask]);
  const text = (data && data.text) || '';

  const guess = guessFromLines(text);
  const isbn = extractIsbn(text);

  let online = null;
  if (isbn) {
    try { online = await lookupByIsbn(isbn); } catch (e) { online = null; }
  }

  return {
    title: (online && online.title) || guess.title || '',
    author: (online && online.author) || guess.author || '',
    publisher: (online && online.publisher) || guess.publisher || '',
    isbn
  };
}
