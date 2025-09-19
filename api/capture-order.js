// IMPORTANT: Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in your Vercel project environment variables.
// You can do this in the Vercel dashboard under Project Settings > Environment Variables.

import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    console.log("[API] Starting capture for orderID:", req.body?.orderID);
    const { orderID } = req.body;
    const base = "https://api-m.sandbox.paypal.com";
    const auth = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const { access_token } = await tokenRes.json();

    // First, get the order details to check its status
    const orderRes = await fetch(`${base}/v2/checkout/orders/${orderID}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    });
    
    const orderData = await orderRes.json();
    console.log("Order status before capture:", orderData);

    if (orderData.status !== "APPROVED") {
      console.log("Cannot capture order, status is:", orderData.status);
      return res.status(400).json({
        error: "Order not approved",
        status: orderData.status,
        details: orderData
      });
    }

    const captureRes = await fetch(`${base}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": orderID, // Idempotency key
        "Accept": "application/json"
      },
    });

    const data = await captureRes.json();
    console.log("Order capture response:", data);

    if (!captureRes.ok) {
      console.error("Capture failed:", data);
      return res.status(captureRes.status).json({
        error: "Capture failed",
        details: data
      });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("Capture Order Error:", err);
    res.status(500).json({ error: "Failed to capture order" });
  }
}
