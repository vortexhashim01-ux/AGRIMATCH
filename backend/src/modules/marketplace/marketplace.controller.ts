import { Request, Response, NextFunction } from 'express';
import * as marketplaceService from './marketplace.service';
import { MarketplaceQuery } from './marketplace.schema';

export async function browseMarketplace(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const query = req.query as unknown as MarketplaceQuery;
    const result = await marketplaceService.browseMarketplace(query);

    res.status(200).json({
      success: true,
      data: {
        listingsCount: result.listingsCount,
        requirementsCount: result.requirementsCount,
        count: result.count,
        items: result.items,
      },
    });
  } catch (error) {
    next(error);
  }
}
