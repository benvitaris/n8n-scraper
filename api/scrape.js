// This is the final, multi-strategy scraper with the Cognitive Loop
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
    
    // Using a more powerful model for the complex website strategy is better.
    // We'll use the cheaper 'flash' for Articles and the smarter 'pro' for Websites.
    const modelForCategory = category === 'Website' ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";
    console.log(`Using model: ${modelForCategory} for category: ${category}`);

    const stagehand = new Stagehand({
        env: "BROWSERBASE",
        apiKey: BROWSERBASE_API_KEY,
        projectId: BROWSERBASE_PROJECT_ID,
        modelName: modelForCategory,
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

        // Universal pop-up dismissal
        try { await page.act("click the Accept button", { timeoutMs: 7000 }); console.log("Cookie banner dismissed."); await page.waitForTimeout(1500); } catch (e) { console.log("Cookie banner not found."); }
        try { await page.act("click the Dismiss button", { timeoutMs: 7000 }); console.log("Registration wall dismissed."); await page.waitForTimeout(1500); } catch (e) { console.log("Registration wall not found."); }

        let extraction;

        switch (category) {
            case 'Website':
                console.log("Executing 'Website' strategy: Cognitive Scraping Loop...");

                // --- THE COGNITIVE LOOP ---
                const interactionCycles = 3; // How many times we loop to find nested content.
                let clickedElements = new Set(); // Keep track of what we've already clicked.

                for (let i = 0; i < interactionCycles; i++) {
                    console.log(`--- Interaction Cycle ${i + 1}/${interactionCycles} ---`);
                    
                    // 1. Observe all interactive elements. The AI is smart enough to find these.
                    const interactiveElements = await page.observe("Find all clickable tabs, accordions, 'show more', 'learn more', and FAQ buttons that reveal more text on the same page.");

                    if (!interactiveElements || interactiveElements.length === 0) {
                        console.log("No new interactive elements found. Ending interaction loop.");
                        break;
                    }

                    let newClickFound = false;
                    for (const element of interactiveElements) {
                        // Use a unique key for each element to avoid re-clicking
                        const elementKey = element.selector || element.description;
                        if (!clickedElements.has(elementKey)) {
                            try {
                                console.log(`Clicking on: "${element.description}"`);
                                await page.act(element);
                                clickedElements.add(elementKey);
                                newClickFound = true;
                                await page.waitForTimeout(2000); // Wait for animations/content loading
                            } catch (clickError) {
                                console.log(`Could not click "${element.description}", skipping.`);
                            }
                        }
                    }
                    if (!newClickFound) {
                        console.log("No new un-clicked elements found. Ending interaction loop.");
                        break;
                    }
                }

                // 2. Final scroll to catch any lazy-loaded content at the bottom
                console.log("Final scroll to ensure all content is loaded...");
                for (let i = 0; i < 5; i++) {
                    await page.act("scroll to bottom of page");
                    await page.waitForTimeout(1000);
                }
                
                // 3. Extract everything now that the page is fully revealed
                console.log("Extracting all visible content from fully revealed page...");
                const finalExtraction = await page.extract(`Extract ALL visible text content from the page, including titles, paragraphs, and all data within tables, tabs, and accordions. Preserve the original formatting and structure perfectly.`);
                extraction = finalExtraction.extraction;
                break;

            case 'Article':
            default:
                console.log("Executing 'Article' strategy: Scroll and Extract...");
                const scrollCount = 8;
                for (let i = 0; i < scrollCount; i++) {
                    await page.act("scroll down");
                    await page.waitForTimeout(1500);
                }
                const articleInstruction = `Extract the complete article content from this fully loaded page. This includes the main title, all subheadings, paragraphs, lists, key takeaways, and any other text in the article body. Preserve formatting.`;
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