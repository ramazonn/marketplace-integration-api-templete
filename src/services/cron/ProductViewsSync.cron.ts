import { Redis, ProductsModel } from '@ubaytools/core';
import { Types } from 'mongoose';

export class ProductViewsSyncCron {
  static async run(): Promise<void> {
    console.log('[CRON][PRODUCT_VIEWS] Started');

    const redis = await Redis.getInstance();
    const client = redis.getClient();

    let processed = 0;
    let updated = 0;
    let skipped = 0;

    try {
      const keys: string[] = [];

      for await (const key of client.scanIterator({
        MATCH: `${process.env.NODE_ENV}:product:*:viewsCount`,
        COUNT: 1000,
      })) {
        keys.push(key);
      }

      if (!keys.length) {
        console.log('[CRON][PRODUCT_VIEWS] No keys found');
        return;
      }

      const values = await client.mGet(keys);

      const bulkOps: any[] = [];

      for (let i = 0; i < keys.length; i++) {
        processed++;

        const key = keys[i];
        const value = values[i];

        if (!value) {
          skipped++;
          continue;
        }

        const productId = key.split(':')[2];

        if (!Types.ObjectId.isValid(productId)) {
          skipped++;
          continue;
        }

        const count = Number(value);

        if (!count || count <= 0) {
          skipped++;
          continue;
        }

        bulkOps.push({
          updateOne: {
            filter: { _id: new Types.ObjectId(productId) },
            update: [
              {
                $set: {
                  stats: { $ifNull: ['$stats', {}] },
                },
              },
              {
                $set: {
                  'stats.countOfViews': {
                    $add: [{ $ifNull: ['$stats.countOfViews', 0] }, count],
                  },
                },
              },
            ],
          },
        });

        updated++;
      }

      if (bulkOps.length) {
        try {
          await ProductsModel.bulkWrite(bulkOps, { ordered: false });
        } catch (error) {
          console.error('[CRON][PRODUCT_VIEWS] BULK ERROR:', error);
        }
      }

      for (const key of keys) {
        try {
          await client.del(key);
        } catch (error) {
          console.error('[CRON][PRODUCT_VIEWS] DELETE ERROR:', key, error);
        }
      }

      console.log('[CRON][PRODUCT_VIEWS] Completed', {
        processed,
        updated,
        skipped,
      });
    } catch (error) {
      console.error('[CRON][PRODUCT_VIEWS] ERROR', error);
    }
  }
}
