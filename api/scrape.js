// This is the new, multi-strategy scrape.js file
const { Stagehand } = require('@browserbasehq/stagehand');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // --- NEW: Accepting 'category' along with 'url' ---
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
        
        console.log(`Navigating to ${url} with category: '${category}'`);
        await page.goto(url, { waitUntil: 'networkidle' });

        // --- UNIVERSAL POP-UP DISMISSAL ---
        // This runs for ALL categories first.
        try {
            await page.act("click the Accept button", { timeoutMs: 7000 });
            console.log("Cookie banner dismissed.");
            await page.waitForTimeout(1500);
        } catch (error) { console.log("Cookie banner not found."); }
        try {
            await page.act("click the Dismiss button", { timeoutMs: 7000 });
            console.log("Registration wall dismissed.");
            await page.waitForTimeout(1500);
        } catch (error) { console.log("Registration wall not found."); }

        let extraction;

        // --- STRATEGY SELECTION BASED ON CATEGORY ---
        switch (category) {
            case 'Website':
                console.log("Executing 'Website' strategy: Agentic Exploration...");
                
                // --- AGENT STRATEGY ---
                // We give the agent a high-level goal. It will try to click tabs,
                // accordions ('FAQs'), and 'read more' links to uncover all content.
                const agent = stagehand.agent();
                const agentResult = await agent.execute({
                    instruction: `Explore the entire content of this single page. First, scroll to the bottom multiple times to load everything. Then, identify and click on all interactive elements like tabs, accordions, and 'show more' buttons that reveal more text on THIS SAME PAGE without navigating away. After each interaction, wait for content to load. Finally, extract ALL visible text content from the fully revealed page, including titles, paragraphs, and data from tables. Preserve the original formatting and structure.`,
                    maxSteps: 25 // Limit the number of actions to prevent infinite loops
                });

                // The agent's final message is the scraped content
                extraction = agentResult.message;
                break;

            case 'Article':
            default: // If category is not 'Website' or is missing, use the reliable Article scraper.
                console.log("Executing 'Article' strategy: Scroll and Extract...");
                
                // --- ARTICLE STRATEGY (our existing, proven script) ---
                const scrollCount = 8;
                const scrollDelay = 1500;
                for (let i = 0; i < scrollCount; i++) {
                    await page.act("scroll down");
                    await page.waitForTimeout(scrollDelay);
                }
                
                const instruction = `Extract the complete article content from this fully loaded page. This includes the main title, all subheadings, paragraphs, lists, key takeaways, and all other text in the article's body. Ensure the formatting is preserved to maintain readability. Exclude sidebars, navigation menus, ads, and footers.`;
                const result = await page.extract(instruction);
                extraction = result.extraction;
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