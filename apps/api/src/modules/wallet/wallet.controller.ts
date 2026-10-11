import type { RequestHandler } from 'express';
import type { WalletService } from './wallet.service';

export function walletController(wallet: WalletService) {
  const get: RequestHandler = async (_req, res) => {
    res.json(await wallet.get(res.locals.user!.id));
  };
  const topUp: RequestHandler = async (_req, res) => {
    res.status(201).json(await wallet.topUp(res.locals.user!.id, res.locals.valid.body));
  };
  const withdraw: RequestHandler = async (_req, res) => {
    res.status(201).json(await wallet.withdraw(res.locals.user!.id, res.locals.valid.body));
  };
  return { get, topUp, withdraw };
}
