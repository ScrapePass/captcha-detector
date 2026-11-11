export type Kind =
  /** A captcha widget on the page: checkbox, puzzle, slider, image grid… */
  | 'widget'
  /** Runs in the background and only shows a challenge when it is suspicious (reCAPTCHA v3, invisible v2…). */
  | 'invisible'
  /** A classic image of distorted characters to type. */
  | 'image'
  /** A text or math question to answer. */
  | 'question'
  /** The whole page is a bot check standing in front of the content. */
  | 'challenge-page'
  /** Access denied: nothing to solve. */
  | 'block-page'
  /** A bot-protection service is loaded; it can raise a captcha later. Not a captcha. */
  | 'protection';

export interface Evidence {
  type: 'scripts' | 'frames' | 'elements' | 'inline' | 'globals' | 'urls' | 'title' | 'text' | 'cookies' | 'headers' | 'status';
  value: string;
  /** Set when the evidence was found inside a frame (detectInPage / mergeResults). */
  frame?: string;
}

export interface Detection {
  /** Stable id, e.g. 'recaptcha', 'hcaptcha', 'turnstile', 'cloudflare-challenge', 'generic-image-captcha'. */
  id: string;
  name: string;
  vendor: string | null;
  kind: Kind;
  /** Variant, e.g. 'v2-checkbox', 'v2-invisible', 'v3', 'slider', 'press-and-hold', 'proof-of-work'. */
  subtype: string | null;
  /** 0..1 */
  confidence: number;
  /** Shown to the user right now. null when unknown (static HTML, bot protection, block pages). */
  visible: boolean | null;
  evidence: Evidence[];
  /** Product homepage. */
  site: string | null;
  /** Extra facts, e.g. { challengeOpen: true } when the image challenge popup is open. */
  details?: Record<string, unknown>;
  /** URL of the frame it was found in (detectInPage). */
  frame?: string;
  /** The matched DOM elements, when detect({ elements: true }) was used. Not enumerable. */
  readonly elements?: Element[];
}

export interface Result {
  /** A captcha or bot check is on the page (shown, invisible or not yet rendered). */
  captcha: boolean;
  /** A captcha is shown to the user right now. null when unknown (static HTML). */
  visible: boolean | null;
  /** The whole page is a bot-check page instead of the content. */
  challengePage: boolean;
  /** The page is an access-denied page. */
  blocked: boolean;
  /** Everything found, the most blocking first. Includes bot-protection services (kind 'protection'). */
  detections: Detection[];
  /** One line for humans. */
  summary: string;
  url: string;
  mode: 'dom' | 'html';
  version: string;
}

export interface CommonOptions {
  /** Response headers (plain object, array of pairs, or a fetch Headers). */
  headers?: Record<string, string | string[]> | [string, string][] | Headers;
  /** Response status code. */
  status?: number;
  /** Minimum confidence 0..1 (default 0.5). */
  minConfidence?: number;
  /** Use your own signature list instead of the built-in one. */
  signatures?: Signature[];
}

export interface DetectOptions extends CommonOptions {
  /** The window to check (default: the global window). */
  window?: Window;
  /** Also search same-origin frames and open shadow roots (default true). */
  deep?: boolean;
  /** Attach the matched DOM elements to each detection as `elements` (not enumerable). */
  elements?: boolean;
  /** Extra cookies as a "a=b; c=d" string (document.cookie is read automatically). */
  cookies?: string;
}

export interface DetectHtmlOptions extends CommonOptions {
  /** URL of the page: resolves relative script/frame URLs and is checked too. */
  url?: string;
  /** Cookies: "a=b; c=d", an array of strings or {name} objects, or a {name: value} object. Set-Cookie headers are read too. */
  cookies?: string | Array<string | { name: string }> | Record<string, string>;
}

export interface DetectResponseOptions extends DetectHtmlOptions {}

/** What detectResponse accepts. */
export type ResponseInput =
  /** A fetch / undici Response (a clone is read, so you can still read the body). */
  | Response
  /** axios-style: { data, status, headers }. */
  | { data: unknown; status: number; headers?: any }
  /** got / needle-style: { body, statusCode, headers }. */
  | { body: unknown; statusCode?: number; status?: number; headers?: any }
  /** HTML, or the JSON text a scraper API sent. */
  | string
  /** The parsed JSON a scraper API sent: the HTML inside it is found on its own. */
  | Record<string, unknown>
  | null
  | undefined;

export interface FrameResult {
  url?: string;
  /** Whether the frame element is shown in its page. */
  visible?: boolean | null;
  result: Result;
}

export interface Signature {
  id: string;
  name: string;
  vendor?: string | null;
  kind: Kind;
  subtype?: string;
  site?: string;
  generic?: boolean;
  [matcher: string]: unknown;
}

export const VERSION: string;
/** Check the current page in a browser (or a window you pass). */
export function detect(options?: DetectOptions): Result;
/** Check an HTML string. Works anywhere (Node, Deno, Bun, workers). */
export function detectHtml(html: string, options?: DetectHtmlOptions): Result;
/**
 * Check what an HTTP client or a scraper API returned: a fetch Response, an axios/got response, an HTML string or
 * a scraper API's JSON (the HTML inside it, and the status/headers/url next to it, are found on its own).
 * Pass `url`: the page you asked for. Options override what the response says.
 */
export function detectResponse(input: ResponseInput, options?: DetectResponseOptions): Promise<Result>;
/** Combine a page's result with results from inside its frames. */
export function mergeResults(main: Result, frames: FrameResult[], options?: { signatures?: Signature[] }): Result;
export function analyze(snapshot: unknown, options?: CommonOptions): Result;
export function snapshotFromDom(win?: Window, options?: DetectOptions): unknown;
export function snapshotFromHtml(html: string, options?: DetectHtmlOptions): unknown;
export const signatures: Signature[];

declare const CaptchaDetector: {
  VERSION: typeof VERSION;
  detect: typeof detect;
  detectHtml: typeof detectHtml;
  detectResponse: typeof detectResponse;
  mergeResults: typeof mergeResults;
  analyze: typeof analyze;
  snapshotFromDom: typeof snapshotFromDom;
  snapshotFromHtml: typeof snapshotFromHtml;
  signatures: typeof signatures;
};
export default CaptchaDetector;
