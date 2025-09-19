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
      const error = await tokenRes.text();
      console.error("Token Error:", error);
      return res.status(tokenRes.status).json({ error: "Failed to get access token" });
    }

    const { access_token } = await tokenRes.json();

    // Get user agent and check device type
    const buyerUserAgent = req.headers["user-agent"];
    const isMobile = /iPhone|iPad|iPod|Android/i.test(buyerUserAgent);
    
    console.log({
      event: "create_order_start",
      userAgent: buyerUserAgent,
      isMobile,
      timestamp: new Date().toISOString(),
      environment: "sandbox"
    });

    // Base URL for redirects
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : req.headers.origin || 'http://localhost:3000';

    // Same URL for both return and cancel (required for mobile web)
    const returnUrl = `${baseUrl}/#return`;

    // Create order with App Switch context for mobile
    const orderRes = await fetch(`${base}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "PayPal-Partner-Attribution-Id": "PPCP",
        "PayPal-Request-Id": `order_${Date.now()}`,
        "Accept": "application/json",
        "PayPal-Client-Metadata-Id": `${Date.now()}`, // Add unique client metadata ID
        "PayPal-Request-Source": "MOBILE_WEB_CHECKOUT" // Indicate mobile web source
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        payment_source: {
          paypal: {
            // Always include app_switch_context for proper eligibility check
            app_switch_context: {
              mobile_web: {
                return_flow: "AUTO",
                buyer_user_agent: buyerUserAgent
              }
            },
            experience_context: {
              user_action: "PAY_NOW",
              return_url: returnUrl,
              cancel_url: returnUrl,
              payment_method_selected: "PAYPAL",
              landing_page: "LOGIN",
              shipping_preference: "NO_SHIPPING",
              brand_name: "Your Store", // Add brand name
              locale: "en-US", // Add locale
            }
          }
        },
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: "64.00"
            }
          }
        ]
      })
    });

    const data = await orderRes.json();
    
    console.log({
      event: "order_created",
      orderId: data.id,
      status: data.status,
      appSwitchEligibility: data.payment_source?.paypal?.app_switch_eligibility,
      paymentSource: data.payment_source,
      timestamp: new Date().toISOString(),
      links: data.links
    });

    if (!orderRes.ok) {
      console.error("Order creation failed:", data);
      return res.status(orderRes.status).json(data);
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("Create Order Error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
}
