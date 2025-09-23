// This code will run on Vercel, not N8N.
const { Stagehand } = require('@browserbasehq/stagehand');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required in the request body.' });
    }
    
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
        // --- CORRECTED CONFIGURATION ---
        // We still keep the other settings, just remove the 'proxies' line.
        browserbaseSessionCreateParams: {
            browserSettings: {
                blockAds: true,
            },
        },
    });
    
    try {
        await stagehand.init();
        const page = stagehand.page;
        
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle' });

        // --- TWO-STEP DISMISSAL LOGIC REMAINS THE SAME ---
        
        // Step 1: Handle Cookie/Privacy Consent Banner
        try {
            console.log("Step 1/2: Attempting to click 'Accept' on cookie banner...");
            await page.act("click the Accept button", { timeoutMs: 10000 });
            console.log("Cookie banner dismissed.");
            await page.waitForTimeout(2000);
        } catch (error) {
            console.log("Cookie banner not found, proceeding...");
        }

        // Step 2: Handle Registration Pop-up Wall
        try {
            console.log("Step 2/2: Attempting to 'Dismiss' the registration wall...");
            await page.act("click the Dismiss button", { timeoutMs: 10000 });
            console.log("Registration wall dismissed.");
            await page.waitForTimeout(2000);
        } catch (error) {
            console.log("Registration wall not found, proceeding...");
        }
        
        // --- SCROLLING AND EXTRACTION LOGIC REMAINS THE SAME ---
        const scrollCount = 8;
        const scrollDelay = 1500;

        console.log(`Scrolling ${scrollCount} times...`);
        for (let i = 0; i < scrollCount; i++) {
            await page.act("scroll down");
            await page.waitForTimeout(scrollDelay);
        }
        console.log("Finished scrolling.");

        const instruction = `Extract the complete article content from this fully loaded page. This includes the main title, all subheadings, paragraphs, lists, key takeaways, and all other text in the article's body. Ensure the formatting, like paragraphs and line breaks, is preserved to maintain readability. Exclude sidebars, navigation menus, ads, and footers.`;
        
        console.log("Extracting content...");
        const { extraction } = await page.extract(instruction);
        
        await stagehand.close();
    
        if (!extraction || extraction.trim() === "") {
             return res.status(500).json({ error: 'Extraction resulted in empty content. The page might be protected or structured in an unexpected way.' });
        }
        
        res.status(200).json({ scraped_content: extraction });
    
    } catch (error) {
        console.error(`Failed to scrape ${url}:`, error);
        if (stagehand) {
            await stagehand.close();
        }
        res.status(500).json({ error: error.message });
    }
}