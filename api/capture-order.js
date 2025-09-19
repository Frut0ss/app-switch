// IMPORTANT: Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in your Vercel project environment variables.
// You can do this in the Vercel dashboard under Project Settings > Environment Variables.

import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
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

    const captureRes = await fetch(`${base}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await captureRes.json();
    console.log("[API] Capture response:", data);
    res.status(200).json(data);
  } catch (err) {
    console.error("Capture Order Error:", err);
    res.status(500).json({ error: "Failed to capture order" });
  }
}
