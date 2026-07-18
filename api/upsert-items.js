// POST /api/upsert-items
//
// Body:
// {
//   "items": [
//     { "id": "item_xxx" (optional -- omit to create new), "name": "...", "brand": "...",
//       "vendor": "...", "vendorItemCode": "...", "orderUom": "...", "packSize": "...",
//       "unitPrice": 0, "aliases": ["..."] }
//   ]
// }
//
// Used by: vendor invoice import, manual add/edit in the Catalog screen, and
// the "+ Add to Catalog" action on an unrecognized item during Review.
// Upserts into `items`. If an item has no id, one is generated here.

import { getSupabaseAdmin } from './_lib/supabase.js';
import crypto from 'crypto';

function newItemId() {
  return 'item_' + crypto.randomBytes(6).toString('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items must be a non-empty array' });
      return;
    }

    const supabase = getSupabaseAdmin();

    const rows = items.map((i) => ({
      id: i.id || newItemId(),
      name: i.name,
      brand: i.brand || null,
      vendor: i.vendor || null,
      vendor_item_code: i.vendorItemCode || null,
      order_uom: i.orderUom || null,
      pack_size: i.packSize || null,
      unit_price: i.unitPrice ?? null,
      aliases: JSON.stringify(i.aliases || []),
    }));

    const { data, error } = await supabase
      .from('items')
      .upsert(rows, { onConflict: 'id' })
      .select('id, name');

    if (error) {
      res.status(500).json({ error: 'Failed to save items', details: error.message });
      return;
    }

    res.status(200).json({ items: data });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
};
