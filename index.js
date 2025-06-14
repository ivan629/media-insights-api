import express from 'express';
import Parser from 'rss-parser';
import fs from 'fs';
import { extract } from '@extractus/article-extractor';
import crypto from 'crypto';

import { analyze } from './analyze.js';
import { fetchPrevAnalysedFiles } from './fetchPrevAnalysedFiles.js';
import fetchArchiveRouter from './fetchArchiveRouter.js';
const app = express();
const port = 3000;
const parser = new Parser();

const sourcesUkraine = JSON.parse(fs.readFileSync('./sources/ukraine_media_sources.json', 'utf-8'));
const sourcesRussia = JSON.parse(fs.readFileSync('./sources/russian_media_sources.json', 'utf-8'));
const sourcesUkraineSources  = sourcesUkraine.rssSources;
const sourcesRussiaSources = sourcesRussia.rssSources;

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
        id: article.id,
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

async function fetchArticls (rssSources) {
    const allArticles = [];
    const seenIds = new Set(); // Track seen IDs to prevent duplicates
    let globalIndex = 0; // Global index counter

    // Process RSS sources
    for (const source of rssSources) {
        try {
            const feed = await parser.parseURL(source.url);

            for (const item of feed.items) {
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

        return allArticles;
    }
}

app.get('/api/news', async (req, res) => {
    const prevAnalyzedFiles = await fetchPrevAnalysedFiles();

    console.log('prevAnalyzedFiles', JSON.stringify(prevAnalyzedFiles, null, 4));

    return

    const allUkrainanArticles = await fetchArticls(sourcesUkraineSources)
    const allRussianArticles = await fetchArticls(sourcesRussiaSources)
    // Sort by date (newest first)
    allUkrainanArticles.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    allRussianArticles.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

    console.log(`Fetched ${allUkrainanArticles.length} Ukrainian articles total`);
    console.log(`Fetched ${allRussianArticles.length} Russian articles total`);

    // Convert articles to sections format
    const allRussianSections = articlesToSections(allRussianArticles);
    const allUkrainanSections = articlesToSections(allUkrainanArticles);

    try {
        const russianAnalysisResult = await analyze({
            analyticsType: 'media-insights',
            fileId: `russia-media-insights-${Date.now()}`,
            sections: allRussianSections,
            forceReanalysis: true,
            granularity: 'article',
            options: {
                granularity: 'article',
                documentId: 'media-insights-document',
            },
        });

        const ukrainanAnalysisResult = await analyze({
            analyticsType: 'media-insights',
            fileId: `ukraine-media-insights-${Date.now()}`,
            sections: allUkrainanSections,
            forceReanalysis: false,
            granularity: 'article',
            options: {
                granularity: 'article',
                documentId: 'media-insights-document',
            },
        });

        res.json({
            analyses_started: true,
            articles_count: allRussianSections.length + allUkrainanSections.length,
        });
    } catch (err) {
        console.error('Analysis error:', err);
        res.status(500).json({
            error: 'Analysis failed',
            message: err.message,
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});