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

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { orderID } = req.body;
    if (!orderID) {
      return res.status(400).json({ error: "Missing orderID" });
    }

    console.log({
      event: "capture_start",
      orderID
    });

    const base = "https://api-m.sandbox.paypal.com";
    const auth = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    // Get access token
    const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenRes.ok) {
      console.error("Token Error:", await tokenRes.text());
      return res.status(tokenRes.status).json({ error: "Failed to get access token" });
    }

    const { access_token } = await tokenRes.json();

    // Check order status first
    const orderRes = await fetch(`${base}/v2/checkout/orders/${orderID}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    });
    
    const orderData = await orderRes.json();
    console.log({
      event: "order_status_check",
      orderID,
      status: orderData.status,
      experienceStatus: orderData.payment_source?.paypal?.experience_status
    });

    // Only APPROVED orders can be captured
    if (orderData.status !== "APPROVED") {
      return res.status(400).json({
        error: "Order not approved",
        status: orderData.status,
        details: orderData
      });
    }

    // Capture the order
    const captureRes = await fetch(`${base}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `capture_${orderID}_${Date.now()}`,
        "Accept": "application/json"
      },
    });

    const data = await captureRes.json();
    console.log({
      event: "capture_complete",
      orderID,
      status: data.status,
      result: captureRes.ok ? "success" : "failed"
    });

    if (!captureRes.ok) {
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
