// src/utils/device.js
/**
 * Centralized mobile detection for Rib vs Bit
 * Combines user-agent, touch capability, and screen size for maximum reliability
 */
export function isMobile() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const ua = (navigator.userAgent || '').toLowerCase();

  const isMobileUA = /mobi|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);

  const hasTouch = 'ontouchstart' in window ||
                   (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);

  const smallScreen = (window.innerWidth || screen.width) < 800;

  return isMobileUA || (hasTouch && smallScreen);
}
