import { Request, Response, NextFunction } from 'express';
import * as weatherService from './weather.service';
import { WeatherQuery } from './weather.schema';

export async function getWeather(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await weatherService.getWeather(
      req.query as unknown as WeatherQuery
    );

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
