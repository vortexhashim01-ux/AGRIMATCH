import { Types } from 'mongoose';
import { CropListing } from '../crop-listing/cropListing.model';
import { BuyerRequirement } from '../buyer-requirements/buyerRequirement.model';
import { Match } from '../matching/matching.model';
import { Order, OrderStatus } from '../orders/order.model';
import { getFarmerReliabilityScore } from '../matching/matching.service';
import { User, UserRole } from '../users/user.model';

/**
 * The farmer funnel from PRD §5.5 — "listed 12 crops, connected with 100
 * buyers, 50 agreed to a deal, 10 completed a purchase". Each step is a strict
 * narrowing of the previous one, so the numbers are monotonic by construction.
 */
export interface FarmerFunnel {
  listed: number;
  connected: number;
  agreed: number;
  completed: number;
}

export type DashboardDeals = Record<OrderStatus, number>;

export interface DashboardMoney {
  settled: number;
  inProgress: number;
}

export interface FarmerSummary {
  role: 'farmer';
  funnel: FarmerFunnel;
  listings: Record<string, number>;
  deals: DashboardDeals;
  earnings: DashboardMoney;
  reliabilityScore: number;
}

export interface BuyerSummary {
  role: 'buyer';
  funnel: FarmerFunnel;
  requirements: Record<string, number>;
  deals: DashboardDeals;
  spend: DashboardMoney;
}

export interface AdminSummary {
  role: 'admin';
  platform: {
    farmers: number;
    buyers: number;
    activeListings: number;
    orders: number;
  };
}

export type DashboardSummary = FarmerSummary | BuyerSummary | AdminSummary;

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
];

function emptyCounts(): Record<OrderStatus, number> {
  return ORDER_STATUSES.reduce(
    (acc, status) => ({ ...acc, [status]: 0 }),
    {} as Record<OrderStatus, number>
  );
}

/**
 * Revenue is grouped from the orders themselves rather than stored, so a
 * cancelled or still-pending deal can never be counted as earnings.
 */
async function revenueFor(field: 'farmerId' | 'buyerId', userId: Types.ObjectId) {
  const rows = await Order.aggregate<{ _id: OrderStatus; total: number }>([
    { $match: { [field]: userId } },
    {
      $group: {
        _id: '$status',
        total: { $sum: { $multiply: ['$quantityKg', '$agreedPricePerKg'] } },
      },
    },
  ]);

  const byStatus = emptyCounts();
  for (const row of rows) byStatus[row._id] = Math.round(row.total);

  const committed = ORDER_STATUSES.filter(
    (status) => status !== 'cancelled'
  ).reduce((sum, status) => sum + byStatus[status], 0);

  return {
    /** Value of orders actually delivered — money that has been earned. */
    settled: byStatus.delivered,
    /** Value of everything still in flight, excluding cancelled orders. */
    inProgress: committed - byStatus.delivered,
  };
}

async function orderCounts(field: 'farmerId' | 'buyerId', userId: Types.ObjectId) {
  const rows = await Order.aggregate<{ _id: OrderStatus; count: number }>([
    { $match: { [field]: userId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const counts = emptyCounts();
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

/**
 * A farmer's own dashboard: what they listed, who they reached, how many deals
 * closed, plus their reliability score as the matching engine computed it.
 */
async function farmerSummary(userId: Types.ObjectId): Promise<FarmerSummary> {
  const [
    listingRows,
    connectedBuyers,
    agreedMatches,
    deliveredOrders,
    deals,
    reliabilityScore,
  ] = await Promise.all([
    CropListing.aggregate<{ _id: string; count: number }>([
      { $match: { farmerId: userId, isDeleted: { $ne: true } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // Distinct buyers reached. Counting distinct ids rather than matches keeps
    // one buyer with three matches from inflating the funnel.
    Match.distinct('buyerId', { farmerId: userId }),
    Match.countDocuments({ farmerId: userId, status: 'accepted' }),
    Order.countDocuments({ farmerId: userId, status: 'delivered' }),
    orderCounts('farmerId', userId),
    getFarmerReliabilityScore(userId),
  ]);

  const listings = { active: 0, matched: 0, sold: 0, expired: 0 } as Record<
    string,
    number
  >;
  for (const row of listingRows) listings[row._id] = row.count;

  const listed = listingRows.reduce((sum, row) => sum + row.count, 0);

  return {
    role: 'farmer',
    funnel: {
      listed,
      connected: connectedBuyers.length,
      agreed: agreedMatches,
      completed: deliveredOrders,
    } satisfies FarmerFunnel,
    listings,
    deals,
    earnings: await revenueFor('farmerId', userId),
    reliabilityScore,
  };
}

/**
 * A buyer's dashboard. `matchedFarmers` is the buyer's mirror of the farmer's
 * `connected` step, so both sides see the same funnel shape.
 */
async function buyerSummary(userId: Types.ObjectId): Promise<BuyerSummary> {
  const [
    requirementRows,
    matchedFarmers,
    agreedMatches,
    deliveredOrders,
    deals,
  ] = await Promise.all([
    BuyerRequirement.aggregate<{ _id: string; count: number }>([
      { $match: { buyerId: userId, isDeleted: { $ne: true } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Match.distinct('farmerId', { buyerId: userId }),
    Match.countDocuments({ buyerId: userId, status: 'accepted' }),
    Order.countDocuments({ buyerId: userId, status: 'delivered' }),
    orderCounts('buyerId', userId),
  ]);

  const requirements = { open: 0, matched: 0, fulfilled: 0, expired: 0 } as Record<
    string,
    number
  >;
  for (const row of requirementRows) requirements[row._id] = row.count;

  const posted = requirementRows.reduce((sum, row) => sum + row.count, 0);

  return {
    role: 'buyer',
    funnel: {
      listed: posted,
      connected: matchedFarmers.length,
      agreed: agreedMatches,
      completed: deliveredOrders,
    } satisfies FarmerFunnel,
    requirements,
    deals,
    spend: await revenueFor('buyerId', userId),
  };
}

/**
 * An admin has no trading activity of their own, so a funnel would be
 * meaningless. They get platform-wide totals instead.
 */
async function adminSummary(): Promise<AdminSummary> {
  const [farmers, buyers, listings, orders] = await Promise.all([
    User.countDocuments({ role: 'farmer', isActive: true }),
    User.countDocuments({ role: 'buyer', isActive: true }),
    CropListing.countDocuments({ isDeleted: { $ne: true }, status: 'active' }),
    Order.countDocuments({}),
  ]);

  return {
    role: 'admin',
    platform: { farmers, buyers, activeListings: listings, orders },
  };
}

/**
 * Overloads let a caller who knows the role statically (the controller reading
 * a verified token, or a test) get the exact shape back rather than a union.
 */
export async function getDashboardSummary(
  userId: string,
  role: 'farmer'
): Promise<FarmerSummary>;
export async function getDashboardSummary(
  userId: string,
  role: 'buyer'
): Promise<BuyerSummary>;
export async function getDashboardSummary(
  userId: string,
  role: 'admin'
): Promise<AdminSummary>;
export async function getDashboardSummary(
  userId: string,
  role: UserRole
): Promise<DashboardSummary>;
export async function getDashboardSummary(
  userId: string,
  role: UserRole
): Promise<DashboardSummary> {
  const id = new Types.ObjectId(userId);

  if (role === 'admin') return adminSummary();
  if (role === 'farmer') return farmerSummary(id);
  return buyerSummary(id);
}
