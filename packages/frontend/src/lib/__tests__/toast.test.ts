import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast as sonnerToast } from 'sonner';
import { toast } from '../toast';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }),
}));

describe('toast', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps error toasts until they are dismissed', () => {
    toast.error('Copy failed', { description: 'Clipboard access was denied.' });
    expect(sonnerToast.error).toHaveBeenCalledWith('Copy failed', {
      description: 'Clipboard access was denied.',
      duration: Infinity,
    });
  });

  it('lets a caller choose its own error duration', () => {
    toast.error('Copy failed', { duration: 5000 });
    expect(sonnerToast.error).toHaveBeenCalledWith('Copy failed', { duration: 5000 });
  });

  it('leaves other toast types unchanged', () => {
    toast.success('Saved');
    toast('Heads up');
    expect(sonnerToast.success).toHaveBeenCalledWith('Saved');
    expect(sonnerToast).toHaveBeenCalledWith('Heads up');
  });
});
