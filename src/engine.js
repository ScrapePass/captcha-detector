import { SIGNATURES } from './signatures.js';

export const VERSION = '1.0.0';

/** Kinds that mean "there is a captcha / human check on this page". */
const CAPTCHA_KINDS = { widget: 1, invisible: 1, image: 1, question: 1, 'challenge-page': 1 };
const TYPES = ['scripts', 'frames', 'elements', 'inline', 'globals', 'urls', 'title', 'text', 'cookies', 'headers', 'status'];
const DEFAULT_WEIGHT = { scripts: 0.9, frames: 0.95, elements: 0.85, inline: 0.8, globals: 0.85, urls: 0.8, title: 0.65, text: 0.6, cookies: 0.5, headers: 0.75, status: 0.25 };
/** A bot-check page is short: wording only counts on pages with less visible text than this. */
const SHORT_PAGE = 6000;
const MAX_TEXT = 200000;
const MAX_INLINE = 600000;

// ───────────────────────────── Signature compilation ─────────────────────────────

let compiled = null;

function compileEntry(type, e) {
  if (type === 'headers') return { p: [String(e[0]).toLowerCase(), e[1]], w: e[2] };
  if (type === 'status') return { p: e };
  if (Array.isArray(e)) return { p: e[0], w: e[1], any: e[2] === 'any' };
  if (type === 'elements' && e && typeof e === 'object' && e.sel) return { p: e, w: e.w };
  return { p: e };
}

function compile(signatures) {
  return signatures.map((sig) => {
    const c = { sig, m: {} };
    for (const type of TYPES) if (sig[type]) c.m[type] = sig[type].map((e) => compileEntry(type, e));
    return c;
  });
}

function getCompiled(signatures) {
  if (signatures && signatures !== SIGNATURES) return compile(signatures);
  return compiled || (compiled = compile(SIGNATURES));
}

// ───────────────────────────── Small helpers ─────────────────────────────

const short = (s, n = 140) => {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

function lowerHeaders(h) {
  const out = {};
  if (!h) return out;
  const add = (k, v) => {
    k = String(k).toLowerCase();
    v = Array.isArray(v) ? v.join('\n') : String(v);
    out[k] = out[k] ? out[k] + '\n' + v : v;
  };
  if (typeof h.forEach === 'function' && typeof h.get === 'function') {
    h.forEach((v, k) => add(k, v));
    if (typeof h.getSetCookie === 'function') {
      const sc = h.getSetCookie();
      if (sc && sc.length) out['set-cookie'] = sc.join('\n');
    }
  } else if (Array.isArray(h)) h.forEach(([k, v]) => add(k, v));
  else for (const k of Object.keys(h)) if (h[k] != null) add(k, h[k]);
  return out;
}

function cookieNames(input, headers) {
  const names = new Set();
  const fromPairs = (str, sep) =>
    String(str)
      .split(sep)
      .forEach((part) => {
        const name = part.split('=')[0].trim();
        if (name) names.add(name);
      });
  if (typeof input === 'string') fromPairs(input, ';');
  else if (Array.isArray(input)) input.forEach((c) => (typeof c === 'string' ? fromPairs(c, ';') : c && c.name && names.add(c.name)));
  else if (input && typeof input === 'object') Object.keys(input).forEach((k) => names.add(k));
  if (headers && headers['set-cookie']) headers['set-cookie'].split('\n').forEach((line) => fromPairs(line.split(';')[0], ';'));
  return [...names];
}

function getPath(obj, path) {
  try {
    let o = obj;
    for (const k of path.split('.')) {
      if (o == null) return undefined;
      o = o[k];
    }
    return o;
  } catch (_) {
    return undefined;
  }
}

/** A global that is really a DOM element (named access via id="…") does not count. */
function realGlobal(v) {
  return v != null && !(typeof v === 'object' && typeof v.nodeType === 'number');
}

// ───────────────────────────── Mini selector engine (HTML mode) ─────────────────────────────

const selectorCache = new Map();

function parseCompound(src) {
  const c = { tag: null, ids: [], classes: [], attrs: [], nots: [] };
  const re = /\s*(?:(\*|[a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[\s*([\w:-]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*(i)?)?\s*\]|:not\(([^)]*)\))/y;
  let pos = 0;
  src = src.trim();
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m || m.index !== pos) throw new Error('Unsupported selector: ' + src);
    if (m[1]) c.tag = m[1] === '*' ? null : m[1].toLowerCase();
    else if (m[2]) c.ids.push(m[2]);
    else if (m[3]) c.classes.push(m[3]);
    else if (m[4]) c.attrs.push({ name: m[4].toLowerCase(), op: m[5] || null, value: m[6] != null ? m[6] : m[7] != null ? m[7] : m[8], i: !!m[9] });
    else if (m[10] != null) c.nots.push(parseCompound(m[10]));
    pos = re.lastIndex;
  }
  return c;
}

