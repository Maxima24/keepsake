import { Directive, OnDestroy, OnInit } from '@angular/core';

/**
 * Magnetic hover for every button / link / [role=button].
 *
 * On hover it inverts the control against its surface (a control on the light
 * "editorial" shell flips to black-with-white-text; a control on the dark
 * "machine" surface flips to white-with-dark-text) and nudges it gently toward
 * the pointer. Colours are driven through CSS custom properties and flip
 * together via one transition, so the label is always readable — no mid-sweep
 * greying. Works with the `[data-mag='on']` rules in styles.css.
 *
 * Apply once on the app root: <app-root appMagneticFill>. It listens on the
 * document, so it also covers content the router renders later.
 */
type Interactive = HTMLElement;

const LIGHT_SURFACE_FILL = '#101010';
const LIGHT_SURFACE_TEXT = '#fafaf8';
const DARK_SURFACE_FILL = '#fafafa';
const DARK_SURFACE_TEXT = '#0a0a0a';
const DARK_SURFACE_BORDER = 'rgba(255,255,255,0.65)';
const NUDGE_STRENGTH = 0.18;
const NUDGE_MAX = 5;

@Directive({
  selector: '[appMagneticFill]',
  standalone: true,
})
export class MagneticFillDirective implements OnInit, OnDestroy {
  private readonly over = (e: PointerEvent) => this.onOver(e);
  private readonly move = (e: PointerEvent) => this.onMove(e);
  private readonly out = (e: PointerEvent) => this.onOut(e);

  ngOnInit(): void {
    document.addEventListener('pointerover', this.over);
    document.addEventListener('pointermove', this.move);
    document.addEventListener('pointerout', this.out);
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerover', this.over);
    document.removeEventListener('pointermove', this.move);
    document.removeEventListener('pointerout', this.out);
  }

  private target(event: Event): Interactive | null {
    const t = event.target;
    if (!(t instanceof Element)) return null;
    const el = t.closest<Interactive>('button, a[href], [role="button"]');
    if (!el || el.closest('[data-no-magnetic]')) return null;
    if (el instanceof HTMLButtonElement && el.disabled) return null;
    if (el.getAttribute('aria-disabled') === 'true') return null;
    return el;
  }

  private onOver(event: PointerEvent): void {
    const el = this.target(event);
    if (!el) return;
    if (event.relatedTarget instanceof Node && el.contains(event.relatedTarget)) return;
    this.setVariant(el);
    el.setAttribute('data-mag', 'on');
    this.nudge(el, event);
  }

  private onMove(event: PointerEvent): void {
    const el = this.target(event);
    if (!el) return;
    this.nudge(el, event);
  }

  private onOut(event: PointerEvent): void {
    const el = this.target(event);
    if (!el) return;
    if (event.relatedTarget instanceof Node && el.contains(event.relatedTarget)) return;
    el.removeAttribute('data-mag');
    el.style.setProperty('--mag-tx', '0px');
    el.style.setProperty('--mag-ty', '0px');
  }

  private nudge(el: Interactive, event: PointerEvent): void {
    const r = el.getBoundingClientRect();
    const dx = event.clientX - (r.left + r.width / 2);
    const dy = event.clientY - (r.top + r.height / 2);
    el.style.setProperty('--mag-tx', `${this.clamp(dx * NUDGE_STRENGTH)}px`);
    el.style.setProperty('--mag-ty', `${this.clamp(dy * NUDGE_STRENGTH)}px`);
  }

  private clamp(v: number): number {
    return Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, Math.round(v * 100) / 100));
  }

  private setVariant(el: Interactive): void {
    const dark = this.luminance(this.surfaceColor(el)) < 0.42;
    el.style.setProperty('--mag-fill', dark ? DARK_SURFACE_FILL : LIGHT_SURFACE_FILL);
    el.style.setProperty('--mag-text', dark ? DARK_SURFACE_TEXT : LIGHT_SURFACE_TEXT);
    el.style.setProperty('--mag-border', dark ? DARK_SURFACE_BORDER : LIGHT_SURFACE_FILL);
  }

  private surfaceColor(el: Element): { r: number; g: number; b: number } {
    // Invert relative to the control's own background; fall back to the nearest
    // painted ancestor when the control itself is transparent (e.g. nav links).
    let cur: Element | null = el;
    while (cur) {
      const rgb = this.parseRgb(getComputedStyle(cur).backgroundColor);
      if (rgb) return rgb;
      cur = cur.parentElement;
    }
    return { r: 246, g: 246, b: 242 };
  }

  private parseRgb(value: string): { r: number; g: number; b: number } | null {
    const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    const alpha = m[4] === undefined ? 1 : Number(m[4]);
    if (alpha === 0) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }

  private luminance({ r, g, b }: { r: number; g: number; b: number }): number {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
}
