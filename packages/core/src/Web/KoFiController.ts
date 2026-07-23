import { Express } from 'express';
import { kofi } from '@ko-fi/express';
import { DonationData } from '@ko-fi/types';
import { getDbContext } from '../Entity/Database';
import { Decimal } from '@prisma/client/runtime/binary';
import { donationTag } from '../Api/BillingApi';
import { getAnalytics } from '../Analytics/AnalyticsService';
import { creditReferralCommissions } from '../Services/ReferralService';

export function setupKoFi(app: Express) {
  kofi(app, {
    async onDonation(donation: DonationData) {
      const db = getDbContext();
      await db.payment.create({
        data: {
          amount: new Decimal(donation.amount),
          user_email:
            donation.message.toLowerCase() == donationTag
              ? donationTag
              : donation.email,
          timestamp: new Date(),
          message: donation.message ?? null,
        },
      });

      // analytics: donation_made event
      const isDonationTag =
        donation.message.toLowerCase() === donationTag;
      getAnalytics().trackEvent('donation_made', {
        userId: isDonationTag ? null : donation.email,
        source: 'kofi',
        props: {
          amount: donation.amount,
          currency: donation.currency,
          isAnonymous: isDonationTag,
        },
      });

      // Referral commissions: if the donor is a registered user with a referral,
      // compute and credit the 5/2/3 split
      if (!isDonationTag) {
        const donor = await db.user.findUnique({ where: { email: donation.email } });
        if (donor) {
          const amount = new Decimal(donation.amount);
          const result = await creditReferralCommissions(donor.id, amount);
          if (result.l1.greaterThan(0) || result.l2.greaterThan(0)) {
            getAnalytics().trackEvent('referral_conversion', {
              userId: donor.id,
              source: 'kofi',
              props: {
                amount: donation.amount,
                platformCut: result.platform.toString(),
                l1Cut: result.l1.toString(),
                l2Cut: result.l2.toString(),
              },
            });
          }
        }
      }
    },
    verificationToken: process.env.KOFI_WEBHOOK_TOKEN!,
  });
}
