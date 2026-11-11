import os
import requests
import numpy as np
from datetime import datetime, timedelta
from sklearn.linear_model import LinearRegression
from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from groq import Groq
import json
from pydantic import BaseModel
from fastapi import FastAPI, Request, Form, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        user_res = supabase.auth.get_user(token)
        if not user_res.user:
            raise HTTPException(status_code=401, detail="Unauthorized")
        return user_res.user.email
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
class UserAuth(BaseModel):
    email: str
    password: str

# .env load karo
load_dotenv()

# Hamare banaye hue local modules import karo
from database import supabase, init_db
from fee_engine import (
    calculate_net_amount, 
    get_timing_signal, 
    get_ai_recommendation, 
    calculate_fee_leakage, 
    calculate_required_invoice, 
    get_smart_chat_response
)

# Server start hone se pehle DB check karo
init_db()

app = FastAPI()

# Static aur Templates folder connect karna
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ==========================================
# HELPER FUNCTIONS
# ==========================================
def get_paypal_token():
    auth = (os.getenv("PAYPAL_CLIENT_ID"), os.getenv("PAYPAL_SECRET"))
    res = requests.post(
        f"{os.getenv('PAYPAL_BASE_URL')}/v1/oauth2/token",
        headers={"Accept": "application/json", "Accept-Language": "en_US"},
        data={"grant_type": "client_credentials"},
        auth=auth
    )
    if res.status_code == 200:
        return res.json().get("access_token")
    return None

