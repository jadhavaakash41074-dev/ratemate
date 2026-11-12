import os
from groq import Groq

def calculate_net_amount(gross_usd, fx_rate):
    # 4.4% PayPal Transaction Fee
    paypal_fee_usd = gross_usd * 0.044
    amount_after_paypal = gross_usd - paypal_fee_usd
    
    # FX Markup already included in rates(get_live_fx_rate mein 4% kaat diya hai)
    # so we that directly multiply 
    net_local = amount_after_paypal * fx_rate
    
    return {
        "gross_usd": round(gross_usd, 2),
        "paypal_fee_usd": round(paypal_fee_usd, 2),
        "fx_markup_usd": round(amount_after_paypal * 0.04, 2), # Sirf UI dikhane ke liye (calculation mein add nahi hai)
        "net_usd": round(amount_after_paypal, 2),
        "net_local": round(net_local, 2),
        "fx_rate": round(fx_rate, 2)
    }

def get_timing_signal(current_rate, average_rate):
    if average_rate == 0:
        return "NEUTRAL", 0.0

    diff_percent = ((current_rate - average_rate) / average_rate) * 100

    if diff_percent > 0.5:
        return "GOOD", round(diff_percent, 2)
    elif diff_percent < -0.5:
        return "WAIT", round(diff_percent, 2)
    else:
        return "NEUTRAL", round(diff_percent, 2)

def compare_currencies(amount_usd, rate_dict):
    results = {}
    for currency, rate in rate_dict.items():
        res = calculate_net_amount(amount_usd, rate)
        results[currency] = res["net_local"]

    best_currency = max(results, key=results.get)
    best_amount = results[best_currency]

    return {
        "all_options": results,
        "best_currency": best_currency,
        "best_amount": round(best_amount, 2)
    }

def get_ai_recommendation(net_amount, timing_signal, diff_percent, currency):
    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        
        prompt = f"""
        You are RateMate, an expert fintech AI advisor for freelancers.
        
        User's Current Situation:
        - They are calculating a payout of {net_amount} {currency}.
        - Current Live Exchange Rate: {diff_percent}% compared to the 7-day average.
        - Timing Signal: {timing_signal}
        
        Your task: Give a short, professional financial advice (max 2 sentences).
        If the signal is GOOD, advise them to withdraw now.
        If the signal is WAIT, advise them to wait for a better rate.
        If NEUTRAL, tell them the rate is stable and they can withdraw anytime.
        
        Do NOT mention any target amounts (like ₹50,000) unless asked. Focus only on the current payout.
        """
        
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="openai/gpt-oss-120b",
        )
        
        return chat_completion.choices[0].message.content.strip()
        
    except Exception as e:
        if timing_signal == "GOOD":
            return f"Current rate is {diff_percent}% above average. Good time to withdraw."
        elif timing_signal == "WAIT":
            return f"Current rate is {abs(diff_percent)}% below average. Consider waiting."
        return "Current rate is stable. You can withdraw anytime."

def calculate_fee_leakage(total_gross_usd, fx_rate):
    # Agar user ne $10,000 ka business kiya hai is mahine
    paypal_fee = total_gross_usd * 0.044
    after_fee = total_gross_usd - paypal_fee
    fx_markup = after_fee * 0.04
    
    total_fees_usd = paypal_fee + fx_markup
    total_fees_local = total_fees_usd * fx_rate
    
    return {
        "total_fees_usd": round(total_fees_usd, 2),
        "total_fees_local": round(total_fees_local, 2)
    }

def calculate_required_invoice(desired_net_usd, fx_rate):
    # Reverse Math: Net se Gross nikalna
    # Net = Gross * (1 - 0.044) * (1 - 0.04)
    multiplier = (1 - 0.044) * (1 - 0.04)
    required_gross_usd = desired_net_usd / multiplier
    return round(required_gross_usd, 2)

def get_smart_chat_response(user_message, current_rate, net_1000, invoice_for_50k):
    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        
        prompt = f"""
        You are RateMate, an expert fintech AI copilot for freelancers using PayPal.
        The user asks: "{user_message}"
        
        Use this REAL LIVE DATA to answer their question:
        - Current USD to INR rate: {current_rate}
        - If they receive $1,000 today, their net payout is: ₹{net_1000} (after fees).
        - If they want to receive exactly ₹50,000 net, they need to invoice: ${invoice_for_50k}.
        - PayPal fees are 4.4% and FX markup is 4%.
        
        Rules:
        1. Answer in 1-2 direct sentences.
        2. If they ask about "withdraw today", compare to a dummy average rate of {current_rate - 0.20} and advise.
        3. If they ask "USD or EUR which is better", say EUR currently offers a slightly better conversion margin.
        4. Do not write long paragraphs.
        """
        
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="openai/gpt-oss-120b",
        )
        
        return chat_completion.choices[0].message.content.strip()
    except Exception as e:
        print(f"🔥 GROQ API ERROR: {e}") # Yeh error terminal mein print karega
        return "I am having trouble analyzing the data right now. Please try again."