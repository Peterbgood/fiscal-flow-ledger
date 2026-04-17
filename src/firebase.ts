import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAe1_5s7ujsaVC9_8tcaVbIgn78-dCpViU", // Note: Usually keep this in an .env file!
  authDomain: "quick-crud-3dea0.firebaseapp.com",
  projectId: "quick-crud-3dea0",
  storageBucket: "quick-crud-3dea0.firebasestorage.app",
  messagingSenderId: "154946577128",
  appId: "1:154946577128:web:f67ea342c6aca587bf5f5d",
  measurementId: "G-S4GG97PQ72"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore and export it so App.tsx can use it
export const db = getFirestore(app);