function parseSelector(sel) {
  let parsed = selectorCache.get(sel);
  if (!parsed) {
    parsed = sel.split(',').map(parseCompound);
    selectorCache.set(sel, parsed);
  }
  return parsed;
}

function attrMatches(a, actual) {
  if (actual == null) return false;
  if (!a.op) return true;
  let v = a.value;
  let s = actual;
  if (a.i) {
    v = v.toLowerCase();
    s = s.toLowerCase();
  }
  switch (a.op) {
    case '=':
      return s === v;
    case '*=':
      return v !== '' && s.includes(v);
    case '^=':
      return v !== '' && s.startsWith(v);
    case '$=':
      return v !== '' && s.endsWith(v);
    case '~=':
      return s.split(/\s+/).includes(v);
    case '|=':
      return s === v || s.startsWith(v + '-');
    default:
      return false;
  }
}

function compoundMatches(c, tag) {
  if (c.tag && c.tag !== tag.tag) return false;
  for (const id of c.ids) if (tag.attrs.id !== id) return false;
  if (c.classes.length) {
    const list = (tag.attrs.class || '').split(/\s+/);
    for (const cl of c.classes) if (!list.includes(cl)) return false;
  }
  for (const a of c.attrs) if (!attrMatches(a, tag.attrs[a.name])) return false;
  for (const n of c.nots) if (compoundMatches(n, tag)) return false;
  return true;
}

// ───────────────────────────── HTML collector ─────────────────────────────

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch (_) {
        return m;
      }
    }
    const v = ENTITIES[e.toLowerCase()];
    return v != null ? v : m;
  });
}

function resolveUrl(u, base) {
  if (!u) return '';
  u = u.trim();
  if (!base) return u;
  try {
    return new URL(u, base).href;
  } catch (_) {
    return u;
  }
}

