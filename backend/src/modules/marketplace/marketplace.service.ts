import { CropListing, ICropListing } from '../crop-listing/cropListing.model';
import {
  BuyerRequirement,
  IBuyerRequirement,
} from '../buyer-requirements/buyerRequirement.model';
import { MarketplaceQuery } from './marketplace.schema';
import { UserRole } from '../users/user.model';

interface CounterpartyInfo {
  name?: string;
  phone?: string;
}

export interface CombinedMarketplaceItem {
  id: string;
  type: 'listing' | 'requirement';
  cropName: string;
  quantityKg: number;
  pricePerKg: number;
  qualityGrade?: 'A' | 'B' | 'C' | string;
  location?: {
    state?: string;
    district?: string;
    address?: string;
    pincode?: string;
  };
  counterparty?: CounterpartyInfo;
  createdAt?: Date;
  status: string;
  dateField?: Date;
  listing?: Omit<ICropListing, '_id'> & { _id: string };
  requirement?: Omit<IBuyerRequirement, '_id'> & { _id: string };
}

const BASE_QTY_UNIT = 'kg';
const BASE_PRICE_UNIT = 'INR/kg';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildListingFilter(query: MarketplaceQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    status: 'active',
    isDeleted: { $ne: true },
  };

  if (query.cropName) {
    filter.cropName = {
      $regex: escapeRegex(query.cropName.trim()),
      $options: 'i',
    };
  }

  if (query.state) {
    filter['location.state'] = {
      $regex: escapeRegex(query.state.trim()),
      $options: 'i',
    };
    if (query.district) {
      filter['location.district'] = {
        $regex: escapeRegex(query.district.trim()),
        $options: 'i',
      };
    }
  }

  if (query.qualityGrade) {
    filter.qualityGrade = query.qualityGrade;
  }

  const priceRange: Record<string, number> = {};
  if (query.minPrice !== undefined) priceRange.$gte = Number(query.minPrice);
  if (query.maxPrice !== undefined) priceRange.$lte = Number(query.maxPrice);
  if (Object.keys(priceRange).length > 0) {
    filter.expectedPricePerKg = priceRange;
  }

  return filter;
}

function buildRequirementFilter(
  query: MarketplaceQuery
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    status: 'open',
    isDeleted: { $ne: true },
  };

  if (query.cropName) {
    filter.cropName = {
      $regex: escapeRegex(query.cropName.trim()),
      $options: 'i',
    };
  }

  if (query.state) {
    filter['location.state'] = {
      $regex: escapeRegex(query.state.trim()),
      $options: 'i',
    };
    if (query.district) {
      filter['location.district'] = {
        $regex: escapeRegex(query.district.trim()),
        $options: 'i',
      };
    }
  }

  if (query.qualityGrade) {
    filter.qualityGrade = query.qualityGrade;
  }

  const priceRange: Record<string, number> = {};
  if (query.minPrice !== undefined) priceRange.$gte = Number(query.minPrice);
  if (query.maxPrice !== undefined) priceRange.$lte = Number(query.maxPrice);
  if (Object.keys(priceRange).length > 0) {
    filter.maxPricePerKg = priceRange;
  }

  return filter;
}

function listingSortClause(
  sort: MarketplaceQuery['sort']
): Record<string, 1 | -1> {
  switch (sort) {
    case 'priceAsc':
      return { expectedPricePerKg: 1 };
    case 'priceDesc':
      return { expectedPricePerKg: -1 };
    case 'newest':
    default:
      return { createdAt: -1 };
  }
}

function requirementSortClause(
  sort: MarketplaceQuery['sort']
): Record<string, 1 | -1> {
  switch (sort) {
    case 'priceAsc':
      return { maxPricePerKg: 1 };
    case 'priceDesc':
      return { maxPricePerKg: -1 };
    case 'newest':
    default:
      return { createdAt: -1 };
  }
}

function combinedSortClause(sort: MarketplaceQuery['sort']) {
  switch (sort) {
    case 'priceAsc':
      return (a: CombinedMarketplaceItem, b: CombinedMarketplaceItem) =>
        a.pricePerKg - b.pricePerKg;
    case 'priceDesc':
      return (a: CombinedMarketplaceItem, b: CombinedMarketplaceItem) =>
        b.pricePerKg - a.pricePerKg;
    case 'newest':
    default:
      return (a: CombinedMarketplaceItem, b: CombinedMarketplaceItem) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      };
  }
}

