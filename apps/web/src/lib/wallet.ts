import type { TopUpInput, Wallet, WithdrawInput } from '@spu-events/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const walletKey = ['wallet'] as const;

export const walletQuery = queryOptions({
  queryKey: walletKey,
  queryFn: () => api<Wallet>('/wallet'),
});

/**
 * Top-up or withdrawal. The caller passes a requestId made once per dialog, so a
 * retry or double-click is recognised by the API and never moves money twice.
 */
export function useWalletMutation(kind: 'top-ups' | 'withdrawals') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TopUpInput | WithdrawInput) =>
      api<Wallet>(`/wallet/${kind}`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (wallet) => queryClient.setQueryData(walletKey, wallet),
  });
}
