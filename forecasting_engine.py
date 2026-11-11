import numpy as np
from sklearn.linear_model import LinearRegression
import requests
from datetime import datetime, timedelta

def fetch_historical_data(target_currency="INR"):
    """Frankfurter API se pichhle 30 din ka data fetch karta hai"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    
    url = f"https://api.frankfurter.app/{start_date.strftime('%Y-%m-%d')}..{end_date.strftime('%Y-%m-%d')}?from=USD&to={target_currency}"
    
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            rates_dict = data.get("rates", {})
            dates = sorted(rates_dict.keys())
            rates = [rates_dict[d][target_currency] for d in dates]
            return rates
    except Exception as e:
        print(f"Historical Data Error: {e}")
    
    return []

def train_and_predict(rates):
    """Linear Regression model train karke next 3 days predict karta hai"""
    if len(rates) < 5:
        return None, None
        
    X = np.array(range(len(rates))).reshape(-1, 1)
    y = np.array(rates)
    
    model = LinearRegression()
    model.fit(X, y)
    
    # Next 3 days
    future_days = np.array(range(len(rates), len(rates) + 3)).reshape(-1, 1)
    predictions_array = model.predict(future_days)
    
    predictions = []
    for i, pred in enumerate(predictions_array):
        predictions.append({
            "day": f"Day +{i+1}",
            "predicted_rate": round(float(pred), 2)
        })
        
    trend = "UP" if predictions_array[0] > rates[-1] else "DOWN"
    
    return predictions, trend