// This code will run on Vercel, not N8N.
const { Stagehand } = require('@browserbasehq/stagehand');

export default async function handler(req, res) {
    // Vercel security: Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required in the request body.' });
    }
    
    // --- CONFIGURATION ---
    // These are read from Vercel's Environment Variables for security
    const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
    const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    
    const stagehand = new Stagehand({
        env: "BROWSERBASE",
        apiKey: BROWSERBASE_API_KEY,
        projectId: BROWSERBASE_PROJECT_ID,
        modelName: "google/gemini-2.5-flash",
        modelClientOptions: { apiKey: GOOGLE_API_KEY },
        disablePino: true,
    });
    
    try {
        await stagehand.init();
        const page = stagehand.page;
        await page.goto(url);
    
        const { extraction } = await page.extract("extract the main text content of this page, including all titles, headings, and paragraphs");
        
        await stagehand.close();
    
        // Send a successful response back to N8N
        res.status(200).json({ scraped_content: extraction });
    
    } catch (error) {
        console.error(`Failed to scrape ${url}:`, error);
        await stagehand.close();
        // Send an error response back to N8N
        res.status(500).json({ error: error.message });
    }
}