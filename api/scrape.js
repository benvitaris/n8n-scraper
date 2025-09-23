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
        
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded' }); // Wait for the initial page to be ready

        // --- NEW: SCROLLING LOGIC TO LOAD ALL CONTENT ---
        // This mimics a user scrolling down the page to trigger lazy-loading,
        // just like the successful Director.ai example.
        const scrollCount = 12; // How many times we scroll down. Increase if content is still missed on very long pages.
        const scrollDelay = 1500; // Time in milliseconds to wait between scrolls for content to load.

        console.log(`Scrolling ${scrollCount} times to load the full page...`);
        for (let i = 0; i < scrollCount; i++) {
            await page.act("scroll down");
            await page.waitForTimeout(scrollDelay); // Give the page time to load new content
            console.log(`Scrolled ${i + 1}/${scrollCount}`);
        }
        console.log("Finished scrolling.");

        // --- NEW: REFINED EXTRACTION INSTRUCTION ---
        // This new instruction is more specific, telling the AI to grab everything now that it's all loaded.
        const instruction = `Extract the complete article content from this fully loaded page. This includes the main title, all subheadings, paragraphs, lists, key takeaways, and all other text in the article's body. Ensure the formatting, like paragraphs and line breaks, is preserved to maintain readability. Exclude sidebars, navigation menus, ads, and footers.`;
        
        console.log("Extracting content with refined instruction...");
        const { extraction } = await page.extract(instruction);
        
        await stagehand.close();
    
        // Send a successful response back to N8N
        res.status(200).json({ scraped_content: extraction });
    
    } catch (error) {
        console.error(`Failed to scrape ${url}:`, error);
        // Ensure stagehand is closed even if an error occurs
        if (stagehand) {
            await stagehand.close();
        }
        // Send an error response back to N8N
        res.status(500).json({ error: error.message });
    }
}