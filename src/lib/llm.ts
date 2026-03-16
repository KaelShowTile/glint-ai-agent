export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export async function getGoogleModels(apiKey: string): Promise<string[]> {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Google API Error: ${err}`);
    }
    const data = await res.json();
    return data.models
        .filter((m: any) => m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => m.name.replace('models/', ''));
}

export async function callLLM(
    provider: string,
    apiKey: string,
    model: string,
    messages: LLMMessage[],
    jsonMode: boolean = false
): Promise<string> {
    if (provider === 'Google') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-pro'}:generateContent?key=${apiKey}`;

        let systemInstruction = '';
        const geminiContents = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                systemInstruction += msg.content + '\n';
            } else {
                geminiContents.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                });
            }
        }

        const body: any = { contents: geminiContents };
        if (systemInstruction) {
            body.systemInstruction = {
                role: "user", // The systemInstruction in gemini sometimes requires this structure, or just parts
                parts: [{ text: systemInstruction.trim() }]
            };
        }

        if (jsonMode) {
            body.generationConfig = { responseMimeType: "application/json" };
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Google API Error: ${err}`);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    else if (provider === 'OpenAI/LM Studio' || provider === 'Groq' || provider.startsWith('http')) {
        // If API key is empty or says "local" for OpenAI/LM Studio, default to LM Studio typical local port
        const isLocal = provider === 'OpenAI/LM Studio' && (!apiKey || apiKey.toLowerCase() === 'local');
        
        let url = provider; // Assume it's a full URL if it starts with http
        if (provider === 'OpenAI/LM Studio') {
            url = isLocal ? 'http://localhost:1234/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
        } else if (provider === 'Groq') {
            url = 'https://api.groq.com/openai/v1/chat/completions';
        }

        const body: any = {
            model: model || (provider === 'Groq' ? 'llama3-8b-8192' : 'gpt-3.5-turbo'),
            messages: messages
        };

        if (jsonMode) {
            body.response_format = { type: "json_object" };
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...((!isLocal && apiKey) ? { 'Authorization': `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`OpenAI/Compatible API Error: ${err}`);
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
    }

    throw new Error(`Unsupported API Provider: ${provider}`);
}
