import api from './api';
import type { FullProfile, OnboardingData, ProfileUpdateRequest } from '../types';

export interface OnboardingResponse {
  message: string;
  success: boolean;
  onboarding_complete: boolean;
}

/**
 * Fetch the authenticated user's full profile and onboarding status.
 */
export async function getProfile(): Promise<FullProfile> {
  const res = await api.get<FullProfile>('/api/profile');
  return res.data;
}

/**
 * Submit the onboarding wizard data to persist profile, goals, equipment,
 * schedule, nutrition preferences, and generate starter plans.
 */
export async function completeOnboarding(data: OnboardingData): Promise<OnboardingResponse> {
  const res = await api.post<OnboardingResponse>('/api/onboarding/complete', data);
  return res.data;
}

/**
 * Partially update the authenticated user's profile information.
 */
export async function updateProfile(data: ProfileUpdateRequest): Promise<FullProfile> {
  const res = await api.patch<FullProfile>('/api/profile', data);
  return res.data;
}
