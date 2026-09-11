const currencySymbols:Record<string,string>={USD:'$',GBP:'£',EUR:'€',PKR:'₨',AED:'د.إ',SAR:'﷼',INR:'₹'};
export function formatMoney(amount:number,currency:string){const code=String(currency||'USD').toUpperCase();const symbol=currencySymbols[code];if(symbol)return `${symbol}${Number(amount||0).toFixed(2)}`;return `${code} ${Number(amount||0).toFixed(2)}`}