/** Build a page snapshot from an HTML string (no DOM needed: works in Node, workers, anywhere). */
export function snapshotFromHtml(html, opts = {}) {
  html = String(html == null ? '' : html);
  const headers = lowerHeaders(opts.headers);
  const noComments = html.replace(/<!--[\s\S]*?-->/g, '');
  let base = opts.url || '';
  const baseTag = /<base\b[^>]*\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(noComments);
  if (baseTag) base = resolveUrl(decode(baseTag[1]), base);

  const inlineParts = [];
  let inlineLen = 0;
  // Pull scripts, styles and other raw-text elements out, so tag parsing does not see markup inside JS strings.
  const stripped = noComments.replace(/<(script|style|template|textarea|noscript|xmp)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi, (m, tag, attrs, body) => {
    const t = tag.toLowerCase();
    if (t === 'script' && !/\bsrc\s*=/i.test(attrs) && inlineLen < MAX_INLINE) {
      inlineParts.push(body);
      inlineLen += body.length;
    }
    // Keep the opening tag (attributes matter: script src, textarea name), drop the body.
    return `<${tag}${attrs}></${tag}>`;
  });

  const tags = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
  const attrRe = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = tagRe.exec(stripped))) {
    const attrs = {};
    if (m[2]) {
      let a;
      attrRe.lastIndex = 0;
      while ((a = attrRe.exec(m[2]))) {
        const name = a[1].toLowerCase();
        if (!(name in attrs)) attrs[name] = decode(a[2] != null ? a[2] : a[3] != null ? a[3] : a[4] != null ? a[4] : '');
      }
    }
    tags.push({ tag: m[1].toLowerCase(), attrs });
  }

  const scripts = [];
  const frames = [];
  for (const t of tags) {
    if (t.tag === 'script' && t.attrs.src) scripts.push(resolveUrl(t.attrs.src, base));
    else if (t.tag === 'link' && t.attrs.href && /\b(?:preload|modulepreload|prefetch)\b/i.test(t.attrs.rel || '') && /^(?:script|)$/i.test(t.attrs.as || 'script'))
      scripts.push(resolveUrl(t.attrs.href, base));
    else if ((t.tag === 'iframe' || t.tag === 'frame') && (t.attrs.src || t.attrs['data-src']))
      frames.push({ src: resolveUrl(t.attrs.src || t.attrs['data-src'], base), title: t.attrs.title || '', name: t.attrs.name || '', node: makeHtmlNode(t) });
  }

  const titleM = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(noComments);
  const title = titleM ? decode(titleM[1]).replace(/\s+/g, ' ').trim() : '';
  let bodyHtml = stripped.replace(/<head\b[\s\S]*?<\/head\s*>/i, ' ').replace(/<title\b[\s\S]*?<\/title\s*>/gi, ' ');
  const text = decode(bodyHtml.replace(/<(?:br|p|div|li|tr|h[1-6]|section|article|header|footer)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v\r ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, MAX_TEXT);

  const nodeCache = new Map();
  return {
    mode: 'html',
    url: opts.url || '',
    title,
    text,
    textLength: text.replace(/\s+/g, ' ').length,
    scripts,
    resources: [],
    frames,
    inline: inlineParts.join('\n;\n'),
    cookies: cookieNames(opts.cookies, headers),
    headers,
    status: opts.status != null ? Number(opts.status) : null,
    win: null,
    query(sel) {
      let r = nodeCache.get(sel);
      if (!r) {
        const parsed = parseSelector(sel);
        r = tags.filter((t) => parsed.some((c) => compoundMatches(c, t))).map(makeHtmlNode);
        nodeCache.set(sel, r);
      }
      return r;
    },
    isVisible: () => null,
  };
}

function makeHtmlNode(t) {
  return t.node || (t.node = { tag: t.tag, el: null, attr: (n) => (t.attrs[n.toLowerCase()] != null ? t.attrs[n.toLowerCase()] : null) });
}

// ───────────────────────────── DOM collector ─────────────────────────────

/** Is this element shown to the user at a usable size? */
function elementVisible(el) {
  try {
    if (!el || !el.isConnected) return false;
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    if (!win) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true })) return false;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || parseFloat(cs.opacity) < 0.05) return false;
    let r = el.getBoundingClientRect();
    let w = r.width;
    let h = r.height;
    let left = r.left;
    let top = r.top;
    if ((w < 10 || h < 10) && el.children && el.children.length) {
      // A container can be 0×0 while its (positioned) widget is shown: use the children's box.
      let l = Infinity, t = Infinity, rr = -Infinity, b = -Infinity;
      for (const c of el.children) {
        const cr = c.getBoundingClientRect();
        if (cr.width < 1 || cr.height < 1) continue;
        l = Math.min(l, cr.left);
        t = Math.min(t, cr.top);
        rr = Math.max(rr, cr.right);
        b = Math.max(b, cr.bottom);
      }
      if (rr > l && b > t) {
        w = rr - l;
        h = b - t;
        left = l;
        top = t;
      }
    }
    if (w < 10 || h < 10) return false;
    // Pushed off the page (the usual way to hide a challenge until it is needed).
    if (left + w + win.scrollX <= 0 || top + h + win.scrollY <= 0) return false;
    const vw = Math.max(doc.documentElement.scrollWidth, win.innerWidth);
    if (left + win.scrollX >= vw + 50) return false;
    // Inside a same-origin frame: the frame itself must be shown too.
    if (win.frameElement && win.parent !== win) return elementVisible(win.frameElement);
    return true;
  } catch (_) {
    return null;
  }
}

function makeDomNode(el) {
  let tag = '';
  try {
    tag = String(el.localName || el.tagName || el.nodeName || '').toLowerCase();
  } catch (_) {
    /* pages can tamper with DOM prototypes */
  }
  return {
    tag,
    el,
    attr: (n) => {
      try {
        return el.getAttribute(n);
      } catch (_) {
        return null;
      }
    },
  };
}

