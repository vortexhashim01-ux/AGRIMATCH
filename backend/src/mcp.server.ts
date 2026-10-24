import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';

let sharedServer: McpServer | null = null;
let sharedHttpRouter: { handler: (req: Request, res: Response) => Promise<void> } | null = null;
let stdioTransport: StdioServerTransport | null = null;

export function getMcpServer(): McpServer {
  if (!sharedServer) {
    sharedServer = new McpServer({
      name: 'agrimatch',
      version: '1.0.0',
    });
    registerTools(sharedServer);
  }
  return sharedServer;
}

function registerTools(server: McpServer): void {
  server.registerTool(
    'health_check',
    {
      description:
        'Check the AgriMatch backend health, MongoDB connection status, and process uptime. No authentication required.',
    },
    async () => {
      try {
        const { isDBConnected } = await import('./config/db');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  status: 'ok',
                  timestamp: new Date().toISOString(),
                  db: isDBConnected ? 'connected' : 'disconnected',
                  uptimeSeconds: Number(process.uptime().toFixed(3)),
                  nodeEnv: process.env.NODE_ENV ?? 'unknown',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            { type: 'text' as const, text: `Health check failed: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  const cropRecSchema = z.object({
    soilType: z
      .enum([
        'alluvial',
        'black',
        'red',
        'laterite',
        'desert',
        'mountain',
        'peat',
        'saline',
      ])
      .describe('Soil classification'),
    season: z
      .enum(['kharif', 'rabi', 'zaid', 'summer', 'winter', 'whole_year'])
      .describe('Growing season'),
    state: z.string().describe('Indian state or region name (e.g. Maharashtra, Punjab, Telangana)'),
    totalLandArea: z.number().min(0.01).describe('Total farm land area in acres'),
    budgetPerAcre: z.number().min(0).describe('Budget (INR) the farmer has per acre for inputs'),
    averageRainfallMm: z.number().min(0).describe('Average rainfall (mm) during the growing season'),
    irrigationType: z
      .enum(['rainfed', 'canal', 'borewell', 'drip', 'sprinkler', 'tank', 'well'])
      .describe('Primary irrigation source'),
    cropPreferences: z.array(z.string()).optional().describe('Optional list of crops the farmer prefers to grow'),
    isOrganicPreferred: z.boolean().optional().describe('If true, favour organic-friendly low-input crops'),
  });

  server.registerTool(
    'crop_recommendation_quick',
    {
      description:
        'Get a rule-based AgriMatch crop recommendation for a farmer. Returns ranked crops with match score, yield estimate, profit estimate, risk level, and reasons.',
      inputSchema: cropRecSchema,
    },
    async (args: z.infer<typeof cropRecSchema>) => {
      try {
        const { buildRecommendation } = await import('./mcp/tools/cropRecommendation');
        const result = buildRecommendation({
          soilType: args.soilType,
          season: args.season,
          state: args.state,
          totalLandArea: Number(args.totalLandArea),
          budgetPerAcre: Number(args.budgetPerAcre),
          averageRainfallMm: Number(args.averageRainfallMm),
          irrigationType: args.irrigationType,
          cropPreferences: args.cropPreferences ?? [],
          isOrganicPreferred: Boolean(args.isOrganicPreferred),
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [
            { type: 'text' as const, text: `Crop recommendation failed: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  const farmProfileSchema = z.object({
    farmerId: z
      .string()
      .describe('Farmer user ID (24-char MongoDB ObjectId of a User with role=farmer)'),
  });

  server.registerTool(
    'farm_profile_summary',
    {
      description:
        "Look up a farmer's stored FarmProfile by farmer user ID. Returns land size, soil type, pincode, state, district, irrigation info.",
      inputSchema: farmProfileSchema,
    },
    async (args: z.infer<typeof farmProfileSchema>) => {
      try {
        const { Types } = await import('mongoose');
        const { getFarmProfileByFarmerId } = await import(
          './modules/users/farmProfile.service'
        );
        const fid = new Types.ObjectId(args.farmerId);
        const profile = await getFarmProfileByFarmerId(fid);
        if (!profile) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  { found: false, message: 'No farm profile exists for this farmerId yet.' },
                  null,
                  2
                ),
              },
            ],
          };
        }
        const anyProf = profile as any;
        const raw =
          typeof anyProf.toObject === 'function' ? anyProf.toObject() : { ...anyProf };
        const { farmerId, _id, __v, createdAt, updatedAt, ...safe } = raw;
        void farmerId;
        void _id;
        void __v;
        void createdAt;
        void updatedAt;
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ found: true, data: safe }, null, 2) },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            { type: 'text' as const, text: `farm_profile_summary failed: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  const marketplaceSchema = z.object({
    cropName: z
      .string()
      .optional()
      .describe('Optional case-insensitive crop name substring filter (e.g. tomato, cotton, wheat)'),
    minPricePerKg: z.number().min(0).optional().describe('Optional minimum expected price per kg (INR)'),
    maxPricePerKg: z.number().min(0).optional().describe('Optional maximum expected price per kg (INR)'),
    qualityGrade: z.enum(['A', 'B', 'C']).optional().describe('Optional quality grade filter'),
    state: z.string().optional().describe('Optional state substring filter'),
    district: z.string().optional().describe('Optional district substring filter'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max results to return. Default 10, max 50'),
  });

  server.registerTool(
    'marketplace_search',
    {
      description:
        'Search AgriMatch active CropListings (farmer supply) filtered by crop name, min/max price, quality grade, state, district. Use this to answer "what crops are for sale" or "who is selling tomatoes near me".',
      inputSchema: marketplaceSchema,
    },
    async (args: z.infer<typeof marketplaceSchema>) => {
      try {
        const { searchListings } = await import('./mcp/tools/marketplaceSearch');
        const results = await searchListings({
          cropName: args.cropName,
          minPricePerKg:
            args.minPricePerKg !== undefined ? Number(args.minPricePerKg) : undefined,
          maxPricePerKg:
            args.maxPricePerKg !== undefined ? Number(args.maxPricePerKg) : undefined,
          qualityGrade: args.qualityGrade,
          state: args.state,
          district: args.district,
          limit: Math.min(50, Math.max(1, Number(args.limit ?? 10))),
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ count: results.length, results }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            { type: 'text' as const, text: `marketplace_search failed: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}

