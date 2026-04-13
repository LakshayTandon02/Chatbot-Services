import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { db } from './firebase';
import { doc, getDocFromCache, getDocFromServer } from 'firebase/firestore';

async function testConnection() {
  try {
    // Attempt to fetch a non-existent doc to test connection
    await getDocFromServer(doc(db, '_connection_test', 'ping'));
    console.log("Firebase connection successful");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Firebase connection error: The client is offline. Please check your configuration.");
    }
  }
}

testConnection();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
