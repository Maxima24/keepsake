import { Component, Input, booleanAttribute } from '@angular/core';

/**
 * Keepsake brand mark — a sealed ledger: a rounded tile with a hash-chain link
 * and a balancing rule, echoing the double-entry + tamper-evident theme.
 * Tone-aware so it reads on both the light editorial shell and dark machine.
 */
@Component({
  selector: 'app-brand-mark',
  standalone: true,
  template: `
    <span class="flex min-w-0 items-center gap-2.5">
      <svg [attr.viewBox]="'0 0 64 64'" role="img" aria-label="Keepsake" [style.width.px]="size" [style.height.px]="size" class="shrink-0">
        <rect x="3" y="3" width="58" height="58" rx="16" [attr.fill]="bg" [attr.stroke]="border" stroke-width="3.5" />
        <!-- hash-chain: two linked rings -->
        <circle cx="26" cy="32" r="9" fill="none" [attr.stroke]="fg" stroke-width="4" />
        <circle cx="40" cy="32" r="9" fill="none" [attr.stroke]="fg" stroke-width="4" />
        <!-- balance rule -->
        <path d="M15 47H49" [attr.stroke]="rail" stroke-width="3" stroke-linecap="round" />
      </svg>
      @if (wordmark) {
        <span class="flex flex-col leading-none">
          <span data-display class="text-[16px] font-bold tracking-tight">Keepsake</span>
          <span class="mt-1 text-[10px] font-medium tracking-[0.01em] text-current opacity-50">Sealed ledger</span>
        </span>
      }
    </span>
  `,
})
export class BrandMarkComponent {
  @Input({ transform: booleanAttribute }) wordmark = false;
  @Input() size = 34;
  @Input() tone: 'light' | 'dark' = 'dark';

  get dark(): boolean {
    return this.tone === 'dark';
  }
  get bg(): string {
    return this.dark ? '#0A0A0A' : '#FAFAF8';
  }
  get fg(): string {
    return this.dark ? '#FAFAF8' : '#0A0A0A';
  }
  get rail(): string {
    return this.dark ? 'rgba(250,250,248,0.34)' : 'rgba(10,10,10,0.32)';
  }
  get border(): string {
    return this.dark ? '#0A0A0A' : 'rgba(16,16,16,0.14)';
  }
}
