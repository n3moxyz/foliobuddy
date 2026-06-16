import { describe, expect, it } from 'vitest';
import { getDateRange, downsampleLTTB } from '@/lib/chartUtils';

describe('getDateRange', () => {
  it('marks Max as an explicit all-time request', () => {
    expect(getDateRange('Max')).toEqual({ all: true });
  });
});

describe('downsampleLTTB', () => {
  type Point = { x: number; y: number };
  const getX = (d: Point) => d.x;
  const getY = (d: Point) => d.y;

  function makePoints(n: number): Point[] {
    return Array.from({ length: n }, (_, i) => ({ x: i, y: Math.sin(i) }));
  }

  it('returns input unchanged when data.length <= threshold', () => {
    const data = makePoints(10);
    expect(downsampleLTTB(data, 10, getX, getY)).toBe(data);
    expect(downsampleLTTB(data, 20, getX, getY)).toBe(data);
  });

  it('returns input unchanged when threshold < 3', () => {
    const data = makePoints(100);
    expect(downsampleLTTB(data, 2, getX, getY)).toBe(data);
    expect(downsampleLTTB(data, 0, getX, getY)).toBe(data);
  });

  it('reduces length to threshold', () => {
    const data = makePoints(500);
    const result = downsampleLTTB(data, 300, getX, getY);
    expect(result).toHaveLength(300);
  });

  it('always keeps the first and last points', () => {
    const data = makePoints(500);
    const result = downsampleLTTB(data, 100, getX, getY);
    expect(result[0]).toBe(data[0]);
    expect(result[result.length - 1]).toBe(data[data.length - 1]);
  });

  it('all output points are members of the original array', () => {
    const data = makePoints(500);
    const result = downsampleLTTB(data, 50, getX, getY);
    result.forEach((point) => {
      expect(data).toContain(point);
    });
  });
});
