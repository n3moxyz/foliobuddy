import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../dropdown-menu';

it('lets a touch pan start on the trigger and opens on a completed tap', () => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>More actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Details</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const trigger = screen.getByRole('button', { name: 'More actions' });
  const touch = () => {
    const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    fireEvent(trigger, event);
  };

  touch();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  fireEvent.pointerCancel(trigger);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();

  touch();
  fireEvent.click(trigger);
  expect(screen.getByRole('menuitem', { name: 'Details' })).toBeInTheDocument();
});
