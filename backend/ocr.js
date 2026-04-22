const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic();

function getVisionClient() {
  const vision = require('@google-cloud/vision');
  return new vision.ImageAnnotatorClient();
}

async function extractTextFromImage(imagePath) {
  const client = getVisionClient();
  const [result] = await client.textDetection(imagePath);
  if (!result.fullTextAnnotation) return '';
  return result.fullTextAnnotation.text;
}

async function parseWithClaude(rawText) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Parse this daily sales report text and return ONLY a JSON object with keys: cash_sales, card_sales, total_sales, notes. Use 0 for missing numbers and "" for missing notes. No explanation, just JSON.\n\nTEXT:\n${rawText}`,
    }],
  });
  const raw = message.content[0].text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { cash_sales: 0, card_sales: 0, total_sales: 0, notes: '' };
  }
}

async function processManagerReport(imagePath) {
  const text = await extractTextFromImage(imagePath);
  return parseWithClaude(text);
}

module.exports = { processManagerReport, parseWithClaude };
