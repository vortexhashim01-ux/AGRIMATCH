import { Request, Response, NextFunction } from 'express';
import * as marketPriceService from './marketPrice.service';
import { MarketPriceQuery } from './marketPrice.schema';

export async function getMarketPrices(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await marketPriceService.getMarketPrices(
      req.query as unknown as MarketPriceQuery
    );

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
