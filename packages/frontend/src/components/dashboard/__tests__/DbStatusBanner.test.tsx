import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DbStatusBanner } from '../DbStatusBanner';

// Mock the useDbHealth hook
const mockUseDbHealth = vi.fn();
vi.mock('@/hooks/useDbHealth', () => ({
  useDbHealth: () => mockUseDbHealth(),
}));

function renderBanner() {
  return render(
    <TooltipProvider>
      <DbStatusBanner />
    </TooltipProvider>
  );
}

describe('DbStatusBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state with yellow dot and "Checking..." text', () => {
    mockUseDbHealth.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderBanner();

    expect(screen.getByText('Checking...')).toBeInTheDocument();
    const dots = document.querySelectorAll('.bg-warning');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('shows healthy state with green dot and "DB OK" text', () => {
    mockUseDbHealth.mockReturnValue({
      data: { status: 'ok', latency_ms: 5 },
      isLoading: false,
      isError: false,
    });

    renderBanner();

    expect(screen.getByText('DB OK')).toBeInTheDocument();
    const dots = document.querySelectorAll('.bg-profit');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('shows unhealthy state with red dot and "DB Down" when status is error', () => {
    mockUseDbHealth.mockReturnValue({
      data: { status: 'error', latency_ms: 100, message: 'Connection refused' },
      isLoading: false,
      isError: false,
    });

    renderBanner();

    expect(screen.getByText('DB Down')).toBeInTheDocument();
    const dots = document.querySelectorAll('.bg-destructive');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('shows unhealthy state with red dot and "DB Down" when query errors', () => {
    mockUseDbHealth.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderBanner();

    expect(screen.getByText('DB Down')).toBeInTheDocument();
    const dots = document.querySelectorAll('.bg-destructive');
    expect(dots.length).toBeGreaterThan(0);
  });
});
