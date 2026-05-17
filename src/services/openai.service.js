const OpenAI = require('openai');
const { getEnv } = require('../config/env.config');
const { ROLE_PERMISSIONS } = require('../config/roles.config');

let openaiClient = null;

const getOpenAIClient = () => {
  if (!openaiClient) {
    const apiKey = getEnv('OPENAI_API_KEY');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
};

class OpenAIService {

  buildSystemPrompt(role, dbContext) {
    const roleConfig = ROLE_PERMISSIONS[role];
    if (!roleConfig) {
      throw new Error(`Invalid role: ${role}`);
    }

    const today = new Date().toISOString().split('T')[0];
    const contextJson = JSON.stringify(dbContext, null, 2);

    return `${roleConfig.systemPrompt}

Today's date: ${today}

Available data context:
${contextJson}

Important rules:
- Base all answers on the provided data above
- Never fabricate information not present in the data
- Use bullet points for multi-item responses
- If data is insufficient, clearly state what information is available
- Keep responses concise but informative (max 500 words)`;
  }

  async chat(role, userMessage, conversationHistory, dbContext) {
    try {
      const client = getOpenAIClient();

      const systemPrompt = this.buildSystemPrompt(role, dbContext);

      const history = conversationHistory.slice(-20).map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ];

      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 1000,
        temperature: 0.4,
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI service error:', error);
      const message = error.message?.includes('quota') || error.message?.includes('insufficient_quota')
        ? 'AI service quota exceeded. Please try again later.'
        : 'AI service unavailable';
      throw new Error(message);
    }
  }
}

module.exports = new OpenAIService();