/** Documents and open shadow roots to search: the page, same-origin frames and open shadow DOM. */
function gatherRoots(doc, deep) {
  const roots = [doc];
  if (!deep) return roots;
  const seen = new Set([doc]);
  for (let i = 0; i < roots.length && roots.length < 200; i++) {
    const root = roots[i];
    let walker;
    try {
      walker = (root.ownerDocument || root).createTreeWalker(root, 1 /* SHOW_ELEMENT */);
    } catch (_) {
      continue;
    }
    let n = 0;
    for (let el = walker.nextNode(); el && n < 60000; el = walker.nextNode(), n++) {
      if (el.shadowRoot && !seen.has(el.shadowRoot)) {
        seen.add(el.shadowRoot);
        roots.push(el.shadowRoot);
      }
      const tag = el.localName;
      if (tag === 'iframe' || tag === 'frame') {
        try {
          const d = el.contentDocument;
          if (d && !seen.has(d) && d.documentElement) {
            seen.add(d);
            roots.push(d);
          }
        } catch (_) {
          /* cross-origin */
        }
      }
    }
  }
  return roots;
}

/** Build a page snapshot from a live window (browser, extension content script, Playwright/Puppeteer evaluate). */
export function snapshotFromDom(win, opts = {}) {
  win = win || (typeof window !== 'undefined' ? window : null);
  if (!win || !win.document) throw new Error('captcha-detector: no window/document; use detectHtml() outside a browser');
  const doc = win.document;
  const roots = gatherRoots(doc, opts.deep !== false);
  const all = (sel) => {
    const out = [];
    for (const r of roots) {
      try {
        r.querySelectorAll(sel).forEach((el) => out.push(el));
      } catch (_) {
        /* selector unsupported in this browser */
      }
    }
    return out;
  };

  const scripts = [];
  for (const s of all('script[src]')) {
    try {
      scripts.push(String(s.src || s.getAttribute('src') || ''));
    } catch (_) {
      /* ignore */
    }
  }
  for (const l of all('link[rel~="preload"][href], link[rel~="modulepreload"][href]')) {
    try {
      if (!l.as || l.as === 'script') scripts.push(String(l.href));
    } catch (_) {
      /* ignore */
    }
  }

  const resources = [];
  const addResources = (w) => {
    try {
      const entries = w.performance && w.performance.getEntriesByType ? w.performance.getEntriesByType('resource') : [];
      for (let i = 0; i < entries.length && resources.length < 3000; i++) resources.push({ url: entries[i].name, type: entries[i].initiatorType || '' });
    } catch (_) {
      /* ignore */
    }
  };
  addResources(win);
  for (const r of roots) if (r !== doc && r.nodeType === 9 && r.defaultView) addResources(r.defaultView);

  const frames = all('iframe, frame').map((el) => {
    const node = makeDomNode(el);
    let src = '';
    try {
      src = el.src || '';
    } catch (_) {
      /* ignore */
    }
    return { src: src || node.attr('src') || node.attr('data-src') || '', title: node.attr('title') || '', name: node.attr('name') || '', node, el };
  });

  let inline = '';
  for (const s of all('script:not([src])')) {
    if (inline.length > MAX_INLINE) break;
    inline += (s.textContent || '') + '\n;\n';
  }

  let text = '';
  try {
    text = (doc.body ? doc.body.innerText || doc.body.textContent || '' : '').slice(0, MAX_TEXT);
  } catch (_) {
    /* ignore */
  }
  text = text.replace(/[ \t\f\v\r ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

  let cookieStr = '';
  try {
    cookieStr = doc.cookie || '';
  } catch (_) {
    /* sandboxed */
  }
  const headers = lowerHeaders(opts.headers);

  const nodeCache = new Map();
  const visCache = new Map();
  return {
    mode: 'dom',
    url: (() => {
      try {
        return win.location.href;
      } catch (_) {
        return '';
      }
    })(),
    title: doc.title || '',
    text,
    textLength: text.replace(/\s+/g, ' ').length,
    scripts,
    resources,
    frames,
    inline,
    cookies: cookieNames(cookieStr + (opts.cookies ? ';' + (typeof opts.cookies === 'string' ? opts.cookies : '') : ''), headers),
    headers,
    status: opts.status != null ? Number(opts.status) : null,
    win,
    query(sel) {
      let r = nodeCache.get(sel);
      if (!r) {
        r = all(sel).map(makeDomNode);
        nodeCache.set(sel, r);
      }
      return r;
    },
    isVisible(node) {
      const el = node && node.el;
      if (!el) return null;
      if (!visCache.has(el)) visCache.set(el, elementVisible(el));
      return visCache.get(el);
    },
  };
}

// ───────────────────────────── Matching ─────────────────────────────

/** Resource Timing types that are code or API calls (not images, media or documents). */
const SCRIPT_LIKE = { script: 1, link: 1, xmlhttprequest: 1, fetch: 1, beacon: 1, other: 1, css: 1, '': 1 };

const MATCH = {
  scripts(re, s) {
    for (const u of s.scripts) if (re.test(u)) return { value: u };
    for (const r of s.resources) if (SCRIPT_LIKE[r.type] && re.test(r.url)) return { value: r.url, loaded: true };
    return null;
  },
  frames(re, s) {
    const hit = s.frames.filter((f) => f.src && re.test(f.src));
    if (hit.length) return { value: hit[0].src, nodes: hit.map((f) => f.node) };
    for (const r of s.resources) if ((r.type === 'iframe' || r.type === 'frame') && re.test(r.url)) return { value: r.url, loaded: true };
    return null;
  },
  elements(p, s) {
    if (typeof p === 'string') {
      const nodes = s.query(p);
      return nodes.length ? { value: p, nodes } : null;
    }
    const nodes = s.query(p.sel).filter((n) => p.attr.some((a) => {
      const v = n.attr(a);
      return v != null && p.re.test(v);
    }));
    if (!nodes.length) return null;
    const n = nodes[0];
    const a = p.attr.find((x) => n.attr(x) != null && p.re.test(n.attr(x)));
    return { value: `${p.sel}[${a}="${short(n.attr(a), 80)}"]`, nodes };
  },
  inline(re, s) {
    const m = re.exec(s.inline);
    return m ? { value: m[0] } : null;
  },
  globals(p, s) {
    if (!s.win) return null;
    try {
      if (typeof p === 'function') return p(s.win) ? { value: 'window check' } : null;
      return realGlobal(getPath(s.win, p)) ? { value: 'window.' + p } : null;
    } catch (_) {
      return null;
    }
  },
  urls(re, s) {
    return s.url && re.test(s.url) ? { value: s.url } : null;
  },
  title(re, s) {
    return s.title && re.test(s.title) ? { value: s.title } : null;
  },
  text(re, s, entry) {
    if (!entry.any && s.textLength > SHORT_PAGE) return null;
    const m = re.exec(s.text);
    return m ? { value: m[0] } : null;
  },
  cookies(p, s) {
    const name = s.cookies.find((c) => (typeof p === 'string' ? (/[_-]$/.test(p) ? c.startsWith(p) : c === p) : p.test(c)));
    return name ? { value: name } : null;
  },
  headers(p, s) {
    const v = s.headers[p[0]];
    return v != null && p[1].test(v) ? { value: `${p[0]}: ${short(v, 60)}` } : null;
  },
  status(p, s) {
    return s.status === p ? { value: String(p) } : null;
  },
};

function scoreSignature(c, s) {
  const evidence = [];
  const nodes = [];
  for (const type of TYPES) {
    const list = c.m[type];
    if (!list) continue;
    for (const entry of list) {
      let r = null;
      try {
        r = MATCH[type](entry.p, s, entry);
      } catch (_) {
        r = null;
      }
      if (!r) continue;
      const w = entry.w != null ? entry.w : DEFAULT_WEIGHT[type];
      const value = short(r.value);
      const same = evidence.find((e) => e.type === type && e.value === value);
      // Two patterns that hit the same thing are one piece of evidence.
      if (same) same.weight = Math.max(same.weight, w);
      else evidence.push({ type, value, weight: w });
      if (r.nodes) nodes.push(...r.nodes);
    }
  }
  if (!evidence.length) return null;
  // Status codes and headers like "server: cloudflare" only support other evidence.
  if (evidence.every((e) => e.type === 'status')) return null;
  let miss = 1;
  for (const e of evidence) miss *= 1 - e.weight;
  return { evidence, nodes, confidence: 1 - miss };
}

function makeContext(s, raw) {
  const dom = s.mode === 'dom';
  const anyVisible = (nodes, filter) => {
    if (!dom) return null;
    let list = (nodes || []).map((n) => (n && n.node ? n.node : n)).filter(Boolean);
    if (filter) list = list.filter(filter);
    return list.some((n) => s.isVisible(n) === true);
  };
  return {
    dom,
    url: s.url,
    title: s.title,
    text: s.text,
    textLength: s.textLength,
    short: s.textLength <= SHORT_PAGE,
    inline: s.inline,
    status: s.status,
    has: (id) => raw.has(id),
    header: (name) => s.headers[name.toLowerCase()] || '',
    query: (sel) => s.query(sel),
    frames: (re) => {
      const out = s.frames.filter((f) => f.src && re.test(f.src)).map((f) => ({ src: f.src, node: f.node, el: f.el }));
      for (const r of s.resources) if ((r.type === 'iframe' || r.type === 'frame') && re.test(r.url) && !out.some((f) => f.src === r.url)) out.push({ src: r.url, node: null, el: null });
      return out;
    },
    script: (re) => s.scripts.some((u) => re.test(u)) || s.resources.some((r) => SCRIPT_LIKE[r.type] && re.test(r.url)),
    global: (path) => {
      if (!s.win) return false;
      const v = getPath(s.win, path);
      return realGlobal(v) ? v : false;
    },
    anyVisible,
    visibleEl: (el) => (dom && el ? elementVisible(el) === true : null),
  };
}

function buildDetection(id, sig, r, s, ctx, opts) {
  let d = {
    id,
    name: sig.name,
    vendor: sig.vendor || null,
    kind: sig.kind,
    subtype: sig.subtype || null,
    confidence: r.confidence,
    visible: null,
    evidence: r.evidence.slice(),
    site: sig.site || null,
  };
  if (d.kind === 'challenge-page') d.visible = true;
  else if (d.kind === 'protection' || d.kind === 'block-page') d.visible = null;
  else if (s.mode === 'dom') d.visible = r.nodes.some((n) => s.isVisible(n) === true);
  if (sig.refine) {
    try {
      d = sig.refine(d, ctx);
    } catch (_) {
      /* a refine bug must not break detection */
    }
    if (!d) return null;
  }
  if (d.kind === 'protection' || d.kind === 'block-page') d.visible = null;
  d.confidence = Math.round(Math.min(d.confidence, 0.99) * 100) / 100;
  d.evidence = d.evidence.slice(0, 12).map((e) => ({ type: e.type, value: e.value }));
  if (opts.elements && s.mode === 'dom') Object.defineProperty(d, 'elements', { value: r.nodes.map((n) => n.el).filter(Boolean), enumerable: false });
  return d;
}

function finalize(detections, meta) {
  // Catch-all rules give way to a named product.
  const named = detections.some((d) => !d.id.startsWith('generic-') && d.kind !== 'protection');
  let list = named ? detections.filter((d) => !d.id.startsWith('generic-')) : detections;
  const rank = { 'challenge-page': 0, widget: 1, image: 1, question: 1, invisible: 2, 'block-page': 3, protection: 4 };
  list = list.sort((a, b) => (rank[a.kind] - rank[b.kind]) || b.confidence - a.confidence);
  const captchas = list.filter((d) => CAPTCHA_KINDS[d.kind]);
  const visibleKnown = captchas.some((d) => d.visible !== null);
  const result = {
    captcha: captchas.length > 0,
    visible: captchas.some((d) => d.visible === true) ? true : visibleKnown || meta.mode === 'dom' ? false : null,
    challengePage: list.some((d) => d.kind === 'challenge-page'),
    blocked: list.some((d) => d.kind === 'block-page'),
    detections: list,
    summary: '',
    url: meta.url || '',
    mode: meta.mode,
    version: VERSION,
  };
  result.summary = summarize(result);
  return result;
}

function summarize(r) {
  if (!r.detections.length) return 'No captcha found';
  const parts = r.detections.map((d) => {
    let s = d.name + (d.subtype ? ` (${d.subtype})` : '');
    if (d.kind === 'protection') s += ' [bot protection, no captcha shown]';
    else if (d.kind === 'block-page') s += ' [blocked]';
    else if (d.visible === true) s += ' [visible]';
    else if (d.visible === false) s += d.kind === 'invisible' ? ' [invisible]' : ' [not shown]';
    return s;
  });
  return (r.captcha ? 'Captcha found: ' : r.blocked ? 'Blocked: ' : 'No captcha: ') + parts.join(', ');
}

/** Run every signature on a snapshot (from snapshotFromDom or snapshotFromHtml). */
export function analyze(s, opts = {}) {
  const min = opts.minConfidence != null ? opts.minConfidence : 0.5;
  const list = getCompiled(opts.signatures);
  const raw = new Map();
  for (const c of list) {
    const r = scoreSignature(c, s);
    if (r && r.confidence >= min) raw.set(c.sig.id, { c, r });
  }
  // Refine twice: the first pass decides which matches survive, the second lets refine() see those survivors
  // (so a weak match that refine() drops does not hide another product).
  let alive = new Set(raw.keys());
  let out = [];
  for (let pass = 0; pass < 2; pass++) {
    const ctx = makeContext(s, alive);
    out = [];
    for (const [id, { c, r }] of raw) {
      const d = buildDetection(id, c.sig, r, s, ctx, opts);
      if (d) out.push(d);
    }
    alive = new Set(out.map((d) => d.id));
  }
  return finalize(out, { url: s.url, mode: s.mode });
}

// ───────────────────────────── Public API ─────────────────────────────

/**
 * Check the current page (browser). Options:
 *   window         the window to check (default: the global window)
 *   deep           search same-origin frames and open shadow roots (default true)
 *   headers/status the response headers and status, if you have them
 *   minConfidence  0..1, default 0.5
 *   elements       true to attach the matched DOM elements (non-enumerable `elements` on each detection)
 */
export function detect(opts = {}) {
  return analyze(snapshotFromDom(opts.window, opts), opts);
}

/**
 * Check an HTML string (Node, workers, anywhere). Options: url, headers, status, cookies, minConfidence.
 * Static HTML cannot show widgets that scripts add later, and visibility is unknown (visible: null).
 */
export function detectHtml(html, opts = {}) {
  return analyze(snapshotFromHtml(html, opts), opts);
}

// ---------- Responses from HTTP clients and scraper APIs ----------

const LOOKS_HTML = /<(?:!doctype|html|head|body|script|iframe|form|div|title|meta|noscript)\b/i;
const STATUS_KEY = /^(?:status|status_?code|http_?status(?:_?code)?|original_?status|target_?status)$/i;

// A scraper API often wraps the page in JSON ({ "html": "<html>…" }, { "body": … }, { "result": { "content": … } }).
// Find the longest string that looks like HTML, and the status/headers/url next to it.
function unwrapJson(v) {
  let best = null;
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 5) return;
    for (const k of Object.keys(o)) {
      const x = o[k];
      if (typeof x === 'string') {
        if (x.length > 20 && LOOKS_HTML.test(x) && (!best || x.length > best.html.length)) best = { html: x, parent: o };
      } else if (x && typeof x === 'object') walk(x, depth + 1);
    }
  };
  walk(v, 0);
  if (!best) return null;
  const out = { html: best.html };
  for (const k of Object.keys(best.parent)) {
    const x = best.parent[k];
    if (STATUS_KEY.test(k) && Number(x) >= 100 && Number(x) <= 599) out.status = Number(x);
    else if (/^headers$/i.test(k) && x && typeof x === 'object') out.headers = x;
    else if (/^(?:url|final_?url|resolved_?url)$/i.test(k) && typeof x === 'string' && /^https?:/i.test(x)) out.url = x;
  }
  return out;
}