def get_live_fx_rate(target_currency="INR"):
    if target_currency == "USD":
        return 1.0
        
    try:
        app_id = os.getenv("OPEN_EXCHANGE_APP_ID")
        if not app_id:
            raise Exception("Open Exchange App ID missing")
            
        # Open Exchange Rates se USD base par rate fetch karo
        url = f"https://openexchangerates.org/api/latest.json?app_id={app_id}"
        response = requests.get(url, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            rates = data.get("rates", {})
            if target_currency in rates:
                market_rate = rates[target_currency]
                # PayPal markup 4% kaat do
                paypal_rate = market_rate * (1 - 0.04)
                return round(paypal_rate, 4)
                    
    except Exception as e:
        print(f"Open Exchange Error: {e}")
        
    # Fallback (agar API fail ho)
    fallback_rates = {"INR": 83.50, "EUR": 0.92, "GBP": 0.79, "AUD": 1.52, "USD": 1.0}
    return fallback_rates.get(target_currency, 1.0)

# ==========================================
# ROUTES
# ==========================================

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.post("/api/predict")
async def predict_payout(
    amount: float = Form(...), 
    from_currency: str = Form("USD"), 
    target_currency: str = Form("INR"),
    credentials: HTTPAuthorizationCredentials = Depends(security) # Token check
):
    # 1. Token Verify karo
    token = credentials.credentials
    try:
        user_res = supabase.auth.get_user(token)
        if not user_res.user:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_email = user_res.user.email
    except:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # ... (Rates fetch karne ka aur calculation ka code jo pehle tha, woh same rahega) ...
    usd_to_inr = get_live_fx_rate("INR")
    usd_to_eur = get_live_fx_rate("EUR")
    usd_to_gbp = get_live_fx_rate("GBP")
    usd_to_aud = get_live_fx_rate("AUD") # Yeh line add karo
    usd_rates = {"INR": usd_to_inr, "EUR": usd_to_eur, "GBP": usd_to_gbp, "AUD": usd_to_aud, "USD": 1.0}
    
    if from_currency == target_currency:
        return {"error": "From and Target currency cannot be same."}

    if from_currency == "USD":
        cross_rate = usd_rates[target_currency]
    elif target_currency == "USD":
        cross_rate = 1 / usd_rates[from_currency]
    else:
        cross_rate = (1 / usd_rates[from_currency]) * usd_rates[target_currency]

    result = calculate_net_amount(amount, cross_rate)
    avg_rate = cross_rate - 0.30 
    signal, diff = get_timing_signal(cross_rate, avg_rate)
    
    result["timing_signal"] = signal
    result["rate_diff_percent"] = diff
    result["currency"] = target_currency
    result["from_currency"] = from_currency
    result["ai_advice"] = get_ai_recommendation(result["net_local"], signal, diff, target_currency)

    # 2. Supabase mein save karo (User ke email ke saath)
    try:
        supabase.table("invoices").insert({
            "user_id": user_email, # Ab user_id mein email jayega
            "amount": amount,
            "currency": from_currency,
            "expected_net": result["net_local"]
        }).execute()
    except Exception as e:
        print(f"Supabase insert error: {e}")

    return result

@app.get("/api/leakage")
async def get_leakage():
    demo_total_usd = 10000.0
    rate = get_live_fx_rate("INR")
    result = calculate_fee_leakage(demo_total_usd, rate)
    return result

@app.get("/api/invoices")
async def get_invoices(current_user: str = Depends(get_current_user)):
    try:
        # Sirf current user ke invoices fetch karo
        response = supabase.table("invoices").select("*").eq("user_id", current_user).order("created_at", desc=True).execute()
        return {"invoices": response.data}
    except Exception as e:
        return {"invoices": [], "error": str(e)}

    
@app.post("/api/reverse-calculate")
async def reverse_calculate(desired_amount: float = Form(...), target_currency: str = Form("INR"), user_currency: str = Form("INR")):
    try:
        # 1. Live rates fetch karo
        usd_to_inr = get_live_fx_rate("INR")
        usd_to_eur = get_live_fx_rate("EUR")
        usd_to_gbp = get_live_fx_rate("GBP")

        # 2. Target Currency ko USD mein convert karo
        if target_currency == "INR":
            desired_usd = desired_amount / usd_to_inr if usd_to_inr else desired_amount
        elif target_currency == "EUR":
            desired_usd = desired_amount / usd_to_eur if usd_to_eur else desired_amount
        elif target_currency == "GBP":
            desired_usd = desired_amount / usd_to_gbp if usd_to_gbp else desired_amount
        else:
            desired_usd = desired_amount

        # 3. Required USD invoice calculate karo (PayPal fees ke saath)
        required_usd = calculate_required_invoice(desired_usd, 1.0)

        # 4. Agar user ke paas INR hai, toh usko INR mein convert karo (Optional info)
        required_in_user_currency = required_usd
        if user_currency == "INR":
            required_in_user_currency = required_usd * usd_to_inr
        elif user_currency == "EUR":
            required_in_user_currency = required_usd * usd_to_eur
        elif user_currency == "GBP":
            required_in_user_currency = required_usd * usd_to_gbp

        return {
            "required_usd": round(required_usd, 2),
            "required_in_user_currency": round(required_in_user_currency, 2),
            "user_currency": user_currency,
            "target_currency": target_currency
        }
    except Exception as e:
        print(f"REVERSE CALC ERROR: {e}")
        return {"error": str(e)}

    
@app.post("/api/optimize-currency")
async def optimize_currency(amount: float = Form(...), base_currency: str = Form("USD")):
    try:
        # 1. USD base par live rates fetch karo
        usd_to_inr = get_live_fx_rate("INR")
        usd_to_eur = get_live_fx_rate("EUR")
        usd_to_gbp = get_live_fx_rate("GBP")
        
        # 2. Base currency ko USD mein convert karo
        if base_currency == "USD":
            amount_in_usd = amount
        elif base_currency == "INR":
            amount_in_usd = amount / usd_to_inr if usd_to_inr else amount
        elif base_currency == "EUR":
            amount_in_usd = amount / usd_to_eur if usd_to_eur else amount
        elif base_currency == "GBP":
            amount_in_usd = amount / usd_to_gbp if usd_to_gbp else amount
        else:
            amount_in_usd = amount
            
        # 3. Results dictionary banao
        results = {}
        
        # INR
        if base_currency != "INR":
            inr_amount = amount_in_usd * usd_to_inr
            results["INR"] = {
                "converted_amount": round(inr_amount, 2),
                "rate": f"1 {base_currency} = {round(inr_amount/amount, 2) if amount else 0} INR",
                "label": f"{base_currency} → INR"
            }

        # EUR
        if base_currency != "EUR":
            eur_amount = amount_in_usd * usd_to_eur
            results["EUR"] = {
                "converted_amount": round(eur_amount, 2),
                "rate": f"1 {base_currency} = {round(eur_amount/amount, 4) if amount else 0} EUR",
                "label": f"{base_currency} → EUR"
            }

        # GBP
        if base_currency != "GBP":
            gbp_amount = amount_in_usd * usd_to_gbp
            results["GBP"] = {
                "converted_amount": round(gbp_amount, 2),
                "rate": f"1 {base_currency} = {round(gbp_amount/amount, 4) if amount else 0} GBP",
                "label": f"{base_currency} → GBP"
            }

        # USD
        if base_currency != "USD":
            results["USD"] = {
                "converted_amount": round(amount_in_usd, 2),
                "rate": f"1 {base_currency} = {round(amount_in_usd/amount, 4) if amount else 0} USD",
                "label": f"{base_currency} → USD"
            }

        # 4. AI Advice (Options Generator)
        options = []
        if base_currency == "INR":
            options.append("Hold INR for local expenses in India.")
            options.append("Convert to USD for international client payments (Best for US clients).")
            options.append("Convert to EUR/GBP for European/UK clients.")
        else:
            options.append(f"Convert {base_currency} to INR for local expenses in India (Highest usable local value).")
            if "USD" in results:
                options.append("Keep in USD if you have international clients or travel plans.")
            if "GBP" in results:
                options.append("Keep in GBP if you frequently deal with UK clients.")
                
        ai_advice = "Based on your balance, here are your best options: " + " ".join(options)

        # 5. Return Statement
        return {
            "base_currency": base_currency,
            "results": results,
            "ai_advice": ai_advice
        }
        
    except Exception as e:
        print(f"OPTIMIZE ERROR: {e}")
        return {"error": str(e)}

@app.post("/api/agent/compare")
async def agent_compare_transfer(amount: float = Form(...), from_currency: str = Form("USD"), to_currency: str = Form("INR")):
    try:
        if from_currency == to_currency:
            return {"success": False, "error": "From and To currencies cannot be the same."}

        usd_to_inr = get_live_fx_rate("INR")
        usd_to_eur = get_live_fx_rate("EUR")
        usd_to_gbp = get_live_fx_rate("GBP")
        usd_to_aud = get_live_fx_rate("AUD") # Naya add kiya
        
        usd_rates = {"INR": usd_to_inr, "EUR": usd_to_eur, "GBP": usd_to_gbp, "AUD": usd_to_aud, "USD": 1.0}

        if from_currency == "USD":
            market_rate = usd_rates[to_currency]
        elif to_currency == "USD":
            market_rate = 1 / usd_rates[from_currency]
        else:
            market_rate = (1 / usd_rates[from_currency]) * usd_rates[to_currency]

        providers = [
            {"name": "PayPal", "markup": 0.04, "flat_fee": 0.30, "percent_fee": 0.044, "speed": "1-2 Days", "color": "#003087"},
            {"name": "Wise", "markup": 0.005, "flat_fee": 1.50, "percent_fee": 0.005, "speed": "1-2 Days", "color": "#9FE870"},
            {"name": "Remitly", "markup": 0.015, "flat_fee": 2.00, "percent_fee": 0.00, "speed": "Instant to 3 Days", "color": "#2A5A9A"},
            {"name": "OFX", "markup": 0.008, "flat_fee": 0.00, "percent_fee": 0.00, "speed": "1-2 Days", "color": "#F15A24"},
            {"name": "Revolut", "markup": 0.005, "flat_fee": 0.00, "percent_fee": 0.005, "speed": "Instant", "color": "#0666EB"}
        ]
        
        results = []
        for p in providers:
            provider_rate = market_rate * (1 - p["markup"])
            flat_fee = p["flat_fee"]
            percent_fee = amount * p["percent_fee"]
            total_fees = flat_fee + percent_fee
            net_amount = (amount - total_fees) * provider_rate
            
            results.append({
                "provider": p["name"],
                "exchange_rate": round(provider_rate, 4),
                "fees": round(total_fees, 2),
                "net_amount": round(net_amount, 2),
                "speed": p["speed"],
                "color": p["color"]
            })
            
        best_provider = max(results, key=lambda x: x["net_amount"])
        
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        prompt = f"""
        A freelancer is transferring {amount} {from_currency} to {to_currency}.
        We compared multiple platforms. The best option is {best_provider['provider']} which gives a net amount of {best_provider['net_amount']} {to_currency}.
        Write a short, 1-2 sentence professional recommendation explaining why this is the best choice based on maximum net amount. 
        Do not mention INR if the target currency is {to_currency}.
        """
        
        ai_response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}]
        )
        
        ai_advice = ai_response.choices[0].message.content
        
        return {
            "success": True,
            "results": results,
            "best_provider": best_provider["provider"],
            "ai_advice": ai_advice
        }
        
    except Exception as e:
        print(f"AGENT ERROR: {e}")
        return {"success": False, "error": str(e)}

