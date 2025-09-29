// This is the OPTIMIZED version of the scraper, designed to run faster.
const { Stagehand } = require('@browserbasehq/stagehand');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const { url, category } = req.body;
    if (!url || !category) return res.status(400).json({ error: 'URL and category are required.' });

    const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
    const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    
    const stagehand = new Stagehand({
        env: "BROWSERBASE",
        apiKey: BROWSERBASE_API_KEY,
        projectId: BROWSERBASE_PROJECT_ID,
        modelName: "google/gemini-2.5-flash", // Sticking to the faster model
        modelClientOptions: { apiKey: GOOGLE_API_KEY },
        disablePino: true,
        browserbaseSessionCreateParams: {
            browserSettings: { blockAds: true, viewport: { width: 1920, height: 1080 } },
        },
    });

    try {
        await stagehand.init();
        const page = stagehand.page;
        await page.goto(url, { waitUntil: 'networkidle' });

        try { await page.act("click the Accept button", { timeoutMs: 5000 }); console.log("Cookie banner dismissed."); await page.waitForTimeout(1000); } catch (e) { console.log("Cookie banner not found."); }
        try { await page.act("click the Dismiss button", { timeoutMs: 5000 }); console.log("Registration wall dismissed."); await page.waitForTimeout(1000); } catch (e) { console.log("Registration wall not found."); }

        let extraction;

        switch (category) {
            case 'Website':
                console.log("Executing 'Website' strategy: Optimized Loop...");
                
                const interactionCycles = 2; // Reduced from 3
                let clickedElements = new Set();

                for (let i = 0; i < interactionCycles; i++) {
                    console.log(`--- Interaction Cycle ${i + 1}/${interactionCycles} ---`);
                    const interactiveElements = await page.observe("Find all clickable tabs, accordions, and 'show more' buttons.");
                    if (!interactiveElements || interactiveElements.length === 0) break;

                    let newClickFound = false;
                    for (const element of interactiveElements) {
                        const elementKey = element.selector || element.description;
                        if (!clickedElements.has(elementKey)) {
                            try {
                                await page.act(element);
                                clickedElements.add(elementKey);
                                newClickFound = true;
                                await page.waitForTimeout(1000); // Shorter delay
                            } catch (clickError) { /* ignore */ }
                        }
                    }
                    if (!newClickFound) break;
                }

                await page.act("scroll to bottom of page"); await page.waitForTimeout(1000);
                
                const finalExtraction = await page.extract(`Extract ALL visible text content from the fully revealed page, including all data within tables, tabs, and accordions.`);
                extraction = finalExtraction.extraction;
                break;

            case 'Article':
            default:
                // Article strategy remains the same
                const scrollCount = 8;
                for (let i = 0; i < scrollCount; i++) {
                    await page.act("scroll down");
                    await page.waitForTimeout(1000);
                }
                const articleResult = await page.extract(`Extract the complete article content...`);
                extraction = articleResult.extraction;
                break;
        }

        await stagehand.close();
        res.status(200).json({ scraped_content: extraction });
    
    } catch (error) {
        console.error(`Failed to scrape ${url}:`, error);
        if (stagehand) { await stagehand.close(); }
        res.status(500).json({ error: error.message });
    }
}