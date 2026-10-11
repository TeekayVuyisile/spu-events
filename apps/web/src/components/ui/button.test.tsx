import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Get ticket</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Get ticket' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled and busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Top up
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Top up' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders its single child when asChild', () => {
    render(
      <Button asChild>
        <a href="/login">Log in</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveClass('rounded-md');
  });
});
