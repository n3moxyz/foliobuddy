import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import type { Position, UserPreferences } from '@/lib/types';
import { USER_PREFERENCES_QUERY_KEY } from '@/hooks/useUserPreferences';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import { ReduceQuantityInput } from '../ReduceQuantityInput';

vi.mock('@/lib/api', () => ({
  api: { getUserPreferences: vi.fn(), updateUserPreferences: vi.fn() },
}));
afterEach(() => vi.resetAllMocks());

const initial = {
  snapshotHour: 5,
  snapshotTimezone: 'Asia/Singapore',
  perpExposureUsd: null,
  reducePercentages: [25, 50, 75, 100],
};
const position = {
  quantity: 10,
  asset: { symbol: 'SOL', category: 'LIQUID_CRYPTO', currentPriceUsd: 150 },
} as Position;

function setup() {
  const client = createTestQueryClient();
  client.setQueryData(USER_PREFERENCES_QUERY_KEY, initial);
  const onValueChange = vi.fn();
  const wrapper = createQueryClientWrapper(client);
  const result = render(
    <ReduceQuantityInput
      position={position}
      value=""
      onValueChange={onValueChange}
      disabled={false}
    />,
    { wrapper }
  );
  return { ...result, client, onValueChange, wrapper };
}

function edit(values = ['10', '20', '60', '100']) {
  fireEvent.click(screen.getByRole('button', { name: 'Edit Reduce Percentages' }));
  values.forEach((value, index) =>
    fireEvent.change(screen.getByLabelText(`Button ${index + 1} (%)`), { target: { value } })
  );
}

describe('reduce percentage defaults', () => {
  it('keeps saved defaults when an overlapping preference refresh returns older values', async () => {
    let finishSave!: (value: UserPreferences) => void;
    let finishRefresh!: (value: UserPreferences) => void;
    vi.mocked(api.updateUserPreferences).mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      })
    );
    vi.mocked(api.getUserPreferences).mockReturnValue(
      new Promise((resolve) => {
        finishRefresh = resolve;
      })
    );
    const { client } = setup();
    edit();
    fireEvent.click(screen.getByRole('button', { name: 'Save Percentages' }));
    await waitFor(() => expect(api.updateUserPreferences).toHaveBeenCalled());
    const refresh = client.refetchQueries({ queryKey: USER_PREFERENCES_QUERY_KEY });
    await waitFor(() => expect(api.getUserPreferences).toHaveBeenCalled());
    await act(async () => {
      finishSave({ ...initial, reducePercentages: [10, 20, 60, 100] });
    });
    await screen.findByRole('button', { name: 'Reduce 60%' });
    await act(async () => {
      finishRefresh(initial);
      await refresh;
    });
    expect(screen.getByRole('button', { name: 'Reduce 60%' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reduce 25%' })).not.toBeInTheDocument();
  });
  it('loads saved defaults in a fresh app session', async () => {
    const client = createTestQueryClient();
    vi.mocked(api.getUserPreferences).mockResolvedValue({
      ...initial,
      reducePercentages: [5, 10, 20, 40],
    });
    render(
      <ReduceQuantityInput position={position} value="" onValueChange={vi.fn()} disabled={false} />,
      { wrapper: createQueryClientWrapper(client) }
    );
    expect(screen.getByRole('button', { name: 'Edit Reduce Percentages' })).toBeDisabled();
    expect(await screen.findByRole('button', { name: 'Reduce 40%' })).toBeEnabled();
  });
  it('saves defaults without changing quantity and uses them for another position', async () => {
    const { onValueChange, unmount, wrapper } = setup();
    vi.mocked(api.updateUserPreferences).mockResolvedValue({
      ...initial,
      reducePercentages: [10, 20, 60, 100],
    });
    edit();
    fireEvent.click(screen.getByRole('button', { name: 'Save Percentages' }));
    await screen.findByRole('button', { name: 'Reduce 60%' });
    expect(api.updateUserPreferences).toHaveBeenCalledWith({
      reducePercentages: [10, 20, 60, 100],
    });
    expect(onValueChange).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit Reduce Percentages' })).toHaveFocus()
    );
    unmount();
    render(
      <ReduceQuantityInput
        position={{ ...position, quantity: 20 }}
        value=""
        onValueChange={onValueChange}
        disabled={false}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reduce 60%' }));
    expect(onValueChange).toHaveBeenLastCalledWith('12');
  });

  it('cancels with Escape and returns focus to the pencil', () => {
    setup();
    edit();
    fireEvent.keyDown(screen.getByLabelText('Button 1 (%)'), { key: 'Escape' });
    expect(
      screen.queryByRole('group', { name: 'Edit Reduce Percentages' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Reduce Percentages' })).toHaveFocus();
    expect(api.updateUserPreferences).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reduce 25%' })).toBeInTheDocument();
  });

  it.each([
    ['0', '25', '50', '100'],
    ['10.5', '25', '50', '100'],
    ['25', '25', '75', '100'],
    ['', '25', '50', '100'],
    ['10', '25', '50', '101'],
  ])('rejects invalid defaults %j', (...values) => {
    setup();
    edit(values);
    fireEvent.click(screen.getByRole('button', { name: 'Save Percentages' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter four different whole percentages');
    expect(api.updateUserPreferences).not.toHaveBeenCalled();
  });

  it('keeps the previous buttons and draft when saving fails', async () => {
    setup();
    vi.mocked(api.updateUserPreferences).mockRejectedValue(new Error('Offline'));
    edit();
    fireEvent.keyDown(screen.getByLabelText('Button 1 (%)'), { key: 'Enter' });
    await screen.findByText("Couldn't save percentages. Please try again.");
    expect(screen.getByRole('button', { name: 'Reduce 25%' })).toBeInTheDocument();
    expect(screen.getByLabelText('Button 1 (%)')).toHaveValue(10);
  });

  it('does not reset defaults when an unrelated preference changes', async () => {
    const { client } = setup();
    await act(async () => {
      client.setQueryData(USER_PREFERENCES_QUERY_KEY, {
        ...initial,
        reducePercentages: [5, 10, 20, 40],
        perpExposureUsd: 100,
      });
    });
    expect(await screen.findByRole('button', { name: 'Reduce 40%' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reduce 100%' })).not.toBeInTheDocument()
    );
  });
});
