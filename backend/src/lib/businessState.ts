import { AppDataSource } from '../data-source';
import { BusinessPlatformState } from '../entities';

export async function getBusinessState(businessId: string): Promise<BusinessPlatformState | null> {
  return AppDataSource.getRepository(BusinessPlatformState).findOne({ where: { business_id: businessId } });
}

export async function isBusinessSuspended(businessId: string | null | undefined): Promise<boolean> {
  if (!businessId) return false;
  return (await getBusinessState(businessId))?.status === 'suspended';
}

export async function upsertBusinessState(businessId: string, changes: Partial<BusinessPlatformState>) {
  const repo = AppDataSource.getRepository(BusinessPlatformState);
  const existing = await repo.findOne({ where: { business_id: businessId } });
  const next = repo.merge(
    existing ?? repo.create({ business_id: businessId, status: 'active', plan: 'free', subscription_status: 'trial', feature_flags: {} }),
    { ...changes, updated_at: new Date() },
  );
  return repo.save(next);
}

export const SUSPENDED_RESPONSE = {
  error: 'This business has been suspended. Contact MIA support.',
  code: 'BUSINESS_SUSPENDED',
};
