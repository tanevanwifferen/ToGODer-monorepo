import { getDbContext } from '../Entity/Database';
import { Decimal } from '@prisma/client/runtime/binary';
import crypto from 'node:crypto';

// ── Commission rates ──────────────────────────────────────────────
const PLATFORM_RATE = 0.05; // 5% to Tane/fund
const L1_RATE = 0.02;       // 2% to direct referrer
const L2_RATE = 0.03;       // 3% to upstream (referrer's referrer)

const PLATFORM_EMAIL = process.env.PLATFORM_CREDITS_EMAIL || process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || 'tanevanwifferen@gmail.com';

/** Generate a unique short referral code (8 alphanumeric chars). */
export function generateReferralCode(): string {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}

/** Ensure a user has a referral code; returns the code. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const db = getDbContext();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  if (user.referralCode) return user.referralCode;

  // Generate a unique code (retry on collision — extremely unlikely)
  let code = generateReferralCode();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await db.user.findUnique({ where: { referralCode: code } });
    if (!existing) break;
    code = generateReferralCode();
    attempts++;
  }

  await db.user.update({ where: { id: userId }, data: { referralCode: code } });
  return code;
}

/** Resolve a referral code to a user. */
export async function resolveReferralCode(code: string) {
  const db = getDbContext();
  return db.user.findUnique({ where: { referralCode: code } });
}

/**
 * Create a level-1 referral record when a new user signs up with a referral cookie.
 * Deduplicates: if the referred user already has a record, skip.
 */
export async function recordReferral(referrerCode: string, referredUserId: string): Promise<void> {
  const db = getDbContext();

  const referrer = await resolveReferralCode(referrerCode);
  if (!referrer) return; // invalid code — ignore silently
  if (referrer.id === referredUserId) return; // can't refer yourself

  // Dedup: check if this referred user already has a referral record
  const existing = await db.referral.findUnique({ where: { referredUserId } });
  if (existing) return;

  // Create level-1 referral
  await db.referral.create({
    data: {
      referrerCode,
      referrerUserId: referrer.id,
      referredUserId,
      level: 1,
      credited: false,
    },
  });

  // Also create a level-2 referral if the referrer was themselves referred
  const upstream = await db.referral.findUnique({ where: { referredUserId: referrer.id } });
  if (upstream) {
    await db.referral.create({
      data: {
        referrerCode: upstream.referrerCode,
        referrerUserId: upstream.referrerUserId,
        referredUserId,
        level: 2,
        credited: false,
      },
    });
  }
}

/**
 * Compute and credit commissions when a referred user makes a payment.
 * Called on supporter signup / donation.
 * - 5% to platform
 * - 2% to L1 (direct referrer)
 * - 3% to L2 (upstream referrer, if exists)
 * Deduplication: only credits once per referral record (credited flag).
 */
export async function creditReferralCommissions(
  referredUserId: string,
  amount: Decimal,
): Promise<{ platform: Decimal; l1: Decimal; l2: Decimal }> {
  const db = getDbContext();
  const zero = new Decimal(0);

  // Find all uncredited referrals for this user
  const referrals = await db.referral.findMany({
    where: { referredUserId, credited: false },
    orderBy: { level: 'asc' },
  });

  if (referrals.length === 0) return { platform: zero, l1: zero, l2: zero };

  const l1 = referrals.find((r) => r.level === 1);
  const l2 = referrals.find((r) => r.level === 2);

  const platformCut = amount.mul(PLATFORM_RATE);
  const l1Cut = l1 ? amount.mul(L1_RATE) : zero;
  const l2Cut = l2 ? amount.mul(L2_RATE) : zero;

  // Credit platform
  await creditUserByEmail(PLATFORM_EMAIL, platformCut);

  // Credit L1 referrer
  if (l1 && l1Cut.greaterThan(0)) {
    await creditUserBalance(l1.referrerUserId, l1Cut);
    await db.referral.update({ where: { id: l1.id }, data: { credited: true } });
  }

  // Credit L2 referrer
  if (l2 && l2Cut.greaterThan(0)) {
    await creditUserBalance(l2.referrerUserId, l2Cut);
    await db.referral.update({ where: { id: l2.id }, data: { credited: true } });
  }

  return { platform: platformCut, l1: l1Cut, l2: l2Cut };
}

/** Add credits to a user's balance by userId. */
async function creditUserBalance(
  userId: string,
  amount: Decimal,
  source: string = 'referral',
): Promise<void> {
  const db = getDbContext();
  await db.user.update({
    where: { id: userId },
    data: { creditsBalance: { increment: amount } },
  });
  await db.creditTransaction.create({
    data: {
      userId,
      amount,
      type: 'credit',
      source,
      description: `${source} commission`,
    },
  });
}

/** Add credits to a user found by email. */
async function creditUserByEmail(email: string, amount: Decimal): Promise<void> {
  const db = getDbContext();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return; // platform user may not exist as a real user — that's fine
  await db.user.update({
    where: { id: user.id },
    data: { creditsBalance: { increment: amount } },
  });
  await db.creditTransaction.create({
    data: {
      userId: user.id,
      amount,
      type: 'credit',
      source: 'referral',
      description: 'Platform commission',
    },
  });
}

/**
 * Aggregate, non-identifying referral stats for a single referrer.
 * Returns only counts and totals — never the identities or emails of
 * individual referred users.
 */
export async function getReferralSummary(userId: string): Promise<{
  totalSignups: number;
  totalReferralRewards: Decimal;
}> {
  const db = getDbContext();

  const totalSignups = await db.referral.count({
    where: { referrerUserId: userId, level: 1 },
  });

  const rewardAgg = await db.creditTransaction.aggregate({
    where: { userId, source: 'referral', type: 'credit' },
    _sum: { amount: true },
  });

  return {
    totalSignups,
    totalReferralRewards: rewardAgg._sum.amount ?? new Decimal(0),
  };
}

// ── Admin helpers ─────────────────────────────────────────────────

export interface ReferralTreeNode {
  userId: string;
  email: string;
  referralCode: string | null;
  creditsBalance: Decimal;
  directReferrals: ReferralTreeNode[];
  totalAwarded: Decimal;
  level: number;
}

/**
 * Build the full referral tree recursively from a root user.
 * Used by /admin/referrals.
 */
export async function buildReferralTree(rootUserId: string): Promise<ReferralTreeNode | null> {
  const db = getDbContext();
  const user = await db.user.findUnique({ where: { id: rootUserId } });
  if (!user) return null;

  const directRefs = await db.referral.findMany({
    where: { referrerUserId: rootUserId, level: 1 },
  });

  const children: ReferralTreeNode[] = [];
  for (const ref of directRefs) {
    const child = await buildReferralTree(ref.referredUserId);
    if (child) children.push(child);
  }

  return {
    userId: user.id,
    email: user.email,
    referralCode: user.referralCode,
    creditsBalance: user.creditsBalance as Decimal,
    directReferrals: children,
    totalAwarded: new Decimal(0), // computed below
    level: 0,
  };
}

/** Get referral stats for admin dashboard. */
export async function getReferralStats() {
  const db = getDbContext();

  const totalRefs = await db.referral.count();
  const creditedRefs = await db.referral.count({ where: { credited: true } });
  const l1Count = await db.referral.count({ where: { level: 1 } });
  const l2Count = await db.referral.count({ where: { level: 2 } });

  // All users with referral records
  const allRefs = await db.referral.findMany({
    include: {
      referrer: { select: { email: true } },
      referred: { select: { email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return { totalRefs, creditedRefs, l1Count, l2Count, referrals: allRefs };
}
