// tokenManager.js
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

let cachedToken = null;
let tokenExpiry = null;

async function getToken() {
    // Return cached token if still valid
    if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
        return cachedToken;
    }

    // Get new token
    const response = await axios.post(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
        client_id: process.env.AUTH0_CLIENT_ID,
        client_secret: process.env.AUTH0_CLIENT_SECRET,
        audience: process.env.AUTH0_AUDIENCE,
        grant_type: 'client_credentials'
    });

    cachedToken = response.data.access_token;
    tokenExpiry = new Date(Date.now() + (response.data.expires_in * 1000) - 60000); // Refresh 1 min early

    return cachedToken;
}

export default getToken;