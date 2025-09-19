import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(__dirname)); // serves index.html

const base = "https://api-m.sandbox.paypal.com";

async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Failed to get access token: ${res.status}`);
  }
  const data = await res.json();
  return data.access_token;
}


// Create order with App Switch opt-in
app.post("/api/create-order", async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const buyerUserAgent = req.headers["user-agent"]; // raw UA string

    const response = await fetch(`${base}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        payment_source: {
          paypal: {
            email_address: "customer@example.com", // optional
            experience_context: {
              user_action: "PAY_NOW",
              return_url: "http://localhost:3000/#return", // 🔑 must be same
              cancel_url: "http://localhost:3000/#cancel",
              app_switch_context: {
                mobile_web: {
                  return_flow: "AUTO", // or "MANUAL"
                  buyer_user_agent: buyerUserAgent, // mandatory
                },
              },
            },
          },
        },
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: "64.00",
            },
          },
        ],
      }),
    });

    const data = await response.json();
    console.log("Order created:", data);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Capture order after approval
app.post("/api/capture-order", async (req, res) => {
  try {
    const { orderID } = req.body;
    const accessToken = await getAccessToken();

    const response = await fetch(`${base}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    console.log("Order captured:", data);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to capture order" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
