import express from 'express';
import axios from 'axios';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { extract } from '@extractus/article-extractor';
import crypto from 'crypto';

const app = express();
const port = 3000;
const parser = new Parser();
app.use(cors());

const sources = JSON.parse(fs.readFileSync('./sources.json', 'utf-8'));
const rssSources = sources.rssSources;
const htmlSources = sources.htmlSources;

// Function to generate unique ID based on article properties
function generateArticleId(article) {
    const uniqueString = `${article.source}-${article.title}-${article.link}`;
    return crypto.createHash('md5').update(uniqueString).digest('hex');
}

async function fetchFullText(link) {
    try {
        const article = await extract(link);
        return article?.content || '';
    } catch (err) {
        console.error(`❌ Failed to extract from ${link}:`, err.message);
        return '';
    }
}

app.get('/api/news', async (req, res) => {
    const allArticles = [];
    const seenIds = new Set(); // Track seen IDs to prevent duplicates

    for (const source of rssSources) {
        try {
            const feed = await parser.parseURL(source.url);
            for (const item of feed.items.slice(0, 10)) {
                const fullText = await fetchFullText(item.link);
                const article = {
                    source: source.name,
                    title: item.title,
                    link: item.link,
                    pubDate: item.pubDate,
                    description: item.contentSnippet || '',
                    fullText
                };

                const id = generateArticleId(article);

                // Only add if we haven't seen this ID before
                if (!seenIds.has(id)) {
                    article.id = id;
                    allArticles.push(article);
                    seenIds.add(id);
                }
            }
        } catch (err) {
            console.error(`Error fetching RSS from ${source.name}:`, err.message);
        }
    }

    for (const source of htmlSources) {
        try {
            const { data } = await axios.get(source.url);
            const $ = cheerio.load(data);
            const elements = $(source.articleSelector).slice(0, 10);

            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                const title = $(el).text().trim();
                const link = $(el).attr('href');
                const fullLink = link.startsWith('http') ? link : `${source.url}${link}`;
                const fullText = await fetchFullText(fullLink);

                const article = {
                    source: source.name,
                    title,
                    link: fullLink,
                    pubDate: null,
                    description: '',
                    fullText
                };

                const id = generateArticleId(article);

                // Only add if we haven't seen this ID before
                if (!seenIds.has(id)) {
                    article.id = id;
                    allArticles.push(article);
                    seenIds.add(id);
                }
            }
        } catch (err) {
            console.error(`Error scraping ${source.name}:`, err.message);
        }
    }

    allArticles.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    res.json(allArticles);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});