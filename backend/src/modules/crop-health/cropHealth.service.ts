import { Types } from 'mongoose';
import { CropHealthScan, ICropHealthScan, ScanSeverity } from './cropHealth.model';
import { ScanListQuery } from './cropHealth.schema';
import { diagnoseCropImage } from '../../services/vision.service';
import { saveScanImage } from '../../services/storage.service';

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

export interface UploadedImage {
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}

export interface DiagnoseResult {
  scanId: string;
  disease: string;
  confidence: number;
  severity: ScanSeverity;
  treatmentSteps: string[];
  preventionTips: string[];
  alternatives: { disease: string; confidence: number }[];
}

export async function diagnose(
  userId: Types.ObjectId | string,
  image: UploadedImage,
  cropName?: string
): Promise<DiagnoseResult> {
  const diagnosis = await diagnoseCropImage({
    buffer: image.buffer,
    mimeType: image.mimeType,
    cropName,
  });

  // The image is persisted to the storage driver and only its key/URL land in
  // MongoDB; the raw bytes never enter a document.
  const stored = await saveScanImage(image.buffer, image.mimeType);

  const scan = await CropHealthScan.create({
    farmerId: toObjectId(userId),
    cropName,
    imageUrl: stored.url,
    imageProviderId: stored.key,
    disease: diagnosis.disease,
    confidence: diagnosis.confidence,
    severity: diagnosis.severity,
    treatmentSteps: diagnosis.treatmentSteps,
    preventionTips: diagnosis.preventionTips,
    alternatives: diagnosis.alternatives,
  });

  return {
    scanId: String(scan._id),
    disease: scan.disease,
    confidence: scan.confidence,
    severity: scan.severity,
    treatmentSteps: scan.treatmentSteps,
    preventionTips: scan.preventionTips,
    alternatives: scan.alternatives,
  };
}

export async function listScans(
  userId: Types.ObjectId | string,
  query: ScanListQuery
): Promise<ICropHealthScan[]> {
  const filter: Record<string, unknown> = { farmerId: toObjectId(userId) };
  if (query.unresolvedOnly) filter.resolvedAt = null;

  const limit = Math.max(1, Math.min(50, query.limit ?? 20));

  return CropHealthScan.find(filter).sort({ createdAt: -1 }).limit(limit);
}

export async function getScan(
  userId: Types.ObjectId | string,
  scanId: string
): Promise<ICropHealthScan | null> {
  return CropHealthScan.findOne({
    _id: toObjectId(scanId),
    farmerId: toObjectId(userId),
  });
}

export async function resolveScan(
  userId: Types.ObjectId | string,
  scanId: string
): Promise<ICropHealthScan> {
  const scan = await CropHealthScan.findOneAndUpdate(
    { _id: toObjectId(scanId), farmerId: toObjectId(userId) },
    { $set: { resolvedAt: new Date() } },
    { new: true }
  );

  if (!scan) {
    throw createError('Scan not found', 404, 'SCAN_NOT_FOUND');
  }

  return scan;
}