@app.get("/api/forecast")
async def get_fx_forecast(from_currency: str = "USD", to_currency: str = "INR"):
    try:
        if from_currency == to_currency:
            return {"error": "From and To currencies cannot be same."}
            
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        
        url = f"https://api.frankfurter.app/{start_date.strftime('%Y-%m-%d')}..{end_date.strftime('%Y-%m-%d')}?from={from_currency}&to={to_currency}"
        response = requests.get(url, timeout=5)
        
        if response.status_code != 200:
            return {"error": "Failed to fetch historical data"}
            
        data = response.json()
        rates_dict = data.get("rates", {})
        
        if not rates_dict:
            return {"error": "No historical data available"}
            
        dates = sorted(rates_dict.keys())
        rates = [rates_dict[d][to_currency] for d in dates]
        
        if len(rates) < 5:
            return {"error": "Not enough historical data to train model"}

        X = np.array(range(len(rates))).reshape(-1, 1)
        y = np.array(rates)
        
        model = LinearRegression()
        model.fit(X, y)
        
        future_days = np.array(range(len(rates), len(rates) + 3)).reshape(-1, 1)
        predictions_array = model.predict(future_days)
        
        predictions = []
        for i, pred in enumerate(predictions_array):
            predictions.append({
                "day": f"Day +{i+1}",
                "predicted_rate": round(float(pred), 4)
            })
            
        current_rate = rates[-1]
        
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        prompt = f"""
        You are a financial AI. The current {from_currency} to {to_currency} rate is {current_rate}.
        Our Machine Learning model predicts the rate for the next 3 days as: {predictions}.
        Write a short, 2-sentence professional forecast explaining whether the rate is likely to go UP or DOWN based on this ML prediction, and give quick advice to the freelancer.
        """
        
        ai_response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}]
        )
        
        ai_forecast = ai_response.choices[0].message.content
        trend = "UP" if predictions_array[0] > current_rate else "DOWN"
        
        return {
            "current_rate": round(current_rate, 4),
            "predictions": predictions,
            "trend": trend,
            "ai_forecast": ai_forecast
        }
        
    except Exception as e:
        print(f"FORECAST ERROR: {e}")
        return {"error": str(e)}

