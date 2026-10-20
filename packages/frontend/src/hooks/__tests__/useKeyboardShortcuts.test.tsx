import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useShortcutsStore } from '@/stores/shortcutsStore';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

function ShortcutPage({ overlay }: { overlay?: 'dialog' | 'menu' | 'listbox' }) {
  useKeyboardShortcuts();
  const location = useLocation();
  return (
    <>
      <output aria-label="Current page">{location.pathname}</output>
      {overlay && <div role={overlay} aria-label="Open overlay" />}
    </>
  );
}

beforeEach(() => useShortcutsStore.setState({ enabled: true }));

describe('navigation shortcuts', () => {
  it('navigates when the page has no open overlay', () => {
    render(
      <MemoryRouter>
        <ShortcutPage />
      </MemoryRouter>
    );
    fireEvent.keyDown(document, { key: 'p', code: 'KeyP' });
    expect(screen.getByLabelText('Current page')).toHaveTextContent('/portfolio');
  });

  it.each(['dialog', 'menu', 'listbox'] as const)(
    'keeps the current page while a %s is open',
    (overlay) => {
      render(
        <MemoryRouter>
          <ShortcutPage overlay={overlay} />
        </MemoryRouter>
      );
      fireEvent.keyDown(document, { key: 'p', code: 'KeyP' });
      expect(screen.getByLabelText('Current page')).toHaveTextContent(/^\/$/);
    }
  );
});
