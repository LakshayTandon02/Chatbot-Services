import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import axios from 'axios';
import { db } from './src/firebase.js';
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getChatResponse } from './src/services/geminiService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Regular JSON middleware
  app.use(express.json());

  // API Routes (Health Check)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // WhatsApp Webhook - Verification (GET)
  app.get('/api/whatsapp/webhook/:businessId', async (req, res) => {
    const { businessId } = req.params;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    try {
      const businessSnap = await getDoc(doc(db, 'businesses', businessId));
      if (!businessSnap.exists()) {
        return res.status(404).send('Business not found');
      }
      const config = businessSnap.data().whatsappConfig;
      
      if (mode === 'subscribe' && token === config?.verifyToken) {
        console.log('WhatsApp Webhook Verified for', businessId);
        res.status(200).send(challenge);
      } else {
        res.status(403).send('Verification failed');
      }
    } catch (error) {
      console.error('Webhook verification error:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // WhatsApp Webhook - Message Handling (POST)
  app.post('/api/whatsapp/webhook/:businessId', async (req, res) => {
    const { businessId } = req.params;
    const body = req.body;

    // Check if it's a message from a user
    if (body.object === 'whatsapp_business_account') {
      if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const message = body.entry[0].changes[0].value.messages[0];
        const from = message.from; // Customer's phone number
        const text = message.text?.body;

        if (text) {
          try {
            // 1. Get Business Context
            const businessSnap = await getDoc(doc(db, 'businesses', businessId));
            if (!businessSnap.exists()) return res.sendStatus(404);
            const businessData = businessSnap.data();
            const config = businessData.whatsappConfig;

            if (!config?.accessToken || !config?.phoneNumberId) {
              console.error('WhatsApp config missing for', businessId);
              return res.sendStatus(400);
            }

            const businessContext = `
              Business Name: ${businessData.name}
              Description: ${businessData.description}
              Services: ${businessData.services}
              Pricing: ${businessData.pricing}
              FAQs: ${businessData.faqs}
            `;

            // 2. Get AI Response
            const aiResponse = await getChatResponse(
              [{ role: 'user', content: text }],
              businessContext,
              businessId
            );

            let botResponse = "";
            if (aiResponse.functionCalls) {
              for (const call of aiResponse.functionCalls) {
                if (call.name === 'bookAppointment') {
                  await addDoc(collection(db, 'appointments'), {
                    ...call.args,
                    businessId,
                    status: 'pending',
                    createdAt: serverTimestamp()
                  });
                  botResponse = "I've scheduled that appointment for you! Our team will confirm it shortly.";
                } else if (call.name === 'collectLead') {
                  await addDoc(collection(db, 'leads'), {
                    ...call.args,
                    businessId,
                    source: 'WhatsApp',
                    status: 'new',
                    createdAt: serverTimestamp()
                  });
                  botResponse = `Thanks ${call.args.name}! I've noted your details and someone will reach out to you.`;
                }
              }
            } else {
              botResponse = aiResponse.text || "I'm sorry, I couldn't process that.";
            }

            // 3. Send Response back to WhatsApp
            await axios.post(
              `https://graph.facebook.com/v17.0/${config.phoneNumberId}/messages`,
              {
                messaging_product: 'whatsapp',
                to: from,
                type: 'text',
                text: { body: botResponse }
              },
              {
                headers: {
                  Authorization: `Bearer ${config.accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );

          } catch (error) {
            console.error('WhatsApp processing error:', error);
          }
        }
      }
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
