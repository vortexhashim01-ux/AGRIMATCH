import { z } from 'zod';

export const weatherQuerySchema = z.object({
  district: z.string().min(2).max(100).trim(),
  state: z.string().min(2).max(100).trim(),
});

export type WeatherQuery = z.infer<typeof weatherQuerySchema>;
