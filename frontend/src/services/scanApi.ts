import api, { getCached } from './api';
import type {
  ScanResult,
  ScanListItem,
  ScanComparison,
  Blueprint,
  BMIResult,
  ScanStartResponse,
} from '../types/scan';

/** Start a new scan session (creates DB record, returns scan_id) */
export async function startScan(): Promise<ScanStartResponse> {
  const res = await api.post('/api/scan/start');
  return res.data;
}

/**
 * Analyze a video blob for the given scan.
 * Sends as multipart/form-data with file and video keys for FastAPI compatibility.
 * allow_demo_fallback=true means server uses simulated pose data if camera quality fails.
 */
export async function analyzeScan(
  scanId: number,
  videoBlob: Blob | null
): Promise<ScanResult> {
  const formData = new FormData();
  formData.append('scan_id', String(scanId));
  formData.append('discard_video', 'true');

  if (videoBlob) {
    const filename = videoBlob.type && videoBlob.type.includes('mp4') ? 'scan.mp4' : 'scan.webm';
    formData.append('file', videoBlob, filename);
    formData.append('video', videoBlob, filename);
  }

  const res = await api.post('/api/scan/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

/** Get the latest completed scan for the current user */
export async function getLatestScan(): Promise<ScanResult | null> {
  try {
    const res = await getCached<ScanResult & { has_scan?: boolean }>('/api/scan/latest');
    if (res.data && res.data.has_scan === false) {
      return null;
    }
    return res.data as ScanResult;
  } catch {
    return null;
  }
}

/** Get scan history list */
export async function getScanHistory(): Promise<ScanListItem[]> {
  const res = await getCached<ScanListItem[]>('/api/scan/history');
  return res.data;
}

/** Get a specific scan by ID */
export async function getScanById(scanId: number): Promise<ScanResult> {
  const res = await getCached<ScanResult>(`/api/scan/${scanId}`);
  return res.data;
}

/** Get comparison between two scans */
export async function getScanComparison(scanId: number): Promise<ScanComparison> {
  const res = await getCached<ScanComparison>(`/api/scan/${scanId}/comparison`);
  return res.data;
}

/** Generate a Fortis Blueprint from the latest scan */
export async function generateBlueprint(): Promise<Blueprint> {
  const res = await api.post('/api/scan/generate-blueprint');
  return res.data;
}

/** Calculate BMI from user-entered height/weight */
export async function calculateBMI(
  heightCm: number,
  weightKg: number
): Promise<BMIResult> {
  const res = await api.post('/api/scan/bmi', {
    height_cm: heightCm,
    weight_kg: weightKg,
  });
  return res.data;
}
