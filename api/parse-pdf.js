// api/parse-pdf.js
const axios = require('axios');
const pdf = require('pdf-parse');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required.' });
    }

    try {
        console.log(`Fetching PDF from ${url}...`);
        // Download the PDF file as a buffer
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        console.log("Parsing PDF content...");
        // Parse the text content from the buffer
        const data = await pdf(buffer);
        
        // Return the extracted text
        res.status(200).json({ scraped_content: data.text });

    } catch (error) {
        console.error(`Failed to parse PDF from ${url}:`, error);
        res.status(500).json({ error: error.message });
    }
}