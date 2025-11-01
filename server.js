// ✅ server.js - CORRECTED FOR RENDER WITH REMOTEAUTH AND STABILITY FIXES

import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

// --- NEW/UPDATED IMPORTS ---
import pkg from 'whatsapp-web.js';
const { Client, RemoteAuth, MessageMedia } = pkg; 
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import mongoose from 'mongoose';
import { MongoStore } from 'wwebjs-mongo'; 
// --- END NEW/UPDATED IMPORTS ---

const app = express();
// Render automatically provides the PORT environment variable
const PORT = process.env.PORT || 5000; 

app.use(cors());
app.use(bodyParser.json());

// Get the MongoDB URI from the environment variable (CRITICAL)
const MONGODB_URI = process.env.MONGODB_URI;
let client = null; // Declare client globally, initialize later
let latestQR = null;


// --- CRITICAL CRASH GUARD RAIL ---
// This handler prevents the entire Node.js process from exiting when 
// Puppeteer throws the unhandled 'Execution context was destroyed' error 
// that often happens immediately after a LOGOUT or navigation event.
process.on('unhandledRejection', (reason, promise) => {
    if (reason && reason.message && reason.message.includes('Execution context was destroyed')) {
        console.warn('⚠️ SUPPRESSED: Execution context was destroyed error caught and ignored (Likely safe after LOGOUT).');
        return; // Suppress the crash, but let the client attempt to recover
    }
    // Log other unhandled rejections
    console.error('❌ UNHANDLED REJECTION:', reason.message, promise);
    // You may decide to exit here for other severe errors: 
    // process.exit(1); 
});
// --- END CRASH GUARD RAIL ---


// --- MAIN INITIALIZATION FUNCTION ---
async function initializeClient() {
    if (!MONGODB_URI) {
        console.error("❌ MONGODB_URI environment variable is not set. Cannot connect database.");
        return; 
    }
    
    try {
        console.log('🔗 Attempting to connect to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB!');

        const store = new MongoStore({ mongoose: mongoose });

        // ✅ Initialize WhatsApp client with RemoteAuth (Stability fixes applied)
        client = new Client({
            authStrategy: new RemoteAuth({
                store: store,
                clientId: 'kookee-whatsapp-bot', 
                backupSyncIntervalMs: 300000, 
                // CRITICAL FIX: Prevent RemoteAuth from trying to clean up temp files 
                deleteSessionDataOnLogout: false, 
            }),
            // Force a known stable WhatsApp Web version (Keep this)
            webVersionCache: {
                type: 'remote',
               remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2413.51.html',
                // Check if 2.2413.51.html or newer is more stable if this version fails
            },
            puppeteer: { 
                headless: true,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    // ✨ CRITICAL STABILITY FIX for containers
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-dev-shm-usage',
                ],
                executablePath: '/usr/bin/chromium',
            },
        });

        // --- Client Event Listeners ---
        client.on('qr', qr => {
            latestQR = qr; // store for web endpoint
            console.log('📱 QR RECEIVED. Scan this with WhatsApp:');
            qrcode.generate(qr, { small: true });
        });

        client.on('ready', () => console.log('✅ WhatsApp client is ready!'));
        client.on('auth_failure', msg => console.error('❌ Auth failed:', msg));
        // The LOGOUT event is what triggers the subsequent crash, this logs it:
        client.on('disconnected', reason => console.log('⚠️ Client disconnected:', reason));
        client.on('remote_session_saved', () => console.log('✅ Session saved to MongoDB.'));

        // --- Start the client ---
        await client.initialize();
        console.log('WhatsApp client initialization started...');

    } catch (error) {
        console.error('❌ Error during client initialization:', error);
    }
}

// Run the initialization function
initializeClient();
// --- END MAIN INITIALIZATION FUNCTION ---


// --- REST OF YOUR EXISTING CODE ---

// Serve QR code as PNG in browser
app.get('/qr', async (req, res) => {
  try {
    if (!latestQR) return res.status(404).send('QR code not available yet. Please wait.');
    const qrDataURL = await QRCode.toDataURL(latestQR);
    res.send(`
      <html>
        <head><title>Scan WhatsApp QR</title></head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f8f9fa;">
          <div style="text-align:center;">
            <h2>Scan WhatsApp QR Code</h2>
            <img src="${qrDataURL}" alt="WhatsApp QR Code" />
            <p>Once scanned, the WhatsApp client will be ready. **Access this page via the Render public URL!**</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('❌ Error generating QR code:', err);
    res.status(500).send('Error generating QR code.');
  }
});

// Utility: sleep
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Convert local number to WhatsApp ID
function formatPhoneNumber(number) {
    if (!number) return null;
    number = number.replace(/\D/g, '');        // remove non-digits
    if (number.startsWith('0')) number = '256' + number.slice(1); // add country code
    return number + '@c.us';
}

// Safe sendMessage wrapper
async function safeSendMessage(client, recipient, content) {
    try {
        await client.sendMessage(recipient, content);
        console.log(`✅ Message sent to: ${recipient}`);
        await sleep(800); 
    } catch (err) {
        console.error(`❌ Failed to send message to ${recipient}:`, err.message);
    }
}


// Main order route
app.post('/send-order', async (req, res) => {
    try {
        // Check if client is initialized
        if (!client || !client.info?.wid) {
            return res.status(503).json({ success: false, error: "WhatsApp client not ready. Check logs or /qr endpoint." });
        }
        // ... (Your remaining order logic here)
        res.json({ success: true, message: "Order processed successfully (logic skipped for brevity)." });
    } catch (error) {
        console.error('❌ Error sending order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on http://0.0.0.0:${PORT}`));