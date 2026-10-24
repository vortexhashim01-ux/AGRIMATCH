import { Types } from 'mongoose';
import { Order, OrderStatus } from './order.model';
import { CreateOrderInput, OrderQuery } from './order.schema';
import { Match } from '../matching/matching.model';
import { CropListing } from '../crop-listing/cropListing.model';
import { dispatchNotification } from '../notifications/notification.service';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

function createError(message: string, statusCode: number, code: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  return err;
}

function toObjectId(id: Types.ObjectId | string): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

/** Terminal states accept no further movement; an order can only move forwards. */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

function participantFilter(userId: Types.ObjectId | string) {
  const id = toObjectId(userId);
  return { $or: [{ farmerId: id }, { buyerId: id }] };
}

export async function createOrder(
  userId: Types.ObjectId | string,
  input: CreateOrderInput
) {
  const match = await Match.findOne({
    _id: toObjectId(input.matchId),
    ...participantFilter(userId),
  });

  if (!match) {
    throw createError('Match not found', 404, 'MATCH_NOT_FOUND');
  }

  if (match.status !== 'accepted') {
    throw createError(
      `A match must be accepted before an order can be created (current status: ${match.status})`,
      409,
      'ORDER_MATCH_NOT_ACCEPTED'
    );
  }

  const existing = await Order.findOne({ matchId: match._id });
  if (existing) {
    throw createError(
      'An order already exists for this match',
      409,
      'ORDER_ALREADY_EXISTS'
    );
  }

  const order = await Order.create({
    matchId: match._id,
    farmerId: match.farmerId,
    buyerId: match.buyerId,
    cropName: match.cropName,
    quantityKg: input.quantityKg,
    agreedPricePerKg: input.agreedPricePerKg,
    deliveryDate: input.deliveryDate,
    status: 'pending',
  });

  await dispatchNotification(
    [match.farmerId, match.buyerId],
    'order:created',
    {
      orderId: order._id?.toString(),
      matchId: match._id?.toString(),
      cropName: order.cropName,
      status: order.status,
    },
    {
      title: 'New order created',
      body: `${order.cropName} · ${order.quantityKg} kg`,
    }
  );

  return order;
}

export async function listOrders(
  userId: Types.ObjectId | string,
  role: 'farmer' | 'buyer' | undefined,
  query: OrderQuery
) {
  const filter: Record<string, unknown> = {};

  if (role) {
    filter[role === 'farmer' ? 'farmerId' : 'buyerId'] = toObjectId(userId);
  } else {
    Object.assign(filter, participantFilter(userId));
  }

  if (query.status) filter.status = query.status;

  const limit = Math.max(1, Math.min(50, query.limit ?? 20));
  return Order.find(filter).sort({ createdAt: -1 }).limit(limit);
}

export async function getOrderById(
  userId: Types.ObjectId | string,
  orderId: Types.ObjectId | string
) {
  return Order.findOne({
    _id: toObjectId(orderId),
    ...participantFilter(userId),
  });
}

export async function changeOrderStatus(
  userId: Types.ObjectId | string,
  orderId: Types.ObjectId | string,
  status: OrderStatus
) {
  const order = await Order.findOne({
    _id: toObjectId(orderId),
    ...participantFilter(userId),
  });

  if (!order) {
    throw createError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  if (!ALLOWED_TRANSITIONS[order.status].includes(status)) {
    throw createError(
      `Cannot move an order from ${order.status} to ${status}`,
      409,
      'ORDER_INVALID_STATE'
    );
  }

  order.status = status;
  if (status === 'cancelled') order.cancelledById = toObjectId(userId);
  await order.save();

  // A delivered order means the crop has left the farm, so the listing must
  // stop being offered to other buyers.
  if (status === 'delivered') {
    const match = await Match.findById(order.matchId).select('cropListingId');
    if (match) {
      await CropListing.updateOne(
        { _id: match.cropListingId, status: 'active' },
        { $set: { status: 'sold' } }
      );
    }
  }

  await dispatchNotification(
    [order.farmerId, order.buyerId],
    'order:status',
    {
      orderId: order._id?.toString(),
      matchId: order.matchId.toString(),
      cropName: order.cropName,
      status: order.status,
    },
    {
      title: 'Order status updated',
      body: `${order.cropName} · ${order.status}`,
    }
  );

  return order;
}