type PopulatedFarmer = { _id?: unknown; fullName?: string; phone?: string };
type PopulatedBuyer = { _id?: unknown; fullName?: string; phone?: string };

function mapListing(
  l: ICropListing & { _id: unknown; farmerId?: unknown | PopulatedFarmer }
): CombinedMarketplaceItem {
  const farmer = (typeof l.farmerId === 'object' && l.farmerId !== null && '_id' in (l.farmerId as object)
    ? (l.farmerId as PopulatedFarmer)
    : undefined);
  return {
    id: String(l._id),
    type: 'listing',
    cropName: l.cropName,
    quantityKg: l.quantityKg,
    pricePerKg: l.expectedPricePerKg,
    qualityGrade: l.qualityGrade,
    location: l.location,
    counterparty: farmer
      ? {
          name: farmer.fullName,
          phone: farmer.phone,
        }
      : undefined,
    createdAt: l.createdAt,
    status: l.status,
    dateField: l.harvestDate,
    listing: { ...(l as unknown as ICropListing), _id: String(l._id) },
  };
}

function mapRequirement(
  r: IBuyerRequirement & { _id: unknown; buyerId?: unknown | PopulatedBuyer }
): CombinedMarketplaceItem {
  const buyer = (typeof r.buyerId === 'object' && r.buyerId !== null && '_id' in (r.buyerId as object)
    ? (r.buyerId as PopulatedBuyer)
    : undefined);
  return {
    id: String(r._id),
    type: 'requirement',
    cropName: r.cropName,
    quantityKg: r.quantityKg,
    pricePerKg: r.maxPricePerKg,
    qualityGrade: r.qualityGrade,
    location: r.location,
    counterparty: buyer
      ? {
          name: buyer.fullName,
          phone: buyer.phone,
        }
      : undefined,
    createdAt: r.createdAt,
    status: r.status,
    dateField: r.requiredByDate,
    requirement: { ...(r as unknown as IBuyerRequirement), _id: String(r._id) },
  };
}

export async function browseMarketplace(query: MarketplaceQuery): Promise<{
  listingsCount: number;
  requirementsCount: number;
  count: number;
  items: CombinedMarketplaceItem[];
}> {
  const limitEachSide = Math.max(query.limit ?? 40, 1);
  const type = query.type ?? 'all';
  const includeListings = type === 'all' || type === 'listing';
  const includeRequirements = type === 'all' || type === 'requirement';

  const listingFilter = includeListings ? buildListingFilter(query) : null;
  const reqFilter = includeRequirements
    ? buildRequirementFilter(query)
    : null;

  const listingPromise = listingFilter
    ? (CropListing.find(listingFilter)
        .populate('farmerId', 'fullName phone -_id')
        .sort(listingSortClause(query.sort))
        .limit(limitEachSide) as unknown as Promise<
        Array<
          ICropListing & {
            _id: unknown;
            farmerId?: unknown | PopulatedFarmer;
          }
        >
      >)
    : Promise.resolve([]);

  const requirementPromise = reqFilter
    ? (BuyerRequirement.find(reqFilter)
        .populate('buyerId', 'fullName phone -_id')
        .sort(requirementSortClause(query.sort))
        .limit(limitEachSide) as unknown as Promise<
        Array<
          IBuyerRequirement & {
            _id: unknown;
            buyerId?: unknown | PopulatedBuyer;
          }
        >
      >)
    : Promise.resolve([]);

  const [rawListings, rawRequirements] = await Promise.all([
    listingPromise,
    requirementPromise,
  ]);

  const mappedListings = rawListings.map(mapListing);
  const mappedRequirements = rawRequirements.map(mapRequirement);

  const combined: CombinedMarketplaceItem[] = [
    ...mappedListings,
    ...mappedRequirements,
  ].sort(combinedSortClause(query.sort));

  const finalLimit = Math.max(query.limit ?? 40, 1);
  const truncated = combined.slice(0, finalLimit);

  return {
    listingsCount: rawListings.length,
    requirementsCount: rawRequirements.length,
    count: truncated.length,
    items: truncated,
  };
}

export { BASE_QTY_UNIT, BASE_PRICE_UNIT };
