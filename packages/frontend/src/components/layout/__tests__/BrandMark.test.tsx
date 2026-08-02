import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BrandMark } from '../BrandMark';

describe('BrandMark', () => {
  it('renders the shared Embrace vector master as decorative branding', () => {
    const { container } = render(<BrandMark className="h-8 w-8" />);
    const mark = container.querySelector('img');

    expect(mark).toHaveAttribute('src', '/logo.svg');
    expect(mark).toHaveAttribute('alt', '');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveClass('h-8', 'w-8');
  });
});
