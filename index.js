import express from 'express';
import axios from 'axios';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { extract } from '@extractus/article-extractor';
import crypto from 'crypto';

import { analyze } from './analyze.js';

const app = express();
const port = 3000;
const parser = new Parser();


const sources = JSON.parse(fs.readFileSync('./sources/sources.json', 'utf-8'));
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

// Function to convert articles to sections format for analysis
function articlesToSections(articles) {
    return articles.map((article, index) => ({
        id: article.id || `section-${index}`,
        text: article.text,
        index: article.index,
        metadata: {
            title: article.title,
            source: article.source,
            link: article.link,
            pubDate: article.pubDate,
            description: article.description,
            date: article.date,
            index: article.index
        }
    }));
}

app.get('/api/news', async (req, res) => {
    const allArticles = [];
    const seenIds = new Set(); // Track seen IDs to prevent duplicates
    let globalIndex = 0; // Global index counter

    // Process RSS sources
    for (const source of rssSources) {
        try {
            const feed = await parser.parseURL(source.url);
            for (const item of feed.items.slice(0, 10)) {
                const text = await fetchFullText(item.link);
                const article = {
                    index: globalIndex++,
                    source: source.name,
                    title: item.title,
                    link: item.link,
                    pubDate: item.pubDate,
                    description: item.contentSnippet || '',
                    text: `${item.title} ${item.contentSnippet || ''} ${text}`.trim(),
                    date: item.pubDate ? new Date(item.pubDate) : new Date(),
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

    // Process HTML sources
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
                const text = await fetchFullText(fullLink);

                const article = {
                    index: globalIndex++,
                    source: source.name,
                    title,
                    link: fullLink,
                    pubDate: null,
                    description: '',
                    text: `${title} ${text}`.trim(),
                    date: new Date(),
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

    // Sort by date (newest first)
    allArticles.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

    console.log(`Fetched ${allArticles.length} articles total`);

    // Convert articles to sections format
    const sections = articlesToSections(allArticles);

    try {
        const analysisResult = await analyze({
            analyticsType: 'media-insights',
            fileId: `media-insights-${Date.now()}`,
            sections: sections,
            forceReanalysis: true,
            granularity: 'article',
            options: {
                granularity: 'article',
                documentId: 'media-insights-document',
            },
        });

        res.json({
            analyses_started: true,
            articles_count: allArticles.length,
            analysis_id: analysisResult.id || 'analysis-started'
        });
    } catch (err) {
        console.error('Analysis error:', err);
        res.status(500).json({
            error: 'Analysis failed',
            message: err.message,
            articles_count: allArticles.length
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});