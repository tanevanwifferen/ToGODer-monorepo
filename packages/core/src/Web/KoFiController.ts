import { Express } from 'express';
import { kofi } from '@ko-fi/express';
import { DonationData } from '@ko-fi/types';
import { getDbContext } from '../Entity/Database';
import { Decimal } from '@prisma/client/runtime/binary';
import { donationTag } from '../Api/BillingApi';
import { getAnalytics } from '../Analytics/AnalyticsService';

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
    },
    verificationToken: process.env.KOFI_WEBHOOK_TOKEN!,
  });
}
