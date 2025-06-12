import dotenv from 'dotenv';
dotenv.config();
import getToken from './tokenManager.js';

import axios from 'axios';

const baseUrl = process.env.CORE_BASE_URL;

export async function analyze({
                                  analyticsType,
                                  fileId,
                                  sections,
                                  forceReanalysis,
                                  granularity,
                       }) {
    try {
        const token = await getToken(); // Automatically manages token refresh

        // Construct the full URL
        const url = `${baseUrl}/profiling/${analyticsType}/analyze`;

        // Prepare the request body based on the router logic
        const requestBody = {
            analyticsType,
            fileId,
            sections,
            forceReanalysis,
            options: {
                granularity
            }
        };

        // Make the request
        const response = await axios.post(url, requestBody, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            maxContentLength: Infinity,
                maxBodyLength: Infinity
        });

        return response.data;
    } catch (error) {
        console.error('Error calling analyze API:', error);
        throw error;
    }
}