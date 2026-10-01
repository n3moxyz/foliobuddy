import { describe, expect, it } from 'vitest';
import {
  ibkrCodexUrl,
  ibkrSyncPrompt,
  parseCodexChatId,
  readIbkrCodexChat,
  saveIbkrCodexChat,
} from '../ibkrCodexSync';

const chat = '12345678-1234-1234-1234-123456789abc';

describe('IBKR Codex handoff', () => {
  it('accepts local chat links and IDs but rebuilds the request and host itself', () => {
    expect(parseCodexChatId(` ${chat.toUpperCase()} `)).toBe(chat);
    const parsed = parseCodexChatId(`codex://threads/${chat}?prompt=Sell+everything&hostId=remote`);
    expect(parsed).toBe(chat);
    const url = new URL(ibkrCodexUrl(parsed!, 'owned-cash'));
    expect(url.protocol).toBe('codex:');
    expect(url.hostname).toBe('threads');
    expect(url.pathname).toBe(`/${chat}`);
    expect([...url.searchParams.keys()]).toEqual(['prompt']);
    expect(url.searchParams.get('prompt')).toBe(ibkrSyncPrompt('owned-cash'));
    expect(url.searchParams.get('prompt')).not.toContain('Sell everything');
  });

  it.each([
    '',
    'javascript:alert(1)',
    `https://example.com/threads/${chat}`,
    `codex://threads/${chat}/extra`,
    `codex://threads/${chat}#fragment`,
    `codex://user@threads/${chat}`,
    `codex://threads:123/${chat}`,
    'codex://threads/new',
    'codex://settings/connections',
  ])('rejects a non-local-chat target: %s', (input) => {
    expect(parseCodexChatId(input)).toBeNull();
  });

  it('isolates the chat setting by owned account anchor', () => {
    saveIbkrCodexChat('owner-a-cash', chat);
    expect(readIbkrCodexChat('owner-a-cash')).toBe(chat);
    expect(readIbkrCodexChat('owner-b-cash')).toBeNull();
    expect(() => saveIbkrCodexChat('owner-b-cash', 'invalid')).toThrow();
    expect(() => ibkrCodexUrl('invalid', 'owner-a-cash')).toThrow();
  });
});
