document.addEventListener("DOMContentLoaded", () => {
    
    // 1. AG Grid Initialization (Dashboard)
    
    const dashboardGridOptions = {
        columnDefs: [
            { field: "date", headerName: "Date" },
            { field: "client", headerName: "Client" },
            { field: "amount", headerName: "Amount", valueFormatter: params => params.value },
            { field: "currency", headerName: "Currency" },
            { field: "status", headerName: "Status" }
        ],
        rowData: [],
        domLayout: 'autoHeight',
        defaultColDef: { flex: 1, minWidth: 100, resizable: true }
    };
    const dashboardGridDiv = document.querySelector('#myGrid');
    if (dashboardGridDiv) {
        new agGrid.Grid(dashboardGridDiv, dashboardGridOptions);
    }

    
    // 2. AG Grid Initialization (Invoices Tab)

    const invoicesGridOptions = {
        columnDefs: [
            { field: "id", headerName: "Invoice ID" },
            { field: "date", headerName: "Date" },
            { field: "amount", headerName: "Amount", valueFormatter: params => params.value },
            { field: "currency", headerName: "Currency" },
                        { 
                field: "expected_net", 
                headerName: "Expected Net", 
                valueFormatter: params => {
                    if (!params.data) return '₹' + (params.value ? params.value.toFixed(2) : '0.00');
                    
                    // Row ke currency column se symbol nikaalo
                    let sym = "₹";
                    if (params.data.currency === 'EUR') sym = "€";
                    if (params.data.currency === 'GBP') sym = "£";
                    if (params.data.currency === 'AUD') sym = "A$";
                    if (params.data.currency === 'USD') sym = "$";
                    
                    return `${sym}${params.value ? params.value.toFixed(2) : '0.00'}`;
                }
            },
            { field: "status", headerName: "Status" }
        ],
        rowData: [],
        domLayout: 'normal',
        defaultColDef: { flex: 1, minWidth: 120, resizable: true }
    };
    const invoicesGridDiv = document.querySelector('#invoicesGrid');
    if (invoicesGridDiv) {
        new agGrid.Grid(invoicesGridDiv, invoicesGridOptions);
    }

    // 3. Tab Switching Logic
    
    window.switchTab = function(tabName) {
        document.getElementById('dashboard-section').style.display = 'none';
        document.getElementById('invoices-section').style.display = 'none';
        
        const agentSection = document.getElementById('agent-section');
        if (agentSection) agentSection.style.display = 'none';
        
        const forecastSection = document.getElementById('forecast-section');
        if (forecastSection) forecastSection.style.display = 'none';

        document.getElementById('nav-dashboard').classList.remove('active');
        document.getElementById('nav-invoices').classList.remove('active');
        
        const navAgent = document.getElementById('nav-agent');
        if (navAgent) navAgent.classList.remove('active');
        
        const navForecast = document.getElementById('nav-forecast');
        if (navForecast) navForecast.classList.remove('active');

        if (tabName === 'dashboard') {
            document.getElementById('dashboard-section').style.display = 'block';
            document.getElementById('nav-dashboard').classList.add('active');
            setTimeout(() => { if(dashboardGridDiv) dashboardGridOptions.api.sizeColumnsToFit(); }, 100);
        } else if (tabName === 'invoices') {
            document.getElementById('invoices-section').style.display = 'block';
            document.getElementById('nav-invoices').classList.add('active');
            fetchAllInvoices(); 
        } else if (tabName === 'agent') {
            if (agentSection) agentSection.style.display = 'block';
            if (navAgent) navAgent.classList.add('active');
        } else if (tabName === 'forecast') {
            if (forecastSection) forecastSection.style.display = 'block';
            if (navForecast) navForecast.classList.add('active');
        }
    };

    // 4. Form Submit Logic (Calculate Payout)

    const form = document.getElementById('predictForm');
    const calcBtn = document.getElementById('calcBtn');
    const resultCard = document.getElementById('resultCard');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('amount').value;
            const invoiceCurrency = document.getElementById('invoiceCurrency').value; 
            const targetCurrency = document.getElementById('currency').value; 
            
            calcBtn.innerText = "AI is calculating...";
            calcBtn.disabled = true;

            try {
                const formData = new FormData();
                formData.append('amount', amount);
                formData.append('from_currency', invoiceCurrency); 
                formData.append('target_currency', targetCurrency); 

                const token = localStorage.getItem('rateMateToken');
                const response = await fetch('/api/predict', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                });
                
                if (!response.ok) throw new Error("Server Error");
                
                const data = await response.json();
                displayResults(data, targetCurrency); 
                resultCard.style.opacity = '1';
                
                const newRow = { 
                    date: new Date().toISOString().split('T')[0], 
                    client: `Invoice (${invoiceCurrency})`, 
                    amount: parseFloat(amount), 
                    currency: targetCurrency, 
                    status: "Calculated" 
                };
                if (dashboardGridOptions.api) {
                    dashboardGridOptions.api.applyTransaction({ add: [newRow] });
                }

            } catch (error) {
                alert("Error connecting to backend! Check console.");
                console.error(error);
            } finally {
                calcBtn.innerText = "Calculate Net Payout";
                calcBtn.disabled = false;
            }
        });
    }

    // 5. Display Results & Update Simulator

    function displayResults(data, currency) {
        let invoiceSymbol = "$";
        let fromCurr = data.from_currency || "USD"; 
        
        if (fromCurr === 'USD') invoiceSymbol = "$";
        else if (fromCurr === 'EUR') invoiceSymbol = "€";
        else if (fromCurr === 'GBP') invoiceSymbol = "£";
        else if (fromCurr === 'AUD') invoiceSymbol = "A$";

        let targetSymbol = "₹";
        if(currency === 'EUR') targetSymbol = "€";
        if(currency === 'GBP') targetSymbol = "£";
        if(currency === 'AUD') targetSymbol = "A$";
        if(currency === 'USD') targetSymbol = "$";

        document.getElementById('netLocal').innerText = `${targetSymbol}${data.net_local.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('netUsd').innerText = `(${invoiceSymbol}${data.net_usd.toLocaleString()} ${fromCurr})`;
        
        document.getElementById('grossUsd').innerText = `${invoiceSymbol}${data.gross_usd}`;
        document.getElementById('paypalFee').innerText = `-${invoiceSymbol}${data.paypal_fee_usd}`;
        document.getElementById('fxMarkup').innerText = `-${invoiceSymbol}${data.fx_markup_usd}`;
        document.getElementById('fxRate').innerText = `1 ${fromCurr} = ${data.fx_rate} ${currency}`;

        let aiText = "";
        let aiBox = document.getElementById('aiBox');
        
        if (data.timing_signal === "GOOD") {
            aiText = data.ai_advice || `Current live rate is ${data.rate_diff_percent}% above average. Withdraw now.`;
            aiBox.style.borderLeftColor = "#10b981"; 
        } else if (data.timing_signal === "WAIT") {
            aiText = data.ai_advice || `Current live rate is ${Math.abs(data.rate_diff_percent)}% below average. Wait for a better rate.`;
            aiBox.style.borderLeftColor = "#ef4444"; 
        } else {
            aiText = data.ai_advice || `Current live rate is stable. You can withdraw anytime.`;
            aiBox.style.borderLeftColor = "#38bdf8"; 
        }
        document.getElementById('aiText').innerText = aiText;

        window.currentBasePayout = data.net_local;
        window.currentCurrencySymbol = targetSymbol; 
        window.currentFxRate = data.fx_rate;
        
        if (document.getElementById('rateSlider')) {
            document.getElementById('rateSlider').value = 0;
            document.getElementById('rateChangeValue').innerText = "0%";
            updateSimulator(0);
        }
    }

    // 6. Fetch All Invoices (For the Invoices Tab)

    async function fetchAllInvoices() {
        try {
            const token = localStorage.getItem('rateMateToken');
            const response = await fetch('/api/invoices', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            
            if (data.invoices && data.invoices.length > 0) {
                if (invoicesGridOptions.api) {
                    invoicesGridOptions.api.setRowData([]);
                    const formattedData = data.invoices.map(inv => ({
                        id: inv.id,
                        date: new Date(inv.created_at).toLocaleDateString(),
                        amount: inv.amount,
                        currency: inv.currency,
                        expected_net: inv.expected_net,
                        status: inv.status || "Pending"
                    }));
                    invoicesGridOptions.api.applyTransaction({ add: formattedData });
                }
            }
        } catch (error) {
            console.error("Failed to load invoices", error);
        }
    }

    // 7. Smart Savings Insight & Analytics (UPDATED)
    

        async function fetchAnalyticsAndSavings() {
        try {
            const token = localStorage.getItem('rateMateToken');
            const response = await fetch('/api/analytics', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            
            if (!data.error && data.total_invoices !== undefined) {
                document.getElementById('statInvoices').innerText = data.total_invoices;
                document.getElementById('statNet').innerText = `₹${data.total_net_local.toLocaleString('en-IN')}`;
                document.getElementById('statFees').innerText = `₹${data.total_fees_local.toLocaleString('en-IN')}`;
                // ...
            }
        } catch (error) {
            console.error("Analytics fetch failed", error);
        }
    }
    fetchAnalyticsAndSavings();

    
    // 8. Reverse Calculator Logic (Dynamic Currency)

    const reverseCalcBtn = document.getElementById('reverseCalcBtn');
    if (reverseCalcBtn) {
        reverseCalcBtn.addEventListener('click', async () => {
            const desiredAmount = document.getElementById('desiredInr').value;
            const targetCurrency = document.getElementById('reverseCurrency').value;
            const userCurrency = document.getElementById('reverseUserCurrency').value;

            let sym = "₹";
            if (targetCurrency === 'EUR') sym = "€";
            if (targetCurrency === 'GBP') sym = "£";
            if (targetCurrency === 'USD') sym = "$";
            
            document.getElementById('reverseSymbol').innerText = sym;

            reverseCalcBtn.innerText = "Calculating...";
            reverseCalcBtn.disabled = true;

            try {
                const formData = new FormData();
                formData.append('desired_amount', desiredAmount);
                formData.append('target_currency', targetCurrency);
                formData.append('user_currency', userCurrency);

                const response = await fetch('/api/reverse-calculate', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                // Symbols selection                let targetSym = "₹";
                if (targetCurrency === 'EUR') targetSym = "€";
                if (targetCurrency === 'GBP') targetSym = "£";
                if (targetCurrency === 'USD') targetSym = "$";

                let userSym = "₹";
                if (userCurrency === 'EUR') userSym = "€";
                if (userCurrency === 'GBP') userSym = "£";
                if (userCurrency === 'USD') userSym = "$";

                alert(`To receive ${targetSym}${parseFloat(desiredAmount).toLocaleString('en-IN')} ${targetCurrency} net, you need to invoice your client: $${data.required_usd} USD.\n\nThis will cost you approximately ${userSym}${data.required_in_user_currency.toLocaleString('en-IN')} ${userCurrency}.`);
                
            } catch (error) {
                alert("Error calculating reverse amount");
            } finally {
                reverseCalcBtn.innerText = "Get Invoice Amount";
                reverseCalcBtn.disabled = false;
            }
        });
    }

    
    // 9. What-If Simulator Logic
   
    const rateSlider = document.getElementById('rateSlider');
    const rateChangeValue = document.getElementById('rateChangeValue');
    const simulatedPayout = document.getElementById('simulatedPayout');

    if (rateSlider) {
        rateSlider.addEventListener('input', function() {
            const changePercent = parseFloat(this.value);
            rateChangeValue.innerText = `${changePercent > 0 ? '+' : ''}${changePercent}%`;
            updateSimulator(changePercent);
        });
    }

    function updateSimulator(changePercent) {
        if (!window.currentBasePayout || !window.currentFxRate) {
            if(simulatedPayout) simulatedPayout.innerText = "Calculate an invoice first";
            return;
        }
        const newPayout = window.currentBasePayout * (1 + (changePercent / 100));
        let symbol = window.currentCurrencySymbol || "₹"; 
        if(simulatedPayout) simulatedPayout.innerText = `${symbol}${newPayout.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }

    // ==========================================
    // 10. AI Chatbot Logic (Floating Widget)
    // ==========================================
    window.toggleChat = function() {
        const chatWidget = document.getElementById('chatWidget');
        if (chatWidget.style.display === 'none' || chatWidget.style.display === '') {
            chatWidget.style.display = 'flex';
        } else {
            chatWidget.style.display = 'none';
        }
    }

    window.askCopilot = function(message) {
        const chatWidget = document.getElementById('chatWidget');
        if (chatWidget.style.display === 'none' || chatWidget.style.display === '') {
            toggleChat();
        }
        document.getElementById('chatInput').value = message;
        document.getElementById('chatBtn').click();
    }

    const chatBtn = document.getElementById('chatBtn');
    const chatInput = document.getElementById('chatInput');
    const chatHistory = document.getElementById('chatHistory');

    if (chatBtn && chatInput) {
        chatBtn.addEventListener('click', async () => {
            const message = chatInput.value.trim();
            if (!message) return;

            appendMessage(message, 'user-msg');
            chatInput.value = '';
            
            chatBtn.innerText = "...";
            chatBtn.disabled = true;

            try {
                const formData = new FormData();
                formData.append('message', message);

                const response = await fetch('/api/chat', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                
                appendMessage(data.reply, 'ai-msg');
                
            } catch (error) {
                appendMessage("Error connecting to AI.", 'ai-msg');
            } finally {
                chatBtn.innerText = "Send";
                chatBtn.disabled = false;
            }
        });
        
        chatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                chatBtn.click();
            }
        });
    }

    function appendMessage(text, type) {
        const msgDiv = document.createElement('div');
        msgDiv.innerText = text;
        msgDiv.style.padding = '10px';
        msgDiv.style.borderRadius = '8px';
        msgDiv.style.maxWidth = '85%';
        msgDiv.style.fontSize = '0.9rem';
        msgDiv.style.wordWrap = 'break-word';

        if (type === 'user-msg') {
            msgDiv.style.backgroundColor = '#0ea5e9';
            msgDiv.style.color = 'white';
            msgDiv.style.alignSelf = 'flex-end';
        } else {
            msgDiv.style.backgroundColor = '#1e293b';
            msgDiv.style.color = '#cbd5e1';
            msgDiv.style.alignSelf = 'flex-start';
        }

        chatHistory.appendChild(msgDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    // Initial Load
    fetchAllInvoices(); 

    // 13. Multi-Currency Optimizer Logic

    const optimizeBtn = document.getElementById('optimizeBtn');
    if (optimizeBtn) {
        optimizeBtn.addEventListener('click', async () => {
            const amount = document.getElementById('optimizeAmount').value;
            const baseCurrency = document.getElementById('baseCurrency').value;
            
            optimizeBtn.innerText = "Comparing...";
            optimizeBtn.disabled = true;

            try {
                const formData = new FormData();
                formData.append('amount', amount);
                formData.append('base_currency', baseCurrency);

                const response = await fetch('/api/optimize-currency', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                
                const resultsContainer = document.getElementById('optimizeResults');
                resultsContainer.style.display = 'grid';
                document.getElementById('bestCurrencyBox').style.display = 'block';
                
                document.querySelectorAll('.card[id^="box-"]').forEach(box => box.style.display = 'none');

                for (const [currency, info] of Object.entries(data.results)) {
                    const box = document.getElementById(`box-${currency}`);
                    if (box) {
                        box.style.display = 'block'; 
                        
                        let symbol = "";
                        if (currency === "USD") symbol = "$";
                        if (currency === "EUR") symbol = "€";
                        if (currency === "GBP") symbol = "£";
                        if (currency === "INR") symbol = "₹";

                        box.querySelector('.box-label').innerText = info.label;
                        box.querySelector('.box-value').innerText = `${symbol}${info.converted_amount.toLocaleString('en-IN')}`;
                        box.querySelector('.box-rate').innerText = `Rate: ${info.rate}`;
                        
                        if (currency === data.best_currency) {
                            box.style.borderColor = '#10b981';
                            box.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.3)';
                        } else {
                            box.style.borderColor = '#334155';
                            box.style.boxShadow = 'none';
                        }
                    }
                }
                
                document.getElementById('bestCurrencyText').innerText = data.ai_advice;

            } catch (error) {
                console.error(error);
                alert("Error comparing currencies.");
            } finally {
                optimizeBtn.innerText = "Compare";
                optimizeBtn.disabled = false;
            }
        });
    }

    // 14. Global Transfer Optimizer Logic

    const comparePlatformsBtn = document.getElementById('comparePlatformsBtn');
    if (comparePlatformsBtn) {
        comparePlatformsBtn.addEventListener('click', async () => {
            const amount = document.getElementById('transferAmount').value;
            const fromCurrency = document.getElementById('fromCurrency').value; 
            const toCurrency = document.getElementById('toCurrency').value; 
            
            comparePlatformsBtn.innerText = "Analyzing...";
            comparePlatformsBtn.disabled = true;

            try {
                const formData = new FormData();
                formData.append('amount', amount);
                formData.append('from_currency', fromCurrency);
                formData.append('to_currency', toCurrency);

                const response = await fetch('/api/agent/compare', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('agentResultsArea').style.display = 'block';
                    document.getElementById('agentAiSummary').style.display = 'block';
                    document.getElementById('agentAiText').innerText = data.ai_advice;
                    
                    const container = document.getElementById('platformsContainer');
                    container.innerHTML = '';
                    
                    data.results.sort((a, b) => b.net_amount - a.net_amount);
                    
                    data.results.forEach((provider) => {
                        const isBest = provider.provider === data.best_provider;
                        const card = document.createElement('div');
                        card.className = 'card';
                        card.style.padding = '1.5rem';
                        card.style.display = 'flex';
                        card.style.alignItems = 'center';
                        card.style.justifyContent = 'space-between';
                        card.style.border = isBest ? '2px solid #10b981' : '1px solid #334155';
                        card.style.boxShadow = isBest ? '0 0 15px rgba(16, 185, 129, 0.2)' : 'none';
                        
                        const bestBadge = isBest ? `<span style="background: #10b981; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: bold; margin-left: 10px;">BEST VALUE</span>` : '';
                        const fastBadge = provider.speed.toLowerCase().includes("instant") 
                            ? `<span style="background: #38bdf8; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: bold; margin-left: 10px;">⚡ FASTEST</span>` 
                            : '';                        
                        
                        card.innerHTML = `
                            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr; align-items: center; gap: 1rem; width: 100%;">
                                <div style="display: flex; align-items: center; gap: 1rem;">
                                    <div style="width: 50px; height: 50px; border-radius: 12px; background: ${provider.color}20; display: flex; align-items: center; justify-content: center; color: ${provider.color}; font-weight: bold; font-size: 1.2rem;">
                                        ${provider.provider.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 style="margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">${provider.provider} ${bestBadge} ${fastBadge}</h3>
                                        <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 0.85rem;">Rate: 1 ${fromCurrency} = ${provider.exchange_rate} ${toCurrency}</p>
                                    </div>
                                </div>
                                
                                <div style="text-align: center;">
                                    <p style="margin: 0; color: #94a3b8; font-size: 0.8rem; text-transform: uppercase;">Fees</p>
                                    <p style="margin: 4px 0 0 0; font-weight: 600; color: #ef4444;">-${provider.fees}</p>
                                </div>

                                <div style="text-align: center;">
                                    <p style="margin: 0; color: #94a3b8; font-size: 0.8rem; text-transform: uppercase;">Speed</p>
                                    <p style="margin: 4px 0 0 0; font-weight: 600; color: #cbd5e1;">${provider.speed}</p>
                                </div>
                                
                                <div style="text-align: right;">
                                    <p style="margin: 0; color: #94a3b8; font-size: 0.8rem; text-transform: uppercase;">Recipient Gets</p>
                                    <h2 style="margin: 4px 0 0 0; color: #10b981; font-size: 1.4rem; font-weight: 700; white-space: nowrap;">
                                        ${toCurrency === 'INR' ? '₹' : (toCurrency === 'EUR' ? '€' : '£')}${provider.net_amount.toLocaleString('en-IN')}
                                    </h2>
                                </div>
                            </div>
                        `;
                        container.appendChild(card);
                    });
                } else {
                    alert("Error: " + data.error);
                }

            } catch (error) {
                console.error("Frontend Error:", error);
                alert("Error connecting to backend.");
            } finally {
                comparePlatformsBtn.innerText = "Compare Platforms";
                comparePlatformsBtn.disabled = false;
            }
        });
    }


    // 15. ML Forecasting Logic

    const forecastBtn = document.getElementById('forecastBtn');
    let myChart = null;

    if (forecastBtn) {
        forecastBtn.addEventListener('click', async () => {
            const fromCurr = document.getElementById('forecastFrom').value;
            const toCurr = document.getElementById('forecastTo').value;
            
            if (fromCurr === toCurr) {
                alert("From and To currencies cannot be the same!");
                return;
            }

            forecastBtn.innerText = "Analyzing Trends...";
            forecastBtn.disabled = true;
            
            try {
                const response = await fetch(`/api/forecast?from_currency=${fromCurr}&to_currency=${toCurr}`);
                const data = await response.json();
                
                if (!data.error) {
                    document.getElementById('forecastResults').style.display = 'block';
                    document.getElementById('forecastAiText').innerText = data.ai_forecast;
                    document.getElementById('fcCurrent').innerText = `${data.current_rate} ${toCurr}`;
                    document.getElementById('fcDay1').innerText = `${data.predictions[0].predicted_rate} ${toCurr}`;
                    document.getElementById('fcDay2').innerText = `${data.predictions[1].predicted_rate} ${toCurr}`;
                    
                    const day1Color = data.trend === "UP" ? "#10b981" : "#ef4444";
                    document.getElementById('fcDay1').style.color = day1Color;
                    document.getElementById('fcDay2').style.color = day1Color;

                    renderForecastChart(data.current_rate, data.predictions, fromCurr, toCurr);
                } else {
                    alert("Error: " + data.error);
                }
            } catch (error) {
                console.error(error);
                alert("Error fetching forecast.");
            } finally {
                forecastBtn.innerText = "Run Forecast";
                forecastBtn.disabled = false;
            }
        });
    }

    function renderForecastChart(currentRate, predictions, fromCurr, toCurr) {
        const canvas = document.getElementById('forecastChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (myChart) myChart.destroy();

        const labels = ["Current", "Day +1", "Day +2", "Day +3"];
        const dataPoints = [currentRate, predictions[0].predicted_rate, predictions[1].predicted_rate, predictions[2].predicted_rate];

        myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Predicted ${fromCurr}/${toCurr} Rate`,
                    data: dataPoints,
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    borderWidth: 3,
                    pointBackgroundColor: '#10b981',
                    pointRadius: 6,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function(context) { return `${context.parsed.y} ${toCurr}`; } } }
                },
                scales: {
                    y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });
    }

   
    // 16. Smart FX Alerts Logic
   
    const setAlertBtn = document.getElementById('setAlertBtn');
    if (setAlertBtn) {
        setAlertBtn.addEventListener('click', async () => {
            const target = document.getElementById('alertTarget').value;
            if (!target) return;

            const formData = new FormData();
            formData.append('target_rate', target);
            formData.append('currency', 'INR');

            const response = await fetch('/api/alerts/set', { method: 'POST', body: formData });
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('activeAlerts').innerText = `✅ Alert set! We will notify you if USD hits ₹${target}.`;
                document.getElementById('alertTarget').value = '';
            }
        });
    }

    setInterval(async () => {
        try {
            const response = await fetch('/api/alerts/check');
            const data = await response.json();
            if (data.triggered.length > 0) {
                data.triggered.forEach(msg => alert(msg)); 
            }
        } catch (e) {
            console.log("Alert check failed");
        }
    }, 30000); 

    
    // 17. Dynamic Invoice Currency Symbol
 
    const invoiceCurrencySelect = document.getElementById('invoiceCurrency');
    const invoiceSymbol = document.getElementById('invoiceSymbol');

    if (invoiceCurrencySelect) {
        invoiceCurrencySelect.addEventListener('change', function() {
            const curr = this.value;
            if (curr === 'USD') invoiceSymbol.innerText = '$';
            else if (curr === 'EUR') invoiceSymbol.innerText = '€';
            else if (curr === 'GBP') invoiceSymbol.innerText = '£';
            else if (curr === 'AUD') invoiceSymbol.innerText = 'A$';
        });
    }

   
    // 21. Auth Logic (Real Login)
  
    const authOverlay = document.getElementById('authOverlay');
    let authToken = localStorage.getItem('rateMateToken');

    if (authToken && authOverlay) {
        authOverlay.style.display = 'none';
    }

    window.toggleAuthForm = function(form) {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        
        if (form === 'login') {
            loginForm.style.display = 'block';
            signupForm.style.display = 'none';
        } else {
            loginForm.style.display = 'none';
            signupForm.style.display = 'block';
        }
    };

    const signupBtn = document.getElementById('signupBtn');
    if (signupBtn) {
        signupBtn.addEventListener('click', async () => {
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            
            signupBtn.innerText = "Creating...";
            signupBtn.disabled = true;

            try {
                const res = await fetch('/api/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                
                if (data.success) {
                    alert("Account created! Please login.");
                    toggleAuthForm('login');
                } else {
                    alert("Error: " + data.error);
                }
            } catch (e) {
                alert("Network error.");
            } finally {
                signupBtn.innerText = "Sign Up";
                signupBtn.disabled = false;
            }
        });
    }

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            
            loginBtn.innerText = "Authenticating...";
            loginBtn.disabled = true;

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                
                if (data.success) {
                    authToken = data.access_token;
                    localStorage.setItem('rateMateToken', authToken);
                    
                    authOverlay.style.opacity = '0';
                    authOverlay.style.transition = 'opacity 0.3s';
                    
                    setTimeout(() => {
                        authOverlay.style.display = 'none';
                        if(typeof fetchAnalyticsAndSavings === 'function') fetchAnalyticsAndSavings();
                        if(typeof fetchAllInvoices === 'function') fetchAllInvoices();
                    }, 300);
                } else {
                    alert("Login failed: " + data.error);
                }
            } catch (e) {
                alert("Network error. Check if server is running.");
            } finally {
                loginBtn.innerText = "Sign In";
                loginBtn.disabled = false;
            }
        });
    }

}); 