import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const bookAppointmentFunction: FunctionDeclaration = {
  name: "bookAppointment",
  description: "Book an appointment for a customer.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      customerName: { type: Type.STRING },
      customerPhone: { type: Type.STRING },
      date: { type: Type.STRING, description: "Date in YYYY-MM-DD format" },
      time: { type: Type.STRING, description: "Time in HH:MM format" },
      service: { type: Type.STRING }
    },
    required: ["customerName", "customerPhone", "date", "time"]
  }
};

export const collectLeadFunction: FunctionDeclaration = {
  name: "collectLead",
  description: "Collect customer contact details for follow-up.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      phone: { type: Type.STRING },
      email: { type: Type.STRING },
      interest: { type: Type.STRING, description: "What the customer is interested in" }
    },
    required: ["name", "phone"]
  }
};

export async function getChatResponse(
  messages: { role: "user" | "model"; content: string }[],
  businessContext: string,
  businessId: string
) {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    You are a professional AI assistant for a business. 
    Your goal is to help customers, answer their questions based on the provided business information, collect their contact details (leads), and book appointments.
    
    BUSINESS CONTEXT:
    ${businessContext}
    
    GUIDELINES:
    - Be polite, helpful, and professional.
    - If you don't know the answer based on the context, politely say you'll have a human representative contact them.
    - Always try to collect the customer's name and phone number if they show interest in services.
    - Use the 'bookAppointment' tool if the customer wants to schedule a visit.
    - Use the 'collectLead' tool when you get customer contact details.
    - Keep responses concise and friendly.
  `;

  const contents = messages.map(m => ({
    role: m.role,
    parts: [{ text: m.content }]
  }));

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [bookAppointmentFunction, collectLeadFunction] }]
      }
    });

    return response;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}
