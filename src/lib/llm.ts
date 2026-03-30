export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
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
    else if (provider === 'ComfyUI') {
        const url = (model && model.startsWith('http')) ? model : 'http://127.0.0.1:8188';

        const sysMsg = messages.find(m => m.role === 'system');
        const jsonMatch = sysMsg?.content.match(/Role Context:\s+(.*?)\s+Task Assigned:/s);
        let workflowTemplate = jsonMatch ? jsonMatch[1].trim() : '{}';
        
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
        const safeUserMsg = lastUserMsg.replace(/"/g, '\\"').replace(/\n/g, ' ');
        
        workflowTemplate = workflowTemplate.replace(/__GLINT_PROMPT__/g, safeUserMsg);
        
        let workflowObj;
        try {
            workflowObj = JSON.parse(workflowTemplate);
        } catch(e) {
            throw new Error(`Failed to parse ComfyUI Workflow JSON. Please ensure it is a valid format exported via 'Save (API Format)' from ComfyUI.`);
        }

        const clientId = 'glint_agent_' + Math.random().toString(36).substring(7);
        const promptBody = {
            prompt: workflowObj,
            client_id: clientId
        };

        const postRes = await fetch(`${url}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(promptBody)
        });

        if (!postRes.ok) {
            const err = await postRes.text();
            throw new Error(`ComfyUI API Error: ${err}`);
        }

        const data = await postRes.json();
        const promptId = data.prompt_id;

        let isDone = false;
        let generatedFilename = '';
        let generatedNodeType = '';

        for (let i = 0; i < 40; i++) { // Max 120 seconds
            await new Promise(resolve => setTimeout(resolve, 3000));
            try {
                const histRes = await fetch(`${url}/history/${promptId}`);
                if (histRes.ok) {
                    const histData = await histRes.json();
                    if (histData[promptId]) {
                        isDone = true;
                        const outputs = histData[promptId].outputs;
                        for (const nodeId in outputs) {
                            const nodeOutput = outputs[nodeId];
                            if (nodeOutput.images && nodeOutput.images.length > 0) {
                                generatedFilename = nodeOutput.images[0].filename;
                                generatedNodeType = nodeOutput.images[0].type || 'output';
                                break;
                            }
                        }
                        break;
                    }
                }
            } catch(e) {}
        }

        if (!isDone) {
            throw new Error(`ComfyUI generation timed out. Please check the local ComfyUI console.`);
        }

        if (!generatedFilename) {
            return `[ComfyUI] ⚠️ Workflow executed successfully, but no image outputs were found. Ensure your workflow contains a 'Save Image' node.`;
        }

        try {
            const imgRes = await fetch(`${url}/view?filename=${generatedFilename}&type=${generatedNodeType}`);
            if (!imgRes.ok) throw new Error();
            
            const arrayBuffer = await imgRes.arrayBuffer();
            const base64String = arrayBufferToBase64(arrayBuffer);
            
            const timestamp = new Date().getTime();
            const fileName = `${promptId}_${timestamp}.png`;

            return `[System Automaton] ComfyUI Image Generation Complete. \n\n<file_b64 path="images/${fileName}">\n${base64String}\n</file_b64>`;
        } catch(e) {
            throw new Error(`ComfyUI generated the image but fetching from /view failed.`);
        }
    }

    throw new Error(`Unsupported API Provider: ${provider}`);
}
