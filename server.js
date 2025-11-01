// ✅ server.js — Full-height receipt + safe WhatsApp sending

import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

// ✅ Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { 
        headless: true,
        // ✅ Add these two lines for Docker deployment
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: '/usr/bin/chromium', 
    },
});

client.on('qr', qr => {
  console.log('📱 Scan this QR code with WhatsApp:');
  qrcode.generate(qr, { small: true });
});

let latestQR = null;

// Update latest QR when WhatsApp generates it
client.on('qr', qr => {
  latestQR = qr; // store for web endpoint
  console.log('📱 Scan this QR code with WhatsApp:');
  qrcode.generate(qr, { small: true });
});

// Serve QR code as PNG in browser
app.get('/qr', async (req, res) => {
  try {
    if (!latestQR) return res.status(404).send('QR code not available yet.');

    const qrDataURL = await QRCode.toDataURL(latestQR);
    // Return HTML with QR image
    res.send(`
      <html>
        <head><title>Scan WhatsApp QR</title></head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f8f9fa;">
          <div style="text-align:center;">
            <h2>Scan WhatsApp QR Code</h2>
            <img src="${qrDataURL}" alt="WhatsApp QR Code" />
            <p>Once scanned, the WhatsApp client will be ready.</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('❌ Error generating QR code:', err);
    res.status(500).send('Error generating QR code.');
  }
});

client.on('ready', () => console.log('✅ WhatsApp client is ready!'));
client.on('auth_failure', msg => console.error('❌ Auth failed:', msg));
client.on('disconnected', reason => console.log('⚠️ Client disconnected:', reason));

client.initialize();

// ✅ Utility: sleep
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Convert local number to WhatsApp ID
function formatPhoneNumber(number) {
  if (!number) return null;
  number = number.replace(/\D/g, '');        // remove non-digits
  if (number.startsWith('0')) number = '256' + number.slice(1); // add country code
  return number + '@c.us';
}


// ✅ Safe sendMessage wrapper
async function safeSendMessage(client, recipient, content) {
  try {
    await client.sendMessage(recipient, content);
    console.log(`✅ Message sent to: ${recipient}`);
    await sleep(800); // 0.8s delay to prevent Evaluation failed
  } catch (err) {
    console.error(`❌ Failed to send message to ${recipient}:`, err.message);
  }
}

// ✅ Test personal message
/*app.get('/test-personal', async (req, res) => {
  try {
    const number = '256759141177@c.us';
    await safeSendMessage(client, number, '👋 Test personal message from Kookee WhatsApp bot!');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});*/

// ✅ Main order route
app.post('/send-order', async (req, res) => {
  try {
    const recipient = '256775224728@c.us';
     const { order } = req.body || {};   // safer destructure
  if (!order) return res.status(400).json({ success: false, error: "No order provided" });
  console.log('📦 Received body:', req.body);


    if (!order?.items?.length) return res.status(400).json({ success: false, error: "Invalid order data" });
    if (!client.info?.wid) return res.status(503).json({ success: false, error: "WhatsApp client not ready" });

    const customerName = order.customerName || 'Guest';
    const customerPhone = order.customerPhone || '';

    const grandTotal = Number(order.total || order.items.reduce((sum, it) => sum + (Number(it.qty) * Number(it.price || 0)), 0));

    // Chunk items
    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
      return chunks;
    };
    const itemChunks = chunkArray(order.items, 10);

    const images = [];

    // ✅ Puppeteer for receipt screenshots
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    for (let i = 0; i < itemChunks.length; i++) {
      const chunk = itemChunks[i];

      const html = `
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              * { box-sizing: border-box; }
              html, body { margin:0; padding:0; }
              body { display:flex; justify-content:center; font-family: 'Segoe UI', Arial; background:#fff; }
              .receipt { width:460px; padding:20px; border-radius:16px; box-shadow:0 3px 12px rgba(0,0,0,0.08); }
              .title { text-align:center; font-size:22px; margin-bottom:8px; color:#333; }
              .customer { text-align:center; margin-bottom:10px; color:#555; }
              hr { border:none; border-top:1px solid #eee; margin:10px 0; }
              .item { display:flex; gap:12px; padding:8px 0; border-top:1px solid #f3f3f3; }
              .item:first-of-type { border-top:1px solid #eee; }
              .item img { width:65px; height:65px; object-fit:cover; border-radius:10px; background:#fafafa; }
              .name { font-weight:600; color:#222; }
              .muted { color:#555; }
              .subtotal { font-weight:600; color:#111; }
              .total { text-align:right; font-weight:700; font-size:16px; }
              .footer { text-align:center; font-size:12px; color:#888; margin-top:8px; }
            </style>
          </head>
          <body>
            <div class="receipt">
              <div class="title">🛍️ Kookee Order Summary (Page ${i+1}/${itemChunks.length})</div>
              <div class="customer">Customer: <b>${customerName}</b><br>Phone: <b>${customerPhone}</b></div>
              <hr>
              ${chunk.map(it => `
                <div class="item">
                  ${it.image ? `<img src="${it.image}" alt="${it.name}">` : `<div style="width:65px;height:65px;background:#f0f0f0;border-radius:10px;"></div>`}
                  <div>
                    <div class="name">${it.name}</div>
                    <div class="muted">Qty: ${it.qty} × UGX ${Number(it.price||0).toLocaleString()}</div>
                    <div class="subtotal">Subtotal: UGX ${(Number(it.qty)*Number(it.price||0)).toLocaleString()}</div>
                  </div>
                </div>`).join('')}
              <hr>
              <p class="total">Total: UGX ${grandTotal.toLocaleString()}</p>
              <p class="footer">Kookee Enterprises • ${new Date().toLocaleDateString()}</p>
            </div>
          </body>
        </html>
      `;

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.receipt');

      const element = await page.$('.receipt');

// ✅ Get full height of receipt div
const boundingBox = await element.boundingBox();
const fullHeight = Math.ceil(boundingBox.height);

// Set viewport to full receipt height
await page.setViewport({ width: 520, height: fullHeight + 340, deviceScaleFactor: 2 });


// ✅ Screenshot the element
const filePath = `./order_summary_page_${i+1}.png`;
await element.screenshot({ path: filePath, type: 'png' });

      images.push(filePath);
      await page.close();
    }

    await browser.close();

    // ✅ Recipients array
    const allRecipients = [recipient];
   const customerId = formatPhoneNumber(customerPhone);
if (customerId) allRecipients.push(customerId);


    // ✅ Send images safely
    for (const imgPath of images) {
      if (!fs.existsSync(imgPath)) continue;
      const media = MessageMedia.fromFilePath(imgPath);
      for (const r of allRecipients) {
        await safeSendMessage(client, r, media);
      }
      fs.unlink(imgPath, err => { if (err) console.error('❌ Failed to delete temp image:', imgPath); });
    }

    // ✅ Send text summary safely
    const textLines = [`🧾 Kookee Order Summary`, `👤 Customer: ${customerName}`, `📱 Phone: ${customerPhone}`, '————————————'];
    for (const it of order.items) {
      textLines.push(`• *${it.name}*\n   Qty: ${it.qty} × UGX ${Number(it.price||0).toLocaleString()} = UGX ${(Number(it.qty)*Number(it.price||0)).toLocaleString()}`);
    }
    textLines.push('————————————', `💵 Total: UGX ${grandTotal.toLocaleString()}`);
    const textSummary = textLines.join('\n');

    for (const r of allRecipients) {
      await safeSendMessage(client, r, textSummary);
    }

    res.json({ success: true, message: 'Order sent successfully!' });

  } catch (error) {
    console.error('❌ Error sending order:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on http://0.0.0.0:${PORT}`));
