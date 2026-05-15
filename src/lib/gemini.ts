import { GoogleGenAI, Type } from "@google/genai";

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (retries > 0 && e?.message?.includes('429')) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw e;
  }
}

export async function analyzeMessage(text: string, role: 'user' | 'partner', userTraits?: any, history?: { role: string, content: string }[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is missing. Please check your AI Studio secrets settings.');
    return {
      emotion: '분석 불가',
      intent: 'API 키 누락',
      advice: '설정에서 Gemini API 키를 확인해주세요.',
      mistakeFilter: ''
    };
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const contextText = history && history.length > 0 
    ? `\nContext (previous messages):\n${history.slice(-10).map(m => `${m.role === 'user' ? 'Me' : 'Partner'}: ${m.content}`).join('\n')}`
    : '';

  const prompt = `
    Analyze the following message in a communication context.${contextText}
    Current Speaker: ${role === 'user' ? 'Main User' : 'Partner'}
    Current Message: "${text}"
    User Background Traits: ${userTraits ? JSON.stringify(userTraits) : 'None'}

    **중요: 모든 응답은 반드시 한국어로 작성해야 합니다.**
    /**
     * Provide detailed numerical analysis (0-100):
     * 1. empathyScore: 얼마나 공감하고 배려했는지
     * 2. clarityScore: 의도가 얼마나 명확하게 전달되었는지
     * 3. resilienceScore: 갈등 상황에서 얼마나 유연하게 대처했는지
     */
    Provide:
    1. emotion: 감지된 주요 감정 (한국어로 작성)
    2. intent: 화자가 실제로 전달하려는 의도나 속마음 (한국어로 작성)
    3. advice: 건강한 대화를 유지하기 위한 조언이나 해석 (한국어로 작성)
    4. mistakeFilter: 사용자의 답변일 경우, 갈등을 유발할 수 있는 표현이나 실수 지적 (한국어로 작성)
    5. empathyScore: 공감 수치 (0-100 정수)
    6. clarityScore: 명확성 수치 (0-100 정수)
    7. resilienceScore: 유연성 수치 (0-100 정수)

    Return as JSON.
  `;

  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            emotion: { type: Type.STRING },
            intent: { type: Type.STRING },
            advice: { type: Type.STRING },
            mistakeFilter: { type: Type.STRING },
            empathyScore: { type: Type.NUMBER },
            clarityScore: { type: Type.NUMBER },
            resilienceScore: { type: Type.NUMBER }
          },
          required: ["emotion", "intent", "advice", "mistakeFilter", "empathyScore", "clarityScore", "resilienceScore"]
        }
      }
    }));

    return JSON.parse(response.text || '{}');
  } catch (e: any) {
    console.error('Failed to analyze message with Gemini:', e);
    if (e?.message?.includes('429') || e?.message?.includes('RESOURCE_EXHAUSTED')) {
      return {
        emotion: '분석 지연',
        intent: '요청 한도 초과',
        advice: '현재 요청이 많아 분석이 지연되고 있습니다. 잠시 후 자동으로 다시 시도합니다.',
        mistakeFilter: ''
      };
    }
    return {
      emotion: '알 수 없음',
      intent: '분석 실패',
      advice: '분석 중 오류가 발생했습니다. 다시 시도해주세요.',
      mistakeFilter: ''
    };
  }
}

export async function getTraitAnalysis(messages: { role: string, content: string }[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
    Based on the following conversation history, analyze the user's communication traits and potential attachment style (Avoidant, Anxious, Secure, Disorganized).
    
    Conversation:
    ${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

    **중요: 모든 분석 결과는 반드시 한국어로 작성해야 합니다.**
    Return:
    1. attachmentStyle: 애착 유형 (회피형, 불안형, 안정형, 공포회피형 등 한국어로 작성)
    2. communicationStyle: 대화 스타일 요약 (한국어로 작성)
    3. triggers: 주요 갈등 유발 요인 리스트 (한국어로 작성)
    4. advice: 장기적인 관계 성장을 위한 조언 (한국어로 작성)
    5. stats: 평균 수치 분석 (0-100)
       - empathy: 평균 공감도
       - clarity: 평균 명확성
       - resilience: 평균 유연성

    Return as JSON.
  `;

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          attachmentStyle: { type: Type.STRING },
          communicationStyle: { type: Type.STRING },
          triggers: { type: Type.ARRAY, items: { type: Type.STRING } },
          advice: { type: Type.STRING },
          stats: {
            type: Type.OBJECT,
            properties: {
              empathy: { type: Type.NUMBER },
              clarity: { type: Type.NUMBER },
              resilience: { type: Type.NUMBER }
            }
          }
        },
        required: ["attachmentStyle", "communicationStyle", "triggers", "advice", "stats"]
      }
    }
  }));

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error('Failed to parse Gemini trait response:', response.text);
    return {
      attachmentStyle: '알 수 없음',
      communicationStyle: '데이터 부족',
      triggers: [],
      advice: '더 많은 대화 데이터가 필요합니다.'
    };
  }
}

export async function simulateResponse(history: { role: 'user' | 'partner', content: string }[], newMessage: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { reply: "API 키가 없습니다.", reasoning: "분석 실패" };

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
    Based on the previous conversation history, how would the partner realistically respond to this NEW modified message?
    
    History:
    ${history.map(m => `${m.role === 'user' ? 'Me' : 'Partner'}: ${m.content}`).join('\n')}
    
    New Modified Message from Me: "${newMessage}"
    
    **중요: 상대방의 답변(reply)과 분석(reasoning)은 반드시 한국어로 작성해야 합니다.**
    상대방의 말투와 성격을 유지하면서, 수정된 메시지에 대한 현실적인 반응을 보여주세요.

    Return as JSON.
  `;

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING },
          reasoning: { type: Type.STRING }
        },
        required: ["reply", "reasoning"]
      }
    }
  }));

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error('Failed to parse simulation response:', response.text);
    return {
      reply: "대화가 이어지지 않습니다.",
      reasoning: "분석 오류가 발생했습니다."
    };
  }
}

export async function getQuickTip(messages: { role: string, content: string }[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return '대화를 이어가 보세요!';

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
    Analyze this ongoing conversation and provide ONE short, friendly, and actionable tip for the next response in Korean.
    The tip should focus on empathy, clarity, or maintaining a healthy relationship.
    
    Conversation:
    ${messages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}
    
    Response must be a single sentence in Korean, e.g., "상대방의 기분을 직접적으로 물어보는 질문을 추가해보면 어떨까요?"
  `;

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      temperature: 0.7,
    }
  }));

  return response.text || '대화를 이어가 보세요!';
}

export async function generateConversationTitle(messages: { role: string, content: string }[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
    Based on the following conversation snippets, generate a very short (max 15 characters), safe, and descriptive title in Korean.
    Avoid generic titles like "대화 분석". Focus on the topic or participants.
    
    Messages:
    ${messages.slice(0, 3).map(m => `${m.role}: ${m.content}`).join('\n')}
    
    Return only the title string in Korean.
  `;

  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        maxOutputTokens: 20,
        temperature: 0.5,
      }
    }));
    return response.text.trim().replace(/^"|"$/g, '') || null;
  } catch (e) {
    console.error('Failed to generate title:', e);
    return null;
  }
}
