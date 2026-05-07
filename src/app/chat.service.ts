import { Injectable, NgZone, computed, signal } from '@angular/core';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';
export type UserStatus = 'active' | 'away';

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  sentAt: string;
  avatarUrl?: string;
  colorIndex?: number;
  status?: UserStatus;
  system?: boolean;
}

export interface PresenceUser {
  id: string;
  author: string;
  avatarUrl?: string;
  colorIndex?: number;
  status: UserStatus;
}

interface ServerEvent {
  type: 'message' | 'presence' | 'system';
  payload?: ChatMessage;
  count?: number;
  users?: PresenceUser[];
}

interface RateLimitEvent {
  type: 'rate-limit';
  message: string;
  timeoutUntil: number;
}

interface OutboundMessage {
  author: string;
  avatarUrl?: string;
  status: UserStatus;
  text: string;
}

interface PresenceUpdate {
  author: string;
  avatarUrl?: string;
  status: UserStatus;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly socketUrl = 'ws://localhost:8080';
  private socket?: WebSocket;
  private reconnectTimer?: number;

  private readonly _messages = signal<ChatMessage[]>([]);
  private readonly _connectionState = signal<ConnectionState>('disconnected');
  private readonly _clientCount = signal(0);
  private readonly _users = signal<PresenceUser[]>([]);
  private readonly _rateLimitMessage = signal('');
  private readonly _timeoutUntil = signal(0);

  readonly messages = computed(() => this._messages());
  readonly connectionState = computed(() => this._connectionState());
  readonly clientCount = computed(() => this._clientCount());
  readonly users = computed(() => this._users());
  readonly rateLimitMessage = computed(() => this._rateLimitMessage());
  readonly timeoutUntil = computed(() => this._timeoutUntil());

  constructor(private readonly zone: NgZone) {
    this.connect();
  }

  send(message: OutboundMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify({ type: 'message', payload: message }));
  }

  updatePresence(presence: PresenceUpdate): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify({ type: 'presence-update', payload: presence }));
  }

  reconnect(): void {
    window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.connect();
  }

  private connect(): void {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this._connectionState.set('connecting');
    this.socket = new WebSocket(this.socketUrl);

    this.socket.onopen = () => {
      this.zone.run(() => this._connectionState.set('connected'));
    };

    this.socket.onmessage = (event) => {
      this.zone.run(() => this.handleServerEvent(event.data));
    };

    this.socket.onclose = () => {
      this.zone.run(() => {
        this._connectionState.set('disconnected');
        this.scheduleReconnect();
      });
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  private handleServerEvent(data: string): void {
    const event = JSON.parse(data) as ServerEvent | RateLimitEvent;

    if (event.type === 'rate-limit') {
      this._rateLimitMessage.set(event.message);
      this._timeoutUntil.set(event.timeoutUntil);
      return;
    }

    if (event.type === 'presence') {
      this._clientCount.set(event.count ?? event.users?.length ?? 0);
      this._users.set(event.users ?? []);
      return;
    }

    if ((event.type === 'message' || event.type === 'system') && event.payload) {
      this._rateLimitMessage.set('');
      this._messages.update((messages) => [...messages, event.payload!]);
    }
  }

  private scheduleReconnect(): void {
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => this.connect(), 2500);
  }
}
