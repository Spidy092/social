
async function generateCaptions(originalCaption, platforms) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable is missing.');
  }

  const systemPrompt = `You are an expert social media copywriter. You will be provided with a base caption and a list of target platforms.
Provide an optimized, platform-specific caption for each requested platform in JSON format.
Adhere strictly to the requested platforms and use the exact platform name in lowercase as the JSON key.
Constraints per platform:
- instagram: Engaging, uses relevant emojis, max 30 hashtags.
- facebook: Conversational, encourages interaction, fewer hashtags.
- linkedin: Professional, value-driven, 3-5 appropriate hashtags.
- youtube: Detailed description, includes call to action (subscribe/like).

RESPOND ONLY WITH VALID JSON. Do not include markdown code block backticks (e.g. \`\`\`json). Just the raw JSON object.
Example: {"instagram": "...", "facebook": "..."}`;

  const userPrompt = `Base caption:\n${originalCaption}\n\nTarget platforms:\n${platforms.join(', ')}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'Social Poster App'
    },
    body: JSON.stringify({
      model: "stepfun/step-3.5-flash:free",
      response_format: { type: "json_object" }, // Ensures better JSON generation if supported
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenRouter API Error:', response.status, errorText);
    throw new Error('Caption generation failed');
  }

  const data = await response.json();
  let content = data.choices[0].message.content.trim();
  
  // Strip markdown backticks if present
  if (content.startsWith('\`\`\`json')) {
    content = content.replace(/^\`\`\`json/i, '').replace(/\`\`\`$/, '').trim();
  } else if (content.startsWith('\`\`\`')) {
    content = content.replace(/^\`\`\`/i, '').replace(/\`\`\`$/, '').trim();
  }

  try {
    const parsed = JSON.parse(content);
    return parsed;
  } catch (parseError) {
    console.error('Failed to parse OpenRouter JSON response:', content);
    throw new Error('Caption generation failed');
  }
}

module.exports = { generateCaptions };