function fromBody(body) {
  let html = body;
  let extra = {};
  if (body && typeof body === 'object' && !(typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer)) {
    extra = unwrapJson(body) || {};
    html = extra.html != null ? extra.html : JSON.stringify(body);
  } else if (typeof body === 'string' && /^\s*[[{]/.test(body)) {
    try {
      const found = unwrapJson(JSON.parse(body));
      if (found) {
        extra = found;
        html = found.html;
      }
    } catch (_) {
      /* not JSON */
    }
  } else if (body != null && typeof body !== 'string') {
    html = typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(body) : String(body);
  }
  return { html: html == null ? '' : String(html), status: extra.status, headers: extra.headers, url: extra.url };
}

/**
 * Check what an HTTP client or a scraper API returned. Accepts a fetch Response, an axios/got-style response
 * ({ data | body, status, headers }), an HTML string, or the parsed JSON a scraper API sent. Always returns a Promise.
 *
 * HTML wrapped in JSON is found on its own, with the status/headers/url next to it. Pass `url` = the page you asked
 * the API to scrape. Options `status` and `headers` override what the response says (most scraper APIs answer 200
 * whatever the site did; that is fine, the page itself is what counts).
 */
export async function detectResponse(input, opts = {}) {
  let body = input;
  let status;
  let headers;
  let url;
  if (input && typeof input === 'object' && typeof input.text === 'function' && 'status' in input) {
    // fetch / undici Response (read a clone, so the caller can still read the body)
    const r = typeof input.clone === 'function' && !input.bodyUsed ? input.clone() : input;
    body = await r.text();
    status = input.status;
    headers = input.headers;
    url = input.url;
  } else if (input && typeof input === 'object' && (('data' in input && 'status' in input) || ('body' in input && ('status' in input || 'statusCode' in input)))) {
    // axios ({ data, status, headers }), got / needle / superagent ({ body, statusCode, headers })
    body = 'data' in input ? input.data : input.body;
    status = input.status != null ? input.status : input.statusCode;
    headers = input.headers;
    url = (input.request && (input.request.res && input.request.res.responseUrl)) || input.url;
  }
  const b = fromBody(body);
  // Status and headers found next to the HTML inside the JSON belong to the target site: they win over the API's.
  return detectHtml(b.html, {
    ...opts,
    url: opts.url || b.url || url || '',
    status: opts.status != null ? opts.status : b.status != null ? b.status : status,
    headers: opts.headers || b.headers || headers,
  });
}

/**
 * Combine the result for a page with results from inside its frames (e.g. from Playwright's page.frames()).
 * frames: [{ url, visible, result }] — visible: whether the frame element is shown in the page.
 */
export function mergeResults(main, frames = [], opts = {}) {
  const map = new Map();
  for (const d of main.detections) map.set(d.id, { ...d, evidence: d.evidence.slice() });
  const list = getCompiled(opts.signatures);
  for (const f of frames) {
    if (!f || !f.result) continue;
    // A frame that is a known widget's own iframe (e.g. Turnstile's challenges.cloudflare.com frame) belongs to that
    // widget: what runs inside it is the vendor's own code, not another captcha.
    const owner = f.url
      ? list.find((c) => map.has(c.sig.id) && c.m.frames && c.m.frames.some((e) => e.p.test(f.url)))
      : null;
    for (const d0 of f.result.detections) {
      if (d0.kind === 'block-page') continue; // an error page inside a frame is not the page
      if (owner && d0.id !== owner.sig.id) continue;
      if (d0.id === 'generic-challenge' || d0.id === 'generic-block') continue; // wording inside a frame is too weak
      const d = { ...d0, evidence: d0.evidence.map((e) => ({ ...e, frame: f.url || '' })) };
      // A whole-document check inside a frame is a widget on the page.
      if (d.kind === 'challenge-page') {
        d.kind = 'widget';
        d.visible = f.visible != null ? f.visible : true;
      } else if (d.kind !== 'protection' && d.kind !== 'invisible') {
        if (f.visible === false) d.visible = false;
        else if (f.visible === true && d.visible !== true) d.visible = d.visible === false && d.evidence.some((e) => e.type === 'elements' || e.type === 'frames') ? false : true;
      }
      const cur = map.get(d.id);
      if (!cur) {
        d.frame = f.url || '';
        map.set(d.id, d);
        continue;
      }
      cur.confidence = Math.max(cur.confidence, d.confidence);
      if (d.visible === true && cur.kind !== 'invisible') cur.visible = true;
      if (!cur.subtype && d.subtype) cur.subtype = d.subtype;
      if (d.details) cur.details = { ...cur.details, ...d.details };
      for (const e of d.evidence) if (cur.evidence.length < 16 && !cur.evidence.some((x) => x.value === e.value)) cur.evidence.push(e);
    }
  }
  return finalize([...map.values()], { url: main.url, mode: main.mode });
}

export { SIGNATURES as signatures };
