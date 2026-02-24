/**
 * Layout types re-exported for WebView consumption.
 * These mirror the core-form layout types but are defined here
 * so webview-ui doesn't need a direct dependency on core-form.
 */

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
  baseline?: number;
  visible: boolean;
  direction?: 'vertical' | 'horizontal';
}

export interface Size {
  width: number;
  height: number;
}
