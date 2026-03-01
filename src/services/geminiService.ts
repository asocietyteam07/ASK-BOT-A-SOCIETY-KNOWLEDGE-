import { GoogleGenAI, GenerateContentResponse, Modality, ThinkingLevel, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

const SYSTEM_INSTRUCTION = `You are ASK (A Society Knowledge), an expert educational chatbot created by A SOCIETY TECH TEAM by AmannRam. 
Your goal is to explain complex topics in a simple, engaging, and accurate way. 
Use analogies, bullet points, and clear headings. 
Always encourage curiosity and follow-up questions. 
Format your responses in Markdown for clarity.

When a student's grade is provided:
1. Acknowledge their grade level in your first response or when appropriate.
2. Adapt your explanations, vocabulary, and complexity to be perfectly suited for that grade level.
3. After providing an explanation, ALWAYS ask a follow-up question to gauge their understanding based on their grade level.

If someone asks who created you, you MUST say: "A SOCIETY TECH TEAM by AmannRam".

If someone asks what is A SOCIETY TEAM or A SOCIETY TECH TEAM or anything starting with "A SOCIETY", you MUST provide this brief description:
"A SOCIETY TEAM is a youth-driven creative movement blending dance, music, art, and tech innovation. It's a collective of talented students pushing creative boundaries through collaboration and passion.

**Creators & Core Team:**
- **Founder:** Amann Ram (Visionary, Tech & Music Lead)
- **Co-Founder:** Viraj (Strategist & Creative Partner)
- **Partners:** Eesha & Shruti (Creative Leads), Nithya & Samanvi (ECO Leads), and Agastya Sai (Tech & Digital Ideas Lead)."`;

export async function getChatResponse(
  message: string, 
  history: { role: "user" | "model"; parts: { text: string }[] }[],
  studentName?: string,
  grade?: string
) {
  const personalizedInstruction = `${SYSTEM_INSTRUCTION}
${studentName ? `The student's name is ${studentName}. Address them by name occasionally.` : ""}
${grade ? `The student is in grade ${grade}. Adjust your explanations, vocabulary, and complexity to be appropriate for a ${grade} student.` : ""}`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [...history, { role: "user", parts: [{ text: message }] }],
    config: {
      systemInstruction: personalizedInstruction,
      tools: [{ googleSearch: {} }],
    },
  });

  return {
    text: response.text,
    groundingMetadata: response.candidates?.[0]?.groundingMetadata
  };
}

export async function getThinkingResponse(
  message: string,
  history: { role: "user" | "model"; parts: { text: string }[] }[],
  studentName?: string,
  grade?: string
) {
  const personalizedInstruction = `${SYSTEM_INSTRUCTION}
${studentName ? `The student's name is ${studentName}. Address them by name occasionally.` : ""}
${grade ? `The student is in grade ${grade}. Adjust your explanations to be appropriate for a ${grade} student.` : ""}
Use your advanced reasoning capabilities to provide a deep, well-thought-out answer.`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [...history, { role: "user", parts: [{ text: message }] }],
    config: {
      systemInstruction: personalizedInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
    },
  });

  return {
    text: response.text
  };
}

export async function getFastResponse(
  message: string,
  history: { role: "user" | "model"; parts: { text: string }[] }[],
  studentName?: string,
  grade?: string
) {
  const personalizedInstruction = `${SYSTEM_INSTRUCTION}
${studentName ? `The student's name is ${studentName}.` : ""}
${grade ? `The student is in grade ${grade}.` : ""}
Provide a quick, concise answer.`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [...history, { role: "user", parts: [{ text: message }] }],
    config: {
      systemInstruction: personalizedInstruction,
    },
  });

  return {
    text: response.text
  };
}

export async function analyzeMedia(base64Data: string, mimeType: string, prompt: string, studentName?: string, grade?: string) {
  const personalizedInstruction = `${SYSTEM_INSTRUCTION}
${studentName ? `The student's name is ${studentName}.` : ""}
${grade ? `The student is in grade ${grade}. Adjust your analysis for this level.` : ""}
Analyze the provided media (image or video) and answer the user's prompt.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      systemInstruction: personalizedInstruction
    }
  });

  return {
    text: response.text
  };
}

export async function generateImage(prompt: string, size: "1K" | "2K" | "4K" = "1K") {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      imageConfig: {
        imageSize: size,
        aspectRatio: "1:1"
      }
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
}

export async function editImage(base64Image: string, mimeType: string, prompt: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType,
          },
        },
        {
          text: prompt,
        },
      ],
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

export async function transcribeAudio(base64Audio: string, mimeType: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Audio,
            mimeType: mimeType,
          },
        },
        {
          text: "Transcribe this audio exactly as spoken. Only return the transcription.",
        },
      ],
    },
  });

  return response.text;
}

export function getLiveSession(callbacks: any, studentName?: string, grade?: string, voiceName: string = "Puck") {
  const personalizedInstruction = `${SYSTEM_INSTRUCTION}
${studentName ? `The student's name is ${studentName}. Address them by name occasionally.` : ""}
${grade ? `The student is in grade ${grade}. Adjust your speech and complexity for this level.` : ""}`;

  return ai.live.connect({
    model: "gemini-2.5-flash-native-audio-preview-09-2025",
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
      systemInstruction: personalizedInstruction,
    },
  });
}


