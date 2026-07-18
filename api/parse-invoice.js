// POST /api/parse-invoice
//
// Body:
// {
//   "mediaType": "application/pdf" | "image/jpeg" | "image/png" | "text/csv",
//   "data": "<base64>",     // for PDF/image
//   "csvText": "..."        // for CSV, sent as plain text instead of base64
// }
//
// Extracts structured line items from a vendor invoice (Sysco, US Foods,
// Southern Glazer's, or any other vendor) so they can be reviewed and
// imported into the Item Master. This does NOT write to the database --
// it returns extracted items for the frontend's existing invoice-import
// review flow to confirm before saving.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

const EXTRACTION_SYSTEM_PROMPT = `You extract structured line items from foodservice vendor invoices (Sysco, US Foods, Southern Glazer's, or similar distributors). For every distinct product line on the invoice, extract:

- description (product name as printed)
- vendor (the distributor name, e.g. "SYSCO NASHVILLE")
- vendorItemCode (the vendor's item/SKU number)
- unitPrice (numeric, no currency symbol)
- packSize (e.g. "12 / 6 CT")
- orderUom (e.g. "CS", "EA", "BX")
- categoryId (if shown)
- glAccount (if shown)

Ignore subtotals, tax lines, shipping charges, and anything that is not an actual product line.

Respond with ONLY valid JSON, no other text, in this exact shape:
{
  "items": [
    {
      "description": "string",
      "vendor": "string",
      "vendorItemCode": "string",
      "unitPrice": number,
      "packSize": "string",
      "orderUom": "string",
      "categoryId": "string or null",
      "glAccount": "string or null"
    }
  ]
}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { mediaType, data, csvText } = req.body || {};

    let userContent;
    if (csvText) {
      userContent = [
        { type: 'text', text: `Here is the invoice as CSV text:\n\n${csvText}\n\nExtract the line items per your instructions.` },
      ];
    } else if (data && mediaType) {
      const isPdf = mediaType === 'application/pdf';
      userContent = [
        {
          type: isPdf ? 'document' : 'image',
          source: { type: 'base64', media_type: mediaType, data },
        },
        { type: 'text', text: 'Extract the invoice line items per your instructions.' },
      ];
    } else {
      res.status(400).json({ error: 'Provide either csvText, or both mediaType and data' });
      return;
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: 'Claude API request failed', details: errText });
      return;
    }

    const result = await response.json();
    const textBlock = (result.content || []).find((c) => c.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: 'No text response from Claude' });
      return;
    }

    let parsed;
    try {
      const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      res.status(502).json({ error: 'Could not parse Claude response as JSON', raw: textBlock.text });
      return;
    }

    res.status(200).json({ items: parsed.items || [], model: MODEL });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
};
