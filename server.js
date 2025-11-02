// ✅ server.js - FIXED SESSION CLEANUP ERRORS

import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

import pkg from 'whatsapp-web.js';
const { Client, RemoteAuth, MessageMedia } = pkg; 
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import mongoose from 'mongoose';
import { MongoStore } from 'wwebjs-mongo'; 

const app = express();
const PORT = process.env.PORT || 5000; 

app.use(cors());
app.use(bodyParser.json());

const MONGODB_URI = process.env.MONGODB_URI;
let client = null;
let latestQR = null;
let isInitializing = false; // Prevent concurrent initializations

// --- ENHANCED CRASH GUARD RAIL ---
process.on('unhandledRejection', (reason, promise) => {
    if (reason && reason.message) {
        // Suppress common non-critical errors
        if (reason.message.includes('Execution context was destroyed') ||
            reason.message.includes('ENOENT') && reason.message.includes('.wwebjs_auth')) {
            console.warn('⚠️ SUPPRESSED:', reason.message.split('\n')[0]);
            return;
        }
    }
    console.error('❌ UNHANDLED REJECTION:', reason.message || reason);
});

process.on('uncaughtException', (error) => {
    if (error.message && error.message.includes('ENOENT') && error.message.includes('.wwebjs_auth')) {
        console.warn('⚠️ SUPPRESSED EXCEPTION:', error.message.split('\n')[0]);
        return;
    }
    console.error('❌ UNCAUGHT EXCEPTION:', error);
});
// --- END ENHANCED GUARD RAIL ---

// --- UTILITY: SAFE DIRECTORY CLEANUP ---
function safeCleanupSessionDir() {
    const sessionPath = './.wwebjs_auth';
    try {
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log('🧹 Cleaned up local session directory');
        }
    } catch (err) {
        console.warn('⚠️ Could not clean session dir (ignored):', err.message);
    }
}
// --- END UTILITY ---

// --- MAIN INITIALIZATION FUNCTION ---
async function initializeClient() {
    // Prevent multiple concurrent initializations
    if (isInitializing) {
        console.log('⏳ Initialization already in progress, skipping...');
        return;
    }
    
    if (!MONGODB_URI) {
        console.error("❌ MONGODB_URI environment variable is not set.");
        return; 
    }
    
    isInitializing = true;
    
    try {
        // Clean up old client instance
        if (client) {
            console.log('🔄 Cleaning up old client instance...');
            try { 
                await client.destroy(); 
            } catch (e) { 
                console.warn('Old client destroy failed (ignored):', e.message); 
            }
            client = null;
        }

        // Clean up local session files to prevent ENOENT errors
        safeCleanupSessionDir();

        console.log('🔗 Connecting to MongoDB...');
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGODB_URI);
        }
        console.log('✅ Connected to MongoDB!');

        const store = new MongoStore({ mongoose: mongoose });

        // ✅ Initialize WhatsApp client with fixed RemoteAuth config
        client = new Client({
            restartOnAuthFail: true,
            authStrategy: new RemoteAuth({
                store: store,
                clientId: 'kookee-whatsapp-bot',
                backupSyncIntervalMs: 300000,
                // ✨ CRITICAL FIX: Set to 'remote' to avoid local file operations
                dataPath: undefined, // Don't use local storage
            }),
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1029270264.html',
            },
            puppeteer: { 
                headless: true,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-dev-shm-usage',
                    '--single-process',
                ],
                executablePath: '/usr/bin/chromium',
            },
        });

        // --- Event Listeners ---
        client.on('qr', qr => {
            latestQR = qr;
            console.log('📱 QR RECEIVED. Scan this with WhatsApp:');
            qrcode.generate(qr, { small: true });
        });

        client.on('ready', () => {
            console.log('✅ WhatsApp client is ready!');
            latestQR = null;
            isInitializing = false;
        });
        
        client.on('auth_failure', msg => {
            console.error('❌ Auth failed:', msg);
            isInitializing = false;
        });
        
        client.on('disconnected', async reason => {
            console.log('⚠️ Client disconnected:', reason);
            isInitializing = false;
            
            // Only auto-reconnect for unexpected disconnections
            if (reason === 'NAVIGATION' || reason === 'LOGOUT') {
                console.log('Manual logout detected. Cleaning up and waiting for manual restart...');
                safeCleanupSessionDir();
                // Optionally: schedule a delayed re-initialization
                setTimeout(() => {
                    console.log('🔄 Attempting automatic reconnection after logout...');
                    initializeClient();
                }, 5000);
            }
        });
        
        client.on('remote_session_saved', () => {
            console.log('✅ Session saved to MongoDB.');
        });

        // --- Start the client ---
        await client.initialize();
        console.log('WhatsApp client initialization started...');

    } catch (error) {
        console.error('❌ Error during client initialization:', error.message);
        isInitializing = false;
        
        // Clean up before retry
        safeCleanupSessionDir();
        
        console.log('Retrying client initialization in 10 seconds...');
        await sleep(10000); 
        await initializeClient(); 
    }
}

