# RateMate: AI Financial Agent for Global Freelancers 🚀

RateMate is an AI-powered financial intelligence platform designed to help international freelancers maximize their net payouts. It brings transparency to cross-border payments, predicts future FX rates using Machine Learning, and autonomously compares multiple transfer platforms to recommend the best route.

## 🎯 Problem Statement
International freelancers often struggle with "cash flow blindness"—they don't know their exact net payout until the transaction is complete. Cross-border payments involve complex fee structures and fluctuating FX rates, making it difficult for freelancers to plan their finances and choose the optimal time to withdraw funds.

## 💡 Our Solution
RateMate acts as a smart financial copilot. It empowers freelancers by providing complete transparency before they invoice. Our AI tells them the optimal time to withdraw and helps them choose the most cost-effective transfer route.

## ✨ Key Features
1. **Smart Net Payout Calculator:** Exact net amount calculation across multiple currencies with real-time FX rates.
2. **Reverse Calculator:** "I want to receive ₹50,000" → Tells you how much to invoice your client.
3. **Agentic AI Transfer Optimizer:** Compares PayPal, Wise, Remitly, OFX, and Revolut to find the best net payout, highlighting "BEST VALUE" and "⚡ FASTEST" options.
4. **ML FX Forecasting:** Uses Scikit-Learn (Linear Regression) on 30-day historical data to predict the next 3-day FX trend, visualized with Chart.js.
5. **Smart FX Alerts:** Set target rates for any currency and get AI-suggested target prices based on ML predictions.
6. **AI Copilot:** A floating chatbot powered by Groq (GPT-OSS-120B) to answer financial queries in natural language.
7. **Freelancer Analytics:** Tracks total earnings, fees paid, and invoice history securely using Supabase.
8. **Secure Authentication:** Real user login/signup system using Supabase Auth (JWT Tokens).

## 🛠️ Tech Stack
*   **Backend:** Python, FastAPI
*   **Frontend:** HTML5, CSS3, Vanilla JavaScript, Chart.js
*   **Database & Auth:** Supabase (PostgreSQL)
*   **AI/ML:** Groq API (LLM), Scikit-Learn, NumPy
*   **Sponsor Tools:** AG Grid (for Ledger), Render (Deployment)
*   **External APIs:** Frankfurter API (Live FX), PayPal Sandbox APIs (OAuth & FX Quotes)

## 🚀 How to Run Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jadhavaakash41074-dev/ratemate.git
   cd ratemate

2 .Create a virtual environment and activate it:
bash
python -m venv venv
# On Windows:
.\venv\Scripts\activate

3.Install dependencies:
bash
pip install -r requirements.txt

4.Set up Environment Variables:
Create a .env file in the root directory and add your keys:

env
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_SECRET=your_paypal_secret
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
GROQ_API_KEY=your_groq_api_key

5.Run the FastAPI server:

bash
uvicorn main:app --reload
Open http://127.0.0.1:8000 in your browser.

🏆 Hackathon Track
Built for the PayPal AI Hackathon 2026.

Track: Agentic Commerce & Fintech Automation

Live Demo: [Link to Render Deployment]