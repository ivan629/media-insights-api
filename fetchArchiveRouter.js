import express from 'express';

const router = express.Router();
import axios from 'axios';
import unzipper from 'unzipper';
import csvParser from 'csv-parser';

const getYesterdaysDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
};

async function fetchYesterdayUkraineEvents() {
    const yyyymmdd = getYesterdaysDateStr();
    const url = `http://data.gdeltproject.org/events/${yyyymmdd}.export.CSV.zip`;

    try {
        const response = await axios.get(url, { responseType: 'stream' });

        const unzipStream = response.data.pipe(unzipper.ParseOne());
        const results = [];

        unzipStream
            .pipe(csvParser({ headers: false }))
            .on('data', (row) => {
                const country1 = row[51]; // Actor1CountryCode
                const country2 = row[52]; // Actor2CountryCode
                const geo = row[53];      // ActionGeo_CountryCode

                if (country1 === 'UKR' || country2 === 'UKR' || geo === 'UKR') {
                    results.push(row);
                }
            })
            .on('end', () => {
                console.log(`✅ Found ${results.length} events related to Ukraine for ${yyyymmdd}`);
            });
    } catch (err) {
        console.error('❌ Failed to fetch yesterday’s GDELT data:', err.message);
    }
}

router.get('/api/events', async (req, res) => {
    try {
        const response  = await fetchYesterdayUkraineEvents();

        res.json({ data: response });
    } catch (err) {
        console.error('❌ GDELT fetch failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