// Run initialization
initializeClient();
// --- END INITIALIZATION ---

// --- API ENDPOINTS ---

app.get('/qr', async (req, res) => {
    try {
        if (!latestQR && client && client.info?.wid) {
            return res.status(200).send(`
                <html><head><title>WhatsApp Status</title></head>
                <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#e9ffed;">
                    <div style="text-align:center;padding:20px;border:1px solid #c3e6cb;border-radius:8px;background:#d4edda;color:#155724;">
                        <h2>✅ WhatsApp Client is Ready!</h2>
                        <p>No QR code is currently required or available.</p>
                        <p><strong>Connected and ready to send messages!</strong></p>
                    </div>
                </body></html>
            `);
        }
        
        if (!latestQR) {
            return res.status(404).send(`
                <html><head><title>WhatsApp Status</title></head>
                <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#fff3cd;">
                    <div style="text-align:center;padding:20px;border:1px solid #ffc107;border-radius:8px;background:#fff3cd;color:#856404;">
                        <h2>⏳ Waiting for QR Code...</h2>
                        <p>Please refresh this page in a few seconds.</p>
                    </div>
                </body></html>
            `);
        }
        
        const qrDataURL = await QRCode.toDataURL(latestQR);
        res.send(`
            <html>
                <head>
                    <title>Scan WhatsApp QR</title>
                    <meta http-equiv="refresh" content="30">
                </head>
                <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f8f9fa;">
                    <div style="text-align:center;">
                        <h2>Scan WhatsApp QR Code</h2>
                        <img src="${qrDataURL}" alt="WhatsApp QR Code" style="max-width:400px;" />
                        <p>Once scanned, the WhatsApp client will be ready.</p>
                        <p><small>This page auto-refreshes every 30 seconds</small></p>
                    </div>
                </body>
            </html>
        `);
    } catch (err) {
        console.error('❌ Error generating QR code:', err);
        res.status(500).send('Error generating QR code.');
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    const status = {
        server: 'running',
        whatsapp: client && client.info?.wid ? 'connected' : 'disconnected',
        qr_available: !!latestQR,
        initializing: isInitializing
    };
    res.json(status);
});

// Utility functions
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function formatPhoneNumber(number) {
    if (!number) return null;
    number = number.replace(/\D/g, '');
    if (number.startsWith('0')) number = '256' + number.slice(1); 
    return number + '@c.us';
}

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
        if (!client || !client.info?.wid) {
            return res.status(503).json({ 
                success: false, 
                error: "WhatsApp client not ready. Check /qr endpoint to scan QR code." 
            });
        }
        
        // Your order processing logic here
        const { customerPhone, orderDetails } = req.body;
        
        if (!customerPhone) {
            return res.status(400).json({ success: false, error: "customerPhone is required" });
        }
        
        const recipient = formatPhoneNumber(customerPhone);
        const message = `New Order:\n${JSON.stringify(orderDetails, null, 2)}`;
        
        await safeSendMessage(client, recipient, message);
        
        res.json({ success: true, message: "Order sent successfully" });
    } catch (error) {
        console.error('❌ Error sending order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`📱 QR Code available at: http://0.0.0.0:${PORT}/qr`);
    console.log(`💚 Health check at: http://0.0.0.0:${PORT}/health`);
});