export async function buildMcpHttpHandler(): Promise<{
  handler: (req: Request, res: Response) => Promise<void>;
}> {
  const server = getMcpServer();
  const transport = new StreamableHTTPServerTransport();
  await server.connect(transport);
  return {
    handler: async (req: Request, res: Response) => {
      try {
        await transport.handleRequest(req, res);
      } catch (err: any) {
        const statusCode =
          typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).send(err?.message ?? 'MCP transport error');
      }
    },
  };
}

export async function getMcpHttpHandler(): Promise<{
  handler: (req: Request, res: Response) => Promise<void>;
}> {
  if (!sharedHttpRouter) {
    sharedHttpRouter = await buildMcpHttpHandler();
  }
  return sharedHttpRouter;
}

export async function startStdioMcpServer(): Promise<{
  server: McpServer;
  transport: StdioServerTransport;
}> {
  if (stdioTransport) {
    throw new Error('Stdio MCP transport already running.');
  }
  const server = getMcpServer();
  stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  (server as any).server.onclose = () => {
    process.exit(0);
  };
  return { server, transport: stdioTransport };
}

export async function attachMcpToHttpServer(
  app: any,
  basePath: string
): Promise<{ handler: (req: Request, res: Response) => Promise<void>; basePath: string }> {
  const { handler } = await getMcpHttpHandler();
  app.use(basePath, handler);
  return { handler, basePath };
}
