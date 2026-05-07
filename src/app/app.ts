import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from './chat.service';

@Component({
  selector: 'app-root',
  imports: [DatePipe, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnDestroy {
  private readonly chat = inject(ChatService);
  private readonly idleTimeoutMs = 30000;
  private idleTimer?: number;
  private scrollTimer?: number;
  private readonly now = signal(Date.now());
  private readonly timeoutClock = window.setInterval(() => this.now.set(Date.now()), 1000);

  @ViewChild('messageList')
  private messageList?: ElementRef<HTMLDivElement>;

  protected readonly messages = this.chat.messages;
  protected readonly connectionState = this.chat.connectionState;
  protected readonly clientCount = this.chat.clientCount;
  protected readonly users = this.chat.users;
  protected readonly rateLimitMessage = this.chat.rateLimitMessage;
  protected readonly timeoutRemainingSeconds = computed(() =>
    Math.max(0, Math.ceil((this.chat.timeoutUntil() - this.now()) / 1000)),
  );
  protected readonly canSend = computed(
    () => this.connectionState() === 'connected' && this.timeoutRemainingSeconds() === 0,
  );

  protected readonly name = signal(localStorage.getItem('chat-name') ?? 'Guest');
  protected readonly avatarUrl = signal(localStorage.getItem('chat-avatar') ?? '');
  protected readonly draft = signal('');
  protected readonly isAway = signal(false);
  private readonly manuallyAway = signal(false);
  protected readonly statusLabel = computed(() => (this.isAway() ? 'Away' : 'Active'));

  constructor() {
    effect(() => {
      localStorage.setItem('chat-name', this.name().trim() || 'Guest');
    });

    effect(() => {
      const avatar = this.avatarUrl();

      if (avatar) {
        localStorage.setItem('chat-avatar', avatar);
      } else {
        localStorage.removeItem('chat-avatar');
      }
    });

    effect(() => {
      if (this.connectionState() !== 'connected') {
        return;
      }

      this.chat.updatePresence({
        author: this.name().trim() || 'Guest',
        avatarUrl: this.avatarUrl(),
        status: this.isAway() ? 'away' : 'active',
      });
    });

    effect(() => {
      this.messages().length;
      this.scheduleScrollToLatestMessage();
    });

    this.resetIdleTimer();
  }

  protected sendMessage(): void {
    const text = this.draft().trim();

    if (!text || !this.canSend()) {
      return;
    }

    this.chat.send({
      author: this.name().trim() || 'Guest',
      avatarUrl: this.avatarUrl(),
      status: this.isAway() ? 'away' : 'active',
      text,
    });
    this.draft.set('');
    this.resetIdleTimer();
  }

  protected reconnect(): void {
    this.chat.reconnect();
  }

  ngOnDestroy(): void {
    window.clearInterval(this.timeoutClock);
    window.clearTimeout(this.idleTimer);
    window.clearTimeout(this.scrollTimer);
  }

  protected updateAvatar(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file || !file.type.startsWith('image/')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.avatarUrl.set(String(reader.result ?? ''));
    };
    reader.readAsDataURL(file);
  }

  protected clearAvatar(): void {
    this.avatarUrl.set('');
  }

  protected toggleAway(): void {
    if (this.isAway() && this.manuallyAway()) {
      this.manuallyAway.set(false);
      this.isAway.set(false);
    } else {
      this.manuallyAway.set(true);
      this.isAway.set(true);
    }

    this.resetIdleTimer();
  }

  protected authorColor(author: string, colorIndex?: number): string {
    if (author === 'System') {
      return '#eef6f1';
    }

    const index = colorIndex ?? this.authorHash(author);
    const hue = Math.round((index * 137.508) % 360);
    const saturation = 72 + (index % 4) * 6;
    const lightness = index % 2 === 0 ? 84 : 73;

    return `hsl(${hue} ${saturation}% ${lightness}%)`;
  }

  private authorHash(author: string): number {
    let hash = 0;
    for (const character of author) {
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }

    return hash % 100;
  }

  @HostListener('document:keydown')
  @HostListener('document:mousemove')
  @HostListener('document:pointerdown')
  @HostListener('document:touchstart')
  protected markActive(): void {
    if (this.isAway() && !this.manuallyAway()) {
      this.isAway.set(false);
    }

    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (!this.manuallyAway()) {
        this.isAway.set(true);
      }
    }, this.idleTimeoutMs);
  }

  private scheduleScrollToLatestMessage(): void {
    window.clearTimeout(this.scrollTimer);
    this.scrollTimer = window.setTimeout(() => this.scrollToLatestMessage());
  }

  private scrollToLatestMessage(): void {
    const list = this.messageList?.nativeElement;

    if (!list) {
      return;
    }

    list.scrollTo({
      top: list.scrollHeight,
      behavior: 'smooth',
    });
  }
}
