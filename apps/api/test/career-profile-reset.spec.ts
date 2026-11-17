import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CareerProfileService } from '../src/career-profile/career-profile.service';
import { UpsertProfileDto } from '../src/career-profile/dto/profile.dto';
import { STARTER_PROFILE } from '../src/career-profile/starter-profile';
import { SAMPLE_PROFILE } from '../src/templates/sample-profile';

const u = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };

describe('career profile reset', () => {
  it('starter profile passes the same DTO validation as a normal PUT', async () => {
    expect(await validate(plainToInstance(UpsertProfileDto, STARTER_PROFILE))).toHaveLength(0);
  });

  it('never reuses the fictional template-preview sample profile', () => {
    expect(STARTER_PROFILE.fullName).not.toBe(SAMPLE_PROFILE.fullName);
  });

  it('resets through the same transactional full replace with token-derived identity', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'p1' });
    const svc = new CareerProfileService({} as any);
    svc.upsert = upsert;
    await svc.reset(u);
    expect(upsert).toHaveBeenCalledWith(u, STARTER_PROFILE);
  });
});