# In-memory alerts storage (Demo ke liye)
USER_ALERTS = []

@app.post("/api/alerts/set")
async def set_alert(target_rate: float = Form(...), currency: str = Form("INR")):
    USER_ALERTS.append({"currency": currency, "target": target_rate})
    return {"success": True, "message": f"Alert set for 1 USD >= {target_rate} {currency}"}

@app.get("/api/alerts/check")
async def check_alerts():
    triggered = []
    current_rate = get_live_fx_rate("INR") # Default check ke liye
    
    for alert in USER_ALERTS:
        if alert["currency"] == "INR" and current_rate >= alert["target"]:
            triggered.append(f"🚀 Target Hit! USD/INR is now {current_rate} (Target: {alert['target']})")
            
    return {"triggered": triggered}


# ==========================================
# AUTH ROUTES (Supabase Auth)
# ==========================================

@app.post("/api/auth/signup")
async def signup(user: UserAuth):
    try:
        # Supabase mein user banao
        response = supabase.auth.sign_up({
            "email": user.email,
            "password": user.password
        })
        return {"success": True, "message": "Signup successful! Please login."}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/auth/login")
async def login(user: UserAuth):
    try:
        # Supabase se login karo
        response = supabase.auth.sign_in_with_password({
            "email": user.email,
            "password": user.password
        })
        return {
            "success": True, 
            "access_token": response.session.access_token,
            "user": {"email": response.user.email}
        }
    except Exception as e:
        return {"success": False, "error": "Invalid email or password"}


@app.get("/api/analytics")
async def get_analytics(current_user: str = Depends(get_current_user)):
    try:
        response = supabase.table("invoices").select("*").eq("user_id", current_user).execute()
        invoices = response.data
        
        total_gross_usd = sum([inv['amount'] for inv in invoices]) if invoices else 0
        total_net_local = sum([inv['expected_net'] for inv in invoices if inv['expected_net']]) if invoices else 0
        total_invoices = len(invoices)
        
        total_fees = (total_gross_usd * 0.044) + ((total_gross_usd * (1 - 0.044)) * 0.04)
        rate = get_live_fx_rate("INR")
        total_fees_local = total_fees * rate
        
        return {
            "total_invoices": total_invoices,
            "total_gross_usd": round(total_gross_usd, 2),
            "total_net_local": round(total_net_local, 2),
            "total_fees_local": round(total_fees_local, 2)
        }
    except Exception as e:
        print(f"ANALYTICS ERROR: {e}")
        return {"total_invoices": 0, "total_net_local": 0, "total_fees_local": 0}

@app.post("/api/chat")
async def chat_with_agent(message: str = Form(...)):
    try:
        rate = get_live_fx_rate("INR")
        
        # AI ko dene ke liye calculations
        calc_1000 = calculate_net_amount(1000, rate)
        net_1000 = calc_1000["net_local"]
        invoice_req_50k = calculate_required_invoice(50000, rate)
        
        # AI se jawab mangwao
        ai_reply = get_smart_chat_response(message, rate, net_1000, invoice_req_50k)
        
        # Agar AI reply None hai, toh fallback message do
        if not ai_reply:
            ai_reply = "I'm having trouble analyzing the data right now. Please try again."
            
        return {"reply": ai_reply}
    except Exception as e:
        print(f"CHAT ERROR: {e}")
        return {"reply": "Sorry, I am unable to connect to the AI right now."}