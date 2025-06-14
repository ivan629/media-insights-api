import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import getToken from "./tokenManager.js";

const url = process.env.MANUSCRIPT_MGMT_BASE;

export async function fetchPrevAnalysedFiles() {
    try {
        // Check if URL is defined
        if (!url) {
            throw new Error('MANUSCRIPT_MGMT_BASE environment variable is not defined');
        }

        // Get token
        const token = await getToken();

        if (!token) {
            throw new Error('Failed to get authentication token');
        }

        console.log(`Fetching from: ${url}/files-analyzed`);

        const response = await axios.get(`${url}/analytics-json-all`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            // Add timeout to prevent hanging
            timeout: 30000, // 30 seconds
            // Validate status to handle non-2xx responses
            validateStatus: function (status) {
                return status >= 200 && status < 300; // default
            }
        });

        return response.data;
    } catch (error) {
        // Enhanced error logging
        console.error('Error fetching previously analyzed files:');

        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
            console.error('Response data:', error.response.data);

            // Handle specific status codes
            switch (error.response.status) {
                case 401:
                    throw new Error('Authentication failed. Please check your token.');
                case 403:
                    throw new Error('Access forbidden. Check your permissions.');
                case 404:
                    throw new Error(`Endpoint not found: ${url}/files-analyzed`);
                case 500:
                    throw new Error('Server error. The API is experiencing issues.');
                case 502:
                    throw new Error('Bad gateway. The API server might be down.');
                case 503:
                    throw new Error('Service unavailable. Please try again later.');
                default:
                    throw new Error(`API request failed with status ${error.response.status}`);
            }
        } else if (error.request) {
            // The request was made but no response was received
            console.error('No response received:', error.request);
            throw new Error('No response from server. Please check your connection and API URL.');
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Request setup error:', error.message);
            throw error;
        }
    }
}

// Optional: Add a retry mechanism
export async function fetchPrevAnalysedFilesWithRetry(maxRetries = 3, retryDelay = 1000) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`Attempt ${i + 1} of ${maxRetries}...`);
            return await fetchPrevAnalysedFiles();
        } catch (error) {
            lastError = error;
            console.error(`Attempt ${i + 1} failed:`, error.message);

            if (i < maxRetries - 1) {
                console.log(`Waiting ${retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay *= 2; // Exponential backoff
            }
        }
    }

    throw lastError;
}

// Optional: Add a health check function
export async function checkApiHealth() {
    try {
        if (!url) {
            return { healthy: false, error: 'MANUSCRIPT_MGMT_BASE not configured' };
        }

        const token = await getToken();
        const response = await axios.get(`${url}/health`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            timeout: 5000
        });

        return { healthy: true, status: response.status };
    } catch (error) {
        return {
            healthy: false,
            error: error.message,
            status: error.response?.status
        };
    }
}