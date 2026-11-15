// Inserted by the background with chrome.scripting.insertCSS, which a page's
// Content-Security-Policy cannot block. The rules do nothing until calm mode
// sets the matching attribute on <html>.
//
// Animations are shortened to one near-instant run instead of paused, so
// elements that fade or slide in still end up in their final, visible state.
export const CALM_CSS = `
html[data-clear-freeze] *,
html[data-clear-freeze] *::before,
html[data-clear-freeze] *::after {
  animation-duration: 0.001s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
}
html[data-clear-colour="soften"] {
  filter: saturate(0.35) contrast(0.9) !important;
}
html[data-clear-colour="greyscale"] {
  filter: grayscale(1) !important;
}
`;
