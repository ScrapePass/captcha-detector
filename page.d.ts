import type { Result, CommonOptions } from './index';

/** A Playwright or Puppeteer Page (anything with mainFrame() and frames()). */
export interface PageLike {
  mainFrame(): any;
  frames(): any[];
}

export interface DetectInPageOptions extends Omit<CommonOptions, 'headers' | 'status'> {
  /** The Response from page.goto(): its status and headers are checked too. */
  response?: any;
  /** Also look inside every frame, cross-origin ones included (default true). */
  frames?: boolean;
  /** Search same-origin frames and open shadow roots from inside the page (default true). */
  deep?: boolean;
}

/** Detect captchas on a Playwright or Puppeteer page, inside its frames too. */
export function detectInPage(page: PageLike, options?: DetectInPageOptions): Promise<Result>;

/** Poll until a captcha appears (or `visible: true`: until one is shown), or the timeout passes. Resolves with the last result. */
export function waitForCaptcha(page: PageLike, options?: DetectInPageOptions & { timeout?: number; interval?: number; visible?: boolean }): Promise<Result>;

/** Source of the browser build, for page.addInitScript(), driver.execute_script() and the like. */
export const browserScript: string;

/** A JavaScript expression that runs detect(options) in a page and returns the result, leaving no globals. */
export function expression(options?: object): string;
