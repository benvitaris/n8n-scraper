// This is the new, rate-limit-aware scrape.js
const { Stagehand } = require('@browserbasehq/stagehand');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { url, category } = req.body;
    
    if (!url || !category) {
        return res.status(400).json({ error: 'URL and category are required.' });
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
        browserbaseSessionCreateParams: {
            browserSettings: { blockAds: true },
        },
    });

    try {
        await stagehand.init();
        const page = stagehand.page;
        
        await page.goto(url, { waitUntil: 'networkidle' });

        // Universal pop-up dismissal
        try { await page.act("click the Accept button", { timeoutMs: 7000 }); console.log("Cookie banner dismissed."); await page.waitForTimeout(1500); } catch (e) { console.log("Cookie banner not found."); }
        try { await page.act("click the Dismiss button", { timeoutMs: 7000 }); console.log("Registration wall dismissed."); await page.waitForTimeout(1500); } catch (e) { console.log("Registration wall not found."); }

        let extraction;

        switch (category) {
            case 'Website':
                console.log("Executing 'Website' strategy: Observe, Click, Extract...");

                // --- NEW EFFICIENT STRATEGY ---
                // 1. Observe all interactive elements once (1 API Call)
                console.log("Observing interactive elements...");
                const interactiveElements = await page.observe("Find all clickable tabs, accordions, and 'show more' buttons on the page that reveal more content");

                // 2. Loop and click them (0 API Calls)
                if (interactiveElements && interactiveElements.length > 0) {
                    console.log(`Found ${interactiveElements.length} elements to interact with.`);
                    for (const element of interactiveElements) {
                        try {
                            console.log(`Clicking on: "${element.description}"`);
                            await page.act(element); // This is a "free" action
                            await page.waitForTimeout(1500); // Wait for content to load
                        } catch (clickError) {
                            console.log(`Could not click on "${element.description}", skipping.`);
                        }
                    }
                } else {
                    console.log("No interactive elements found to click.");
                }

                // 3. Scroll to be sure
                console.log("Scrolling to load any remaining content...");
                for (let i = 0; i < 5; i++) {
                    await page.act("scroll down");
                    await page.waitForTimeout(1000);
                }
                
                // 4. Extract everything once (1 API Call)
                console.log("Extracting all visible content...");
                const finalExtraction = await page.extract(`Extract ALL visible text content from the fully revealed page, including all titles, paragraphs, and data from all tables. Preserve formatting.`);
                extraction = finalExtraction.extraction;
                break;

            case 'Article':
            default:
                console.log("Executing 'Article' strategy: Scroll and Extract...");
                const scrollCount = 8;
                const scrollDelay = 1500;
                for (let i = 0; i < scrollCount; i++) {
                    await page.act("scroll down");
                    await page.waitForTimeout(scrollDelay);
                }
                const articleInstruction = `Extract the complete article content...`; // Your full instruction
                const articleResult = await page.extract(articleInstruction);
                extraction = articleResult.extraction;
                break;
        }

        await stagehand.close();

        if (!extraction || extraction.trim() === "") {
             return res.status(500).json({ error: 'Extraction resulted in empty content.' });
        }
        
        res.status(200).json({ scraped_content: extraction });
    
    } catch (error) {
        console.error(`Failed to scrape ${url}:`, error);
        if (stagehand) { await stagehand.close(); }
        res.status(500).json({ error: error.message });
    }
}