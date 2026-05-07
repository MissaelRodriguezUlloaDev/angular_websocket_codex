import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { ChatService } from './chat.service';

describe('App', () => {
  const chatService = {
    messages: signal([]),
    connectionState: signal('connected'),
    clientCount: signal(1),
    users: signal([]),
    rateLimitMessage: signal(''),
    timeoutUntil: signal(0),
    send: vi.fn(),
    updatePresence: vi.fn(),
    reconnect: vi.fn(),
  };

  beforeEach(async () => {
    chatService.send.mockClear();
    chatService.updatePresence.mockClear();
    chatService.reconnect.mockClear();

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: ChatService, useValue: chatService }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app).toBeTruthy();
  });

  it('should render the chat room', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent).toContain('Team room');
    expect(compiled.querySelector('form button')?.textContent).toContain('Send');
  });
});
