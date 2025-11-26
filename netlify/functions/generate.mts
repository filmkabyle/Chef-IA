import type { Context, Config } from "@netlify/functions";

// The model used for the Gemini API call
const MODEL_NAME = "gemini-2.0-flash";

/**
 * Request Handler Function for Netlify (Modern Format).
 * Receives the request from the frontend and securely calls the Gemini API.
 */
export default async (req: Request, context: Context) => {
    // 1. Set CORS headers for security and access control
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // Handle Preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return new Response('', { status: 200, headers });
    }

    // 2. Key Check - Use Netlify.env for environment variables
    const API_KEY = Netlify.env.get('GEMINI_API_KEY');

    if (!API_KEY) {
        console.error("Configuration Error: GEMINI_API_KEY is not set.");
        return new Response(JSON.stringify({
            error: "Configuration Error",
            message: "Configuration Error: GEMINI_API_KEY is not set on the server."
        }), { status: 500, headers });
    }

    // 3. Method Check
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({
            error: "Method Not Allowed",
            message: "Method Not Allowed. Use POST."
        }), { status: 405, headers });
    }

    // 4. Read data from the frontend
    let ingredients: string;
    let lang: string;
    try {
        const body = await req.json();
        ingredients = body.ingredients;
        lang = body.lang || 'ar';

        if (!ingredients) {
            return new Response(JSON.stringify({
                error: "Missing required field: ingredients",
                message: "Please provide ingredients."
            }), { status: 400, headers });
        }
    } catch (e) {
        console.error("Request Parsing Error:", e);
        return new Response(JSON.stringify({
            error: "Invalid JSON body",
            message: "Invalid request format."
        }), { status: 400, headers });
    }

    // 5. Build the Prompt
    const prompt = `
        Role: Expert Chef.
        Task: Create 2 creative recipes using these ingredients: "${ingredients}".
        Language: Response MUST be in the language code provided: ${lang}.
        Constraint: Return ONLY a valid JSON array. No markdown, no introduction.
        JSON Structure: [{"title": "Name", "desc": "Short description", "time": "30 min", "ingredients": ["Item 1", "Item 2"], "steps": ["Step 1", "Step 2"]}]
    `;

    // 6. Call the Gemini API using fetch (available in modern Netlify Functions)
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

    try {
        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const responseJson = await apiResponse.json();

        if (!apiResponse.ok || responseJson.error) {
            console.error("Gemini API Error:", responseJson);
            return new Response(JSON.stringify({
                error: "Gemini API failed",
                details: responseJson.error?.message || "Unknown error",
                message: `Gemini API Error: ${responseJson.error?.message || "Unknown error"}`
            }), { status: apiResponse.status || 500, headers });
        }

        // Clean and parse the content
        // Gemini sometimes wraps in markdown blocks despite instructions
        const candidateText = responseJson.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!candidateText) {
            throw new Error("No content generated");
        }

        const cleanJson = candidateText.replace(/```json|```/g, '').trim();
        // Validate JSON
        JSON.parse(cleanJson);

        return new Response(cleanJson, { status: 200, headers });

    } catch (e) {
        console.error("Processing Error:", e);
        return new Response(JSON.stringify({
            error: "Processing Error",
            details: (e as Error).message,
            message: "Failed to process AI response."
        }), { status: 500, headers });
    }
};

// Export config to set a friendly path
export const config: Config = {
    path: "/api/generate"
};
