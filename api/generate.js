// This file must be deployed to a Serverless service like Vercel or Netlify
// It securely holds and uses the API key.

// The model used for the Gemini API call
const MODEL_NAME = "gemini-2.5-flash-preview-09-2025"; 
// Read the key from the secret environment variables (MUST be named GEMINI_API_KEY)
const API_KEY = process.env.GEMINI_API_KEY; 

/**
 * Request Handler Function for Vercel/Netlify.
 * Receives the request from the frontend and securely calls the Gemini API.
 * @param {object} req - Request object
 * @param {object} res - Response object
 */
module.exports = async (req, res) => {
    // 1. Set CORS headers for security and access control
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow any origin for simplicity in this example
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. Key Check
    if (!API_KEY) {
        return res.status(500).json({ error: "Configuration Error: GEMINI_API_KEY is not set on the server." });
    }

    // 3. Method Check
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // 4. Read data from the frontend
    let ingredients, lang;
    try {
        const body = req.body;
        ingredients = body.ingredients;
        lang = body.lang || 'ar'; 

        if (!ingredients) {
            return res.status(400).json({ error: "Missing required field: ingredients" });
        }
    } catch (e) {
        return res.status(400).json({ error: "Invalid JSON body" });
    }

    // 5. Build the Prompt
    const prompt = `
        Role: Expert Chef.
        Task: Create 2 creative recipes using these ingredients: "${ingredients}".
        Language: Response MUST be in the language code provided: ${lang}.
        Constraint: Return ONLY a valid JSON array. No markdown, no introduction.
        JSON Structure: [{"title": "Name", "desc": "Short description", "time": "30 min", "ingredients": ["Item 1", "Item 2"], "steps": ["Step 1", "Step 2"]}]
    `;

    try {
        // 6. Call the Gemini API securely using the hidden API_KEY
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
        
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            console.error("Gemini API Error:", data);
            // Relay the error message from Gemini to the frontend
            return res.status(response.status).json({ 
                error: "Gemini API failed to process request.", 
                details: data.error?.message || "Unknown error." 
            });
        }
        
        // 7. Clean and parse the JSON response
        const cleanJson = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        const recipes = JSON.parse(cleanJson);

        // 8. Send the final recipes back to the user's browser
        res.status(200).json(recipes);

    } catch (e) {
        console.error("Serverless Function Internal Error:", e);
        res.status(500).json({ error: "Internal Server Error during AI processing.", details: e.message });
    }
};
